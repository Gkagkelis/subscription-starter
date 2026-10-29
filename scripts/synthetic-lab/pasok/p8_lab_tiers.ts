// PHASE 8 (demo ΠΑΣΟΚ): πώς βαθμολογεί ο ίδιος ο κινητήρας του Lab (pie-0.7, staged, πολιτική τεκμηρίωσης evidence-1) κάθε
// ερώτηση του ερωτηματολογίου, χωρίς χειροκίνητους συνδέσμους. Τεκμηριώνει γιατί οι περισσότερες ερωτήσεις δεν μπορούν
// να υπολογιστούν απευθείας από το Lab. save:false — καμία αλλαγή στην παραγωγή.
//   tsx scripts/synthetic-lab/pasok/p8_lab_tiers.ts <out.json>
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { CALIBRATED_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

type QItem = { id: string; section: string; type: string; text: string; options?: [number, string][]; items?: [string, string][] };
const doc = JSON.parse(readFileSync(path.join(process.cwd(), 'config/synthetic-lab/pasok/questionnaire.json'), 'utf8')) as { questions: QItem[] };
const QS: Question[] = [];
for (const q of doc.questions) {
  if (q.section === 'Z') continue;
  const opts = (q.options || []).filter(([c]) => c !== 99).map(([, l]) => l);
  const base = (id: string, text: string): Question =>
    q.type === 'multi'
      ? ({ id, type: 'multiple_choice', text, options: opts } as Question)
      : q.type === 'scale'
        ? ({ id, type: 'likert', text, scale: opts } as Question)
        : ({ id, type: 'single_choice', text, options: opts } as Question);
  if (q.type === 'battery') for (const [id, lab] of q.items!) QS.push(base(id, `${q.text} — ${lab}`));
  else QS.push(base(q.id, q.text));
}
const plan = { domain: 'political', kind: 'survey', title: 'ΠΑΣΟΚ demo — έλεγχος βαθμίδων', researchQuestion: 'Πανελλαδική πολιτική έρευνα', questions: QS, assumptions: [],
  audience: { minAge: 17 }, sampleSize: 500, warnings: [], plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10, engine: 'persona',
  personaModelVersion: 'pie-0.7', personaAutoLink: true } as unknown as StudyPlan;
const run = runPersonaSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: 20261030, save: false, stabilityRuns: 1 });
const tiers = run.aggregates.map((a) => {
  const t = (a.persona?.provenance as { evidenceTier?: { tier: number; specialist?: string; domain?: string; reason?: string } } | undefined)?.evidenceTier;
  return { questionId: a.questionId, tier: t?.tier ?? null, domain: t?.domain ?? null, reason: (t as { reason?: string } | undefined)?.reason ?? null };
});
writeFileSync(process.argv[2], JSON.stringify({ model: 'pie-0.7', status: run.status, n: run.respondents.length, tiers, warnings: run.warnings }, null, 1));
const c: Record<string, number> = {};
for (const t of tiers) c[String(t.tier)] = (c[String(t.tier)] || 0) + 1;
console.log(run.status, run.respondents.length, JSON.stringify(c));
