// ============================================================
// SCENARIO COMPARISON ENGINE
//
// Ίδιο δείγμα (common random numbers: ίδιο seed επιλογής) και ίδιο
// ερωτηματολόγιο για κάθε σενάριο, ώστε οι διαφορές να οφείλονται στο σενάριο
// και όχι στο δείγμα. Περιλαμβάνει (ιδέα synthetic-society "arena", MIT):
// άμεση σύγκριση όλων των σεναρίων σε μία ερώτηση με ανακατεμένη σειρά.
// Οι επιλογές ΔΕΝ είναι μερίδια αγοράς.
// ============================================================

import type { LiveModelId } from '../ai/config';
import { createRng, deriveSeed } from '../rng';
import { quantile, round } from '../stats';
import { newId, saveDoc, loadDoc, listDocs } from '../storage/file-store';
import type { Assumption, EngineMode, Question, QuestionAggregate, StudyPlan, StudyRun } from '../types';
import { ASSUMPTION_IDS } from './assumptions';
import { checkText } from './guardrails';
import { runSurvey } from './survey';

export interface ScenarioInput {
  id: string;
  label: string;
  description: string;
  price?: number | null;
  quality?: number | null;
}

export interface ScenarioComparison {
  id: string;
  createdAt: string;
  status: 'completed' | 'blocked' | 'cancelled';
  title: string;
  domain: StudyPlan['domain'];
  scenarios: ScenarioInput[];
  runIds: string[];
  seed: number;
  mode: EngineMode;
  populationId: string;
  keyQuestionId: string;
  table: {
    questionId: string;
    questionText: string;
    values: { scenarioId: string; headline: number | null; meanScore: number | null }[];
  }[];
  pairwise: { a: string; b: string; diff: number; ciLow: number; ciHigh: number }[];
  preference: QuestionAggregate | null;
  sensitivity: { setting: string; ranking: string[]; headlines: Record<string, number> }[];
  robustRanking: boolean;
  warnings: string[];
  validationMessage: string;
  costUsd: number;
}

function headline(run: StudyRun, qid: string): { headline: number | null; meanScore: number | null } {
  const agg = run.aggregates.find((a) => a.questionId === qid);
  const q = run.plan.questions.find((x) => x.id === qid);
  if (!agg || !q) return { headline: null, meanScore: null };
  if (agg.shares && (q.type === 'likert' || q.type === 'concept_test')) {
    const k = agg.shares.length;
    return { headline: round(agg.shares.slice(k - 2).reduce((s, x) => s + x.share, 0), 1), meanScore: agg.meanScore ?? null };
  }
  if (agg.priceCurve?.length) return { headline: agg.priceCurve[Math.floor(agg.priceCurve.length / 2)].acceptance, meanScore: null };
  if (agg.shares?.length) return { headline: Math.max(...agg.shares.map((s) => s.share)), meanScore: null };
  return { headline: null, meanScore: null };
}

/** Top-2-box ανά ερωτώμενο για ζευγαρωτή σύγκριση. */
function top2(run: StudyRun, qid: string, k: number): Map<string, number> {
  const m = new Map<string, number>();
  run.respondents.forEach((r) => {
    const a = r.answers.find((x) => x.questionId === qid);
    if (a && !a.skipped && a.value?.scaleIndex !== undefined) m.set(r.personaId, a.value.scaleIndex >= k - 2 ? 1 : 0);
  });
  return m;
}

function pairedBootstrap(a: Map<string, number>, b: Map<string, number>, weights: Map<string, number>, seed: number, B = 400) {
  const ids = Array.from(a.keys()).filter((id) => b.has(id));
  const rng = createRng(seed);
  const stat = (sample: string[]) => {
    let num = 0;
    let den = 0;
    sample.forEach((id) => {
      const w = weights.get(id) || 1;
      num += w * (a.get(id)! - b.get(id)!);
      den += w;
    });
    return den ? (num / den) * 100 : 0;
  };
  const diff = stat(ids);
  const boots: number[] = [];
  for (let i = 0; i < B; i++) boots.push(stat(ids.map(() => ids[rng.int(ids.length)])));
  boots.sort((x, y) => x - y);
  return { diff: round(diff, 1), ciLow: round(quantile(boots, 0.025), 1), ciHigh: round(quantile(boots, 0.975), 1) };
}

