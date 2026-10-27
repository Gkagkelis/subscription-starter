// ============================================================
// GLOPOP-S Greece importer (Node μόνο).
//
//  1. Κατεβάζει ΜΟΝΟ τα ελληνικά αρχεία (13 × synthpop_GRCr1xx.dat.gz,
//     ≈11 MB συνολικά) σε ιδιωτικό φάκελο (.synthetic-lab-data/raw/glopop).
//     Δεν ξανακατεβάζει αρχείο που υπάρχει ήδη με σωστό μέγεθος (manifest).
//  2. Επαληθεύει: μέγεθος, πλήθος εγγραφών, πλήθος νοικοκυριών, κατανομές
//     σε σύγκριση με τα δημοσιευμένα GLOPOP_regional_statistics (αν διαθέσιμα).
//  3. Παράγει στρωματοποιημένο (ανά περιφέρεια) δείγμα με βάρη.
// ============================================================

import { createHash } from 'crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { parseCsvObjects } from '../csv';
import { dataPath } from '../storage/paths';
import type { PopulationSummary } from '../types';
import { COMPACT_COLUMNS, type CompactPopulation } from './compact';
import { glopopRowCount, readGlopopFile } from './glopop-reader';
import {
  GLOPOP_ATTRIBUTION,
  GLOPOP_DATASET_ID,
  GLOPOP_GREECE_REGIONS,
  GLOPOP_KNOWN_ISSUES,
  GLOPOP_REFERENCE_YEAR,
  dataverseUrl,
  type GlopopRegion
} from './glopop-schema';
import { largestRemainder, sampleIndices } from './sampling';
import { deriveSeed } from '../rng';
import { baselineUpdateStatus } from './calibration';

export const GLOPOP_STATS_URL =
  'https://raw.githubusercontent.com/VU-IVM/GLOPOP-S/main/DATA/GLOPOP_regional_statistics.csv';

export interface ManifestEntry {
  region: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  downloadedAt: string;
}

function rawDir() {
  return path.dirname(dataPath('raw', 'glopop', 'GRC', '.keep'));
}

function manifestPath() {
  return dataPath('raw', 'glopop', 'GRC', 'manifest.json');
}

export function readManifest(): Record<string, ManifestEntry> {
  const p = manifestPath();
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

async function sha256File(p: string): Promise<string> {
  const h = createHash('sha256');
  await new Promise<void>((res, rej) => {
    createReadStream(p)
      .on('data', (c) => h.update(c))
      .on('end', () => res())
      .on('error', rej);
  });
  return h.digest('hex');
}

export function regionFile(region: GlopopRegion) {
  return path.join(rawDir(), `synthpop_${region.code}.dat.gz`);
}

/** Κατεβάζει τα αρχεία που λείπουν. Επιστρέφει log γραμμές. */
export async function downloadGreece(
  opts: { regions?: string[]; fetchImpl?: typeof fetch; log?: (s: string) => void } = {}
): Promise<ManifestEntry[]> {
  const log = opts.log || (() => {});
  const f = opts.fetchImpl || fetch;
  const manifest = readManifest();
  const regions = GLOPOP_GREECE_REGIONS.filter((r) => !opts.regions || opts.regions.includes(r.code));
  for (const r of regions) {
    const file = regionFile(r);
    if (existsSync(file) && statSync(file).size === r.fileBytes && manifest[r.code]) {
      log(`= ${r.code} υπάρχει ήδη (${r.fileBytes} bytes) — παράλειψη`);
      continue;
    }
    const url = dataverseUrl(r.dataverseFileId);
    log(`↓ ${r.code} ${url}`);
    const res = await f(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Αποτυχία λήψης ${r.code}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length !== r.fileBytes) {
      throw new Error(`Μη αναμενόμενο μέγεθος ${r.code}: ${buf.length} αντί ${r.fileBytes} bytes`);
    }
    if (buf[0] !== 0x1f || buf[1] !== 0x8b) throw new Error(`Το ${r.code} δεν είναι gzip.`);
    writeFileSync(file, buf);
    manifest[r.code] = {
      region: r.code,
      file: path.basename(file),
      url,
      bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
      downloadedAt: new Date().toISOString()
    };
    writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2));
  }
  return regions.map((r) => manifest[r.code]).filter(Boolean);
}

