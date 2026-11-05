// Viewscope v2 — Π0: αποτυπώματα παλινδρόμησης των ΥΠΑΡΧΟΝΤΩΝ μηχανισμών (prod-1, EGPS, PIE, structured-1.0).
// Ίδιο seed ⇒ ίδιες απαντήσεις. Εκτελείται σε απομονωμένο φάκελο δεδομένων (SYNTHETIC_LAB_DATA_DIR), χωρίς αποθήκευση.
//   tsx scripts/synthetic-lab/viewscope/regression.ts baseline   (μία φορά, πριν από αλλαγές)
//   tsx scripts/synthetic-lab/viewscope/regression.ts verify
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import path from 'path';
import { runSurvey } from '../../../lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { runStructuredStudy } from '../../../lib/synthetic-lab/structured/engine';

const REPO = path.resolve(__dirname, '../../..');
const OUT = path.join(REPO, 'benchmarks/viewscope_v2/integrity/regression_baseline.json');
const STUDIES = path.join(REPO, '.synthetic-lab-data/studies');
const SEED = 20261105;
const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

async function surveyFp(file: string, engine: string | null) {
  const doc = JSON.parse(readFileSync(path.join(STUDIES, file), 'utf8'));
  const plan = { ...doc.plan, sampleSize: 300, ...(engine ? { engine } : {}) };
  const run = await runSurvey({ plan, populationId: doc.populationId || DEFAULT_POPULATION_ID, seed: SEED, save: false, stabilityRuns: 0, mode: 'demo' } as any);
  return { answers: h(run.respondents.map((r) => [r.personaId, r.answers.map((a) => [a.questionId, a.value, a.basis])])), aggregates: h(run.aggregates), n: run.respondents.length, apiCalls: run.cost.calls };
}

async function main() {
  const mode = process.argv[2] || 'verify';
  const fp: Record<string, unknown> = {};
  fp['prod-1'] = await surveyFp('study-mvr0mtz8-1srzsi.json', null);
  fp['EGPS'] = await surveyFp('study-mvr0mtz8-1srzsi.json', 'evidence');
  fp['PIE pie-0.2 political'] = await surveyFp('study-mvslb843-v7hait.json', null);
  fp['PIE barometer'] = await surveyFp('study-mvsjkfa5-5medyu.json', null);
  fp['PIE Cinobo'] = await surveyFp('study-mvsjt73p-5czv7q.json', null);
  // structured-1.0: η κύρια εκτέλεση της πιλοτικής Κωτσόβολος πρέπει να ταυτίζεται με την αποθηκευμένη (internal_package/runs/main.json.gz).
  const spec = JSON.parse(readFileSync(path.join(REPO, 'studies/kotsovolos_lab_pilot_2026/spec.json'), 'utf8'));
  const run = runStructuredStudy(spec, { n: 500, seed: SEED, effectScale: 1, baseShift: 0, ablateMetrics: [], ablatePie: false });
  const stored = JSON.parse(gunzipSync(readFileSync(path.join(REPO, 'studies/kotsovolos_lab_pilot_2026/internal_package/runs/main.json.gz'))).toString());
  const ans = (rs: any[]) => h(rs.map((r) => [r.persona_id, r.answers, r.classes]));
  fp['structured-1.0 kotsovolos'] = { answers: ans(run.respondents), matchesStoredRun: ans(run.respondents) === ans(stored.respondents) };
  if (mode === 'baseline') {
    if (existsSync(OUT)) throw new Error('Υπάρχει ήδη baseline· δεν αντικαθίσταται.');
    writeFileSync(OUT, JSON.stringify({ createdAt: new Date().toISOString(), seed: SEED, fingerprints: fp }, null, 1));
    console.log(JSON.stringify(fp, null, 1));
    return;
  }
  const base = JSON.parse(readFileSync(OUT, 'utf8')).fingerprints;
  const diffs = Object.keys(base).filter((k) => JSON.stringify(base[k]) !== JSON.stringify(fp[k]));
  const res = { ok: diffs.length === 0 && (fp['structured-1.0 kotsovolos'] as any).matchesStoredRun, diffs, checked: Object.keys(base) };
  console.log(JSON.stringify(res, null, 1));
  process.exit(res.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
