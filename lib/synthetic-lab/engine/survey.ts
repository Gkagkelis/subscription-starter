// ============================================================
// Synthetic survey engine.
// ============================================================

import { liveConfig, type LiveModelId } from '../ai/config';
import { BudgetExceededError, finishRun, mapWithConcurrency, registerRun, RunCancelledError, StudyBudget } from '../ai/live';
import { latestWave, NORAYA_DATASET_ID } from '../data/noraya';
import { loadPopulation, selectRespondents } from '../population/store';
import { deriveSeed } from '../rng';
import { round, sd, mean } from '../stats';
import { newId, saveDoc } from '../storage/file-store';
import {
  SIMULATED_LABEL,
  type EngineMode,
  type Persona,
  type Question,
  type StabilityResult,
  type StudyPlan,
  type StudyRun,
  type SyntheticAnswer,
  type SyntheticRespondent
} from '../types';
import { aggregateQuestion } from './aggregate';
import { DEMO_ENGINE_VERSION, demoRespond, type ResponderContext } from './demo-responder';
import { checkQuestionnaire } from './guardrails';
import { LLM_PROMPT_VERSION, llmRespond } from './llm-responder';
import { FIT_WARNING_PP, fitPriorModel, PRIOR_MODEL_VERSION, type PriorFit } from './prior-model';
import { validationSummaryForQuestions } from './validation';

export const NOT_VALIDATED_MESSAGE =
  'Η συγκεκριμένη προσομοίωση δεν έχει ακόμη επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα';

export interface RunSurveyOptions {
  plan: StudyPlan;
  populationId: string;
  seed?: number;
  mode?: EngineMode;
  model?: LiveModelId;
  costCapUsd?: number;
  scenario?: ResponderContext['scenario'];
  stimulus?: string | null;
  runId?: string;
  save?: boolean;
  stabilityRuns?: number;
}

/** Fit των empirical priors για όσες ερωτήσεις συνδέονται με δείκτη. */
export function fitPriorsForQuestions(questions: Question[], personas: Persona[]): { fits: Record<string, PriorFit>; warnings: string[] } {
  const fits: Record<string, PriorFit> = {};
  const warnings: string[] = [];
  const metrics = Array.from(new Set(questions.map((q) => q.evidenceLink?.metric).filter((m): m is string => !!m)));
  for (const m of metrics) {
    const wave = latestWave(m);
    if (!wave) {
      warnings.push(`Ο δείκτης ${m} δεν έχει διαθέσιμο κύμα· η ερώτηση απαντάται χωρίς εμπειρική βάση.`);
      continue;
    }
    const fit = fitPriorModel(m, wave, personas);
    fits[m] = fit;
    const age = new Date().getFullYear() - wave.year;
    if (age >= 2) warnings.push(`Το εμπειρικό prior «${m}» είναι από το κύμα ${wave.key} (${age} έτη πριν).`);
    if (!fit.converged || fit.maxFitErrorPp > FIT_WARNING_PP) {
      warnings.push(
        `Το μοντέλο για «${m}» αποκλίνει έως ${fit.maxFitErrorPp.toFixed(1)} π.μ. από τα παρατηρημένα ποσοστά (ασυμβατότητα δομής πληθυσμού 2015 με το δείγμα της έρευνας).`
      );
    }
  }
  return { fits, warnings };
}

