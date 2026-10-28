// Greek Research Data Lake στο simulation engine: ανάκτηση, χρονικός κανόνας, holdout, προέλευση.
// Χρησιμοποιεί ΤΕΧΝΗΤΟ μικρό lake σε προσωρινό φάκελο (όχι πραγματικά δεδομένα — αυτά ελέγχονται στο lake-real.test.ts).
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { expandHoldout, lakeMeta, lakeMetric, resetLakeCache, searchLake } from '@/lib/synthetic-lab/data/lake';
import { getMetric, latestWaveFor, metricScheme, norayaMembership } from '@/lib/synthetic-lab/data/noraya';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { bankQuestion, searchBank } from '@/lib/synthetic-lab/engine/question-bank';
import { evidenceContextForPlan, fitPriorsForQuestions, runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { buildReport } from '@/lib/synthetic-lab/engine/report';
import { BASELINE_POPULATION_ID, DEFAULT_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';
import { PlanSchema } from '@/lib/synthetic-lab/schemas';
import type { StudyPlan } from '@/lib/synthetic-lab/types';

const BANDS = ['15-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const cell = (v: number, n = 150) => ({ value: v, n, confidence: 'survey', sources: 1, inconsistent: false });
const OPTS = ['Very concerned', 'Fairly concerned', 'Not concerned', "Don't know"];

function ebWave(year: number, very: number) {
  const vals = [very, 30, 100 - very - 32, 2];
  const groups: Record<string, Record<string, any>> = { all: { all: cell(very, 1000) } };
  groups.gender = { male: cell(very - 4, 480), female: cell(very + 4, 520) };
  groups.age_band = Object.fromEntries(BANDS.map((b, i) => [b, cell(very - 10 + 4 * i)]));
  return (k: number) => ({
    key: String(year),
    year,
    quarter: '',
    groups: k === 0 ? groups : { all: { all: cell(vals[k], 1000) }, gender: { male: cell(vals[k], 480), female: cell(vals[k], 520) } }
  });
}

function ebStudy(id: string, year: number, very: number, extra: Partial<any> = {}) {
  const w = ebWave(year, very);
  const metrics = OPTS.map((o, k) => ({
    metric: `lake:${id}::QA1::${k}`,
    family: 'lake:eurobarometer',
    label: `QA1 How concerned are you about electricity prices? — «${o}»`,
    question: 'QA1 How concerned are you about electricity prices?',
    semanticsNote: 'ΤΕΧΝΗΤΟ fixture',
    waves: [w(k)],
    scheme: 'lake',
    datasetId: id,
    tier: 'open'
  }));
  const study = {
    studyId: id, source: 'eurobarometer', title: `Fixture Eurobarometer energy ${year}`, publisher: 'fixture', url: null, doi: null,
    license: 'CC BY 4.0', tier: 'open', level: 'B', quality: 80, representativeness: 'national_probability', sampleSize: 1000,
    yearStart: year, yearEnd: year, fieldwork: String(year), population: '15+', topics: ['energy'], dedupKey: `energy|${year}`, duplicates: [],
    shard: `${id.replace(/[^a-z0-9]/gi, '_')}.json`, questions: 1, ...extra
  };
  const question = {
    id: `lake:${id}::QA1`, studyId: id, kind: 'distribution', code: 'QA1', text: 'QA1 How concerned are you about electricity prices?',
    options: OPTS, dkOptions: ["Don't know"], optionMetrics: Object.fromEntries(OPTS.map((o, k) => [o, `lake:${id}::QA1::${k}`])),
    years: [year], n: 1000, topics: ['energy'], multi: false
  };
  return { study, question, metrics };
}

function writeLake(dir: string) {
  const a = ebStudy('eurobarometer:fx_energy_2019', 2019, 40);
  const b = ebStudy('eurobarometer:fx_energy_2023', 2023, 62, { duplicates: ['cessda:fx_dup'] });
  const c = ebStudy('zenodo:fx_copy_2023', 2023, 61, { source: 'zenodo', dedupKey: 'energy|2023', tier: 'research_only', level: 'A' });
  const silcId = 'eurostat:fx_ilc_warm';
  const sw = (year: number, v: number) => ({
    key: String(year), year, quarter: '',
    groups: { all: { all: { ...cell(v, 0), nUnknown: true } }, income_quintile: Object.fromEntries([1, 2, 3, 4, 5].map((q) => [String(q), { ...cell(v + 12 - 6 * q, 0), nUnknown: true }])) }
  });
  const silc = {
    study: { ...ebStudy(silcId, 2015, 0).study, source: 'eurostat', title: 'Fixture EU-SILC warm home', topics: ['energy', 'housing'], dedupKey: 'warm|', yearStart: 2015, yearEnd: 2025 },
    question: { id: `lake:${silcId}::w`, studyId: silcId, kind: 'binary', code: 'w', text: 'Inability to keep home adequately warm — heating', options: ['Ναι', 'Όχι'], dkOptions: [], optionMetrics: { Ναι: `lake:${silcId}::w` }, years: [2015, 2021, 2025], n: null, topics: ['energy'], multi: false },
    metrics: [{ metric: `lake:${silcId}::w`, family: 'lake:eurostat', label: 'Inability to keep home adequately warm', question: 'Inability to keep home adequately warm', semanticsNote: 'fixture', waves: [sw(2015, 29), sw(2021, 17), sw(2025, 19)], scheme: 'lake', datasetId: silcId, tier: 'open', answerOptions: ['Ναι', 'Όχι'], positiveOption: 'Ναι' }]
  };
  const all = [a, b, c, silc];
  mkdirSync(path.join(dir, 'export', 'shards'), { recursive: true });
  for (const s of all) writeFileSync(path.join(dir, 'export', 'shards', s.study.shard), JSON.stringify({ studyId: s.study.studyId, metrics: s.metrics }));
  writeFileSync(
    path.join(dir, 'export', 'lake_index.json'),
    JSON.stringify({ version: 'test', generatedAt: '2026-01-01T00:00:00Z', studies: all.map((s) => s.study), questions: all.map((s) => s.question), dimensions: [] })
  );
}

beforeAll(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lake-fixture-'));
  writeLake(dir);
  process.env.SYNTHETIC_LAB_LAKE_DIR = dir;
  resetLakeCache();
});

afterEach(() => {
  delete process.env.SYNTHETIC_LAB_LICENSE_MODE;
  resetLakeCache();
});

describe('Greek Research Data Lake — ανάκτηση', () => {
  it('φορτώνει το ευρετήριο και τους δείκτες κατά απαίτηση', () => {
    expect(lakeMeta()).toMatchObject({ available: true, studies: 4, questions: 4 });
    const m = lakeMetric('lake:eurobarometer:fx_energy_2019::QA1::0');
    expect(m?.scheme).toBe('lake');
    expect(getMetric('lake:eurobarometer:fx_energy_2019::QA1::0')?.waves[0].year).toBe(2019);
    expect(metricScheme('lake:eurobarometer:fx_energy_2019::QA1::0')).toBe('lake');
  });

  it('ελληνικό ερώτημα βρίσκει αγγλικές ερωτήσεις πηγής (ρεύμα → electricity) με προέλευση', () => {
    const hits = searchLake('Πόσο ανησυχούν για τις τιμές του ρεύματος;');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].question.text).toMatch(/electricity/);
    expect(hits[0].study.level).toBeDefined();
    expect(hits[0].breakdown.matched.length).toBeGreaterThan(0);
  });

  it('χρονικός κανόνας: με έτος αναφοράς 2020 δεν επιστρέφεται τίποτα μεταγενέστερο', () => {
    const hits = searchLake('electricity prices', { asOfYear: 2020 });
    expect(hits.map((h) => h.study.studyId)).toContain('eurobarometer:fx_energy_2019');
    expect(hits.every((h) => h.year <= 2020)).toBe(true);
    expect(hits.map((h) => h.study.studyId)).not.toContain('eurobarometer:fx_energy_2023');
    expect(latestWaveFor('lake:eurostat:fx_ilc_warm::w', { asOfYear: 2022 }).wave?.year).toBe(2021);
    expect(latestWaveFor('lake:eurostat:fx_ilc_warm::w', { asOfYear: 2014 })).toMatchObject({ wave: null, excluded: 'after_reference_year' });
  });

  it('holdout: εξαιρείται η μελέτη ΚΑΙ τα διπλότυπα/παράγωγά της (ίδιο κλειδί, άλλο αποθετήριο)', () => {
    const h = expandHoldout(['eurobarometer:fx_energy_2023']);
    expect(h.has('zenodo:fx_copy_2023')).toBe(true);
    expect(h.has('cessda:fx_dup')).toBe(true);
    expect(h.has('eurobarometer:fx_energy_2019')).toBe(false);
    const ids = searchLake('electricity prices', { holdout: ['eurobarometer:fx_energy_2023'] }).map((x) => x.study.studyId);
    expect(ids).not.toContain('eurobarometer:fx_energy_2023');
    expect(ids).not.toContain('zenodo:fx_copy_2023');
    expect(ids).toContain('eurobarometer:fx_energy_2019');
  });

  it('εμπορική λειτουργία: εξαιρούνται μελέτες research_only', () => {
    process.env.SYNTHETIC_LAB_LICENSE_MODE = 'commercial';
    resetLakeCache();
    expect(searchLake('electricity prices').map((x) => x.study.studyId)).not.toContain('zenodo:fx_copy_2023');
  });

  it('η τράπεζα ερωτήσεων περιλαμβάνει το lake και φτιάχνει ερώτηση με δείκτες ανά επιλογή', () => {
    const entries = searchBank('τιμές ρεύματος');
    expect(entries.some((e) => e.lake?.studyId === 'eurobarometer:fx_energy_2023')).toBe(true);
    const q = bankQuestion('lake:eurobarometer:fx_energy_2019::QA1', 'k1')!;
    expect(q.options).toEqual(OPTS);
    expect(Object.keys(q.evidenceLink!.optionMetrics!)).toHaveLength(4);
    const b = bankQuestion('lake:eurostat:fx_ilc_warm::w', 'k2')!;
    expect(b.options).toEqual(['Ναι', 'Όχι']);
  });

  it('σχήμα lake: συμμετοχή προσώπου σε ηλικία, φύλο, μόρφωση και πεμπτημόριο', () => {
    const pop = loadPopulation(DEFAULT_POPULATION_ID)!;
    const p = pop.personas.find((x) => x.ageBand === '35-44' && x.incomeQuintile)!;
    const m = norayaMembership(p, 'lake')!;
    expect(m.age_band).toEqual({ '35-44': 1 });
    expect(m.age_group4).toEqual({ '25-39': 0.5, '40-54': 0.5 });
    expect(m.income_quintile[String(p.incomeQuintile)]).toBe(1);
  });
});