/** Δημοσιευμένα στατιστικά ανά περιφέρεια (για έλεγχο ακεραιότητας). */
export async function fetchPublishedStats(fetchImpl: typeof fetch = fetch): Promise<Record<string, Record<string, number>> | null> {
  const cache = dataPath('raw', 'glopop', 'GLOPOP_regional_statistics_GRC.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  try {
    const res = await fetchImpl(GLOPOP_STATS_URL);
    if (!res.ok) return null;
    const rows = parseCsvObjects(await res.text()).filter((r) => r.iso_code === 'GRC');
    const out: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      const o: Record<string, number> = {};
      Object.keys(r).forEach((k) => {
        const v = Number(r[k]);
        if (Number.isFinite(v)) o[k] = v;
      });
      out[r.GDLcode] = o;
    });
    writeFileSync(cache, JSON.stringify(out));
    return out;
  } catch {
    return null;
  }
}

export interface RegionIntegrity {
  region: string;
  rows: number;
  expectedRows: number;
  households: number;
  expectedHouseholds: number;
  hidMonotonic: boolean;
  publishedChecks: { field: string; ours: number; published: number }[];
  mismatches: number;
  marginals: Record<string, Record<string, number>>;
}

// [στήλη δημοσιευμένων στατιστικών, δική μας στήλη, επίπεδο μέτρησης]
const PUBLISHED_FIELD_MAP: [string, string, 'person' | 'household'][] = [
  ['INCOME_', 'INCOME', 'person'],
  ['EDU_', 'EDUC', 'person'],
  ['AGE_', 'AGE', 'person'],
  ['GENDER_', 'GENDER', 'person'],
  ['RURALINDI_', 'RURAL', 'person'],
  ['HHTYPE_', 'HHTYPE', 'household'],
  ['HHSIZE_', 'HHSIZE_CAT', 'household'],
  ['RURALHH_', 'RURAL', 'household']
];

/**
 * Διαβάζει όλα τα ελληνικά αρχεία σε stream, ελέγχει ακεραιότητα και
 * παράγει στρωματοποιημένο δείγμα n ατόμων (όλων των ηλικιών).
 */
