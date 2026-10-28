import { describe, expect, it } from 'vitest';
import { getMetric, latestWaveFor, waveBeforeCutoff } from '@/lib/synthetic-lab/data/noraya';
import { PARTY_KEYS } from '@/lib/synthetic-lab/data/political-build';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import type { Question } from '@/lib/synthetic-lab/types';

describe('political data (NORAYA vote intention / leaders)', () => {
  it('exposes vote-intention metrics as internal-use evidence with a derived total', () => {
    const nd = getMetric('pol:vote:nd')!;
    expect(nd).toBeTruthy();
    expect(nd.tier).toBe('research_only');
    expect(nd.waves.every((w) => w.groups.all?.all && w.groups.gender)).toBe(true);
    // ίδιο σύνολο κομμάτων ανά κύμα ≈ 100% των εγκύρων
    const w = nd.waves.find((x) => x.key === '2019-Q2')!;
    const sum = Object.values(PARTY_KEYS)
      .map((k) => getMetric(`pol:vote:${k}`)?.waves.find((x) => x.key === w.key)?.groups.all?.all?.value || 0)
      .reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan(95);
    expect(sum).toBeLessThan(105);
  });

  it('applies a month-level cutoff: July 2022 cannot see the Q4 2022 wave', () => {
    expect(waveBeforeCutoff({ year: 2022, quarter: 'Q4' }, { asOfYear: 2022, asOfMonth: 7 })).toBe(false);
    expect(waveBeforeCutoff({ year: 2022, quarter: 'Q2' }, { asOfYear: 2022, asOfMonth: 7 })).toBe(true);
    expect(waveBeforeCutoff({ year: 2022, quarter: '' }, { asOfYear: 2022, asOfMonth: 7 })).toBe(false);
    expect(waveBeforeCutoff({ year: 2022, quarter: '' }, { asOfYear: 2022 })).toBe(true);
    expect(latestWaveFor('pol:vote:nd', { asOfYear: 2022, asOfMonth: 7 }).wave?.key).toBe('2019-Q2');
    expect(latestWaveFor('pol:vote:nd', { asOfYear: 2022 }).wave?.key).toBe('2022-Q4');
  });

  it('a vote-intention question linked to the data reproduces the measured shares', async () => {
    const base = planStudy({ text: 'Πρόθεση ψήφου', domain: 'social_policy', sampleSize: 1500 }).plan!;
    const parties = ['nd', 'syriza', 'pasok_kinal', 'kke', 'elliniki_lysi', 'mera25', 'other'];
    const labels = ['ΝΔ', 'ΣΥΡΙΖΑ', 'ΠΑΣΟΚ/ΚΙΝΑΛ', 'ΚΚΕ', 'Ελληνική Λύση', 'ΜέΡΑ25', 'Άλλο κόμμα'];
    const q: Question = {
      id: 'v1',
      type: 'single_choice',
      text: 'Αν είχαμε εκλογές αύριο, ποιο κόμμα θα ψηφίζατε;',
      options: labels,
      evidenceLink: {
        datasetId: 'noraya-political',
        metric: 'pol:vote:nd',
        positiveOption: 'ΝΔ',
        optionMetrics: Object.fromEntries(labels.map((l, i) => [l, `pol:vote:${parties[i]}`]))
      }
    };
    const plan = { ...base, referenceYear: 2022, referenceMonth: 12, questions: [q] };
    const run = await runSurvey({ plan, populationId: DEFAULT_POPULATION_ID, seed: 7, save: false, stabilityRuns: 0 });
    expect(run.status).toBe('completed');
    const agg = run.aggregates.find((a) => a.questionId === 'v1')!;
    const nd = agg.shares!.find((s) => s.option === 'ΝΔ')!.share;
    const target = latestWaveFor('pol:vote:nd', { asOfYear: 2022, asOfMonth: 12 }).wave!.groups.all.all.value;
    // οι επιλογές της ερώτησης καλύπτουν ~97% των εγκύρων· η ΝΔ πρέπει να είναι κοντά στη μέτρηση
    expect(Math.abs(nd - target)).toBeLessThan(5);
    expect(agg.basisMix.empirical_prior || 0).toBeGreaterThan(0);
  });
});
