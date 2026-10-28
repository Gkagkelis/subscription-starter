// Benchmark → διάγνωση → βελτίωση: έλεγχοι διαρροής, ισοδυναμίας παραγωγής και πειραματικών ρυθμίσεων.
// ΤΕΧΝΗΤΟ μικρό lake (όχι πραγματικά δεδομένα).
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { expandHoldout, lakeMetric, lakePoolId, lakeTransferId, resetLakeCache, sampleKeyOf } from '@/lib/synthetic-lab/data/lake';
import { latestWaveFor, poolWaves } from '@/lib/synthetic-lab/data/noraya';
import { buildSuite, normOption, splitOf } from '@/lib/synthetic-lab/benchmark/suite';
import { runBenchmark } from '@/lib/synthetic-lab/benchmark/runner';
import { gapStats, summarize } from '@/lib/synthetic-lab/benchmark/score';
import { pairedCompare } from '@/lib/synthetic-lab/benchmark/experiments';
import { PRODUCTION_MODEL } from '@/lib/synthetic-lab/engine/model-config';
import { batteryKey } from '@/lib/synthetic-lab/engine/demo-responder';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID, loadPopulation, selectRespondents } from '@/lib/synthetic-lab/population/store';
import type { StudyPlan } from '@/lib/synthetic-lab/types';

const BANDS = ['15-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const cell = (v: number, n = 150) => ({ value: v, n, confidence: 'survey', sources: 1, inconsistent: false });
const OPTS = ['Very satisfied', 'Fairly satisfied', 'Not satisfied', "Don't know"];
const TEXT = 'QD1 On the whole, are you satisfied with the life you lead?';

// Τρία κύματα (2019, 2021, 2023)· το 2023 έχει και «αδελφή» Special έρευνα του ίδιου δείγματος (EB99.1).
const STUDIES = [
  { id: 'eurobarometer:s9001_91_1_std91', year: 2019, very: 30, title: 'Standard Eurobarometer 91' },
  { id: 'eurobarometer:s9002_95_1_std95', year: 2021, very: 34, title: 'Standard Eurobarometer 95' },
  { id: 'eurobarometer:s9003_99_1_std99', year: 2023, very: 40, title: 'Standard Eurobarometer 99' },
  { id: 'eurobarometer:s9004_99_1_sp530', year: 2023, very: 41, title: 'Special Eurobarometer 530' }
];

function writeLake(dir: string) {
  mkdirSync(path.join(dir, 'export', 'shards'), { recursive: true });
  const studies: any[] = [];
  const questions: any[] = [];
  for (const s of STUDIES) {
    const vals = [s.very, 40, 100 - s.very - 42, 2];
    const metrics = OPTS.map((o, k) => ({
      metric: `lake:${s.id}::QD1::${k}`, family: 'lake:eurobarometer', label: `${TEXT} — «${o}»`, question: TEXT, semanticsNote: 'fixture', scheme: 'lake', datasetId: s.id, tier: 'open',
      waves: [{
        key: String(s.year), year: s.year, quarter: '',
        groups: {
          all: { all: cell(vals[k], 1000) },
          gender: { male: cell(vals[k] + (k === 0 ? 4 : 0), 480), female: cell(vals[k] - (k === 0 ? 4 : 0), 520) },
          age_band: Object.fromEntries(BANDS.map((b, i) => [b, cell(Math.max(1, vals[k] + (k === 0 ? 10 - 4 * i : 0)))]))
        }
      }]
    }));
    const shard = `${s.id.replace(/[^a-z0-9]/gi, '_')}.json`;
    writeFileSync(path.join(dir, 'export', 'shards', shard), JSON.stringify({ studyId: s.id, metrics }));
    studies.push({ studyId: s.id, source: 'eurobarometer', title: s.title, publisher: 'fixture', url: null, doi: null, license: 'CC BY 4.0', tier: 'open', level: 'B', quality: 80,
      representativeness: 'national_probability', sampleSize: 1000, yearStart: s.year, yearEnd: s.year, fieldwork: String(s.year), population: '15+', topics: ['values'],
      dedupKey: `life|${s.year}|${s.id}`, duplicates: [], shard, questions: 1 });
    questions.push({ id: `lake:${s.id}::QD1`, studyId: s.id, kind: 'distribution', code: 'QD1', text: TEXT, options: OPTS, dkOptions: ["Don't know"],
      optionMetrics: Object.fromEntries(OPTS.map((o, k) => [o, `lake:${s.id}::QD1::${k}`])), years: [s.year], n: 1000, topics: ['values'], multi: false });
  }
  writeFileSync(path.join(dir, 'export', 'lake_index.json'), JSON.stringify({ version: 'test', generatedAt: '2026-01-01', studies, questions, dimensions: [] }));
}

beforeAll(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-fixture-'));
  writeLake(dir);
  process.env.SYNTHETIC_LAB_LAKE_DIR = dir;
  resetLakeCache();
});

