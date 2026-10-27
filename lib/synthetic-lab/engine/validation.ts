// ============================================================
// VALIDATION ENGINE
//
// Backtest σε held-out κύμα (ιδέα digital-twin-example: MAE σε π.μ.·
// CivicSim: Wilson CI, κάλυψη διαστημάτων, naive baselines — ανεξάρτητη
// υλοποίηση):
//   1. Εκπαίδευση: το prior-model προσαρμόζεται στο κύμα t-1.
//   2. Προσομοίωση: n συνθετικοί ερωτώμενοι (15+) απαντούν Bernoulli(p_i).
//   3. Σύγκριση με το ΠΑΡΑΤΗΡΗΜΕΝΟ κύμα t (δεν χρησιμοποιήθηκε στο fit):
//      MAE, απόκλιση ανά ομάδα, μεροληψία, κάλυψη 95% διαστημάτων.
//   4. Baselines: «επιμονή» (τιμή ομάδας στο t-1) και «μόνο σύνολο».
//   5. Ευαισθησία: εναλλακτικές ρυθμίσεις μοντέλου (διαστάσεις).
//   6. Σταθερότητα: επανάληψη με διαφορετικά seeds.
// Τι ΔΕΝ ελέγχει: ερωτήσεις χωρίς εμπειρική σύνδεση (π.χ. νέο προϊόν),
// ούτε τις απαντήσεις AI — αυτές εμφανίζονται ως «μη επικυρωμένες».
// ============================================================

import { getMetric, latestWave, LINKED_DIMENSIONS, listMetrics, norayaMembership, waveCells, type LinkedDimension } from '../data/noraya';
import type { PriorWave } from '../data/noraya-build';
import { loadPopulation, marginals, selectRespondents } from '../population/store';
import { createRng, deriveSeed } from '../rng';
import { mae, mean, round, sd, seProportion, totalVariationDistance, wilson, effectiveN } from '../stats';
import { listDocs, loadDoc, newId, saveDoc } from '../storage/file-store';
import type { Persona, Question, StudyValidationSummary } from '../types';
import { fitPriorModel, PRIOR_MODEL_VERSION } from './prior-model';

export const VALIDATION_VERSION = 'backtest-1.0';
export const NOT_VALIDATED =
  'Η συγκεκριμένη προσομοίωση δεν έχει ακόμη επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα';

export interface GroupComparison {
  dimension: string;
  group: string;
  observed: number;
  observedN: number;
  simulated: number;
  simCiLow: number;
  simCiHigh: number;
  persistence: number | null;
  absError: number;
  covered: boolean;
  lowSample: boolean;
}

export interface BacktestResult {
  id: string;
  createdAt: string;
  version: string;
  modelVersion: string;
  metric: string;
  metricLabel: string;
  populationId: string;
  populationIsFixture: boolean;
  trainWave: string;
  testWave: string;
  n: number;
  seed: number;
  groups: GroupComparison[];
  maePp: number;
  /** MAE της αναμενόμενης τιμής του μοντέλου (χωρίς θόρυβο τυχαίων απαντήσεων). */
  expectedMaePp: number;
  biasPp: number;
  persistenceMaePp: number | null;
  overallOnlyMaePp: number | null;
  coverage95: number;
  sensitivity: { setting: string; dimensions: string[]; maePp: number }[];
  stability: { runs: number; maeMean: number; maeSd: number };
  demographicCheck: { attribute: string; tvd: number }[];
  notes: string[];
}

/** Προσομοιωμένα ποσοστά ανά ομάδα NORAYA από ένα σύνολο προσώπων. */
function simulateGroups(
  respondents: Persona[],
  p: Map<string, number>,
  seed: number,
  expected = false
): Record<string, Record<string, { share: number; effN: number }>> {
  const rng = createRng(seed);
  const acc: Record<string, Record<string, { num: number; den: number; w: number[] }>> = { all: { all: { num: 0, den: 0, w: [] } } };
  for (const r of respondents) {
    const pi = p.get(r.id);
    const m = norayaMembership(r);
    if (pi === undefined || !m) continue;
    // expected=true: αναμενόμενη τιμή του μοντέλου (χωρίς θόρυβο τυχαίων απαντήσεων)
    const yes = expected ? pi : rng.next() < pi ? 1 : 0;
    const add = (d: string, g: string, frac: number) => {
      const cell = ((acc[d] = acc[d] || {})[g] = acc[d][g] || { num: 0, den: 0, w: [] });
      cell.num += r.weight * frac * yes;
      cell.den += r.weight * frac;
      cell.w.push(r.weight * frac);
    };
    add('all', 'all', 1);
    for (const d of LINKED_DIMENSIONS) for (const g in m[d]) add(d, g, m[d][g]);
  }
  const out: Record<string, Record<string, { share: number; effN: number }>> = {};
  for (const d in acc) {
    out[d] = {};
    for (const g in acc[d]) {
      const c = acc[d][g];
      out[d][g] = { share: c.den ? c.num / c.den : NaN, effN: effectiveN(c.w) };
    }
  }
  return out;
}

