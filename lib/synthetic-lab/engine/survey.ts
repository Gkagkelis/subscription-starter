// ============================================================
// Synthetic survey engine.
// ============================================================

import { liveConfig, type LiveModelId } from '../ai/config';
import { BudgetExceededError, finishRun, mapWithConcurrency, registerRun, RunCancelledError, StudyBudget } from '../ai/live';
import { getMetric, latestWaveFor, metricDatasetId, metricScheme, metricSourceLabel, metricTier, type EvidenceContext } from '../data/noraya';
import { expandHoldout, holdoutDerivedYears, lakeStudy } from '../data/lake';
import { BASELINE_POPULATION_ID, CALIBRATED_POPULATION_ID, loadPopulation, selectRespondents, yearRakedPopulationId } from '../population/store';
import { PRODUCTION_MODEL, type ModelConfig } from './model-config';
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
import { EVIDENCE_ENGINE_VERSION, evidenceRespond, prepareEvidence, type PreparedQuestion } from './evidence-responder';
import { checkQuestionnaire } from './guardrails';
import { LLM_PROMPT_VERSION, llmRespond } from './llm-responder';
import { FIT_WARNING_PP, fitPriorModel, PRIOR_MODEL_VERSION, type PriorFit } from './prior-model';
import { validationSummaryForQuestions } from './validation';
import { questionMetrics } from './evidence';
import { BCS_DATASET_ID } from '../data/ec-bcs';
import { CES_DATASET_ID, HBS_DATASET_ID } from '../data/consumer-context';
import { ASSUMPTION_IDS, getAssumption } from './assumptions';
import { runPersonaSurvey } from '../persona/survey';

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
  /** Ρυθμίσεις μοντέλου· προεπιλογή η παραγωγική έκδοση (πειραματικές μόνο από το benchmark). */
  modelConfig?: ModelConfig;
}

