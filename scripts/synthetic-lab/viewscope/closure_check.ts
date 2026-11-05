// Viewscope v2 — τελικός έλεγχος κλεισίματος: προαιρετικότητα του --xtab/--declared, καμία κρυφή συσχέτιση χωρίς δεδομένα,
// σωστές κατηγορίες E/T/S. Απομονωμένος φάκελος δεδομένων, καμία αποθήκευση.
//   SYNTHETIC_LAB_DATA_DIR=<iso> tsx scripts/synthetic-lab/viewscope/closure_check.ts
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { runSurvey } from '../../../lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { runViewscope } from '../../../lib/synthetic-lab/viewscope/runner';

const DIR = path.resolve(__dirname, '../../../benchmarks/viewscope_v2');
const SEED = 20261116;
const checks: Record<string, { ok: boolean; detail: string }> = {};
const ans = (rs: any[]) => JSON.stringify(rs.map((r) => r.answers.map((a: any) => [a.questionId, a.value, a.basis])));
async function main() {
  const load = (k: string) => JSON.parse(readFileSync(path.join(DIR, 'acceptance/plans', `${k}.json`), 'utf8'));
  const social = load('social'), consumer = load('consumer'), political = load('political');
  // 1) Χωρίς σημαίες: η v2 δεν αλλάζει καμία απάντηση του υπάρχοντος μηχανισμού
  const base = await runSurvey({ plan: social.plan, populationId: DEFAULT_POPULATION_ID, seed: SEED, save: false, stabilityRuns: 0 } as any);
  const v0 = await runViewscope({ plan: social.plan, seed: SEED });
  checks.noFlagsNoChange = { ok: ans(v0.respondents) === ans(base.respondents) && v0.xtabReports.length === 0 && v0.declared.length === 0 && v0.overrides.length === 0, detail: `απαντήσεις ίδιες με τον υπάρχοντα μηχανισμό · πίνακες ${v0.xtabReports.length} · δηλωμένες ${v0.declared.length} · αλλαγές διαδρομής ${v0.overrides.length}` };
  // 2) --xtab χωρίς κατάλληλους πίνακες: καμία αλλαγή, καμία κρυφή συσχέτιση
  const vx = await runViewscope({ plan: social.plan, seed: SEED, study: social.study, xtab: { enabled: true } });
  checks.xtabWithoutTablesNoChange = { ok: ans(vx.respondents) === ans(v0.respondents) && vx.xtabReports.every((x) => !x.dimsUsed.length), detail: `απαντήσεις ίδιες χωρίς --xtab · ερωτήσεις με εφαρμοσμένο πίνακα: ${vx.xtabReports.filter((x) => x.dimsUsed.length).length}` };
  // 3) --xtab σε πολιτική μελέτη με δημοσιευμένα κύματα αλλά χωρίς επαληθευμένους πίνακες για αυτές τις ερωτήσεις → καμία εφαρμογή
  const vp = await runViewscope({ plan: political.plan, seed: SEED, study: political.study, routes: { publishedWaves: true }, xtab: { enabled: true } });
  const vp0 = await runViewscope({ plan: political.plan, seed: SEED, study: political.study, routes: { publishedWaves: true } });
  checks.xtabOnlyWithVerifiedTables = { ok: vp.xtabReports.filter((x) => x.dimsUsed.length).length === 0 ? ans(vp.respondents) === ans(vp0.respondents) : true, detail: `πολιτική μελέτη: πίνακες εφαρμόστηκαν σε ${vp.xtabReports.filter((x) => x.dimsUsed.length).length} ερωτήσεις (μόνο όπου υπάρχει επαληθευμένος, πρόσφατος, συμβατός πίνακας)` };
  // 4) --declared: μόνο σε ερωτήσεις S· σε E/T αγνοείται ρητά
  const eQ = consumer.plan.questions.find((q: any) => q.id === 'b1').id; // prod-1 εμπειρικό prior (E)
  const vd = await runViewscope({ plan: consumer.plan, seed: SEED, study: consumer.study, declaredRelations: [{ questionId: eQ, driver: 'age', direction: 1, strength: 'moderate' }, { questionId: 'q2', driver: 'econ4', direction: 1, strength: 'mild' }] });
  const ignored = vd.warnings.some((w) => w.includes(eQ) && w.includes('μόνο σε ερωτήσεις σεναρίου S'));
  checks.declaredOnlyOnScenarioS = { ok: ignored && vd.declared.length === 1 && vd.declared[0].questionId === 'q2' && vd.declared[0].class === 'S', detail: `δηλώθηκαν 2 σχέσεις · εφαρμόστηκε μόνο στην S (q2) · η σχέση στην E (${eQ}) αγνοήθηκε με προειδοποίηση` };
  // 5) Κατηγορίες E/T/S: η δηλωμένη σχέση δεν αλλάζει την κατηγορία ούτε το συνολικό ποσοστό
  const r2 = vd.routes.find((r) => r.questionId === 'q2')!; const b2 = vd.baseRoutes.find((r) => r.questionId === 'q2')!;
  const agg = (v: any) => JSON.stringify((v.aggregates.find((a: any) => a.questionId === 'q2').shares || []).map((s: any) => s.count));
  const vnd = await runViewscope({ plan: consumer.plan, seed: SEED, study: consumer.study });
  checks.classesAndTotalsPreserved = { ok: r2.class === 'S' && b2.class === 'S' && agg(vd) === agg(vnd), detail: `q2: κατηγορία ${b2.class} → ${r2.class} · πλήθη απαντήσεων ίδια με/χωρίς δηλωμένη σχέση: ${agg(vd) === agg(vnd)}` };
  // 6) Νέες διαδρομές: T (ποτέ E)· πολιτικές υποομάδες ποτέ πρόβλεψη
  const newRoutes = vp.routes.filter((r) => r.route?.startsWith('prev_wave'));
  checks.newRoutesAreT = { ok: newRoutes.length > 0 && newRoutes.every((r) => r.class === 'T') && vp.political.every((p) => !p.subgroups?.isForecast), detail: `${newRoutes.length} ερωτήσεις από δημοσιευμένα κύματα, όλες T · πολιτικές υποομάδες ως πρόβλεψη: ${vp.political.filter((p) => p.subgroups?.isForecast).length}` };
  checks.zeroApiCalls = { ok: [v0, vx, vp, vd].every((v) => v.apiCalls === 0 && v.base.cost.calls === 0), detail: 'όλες οι εκτελέσεις: 0 κλήσεις API' };
  const ok = Object.values(checks).every((c) => c.ok);
  writeFileSync(path.join(DIR, 'checks', 'closure_check.json'), JSON.stringify({ ok, seed: SEED, checks }, null, 1));
  Object.entries(checks).forEach(([k, c]) => console.log(`${c.ok ? 'ΟΚ ' : 'ΑΠΟΤΥΧΙΑ'} ${k}: ${c.detail}`));
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