function pickWaves(metric: string, testKey?: string): { train: PriorWave; test: PriorWave } | null {
  const m = getMetric(metric);
  if (!m) return null;
  const withAll = m.waves.filter((w) => w.groups.all?.all);
  const test = testKey ? withAll.find((w) => w.key === testKey) : withAll[withAll.length - 1];
  if (!test) return null;
  const train = latestWave(metric, test.key);
  if (!train) return null;
  return { train, test };
}

export function runBacktest(opts: {
  metric: string;
  populationId: string;
  testWave?: string;
  n?: number;
  seed?: number;
  stabilityRuns?: number;
  save?: boolean;
  shrinkage?: number;
}): BacktestResult {
  const n = opts.n ?? 1000;
  const seed = opts.seed ?? 20240;
  const pop = loadPopulation(opts.populationId);
  if (!pop) throw new Error('Ο πληθυσμός δεν βρέθηκε.');
  const waves = pickWaves(opts.metric, opts.testWave);
  if (!waves) throw new Error(`Ο δείκτης ${opts.metric} δεν έχει δύο διαδοχικά κύματα για backtest.`);
  const { train, test } = waves;
  const notes: string[] = [];

  const fit = fitPriorModel(opts.metric, train, pop.personas, { shrinkage: opts.shrinkage });
  const sel = selectRespondents(pop, { minAge: 15 }, n, deriveSeed(seed, 'bt-sample'));
  const sim = simulateGroups(sel.respondents, fit.p, deriveSeed(seed, 'bt-draw'));

  const groups: GroupComparison[] = [];
  const dims: string[] = ['all', ...LINKED_DIMENSIONS];
  for (const d of dims) {
    const cells = d === 'all' ? test.groups.all || {} : waveCells(test, d);
    const trainCells = d === 'all' ? train.groups.all || {} : waveCells(train, d);
    for (const g of Object.keys(cells)) {
      const obs = cells[g];
      const s = sim[d]?.[g];
      if (!s || Number.isNaN(s.share) || obs.inconsistent) continue;
      const [lo, hi] = wilson(s.share, s.effN);
      const seSim = seProportion(s.share, s.effN);
      const seObs = seProportion(obs.value / 100, obs.n);
      const z = Math.abs(s.share - obs.value / 100) / Math.sqrt(seSim * seSim + seObs * seObs);
      const prev = trainCells[g];
      groups.push({
        dimension: d,
        group: g,
        observed: round(obs.value, 1),
        observedN: obs.n,
        simulated: round(s.share * 100, 1),
        simCiLow: round(lo * 100, 1),
        simCiHigh: round(hi * 100, 1),
        persistence: prev ? round(prev.value, 1) : null,
        absError: round(Math.abs(s.share * 100 - obs.value), 2),
        covered: z <= 1.96,
        lowSample: obs.n < 50
      });
    }
  }
  const evalGroups = groups.filter((g) => !g.lowSample);
  if (evalGroups.length < groups.length) notes.push(`${groups.length - evalGroups.length} ομάδες με n<50 εμφανίζονται αλλά δεν μετρούν στους συνολικούς δείκτες.`);
  const maeModel = mae(evalGroups.map((g) => ({ predicted: g.simulated, observed: g.observed })));
  const persistencePairs = evalGroups.filter((g) => g.persistence !== null).map((g) => ({ predicted: g.persistence!, observed: g.observed }));
  const simExp = simulateGroups(sel.respondents, fit.p, 0, true);
  const expectedPairs = evalGroups
    .map((g) => ({ predicted: (simExp[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed }))
    .filter((x) => !Number.isNaN(x.predicted));
  const overallTrain = train.groups.all.all.value;
  const overallOnly = mae(evalGroups.map((g) => ({ predicted: overallTrain, observed: g.observed })));

  // Ευαισθησία σε ρυθμίσεις μοντέλου
  const settings: { setting: string; dims: LinkedDimension[] }[] = [
    { setting: 'Ηλικία + φύλο + μόρφωση (προεπιλογή)', dims: ['age_group', 'gender', 'education_group'] },
    { setting: 'Ηλικία + φύλο', dims: ['age_group', 'gender'] },
    { setting: 'Μόνο ηλικία', dims: ['age_group'] },
    { setting: 'Χωρίς δημογραφικά (μόνο σύνολο)', dims: [] }
  ];
  const sensitivity = settings.map((st) => {
    const f = fitPriorModel(opts.metric, train, pop.personas, { dimensions: st.dims, shrinkage: opts.shrinkage });
    const s2 = simulateGroups(sel.respondents, f.p, deriveSeed(seed, 'bt-draw'));
    const pairs = evalGroups.map((g) => ({ predicted: (s2[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed })).filter((x) => !Number.isNaN(x.predicted));
    return { setting: st.setting, dimensions: st.dims, maePp: round(mae(pairs), 2) };
  });

  // Σταθερότητα: επανάληψη με άλλα seeds
  const runs = opts.stabilityRuns ?? 5;
  const maes: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s3 = selectRespondents(pop, { minAge: 15 }, n, deriveSeed(seed, 'bt-stab-sample', i));
    const simI = simulateGroups(s3.respondents, fit.p, deriveSeed(seed, 'bt-stab-draw', i));
    const pairs = evalGroups.map((g) => ({ predicted: (simI[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed })).filter((x) => !Number.isNaN(x.predicted));
    maes.push(mae(pairs));
  }

  // Δημογραφικός έλεγχος: δείγμα vs πληθυσμός (15+)
  const pool = pop.personas.filter((p) => norayaMembership(p));
  const mp = marginals(pool);
  const ms = marginals(sel.respondents);
  const demographicCheck = Object.keys(mp).map((k) => ({ attribute: k, tvd: round(totalVariationDistance(mp[k], ms[k]) * 100, 2) }));

  if (pop.summary.isDevFixture) notes.unshift('ΠΡΟΣΟΧΗ: εκτελέστηκε σε ΤΕΧΝΗΤΟ fixture — τα αποτελέσματα δεν έχουν νόημα.');
  notes.push(
    `Το fit έγινε στο κύμα ${train.key} και συγκρίθηκε με το ${test.key}, το οποίο δεν χρησιμοποιήθηκε στο fit.`,
    'Οι παρατηρημένες τιμές είναι συγκεντρωτικά ποσοστά με δικό τους δειγματοληπτικό σφάλμα· η «κάλυψη» συνυπολογίζει και τα δύο σφάλματα.',
    'Το backtest μετρά κυρίως τη χρονική μεταβολή μεταξύ κυμάτων και το σφάλμα του μοντέλου κύριων επιδράσεων — όχι την ικανότητα πρόβλεψης για νέα θέματα.'
  );
  if (fit.skippedTargets.length) notes.push(`Παραλείφθηκαν ${fit.skippedTargets.length} στόχοι fit (μικρό n, μη αντιστοιχιζόμενες ομάδες ή ασυμβατότητες).`);

  const result: BacktestResult = {
    id: newId('bt'),
    createdAt: new Date().toISOString(),
    version: VALIDATION_VERSION,
    modelVersion: PRIOR_MODEL_VERSION,
    metric: opts.metric,
    metricLabel: getMetric(opts.metric)?.label || opts.metric,
    populationId: opts.populationId,
    populationIsFixture: pop.summary.isDevFixture,
    trainWave: train.key,
    testWave: test.key,
    n: sel.respondents.length,
    seed,
    groups,
    maePp: round(maeModel, 2),
    expectedMaePp: round(mae(expectedPairs), 2),
    biasPp: round(mean(evalGroups.map((g) => g.simulated - g.observed)), 2),
    persistenceMaePp: persistencePairs.length ? round(mae(persistencePairs), 2) : null,
    overallOnlyMaePp: round(overallOnly, 2),
    coverage95: round((evalGroups.filter((g) => g.covered).length / Math.max(1, evalGroups.length)) * 100, 1),
    sensitivity,
    stability: { runs, maeMean: round(mean(maes), 2), maeSd: round(sd(maes), 2) },
    demographicCheck,
    notes
  };
  if (opts.save !== false) saveDoc('validations', result.id, result);
  return result;
}

export interface ValidationSuite {
  id: string;
  createdAt: string;
  populationId: string;
  results: BacktestResult[];
  summary: { metrics: number; meanMaePp: number; meanExpectedMaePp: number; meanPersistenceMaePp: number | null; meanCoverage95: number };
}

/** Μετρικές κατάλληλες για backtest (≥2 κύματα με σύνολο). */
export function backtestableMetrics(): string[] {
  return listMetrics()
    .filter((m) => m.waves.filter((w) => w.groups.all?.all).length >= 2)
    .filter((m) => m.waves[m.waves.length - 1].year >= 2020)
    .map((m) => m.metric);
}

export function runValidationSuite(opts: { populationId: string; n?: number; seed?: number }): ValidationSuite {
  const results = backtestableMetrics().map((metric) => runBacktest({ metric, populationId: opts.populationId, n: opts.n, seed: opts.seed, save: false }));
  const pers = results.map((r) => r.persistenceMaePp).filter((x): x is number => x !== null);
  const suite: ValidationSuite = {
    id: newId('suite'),
    createdAt: new Date().toISOString(),
    populationId: opts.populationId,
    results,
    summary: {
      metrics: results.length,
      meanMaePp: round(mean(results.map((r) => r.maePp)), 2),
      meanExpectedMaePp: round(mean(results.map((r) => r.expectedMaePp)), 2),
      meanPersistenceMaePp: pers.length ? round(mean(pers), 2) : null,
      meanCoverage95: round(mean(results.map((r) => r.coverage95)), 1)
    }
  };
  saveDoc('validations', 'latest-suite', suite);
  return suite;
}

export function latestSuite(): ValidationSuite | null {
  return loadDoc<ValidationSuite>('validations', 'latest-suite');
}

export function listBacktests(): BacktestResult[] {
  return listDocs<BacktestResult>('validations').filter((d: any) => d && d.metric && d.groups);
}

/** Σύνοψη επικύρωσης για μια μελέτη (με βάση ποιες ερωτήσεις έχουν εμπειρική σύνδεση). */
export function validationSummaryForQuestions(questions: Question[], mode: 'demo' | 'live' = 'demo'): StudyValidationSummary {
  const linked = Array.from(new Set(questions.map((q) => q.evidenceLink?.metric).filter((m): m is string => !!m)));
  const unlinked = questions.filter((q) => !q.evidenceLink).length;
  if (!linked.length) return { status: 'not_validated', message: NOT_VALIDATED, linkedMetrics: [], backtestIds: [] };
  const suite = latestSuite();
  const tested = suite ? suite.results.filter((r) => linked.includes(r.metric) && !r.populationIsFixture) : [];
  if (!tested.length || mode === 'live') {
    return {
      status: 'not_validated',
      message:
        mode === 'live'
          ? `${NOT_VALIDATED}. (Οι απαντήσεις AI δεν έχουν ελεγχθεί σε held-out κύμα.)`
          : `${NOT_VALIDATED}. Τρέξε τον «Έλεγχο Αξιοπιστίας» για τους δείκτες: ${linked.join(', ')}.`,
      linkedMetrics: linked,
      backtestIds: []
    };
  }
  const maeTxt = tested.map((r) => `${r.metricLabel}: MAE ${r.maePp} π.μ. (${r.trainWave}→${r.testWave})`).join('· ');
  return {
    status: 'partially_validated',
    message: `Μερική επικύρωση: οι ερωτήσεις με εμπειρική σύνδεση ελέγχθηκαν σε held-out κύμα — ${maeTxt}. ${unlinked ? `Οι υπόλοιπες ${unlinked} ερωτήσεις: ${NOT_VALIDATED.toLowerCase()}.` : ''}`.trim(),
    linkedMetrics: linked,
    backtestIds: tested.map((r) => r.id)
  };
}