/** Πλαίσιο τεκμηρίωσης (χρονικό όριο, holdout) από το σχέδιο μελέτης. */
export function evidenceContextForPlan(plan: Pick<StudyPlan, 'referenceYear' | 'referenceMonth' | 'holdoutDatasets'>): EvidenceContext {
  const holdout = expandHoldout(plan.holdoutDatasets || []);
  return {
    asOfYear: plan.referenceYear || undefined,
    asOfMonth: (plan.referenceYear && plan.referenceMonth) || undefined,
    holdout,
    holdoutYears: holdoutDerivedYears(holdout)
  };
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

// Τα fits είναι ντετερμινιστικά (ίδιος πληθυσμός, δείκτης, κύμα, συρρίκνωση -> ίδιο αποτέλεσμα):
// κρατούνται ανά αντικείμενο πληθυσμού για να μην επαναλαμβάνονται σε επαναλήψεις/seeds.
const FIT_CACHE = new WeakMap<Persona[], Map<string, PriorFit>>();
const FIT_CACHE_MAX = 1500;
function cachedFit(metric: string, wave: Parameters<typeof fitPriorModel>[1], personas: Persona[], shrinkage: number | undefined, dims?: string[], anchor?: boolean, universeMatching?: boolean): PriorFit {
  let m = FIT_CACHE.get(personas);
  if (!m) FIT_CACHE.set(personas, (m = new Map()));
  const universe = universeMatching ? getMetric(metric)?.universe || null : null;
  const key = `${metric}\u0001${wave.key}\u0001${wave.year}\u0001${shrinkage ?? 0}\u0001${dims ? dims.join(',') : '*'}\u0001${anchor ? 'A' : ''}\u0001${universe ? JSON.stringify(universe) : ''}\u0001${JSON.stringify(wave.groups)}`;
  const hit = m.get(key);
  if (hit) return hit;
  const fit = fitPriorModel(metric, wave, personas, { shrinkage, dimensions: dims, anchorOverall: anchor, universe });
  if (m.size >= FIT_CACHE_MAX) m.clear();
  m.set(key, fit);
  return fit;
}

/** Fit των empirical priors για όσες ερωτήσεις συνδέονται με δείκτη (με χρονικό όριο και holdout). */
export function fitPriorsForQuestions(
  questions: Question[],
  personas: Persona[],
  extraMetrics: string[] = [],
  ctx: EvidenceContext = {},
  fitOpts: { shrinkage?: number; dimensions?: Partial<Record<string, string[]>>; anchorOverall?: boolean; universeMatching?: boolean } = {}
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
    const fit = cachedFit(m, wave, personas, fitOpts.shrinkage, fitOpts.dimensions?.[metricScheme(m)], fitOpts.anchorOverall, fitOpts.universeMatching);
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
  // Persona Intelligence Engine: ξεχωριστή διαδρομή (πρώτα συνθετικά πρόσωπα, μετά ατομικές απαντήσεις)· ο prod-1 μένει ανέπαφος.
  if (o.plan.engine === 'persona') {
    if ((o.mode || 'demo') !== 'demo') throw new Error('Ο μηχανισμός PIE είναι στατιστικός (χωρίς κλήσεις AI)· η εκτέλεση live δεν υποστηρίζεται.');
    return runPersonaSurvey({ plan: o.plan, populationId: o.populationId, seed: o.seed, runId: o.runId, save: o.save, stabilityRuns: o.stabilityRuns });
  }
  const t0 = Date.now();
  const runId = o.runId || newId('study');
  const seed = o.seed ?? (Date.now() % 1_000_000);
  const mode: EngineMode = o.mode || 'demo';
  const cfg = liveConfig();
  const model = (o.model || cfg.defaultModel) as LiveModelId;
  const model0 = o.modelConfig || PRODUCTION_MODEL;
  const ctx0: EvidenceContext = {
    ...evidenceContextForPlan(o.plan),
    wavePolicy: model0.wavePolicy,
    poolMaxWaves: model0.poolMaxWaves,
    poolHalfLifeYears: model0.poolHalfLifeYears,
    forecast: model0.forecast
  };
  // Χρονικός κανόνας: για έτος αναφοράς πριν από τη βαθμονόμηση 2025 χρησιμοποιείται ο ιστορικός baseline (GLOPOP-S 2015),
  // ώστε να μη «διαρρέει» στον πληθυσμό πληροφορία από μεταγενέστερα έτη.
  let populationId = o.populationId;
  let populationNote: string | null = null;
  const requested = loadPopulation(o.populationId);
  const calYear = requested?.summary.updateStatus.targetYear || null;
  if (model0.population === 'year_raked' && ctx0.asOfYear && o.populationId === CALIBRATED_POPULATION_ID && loadPopulation(yearRakedPopulationId(ctx0.asOfYear))) {
    populationId = yearRakedPopulationId(ctx0.asOfYear);
    populationNote = `Πληθυσμός βάσης GLOPOP-S βαθμονομημένος στα επίσημα ηλικία×φύλο του ${ctx0.asOfYear} (πειραματική ρύθμιση ${model0.version}).`;
  } else if (ctx0.asOfYear && calYear && ctx0.asOfYear < calYear && o.populationId === CALIBRATED_POPULATION_ID && loadPopulation(BASELINE_POPULATION_ID)) {
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
      engineVersion:
        (mode === 'demo'
          ? `${o.plan.engine === 'evidence' ? EVIDENCE_ENGINE_VERSION : DEMO_ENGINE_VERSION}+${PRIOR_MODEL_VERSION}`
          : `${LLM_PROMPT_VERSION}+${PRIOR_MODEL_VERSION}`) +
        (model0.version !== PRODUCTION_MODEL.version ? `+${model0.version}` : ''),
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
  const sel = selectRespondents(pop, o.plan.audience, n, deriveSeed(seed, 'sample'), { weighting: model0.respondentWeighting });
  base.warnings.push(...sel.warnings);

  const assumptionMetrics = o.plan.assumptions.filter((a) => a.enabled && a.metric).map((a) => a.metric as string);
  const { fits, warnings: fitWarnings, provenance } = fitPriorsForQuestions(o.plan.questions, pop.personas, assumptionMetrics, ctx0, { shrinkage: model0.shrinkage, dimensions: model0.dimensions, anchorOverall: model0.anchorOverall, universeMatching: model0.universeMatching });
  base.warnings.push(...fitWarnings);
  const ctx: ResponderContext = { seed, assumptions: o.plan.assumptions, priorFits: fits, scenario: o.scenario || null, batteryRho: model0.batteryRho || 0, itemFactors: model0.itemFactors || null };

  let respondents: SyntheticRespondent[] = [];
  let status = 'completed' as StudyRun['status'];
  const budget = new StudyBudget(base.cost.capUsd, sel.respondents.length, model);

  // Μηχανισμός «Τεκμηριωμένη πρόβλεψη» (EGPS): μόνο σε demo mode· όπου λείπει τεκμηρίωση → NA, όχι ομοιόμορφη κατανομή.
  const useEvidence = o.plan.engine === 'evidence' && mode === 'demo';
  if (o.plan.engine === 'evidence' && mode !== 'demo') base.warnings.push('Ο μηχανισμός «Τεκμηριωμένη πρόβλεψη» λειτουργεί μόνο χωρίς AI· η εκτέλεση live χρησιμοποιεί τον τυπικό μηχανισμό.');
  const prepared: PreparedQuestion[] | null = useEvidence ? prepareEvidence(o.plan.questions, pop.personas, fits, ctx0) : null;
  if (prepared) {
    const ne = prepared.filter((x) => x.evidence.evidenceClass === 'NOT_ESTIMABLE').map((x) => x.q.id);
    base.warnings.push(
      `Μηχανισμός «Τεκμηριωμένη πρόβλεψη» (${EVIDENCE_ENGINE_VERSION}): κάθε ερώτηση έχει κατηγορία τεκμηρίωσης (EMPIRICALLY ANCHORED / MODEL-EXTRAPOLATED / NOT ESTIMABLE).` +
        (ne.length ? ` Μη εκτιμήσιμες (καμία συνθετική απάντηση): ${ne.join(', ')}.` : '')
    );
  }
  if (mode === 'demo') {
    respondents = sel.respondents.map((p): SyntheticRespondent => ({
      personaId: p.id,
      weight: p.weight,
      label: SIMULATED_LABEL,
      answers: prepared ? evidenceRespond(p, prepared, seed, ctx) : applyFollowUps(o.plan.questions, demoRespond(p, o.plan.questions, ctx))
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
  const aggregates = o.plan.questions.map((q) => {
    const a = aggregateQuestion(q, respondents, personaMap);
    const ev = prepared?.find((x) => x.q.id === q.id)?.evidence;
    if (ev) {
      a.evidence = ev;
      a.evidenceKind = ev.evidenceClass === 'EMPIRICALLY_ANCHORED' ? 'estimate' : 'simulation';
    }
    return a;
  });

  let stability: StabilityResult | null = null;
  if (mode === 'demo' && (o.stabilityRuns ?? 5) > 1) {
    stability = stabilityCheck(o, pop.personas, sel.respondents.length, fits, o.stabilityRuns ?? 5, seed, prepared);
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
    evidenceContext: { referenceYear: o.plan.referenceYear || null, referenceMonth: o.plan.referenceMonth || null, holdout: Array.from(ctx0.holdout || []), populationNote },
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
  seed: number,
  prepared: PreparedQuestion[] | null = null
): StabilityResult {
  const pop = loadPopulation(o.populationId)!;
  const seeds = Array.from({ length: runs }, (_, i) => deriveSeed(seed, 'stability', i));
  const perRun = seeds.map((s) => {
    const sel = selectRespondents(pop, o.plan.audience, n, deriveSeed(s, 'sample'), { weighting: (o.modelConfig || PRODUCTION_MODEL).respondentWeighting });
    const ctx: ResponderContext = { seed: s, assumptions: o.plan.assumptions, priorFits: fits, scenario: o.scenario || null, batteryRho: (o.modelConfig || PRODUCTION_MODEL).batteryRho || 0, itemFactors: (o.modelConfig || PRODUCTION_MODEL).itemFactors || null };
    const rs = sel.respondents.map((p): SyntheticRespondent => ({ personaId: p.id, weight: p.weight, label: SIMULATED_LABEL, answers: prepared ? evidenceRespond(p, prepared, s, ctx) : applyFollowUps(o.plan.questions, demoRespond(p, o.plan.questions, ctx)) }));
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
