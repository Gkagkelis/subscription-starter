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

import { getMetric, latestWave, listMetrics, metricScheme, norayaMembership, SCHEME_DIMENSIONS, waveCells, type LinkedDimension } from '../data/noraya';
import type { GroupScheme } from '../data/noraya-build';
import type { PriorWave } from '../data/noraya-build';
import { loadPopulation, marginals, selectRespondents } from '../population/store';
import { createRng, deriveSeed } from '../rng';
import { mae, mean, round, sd, seProportion, totalVariationDistance, wilson, effectiveN } from '../stats';
import { listDocs, loadDoc, newId, saveDoc } from '../storage/file-store';
import type { Persona, Question, StudyValidationSummary } from '../types';
import { fitPriorModel, PRIOR_MODEL_VERSION } from './prior-model';
import { licenseMode, researchQuestions } from '../data/research';
import { bankQuestion } from './question-bank';

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
  /** Σχήμα πηγής (eurobarometer / eurostat_ict / dianeosis). */
  scheme?: string;
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
  expected = false,
  scheme: GroupScheme = 'eurobarometer'
): Record<string, Record<string, { share: number; effN: number }>> {
  const rng = createRng(seed);
  const acc: Record<string, Record<string, { num: number; den: number; w: number[] }>> = { all: { all: { num: 0, den: 0, w: [] } } };
  for (const r of respondents) {
    const pi = p.get(r.id);
    const m = norayaMembership(r, scheme);
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
    for (const d of SCHEME_DIMENSIONS[scheme]) for (const g in m[d] || {}) add(d, g, m[d][g]);
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
  const scheme = metricScheme(opts.metric);
  const simulate = (rs: Persona[], p: Map<string, number>, sd: number, expected = false) => simulateGroups(rs, p, sd, expected, scheme);

  const fit = fitPriorModel(opts.metric, train, pop.personas, { shrinkage: opts.shrinkage });
  const sel = selectRespondents(pop, { minAge: 15 }, n, deriveSeed(seed, 'bt-sample'));
  const sim = simulate(sel.respondents, fit.p, deriveSeed(seed, 'bt-draw'));

  const groups: GroupComparison[] = [];
  const dims: string[] = ['all', ...SCHEME_DIMENSIONS[scheme]];
  for (const d of dims) {
    const cells = d === 'all' ? test.groups.all || {} : waveCells(test, d);
    const trainCells = d === 'all' ? train.groups.all || {} : waveCells(train, d);
    for (const g of Object.keys(cells)) {
      const obs = cells[g];
      const s = sim[d]?.[g];
      if (!s || Number.isNaN(s.share) || obs.inconsistent) continue;
      const [lo, hi] = wilson(s.share, s.effN);
      const seSim = seProportion(s.share, s.effN);
      // Όταν η πηγή δεν δημοσιεύει n (π.χ. Eurostat), λαμβάνεται μόνο το σφάλμα της προσομοίωσης.
      const seObs = obs.nUnknown ? 0 : seProportion(obs.value / 100, obs.n);
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
        lowSample: !obs.nUnknown && obs.n < 50
      });
    }
  }
  const evalGroups = groups.filter((g) => !g.lowSample);
  if (evalGroups.length < groups.length) notes.push(`${groups.length - evalGroups.length} ομάδες με n<50 εμφανίζονται αλλά δεν μετρούν στους συνολικούς δείκτες.`);
  const maeModel = mae(evalGroups.map((g) => ({ predicted: g.simulated, observed: g.observed })));
  const persistencePairs = evalGroups.filter((g) => g.persistence !== null).map((g) => ({ predicted: g.persistence!, observed: g.observed }));
  const simExp = simulate(sel.respondents, fit.p, 0, true);
  const expectedPairs = evalGroups
    .map((g) => ({ predicted: (simExp[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed }))
    .filter((x) => !Number.isNaN(x.predicted));
  const overallTrain = train.groups.all.all.value;
  const overallOnly = mae(evalGroups.map((g) => ({ predicted: overallTrain, observed: g.observed })));

  // Ευαισθησία σε ρυθμίσεις μοντέλου
  const settings: { setting: string; dims: LinkedDimension[] }[] =
    scheme === 'dianeosis'
      ? [
          { setting: 'Ηλικία×φύλο + μόρφωση + περιφέρεια (προεπιλογή)', dims: ['age_gender', 'education_group', 'region'] },
          { setting: 'Ηλικία×φύλο + μόρφωση', dims: ['age_gender', 'education_group'] },
          { setting: 'Μόνο ηλικία×φύλο', dims: ['age_gender'] },
          { setting: 'Χωρίς δημογραφικά (μόνο σύνολο)', dims: [] }
        ]
      : scheme === 'eurostat_silc'
      ? [
          { setting: 'Τύπος νοικοκυριού × κίνδυνος φτώχειας (προεπιλογή)', dims: ['hh_pov'] },
          { setting: 'Χωρίς δημογραφικά (μόνο σύνολο)', dims: [] }
        ]
      : scheme === 'eurostat_ict'
      ? [
          { setting: 'Ηλικία×φύλο + μόρφωση (προεπιλογή)', dims: ['age_gender', 'education_group'] },
          { setting: 'Μόνο ηλικία×φύλο', dims: ['age_gender'] },
          { setting: 'Μόνο μόρφωση', dims: ['education_group'] },
          { setting: 'Χωρίς δημογραφικά (μόνο σύνολο)', dims: [] }
        ]
      : [
          { setting: 'Ηλικία + φύλο + μόρφωση (προεπιλογή)', dims: ['age_group', 'gender', 'education_group'] },
          { setting: 'Ηλικία + φύλο', dims: ['age_group', 'gender'] },
          { setting: 'Μόνο ηλικία', dims: ['age_group'] },
          { setting: 'Χωρίς δημογραφικά (μόνο σύνολο)', dims: [] }
        ];
  const sensitivity = settings.map((st) => {
    const f = fitPriorModel(opts.metric, train, pop.personas, { dimensions: st.dims, shrinkage: opts.shrinkage });
    const s2 = simulate(sel.respondents, f.p, deriveSeed(seed, 'bt-draw'));
    const pairs = evalGroups.map((g) => ({ predicted: (s2[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed })).filter((x) => !Number.isNaN(x.predicted));
    return { setting: st.setting, dimensions: st.dims, maePp: round(mae(pairs), 2) };
  });

  // Σταθερότητα: επανάληψη με άλλα seeds
  const runs = opts.stabilityRuns ?? 5;
  const maes: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s3 = selectRespondents(pop, { minAge: 15 }, n, deriveSeed(seed, 'bt-stab-sample', i));
    const simI = simulate(s3.respondents, fit.p, deriveSeed(seed, 'bt-stab-draw', i));
    const pairs = evalGroups.map((g) => ({ predicted: (simI[g.dimension]?.[g.group]?.share ?? NaN) * 100, observed: g.observed })).filter((x) => !Number.isNaN(x.predicted));
    maes.push(mae(pairs));
  }

  // Δημογραφικός έλεγχος: δείγμα vs πληθυσμός (15+)
  const pool = pop.personas.filter((p) => norayaMembership(p, scheme));
  const mp = marginals(pool);
  const ms = marginals(sel.respondents);
  const demographicCheck = Object.keys(mp).map((k) => ({ attribute: k, tvd: round(totalVariationDistance(mp[k], ms[k]) * 100, 2) }));

  if (pop.summary.isDevFixture) notes.unshift('ΠΡΟΣΟΧΗ: εκτελέστηκε σε ΤΕΧΝΗΤΟ fixture — τα αποτελέσματα δεν έχουν νόημα.');
  notes.push(
    `Το fit έγινε στο κύμα ${train.key} και συγκρίθηκε με το ${test.key}, το οποίο δεν χρησιμοποιήθηκε στο fit.`,
    scheme === 'eurostat_silc'
      ? 'EU-SILC: η Eurostat δεν δημοσιεύει n ανά κελί (η «κάλυψη» λαμβάνει υπόψη μόνο τον θόρυβο της προσομοίωσης). Ο κίνδυνος φτώχειας αντιστοιχίζεται προσεγγιστικά στο χαμηλότερο εισοδηματικό πεμπτημόριο.'
      : scheme === 'eurostat_ict'
      ? 'Η Eurostat δεν δημοσιεύει n ανά κελί: η «κάλυψη» λαμβάνει υπόψη μόνο τον θόρυβο της προσομοίωσης (υπερεκτιμά την αυστηρότητα). Πληθυσμός πηγής: 16-74 ετών.'
      : scheme === 'dianeosis'
      ? 'διαΝΕΟσις (μόνο για έρευνα): το n είναι ο πραγματικός αριθμός ερωτώμενων, αλλά μετά την επαναστάθμιση το αποτελεσματικό n είναι περίπου το μισό — η «κάλυψη» είναι αισιόδοξη. Τα κύματα απέχουν 2 έτη.'
      : 'Οι παρατηρημένες τιμές είναι συγκεντρωτικά ποσοστά με δικό τους δειγματοληπτικό σφάλμα· η «κάλυψη» συνυπολογίζει και τα δύο σφάλματα.',
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
    scheme,
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
  summary: SuiteSummary & { byScheme?: Record<string, SuiteSummary> };
}

export interface SuiteSummary {
  metrics: number;
  meanMaePp: number;
  meanExpectedMaePp: number;
  meanPersistenceMaePp: number | null;
  meanCoverage95: number;
  /** Σε πόσους δείκτες το μοντέλο (χωρίς θόρυβο) είχε μικρότερο σφάλμα από την «επιμονή». */
  beatsPersistence?: number;
}

function summarize(results: BacktestResult[]): SuiteSummary {
  const pers = results.map((r) => r.persistenceMaePp).filter((x): x is number => x !== null);
  return {
    metrics: results.length,
    meanMaePp: round(mean(results.map((r) => r.maePp)), 2),
    meanExpectedMaePp: round(mean(results.map((r) => r.expectedMaePp)), 2),
    meanPersistenceMaePp: pers.length ? round(mean(pers), 2) : null,
    meanCoverage95: round(mean(results.map((r) => r.coverage95)), 1),
    beatsPersistence: results.filter((r) => r.persistenceMaePp !== null && r.expectedMaePp < r.persistenceMaePp).length
  };
}

/** Μετρικές ανοιχτών πηγών κατάλληλες για backtest (≥2 κύματα με σύνολο). */
export function backtestableMetrics(): string[] {
  return listMetrics()
    .filter((m) => (m.tier || 'open') === 'open')
    .filter((m) => m.waves.filter((w) => w.groups.all?.all).length >= 2)
    .filter((m) => m.waves[m.waves.length - 1].year >= 2020)
    .map((m) => m.metric);
}

/**
 * Ερωτήσεις ερευνητικής βαθμίδας που επαναλαμβάνονται σε ≥2 κύματα (τελευταίο ≥2020):
 * backtest στην κύρια (συχνότερη ουσιαστική) επιλογή κάθε ερώτησης.
 */
export function researchBacktestMetrics(): string[] {
  if (licenseMode() !== 'research') return [];
  const out = new Set<string>();
  for (const q of researchQuestions()) {
    if ((q.years?.length || 0) < 2 || Math.max(...(q.years || [0])) < 2020) continue;
    const metric = bankQuestion(q.id, 'bt')?.evidenceLink?.metric;
    if (metric && (getMetric(metric)?.waves.filter((w) => w.groups.all?.all).length || 0) >= 2) out.add(metric);
  }
  return Array.from(out);
}

export function runValidationSuite(opts: { populationId: string; n?: number; seed?: number; includeResearch?: boolean }): ValidationSuite {
  const metrics = [...backtestableMetrics(), ...(opts.includeResearch === false ? [] : researchBacktestMetrics())];
  const results = metrics.map((metric) =>
    runBacktest({ metric, populationId: opts.populationId, n: opts.n, seed: opts.seed, save: false, stabilityRuns: 3 })
  );
  const byScheme: Record<string, SuiteSummary> = {};
  for (const scheme of Array.from(new Set(results.map((r) => metricScheme(r.metric))))) {
    byScheme[scheme] = summarize(results.filter((r) => metricScheme(r.metric) === scheme));
  }
  const suite: ValidationSuite = {
    id: newId('suite'),
    createdAt: new Date().toISOString(),
    populationId: opts.populationId,
    results,
    summary: { ...summarize(results), byScheme }
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
  const singleWave = linked.filter((m) => (getMetric(m)?.waves.filter((w) => w.groups.all?.all).length || 0) < 2);
  if (!tested.length && singleWave.length === linked.length && mode === 'demo') {
    return {
      status: 'not_validated',
      message: `${NOT_VALIDATED}. Οι συνδεδεμένοι δείκτες έχουν ένα μόνο κύμα μέτρησης, οπότε δεν υπάρχει ανεξάρτητο (held-out) κύμα για έλεγχο. Οι κατανομές ανά ομάδα αναπαράγουν την πηγή· η πρόβλεψη για συνδυασμούς χαρακτηριστικών είναι μοντέλο, όχι μέτρηση.`,
      linkedMetrics: linked,
      backtestIds: []
    };
  }
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
