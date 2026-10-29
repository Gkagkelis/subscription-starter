// PHASE6 E2E: μικτό ελληνικό ερωτηματολόγιο (πολιτικό + κοινωνικό + καταναλωτικό) στο πραγματικό runtime με pie-0.7.
// Ελέγχει: ακριβές N, αναπαραγωγιμότητα σπόρου, κανόνα παράλειψης, συνέπεια προσώπου μεταξύ ερωτήσεων, βαθμίδες/αποχή, χρόνο.
//   npx tsx scripts/synthetic-lab/persona/e2e_phase6.ts [out.json]
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { runPersonaSurvey } from '../../../lib/synthetic-lab/persona/survey';
import { loadScenario } from '../../../lib/synthetic-lab/persona/vote';
import { CALIBRATED_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const out = process.argv[2] || '/dev/null';
const smoke = path.join(process.cwd(), '.synthetic-lab-data', 'gpm', 'v1', 'e2e-iqge-links.json'); // iqge.py --international-lake (Phase 5)
let iq: Record<string, Question['personaLink']> = {};
try {
  iq = Object.fromEntries((JSON.parse(readFileSync(smoke, 'utf8')).questions as Question[]).map((q) => [q.id, q.personaLink]));
} catch {
  /* χωρίς το προϋπολογισμένο IQGE οι αντίστοιχες ερωτήσεις μένουν χωρίς σύνδεση (αποχή) */
}
const yn = { Ναι: ['1'], Όχι: ['2'] };
const sc = loadScenario('2026-10')!;
const QS: Question[] = [
  { id: 'vote', type: 'single_choice', text: 'Αν είχαμε εκλογές την επόμενη Κυριακή, ποιο κόμμα θα ψηφίζατε;', options: [...sc.parties.map((p) => p.label), 'Αποχή'],
    personaLink: { kind: 'direct', optionMap: {}, vote: { scenario: '2026-10', optionParty: Object.fromEntries(sc.parties.map((p) => [p.label, p.key])), abstainOption: 'Αποχή' } } },
  { id: 'trust', type: 'single_choice', text: 'Θα λέγατε ότι οι περισσότεροι άνθρωποι είναι άξιοι εμπιστοσύνης;', options: ['Άξιοι εμπιστοσύνης', 'Προσοχή'],
    personaLink: { kind: 'direct', itemId: 'dn2024c::Q19', optionMap: { 'Άξιοι εμπιστοσύνης': ['1'], Προσοχή: ['2'] } } },
  { id: 'recycle', type: 'single_choice', text: 'Κάνετε ανακύκλωση;', options: ['Ναι', 'Όχι'], personaLink: { kind: 'direct', itemId: 'dn2024a::Q5_1', optionMap: yn } },
  { id: 'recycle_why', type: 'single_choice', text: 'Πόσο συχνά;', options: ['Πάντα', 'Μερικές φορές'], followUpOf: { questionId: 'recycle', whenAnswerIn: ['Ναι'] } },
  { id: 'econ', type: 'single_choice', text: 'Πώς κρίνετε την οικονομική κατάσταση του νοικοκυριού σας;', options: ['Πολύ καλή', 'Καλή', 'Κακή', 'Πολύ κακή'],
    personaLink: { kind: 'direct', optionMap: {}, anchor: { name: 'econ4', optionMap: { 'Πολύ καλή': ['1'], Καλή: ['2'], Κακή: ['3'], 'Πολύ κακή': ['4'] } } } },
  { id: 'grocery', type: 'single_choice', text: 'Πόσο συχνά ψωνίζετε σε σούπερ μάρκετ;', options: ['Καθημερινά', 'Εβδομαδιαία', 'Σπανιότερα'] },
  { id: 'mobile', type: 'likert', text: 'Πόσο ικανοποιημένος είστε από τον πάροχο κινητής σας;', scale: ['Πολύ', 'Αρκετά', 'Λίγο', 'Καθόλου'],
    brandLink: { category: 'telecom', brand: 'Πάροχος Χ', measure: 'satisfaction' } },
  { id: 'streaming', type: 'multiple_choice', text: 'Σε ποιες υπηρεσίες streaming έχετε συνδρομή;', options: ['Netflix', 'Disney+', 'Καμία'] },
  { id: 'trust_sci', type: 'likert', text: 'How much do you trust scientists working in universities in your country?', scale: ['A lot', 'Some', 'Not much', 'Not at all'], personaLink: iq.q1 },
  { id: 'recycle_freq', type: 'single_choice', text: 'How often do you separate your household waste for recycling?', options: ['Always', 'Often', 'Sometimes', 'Never'], personaLink: iq.q2 },
  { id: 'online', type: 'single_choice', text: 'In the last 12 months, did you buy goods or services online?', options: ['Yes', 'No'],
    personaLink: iq.q4 ? { ...iq.q4, iqge: { ...iq.q4.iqge!, lake: 'international' } } : undefined }
];
const plan = (n: number, allowExperimental: boolean) => ({ domain: 'consumer', kind: 'survey', title: 'PHASE6 μικτό', researchQuestion: 'Μικτό ερωτηματολόγιο', questions: QS, assumptions: [], audience: { minAge: 18 },
  sampleSize: n, warnings: [], plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10, engine: 'persona', personaModelVersion: 'pie-0.7',
  personaAutoLink: false, allowExperimental }) as unknown as StudyPlan;

const res: Record<string, unknown>[] = [];
for (const allowExperimental of [false, true]) for (const n of [100, 500, 1000]) for (const s of [11, 22]) {
  const t0 = Date.now();
  const run = runPersonaSurvey({ plan: plan(n, allowExperimental), populationId: CALIBRATED_POPULATION_ID, seed: s, save: false, stabilityRuns: 1 });
  const ms = Date.now() - t0;
  const again = runPersonaSurvey({ plan: plan(n, allowExperimental), populationId: CALIBRATED_POPULATION_ID, seed: s, save: false, stabilityRuns: 1 });
  const same = JSON.stringify(run.respondents.map((r) => r.answers)) === JSON.stringify(again.respondents.map((r) => r.answers));
  const tiers = Object.fromEntries(run.aggregates.map((a) => [a.questionId, (a.persona?.provenance as { evidenceTier?: { tier: number } } | undefined)?.evidenceTier?.tier ?? null]));
  const answered = Object.fromEntries(QS.map((q) => [q.id, run.respondents.filter((r) => !r.answers.find((x) => x.questionId === q.id)?.skipped).length]));
  // κανόνας παράλειψης: recycle_why μόνο όταν recycle = Ναι
  const skipOk = run.respondents.every((r) => {
    const a = r.answers.find((x) => x.questionId === 'recycle')?.value as { choice?: string } | null;
    const b = r.answers.find((x) => x.questionId === 'recycle_why');
    return a?.choice === 'Ναι' ? true : !!b?.skipped;
  });
  // συνέπεια: ίδιο πρόσωπο σε όλες τις απαντήσεις (μία εγγραφή ανά ερωτώμενο, όλες οι ερωτήσεις)
  const consistent = run.respondents.every((r) => r.answers.length === QS.length);
  res.push({ allowExperimental, n, seed: s, exactN: run.respondents.length === n, reproducible: same, skipOk, consistent, ms, tiers, answered, warnings: run.warnings.filter((w) => /Βαθμίδες|ΠΕΙΡΑΜΑΤΙΚ|επαρκής/.test(w)) });
}
writeFileSync(out, JSON.stringify(res, null, 1));
for (const r of res) console.log(JSON.stringify({ ...r, warnings: undefined }));
console.log((res[0].warnings as string[]).join('\n'));
