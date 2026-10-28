// ============================================================
// Μητρώο μετρήσεων μαρκών (για τον μηχανισμό EGPS) — για ΟΠΟΙΑΔΗΠΟΤΕ μάρκα/κατηγορία.
//
// Οι μετρήσεις μαρκών ΔΕΝ υπάρχουν στα ανοιχτά δεδομένα του Lab: εισάγονται από τον χρήστη (πραγματικές έρευνες/panels
// με δηλωμένη πηγή και άδεια) και αποθηκεύονται ιδιωτικά στο <dataRoot>/brands/measurements.json (εκτός repo).
//
// Κανόνες χρήσης (ορίστηκαν πριν υπάρξουν δεδομένα μαρκών — βλ. docs/synthetic-lab/EGPS_INTEGRATION.md):
//  1. Μάρκα με δική της μέτρηση → EMPIRICALLY_ANCHORED.
//  2. Μάρκα χωρίς μέτρηση → MODEL_EXTRAPOLATED μόνο αν η κατηγορία×μέτρηση πέρασε την αυτόματη επικύρωση
//     leave-one-brand-out: ≥ MIN_BRANDS μετρημένες μάρκες, σφάλμα LOO < σφάλμα ομοιόμορφης προεπιλογής, διάμεσο εύρος
//     διαστήματος 80% ≤ 40 π.μ. (και κάλυψη 60–95% όταν ≥ 10 μάρκες). Αλλιώς NOT_ESTIMABLE.
//  3. Δεδομένα άλλων μαρκών ΔΕΝ γίνονται ποτέ «μέτρηση» της μάρκας-στόχου· δίνουν μόνο πρόβλεψη με διάστημα.
//  4. Λογικά άνω όρια από την κατηγορία (π.χ. συνδρομητές μάρκας ≤ συνδρομητές streaming) εμφανίζονται και περιορίζουν
//     τα διαστήματα· δεν είναι εκτιμήσεις της μάρκας.
// ============================================================

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import categoriesConfig from '@/config/synthetic-lab/brands/categories.json';
import { parseCsvObjects } from '../csv';
import { dataRoot } from '../storage/paths';
import { latestWaveFor } from './noraya';

export const BRAND_MIN_BRANDS = 6;
export const BRAND_MAX_WIDTH80 = 40;
const GROUP_DIMS = ['age_band', 'gender', 'education_group'] as const;

export interface BrandMeasurement {
  category: string;
  brand: string;
  brandId: string;
  measure: string;
  year: number;
  /** Ποσοστό (0–100) στο σύνολο ενηλίκων. */
  value: number;
  /** Προαιρετικές διασπάσεις: age_band (15-24…65+), gender (female/male), education_group (low/medium/high_education). */
  groups?: Partial<Record<(typeof GROUP_DIMS)[number], Record<string, number>>>;
  n?: number | null;
  source: string;
  license: string;
  importedAt: string;
}

export interface BrandCategory {
  id: string;
  label: string;
  upperBounds: Record<string, string>;
}

export interface BrandValidation {
  category: string;
  measure: string;
  nBrands: number;
  status: 'validated' | 'insufficient_brands' | 'not_better_than_uniform' | 'too_uncertain' | 'poor_coverage';
  looMaePp: number | null;
  uniformMaePp: number | null;
  medianWidth80Pp: number | null;
  coverage80: number | null;
  /** Ημι-εύρη διαστημάτων στην κλίμακα logit (σύμμορφα ποσοστημόρια των απόλυτων υπολοίπων LOO). */
  halfWidthLogit: { '80': number; '95': number } | null;
  message: string;
}

const CFG = categoriesConfig as { genericMeasures: Record<string, string>; categories: BrandCategory[] };
const logit = (p: number) => {
  const q = Math.min(0.995, Math.max(0.005, p / 100));
  return Math.log(q / (1 - q));
};
const inv = (x: number) => 100 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function brandSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9α-ω]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function brandCategories(): BrandCategory[] {
  return CFG.categories;
}
export function brandMeasures(): Record<string, string> {
  return CFG.genericMeasures;
}
export function categoryOf(id: string): BrandCategory {
  return CFG.categories.find((c) => c.id === id) || { id, label: id, upperBounds: {} };
}

function file() {
  return path.join(dataRoot(), 'brands', 'measurements.json');
}

export function listBrandMeasurements(): BrandMeasurement[] {
  const f = file();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as BrandMeasurement[];
  } catch {
    return [];
  }
}

