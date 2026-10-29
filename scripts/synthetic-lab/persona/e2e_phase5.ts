// PHASE5 E2E: ερωτήσεις με βαθμίδα IQGE «international» (διεθνής βάση) στο πραγματικό runtime, N=100..1000 × 3 σπόροι.
import { readFileSync, writeFileSync } from 'fs';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const [inp, out] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(inp, 'utf8'));
const QS: Question[] = doc.questions;
const plan = (n: number) => ({ domain: 'mixed', kind: 'survey', title: 'PHASE5 e2e', researchQuestion: 'GBT', questions: QS, assumptions: [], audience: { minAge: 18 }, sampleSize: n, warnings: [],
  plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10, engine: 'persona', personaModelVersion: 'pie-0.5', personaAutoLink: false }) as unknown as StudyPlan;
const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
const ageOf = new Map(pop.personas.map((p) => [p.id, p.ageBand as string]));
const res: Record<string, unknown>[] = [];
for (const n of [100, 200, 500, 1000]) for (const s of [11, 22, 33]) {
  const t0 = Date.now();
  const run = runPersonaSurvey({ plan: plan(n), populationId: CALIBRATED_POPULATION_ID, seed: s, save: false, stabilityRuns: 1 });
  const ms = Date.now() - t0;
  const rs = run.respondents;
  const per: Record<string, unknown> = {};
  for (const q of QS) {
    const g = q.personaLink?.iqge;
    if (!g) continue;
    const opts = Object.keys(g.level);
    const idx = (r: (typeof rs)[0]) => opts.indexOf(((r.answers.find((a) => a.questionId === q.id)?.value as { choice?: string } | null)?.choice) || '');
    let W = 0;
    const c = new Array(opts.length).fill(0);
    const byAge: Record<string, [number, number]> = {};
    for (const r of rs) {
      const k = idx(r);
      if (k < 0) continue;
      W += r.weight;
      c[k] += r.weight;
      const ab = ageOf.get(r.personaId.split('~')[0]) || '';
      const grp = ['17-24', '18-24', '25-34'].includes(ab) ? 'young' : ['55-64', '65+'].includes(ab) ? 'old' : 'mid';
      const v = byAge[grp] || [0, 0];
      byAge[grp] = [v[0] + r.weight * k, v[1] + r.weight];
    }
    const mae = opts.reduce((a, o, i) => a + Math.abs((100 * c[i]) / W - 100 * g.level[o]), 0) / opts.length;
    const sh = g.groupShift || {};
    const predOldMinusYoung = (sh['age_band:65+'] || 0) - (sh['age_band:25-34'] || 0);
    const m = (k: string) => (byAge[k] ? byAge[k][0] / byAge[k][1] : NaN);
    per[q.id] = { tier: g.tier, mae: +mae.toFixed(2), synthOldMinusYoung: +(m('old') - m('young')).toFixed(3), predShiftOldMinusYoung: +predOldMinusYoung.toFixed(3) };
  }
  res.push({ n, seed: s, exactN: rs.length === n, ms, per });
}
writeFileSync(out, JSON.stringify(res, null, 1));
const last = res.filter((r) => r.n === 1000);
console.log(JSON.stringify(last[0], null, 0));
console.log('ms', res.map((r) => `${r.n}:${r.ms}`).join(' '));
