/*
 * Έλεγχοι ακεραιότητας δεδομένων του Lab:
 *   npx tsx scripts/synthetic-lab/check-data.ts
 *  1. Τα NORAYA priors αντιστοιχούν στο τρέχον public_opinion.csv (sha256).
 *  2. Το ενσωματωμένο δείγμα GLOPOP-S πέρασε όλους τους ελέγχους έναντι των
 *     δημοσιευμένων στατιστικών, έχει σωστά σύνολα και μοναδικά IDs.
 *  3. Κανένα πλήρες dataset δεν βρίσκεται στο public/ ή στο repo.
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { PRIORS } from '../../lib/synthetic-lab/data/noraya';
import { GLOPOP_GREECE_TOTALS } from '../../lib/synthetic-lab/population/glopop-schema';
import { DEFAULT_POPULATION_ID, loadPopulation, populationIntegrity } from '../../lib/synthetic-lab/population/store';

const root = path.resolve(__dirname, '../..');
let failures = 0;
const ok = (m: string) => console.log(`✓ ${m}`);
const bad = (m: string) => {
  failures++;
  console.error(`✗ ${m}`);
};

// 1
const csv = path.join(root, 'public/noraya-data/public_opinion.csv');
const sha = createHash('sha256').update(readFileSync(csv)).digest('hex');
sha === PRIORS.meta.sourceSha256 ? ok(`NORAYA priors σε συμφωνία με public_opinion.csv (${sha.slice(0, 12)}…)`) : bad('NORAYA priors δεν αντιστοιχούν στο CSV — τρέξε npm run lab:build-priors');
const excluded = Object.keys(PRIORS.meta.excludedMetrics);
excluded.every((m) => !PRIORS.metrics[m]) ? ok(`Εξαιρούμενοι δείκτες απουσιάζουν (${excluded.join(', ')})`) : bad('Εξαιρούμενος δείκτης βρέθηκε στα priors');

// 2
const pop = loadPopulation(DEFAULT_POPULATION_ID);
if (!pop) bad('Το ενσωματωμένο δείγμα GLOPOP-S λείπει');
else {
  pop.summary.representedPopulation === GLOPOP_GREECE_TOTALS.individuals ? ok(`Σύνολο πληθυσμού ${GLOPOP_GREECE_TOTALS.individuals}`) : bad('Λάθος σύνολο πληθυσμού');
  new Set(pop.personas.map((p) => p.id)).size === pop.personas.length ? ok(`${pop.personas.length} μοναδικά synthetic IDs`) : bad('Διπλότυπα synthetic IDs');
  const integ = populationIntegrity(DEFAULT_POPULATION_ID) as any;
  const badRegions = (integ?.regions || []).filter((r: any) => r.mismatches || r.rows !== r.expectedRows || r.households !== r.expectedHouseholds || !r.hidMonotonic);
  integ && !badRegions.length ? ok(`Ακεραιότητα GLOPOP-S: ${integ.regions.length}/13 περιφέρειες χωρίς απόκλιση`) : bad('Αποτυχία ακεραιότητας GLOPOP-S');
  pop.personas.every((p) => p.dataVintage === 2015 && p.provenance.sourceFile) ? ok('Κάθε προφίλ έχει προέλευση και έτος αναφοράς') : bad('Προφίλ χωρίς προέλευση');
}

// 3
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const suspicious = walk(path.join(root, 'public')).filter((f) => /\.(dat\.gz|parquet|sav|dta)$/i.test(f) || statSync(f).size > 5_000_000);
suspicious.length ? bad(`Μεγάλα/ακατέργαστα datasets στο public/: ${suspicious.join(', ')}`) : ok('Κανένα πλήρες dataset στο public/');
const sample = path.join(root, 'lib/synthetic-lab/data/populations/glopop-grc-2015-sample.json');
existsSync(sample) && statSync(sample).size < 1_000_000 ? ok(`Ενσωματωμένο δείγμα μικρό (${(statSync(sample).size / 1024).toFixed(0)} KB, CC BY 4.0)`) : bad('Το ενσωματωμένο δείγμα λείπει ή είναι πολύ μεγάλο');
const gi = readFileSync(path.join(root, '.gitignore'), 'utf8');
gi.includes('.synthetic-lab-data') ? ok('.synthetic-lab-data στο .gitignore') : bad('.synthetic-lab-data δεν είναι στο .gitignore');

if (failures) {
  console.error(`\n${failures} αποτυχίες.`);
  process.exit(1);
}
console.log('\nΌλοι οι έλεγχοι δεδομένων πέρασαν.');
