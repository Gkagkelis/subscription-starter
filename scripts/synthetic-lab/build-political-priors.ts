/*
 * Παράγει το lib/synthetic-lab/data/political-priors.generated.json από τα
 * public/noraya-data/vote_intention.csv και leader_traits.csv (ΔΕΝ αλλάζει τα αρχεία της NORAYA).
 *
 *   npx tsx scripts/synthetic-lab/build-political-priors.ts          # build
 *   npx tsx scripts/synthetic-lab/build-political-priors.ts --check  # έλεγχος ακεραιότητας
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { buildPoliticalPriors } from '../../lib/synthetic-lab/data/political-build';

const root = path.resolve(__dirname, '../..');
const voteSrc = path.join(root, 'public/noraya-data/vote_intention.csv');
const leaderSrc = path.join(root, 'public/noraya-data/leader_traits.csv');
const out = path.join(root, 'lib/synthetic-lab/data/political-priors.generated.json');
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

const priors = buildPoliticalPriors(readFileSync(voteSrc, 'utf8'), readFileSync(leaderSrc, 'utf8'), { vote: sha(voteSrc), leader: sha(leaderSrc) });
const json = JSON.stringify(priors);

if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8').trim() !== json.trim()) {
    console.error('✗ Το political-priors.generated.json δεν αντιστοιχεί στις τρέχουσες πηγές. Τρέξε το build.');
    process.exit(1);
  }
  console.log('✓ Πολιτικά priors σε συμφωνία με τις πηγές');
} else {
  writeFileSync(out, json + '\n');
  const ms = Object.values(priors.metrics);
  const waves = ms.reduce((s, m) => s + m.waves.length, 0);
  const isolated = ms.reduce((s, m) => s + m.waves.filter((w) => w.qualityFlag).length, 0);
  console.log(`✓ ${ms.length} δείκτες, ${waves} κύματα (${isolated} απομονωμένα), ${priors.meta.builtFromRows}/${priors.meta.rows} γραμμές -> ${path.relative(root, out)}`);
}