function save(rows: BrandMeasurement[]) {
  const f = file();
  mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows, null, 1));
  renameSync(tmp, f);
}

/**
 * Εισαγωγή από CSV (μακριά μορφή): category, brand, measure, year, group_dim, group, value, n, source, license.
 * group_dim = all για το σύνολο. Πηγή και άδεια είναι υποχρεωτικές. Νεότερη εισαγωγή αντικαθιστά ίδιο (μάρκα, μέτρηση, έτος).
 */
export function importBrandCsv(text: string): { imported: number; errors: string[] } {
  const rows = parseCsvObjects(text);
  const errors: string[] = [];
  const acc = new Map<string, BrandMeasurement>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const category = (r.category || '').trim().toLowerCase();
    const brand = (r.brand || '').trim();
    const measure = (r.measure || '').trim().toLowerCase();
    const year = Number(r.year);
    const dim = (r.group_dim || 'all').trim();
    const group = (r.group || 'all').trim();
    const value = Number(String(r.value).replace(',', '.'));
    if (!/^[a-z0-9_-]{1,40}$/.test(category)) return void errors.push(`Γραμμή ${line}: μη έγκυρη κατηγορία.`);
    if (!brand) return void errors.push(`Γραμμή ${line}: λείπει η μάρκα.`);
    if (!/^[a-z0-9_]{1,40}$/.test(measure)) return void errors.push(`Γραμμή ${line}: μη έγκυρη μέτρηση.`);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return void errors.push(`Γραμμή ${line}: μη έγκυρο έτος.`);
    if (!Number.isFinite(value) || value < 0 || value > 100) return void errors.push(`Γραμμή ${line}: η τιμή πρέπει να είναι ποσοστό 0–100.`);
    if (!(r.source || '').trim() || !(r.license || '').trim()) return void errors.push(`Γραμμή ${line}: πηγή και άδεια χρήσης είναι υποχρεωτικές.`);
    if (dim !== 'all' && !(GROUP_DIMS as readonly string[]).includes(dim)) return void errors.push(`Γραμμή ${line}: άγνωστη διάσταση ${dim}.`);
    const key = `${category}|${brandSlug(brand)}|${measure}|${year}`;
    const m =
      acc.get(key) ||
      ({ category, brand, brandId: brandSlug(brand), measure, year, value: NaN, groups: {}, n: r.n ? Number(r.n) : null, source: r.source.trim(), license: r.license.trim(), importedAt: new Date().toISOString() } as BrandMeasurement);
    if (dim === 'all') m.value = value;
    else ((m.groups as any)[dim] ||= {})[group] = value;
    acc.set(key, m);
  });
  const fresh = Array.from(acc.values()).filter((m) => {
    if (Number.isNaN(m.value)) errors.push(`${m.brand}/${m.measure}/${m.year}: λείπει η συνολική τιμή (group_dim = all).`);
    return !Number.isNaN(m.value);
  });
  if (fresh.length) {
    const keep = listBrandMeasurements().filter((x) => !fresh.some((f) => f.category === x.category && f.brandId === x.brandId && f.measure === x.measure && f.year === x.year));
    save([...keep, ...fresh]);
  }
  return { imported: fresh.length, errors };
}

export function deleteBrandMeasurements(category: string, brandId?: string) {
  save(listBrandMeasurements().filter((m) => !(m.category === category && (!brandId || m.brandId === brandId))));
}

/** Τελευταία μέτρηση ανά μάρκα για (κατηγορία, μέτρηση), έως το έτος αναφοράς. */
export function latestBrandMeasurements(category: string, measure: string, asOfYear?: number): BrandMeasurement[] {
  const by = new Map<string, BrandMeasurement>();
  for (const m of listBrandMeasurements()) {
    if (m.category !== category || m.measure !== measure || (asOfYear && m.year > asOfYear)) continue;
    const cur = by.get(m.brandId);
    if (!cur || m.year > cur.year) by.set(m.brandId, m);
  }
  return Array.from(by.values());
}

function quantile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  // σύμμορφο (conformal) ποσοστημόριο με διόρθωση πεπερασμένου δείγματος
  const k = Math.min(s.length - 1, Math.ceil((s.length + 1) * p) - 1);
  return s[Math.max(0, k)];
}

