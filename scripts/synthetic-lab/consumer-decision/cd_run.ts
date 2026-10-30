// Consumer Decision Study — εκτέλεση του ερωτηματολογίου στον κινητήρα PIE του Lab (χωρίς αλλαγή παραγωγής, save:false).
// Γράφει ΑΤΟΜΙΚΕΣ απαντήσεις (ανά συνθετικό καταναλωτή) και, ανά ερώτηση, την απόφαση τεκμηρίωσης (βαθμίδα, αποχή, ειδικό
// μοντέλο, πηγές). Τα ποσοστά υπολογίζονται εκ των υστέρων ΜΟΝΟ από τις ατομικές απαντήσεις.
//   tsx scripts/synthetic-lab/consumer-decision/cd_run.ts <plan.json> <model> <autolink:0|1> <allowExperimental:0|1> <n> <seed> <out.json>
import { readFileSync, writeFileSync } from 'fs';
import { deriveSeed } from '../../../lib/synthetic-lab/rng';
import { buildPanel } from '../../../lib/synthetic-lab/persona/panel';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const [planPath, model, auto, exp, nStr, seedStr, out] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(planPath, 'utf8'));
const QS: Question[] = doc.questions.map((q: Question & Record<string, unknown>) => {
  const { section, short, scenario, parent, item, task, offerA, offerB, ...rest } = q;
  void section; void short; void scenario; void parent; void item; void task; void offerA; void offerB;
  return rest as Question;
});
const seed = Number(seedStr);
const n = Number(nStr);
const plan = {
  domain: 'consumer', kind: 'survey', title: doc.title, researchQuestion: 'Repair, replace or upgrade — consumer decision study', questions: QS, assumptions: [],
  audience: { minAge: 18 }, sampleSize: n, warnings: [], plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10,
  engine: 'persona', personaModelVersion: model, personaAutoLink: auto === '1', allowExperimental: exp === '1'
} as unknown as StudyPlan;
const t0 = Date.now();
const run = runPersonaSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed, save: false, stabilityRuns: 1 });
// ίδιο πάνελ με αυτό που χρησιμοποίησε η εκτέλεση (ίδιος παράγων σπόρος) — για τα χαρακτηριστικά των καταναλωτών
const panel = buildPanel({ modelVersion: model, populationId: CALIBRATED_POPULATION_ID, size: n, seed: deriveSeed(seed, 'panel'), audience: { minAge: 18 }, save: false });
const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
const byId = new Map(pop.personas.map((p) => [p.id, p]));
const samePanel = panel.personas.map((p) => p.personaId).join() === run.respondents.map((r) => r.personaId).join();
const consumers = panel.personas.map((ps) => {
  const p = byId.get(ps.personaId)!;
  return { personaId: ps.personaId, weight: ps.weight, gender: p.gender, ageBand: ps.demographics.age_band, edu3: ps.demographics.edu3, region: p.regionName,
    nuts1: ps.demographics.nuts1, settlement: p.settlement, householdType: p.householdType, householdSize: p.householdSize, incomeQuintile: p.incomeQuintile,
    anchors: ps.anchors };
});
const answers = run.respondents.map((r) => ({
  personaId: r.personaId,
  answers: Object.fromEntries(QS.map((q) => {
    const a = r.answers.find((x) => x.questionId === q.id);
    if (!a) return [q.id, { status: 'missing' }];
    if (a.skipped) return [q.id, { status: 'skipped' }];
    const v = (a.value || {}) as { choice?: string; choices?: string[]; scaleIndex?: number };
    const opts = q.type === 'likert' ? q.scale || [] : q.options || [];
    const picked = v.choice != null ? [v.choice] : v.choices ? v.choices : v.scaleIndex != null && v.scaleIndex >= 0 ? [opts[v.scaleIndex]] : [];
    return [q.id, picked.length ? { status: 'answered', value: picked } : { status: 'not_estimated' }];
  }))
}));
const decisions = QS.map((q, i) => {
  const a = run.aggregates[i];
  const prov = (a.persona?.provenance || {}) as Record<string, unknown>;
  const ev = prov.evidenceTier as Record<string, unknown> | undefined;
  const iq = prov.iqge as Record<string, unknown> | null | undefined;
  return { qid: q.id, support: a.persona?.support || null, reason: (a.persona?.reason || '').slice(0, 600), tier: ev?.tier ?? null, abstain: ev?.abstain ?? null,
    domain: ev?.domain ?? null, specialist: ev?.specialist ?? null, expectedMAE: ev?.expectedMAE ?? null, sources: ev?.sources ?? null, limitations: ev?.limitations ?? null,
    responseModel: prov.responseModel || null, autoLink: prov.autoLink || null, iqgeTier: iq?.tier ?? null, iqgeMatches: iq?.matches ?? iq?.evidence ?? null };
});
writeFileSync(out, JSON.stringify({ model, autolink: auto === '1', allowExperimental: exp === '1', n, seed, ms: Date.now() - t0, engineVersion: run.engine.engineVersion,
  samePanel, warnings: run.warnings, decisions, consumers, answers }, null, 1));
console.log(model, `autolink=${auto} experimental=${exp}`, 'samePanel', samePanel, '·', decisions.map((d) => `${d.qid}:${d.tier ?? '-'}${d.abstain ? 'x' : ''}`).join(' '));