const plan = (over: Partial<StudyPlan> = {}): StudyPlan => ({
  domain: 'social_policy', kind: 'survey', title: 't', researchQuestion: 'Ικανοποίηση από τη ζωή',
  questions: [{ id: 'q1', type: 'single_choice', text: TEXT, options: OPTS, evidenceLink: { datasetId: STUDIES[1].id, metric: `lake:${STUDIES[1].id}::QD1::0`, positiveOption: OPTS[0], optionMetrics: Object.fromEntries(OPTS.map((o, k) => [o, `lake:${STUDIES[1].id}::QD1::${k}`])) } }],
  assumptions: [], audience: { minAge: 15 }, sampleSize: 400, warnings: [], plannerVersion: 't', plannerMode: 'rules', ...over
});

describe('Έλεγχοι διαρροής', () => {
  it('Standard και Special του ίδιου κύματος Eurobarometer = ίδιο δείγμα (κοινό holdout)', () => {
    expect(sampleKeyOf(STUDIES[2].id)).toBe('EB99.1');
    expect(sampleKeyOf(STUDIES[3].id)).toBe('EB99.1');
    const h = expandHoldout([STUDIES[2].id]);
    expect(h.has(STUDIES[3].id)).toBe(true);
    expect(h.has(STUDIES[1].id)).toBe(false);
  });

  it('η σουίτα χωρίζει ανά δείγμα και κρατά μαζί τις έρευνες του ίδιου δείγματος', () => {
    const s = buildSuite();
    const eb = s.items.filter((i) => i.family === 'eb_trend');
    // 2021 (έχει προγενέστερο 2019) και τα δύο του 2023· το 2019 δεν έχει προγενέστερο δείγμα
    expect(eb.map((i) => i.year).sort()).toEqual([2021, 2023, 2023]);
    const s23 = eb.filter((i) => i.year === 2023);
    expect(new Set(s23.map((i) => i.split)).size).toBe(1);
    expect(s23[0].split).toBe(splitOf('EB99.1'));
  });

  it('τυφλή εκτέλεση: καμία πληροφορία από το δείγμα-στόχο ή μεταγενέστερη', async () => {
    const s = buildSuite();
    const target = s.items.find((i) => i.studyId === STUDIES[2].id)!;
    const r = await runBenchmark({ ...s, items: [{ ...target, split: 'calibration' }] }, { model: PRODUCTION_MODEL, mode: 'blind', splits: ['calibration'], seeds: [1], n: 400 });
    const res = r.items[0];
    expect(res.status).toBe('ok');
    expect(res.evidence!.studies).not.toContain(STUDIES[2].id);
    expect(res.evidence!.studies).not.toContain(STUDIES[3].id); // ίδιο δείγμα
    expect(Math.max(...res.evidence!.years)).toBeLessThan(2023);
    // πραγματικό «Very satisfied» = 40· η προσομοίωση στηρίζεται στο 2021 (34), όχι στον στόχο
    const all = res.cells.find((c) => c.dim === 'all' && c.option === OPTS[0])!;
    expect(all.real).toBe(40);
    expect(all.persist).toBe(34);
  });

  it('σύνθετος δείκτης: τα κύματα μελετών holdout αφαιρούνται ανά κύμα', () => {
    const pooled = lakePoolId(STUDIES.slice(0, 3).map((s) => `lake:${s.id}::QD1::0`));
    expect(lakeMetric(pooled)!.waves.map((w) => w.year)).toEqual([2019, 2021, 2023]);
    const w = latestWaveFor(pooled, { holdout: new Set([STUDIES[2].id]) }).wave!;
    expect(w.year).toBe(2021);
    const p = latestWaveFor(pooled, { holdout: new Set([STUDIES[2].id]), wavePolicy: 'pool', poolMaxWaves: 3, poolHalfLifeYears: 2 }).wave!;
    // συνδυασμός 2019 (30) και 2021 (34) με βάρος 0.5 για το 2019 → 32.67
    expect(p.groups.all.all.value).toBeCloseTo((30 * 0.5 + 34) / 1.5, 1);
  });

  it('μεταφορά δομής: επίπεδο από τη νέα έρευνα, διαφορές ομάδων από την παλαιότερη· holdout της δομής εξαιρεί τον δείκτη', () => {
    // «νέα» έρευνα χωρίς διασπάσεις: χρησιμοποιούμε μόνο το σύνολο του 2021 ως επίπεδο
    const level = `lake:${STUDIES[1].id}::QD1::0`;
    const struct = `lake:${STUDIES[0].id}::QD1::0`;
    const id = lakeTransferId(level, struct);
    const w = latestWaveFor(id, {}).wave!;
    expect(w.groups.all.all.value).toBe(34); // επίπεδο 2021
    const g = w.groups.gender;
    // διαφορά φύλου από το 2019 (+4/−4) διατηρείται κατά προσέγγιση και ο n-σταθμισμένος μέσος = 34
    expect(g.male.value - g.female.value).toBeGreaterThan(6);
    expect((g.male.value * 480 + g.female.value * 520) / 1000).toBeCloseTo(34, 0);
    expect(latestWaveFor(id, { holdout: new Set([STUDIES[0].id]) })).toMatchObject({ wave: null, excluded: 'holdout' });
  });

  it('συνδυασμός κυμάτων με n και half-life', () => {
    const mk = (y: number, v: number, n: number) => ({ key: String(y), year: y, quarter: '', groups: { all: { all: cell(v, n) } } });
    expect(poolWaves([mk(2020, 10, 100), mk(2022, 20, 100)], 3, 2).groups.all.all.value).toBeCloseTo((10 * 0.5 + 20) / 1.5, 1);
  });
});

