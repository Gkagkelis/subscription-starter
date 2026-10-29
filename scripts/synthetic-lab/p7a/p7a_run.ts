// PHASE7A — εκτέλεση ενός ερωτηματολογίου με παγωμένο μοντέλο PIE (τρέχει ως απομονωμένος χρήστης p7apred).
// Είσοδος: σχέδιο με ερωτήσεις (και προαιρετικούς συνδέσμους)· έξοδος: κατανομή ανά ερώτηση από τις ατομικές απαντήσεις,
// κατηγορία υποστήριξης, βαθμίδα τεκμηρίωσης, αποχή, αναμενόμενο σφάλμα. ΔΕΝ διαβάζει πραγματικές απαντήσεις.
//   tsx scripts/synthetic-lab/p7a/p7a_run.ts <plan.json> <model> <autolink:0|1> <allowExperimental:0|1> <n> <seed> <out.json>
import { readFileSync, writeFileSync } from 'fs';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { CALIBRATED_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const [planPath, model, auto, exp, nStr, seedStr, out] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(planPath, 'utf8'));
const QS: Question[] = doc.questions;
const plan = {
  domain: 'mixed', kind: 'survey', title: doc.title || 'PHASE7A', researchQuestion: 'PHASE7A retrospective blind test', questions: QS, assumptions: [],
  audience: doc.audience || { minAge: 18 }, sampleSize: Number(nStr), warnings: [], plannerVersion: 'manual', plannerMode: 'rules',
  referenceYear: doc.referenceYear, referenceMonth: doc.referenceMonth, engine: 'persona', personaModelVersion: model,
  personaAutoLink: auto === '1', allowExperimental: exp === '1'
} as unknown as StudyPlan;
const t0 = Date.now();
const run = runPersonaSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: Number(seedStr), save: false, stabilityRuns: 1 });
const res = QS.map((q, i) => {
  const a = run.aggregates[i];
  const opts = q.type === 'likert' ? q.scale || [] : q.options || [];
  const counts: Record<string, number> = Object.fromEntries(opts.map((o) => [o, 0]));
  let W = 0;
  for (const r of run.respondents) {
    const ans = r.answers.find((x) => x.questionId === q.id);
    if (!ans || ans.skipped || !ans.value) continue;
    const v = ans.value as { choice?: string; choices?: string[]; scaleIndex?: number };
    const picked = v.choice != null ? [v.choice] : v.choices ? v.choices : v.scaleIndex != null && v.scaleIndex >= 0 ? [opts[v.scaleIndex]] : [];
    if (!picked.length) continue;
    W += r.weight;
    picked.forEach((p) => { if (p in counts) counts[p] += r.weight; });
  }
  const prov = (a.persona?.provenance || {}) as Record<string, unknown>;
  const ev = prov.evidenceTier as Record<string, unknown> | undefined;
  return {
    qid: q.id, options: opts, answered: W > 0, nAnswered: W,
    shares: W > 0 ? Object.fromEntries(opts.map((o) => [o, (100 * counts[o]) / W])) : null,
    support: a.persona?.support || null, reason: (a.persona?.reason || '').slice(0, 400),
    tier: ev ? ev.tier : null, abstain: ev ? ev.abstain : null, expectedMAE: ev ? ev.expectedMAE : null, p90: ev ? ev.p90 : null,
    responseModel: prov.responseModel || null, autoLink: prov.autoLink || null, iqgeTier: (prov.iqge as { tier?: string } | null)?.tier || null,
    int80: (prov.iqge as { int80?: unknown } | null)?.int80 || null
  };
});
writeFileSync(out, JSON.stringify({ model, autolink: auto === '1', allowExperimental: exp === '1', n: Number(nStr), seed: Number(seedStr), ms: Date.now() - t0,
  engineVersion: run.engine.engineVersion, warnings: run.warnings, questions: res }, null, 1));
console.log(model, 'ok', res.filter((r) => r.answered).length, '/', res.length, 'απαντήθηκαν');
