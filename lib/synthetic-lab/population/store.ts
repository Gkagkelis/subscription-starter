// ============================================================
// Διαχείριση πληθυσμών: ενσωματωμένο δείγμα GLOPOP-S, ιδιωτικά imports,
// fixture development, βαθμονόμηση και επιλογή κοινού.
// ============================================================

import { existsSync, readdirSync, readFileSync } from 'fs';
import bundledSample from '../data/populations/glopop-grc-2015-sample.json';
import officialPop2025 from '../data/official/eurostat-population-2025.json';
import officialEdu2025 from '../data/official/eurostat-education-2025.json';
import { deriveSeed } from '../rng';
import { dataPath, dataRoot } from '../storage/paths';
import type { AudienceFilter, Persona, Population, PopulationSummary } from '../types';
import { rake, updateStatusFromTargets, type CalibrationTargets, type MarginTarget, type RakingResult } from './calibration';
import { expandCompactPopulation, type CompactPopulation } from './compact';
import { buildDevFixture, DEV_FIXTURE_ID } from './fixture';
import { AGE_BAND_BOUNDS } from './glopop-schema';
import { largestRemainder, sampleIndices } from './sampling';
import path from 'path';

/** Ακατέργαστο baseline GLOPOP-S 2015 (ενσωματωμένο δείγμα). */
export const BASELINE_POPULATION_ID = 'glopop-grc-2015-bundled';
/** Το ίδιο δείγμα, βαθμονομημένο σε επίσημο πληθυσμό Eurostat/ΕΛΣΤΑΤ 2025 (προεπιλογή). */
export const CALIBRATED_POPULATION_ID = 'glopop-grc-2025-calibrated';
export const DEFAULT_POPULATION_ID = CALIBRATED_POPULATION_ID;

const cache = new Map<string, Population>();

function bundled(): CompactPopulation | null {
  const b = bundledSample as unknown as CompactPopulation;
  return b && b.format === 'synthetic-lab-compact-v1' && b.rows?.length ? b : null;
}

function privateDir() {
  return path.join(dataRoot(), 'populations');
}

function readPrivate(): CompactPopulation[] {
  const dir = privateDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as CompactPopulation;
      } catch {
        return null;
      }
    })
    .filter((x): x is CompactPopulation => !!x && x.format === 'synthetic-lab-compact-v1');
}

interface OfficialPopulation {
  datasetId: string;
  source: string;
  license: string;
  year: number;
  total: number;
  cells: Record<string, number>; // "GRCr101|25-34|male"
}

/**
 * Ενσωματωμένοι επίσημοι στόχοι (Eurostat demo_r_pjangroup, CC BY 4.0):
 * κοινές κατανομές περιφέρεια × ηλικία και ηλικία × φύλο.
 */
export function builtInCalibrationTargets(): (CalibrationTargets & { total: number })[] {
  const o = officialPop2025 as unknown as OfficialPopulation;
  if (!o?.cells) return [];
  const regionAge: Record<string, number> = {};
  const ageGender: Record<string, number> = {};
  Object.entries(o.cells).forEach(([k, v]) => {
    const [region, age, sex] = k.split('|');
    regionAge[`${region}|${age}`] = (regionAge[`${region}|${age}`] || 0) + v;
    ageGender[`${age}|${sex}`] = (ageGender[`${age}|${sex}`] || 0) + v;
  });
  return [
    {
      datasetId: o.datasetId,
      year: o.year,
      source: o.source,
      license: o.license,
      total: o.total,
      margins: [
        { attribute: 'regionCode|ageBand', totals: regionAge },
        { attribute: 'ageBand|gender', totals: ageGender }
      ]
    }
  ];
}

interface OfficialEducation {
  datasetId: string;
  year: number;
  source: string;
  license: string;
  cells: Record<string, number>; // "25-34|male|ED5-8" (άτομα)
  population65: Record<string, number>; // "65-74|male", "75+|male"
}

const ISCED_OF: Record<string, 'ED0-2' | 'ED3_4' | 'ED5-8' | null> = {
  less_than_primary: 'ED0-2',
  primary: 'ED0-2',
  lower_secondary: 'ED0-2',
  upper_secondary: 'ED3_4',
  tertiary: 'ED5-8',
  unknown: null
};

