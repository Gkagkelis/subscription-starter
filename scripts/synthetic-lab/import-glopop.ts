/*
 * GLOPOP-S Greece import.
 *
 *   npx tsx scripts/synthetic-lab/import-glopop.ts                  # λήψη + δείγμα 5.000 (ιδιωτικό)
 *   npx tsx scripts/synthetic-lab/import-glopop.ts --n 20000 --seed 7
 *   npx tsx scripts/synthetic-lab/import-glopop.ts --bundle         # ανανεώνει το μικρό δείγμα του repo
 *   npx tsx scripts/synthetic-lab/import-glopop.ts --no-download    # μόνο από ήδη κατεβασμένα αρχεία
 *
 * Τα πλήρη αρχεία μένουν στο .synthetic-lab-data/raw/glopop (gitignored).
 * Στο repository μπαίνει ΜΟΝΟ μικρό δείγμα (CC BY 4.0, με αναφορά πηγής).
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { buildGreeceSample, downloadGreece, fetchPublishedStats } from '../../lib/synthetic-lab/population/glopop-import';
import { dataPath } from '../../lib/synthetic-lab/storage/paths';

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const n = Number(arg('--n', '5000'));
  const seed = Number(arg('--seed', '2015'));
  const bundle = process.argv.includes('--bundle');
  const log = (s: string) => console.log(s);

  if (!process.argv.includes('--no-download')) {
    console.log('Λήψη ελληνικών αρχείων GLOPOP-S (μόνο όσα λείπουν)…');
    await downloadGreece({ log });
  }
  const published = await fetchPublishedStats();
  console.log(published ? '✓ Δημοσιευμένα περιφερειακά στατιστικά διαθέσιμα για έλεγχο' : '! Χωρίς δημοσιευμένα στατιστικά (έλεγχος μόνο πλήθους)');

  const pop = await buildGreeceSample({
    n,
    seed,
    published,
    log,
    id: bundle ? 'glopop-grc-2015-bundled' : undefined,
    name: bundle ? `Ελλάδα — GLOPOP-S (2015), δείγμα ${n.toLocaleString('el-GR')} (ενσωματωμένο)` : undefined
  });

  const integ = pop.integrity as any;
  const bad = (integ.regions as any[]).filter(
    (r) => r.rows !== r.expectedRows || r.households !== r.expectedHouseholds || r.mismatches > 0 || !r.hidMonotonic
  );
  console.log(`Σύνολο: ${integ.totalRows.toLocaleString('el-GR')} άτομα (αναμενόμενα ${integ.expectedTotal.toLocaleString('el-GR')})`);
  if (bad.length) {
    console.error('✗ Αποτυχία ελέγχων ακεραιότητας:', JSON.stringify(bad, null, 2));
    process.exit(1);
  }

  const out = bundle
    ? path.resolve(__dirname, '../../lib/synthetic-lab/data/populations/glopop-grc-2015-sample.json')
    : dataPath('populations', `${pop.summary.id}.json`);
  if (bundle) {
    // Στο repo δεν κρατάμε τα πλήρη tallies ανά περιφέρεια σε μορφή "δεδομένων" πέρα από τα απαραίτητα.
    writeFileSync(out, JSON.stringify(pop) + '\n');
  } else {
    writeFileSync(out, JSON.stringify(pop));
  }
  console.log(`✓ Δείγμα ${pop.rows.length} ατόμων -> ${out}`);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
