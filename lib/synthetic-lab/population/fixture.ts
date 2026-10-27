// ============================================================
// ΤΕΧΝΗΤΟ FIXTURE — ΜΟΝΟ ΓΙΑ DEVELOPMENT / TESTS.
// Δεν προέρχεται από πραγματικά δεδομένα. Χρησιμοποιείται μόνο αν δεν
// υπάρχει το δείγμα GLOPOP-S, και εμφανίζεται με ρητή προειδοποίηση.
// Οι κατανομές είναι ομοιόμορφες (σκόπιμα μη ρεαλιστικές).
// ============================================================

import { createRng } from '../rng';
import { COMPACT_COLUMNS, type CompactPopulation } from './compact';
import { GLOPOP_GREECE_REGIONS } from './glopop-schema';

export const DEV_FIXTURE_ID = 'dev-fixture-uniform';
export const DEV_FIXTURE_WARNING =
  'ΤΕΧΝΗΤΟ FIXTURE ΓΙΑ DEVELOPMENT — δεν αντιπροσωπεύει την ελληνική κοινωνία. Το GLOPOP-S δεν έχει συνδεθεί.';

export function buildDevFixture(n = 400, seed = 1): CompactPopulation {
  const rng = createRng(seed);
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const region = rng.int(GLOPOP_GREECE_REGIONS.length);
    rows.push([
      region,
      i,
      i + 1,
      1,
      1 + rng.int(5),
      -1,
      rng.int(2),
      3 + rng.int(6),
      rng.int(2),
      1 + rng.int(5),
      1 + rng.int(8),
      1 + rng.int(4)
    ]);
  }
  return {
    format: 'synthetic-lab-compact-v1',
    summary: {
      id: DEV_FIXTURE_ID,
      name: 'ΤΕΧΝΗΤΟ fixture (μόνο development)',
      datasetId: 'dev-fixture',
      isDevFixture: true,
      referenceYear: 0,
      representedPopulation: n,
      sampleSize: n,
      seed,
      createdAt: '1970-01-01T00:00:00.000Z',
      updateStatus: { calibrated: false, targetYear: null, targetsDatasetIds: [], message: DEV_FIXTURE_WARNING },
      qualityNotes: [DEV_FIXTURE_WARNING]
    },
    attribution: 'Τεχνητά δεδομένα — καμία πηγή.',
    sourceFiles: GLOPOP_GREECE_REGIONS.map((r) => ({ region: r.code, file: 'fixture', sha256: null, rows: 0, sampled: 0, weight: 1 })),
    regions: GLOPOP_GREECE_REGIONS.map((r) => ({ code: r.code, nameEl: r.nameEl })),
    columns: COMPACT_COLUMNS,
    rows
  };
}