/**
 * Στόχοι ηλικία × φύλο × μόρφωση (Eurostat ΕΕΔ, CC BY 4.0) για έναν πληθυσμό:
 *  - 15-64: μερίδια ISCED 0-2 / 3-4 / 5-8 της Eurostat ανά ζώνη και φύλο·
 *  - 65+: μίγμα 65-74 (Eurostat) και 75+ (κατανομή της ίδιας γενιάς στο GLOPOP 2015, που ήταν τότε 65+),
 *    με βάρη τον επίσημο πληθυσμό 65-74 / 75+·
 *  - μέσα στο ISCED 0-2 η αναλογία «χωρίς δημοτικό / δημοτικό / γυμνάσιο» μένει του 2015·
 *  - κάτω των 15 και «άγνωστη μόρφωση»: αμετάβλητα.
 * Οι απόλυτοι αριθμοί ανά ζώνη × φύλο είναι οι επίσημοι 2025 (ίδιοι με τον στόχο ηλικία × φύλο).
 */
export function educationTargets(personas: Persona[], ageGenderTotals: Record<string, number>): MarginTarget | null {
  const e = officialEdu2025 as unknown as OfficialEducation;
  if (!e?.cells) return null;
  const cur: Record<string, Record<string, number>> = {};
  for (const p of personas) {
    const k = `${p.ageBand}|${p.gender}`;
    (cur[k] ||= {})[p.education] = (cur[k][p.education] || 0) + p.weight;
  }
  const totals: Record<string, number> = {};
  for (const [k, levels] of Object.entries(cur)) {
    const [band, sex] = k.split('|');
    const N = ageGenderTotals[k];
    if (!N) continue;
    const W = Object.values(levels).reduce((a, b) => a + b, 0);
    const unknownShare = (levels.unknown || 0) / W;
    const groupW: Record<string, number> = {};
    for (const [lvl, w] of Object.entries(levels)) {
      const g = ISCED_OF[lvl];
      if (g) groupW[g] = (groupW[g] || 0) + w;
    }
    const known = W - (levels.unknown || 0);
    let target: Record<string, number> | null = null; // μερίδια ISCED (στο γνωστό τμήμα)
    const off = (b: string) => {
      const v = ['ED0-2', 'ED3_4', 'ED5-8'].map((g) => e.cells[`${b}|${sex}|${g}`] || 0);
      const s = v.reduce((a, c) => a + c, 0);
      return s > 0 ? { 'ED0-2': v[0] / s, ED3_4: v[1] / s, 'ED5-8': v[2] / s } : null;
    };
    if (['15-24', '25-34', '35-44', '45-54', '55-64'].includes(band)) target = off(band);
    else if (band === '65+') {
      const o74 = off('65-74');
      const p74 = e.population65[`65-74|${sex}`] || 0;
      const p75 = e.population65[`75+|${sex}`] || 0;
      if (o74 && p74 + p75 > 0 && known > 0) {
        const r = p74 / (p74 + p75);
        const cohort = (g: string) => (groupW[g] || 0) / known; // γενιά 75+ (2025) ≈ 65+ του 2015
        target = Object.fromEntries((['ED0-2', 'ED3_4', 'ED5-8'] as const).map((g) => [g, r * o74[g] + (1 - r) * cohort(g)]));
      }
    }
    for (const [lvl, w] of Object.entries(levels)) {
      const g = ISCED_OF[lvl];
      let share: number;
      if (!target || !g) share = w / W; // αμετάβλητο
      else {
        // μόνο ομάδες που υπάρχουν στο δείγμα· επανακανονικοποίηση
        const avail = Object.keys(groupW).reduce((s, gg) => s + (target![gg] || 0), 0) || 1;
        share = (1 - unknownShare) * ((target[g] || 0) / avail) * (w / groupW[g]);
      }
      totals[`${band}|${sex}|${lvl}`] = N * share;
    }
  }
  return Object.keys(totals).length ? { attribute: 'ageBand|gender|education', totals } : null;
}

