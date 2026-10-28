// ============================================================
// Synthetic survey engine.
// ============================================================

import { liveConfig, type LiveModelId } from '../ai/config';
import { BudgetExceededError, finishRun, mapWithConcurrency, registerRun, RunCancelledError, StudyBudget } from '../ai/live';
import { getMetric, latestWaveFor, metricDatasetId, metricSourceLabel, metricTier, type EvidenceContext } from '../data/noraya';
import { expandHoldout, holdoutDerivedYears, lakeStudy } from '../data/lake';
import { BASELINE_POPULATION_ID, CALIBRATED_POPULATION_ID, loadPopulation, selectRespondents } from '../population/store';
import { deriveSeed } from '../rng';
import { round, sd, mean } from '../stats';
import { newId, saveDoc } from '../storage/file-store';
import {
  SIMULATED_LABEL,
  type EngineMode,
  type ParameterProvenance,
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
import { questionMetrics } from './evidence';
import { BCS_DATASET_ID } from '../data/ec-bcs';
import { CES_DATASET_ID, HBS_DATASET_ID } from '../data/consumer-context';
import { ASSUMPTION_IDS, getAssumption } from './assumptions';

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

/** Πλαίσιο τεκμηρίωσης (χρονικό όριο, holdout) από το σχέδιο μελέτης. */
export function evidenceContextForPlan(plan: Pick<StudyPlan, 'referenceYear' | 'holdoutDatasets'>): EvidenceContext {
  const holdout = expandHoldout(plan.holdoutDatasets || []);
  return { asOfYear: plan.referenceYear || undefined, holdout, holdoutYears: holdoutDerivedYears(holdout) };
}

const LEVEL_OF_SCHEME: Record<string, string> = { eurobarometer: 'B', eurostat_ict: 'B', eurostat_silc: 'B', dianeosis: 'A' };

function provenanceFor(metric: string, q: { id: string; option: string | null } | null, wave: PriorFit['waveKey'] | null, fit: PriorFit | null, reason?: string): ParameterProvenance {
  const m = getMetric(metric);
  const ds = metricDatasetId(metric);
  const study = lakeStudy(ds);
  const w = wave ? m?.waves.find((x) => x.key === wave) : null;
  const cell = w?.groups.all?.all;
  return {
    questionId: q?.id || null,
    option: q?.option || null,
    metric,
    kind: reason ? 'excluded' : 'observed',
    datasetId: ds,
    source: metricSourceLabel(metric),
    waveKey: wave,
    year: w?.year ?? null,
    observed: cell ? cell.value : null,
    n: cell && !cell.nUnknown ? cell.n : null,
    dimensions: w ? Object.keys(w.groups).filter((d) => d !== 'all') : [],
    level: study?.level || LEVEL_OF_SCHEME[m?.scheme || 'eurobarometer'] || null,
    quality: study?.quality ?? null,
    tier: metricTier(metric),
    license: study?.license || null,
    url: study?.url || null,
    fitErrorPp: fit ? Math.round(fit.maxFitErrorPp * 100) / 100 : null,
    ...(reason ? { reason } : {})
  };
}

/** Fit των empirical priors για όσες ερωτήσεις συνδέονται με δείκτη (με χρονικό όριο και holdout). */
export function fitPriorsForQuestions(
  questions: Question[],
  personas: Persona[],
  extraMetrics: string[] = [],
  ctx: EvidenceContext = {}
): { fits: Record<string, PriorFit>; warnings: string[]; provenance: ParameterProvenance[] } {
  const fits: Record<string, PriorFit> = {};
  const warnings: string[] = [];
  const provenance: ParameterProvenance[] = [];
  const metrics = Array.from(
    new Set([...questions.flatMap(questionMetrics), ...extraMetrics].filter((m): m is string => !!m))
  );
  // Οι δείκτες ανά επιλογή μιας ερώτησης αναφέρονται μαζί (μία προειδοποίηση ανά ερώτηση).
  const groupOf = new Map<string, string>();
  const owner = new Map<string, { id: string; option: string | null }>();
  questions.forEach((q) => {
    if (q.evidenceLink?.optionMetrics) for (const m of questionMetrics(q)) groupOf.set(m, `ερώτηση ${q.id}`);
    if (q.evidenceLink) {
      owner.set(q.evidenceLink.metric, { id: q.id, option: q.evidenceLink.positiveOption || null });
      Object.entries(q.evidenceLink.optionMetrics || {}).forEach(([option, m]) => owner.set(m, { id: q.id, option }));
    }
  });
  const groups = new Map<string, { waveKey: string; year: number; maxErr: number; converged: boolean }>();
  const excludedGroups = new Map<string, string>();
  for (const m of metrics) {
    const { wave, excluded } = latestWaveFor(m, ctx);
    if (!wave) {
      const key = groupOf.get(m) || `«${m}»`;
      const reason =
        excluded === 'holdout'
          ? 'εξαιρείται ως holdout (μελέτη αξιολόγησης ή παράγωγό της)'
          : excluded === 'after_reference_year'
            ? `δεν υπάρχει μέτρηση έως το έτος αναφοράς ${ctx.asOfYear}`
            : 'δεν έχει διαθέσιμο κύμα';
      excludedGroups.set(key, reason);
      provenance.push(provenanceFor(m, owner.get(m) || null, null, null, reason));
      continue;
    }
    const fit = fitPriorModel(m, wave, personas);
    fits[m] = fit;
    provenance.push(provenanceFor(m, owner.get(m) || null, wave.key, fit));
    const key = groupOf.get(m) || `«${m}»`;
    const g = groups.get(key) || { waveKey: wave.key, year: wave.year, maxErr: 0, converged: true };
    g.maxErr = Math.max(g.maxErr, fit.maxFitErrorPp);
    g.converged = g.converged && fit.converged;
    groups.set(key, g);
  }
  excludedGroups.forEach((reason, key) => warnings.push(`Ο δείκτης για ${key} ${reason}· η ερώτηση απαντάται χωρίς αυτή την εμπειρική βάση.`));
  const refYear = ctx.asOfYear || new Date().getFullYear();
  groups.forEach((g, key) => {
    const age = refYear - g.year;
    if (age >= 2) warnings.push(`Το εμπειρικό prior για ${key} είναι από το κύμα ${g.waveKey} (${age} έτη πριν από το ${ctx.asOfYear ? 'έτος αναφοράς' : 'σήμερα'}).`);
    if (!g.converged || g.maxErr > FIT_WARNING_PP) {
      warnings.push(
        `Το μοντέλο για ${key} αποκλίνει έως ${g.maxErr.toFixed(1)} π.μ. από τα παρατηρημένα ποσοστά (ασυμβατότητα δομής πληθυσμού με το δείγμα της έρευνας).`
      );
    }
  });
  return { fits, warnings, provenance };
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

export async function runSurvey(input: RunSurveyOptions): Promise<StudyRun> {
  let o = input;
  const t0 = Date.now();
  const runId = o.runId || newId('study');
  const seed = o.seed ?? (Date.now() % 1_000_000);
  const mode: EngineMode = o.mode || 'demo';
  const cfg = liveConfig();
  const model = (o.model || cfg.defaultModel) as LiveModelId;
  const ctx0 = evidenceContextForPlan(o.plan);
  // Χρονικός κανόνας: για έτος αναφοράς πριν από τη βαθμονόμηση 2025 χρησιμοποιείται ο ιστορικός baseline (GLOPOP-S 2015),
  // ώστε να μη «διαρρέει» στον πληθυσμό πληροφορία από μεταγενέστερα έτη.
  let populationId = o.populationId;
  let populationNote: string | null = null;
  const requested = loadPopulation(o.populationId);
  const calYear = requested?.summary.updateStatus.targetYear || null;
  if (ctx0.asOfYear && calYear && ctx0.asOfYear < calYear && o.populationId === CALIBRATED_POPULATION_ID && loadPopulation(BASELINE_POPULATION_ID)) {
    populationId = BASELINE_POPULATION_ID;
    populationNote = `Έτος αναφοράς ${ctx0.asOfYear} < έτος βαθμονόμησης ${calYear}: χρησιμοποιείται ο ιστορικός πληθυσμός βάσης GLOPOP-S 2015 (όχι η δομή ${calYear}).`;
  }
  o = { ...o, populationId };
  const pop = loadPopulation(populationId);
  if (!pop) throw new Error('Ο πληθυσμός δεν βρέθηκε.');

  const base: Omit<StudyRun, 'status' | 'respondents' | 'aggregates' | 'respondentCount' | 'durationMs' | 'completedAt' | 'validation' | 'datasetsUsed'> = {
    id: runId,
    createdAt: new Date().toISOString(),
    plan: o.plan,
    populationId,
    populationSummary: pop.summary,
    engine: {
      mode,
      engineVersion: mode === 'demo' ? `${DEMO_ENGINE_VERSION}+${PRIOR_MODEL_VERSION}` : `${LLM_PROMPT_VERSION}+${PRIOR_MODEL_VERSION}`,
      model: mode === 'live' ? model : null
    },
    seed,
    cost: { mode, model: mode === 'live' ? model : null, inputTokens: 0, outputTokens: 0, usd: 0, capUsd: mode === 'live' ? o.costCapUsd ?? cfg.costCapUsd : 0, calls: 0 },
    warnings: [...(populationNote ? [populationNote] : []), ...o.plan.warnings]
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

  const assumptionMetrics = o.plan.assumptions.filter((a) => a.enabled && a.metric).map((a) => a.metric as string);
  const { fits, warnings: fitWarnings, provenance } = fitPriorsForQuestions(o.plan.questions, pop.personas, assumptionMetrics, ctx0);
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
            seed,
            climate: !!getAssumption(o.plan.assumptions, ASSUMPTION_IDS.consumerClimate)
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
  const datasetsUsed = [pop.summary.datasetId, ...pop.summary.updateStatus.targetsDatasetIds];
  Object.keys(fits).forEach((m) => {
    const id = metricDatasetId(m);
    if (!datasetsUsed.includes(id)) datasetsUsed.push(id);
  });
  if (getAssumption(o.plan.assumptions, ASSUMPTION_IDS.consumerClimate) && !datasetsUsed.includes(BCS_DATASET_ID)) datasetsUsed.push(BCS_DATASET_ID);
  // πλαίσιο καταναλωτικών μελετών (εμφανίζεται στην αναφορά, δεν τροφοδοτεί το μοντέλο)
  if (o.plan.domain === 'consumer') datasetsUsed.push(...[CES_DATASET_ID, HBS_DATASET_ID].filter((d) => !datasetsUsed.includes(d)));

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
    provenance,
    evidenceContext: { referenceYear: o.plan.referenceYear || null, holdout: Array.from(ctx0.holdout || []), populationNote },
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
