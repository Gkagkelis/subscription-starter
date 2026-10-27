// Δεδομένα ερευνητικής βαθμίδας: φόρτωση, λειτουργία άδειας, κατανομές
// επιλογών, τράπεζα ερωτήσεων. Χρησιμοποιεί ΤΕΧΝΗΤΟ fixture (όχι πραγματικά δεδομένα).
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getMetric, listMetrics, metricTier } from '@/lib/synthetic-lab/data/noraya';
import { allDatasets } from '@/lib/synthetic-lab/data/registry';
import { resetResearchCache } from '@/lib/synthetic-lab/data/research';
import { optionProbabilities, questionMetrics } from '@/lib/synthetic-lab/engine/evidence';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { bankQuestion, searchBank } from '@/lib/synthetic-lab/engine/question-bank';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { buildReport } from '@/lib/synthetic-lab/engine/report';
import { QuestionSchema } from '@/lib/synthetic-lab/schemas';
import { DEFAULT_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';
import type { StudyPlan } from '@/lib/synthetic-lab/types';

const BANDS = ['15-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const OPTIONS = ['Πολύ', 'Λίγο', 'ΔΓ/ΔΑ'];
// «Πολύ» μειώνεται με την ηλικία: 80% (15-24) -> 20% (65+)
const share = (band: number) => {
  const a = 0.8 - band * 0.12;
  return [a, 0.97 - a, 0.03];
};
const cell = (v: number, n = 200) => ({ value: Math.round(v * 10000) / 100, n, confidence: 'high', sources: 1, inconsistent: false });

function fixture() {
  const metrics = OPTIONS.map((opt, k) => {
    const ag: Record<string, any> = {};
    BANDS.forEach((b, i) => ['male', 'female'].forEach((g) => (ag[`${b}|${g}`] = cell(share(i)[k]))));
    return {
      metric: `fx26_1_T1__${k + 1}`,
      family: 'dianeosis_attitudes',
      label: `Ενδιαφέρον για ψηφιακές υπηρεσίες — «${opt}»`,
      semanticsNote: 'ΤΕΧΝΗΤΟ fixture για tests',
      waves: [{ key: '2026-Q1', year: 2026, quarter: 'Q1', groups: { all: { all: cell([0.5, 0.47, 0.03][k], 1000) }, age_gender: ag } }],
      scheme: 'dianeosis',
      datasetId: 'dianeosis-tpe-fixture'
    };
  });
  return {
    datasetId: 'dianeosis-tpe-fixture',
    tier: 'research_only',
    source: 'fixture',
    license: 'test',
    importedAt: new Date().toISOString(),
    questions: [
      {
        id: 'fx26_1_T1',
        text: 'Πόσο σας ενδιαφέρουν οι ψηφιακές δημόσιες υπηρεσίες;',
        options: OPTIONS,
        dkOptions: ['ΔΓ/ΔΑ'],
        optionMetrics: Object.fromEntries(OPTIONS.map((o, k) => [o, `fx26_1_T1__${k + 1}`])),
        n: 1000
      }
    ],
    metrics
  };
}

beforeAll(() => {
  const dir = path.join(process.env.SYNTHETIC_LAB_DATA_DIR!, 'research');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(fixture()));
  resetResearchCache();
});

afterEach(() => {
  delete process.env.SYNTHETIC_LAB_LICENSE_MODE;
  resetResearchCache();
});

describe('research-tier data', () => {
  it('loads private research metrics in research mode, flagged as research_only', () => {
    expect(getMetric('fx26_1_T1__1')?.scheme).toBe('dianeosis');
    expect(metricTier('fx26_1_T1__1')).toBe('research_only');
    expect(listMetrics().some((m) => m.metric === 'fx26_1_T1__2')).toBe(true);
    // ανοιχτοί δείκτες παραμένουν ανοιχτοί
    expect(metricTier('ict_online_purchase_12m')).toBe('open');
  });

  it('excludes research-tier data in commercial licence mode', () => {
    process.env.SYNTHETIC_LAB_LICENSE_MODE = 'commercial';
    resetResearchCache();
    expect(getMetric('fx26_1_T1__1')).toBeNull();
    expect(searchBank('ψηφιακές υπηρεσίες').some((e) => e.id === 'fx26_1_T1')).toBe(false);
    expect(allDatasets().find((d) => d.tier === 'research_only')?.usage).toBe('not_connected');
  });

  it('builds a valid multi-option question from the bank', () => {
    const hits = searchBank('ψηφιακές υπηρεσίες');
    expect(hits[0].id).toBe('fx26_1_T1');
    expect(hits[0].tier).toBe('research_only');
    const q = bankQuestion('fx26_1_T1', 'src1')!;
    expect(QuestionSchema.safeParse(q).success).toBe(true);
    expect(q.evidenceLink!.positiveOption).toBe('Πολύ'); // συχνότερη ουσιαστική απάντηση, όχι ΔΓ/ΔΑ
    expect(questionMetrics(q)).toHaveLength(3);
  });

  it('simulated answers follow the per-option source distribution, by age', async () => {
    const q = bankQuestion('fx26_1_T1', 'src1')!;
    const plan: StudyPlan = {
      domain: 'social_policy',
      kind: 'survey',
      title: 't',
      researchQuestion: 'Ενδιαφέρον για ψηφιακές υπηρεσίες',
      questions: [q],
      assumptions: [],
      audience: { minAge: 15 },
      sampleSize: 1500,
      warnings: [],
      plannerVersion: 'test',
      plannerMode: 'rules'
    };
    const run = await runSurvey({ plan, populationId: DEFAULT_POPULATION_ID, seed: 11, save: false });
    const agg = run.aggregates[0];
    expect(agg.basisMix.empirical_prior).toBeGreaterThan(95);
    const age = new Map(loadPopulation(DEFAULT_POPULATION_ID)!.personas.map((p) => [p.id, p.ageBand]));
    const answers = run.respondents.map((r) => ({ age: age.get(r.personaId), choice: r.answers[0].value?.choice }));
    const shareOf = (band: string) => {
      const a = answers.filter((x) => x.age === band);
      return a.filter((x) => x.choice === 'Πολύ').length / a.length;
    };
    expect(shareOf('15-24')).toBeGreaterThan(0.65);
    expect(shareOf('65+')).toBeLessThan(0.35);
    expect(run.datasetsUsed).toContain('dianeosis-tpe-fixture');
    const report = buildReport(run);
    expect(JSON.stringify(report)).toContain('ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ');
    expect(run.validation.message).toContain('ένα μόνο κύμα');
  });

  it('normalizes option probabilities to sum to 1', () => {
    const q = bankQuestion('fx26_1_T1', 'src1')!;
    const fits: any = {};
    questionMetrics(q).forEach((m, i) => (fits[m] = { p: new Map([['p1', [0.6, 0.6, 0.06][i]]]) }));
    const d = optionProbabilities(q, fits, 'p1')!;
    expect(d.reduce((s, x) => s + x.p, 0)).toBeCloseTo(1, 10);
    expect(d[0].p).toBeCloseTo(0.6 / 1.26, 10);
  });

  it('planner suggests matching source questions (s*) with a research-only warning', () => {
    const r = planStudy({ text: 'Μέτρο για ψηφιακές δημόσιες υπηρεσίες στους δήμους', domain: 'social_policy' });
    const s = r.plan!.questions.find((q) => q.id === 's1');
    expect(s?.evidenceLink?.optionMetrics).toBeTruthy();
    expect(r.plan!.warnings.join(' ')).toContain('ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ');
  });
});
