import { describe, expect, it } from 'vitest';
import { latestWave, waveCells } from '@/lib/synthetic-lab/data/noraya';
import { checkText } from '@/lib/synthetic-lab/engine/guardrails';
import { planStudy, extractPrice, detectDomain } from '@/lib/synthetic-lab/engine/planner';
import { fitPriorModel } from '@/lib/synthetic-lab/engine/prior-model';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { buildReport, reportMarkdown, responsesCsv } from '@/lib/synthetic-lab/engine/report';
import { DEFAULT_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';
import { SIMULATED_LABEL } from '@/lib/synthetic-lab/types';

const POP = DEFAULT_POPULATION_ID;

describe('guardrails', () => {
  it('blocks electoral persuasion, parties and vote intention', () => {
    expect(checkText('Πώς να πείσουμε τους αναποφάσιστους ψηφοφόρους').allowed).toBe(false);
    expect(checkText('Τι ποσοστό θα πάρει η ΝΔ στις εκλογές;').allowed).toBe(false);
    expect(checkText('Πρόθεση ψήφου νέων 18-24').allowed).toBe(false);
    expect(checkText('Αξιολόγηση του ΚΚΕ').allowed).toBe(false);
  });
  it('allows ordinary consumer and neutral policy topics (no false positives)', () => {
    expect(checkText('Νέα ελαστικά αυτοκινήτου στα 80€').allowed).toBe(true);
    expect(checkText('Μια νίκη για τον καταναλωτή: φθηνότερο ρεύμα').allowed).toBe(true);
    expect(checkText('Πρόγραμμα ελπίδα για εκκεντρικά αθλήματα').allowed).toBe(true);
    expect(checkText('Μέτρο επιδότησης ενοικίου για νέους').allowed).toBe(true);
    expect(checkText('pollution in Athens').allowed).toBe(true);
  });
});

describe('planner', () => {
  it('turns the reference example into a consumer plan with price test', () => {
    const r = planStudy({ text: 'Θέλω να δοκιμάσω ένα νέο πρόγραμμα κινητής τηλεφωνίας που κοστίζει 25€ τον μήνα' });
    expect(r.blocked).toBe(false);
    expect(r.plan!.domain).toBe('consumer');
    expect(extractPrice('κοστίζει 25€ τον μήνα')).toBe(25);
    expect(extractPrice('12,5 ευρώ')).toBe(12.5);
    const types = r.plan!.questions.map((q) => q.type);
    expect(types).toEqual(expect.arrayContaining(['concept_test', 'likert', 'price_test', 'multiple_choice', 'open_ended']));
    expect(r.plan!.questions.find((q) => q.followUpOf)).toBeTruthy();
    expect(r.plan!.assumptions.find((a) => a.id === 'reference_price')!.value).toBe(25);
  });
  it('links policy topics to empirical metrics', () => {
    expect(detectDomain('Μέτρο επιδότησης ενοικίου για νέους')).toBe('social_policy');
    const r = planStudy({ text: 'Μέτρο επιδότησης ενοικίου για νέους' });
    const linked = r.plan!.questions.filter((q) => q.evidenceLink).map((q) => q.evidenceLink!.metric);
    expect(linked).toEqual(['issue_country_housing', 'trust_national_government']);
  });
});

describe('prior model', () => {
  it('fits observed group margins on the synthetic population', () => {
    const pop = loadPopulation(POP)!;
    const wave = latestWave('trust_national_government')!;
    const fit = fitPriorModel('trust_national_government', wave, pop.personas);
    expect(fit.converged).toBe(true);
    for (const t of fit.usedTargets.filter((x) => x.dimension !== 'all')) expect(Math.abs(t.fitted - t.target)).toBeLessThan(1.5);
    expect(fit.outOfUniverse).toBeGreaterThan(0); // παιδιά < 15 εκτός πληθυσμού έρευνας
  });
  it('shrinkage pulls group targets toward the overall share', () => {
    const pop = loadPopulation(POP)!;
    const wave = latestWave('trust_national_government')!;
    const spread = (k: number) => {
      const f = fitPriorModel('trust_national_government', wave, pop.personas, { shrinkage: k });
      const g = f.usedTargets.filter((t) => t.dimension === 'age_group').map((t) => t.fitted);
      return Math.max(...g) - Math.min(...g);
    };
    expect(spread(5000)).toBeLessThan(spread(0));
  });
  it('merges non-identifiable EB age groups 15-17 and 18-24', () => {
    const cells = waveCells(latestWave('trust_national_government')!, 'age_group');
    expect(cells['15-24']).toBeDefined();
    expect(cells['15-17']).toBeUndefined();
    expect(cells['18-24']).toBeUndefined();
  });
});

describe('survey engine (demo)', () => {
  const plan = planStudy({ text: 'Μέτρο επιδότησης ενοικίου για νέους' }).plan!;
  it('is reproducible, labelled and stores everything required', async () => {
    const a = await runSurvey({ plan, populationId: POP, seed: 11, save: false, stabilityRuns: 3 });
    const b = await runSurvey({ plan, populationId: POP, seed: 11, save: false, stabilityRuns: 0 });
    expect(a.status).toBe('completed');
    expect(a.aggregates).toEqual(b.aggregates);
    expect(a.respondents.every((r) => r.label === SIMULATED_LABEL)).toBe(true);
    expect(a.seed).toBe(11);
    expect(a.engine.engineVersion).toMatch(/demo-rules/);
    expect(a.cost.usd).toBe(0);
    expect(a.datasetsUsed).toEqual(['glopop-s-grc-2015', 'noraya-public-opinion']);
    expect(a.stability!.runs).toBe(3);
    expect(a.warnings.join(' ')).toMatch(/baseline 2015/);
  });
  it('empirically linked answers track the observed share', async () => {
    const run = await runSurvey({ plan: { ...plan, sampleSize: 2000 }, populationId: POP, seed: 3, save: false, stabilityRuns: 0 });
    const trust = run.aggregates.find((x) => x.questionId === 'q2')!;
    const observed = latestWave('trust_national_government')!.groups.all.all.value;
    expect(trust.basisMix.empirical_prior).toBe(100);
    expect(trust.evidenceKind).toBe('estimate');
    expect(Math.abs(trust.shares![0].share - observed)).toBeLessThan(5);
    // ερώτηση χωρίς σύνδεση δεν παρουσιάζεται ως εκτίμηση
    expect(run.aggregates.find((x) => x.questionId === 'q3')!.evidenceKind).toBe('simulation');
  });
  it('blocks political questions inside the questionnaire', async () => {
    const bad = { ...plan, questions: [...plan.questions, { id: 'qx', type: 'single_choice' as const, text: 'Ποιο κόμμα θα ψηφίζατε;', options: ['Α', 'Β'] }] };
    const run = await runSurvey({ plan: bad, populationId: POP, seed: 1, save: false });
    expect(run.status).toBe('blocked');
    expect(run.respondents).toHaveLength(0);
  });
  it('follow-up questions are only answered when the condition holds', async () => {
    const cp = planStudy({ text: 'Νέο πρόγραμμα κινητής 25€ τον μήνα' }).plan!;
    const run = await runSurvey({ plan: cp, populationId: POP, seed: 2, save: false, stabilityRuns: 0 });
    const scale = cp.questions.find((q) => q.id === 'q2')!.scale!;
    for (const r of run.respondents) {
      const q2 = r.answers.find((a) => a.questionId === 'q2')!;
      const q6 = r.answers.find((a) => a.questionId === 'q6')!;
      const neg = ['Σίγουρα όχι', 'Μάλλον όχι'].includes(scale[q2.value!.scaleIndex!]);
      expect(q6.skipped).toBe(!neg);
    }
  });
  it('price acceptance is monotone non-increasing in price', async () => {
    const cp = planStudy({ text: 'Νέο πρόγραμμα κινητής 25€ τον μήνα' }).plan!;
    const run = await runSurvey({ plan: cp, populationId: POP, seed: 5, save: false, stabilityRuns: 0 });
    const curve = run.aggregates.find((a) => a.questionId === 'q3')!.priceCurve!;
    for (let i = 1; i < curve.length; i++) expect(curve[i].acceptance).toBeLessThanOrEqual(curve[i - 1].acceptance);
  });
  it('report has all 13 sections and exports carry the simulated label', async () => {
    const run = await runSurvey({ plan, populationId: POP, seed: 4, save: false, stabilityRuns: 0 });
    const rep = buildReport(run);
    expect(rep.sections.map((s) => s.title.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '6–7', '8', '9', '10', '11', '12', '13']);
    expect(reportMarkdown(rep)).toContain(SIMULATED_LABEL);
    const csv = responsesCsv(run).split('\n');
    expect(csv[0]).toContain('label');
    expect(csv[1]).toContain(SIMULATED_LABEL);
  });
});
