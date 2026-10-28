// Integration test στο ΠΡΑΓΜΑΤΙΚΟ τοπικό Greek Research Data Lake (αν υπάρχει).
// Το lake δεν είναι στο repo (gitignored): χωρίς αυτό, τα tests παραλείπονται.
import { existsSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { lakeMeta, lakeStudies, resetLakeCache, searchLake } from '@/lib/synthetic-lab/data/lake';
import { latestWaveFor } from '@/lib/synthetic-lab/data/noraya';
import { bankQuestion } from '@/lib/synthetic-lab/engine/question-bank';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import type { StudyPlan } from '@/lib/synthetic-lab/types';

const REAL = process.env.SYNTHETIC_LAB_REAL_LAKE_DIR || path.join(__dirname, '..', '..', '.synthetic-lab-data', 'lake');
const available = existsSync(path.join(REAL, 'export', 'lake_index.json'));

describe.skipIf(!available)('Πραγματικό Greek Research Data Lake', () => {
  beforeAll(() => {
    process.env.SYNTHETIC_LAB_LAKE_DIR = REAL;
    resetLakeCache();
  });

  it('περιέχει πραγματικές μελέτες από πολλές πηγές', () => {
    const m = lakeMeta();
    expect(m.available).toBe(true);
    expect(m.studies).toBeGreaterThan(50);
    expect(Object.keys(m.bySource).length).toBeGreaterThanOrEqual(3);
    // κάθε μελέτη έχει προέλευση, επίπεδο και ελληνικό πεδίο 2012+
    for (const s of lakeStudies()) {
      expect(s.title).toBeTruthy();
      expect(['A', 'B', 'C', 'D']).toContain(s.level);
      if (s.yearEnd) expect(s.yearEnd).toBeGreaterThanOrEqual(2012);
    }
  });

  it('World Bank Findex: συγκεκριμένη πραγματική εγγραφή και σωστό κύμα ανά έτος αναφοράς', () => {
    const hit = searchLake('bank account', { sources: ['worldbank'], limit: 200 }).find((h) => /^Account$/i.test(h.question.text.trim()));
    expect(hit).toBeTruthy();
    const metric = hit!.question.optionMetrics['Ναι'];
    // Global Findex, Ελλάδα, «Account (% age 15+)», κύμα 2014 = 87.5% (World Bank API)
    const w14 = latestWaveFor(metric, { asOfYear: 2016 }).wave!;
    expect(w14.year).toBe(2014);
    expect(w14.groups.all.all.value).toBeCloseTo(87.5, 0);
    expect(Object.keys(w14.groups)).toEqual(expect.arrayContaining(['gender', 'age_findex', 'income_findex']));
    expect(latestWaveFor(metric, { asOfYear: 2022 }).wave!.year).toBe(2021);
  });

  it('χρονικός κανόνας και holdout σε πραγματικά δεδομένα', () => {
    const hits = searchLake('internet online shopping', { asOfYear: 2016, limit: 100 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.year <= 2016)).toBe(true);
    const top = hits[0].study.studyId;
    const without = searchLake('internet online shopping', { asOfYear: 2016, limit: 100, holdout: [top] });
    expect(without.some((h) => h.study.studyId === top)).toBe(false);
  });

  it('συνθετική έρευνα με ερώτηση του lake: παράμετροι μόνο ≤ έτους αναφοράς, με προέλευση', async () => {
    const hit = searchLake('satisfied life', { asOfYear: 2019, kinds: ['distribution'], sources: ['eurobarometer'], limit: 20 })[0];
    expect(hit).toBeTruthy();
    const q = bankQuestion(hit.question.id, 'k1')!;
    const plan: StudyPlan = {
      domain: 'social_policy', kind: 'survey', title: 'Lake integration', researchQuestion: 'Ικανοποίηση από τη ζωή', questions: [q],
      assumptions: [], audience: { minAge: 15 }, sampleSize: 150, warnings: [], plannerVersion: 'test', plannerMode: 'rules', referenceYear: 2019
    };
    const run = await runSurvey({ plan, populationId: DEFAULT_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1 });
    const used = (run.provenance || []).filter((p) => p.kind === 'observed');
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((p) => (p.year ?? 9999) <= 2019)).toBe(true);
    expect(used[0].datasetId).toBe(hit.study.studyId);
    expect(run.aggregates[0].basisMix.empirical_prior).toBeGreaterThan(0);
  });
});