/** Αυτόματη επικύρωση leave-one-brand-out για (κατηγορία, μέτρηση). */
export function validateBrandCategory(category: string, measure: string, asOfYear?: number): BrandValidation {
  const ms = latestBrandMeasurements(category, measure, asOfYear);
  const base = { category, measure, nBrands: ms.length };
  if (ms.length < BRAND_MIN_BRANDS) {
    return { ...base, status: 'insufficient_brands', looMaePp: null, uniformMaePp: null, medianWidth80Pp: null, coverage80: null, halfWidthLogit: null, message: `Μετρημένες μάρκες ${ms.length} < ${BRAND_MIN_BRANDS}: δεν επιτρέπεται πρόβλεψη για μάρκες χωρίς μέτρηση.` };
  }
  const L = ms.map((m) => logit(m.value));
  const pred = L.map((_, i) => L.filter((__, j) => j !== i).reduce((s, x) => s + x, 0) / (L.length - 1));
  const res = L.map((x, i) => Math.abs(x - pred[i]));
  const looMae = ms.reduce((s, m, i) => s + Math.abs(inv(pred[i]) - m.value), 0) / ms.length;
  const uniMae = ms.reduce((s, m) => s + Math.abs(50 - m.value), 0) / ms.length;
  const h80 = quantile(res, 0.8);
  const h95 = quantile(res, 0.95);
  const widths = pred.map((p) => inv(p + h80) - inv(p - h80)).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)];
  let cov: number | null = null;
  if (ms.length >= 10) {
    // ένθετη κάλυψη: το διάστημα κάθε μάρκας υπολογίζεται χωρίς αυτήν
    cov = (100 * res.filter((r, i) => r <= quantile(res.filter((_, j) => j !== i), 0.8)).length) / res.length;
  }
  const out = { ...base, looMaePp: r1(looMae), uniformMaePp: r1(uniMae), medianWidth80Pp: r1(medW), coverage80: cov === null ? null : r1(cov), halfWidthLogit: { '80': h80, '95': h95 } };
  if (looMae >= uniMae) return { ...out, status: 'not_better_than_uniform', message: 'Η πρόβλεψη από τις άλλες μάρκες δεν είναι καλύτερη από την ομοιόμορφη προεπιλογή.' };
  if (medW > BRAND_MAX_WIDTH80) return { ...out, status: 'too_uncertain', message: `Οι μάρκες διαφέρουν πολύ (διάμεσο εύρος 80%: ${r1(medW)} π.μ. > ${BRAND_MAX_WIDTH80}).` };
  if (cov !== null && (cov < 60 || cov > 95)) return { ...out, status: 'poor_coverage', message: `Κάλυψη διαστήματος 80% ${r1(cov)}% εκτός 60–95%.` };
  return { ...out, status: 'validated', message: `Επικυρώθηκε σε ${ms.length} μάρκες (σφάλμα LOO ${r1(looMae)} π.μ. έναντι ${r1(uniMae)} της ομοιόμορφης).` };
}

/** Λογικό άνω όριο της μέτρησης από την κατηγορία (αν έχει οριστεί και υπάρχει μέτρηση). */
export function categoryUpperBound(category: string, measure: string, asOfYear?: number): { value: number; source: string } | null {
  const metric = categoryOf(category).upperBounds[measure];
  if (!metric) return null;
  const w = latestWaveFor(metric, { asOfYear }).wave;
  const v = w?.groups.all?.all?.value;
  return v == null ? null : { value: r1(v), source: `${metric} (${w!.key})` };
}

/** Ομάδες της μάρκας ως (dim → group → %), για χρήση ως κύμα στο prior model. */
export function measurementGroups(m: BrandMeasurement): Record<string, Record<string, number>> {
  const g: Record<string, Record<string, number>> = { all: { all: m.value } };
  for (const d of GROUP_DIMS) if (m.groups?.[d] && Object.keys(m.groups[d]!).length) g[d] = { ...m.groups[d]! };
  return g;
}

export function brandRegistrySummary(asOfYear?: number) {
  const ms = listBrandMeasurements();
  const keys = Array.from(new Set(ms.map((m) => `${m.category}|${m.measure}`)));
  return {
    categories: brandCategories(),
    measures: brandMeasures(),
    brands: Array.from(new Map(ms.map((m) => [`${m.category}|${m.brandId}`, { category: m.category, brand: m.brand, brandId: m.brandId }])).values()),
    measurements: ms.length,
    validations: keys.map((k) => {
      const [c, me] = k.split('|');
      return validateBrandCategory(c, me, asOfYear);
    })
  };
}