export async function compareScenarios(o: {
  basePlan: StudyPlan;
  scenarios: ScenarioInput[];
  populationId: string;
  seed?: number;
  mode?: EngineMode;
  model?: LiveModelId;
  costCapUsd?: number;
  sensitivity?: boolean;
}): Promise<ScenarioComparison> {
  const id = newId('scn');
  const seed = o.seed ?? (Date.now() % 1_000_000);
  const mode = o.mode || 'demo';
  const scenarios = o.scenarios.filter((s) => s.label.trim()).slice(0, 5);
  const warnings: string[] = [];
  const blocked = scenarios.map((s) => checkText(`${s.label} ${s.description}`, 'scenario')).filter((g) => !g.allowed);
  const base: ScenarioComparison = {
    id,
    createdAt: new Date().toISOString(),
    status: 'completed',
    title: o.basePlan.title,
    domain: o.basePlan.domain,
    scenarios,
    runIds: [],
    seed,
    mode,
    populationId: o.populationId,
    keyQuestionId: '',
    table: [],
    pairwise: [],
    preference: null,
    sensitivity: [],
    robustRanking: false,
    warnings,
    validationMessage: '',
    costUsd: 0
  };
  if (scenarios.length < 2) throw new Error('Χρειάζονται τουλάχιστον δύο σενάρια.');
  if (blocked.length) {
    base.status = 'blocked';
    warnings.push(...blocked.flatMap((b) => b.blockedReasons));
    saveDoc('scenarios', id, base);
    return base;
  }

  // Ερωτήσεις ανά σενάριο: ό,τι ορίζει το σχέδιο, χωρίς ερωτήσεις σύγκρισης/τιμών
  // συγκεκριμένης τιμής (η τιμή είναι μέρος του σεναρίου).
  const perScenarioQs: Question[] = o.basePlan.questions.filter(
    (q) => q.type !== 'product_comparison' && q.type !== 'price_test' && !/\d\s*€/.test(q.text)
  );
  const keyQ = perScenarioQs.find((q) => q.type === 'likert' && !q.evidenceLink) || perScenarioQs.find((q) => q.type === 'concept_test');
  if (!keyQ) throw new Error('Το σχέδιο χρειάζεται τουλάχιστον μία ερώτηση κλίμακας για σύγκριση.');
  base.keyQuestionId = keyQ.id;

  const runs: StudyRun[] = [];
  for (const sc of scenarios) {
    const plan: StudyPlan = {
      ...o.basePlan,
      title: `${o.basePlan.title} — ${sc.label}`,
      questions: perScenarioQs.map((q) => ({ ...q, text: q.text.replace(/«[^»]*»/, `«${sc.label}: ${sc.description || sc.label}»`) })),
      warnings: []
    };
    const run = await runSurvey({
      plan,
      populationId: o.populationId,
      seed, // ίδιο seed => ίδιο δείγμα
      mode,
      model: o.model,
      costCapUsd: o.costCapUsd ? o.costCapUsd / (scenarios.length + 1) : undefined,
      scenario: { id: sc.id, label: sc.label, price: sc.price ?? null, quality: sc.quality ?? null },
      stimulus: `${sc.label}: ${sc.description}${sc.price != null ? ` — τιμή ${sc.price}€` : ''}`,
      stabilityRuns: 0
    });
    runs.push(run);
    base.costUsd += run.cost.usd;
    if (run.status !== 'completed') warnings.push(`Σενάριο «${sc.label}»: κατάσταση ${run.status}.`);
  }
  base.runIds = runs.map((r) => r.id);
  warnings.push(...Array.from(new Set(runs.flatMap((r) => r.warnings))));

  base.table = perScenarioQs
    .filter((q) => q.type !== 'open_ended')
    .map((q) => ({
      questionId: q.id,
      questionText: q.text.replace(/«[^»]*»/, '«…»'),
      values: runs.map((r, i) => ({ scenarioId: scenarios[i].id, ...headline(r, q.id) }))
    }));

  // Ζευγαρωτές διαφορές στη βασική ερώτηση (ίδιοι ερωτώμενοι).
  const k = (keyQ.scale || [1, 2, 3, 4, 5]).length;
  const t2 = runs.map((r) => top2(r, keyQ.id, k));
  const w = new Map(runs[0].respondents.map((r) => [r.personaId, r.weight]));
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++)
      base.pairwise.push({ a: scenarios[i].id, b: scenarios[j].id, ...pairedBootstrap(t2[i], t2[j], w, deriveSeed(seed, 'boot', i, j)) });

  // Άμεση σύγκριση (arena): μία ερώτηση με όλα τα σενάρια.
  const prefPlan: StudyPlan = {
    ...o.basePlan,
    title: `${o.basePlan.title} — άμεση σύγκριση`,
    questions: [
      {
        id: 'pref',
        type: 'product_comparison',
        text: 'Αν έπρεπε να διαλέξετε ένα από τα παρακάτω, ποιο θα προτιμούσατε;',
        products: scenarios.map((s) => ({ id: s.id, label: s.label, price: s.price ?? null, quality: s.quality ?? null, description: s.description }))
      }
    ],
    warnings: []
  };
  const prefRun = await runSurvey({ plan: prefPlan, populationId: o.populationId, seed, mode, model: o.model, costCapUsd: o.costCapUsd ? o.costCapUsd / (scenarios.length + 1) : undefined, stabilityRuns: 0 });
  base.preference = prefRun.aggregates[0] || null;
  base.runIds.push(prefRun.id);
  base.costUsd = round(base.costUsd + prefRun.cost.usd, 4);

  // Ευαισθησία στις παραδοχές (μόνο demo — χωρίς κόστος).
  if (mode === 'demo' && o.sensitivity !== false) {
    const settings: { setting: string; patch: (a: Assumption[]) => Assumption[] }[] = [
      { setting: 'Προεπιλεγμένες παραδοχές', patch: (a) => a },
      { setting: 'Χωρίς ευαισθησία τιμής ανά εισόδημα', patch: (a) => a.map((x) => (x.id === ASSUMPTION_IDS.priceIncome ? { ...x, enabled: false } : x)) },
      { setting: 'Διπλάσια ευαισθησία τιμής', patch: (a) => a.map((x) => (x.id === ASSUMPTION_IDS.priceIncome ? { ...x, enabled: true, strength: 2 } : x)) },
      { setting: 'Τιμή αναφοράς −20%', patch: (a) => a.map((x) => (x.id === ASSUMPTION_IDS.referencePrice && x.value ? { ...x, value: x.value * 0.8 } : x)) },
      { setting: 'Τιμή αναφοράς +20%', patch: (a) => a.map((x) => (x.id === ASSUMPTION_IDS.referencePrice && x.value ? { ...x, value: x.value * 1.2 } : x)) }
    ];
    for (const st of settings) {
      const plan: StudyPlan = { ...prefPlan, assumptions: st.patch(o.basePlan.assumptions) };
      const r = await runSurvey({ plan, populationId: o.populationId, seed, mode: 'demo', save: false, stabilityRuns: 0 });
      const shares = r.aggregates[0]?.shares || [];
      const headlines: Record<string, number> = {};
      shares.forEach((s) => (headlines[s.option] = s.share));
      base.sensitivity.push({ setting: st.setting, ranking: [...shares].sort((a, b) => b.share - a.share).map((s) => s.option), headlines });
    }
    // Η πρώτη θέση θεωρείται ότι «αλλάζει» μόνο αν ο νέος πρώτος ξεπερνά τον
    // αρχικό πρώτο πέρα από τον θόρυβο της προσομοίωσης (2 τυπικά σφάλματα διαφοράς).
    const leader = base.sensitivity[0].ranking[0];
    const nResp = base.preference?.effectiveN || o.basePlan.sampleSize;
    base.robustRanking = base.sensitivity.every((s) => {
      const top = s.headlines[s.ranking[0]] / 100;
      const lead = s.headlines[leader] / 100;
      const se = Math.sqrt((top * (1 - top) + lead * (1 - lead)) / Math.max(1, nResp));
      return s.ranking[0] === leader || top - lead <= 2 * se;
    });
  }

  warnings.push('Οι προσομοιωμένες επιλογές ΔΕΝ είναι μερίδια αγοράς ούτε πρόβλεψη πωλήσεων.');
  if (o.basePlan.domain === 'social_policy') warnings.push('Ουδέτερη σύγκριση υποθετικών πολιτικών — όχι μέτρηση κοινής γνώμης.');
  base.validationMessage = 'Η συγκεκριμένη προσομοίωση δεν έχει ακόμη επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα';
  base.warnings = Array.from(new Set(warnings));
  saveDoc('scenarios', id, base);
  return base;
}

export function loadComparison(id: string) {
  return loadDoc<ScenarioComparison>('scenarios', id);
}
export function listComparisons() {
  return listDocs<ScenarioComparison>('scenarios');
}