export async function buildGreeceSample(opts: {
  n: number;
  seed: number;
  id?: string;
  name?: string;
  published?: Record<string, Record<string, number>> | null;
  log?: (s: string) => void;
}): Promise<CompactPopulation> {
  const log = opts.log || (() => {});
  const manifest = readManifest();
  const missing = GLOPOP_GREECE_REGIONS.filter((r) => !existsSync(regionFile(r)));
  if (missing.length) {
    throw new Error(
      `Λείπουν αρχεία GLOPOP-S: ${missing.map((m) => m.code).join(', ')}. Τρέξε πρώτα: npm run lab:import-glopop`
    );
  }
  const sizes: Record<string, number> = {};
  GLOPOP_GREECE_REGIONS.forEach((r) => (sizes[r.code] = r.individuals));
  const alloc = largestRemainder(sizes, opts.n);

  const rows: number[][] = [];
  const sourceFiles: CompactPopulation['sourceFiles'] = [];
  const integrity: RegionIntegrity[] = [];

  for (let ri = 0; ri < GLOPOP_GREECE_REGIONS.length; ri++) {
    const r = GLOPOP_GREECE_REGIONS[ri];
    const file = regionFile(r);
    const k = alloc[r.code];
    const t0 = Date.now();
    // Πρώτα επιλέγουμε δείκτες (χρειάζεται μόνο το N από το gzip trailer).
    const N = glopopRowCount(file);
    const idx = sampleIndices(N, k, deriveSeed(opts.seed, r.code));
    const res = await readGlopopFile(file, idx);
    const checks: RegionIntegrity['publishedChecks'] = [];
    const pub = opts.published?.[r.code];
    if (pub) {
      for (const [prefix, col, level] of PUBLISHED_FIELD_MAP) {
        const source = level === 'household' ? res.householdTallies : res.tallies;
        Object.keys(pub)
          .filter((key) => key.startsWith(prefix) && /_\d+$/.test(key))
          .forEach((key) => {
            const code = key.slice(prefix.length);
            checks.push({ field: key, ours: source[col]?.[code] || 0, published: pub[key] });
          });
      }
    }
    const mismatches = checks.filter((c) => Math.abs(c.ours - c.published) > 0.5).length;
    integrity.push({
      region: r.code,
      rows: res.n,
      expectedRows: r.individuals,
      households: res.households,
      expectedHouseholds: r.households,
      hidMonotonic: res.hidMonotonic,
      publishedChecks: checks,
      mismatches,
      marginals: {
        AGE: res.tallies.AGE,
        GENDER: res.tallies.GENDER,
        EDUC: res.tallies.EDUC,
        INCOME: res.tallies.INCOME,
        RURAL: res.tallies.RURAL,
        HHTYPE: res.tallies.HHTYPE,
        HHSIZE_CAT: res.tallies.HHSIZE_CAT,
        WEALTH: res.tallies.WEALTH,
        SOURCE: res.tallies.SOURCE
      }
    });
    log(
      `✓ ${r.code}: ${res.n} άτομα, ${res.households} νοικοκυριά, δείγμα ${k}, έλεγχοι ${checks.length - mismatches}/${checks.length} (${Date.now() - t0} ms)`
    );
    idx.forEach((i) => {
      const g = res.rows.get(i)!;
      rows.push([ri, i, g.HID, g.RELATE_HEAD, g.INCOME, g.WEALTH, g.RURAL, g.AGE, g.GENDER, g.EDUC, g.HHTYPE, g.HHSIZE_CAT]);
    });
    sourceFiles.push({
      region: r.code,
      file: path.basename(file),
      sha256: manifest[r.code]?.sha256 || (await sha256File(file)),
      rows: res.n,
      sampled: k,
      weight: k > 0 ? res.n / k : 0
    });
  }

  const totalRows = integrity.reduce((s, x) => s + x.rows, 0);
  const qualityNotes = [...GLOPOP_KNOWN_ISSUES];
  const bad = integrity.filter((x) => x.rows !== x.expectedRows || x.households !== x.expectedHouseholds || x.mismatches > 0);
  if (bad.length) qualityNotes.push(`Αποκλίσεις ακεραιότητας σε: ${bad.map((b) => b.region).join(', ')}`);
  if (!opts.published) qualityNotes.push('Τα δημοσιευμένα περιφερειακά στατιστικά δεν ήταν διαθέσιμα· έγινε μόνο έλεγχος πλήθους.');

  const summary: PopulationSummary = {
    id: opts.id || `glopop-grc-2015-n${opts.n}-s${opts.seed}`,
    name: opts.name || `Ελλάδα — GLOPOP-S (2015), δείγμα ${opts.n.toLocaleString('el-GR')}`,
    datasetId: GLOPOP_DATASET_ID,
    isDevFixture: false,
    referenceYear: GLOPOP_REFERENCE_YEAR,
    representedPopulation: totalRows,
    sampleSize: rows.length,
    seed: opts.seed,
    createdAt: new Date().toISOString(),
    updateStatus: baselineUpdateStatus(GLOPOP_REFERENCE_YEAR),
    qualityNotes
  };

  return {
    format: 'synthetic-lab-compact-v1',
    summary,
    attribution: GLOPOP_ATTRIBUTION,
    sourceFiles,
    regions: GLOPOP_GREECE_REGIONS.map((r) => ({ code: r.code, nameEl: r.nameEl })),
    columns: COMPACT_COLUMNS,
    rows,
    integrity: {
      totalRows,
      expectedTotal: 10625742,
      regions: integrity.map(({ marginals, publishedChecks, ...rest }) => ({
        ...rest,
        publishedChecked: publishedChecks.length
      })),
      marginals: Object.fromEntries(integrity.map((x) => [x.region, x.marginals]))
    }
  };
}
