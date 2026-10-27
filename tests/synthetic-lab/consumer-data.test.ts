// Καταναλωτικά δεδομένα ανοιχτών πηγών: Έρευνα Καταναλωτών ΕΕ/ΙΟΒΕ (ισοζύγια) και Eurostat ΤΠΕ.
import { describe, expect, it } from 'vitest';
import { BCS, BCS_DATASET_ID, bcsDeviation, bcsIndicator, bcsMembership, climateSummary } from '@/lib/synthetic-lab/data/ec-bcs';
import { allDatasets } from '@/lib/synthetic-lab/data/registry';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { bankQuestion } from '@/lib/synthetic-lab/engine/question-bank';
import { norayaMembership, silcHousehold } from '@/lib/synthetic-lab/data/noraya';
import { cesSummary, spendingContext } from '@/lib/synthetic-lab/data/consumer-context';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import type { Persona } from '@/lib/synthetic-lab/types';

const persona = (o: Partial<Persona>): Persona => ({ id: 'x', ageBand: '35-44', gender: 'female', education: 'tertiary', incomeQuintile: 3, regionCode: 'GRCr101', weight: 1, ...o }) as Persona;

describe('EU consumer survey (DG ECFIN / IOBE)', () => {
  it('is loaded as open data with Greek balances by group', () => {
    expect(BCS.indicators.map((i) => i.question)).toEqual(expect.arrayContaining(['COF', '8', '9', '11']));
    const cof = bcsIndicator('COF')!;
    expect(cof.groups.all.all.latest).toBeLessThan(0); // ελληνική εμπιστοσύνη καταναλωτών αρνητική
    expect(Object.keys(cof.groups.income_quartile)).toEqual(['1', '2', '3', '4']);
    const d = allDatasets().find((x) => x.id === BCS_DATASET_ID)!;
    expect(d.tier).toBe('open');
    expect(d.usage).toBe('used');
    expect(climateSummary()).toMatch(/εμπιστοσύνη καταναλωτών/);
  });

  it('maps personas to survey groups (quintile → quartile overlap) and sums group deviations', () => {
    expect(bcsMembership(persona({ ageBand: '5-14' }))).toBeNull();
    const m = bcsMembership(persona({ incomeQuintile: 2, ageBand: '25-34' }))!;
    expect(m.income_quartile).toEqual({ '1': 0.25, '2': 0.75 });
    expect(Object.values(m.age_group).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const ind = bcsIndicator('9')!;
    const p = persona({ ageBand: '65+', gender: 'male', education: 'primary', incomeQuintile: 1 });
    const t = ind.groups.all.all.mean12m!;
    const manual =
      ind.groups.age_group['65+'].mean12m! - t + (ind.groups.gender.male.mean12m! - t) + (ind.groups.education_group.low_education.mean12m! - t) + (ind.groups.income_quartile['1'].mean12m! - t);
    expect(bcsDeviation(p, '9')).toBeCloseTo(manual, 6);
  });

  it('consumer plans carry the data-based climate assumption and cite the source', async () => {
    const r = planStudy({ text: 'Νέα συνδρομή streaming ταινιών με 9€ τον μήνα' });
    const a = r.plan!.assumptions.find((x) => x.id === 'consumer_climate_link')!;
    expect(a.enabled).toBe(true);
    expect(a.source).toBe('data');
    expect(r.plan!.warnings.join(' ')).toMatch(/Οικονομικό κλίμα/);
    const run = await runSurvey({ plan: { ...r.plan!, sampleSize: 200 }, populationId: DEFAULT_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1 });
    expect(run.datasetsUsed).toContain(BCS_DATASET_ID);
    expect(run.datasetsUsed).toContain('eurostat-isoc-ict');
  });
});

describe('EU-SILC household finances and consumer context', () => {
  it('maps household type × poverty risk and builds source questions with the right options', () => {
    expect(silcHousehold(persona({ householdType: 'single', gender: 'female' } as any))).toEqual({ F1: 1 });
    expect(silcHousehold(persona({ householdType: 'couple_with_children', householdSize: '3-4' } as any))).toEqual({ A2_DCH1: 0.5, A2_DCH2: 0.5 });
    const m = norayaMembership(persona({ householdType: 'couple', incomeQuintile: 1 } as any), 'eurostat_silc')!;
    expect(m.hh_pov).toEqual({ 'A2|below': 1 });
    const q = bankQuestion('silc_unexpected_expense', 'h1')!;
    expect(q.options).toEqual(['Ναι', 'Όχι']);
    expect(q.evidenceLink!.positiveOption).toBe('Όχι'); // ο δείκτης μετρά την ΑΔΥΝΑΜΙΑ
    const d = bankQuestion('silc_ends_meet', 'h2')!;
    expect(d.options).toHaveLength(6);
    expect(Object.keys(d.evidenceLink!.optionMetrics!)).toHaveLength(6);
  });

  it('adds ECB and household budget context to consumer reports', () => {
    expect(cesSummary()).toMatch(/αναμενόμενος 12 μηνών/);
    const lines = spendingContext('Νέο πρόγραμμα κινητής τηλεφωνίας 25€');
    expect(lines[0]).toMatch(/τηλεφωνίας και internet/);
  });
});

