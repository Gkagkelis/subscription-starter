import { describe, expect, it, beforeAll } from 'vitest';
import { setClientForTests, StudyBudget, BudgetExceededError } from '@/lib/synthetic-lab/ai/live';
import { controlFocusGroup, createFocusGroup, stepFocusGroup, transcriptMarkdown } from '@/lib/synthetic-lab/engine/focus-group';
import { llmRespond } from '@/lib/synthetic-lab/engine/llm-responder';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { compareScenarios } from '@/lib/synthetic-lab/engine/scenarios';
import { NOT_VALIDATED, runBacktest, validationSummaryForQuestions } from '@/lib/synthetic-lab/engine/validation';
import { DEFAULT_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';
import type { Question } from '@/lib/synthetic-lab/types';

const POP = DEFAULT_POPULATION_ID;

describe('validation engine', () => {
  it('backtests on a held-out wave with baselines, coverage and stability', () => {
    const r = runBacktest({ metric: 'trust_national_government', populationId: POP, n: 600, stabilityRuns: 3, save: false });
    expect(r.trainWave < r.testWave).toBe(true);
    expect(r.groups.find((g) => g.dimension === 'all')).toBeTruthy();
    expect(Number.isFinite(r.maePp)).toBe(true);
    expect(Number.isFinite(r.expectedMaePp)).toBe(true);
    expect(r.persistenceMaePp).not.toBeNull();
    expect(r.sensitivity).toHaveLength(4);
    expect(r.stability.runs).toBe(3);
    expect(r.coverage95).toBeGreaterThanOrEqual(0);
    expect(r.coverage95).toBeLessThanOrEqual(100);
    expect(r.demographicCheck.length).toBeGreaterThan(3);
  });
  it('never claims validation for questions without empirical link', () => {
    const qs: Question[] = [{ id: 'q1', type: 'likert', text: 'Πόσο σας ενδιαφέρει;' }];
    const v = validationSummaryForQuestions(qs);
    expect(v.status).toBe('not_validated');
    expect(v.message).toBe(NOT_VALIDATED);
  });
});

describe('focus group engine', () => {
  it('runs, pauses, resumes, completes and exports with valid references', async () => {
    let s = createFocusGroup({ topic: 'Νέο πρόγραμμα κινητής 25€', domain: 'consumer', guide: ['Πρώτη εντύπωση;', 'Τι θα σας απέτρεπε;'], participants: 4, rounds: 2, populationId: POP, seed: 8 });
    expect(s.participants).toHaveLength(4);
    expect(new Set(s.participants.map((p) => p.personaId)).size).toBe(4);
    s = await stepFocusGroup(s.id, 3);
    expect(s.transcript).toHaveLength(3);
    s = controlFocusGroup(s.id, 'pause');
    const paused = await stepFocusGroup(s.id, 3);
    expect(paused.transcript).toHaveLength(3); // σε παύση δεν προχωρά
    s = controlFocusGroup(s.id, 'resume');
    while (s.status !== 'completed') s = await stepFocusGroup(s.id, 10);
    expect(s.synthesis).not.toBeNull();
    // κάθε αναφορά σε άλλον ομιλητή αφορά κάποιον που έχει ήδη μιλήσει
    s.transcript.forEach((t, i) => (t.references || []).forEach((ref) => expect(s.transcript.slice(0, i).some((x) => x.speaker === ref)).toBe(true)));
    expect(transcriptMarkdown(s)).toContain('SIMULATED RESPONSE');
  });
  it('blocks political focus groups', () => {
    const s = createFocusGroup({ topic: 'Πώς να πείσουμε ψηφοφόρους της ΝΔ', domain: 'social_policy', guide: ['Τι σκέφτεστε;'], populationId: POP });
    expect(s.status).toBe('blocked');
  });
});

describe('scenario comparison', () => {
  it('uses the same respondents for every scenario and checks sensitivity', async () => {
    const plan = planStudy({ text: 'Νέο πρόγραμμα κινητής τηλεφωνίας 25€', domain: 'consumer', sampleSize: 300 }).plan!;
    const c = await compareScenarios({
      basePlan: plan,
      populationId: POP,
      seed: 12,
      scenarios: [
        { id: 'A', label: 'Φθηνό', description: '15€', price: 15, quality: 3 },
        { id: 'B', label: 'Ακριβό', description: '40€', price: 40, quality: 3 }
      ]
    });
    expect(c.status).toBe('completed');
    expect(c.pairwise).toHaveLength(1);
    // ίδια ποιότητα, χαμηλότερη τιμή -> υψηλότερη πρόθεση (λόγω δηλωμένης παραδοχής τιμής)
    expect(c.pairwise[0].diff).toBeGreaterThan(0);
    expect(c.sensitivity.length).toBe(5);
    expect(c.warnings.join(' ')).toMatch(/ΔΕΝ είναι μερίδια αγοράς/);
  });
});

describe('live responder (mocked client, no network)', () => {
  beforeAll(() => {
    setClientForTests({
      beta: {
        messages: {
          create: async () => ({
            model: 'claude-opus-5-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 1000, output_tokens: 200 },
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  answers: [
                    { question_id: 'q1', choice: 'ναι', choices: null, scale_index: null, ranking: null, text: null, accepted_prices: null, rationale: 'r' },
                    { question_id: 'q2', choice: null, choices: null, scale_index: 3, ranking: null, text: null, accepted_prices: null, rationale: 'r' }
                  ]
                })
              }
            ]
          })
        }
      }
    });
  });
  it('parses structured output, snaps options and records cost', async () => {
    const p = loadPopulation(POP)!.personas[0];
    const qs: Question[] = [
      { id: 'q1', type: 'single_choice', text: 'Θα το δοκιμάζατε;', options: ['Ναι', 'Όχι'] },
      { id: 'q2', type: 'likert', text: 'Ενδιαφέρον;' }
    ];
    const budget = new StudyBudget(1, 1, 'claude-opus-5-5');
    const r = await llmRespond({ runId: 't', persona: p, questions: qs, priorFits: {}, model: 'claude-opus-5-5', budget, signal: new AbortController().signal, seed: 1 });
    expect(r.answers[0].value?.choice).toBe('Ναι');
    expect(r.answers[1].value?.scaleIndex).toBe(3);
    expect(r.answers.every((a) => a.basis === 'llm')).toBe(true);
    expect(budget.spent).toBeCloseTo((1000 * 4 + 200 * 20) / 1e6, 8);
  });
  it('refuses calls that would exceed the study cost cap', async () => {
    const p = loadPopulation(POP)!.personas[0];
    const budget = new StudyBudget(0.000001, 1, 'claude-opus-5-5');
    await expect(
      llmRespond({ runId: 't2', persona: p, questions: [{ id: 'q1', type: 'likert', text: 'x' }], priorFits: {}, model: 'claude-opus-5-5', budget, signal: new AbortController().signal, seed: 1 })
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