/** Στόχοι βαθμονόμησης που έχει εισάγει ο χρήστης (ιδιωτικά). */
export function loadCalibrationTargets(): CalibrationTargets[] {
  const dir = path.join(dataRoot(), 'calibration-targets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as CalibrationTargets);
}

export function listPopulationSummaries(): PopulationSummary[] {
  const out: PopulationSummary[] = [];
  const b = bundled();
  if (b) {
    if (builtInCalibrationTargets().length) out.push(loadPopulation(CALIBRATED_POPULATION_ID)!.summary);
    out.push(loadPopulation(b.summary.id)!.summary);
  }
  readPrivate().forEach((p) => out.push(loadPopulation(p.summary.id)!.summary));
  // Το fixture εμφανίζεται ΜΟΝΟ αν δεν υπάρχει πραγματικό δείγμα.
  if (!out.length) out.push(expandCompactPopulation(buildDevFixture()).summary);
  return out;
}

export function defaultPopulationId(): string {
  if (bundled()) return builtInCalibrationTargets().length ? CALIBRATED_POPULATION_ID : BASELINE_POPULATION_ID;
  return listPopulationSummaries()[0].id;
}

function calibrate(pop: Population, extra: (CalibrationTargets & { total?: number })[] = []): { pop: Population; raking: RakingResult | null } {
  const currentYear = new Date().getFullYear();
  const targets: (CalibrationTargets & { total?: number })[] = [...extra, ...loadCalibrationTargets()];
  if (!targets.length || pop.summary.isDevFixture) return { pop, raking: null };
  const recent = targets.filter((t) => t.year >= currentYear - 1);
  const margins = recent.flatMap((t) => t.margins);
  if (!margins.length) return { pop, raking: null };
  const res = rake(pop.personas, pop.personas.map((p) => p.weight), margins, { bounds: [0.1, 10], maxIter: 200 });
  const status = updateStatusFromTargets(pop.summary.referenceYear, targets, res, currentYear);
  if (!status.calibrated) return { pop: { ...pop, summary: { ...pop.summary, qualityNotes: [...pop.summary.qualityNotes, ...res.issues] } }, raking: res };
  // Αν οι στόχοι είναι απόλυτοι πληθυσμοί, τα βάρη κλιμακώνονται στο επίσημο σύνολο.
  const absolute = recent.find((t) => typeof t.total === 'number')?.total;
  const sumW = res.weights.reduce((a, b) => a + b, 0);
  const scale = absolute ? absolute / sumW : 1;
  const personas = pop.personas.map((p, i) => ({ ...p, weight: res.weights[i] * scale }));
  const notes = [...pop.summary.qualityNotes, ...res.issues];
  notes.push(
    `Raking: ${res.iterations} επαναλήψεις, μέγιστη απόκλιση ${res.maxDeviationPp.toFixed(3)} π.μ., λόγος βαρών ${res.weightRatio.toFixed(1)}.`
  );
  return {
    pop: {
      personas,
      summary: { ...pop.summary, representedPopulation: Math.round(sumW * scale), updateStatus: status, qualityNotes: notes }
    },
    raking: res
  };
}

export function loadPopulation(id: string): Population | null {
  if (cache.has(id)) return cache.get(id)!;
  let cp: CompactPopulation | null = null;
  const b = bundled();
  if (b && id === CALIBRATED_POPULATION_ID) {
    const official = builtInCalibrationTargets();
    if (!official.length) return null;
    const base = expandCompactPopulation(b);
    const ag = official[0].margins.find((m) => m.attribute === 'ageBand|gender')!.totals;
    const eduMargin = educationTargets(base.personas, ag);
    const e = officialEdu2025 as unknown as OfficialEducation;
    const targets = eduMargin
      ? [...official, { datasetId: e.datasetId, year: e.year, source: e.source, license: e.license, margins: [eduMargin] }]
      : official;
    const { pop } = calibrate(base, targets);
    const y = official[0].year;
    const notes = pop.summary.qualityNotes
      .filter((n) => !n.startsWith('Οι πληθυσμοί Βορείου Αιγαίου'))
      .concat(
        `Ο πληθυσμός ανά περιφέρεια, ηλικία και φύλο ακολουθεί τα επίσημα στοιχεία 1/1/${y} (Eurostat demo_r_pjangroup, δεδομένα ΕΛΣΤΑΤ). Έτσι διορθώνεται και η αντιστροφή Βορείου/Νοτίου Αιγαίου του GLOPOP-S.`,
        ...(eduMargin
          ? [
              `Η μόρφωση ανά ηλικία και φύλο ακολουθεί την Έρευνα Εργατικού Δυναμικού ${e.year} (Eurostat edat_lfs_9901, ISCED 0-2/3-4/5-8). Για τους 75+ (εκτός ΕΕΔ) χρησιμοποιείται η κατανομή της ίδιας γενιάς στο GLOPOP 2015· μέσα στο ISCED 0-2 η αναλογία δημοτικό/γυμνάσιο μένει του 2015.`
            ]
          : [])
      );
    const calibrated: Population = {
      personas: pop.personas,
      summary: {
        ...pop.summary,
        id: CALIBRATED_POPULATION_ID,
        name: `Ελλάδα ${y} — GLOPOP-S βαθμονομημένο σε Eurostat/ΕΛΣΤΑΤ (δείγμα ${pop.personas.length.toLocaleString('el-GR')})`,
        qualityNotes: notes
      }
    };
    cache.set(id, calibrated);
    return calibrated;
  }
  if (b && b.summary.id === id) cp = b;
  else if (id === DEV_FIXTURE_ID) cp = buildDevFixture();
  else cp = readPrivate().find((p) => p.summary.id === id) || null;
  if (!cp) return null;
  const { pop } = calibrate(expandCompactPopulation(cp));
  cache.set(id, pop);
  return pop;
}

export function clearPopulationCache() {
  cache.clear();
}

/** Λεπτομέρειες ακεραιότητας/περιθωρίων από το import (αν υπάρχουν). */
export function populationIntegrity(id: string): Record<string, unknown> | null {
  const b = bundled();
  if (b && (b.summary.id === id || id === CALIBRATED_POPULATION_ID)) return (b.integrity as Record<string, unknown>) || null;
  const p = readPrivate().find((x) => x.summary.id === id);
  return (p?.integrity as Record<string, unknown>) || null;
}

export function populationAttribution(id: string): string {
  const b = bundled();
  if (b && b.summary.id === id) return b.attribution;
  if (b && id === CALIBRATED_POPULATION_ID) {
    const o = officialPop2025 as unknown as OfficialPopulation;
    return `${b.attribution} Βαθμονόμηση: ${o.source} — ${o.license}.`;
  }
  if (id === DEV_FIXTURE_ID) return buildDevFixture().attribution;
  return readPrivate().find((x) => x.summary.id === id)?.attribution || '';
}

// ------------------------------------------------------------
// Κοινό (audience)
// ------------------------------------------------------------

export function matchesAudience(p: Persona, f: AudienceFilter): boolean {
  const [lo, hi] = AGE_BAND_BOUNDS[p.ageBand];
  // Μια ζώνη ταιριάζει αν επικαλύπτεται με το εύρος — το σημειώνουμε ως προειδοποίηση.
  if (f.minAge !== undefined && hi < f.minAge) return false;
  if (f.maxAge !== undefined && lo > f.maxAge) return false;
  if (f.genders?.length && !f.genders.includes(p.gender)) return false;
  if (f.regions?.length && !f.regions.includes(p.regionCode)) return false;
  if (f.settlements?.length && !f.settlements.includes(p.settlement)) return false;
  if (f.educations?.length && !f.educations.includes(p.education)) return false;
  if (f.incomeQuintiles?.length && (p.incomeQuintile === null || !f.incomeQuintiles.includes(p.incomeQuintile))) return false;
  return true;
}

export function audienceWarnings(f: AudienceFilter): string[] {
  const w: string[] = [];
  const edges = [0, 5, 15, 25, 35, 45, 55, 65];
  if (f.minAge !== undefined && !edges.includes(f.minAge)) {
    w.push(
      `Η ηλικία στα δεδομένα είναι σε ζώνες· το κατώτατο όριο ${f.minAge} εφαρμόζεται στη ζώνη που το περιέχει (π.χ. 15-24 για 18).`
    );
  }
  if (f.maxAge !== undefined && !edges.map((e) => e - 1).includes(f.maxAge) && f.maxAge < 120) {
    w.push(`Το ανώτατο όριο ηλικίας ${f.maxAge} εφαρμόζεται σε ολόκληρη τη ζώνη που το περιέχει.`);
  }
  return w;
}

export interface AudienceSelection {
  respondents: Persona[];
  /** Πλήθος προσώπων του πληθυσμού που ταιριάζουν στο κοινό. */
  poolSize: number;
  /** Εκτιμώμενος πληθυσμός κοινού (άθροισμα βαρών). */
  representedPopulation: number;
  warnings: string[];
}

/**
 * Επιλογή συνθετικών ερωτώμενων: στρωματοποίηση ανά περιφέρεια (αναλογικά
 * με τον σταθμισμένο πληθυσμό του κοινού) και απλή τυχαία επιλογή χωρίς
 * επανάθεση. Κάθε ερωτώμενος παίρνει βάρος = πληθυσμός στρώματος / n στρώματος.
 */
export function selectRespondents(pop: Population, filter: AudienceFilter, n: number, seed: number): AudienceSelection {
  const pool = pop.personas.filter((p) => matchesAudience(p, filter));
  const warnings = audienceWarnings(filter);
  const represented = pool.reduce((s, p) => s + p.weight, 0);
  if (!pool.length) return { respondents: [], poolSize: 0, representedPopulation: 0, warnings: [...warnings, 'Κανένα συνθετικό προφίλ δεν ταιριάζει στο κοινό.'] };
  if (n > pool.length) {
    warnings.push(`Ζητήθηκαν ${n} ερωτώμενοι αλλά το κοινό έχει ${pool.length} συνθετικά προφίλ· χρησιμοποιούνται όλα.`);
    n = pool.length;
  }
  if (pool.length < 100) warnings.push(`Μικρό κοινό (${pool.length} προφίλ στο δείγμα πληθυσμού) — υψηλή αβεβαιότητα.`);

  const byRegion = new Map<string, Persona[]>();
  pool.forEach((p) => {
    const arr = byRegion.get(p.regionCode) || [];
    arr.push(p);
    byRegion.set(p.regionCode, arr);
  });
  const sizes: Record<string, number> = {};
  byRegion.forEach((arr, k) => (sizes[k] = arr.reduce((s, p) => s + p.weight, 0)));
  const alloc = largestRemainder(sizes, n);
  // Διόρθωση αν κάποιο στρώμα έχει λιγότερα προφίλ από την κατανομή.
  let deficit = 0;
  Object.keys(alloc).forEach((k) => {
    const cap = byRegion.get(k)!.length;
    if (alloc[k] > cap) {
      deficit += alloc[k] - cap;
      alloc[k] = cap;
    }
  });
  for (const k of Object.keys(alloc).sort((a, b) => sizes[b] - sizes[a])) {
    if (!deficit) break;
    const room = byRegion.get(k)!.length - alloc[k];
    const add = Math.min(room, deficit);
    alloc[k] += add;
    deficit -= add;
  }

  const respondents: Persona[] = [];
  Array.from(byRegion.keys())
    .sort()
    .forEach((k) => {
      const arr = byRegion.get(k)!;
      const m = alloc[k];
      if (!m) return;
      const idx = sampleIndices(arr.length, m, deriveSeed(seed, 'audience', k));
      const w = sizes[k] / m;
      idx.forEach((i) => respondents.push({ ...arr[i], weight: w }));
    });
  return { respondents, poolSize: pool.length, representedPopulation: represented, warnings };
}

/** Περιθωριακές κατανομές (σταθμισμένες, %) για έλεγχο αντιπροσωπευτικότητας. */
export function marginals(personas: Persona[], weighted = true): Record<string, Record<string, number>> {
  const keys: (keyof Persona)[] = ['ageBand', 'gender', 'regionCode', 'education', 'settlement', 'incomeQuintile', 'householdType'];
  const out: Record<string, Record<string, number>> = {};
  keys.forEach((k) => {
    const d: Record<string, number> = {};
    let tot = 0;
    personas.forEach((p) => {
      const v = String(p[k] ?? 'unknown');
      const w = weighted ? p.weight : 1;
      d[v] = (d[v] || 0) + w;
      tot += w;
    });
    Object.keys(d).forEach((v) => (d[v] = tot ? (d[v] / tot) * 100 : 0));
    out[k as string] = d;
  });
  return out;
}

export { dataPath };