describe('Greek Research Data Lake — στη συνθετική έρευνα', () => {
  it('fit με χρονικό όριο: μεταγενέστερη μελέτη εξαιρείται ρητά, προγενέστερη χρησιμοποιείται με προέλευση', () => {
    const pop = loadPopulation(DEFAULT_POPULATION_ID)!;
    const q19 = bankQuestion('lake:eurobarometer:fx_energy_2019::QA1', 'k1')!;
    const q23 = bankQuestion('lake:eurobarometer:fx_energy_2023::QA1', 'k2')!;
    const r = fitPriorsForQuestions([q19, q23], pop.personas, [], { asOfYear: 2020 });
    const used = r.provenance.filter((p) => p.kind === 'observed');
    const excluded = r.provenance.filter((p) => p.kind === 'excluded');
    expect(used.length).toBe(4);
    expect(used.every((p) => p.year === 2019 && p.datasetId === 'eurobarometer:fx_energy_2019')).toBe(true);
    expect(used[0].dimensions).toEqual(expect.arrayContaining(['gender', 'age_band']));
    expect(excluded.length).toBe(4);
    expect(excluded[0].reason).toMatch(/έτος αναφοράς 2020/);
    expect(r.warnings.join(' ')).toMatch(/k2/);
  });

  it('holdout μέσω του σχεδίου μελέτης: η μελέτη αξιολόγησης δεν τροφοδοτεί το μοντέλο', () => {
    const ctx = evidenceContextForPlan({ referenceYear: null, holdoutDatasets: ['eurobarometer:fx_energy_2023'] });
    const pop = loadPopulation(DEFAULT_POPULATION_ID)!;
    const q23 = bankQuestion('lake:eurobarometer:fx_energy_2023::QA1', 'k2')!;
    const r = fitPriorsForQuestions([q23], pop.personas, [], ctx);
    expect(Object.keys(r.fits)).toHaveLength(0);
    expect(r.provenance.every((p) => p.kind === 'excluded' && /holdout/.test(p.reason!))).toBe(true);
  });

  it('planner + εκτέλεση με έτος αναφοράς 2020: ερώτηση lake, baseline πληθυσμός, προέλευση ≤ 2020, αναφορά', async () => {
    const r = planStudy({ text: 'Πόσο ανησυχούν οι καταναλωτές για τις τιμές του ρεύματος;', referenceYear: 2020 });
    const plan = r.plan as StudyPlan;
    expect(plan.referenceYear).toBe(2020);
    const k = plan.questions.find((q) => q.id.startsWith('k'));
    expect(k?.evidenceLink?.datasetId).toBe('eurobarometer:fx_energy_2019');
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    const run = await runSurvey({ plan: { ...plan, sampleSize: 200 }, populationId: DEFAULT_POPULATION_ID, seed: 7, save: false, stabilityRuns: 1 });
    expect(run.status).toBe('completed');
    if (loadPopulation(BASELINE_POPULATION_ID) && (DEFAULT_POPULATION_ID as string) !== BASELINE_POPULATION_ID) {
      expect(run.populationId).toBe(BASELINE_POPULATION_ID);
      expect(run.evidenceContext?.populationNote).toMatch(/2020/);
    }
    const lakeProv = (run.provenance || []).filter((p) => p.datasetId.startsWith('eurobarometer:fx'));
    expect(lakeProv.length).toBeGreaterThan(0);
    expect((run.provenance || []).filter((p) => p.kind === 'observed').every((p) => (p.year ?? 0) <= 2020)).toBe(true);
    expect(run.datasetsUsed).toContain('eurobarometer:fx_energy_2019');
    const report = buildReport(run);
    const prov = report.sections.find((s) => s.id === 'provenance');
    expect(prov?.paragraphs.join(' ')).toMatch(/2020/);
    expect(prov?.bullets?.some((b) => /Fixture Eurobarometer energy 2019/.test(b))).toBe(true);
  });
});