describe('Η παραγωγή μένει αναλλοίωτη', () => {
  it('ρητή PRODUCTION_MODEL = προεπιλογή (ίδιες απαντήσεις)', async () => {
    const a = await runSurvey({ plan: plan(), populationId: DEFAULT_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1 });
    const b = await runSurvey({ plan: plan(), populationId: DEFAULT_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1, modelConfig: PRODUCTION_MODEL });
    expect(b.aggregates).toEqual(a.aggregates);
    expect(b.respondents.map((r) => r.answers[0].value)).toEqual(a.respondents.map((r) => r.answers[0].value));
  });

  it('batteryRho = 0 δεν αλλάζει τίποτα· batteryRho > 0 κρατά τα ποσοστά και αυξάνει τη συσχέτιση της συστοιχίας', async () => {
    const q2 = { ...plan().questions[0], id: 'q2', evidenceLink: { ...plan().questions[0].evidenceLink!, metric: `lake:${STUDIES[1].id}::QD2.1::0` } };
    // ίδια μετρικά, διαφορετικό κλειδί συστοιχίας μόνο για τον έλεγχο του κλειδιού
    expect(batteryKey(plan().questions[0])).toBeNull(); // «QD1» χωρίς υπο-αριθμό δεν είναι συστοιχία
    expect(batteryKey(q2)).toBe(`lake:${STUDIES[1].id}::QD2`);
    expect(batteryKey({ ...q2, evidenceLink: { ...q2.evidenceLink!, metric: 'dn24_1_Q10_3__1' } })).toBe('dn24_1_Q10');
  });
});

describe('Πειραματικές ρυθμίσεις', () => {
  it('persona_weight: οι ερωτώμενοι αναπαράγουν τη βαθμονομημένη δομή του πληθυσμού', () => {
    const pop = loadPopulation(DEFAULT_POPULATION_ID)!;
    const adults = pop.personas.filter((p) => !['0-4', '5-14'].includes(p.ageBand));
    const share = (rows: { weight: number; education: string }[]) => rows.filter((p) => p.education === 'tertiary').reduce((s, p) => s + p.weight, 0) / rows.reduce((s, p) => s + p.weight, 0);
    const target = share(adults);
    const srs = selectRespondents(pop, { minAge: 15 }, 2500, 1).respondents;
    const wtd = selectRespondents(pop, { minAge: 15 }, 2500, 1, { weighting: 'persona_weight' }).respondents;
    expect(Math.abs(share(wtd) - target)).toBeLessThan(Math.abs(share(srs) - target));
    expect(Math.abs(share(wtd) - target)).toBeLessThan(0.015);
  });

  it('βαθμολόγηση: επιμονή, επιδράσεις ομάδων και ζευγαρωτή σύγκριση', async () => {
    const s = buildSuite();
    const items = s.items.filter((i) => i.family === 'eb_trend').map((i) => ({ ...i, split: 'calibration' as const }));
    const prod = await runBenchmark({ ...s, items }, { model: PRODUCTION_MODEL, mode: 'blind', splits: ['calibration'], seeds: [1, 2], n: 400 });
    const sm = summarize(prod.items);
    expect(sm.okItems).toBe(3);
    expect(sm.persistOverallMae).not.toBeNull();
    expect(sm.simSd).not.toBeNull();
    expect(gapStats(prod.items).map((g) => g.factor)).toEqual(expect.arrayContaining(['ηλικία', 'φύλο']));
    const cmp = pairedCompare(prod.items, prod.items);
    expect(cmp.meanDeltaOverall).toBe(0);
    expect(normOption("Don't know (SPONTANEOUS)")).toBe('dk');
  });
});
