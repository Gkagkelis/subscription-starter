/*
 * Παράγει το lib/synthetic-lab/data/noraya-priors.generated.json από το
 * public/noraya-data/public_opinion.csv (ΔΕΝ αλλάζει το αρχείο της NORAYA).
 *
 *   npx tsx scripts/synthetic-lab/build-noraya-priors.ts          # build
 *   npx tsx scripts/synthetic-lab/build-noraya-priors.ts --check  # έλεγχος ακεραιότητας
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { buildNorayaPriors } from '../../lib/synthetic-lab/data/noraya-build';

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'public/noraya-data/public_opinion.csv');
const out = path.join(root, 'lib/synthetic-lab/data/noraya-priors.generated.json');

const text = readFileSync(src, 'utf8');
const sha = createHash('sha256').update(readFileSync(src)).digest('hex');
const priors = buildNorayaPriors(text, sha);
const json = JSON.stringify(priors);

if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current.trim() !== json.trim()) {
    console.error('✗ Το noraya-priors.generated.json δεν αντιστοιχεί στο τρέχον public_opinion.csv. Τρέξε το build.');
    process.exit(1);
  }
  console.log(`✓ NORAYA priors σε συμφωνία με την πηγή (sha256 ${sha.slice(0, 12)}…)`);
} else {
  writeFileSync(out, json + '\n');
  const metrics = Object.keys(priors.metrics).length;
  console.log(`✓ ${metrics} δείκτες, ${priors.meta.builtFromRows}/${priors.meta.rows} γραμμές -> ${path.relative(root, out)}`);
}
