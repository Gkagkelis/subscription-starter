// Συμπαγής αποθήκευση δείγματος πληθυσμού (κωδικοί GLOPOP-S) και
// μετατροπή σε Persona. Κοινό για το bundled δείγμα και τα ιδιωτικά imports.

import { stableId } from '../rng';
import type { Persona, Population, PopulationSummary } from '../types';
import {
  AGE_CODES,
  EDUC_CODES,
  GLOPOP_REFERENCE_YEAR,
  GLOPOP_VERSION,
  HHSIZE_CODES,
  HHTYPE_CODES,
  RELATE_CODES,
  decodeQuintile,
  decodeSettlement
} from './glopop-schema';

export const COMPACT_COLUMNS = [
  'region',
  'record',
  'HID',
  'RELATE_HEAD',
  'INCOME',
  'WEALTH',
  'RURAL',
  'AGE',
  'GENDER',
  'EDUC',
  'HHTYPE',
  'HHSIZE_CAT'
] as const;

export interface CompactPopulation {
  format: 'synthetic-lab-compact-v1';
  summary: PopulationSummary;
  attribution: string;
  sourceFiles: { region: string; file: string; sha256: string | null; rows: number; sampled: number; weight: number }[];
  regions: { code: string; nameEl: string }[];
  columns: typeof COMPACT_COLUMNS;
  rows: number[][];
  integrity?: Record<string, unknown>;
}

export function expandCompactPopulation(cp: CompactPopulation): Population {
  const weightByRegion: Record<string, number> = {};
  const fileByRegion: Record<string, string> = {};
  cp.sourceFiles.forEach((f) => {
    weightByRegion[f.region] = f.weight;
    fileByRegion[f.region] = f.file;
  });
  const personas: Persona[] = cp.rows.map((r) => {
    const [regionIdx, record, hid, relate, income, wealth, rural, age, gender, educ, hhtype, hhsize] = r;
    const region = cp.regions[regionIdx];
    const unknown: string[] = ['employment', 'occupation'];
    if (decodeQuintile(wealth) === null) unknown.push('wealth');
    if (decodeQuintile(income) === null) unknown.push('income');
    return {
      id: stableId(cp.summary.isDevFixture ? 'dev' : 'gp', `GLOPOP-S-v${GLOPOP_VERSION}`, region.code, record),
      regionCode: region.code,
      regionName: region.nameEl,
      settlement: decodeSettlement(rural),
      ageBand: AGE_CODES[age] || '65+',
      gender: gender === 1 ? 'male' : 'female',
      education: EDUC_CODES[educ] || 'unknown',
      incomeQuintile: decodeQuintile(income),
      wealthQuintile: decodeQuintile(wealth),
      householdType: HHTYPE_CODES[hhtype] || 'unknown',
      householdSize: HHSIZE_CODES[hhsize] || null,
      householdRole: RELATE_CODES[relate] || null,
      employment: 'unknown',
      weight: weightByRegion[region.code] ?? 1,
      unknownAttributes: unknown,
      provenance: {
        datasetId: cp.summary.datasetId,
        sourceFile: fileByRegion[region.code] || null,
        sourceRecord: record,
        householdId: `${region.code}:${hid}`
      },
      dataVintage: cp.summary.referenceYear || GLOPOP_REFERENCE_YEAR
    };
  });
  return { summary: cp.summary, personas };
}