function applyFollowUps(questions: Question[], answers: SyntheticAnswer[]): SyntheticAnswer[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return answers.map((a) => {
    const q = questions.find((x) => x.id === a.questionId);
    if (!q?.followUpOf) return a;
    const prev = byId.get(q.followUpOf.questionId);
    const pq = questions.find((x) => x.id === q.followUpOf!.questionId);
    const v = prev?.value;
    const given = v?.choice ?? (v?.scaleIndex !== undefined && pq ? (pq.scale || ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'])[v.scaleIndex] : undefined);
    if (given !== undefined && q.followUpOf.whenAnswerIn.includes(given)) return a;
    return { questionId: a.questionId, value: null, skipped: true, basis: a.basis };
  });
}

export async function runSurvey(o: RunSurveyOptions): Promise<StudyRun> {
  const t0 = Date.now();
  const runId = o.runId || newId('study');
  const seed = o.seed ?? (Date.now() % 1_000_000);
  const mode: EngineMode = o.mode || 'demo';
  const cfg = liveConfig();
  const model = (o.model || cfg.defaultModel) as LiveModelId;
  const pop = loadPopulation(o.populationId);
  if (!pop) throw new Error('Ο πληθυσμός δεν βρέθηκε.');

  const base: Omit<StudyRun, 'status' | 'respondents' | 'aggregates' | 'respondentCount' | 'durationMs' | 'completedAt' | 'validation' | 'datasetsUsed'> = {
    id: runId,
    createdAt: new Date().toISOString(),
    plan: o.plan,
    populationId: o.populationId,
    populationSummary: pop.summary,
    engine: {
      mode,
      engineVersion: mode === 'demo' ? `${DEMO_ENGINE_VERSION}+${PRIOR_MODEL_VERSION}` : `${LLM_PROMPT_VERSION}+${PRIOR_MODEL_VERSION}`,
      model: mode === 'live' ? model : null
    },
    seed,
    cost: { mode, model: mode === 'live' ? model : null, inputTokens: 0, outputTokens: 0, usd: 0, capUsd: mode === 'live' ? o.costCapUsd ?? cfg.costCapUsd : 0, calls: 0 },
    warnings: [...o.plan.warnings]
  };

  const guard = checkQuestionnaire(o.plan.researchQuestion, o.plan.questions);
  if (!guard.allowed) {
    const blocked: StudyRun = {
      ...base,
      status: 'blocked',
      completedAt: new Date().toISOString(),
      respondents: [],
      aggregates: [],
      respondentCount: 0,
      durationMs: Date.now() - t0,
      warnings: [...base.warnings, ...guard.blockedReasons],
      datasetsUsed: [],
      validation: { status: 'not_applicable', message: 'Η μελέτη δεν εκτελέστηκε.', linkedMetrics: [], backtestIds: [] }
    };
    if (o.save !== false) saveDoc('studies', runId, blocked);
    return blocked;
  }
  base.warnings.push(...guard.warnings);
  if (pop.summary.isDevFixture) base.warnings.unshift(pop.summary.updateStatus.message);
  else if (!pop.summary.updateStatus.calibrated) base.warnings.push(pop.summary.updateStatus.message);

  let n = o.plan.sampleSize;
  if (mode === 'live' && n > cfg.maxAgents) {
    base.warnings.push(`Live mode: ο αριθμός συνθετικών ερωτώμενων περιορίστηκε σε ${cfg.maxAgents}.`);
    n = cfg.maxAgents;
  }
  const sel = selectRespondents(pop, o.plan.audience, n, deriveSeed(seed, 'sample'));
  base.warnings.push(...sel.warnings);

  const { fits, warnings: fitWarnings } = fitPriorsForQuestions(o.plan.questions, pop.personas);
  base.warnings.push(...fitWarnings);
  const ctx: ResponderContext = { seed, assumptions: o.plan.assumptions, priorFits: fits, scenario: o.scenario || null };

  let respondents: SyntheticRespondent[] = [];
  let status = 'completed' as StudyRun['status'];
  const budget = new StudyBudget(base.cost.capUsd, sel.respondents.length, model);

  if (mode === 'demo') {
    respondents = sel.respondents.map((p): SyntheticRespondent => ({
      personaId: p.id,
      weight: p.weight,
      label: SIMULATED_LABEL,
      answers: applyFollowUps(o.plan.questions, demoRespond(p, o.plan.questions, ctx))
    }));
  } else {
    const ctrl = registerRun(runId);
    try {
      const results = await mapWithConcurrency(sel.respondents, cfg.maxConcurrency, async (p) => {
        if (ctrl.signal.aborted || status !== 'completed') return null;
        try {
          const r = await llmRespond({
            runId,
            persona: p,
            questions: o.plan.questions,
            priorFits: fits,
            stimulus: o.stimulus || null,
            model,
            budget,
            signal: ctrl.signal,
            seed
          });
          budget.completedUnits++;
          return { personaId: p.id, weight: p.weight, label: SIMULATED_LABEL, answers: applyFollowUps(o.plan.questions, r.answers), costUsd: r.usd } as SyntheticRespondent;
        } catch (e) {
          if (e instanceof BudgetExceededError) {
            status = 'cancelled';
            base.warnings.push(e.message);
            return null;
          }
          if (e instanceof RunCancelledError) {
            status = 'cancelled';
            return null;
          }
          base.warnings.push(`Σφάλμα κλήσης AI για ένα προφίλ: ${String((e as Error)?.message || e).slice(0, 160)}`);
          return null;
        }
      });
      respondents = results.filter((x): x is SyntheticRespondent => !!x);
    } finally {
      finishRun(runId);
    }
    if (status === 'cancelled') base.warnings.push(`Η εκτέλεση σταμάτησε· διατηρούνται ${respondents.length} μερικές απαντήσεις.`);
  }

  const personaMap = new Map(sel.respondents.map((p) => [p.id, p]));
  const aggregates = o.plan.questions.map((q) => aggregateQuestion(q, respondents, personaMap));

  let stability: StabilityResult | null = null;
  if (mode === 'demo' && (o.stabilityRuns ?? 5) > 1) {
    stability = stabilityCheck(o, pop.personas, sel.respondents.length, fits, o.stabilityRuns ?? 5, seed);
  }

  const validation = validationSummaryForQuestions(o.plan.questions, mode);
  const datasetsUsed = [pop.summary.datasetId];
  if (Object.keys(fits).length) datasetsUsed.push(NORAYA_DATASET_ID);

  const run: StudyRun = {
    ...base,
    status,
    completedAt: new Date().toISOString(),
    respondents,
    aggregates,
    respondentCount: respondents.length,
    durationMs: Date.now() - t0,
    cost: { ...base.cost, inputTokens: budget.inputTokens, outputTokens: budget.outputTokens, usd: round(budget.spent, 4), calls: budget.calls },
    datasetsUsed,
    validation,
    stability,
    warnings: Array.from(new Set(base.warnings))
  };
  if (o.save !== false) saveDoc('studies', runId, run);
  return run;
}

/**
 * Σταθερότητα επαναλαμβανόμενων εκτελέσεων (demo): ίδιο ερωτηματολόγιο,
 * διαφορετικά seeds δειγματοληψίας/απαντήσεων. Μετρά τη διασπορά του
 * ποσοστού κάθε επιλογής. Δείχνει τη θορυβώδη συνιστώσα, ΟΧΙ την ακρίβεια.
 */
function stabilityCheck(
  o: RunSurveyOptions,
  _all: Persona[],
  n: number,
  fits: Record<string, PriorFit>,
  runs: number,
  seed: number
): StabilityResult {
  const pop = loadPopulation(o.populationId)!;
  const seeds = Array.from({ length: runs }, (_, i) => deriveSeed(seed, 'stability', i));
  const perRun = seeds.map((s) => {
    const sel = selectRespondents(pop, o.plan.audience, n, deriveSeed(s, 'sample'));
    const ctx: ResponderContext = { seed: s, assumptions: o.plan.assumptions, priorFits: fits, scenario: o.scenario || null };
    const rs = sel.respondents.map((p): SyntheticRespondent => ({ personaId: p.id, weight: p.weight, label: SIMULATED_LABEL, answers: applyFollowUps(o.plan.questions, demoRespond(p, o.plan.questions, ctx)) }));
    const pm = new Map(sel.respondents.map((p) => [p.id, p]));
    return o.plan.questions.map((q) => aggregateQuestion(q, rs, pm));
  });
  const perQuestion: StabilityResult['perQuestion'] = [];
  o.plan.questions.forEach((q, qi) => {
    const opts = perRun[0][qi].shares?.map((s) => s.option) || perRun[0][qi].priceCurve?.map((c) => String(c.price)) || [];
    opts.forEach((opt, oi) => {
      const vals = perRun.map((r) => r[qi].shares?.[oi]?.share ?? r[qi].priceCurve?.[oi]?.acceptance ?? NaN).filter((v) => !Number.isNaN(v));
      if (!vals.length) return;
      perQuestion.push({ questionId: q.id, option: opt, mean: round(mean(vals), 1), sd: round(sd(vals), 2), min: round(Math.min(...vals), 1), max: round(Math.max(...vals), 1) });
    });
  });
  return { runs, seeds, perQuestion, maxSd: perQuestion.reduce((m, x) => Math.max(m, x.sd), 0) };
}
