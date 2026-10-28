// Persona Intelligence Engine (PIE): ισοδυναμία χαρακτηριστικών με το Python, κατηγορίες υποστήριξης, αναπαραγωγιμότητα,
// ψήφος χωρίς δημοσκοπήσεις, πύλη προώθησης. Τα tests με πραγματικό μοντέλο τρέχουν μόνο όπου υπάρχει το ιδιωτικό snapshot.
import { cpSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/pie-feature-parity.json';
import { FEATURES, clearPersonaModelCache, defaultModelVersion, featureVector, loadPersonaModel, readRegistry, type PersonaAnchors, type PersonaDemographics, type PersonaModel } from '@/lib/synthetic-lab/persona/model';
import { buildPanel, generateAnchors, theta, type PersonaState } from '@/lib/synthetic-lab/persona/panel';
import { PIE_TEMPORAL_LIMIT_YEARS, answerPersona, prepareQuestion } from '@/lib/synthetic-lab/persona/respond';
import { loadScenario } from '@/lib/synthetic-lab/persona/vote';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { CALIBRATED_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import { dataRoot } from '@/lib/synthetic-lab/storage/paths';
import type { Question, StudyPlan } from '@/lib/synthetic-lab/types';

const REAL_MODELS = path.join(__dirname, '..', '..', '.synthetic-lab-data', 'persona', 'models');
const MODEL = 'pie-0.2';
const realOk = existsSync(path.join(REAL_MODELS, MODEL, 'model.json'));
beforeAll(() => {
  if (realOk) cpSync(path.join(REAL_MODELS, MODEL), path.join(dataRoot(), 'persona', 'models', MODEL), { recursive: true });
  clearPersonaModelCache();
});

// ---------------------------------------------------------------- μικρό μοντέλο-fixture (χωρίς ιδιωτικά δεδομένα)
const FEATS = ['female', 'econ'];
const fixtureModel: PersonaModel = {
  version: 'fixture', engine: 'pie', createdAt: '2026-10-01', codeCommit: null, cutoff: '2026-10', licencePolicy: 'research', holdout: [], l2: 1, factors: true,
  dataSnapshot: 'fixture', features: FEATS, constructs: [], nItems: 2, syntheticInputs: false,
  sources: [{ fileId: 'f2024', family: 'x', source: 'fixture', url: '', wave: '2024-11', waveApprox: false, n: 1000, licence: 'test', tier: 'open', commercialUse: '', mode: '', population: '', pvElection: null }],
  anchorNodes: [{ node: 'econ4', categories: ['1', '2', '3', '4'], feats: ['female'], means: [0.5], a: [0, 0.5, 0.5, 0], B: [[0], [0.2], [-0.2], [0]], trainFiles: ['f2024'], wave: '2024-11', n: 1000, pvElection: null, observed: {} }],
  items: [
    { id: 'f2024::A', file: 'f2024', wave: '2024-11', type: 'ordinal', text: 'A', options: [{ code: '1', label: 'καθόλου' }, { code: '2', label: 'λίγο' }, { code: '3', label: 'πολύ' }],
      feats: FEATS, means: [0.5, 0], n: 1000, dkShare: 0.05, dk: { a: -3, b: [0, 0] }, observed: [0.3, 0.4, 0.3], model: { kind: 'ordinal', b: [0.1, 0.5], tau: [-0.5, 0.5] },
      lambda: 0.6, factorKey: 'f2024:b1', inSampleMaxErrPp: 0 },
    { id: 'f2015::B', file: 'f2024', wave: '2015-04', type: 'binary', text: 'B', options: [{ code: '1', label: 'ναι' }, { code: '2', label: 'όχι' }],
      feats: FEATS, means: [0.5, 0], n: 1000, dkShare: 0, observed: [0.5, 0.5], model: { kind: 'nominal', a: [0, 0.2], B: [[0, 0], [0.1, -0.3]] }, lambda: 0, inSampleMaxErrPp: 0 }
  ]
};
const SCALE = ['Καθόλου', 'Λίγο', 'Πολύ', 'ΔΞ/ΔΑ'];
const q = (id: string, personaLink: Question['personaLink'], options = SCALE): Question => ({ id, type: 'single_choice', text: id, options, personaLink }) as Question;
const MAP = { Καθόλου: ['1'], Λίγο: ['2'], Πολύ: ['3'] };
const demo: PersonaDemographics = { age_band: '35-44', gender: 'female', edu3: 'high', nuts1: 'attica', urban: 'urban' };
const state = (i: number): PersonaState => ({ personaId: `p${i}`, weight: 1, demographics: demo, anchors: generateAnchors(fixtureModel, demo, 1000 + i), pseed: 77 + i });

describe('PIE — ισοδυναμία χαρακτηριστικών με το pie.py', () => {
  it('ίδια λίστα και σειρά χαρακτηριστικών', () => expect([...FEATURES]).toEqual(fixture.features));
  it('ίδιες τιμές (NaN ↔ null) για τα σενάρια του fixture', () => {
    fixture.rows.forEach((r, i) => {
      const { age_band, gender, edu3, nuts1, urban, ...rest } = r as Record<string, unknown>;
      const fv = featureVector({ age_band, gender, edu3, nuts1, urban } as PersonaDemographics, rest as unknown as Partial<PersonaAnchors>);
      for (const f of fixture.features) {
        const exp = (fixture.expected[i] as Record<string, number | null>)[f];
        if (exp == null) expect(Number.isNaN(fv[f]), `${i}:${f}`).toBe(true);
        else expect(fv[f], `${i}:${f}`).toBeCloseTo(exp, 6);
      }
    });
  });
});

describe('PIE — κατηγορίες υποστήριξης', () => {
  it('χωρίς σύνδεση → NOT_RELIABLY_ESTIMABLE και καμία απάντηση', () => {
    const pq = prepareQuestion(fixtureModel, q('Q', null), '2026-10');
    expect(pq.support).toBe('NOT_RELIABLY_ESTIMABLE');
    const a = answerPersona(pq, state(1), 1);
    expect(a.skipped).toBe(true);
    expect(a.value).toBeNull();
  });
  it('ίδια ερώτηση, πρόσφατο κύμα → DIRECTLY_SUPPORTED με προέλευση', () => {
    const pq = prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2024::A', optionMap: MAP, dkOption: 'ΔΞ/ΔΑ' }), '2026-10');
    expect(pq.support).toBe('DIRECTLY_SUPPORTED');
    expect(pq.provenance.generatedBy).toBe('statistical_model');
    expect(pq.provenance.latentTrait).toEqual({ key: 'f2024:b1', loading: 0.6 });
  });
  it(`κύμα παλαιότερο από ${PIE_TEMPORAL_LIMIT_YEARS} έτη ή «equivalent» → MODEL_EXTRAPOLATED με ρητή παραδοχή`, () => {
    const old = prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2015::B', optionMap: { Ναι: ['1'], Όχι: ['2'] } }, ['Ναι', 'Όχι']), '2026-10');
    expect(old.support).toBe('MODEL_EXTRAPOLATED');
    expect(old.assumption).toMatch(/Σταθερότητα/);
    const eq = prepareQuestion(fixtureModel, q('Q', { kind: 'equivalent', itemId: 'f2024::A', optionMap: MAP, assumption: 'παρόμοια διατύπωση' }), '2026-10');
    expect(eq.support).toBe('MODEL_EXTRAPOLATED');
  });
  it('μεταγενέστερο κύμα, ελλιπής ή διπλή αντιστοίχιση → NOT_RELIABLY_ESTIMABLE (καμία διάσπαση κατηγορίας)', () => {
    expect(prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2024::A', optionMap: MAP }), '2023-01').support).toBe('NOT_RELIABLY_ESTIMABLE');
    expect(prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2024::A', optionMap: { Καθόλου: ['1'], Πολύ: ['3'] } }), '2026-10').support).toBe('NOT_RELIABLY_ESTIMABLE');
    expect(prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2024::A', optionMap: { Καθόλου: ['1'], Λίγο: ['2', '3'], Πολύ: ['3'] } }), '2026-10').support).toBe('NOT_RELIABLY_ESTIMABLE');
  });
  it('άγκυρα του προσώπου: η απάντηση είναι η τιμή της άγκυρας', () => {
    const pq = prepareQuestion(fixtureModel, q('Q', { kind: 'direct', optionMap: {}, anchor: { name: 'econ4', optionMap: { Καθόλου: ['1'], Λίγο: ['2'], Πολύ: ['3', '4'] } } }), '2026-10');
    expect(pq.support).toBe('DIRECTLY_SUPPORTED');
    const ps = state(3);
    const a = answerPersona(pq, ps, 9);
    const expected = ps.anchors.econ4 === 1 ? 'Καθόλου' : ps.anchors.econ4 === 2 ? 'Λίγο' : 'Πολύ';
    expect(a.value).toEqual({ choice: expected });
  });
});

describe('PIE — αναπαραγωγιμότητα και λανθάνοντα χαρακτηριστικά', () => {
  it('ίδιος σπόρος → ίδιες άγκυρες· θ σταθερό ανά πρόσωπο και κλειδί', () => {
    expect(generateAnchors(fixtureModel, demo, 42)).toEqual(generateAnchors(fixtureModel, demo, 42));
    expect(theta(5, 'k')).toBe(theta(5, 'k'));
    expect(theta(5, 'k')).not.toBe(theta(5, 'other'));
  });
  it('ίδια ερώτηση, ίδιος σπόρος → ίδια απάντηση', () => {
    const pq = prepareQuestion(fixtureModel, q('Q', { kind: 'direct', itemId: 'f2024::A', optionMap: MAP, dkOption: 'ΔΞ/ΔΑ' }), '2026-10');
    const ps = state(5);
    expect(answerPersona(pq, ps, 123)).toEqual(answerPersona(pq, ps, 123));
  });
});

describe('PIE — μητρώο εκδόσεων', () => {
  it('καμία έκδοση δεν είναι εγκεκριμένη χωρίς όνομα εγκρίνοντος και αξιολόγηση', () => {
    for (const v of readRegistry()) if (v.status === 'approved') expect(v.approvedBy && v.evaluation).toBeTruthy();
  });
  it('το προεπιλεγμένο μοντέλο δηλώνει αν είναι μόνο υποψήφιο', () => {
    const d = defaultModelVersion('research');
    if (d.version) expect(['approved', 'candidate']).toContain(d.status);
  });
  it('σενάριο ψήφου: μόνο γεγονότα (εκλογές, θέσεις CHES), καμία δημοσκόπηση', () => {
    const s = loadScenario('2026-10')!;
    expect(s.parties.length).toBeGreaterThan(5);
    for (const p of s.parties) expect(p.prevShare == null || /επίσημο αποτέλεσμα/.test(p.prevShareSource)).toBe(true);
    expect(Object.keys(s).some((k) => /poll/i.test(k))).toBe(false);
  });
});

describe.skipIf(!realOk)('PIE — πραγματικό μοντέλο (ιδιωτικό snapshot)', () => {
  it('το μοντέλο πιστοποιεί πραγματικές εισόδους', () => {
    const m = loadPersonaModel(MODEL)!;
    expect(m.syntheticInputs).toBe(false);
    expect(m.anchorNodes.map((n) => n.node)).toContain('lr7');
  });
  it('panel: ίδιος σπόρος → ίδια πρόσωπα', () => {
    const a = buildPanel({ modelVersion: MODEL, populationId: CALIBRATED_POPULATION_ID, size: 60, seed: 11, save: false });
    const b = buildPanel({ modelVersion: MODEL, populationId: CALIBRATED_POPULATION_ID, size: 60, seed: 11, save: false });
    expect(a.personas).toEqual(b.personas);
  });
  it('έρευνα: πρώτα πρόσωπα, μετά ατομικές απαντήσεις· NE χωρίς απαντήσεις· ψήφος με αναποφάσιστους/αποχή', async () => {
    const parties = loadScenario('2026-10')!.parties;
    const opts = [...parties.map((p) => p.label), 'Δεν έχω αποφασίσει', 'Δεν σκοπεύω να ψηφίσω'];
    const plan = {
      domain: 'political', kind: 'survey', title: 'PIE test', researchQuestion: 'test', assumptions: [], audience: { minAge: 18 }, sampleSize: 150, warnings: [],
      plannerVersion: 'manual', plannerMode: 'rules', referenceYear: 2026, referenceMonth: 10, engine: 'persona', personaModelVersion: MODEL,
      questions: [
        q('NE', null, ['Ναι', 'Όχι']),
        q('LR', { kind: 'direct', optionMap: {}, anchor: { name: 'lr7', optionMap: { Αριστερά: ['1', '2', '3'], Κέντρο: ['4'], Δεξιά: ['5', '6', '7'], Καμία: ['none'] } } }, ['Αριστερά', 'Κέντρο', 'Δεξιά', 'Καμία']),
        q('VOTE', { kind: 'equivalent', optionMap: {}, vote: { scenario: '2026-10', optionParty: Object.fromEntries(parties.map((p) => [p.label, p.key])), abstainOption: 'Δεν σκοπεύω να ψηφίσω', undecidedOption: 'Δεν έχω αποφασίσει' } }, opts)
      ]
    } as unknown as StudyPlan;
    const run = await runSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: 5, save: false, mode: 'demo', stabilityRuns: 2 });
    expect(run.respondents.length).toBe(150);
    const ne = run.aggregates.find((a) => a.questionId === 'NE')!;
    expect(ne.persona!.support).toBe('NOT_RELIABLY_ESTIMABLE');
    expect(run.respondents.every((r) => r.answers.find((a) => a.questionId === 'NE')!.value === null)).toBe(true);
    const vote = run.respondents.map((r) => (r.answers.find((a) => a.questionId === 'VOTE')!.value as { choice: string } | null)?.choice);
    expect(new Set(vote).size).toBeGreaterThan(3);
    expect(run.aggregates.find((a) => a.questionId === 'VOTE')!.persona!.support).toBe('MODEL_EXTRAPOLATED');
    const partial = prepareQuestion(loadPersonaModel(MODEL)!, { ...plan.questions[2], options: [...opts.slice(0, 3), ...opts.slice(-2)] } as Question, '2026-10');
    expect(partial.support).toBe('NOT_RELIABLY_ESTIMABLE');
    await expect(runSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: 5, save: false, mode: 'live' })).rejects.toThrow();
  });
  it('το μοντέλο δεν περιέχει ατομικές εγγραφές (μόνο παραμέτρους και περιθώρια)', () => {
    const raw = readFileSync(path.join(REAL_MODELS, MODEL, 'items.json'), 'utf8');
    expect(raw).not.toMatch(/"rid"/);
  });
});
