// Viewscope v2 — vs-xtab: πρακτική εφαρμογή σε νέα μελέτη (πεδίο 16/11/2026) με και χωρίς πίνακες υποομάδων, και δηλωμένη σχέση S.
//   SYNTHETIC_LAB_DATA_DIR=<iso> tsx scripts/synthetic-lab/viewscope/xtab_demo.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runViewscope, type ViewscopeRun } from '../../../lib/synthetic-lab/viewscope/runner';
import { loadPublishedWaves } from '../../../lib/synthetic-lab/viewscope/published-waves';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const DIR = path.resolve(__dirname, '../../../benchmarks/viewscope_v2/xtab');
const SEED = 20261116;
const W = loadPublishedWaves();
const take = (id: string): Question => { const e = W.find((x) => x.id === id)!; return { id: id.slice(-8), type: 'single_choice', text: e.question, options: e.options }; };
const qs = ['pw-1e01ed486824-p58-4dc5fda1', 'pw-1e01ed486824-p63-2c54cdc2', 'pw-1e01ed486824-p68-c3a43e4b', 'pw-1e01ed486824-p52-95418ebd'].map(take);
const plan: StudyPlan = { domain: 'political', kind: 'survey', title: 'Πολιτικό κλίμα 11/2026 (φορέας Opinion Poll)', researchQuestion: 'Πολιτικό κλίμα', questions: qs, assumptions: [], audience: { minAge: 17 }, sampleSize: 1000, warnings: [], plannerVersion: 'manual', plannerMode: 'manual' } as any;
const label = (q: Question, v: any) => (v ? v.choice ?? (q.options || [])[v.scaleIndex] : null);
function ageShares(v: ViewscopeRun, q: Question, opt: string) {
  const out: Record<string, number> = {};
  const by: Record<string, number[]> = {};
  v.respondents.forEach((r) => { const p = (v as any).__ages?.get(r.personaId); const a = r.answers.find((x) => x.questionId === q.id); if (!p || !a?.value) return; (by[p] = by[p] || []).push(label(q, a.value) === opt ? 1 : 0); });
  Object.entries(by).forEach(([k, x]) => (out[k] = +(100 * x.reduce((s, y) => s + y, 0) / x.length).toFixed(1)));
  return out;
}
async function main() {
  const res: any = { seed: SEED, runs: {} };
  for (const mode of ['without', 'with']) {
    const t0 = process.hrtime.bigint();
    const v = await runViewscope({ plan, seed: SEED, study: { org: 'Opinion Poll', fieldworkStart: '2026-11-16' }, routes: { publishedWaves: true }, xtab: { enabled: mode === 'with' } });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // ηλικία συνθετικών προσώπων (από τον πληθυσμό) για την αναφορά υποομάδων
    const { loadPopulation } = await import('../../../lib/synthetic-lab/population/store');
    const pop = loadPopulation(v.base.populationId)!; const ages = new Map(pop.personas.map((p) => [p.id, p.ageBand]));
    (v as any).__ages = new Map(v.respondents.map((r) => [r.personaId, ages.get(r.personaId.split('~')[0])]));
    res.runs[mode] = {
      seconds: +(ms / 1000).toFixed(2), apiCalls: v.apiCalls,
      routes: v.routes.map((r) => ({ q: r.questionId, route: r.route, class: r.class })),
      totals: Object.fromEntries(v.aggregates.map((a) => [a.questionId, Object.fromEntries((a.shares || []).map((s) => [s.option, +s.share.toFixed(1)]))])),
      byAge: Object.fromEntries(qs.slice(0, 3).map((q) => [q.id, ageShares(v, q, 'ΚΑΘΟΛΟΥ')])),
      xtabReports: v.xtabReports
    };
    console.log(mode, JSON.stringify({ s: res.runs[mode].seconds, totals: res.runs[mode].totals, byAge: res.runs[mode].byAge, xtab: v.xtabReports.map((x) => ({ q: x.questionId, used: x.dimsUsed, dropped: x.dimsDropped, marg: x.maxMarginalDevPp })) }));
  }
  // δηλωμένη σχέση S σε καταναλωτική μελέτη (σενάριο): πρόθεση αγοράς ~ «τα βγάζω πέρα» (ήπια, θετική)
  const cons = JSON.parse(readFileSync(path.resolve(__dirname, '../../../benchmarks/viewscope_v2/acceptance/plans/consumer.json'), 'utf8'));
  const v2 = await runViewscope({ plan: cons.plan, seed: SEED, study: cons.study, declaredRelations: [{ questionId: 'q2', driver: 'econ4', direction: 1, strength: 'mild', note: 'όσοι τα βγάζουν πέρα πιο άνετα δηλώνουν πιο συχνά «σίγουρα ναι» (σενάριο)' }] });
  res.declared = v2.declared;
  console.log('declared', JSON.stringify(v2.declared));
  mkdirSync(DIR, { recursive: true }); writeFileSync(path.join(DIR, 'xtab_demo.json'), JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
