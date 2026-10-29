// PHASE7A §12 — μικτό ερωτηματολόγιο από τις 4 πραγματικές έρευνες με pie-0.7 (μόνο έλεγχος λειτουργίας και περιθωρίων·
// ΔΕΝ υπάρχει πραγματική κοινή κατανομή των ίδιων ερωτώμενων). Χρησιμοποιεί τους παγωμένους συνδέσμους IQGE των προβλέψεων.
//   tsx scripts/synthetic-lab/p7a/p7a_mixed.ts <out.json>
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { CALIBRATED_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const W = path.join(process.cwd(), '.synthetic-lab-data', 'p7a', 'work');
const pick: [string, string[]][] = [
  ['P7A-POL-01', ['Q1', 'Q5', 'Q6', 'Q16', 'Q17', 'Q19']],
  ['P7A-POL-02', ['Q7', 'Q9']],
  ['P7A-CON-01', ['Q2', 'Q4_1', 'Q4_2']],
  ['P7A-SOC-01', ['Q1', 'Q14', 'Q16_a']]
];
const QS: Question[] = [];
for (const [sid, ids] of pick) {
  const doc = JSON.parse(readFileSync(path.join(W, `${sid}.iqge.json`), 'utf8'));
  for (const q of doc.questions as Question[]) if (ids.includes(q.id)) QS.push({ ...q, id: `${sid}:${q.id}`, followUpOf: q.followUpOf ? { ...q.followUpOf, questionId: `${sid}:${q.followUpOf.questionId}` } : undefined });
}
const plan = (n: number) => ({ domain: 'mixed', kind: 'survey', title: 'PHASE7A μικτό', researchQuestion: 'μικτό', questions: QS, assumptions: [], audience: { minAge: 18 },
  sampleSize: n, warnings: [], plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10, engine: 'persona', personaModelVersion: 'pie-0.7',
  personaAutoLink: true }) as unknown as StudyPlan;
const res: Record<string, unknown>[] = [];
for (const n of [100, 500, 1000]) for (const s of [7, 8]) {
  const t0 = Date.now();
  const a = runPersonaSurvey({ plan: plan(n), populationId: CALIBRATED_POPULATION_ID, seed: s, save: false, stabilityRuns: 1 });
  const ms = Date.now() - t0;
  const b = runPersonaSurvey({ plan: plan(n), populationId: CALIBRATED_POPULATION_ID, seed: s, save: false, stabilityRuns: 1 });
  const ids = new Set(a.respondents.map((r) => r.personaId));
  const validCats = QS.every((q) => {
    const opts = q.type === 'likert' ? q.scale || [] : q.options || [];
    return a.respondents.every((r) => {
      const v = r.answers.find((x) => x.questionId === q.id);
      if (!v || v.skipped || !v.value) return true;
      const val = v.value as { choice?: string; choices?: string[]; scaleIndex?: number };
      if (val.choice != null) return opts.includes(val.choice);
      if (val.choices) return val.choices.every((c) => opts.includes(c));
      return val.scaleIndex != null && val.scaleIndex >= 0 && val.scaleIndex < opts.length;
    });
  });
  const f = QS.find((q) => q.followUpOf);
  const skipOk = !f || a.respondents.every((r) => {
    const parent = r.answers.find((x) => x.questionId === f.followUpOf!.questionId)?.value as { choice?: string } | null;
    const child = r.answers.find((x) => x.questionId === f.id);
    return f.followUpOf!.whenAnswerIn.includes(parent?.choice || '') || !!child?.skipped;
  });
  res.push({
    n, seed: s, exactN: a.respondents.length === n, uniqueIds: ids.size, reproducible: JSON.stringify(a.respondents) === JSON.stringify(b.respondents), validCats, skipOk,
    allQuestionsPerRespondent: a.respondents.every((r) => r.answers.length === QS.length), ms,
    tiers: Object.fromEntries(a.aggregates.map((x) => [x.questionId, (x.persona?.provenance as { evidenceTier?: { tier: number; specialist: string; domain: string } } | undefined)?.evidenceTier]))
  });
}
writeFileSync(process.argv[2] || '/dev/null', JSON.stringify(res, null, 1));
for (const r of res) console.log(JSON.stringify({ ...r, tiers: undefined }));
console.log(JSON.stringify(res[0].tiers));
