// Ένταξη EGPS στην πλατφόρμα: μηχανισμός «Τεκμηριωμένη πρόβλεψη», μητρώο μαρκών, αυτόματη επικύρωση ανά κατηγορία.
// Τα δεδομένα μαρκών εδώ είναι ΤΕΧΝΗΤΑ (fixture δοκιμών, προσωρινός φάκελος) — δεν αντιστοιχούν σε πραγματικές μάρκες.
import { describe, expect, it } from 'vitest';
import { importBrandCsv, validateBrandCategory, listBrandMeasurements, deleteBrandMeasurements } from '@/lib/synthetic-lab/data/brands';
import { brandEvidence } from '@/lib/synthetic-lab/engine/evidence-responder';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { normalScoresCorr } from '@/lib/synthetic-lab/experimental/egps';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';
import type { StudyPlan } from '@/lib/synthetic-lab/types';
import jointParams from '@/config/synthetic-lab/egps/joint_params.json';

const adults = loadPopulation(CALIBRATED_POPULATION_ID)!.personas.filter((p) => !['0-4', '5-14'].includes(p.ageBand));

function fixtureCsv(brands: { name: string; v: number }[], license = 'test-fixture') {
  const head = 'category,brand,measure,year,group_dim,group,value,n,source,license';
  const rows = brands.flatMap((b) => [
    `testcat,${b.name},awareness_aided,2026,all,all,${b.v},1000,Τεχνητό fixture,${license}`,
    `testcat,${b.name},awareness_aided,2026,age_band,15-24,${Math.min(100, b.v * 1.3)},,Τεχνητό fixture,${license}`,
    `testcat,${b.name},awareness_aided,2026,age_band,65+,${b.v * 0.6},,Τεχνητό fixture,${license}`
  ]);
  return [head, ...rows].join('\n');
}

describe('Μητρώο μαρκών', () => {
  it('απαιτεί πηγή και άδεια· απορρίπτει μη έγκυρες τιμές', () => {
    const r = importBrandCsv('category,brand,measure,year,group_dim,group,value,n,source,license\ntestcat,X,awareness_aided,2026,all,all,140,,src,\n');
    expect(r.imported).toBe(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('λίγες μάρκες → καμία πρόβλεψη για μάρκα χωρίς μέτρηση (NOT_ESTIMABLE)', () => {
    deleteBrandMeasurements('testcat');
    importBrandCsv(fixtureCsv([{ name: 'Alpha', v: 40 }, { name: 'Beta', v: 35 }, { name: 'Gamma', v: 45 }]));
    expect(validateBrandCategory('testcat', 'awareness_aided').status).toBe('insufficient_brands');
    expect(brandEvidence('testcat', 'Zeta', 'awareness_aided', adults).evidence.evidenceClass).toBe('NOT_ESTIMABLE');
  });
  it('μάρκα με δική της μέτρηση → EMPIRICALLY_ANCHORED· επικυρωμένη κατηγορία → MODEL_EXTRAPOLATED με διάστημα', () => {
    deleteBrandMeasurements('testcat');
    const vals = [38, 42, 35, 47, 40, 44, 36, 41, 39, 45, 43, 37];
    importBrandCsv(fixtureCsv(vals.map((v, i) => ({ name: `Brand ${i + 1}`, v }))));
    expect(listBrandMeasurements().filter((m) => m.category === 'testcat')).toHaveLength(12);
    const v = validateBrandCategory('testcat', 'awareness_aided');
    expect(v.status).toBe('validated');
    const own = brandEvidence('testcat', 'Brand 3', 'awareness_aided', adults);
    expect(own.evidence.evidenceClass).toBe('EMPIRICALLY_ANCHORED');
    expect(own.evidence.point).toBe(35);
    const other = brandEvidence('testcat', 'Νέα μάρκα', 'awareness_aided', adults);
    expect(other.evidence.evidenceClass).toBe('MODEL_EXTRAPOLATED');
    expect(other.evidence.int80![0]).toBeLessThan(other.evidence.point!);
    expect(other.evidence.int80![1]).toBeGreaterThan(other.evidence.point!);
    expect(other.evidence.sources.length).toBe(12);
  });
  it('πολύ ετερογενείς μάρκες → too_uncertain (καμία πρόβλεψη)', () => {
    deleteBrandMeasurements('testcat');
    importBrandCsv(fixtureCsv([3, 90, 12, 75, 5, 60, 25, 85].map((v, i) => ({ name: `Brand ${i + 1}`, v }))));
    expect(['too_uncertain', 'not_better_than_uniform']).toContain(validateBrandCategory('testcat', 'awareness_aided').status);
    deleteBrandMeasurements('testcat');
  });
});

describe('Μηχανισμός «Τεκμηριωμένη πρόβλεψη» στην πλατφόρμα', () => {
  const plan = (engine?: 'standard' | 'evidence'): StudyPlan => ({
    domain: 'consumer', kind: 'survey', title: 'Δοκιμή', researchQuestion: 'Δοκιμή μηχανισμού τεκμηρίωσης για μάρκα',
    questions: [
      { id: 'trust', type: 'single_choice', text: 'Εμπιστεύεστε την κυβέρνηση;', options: ['Τείνω να εμπιστεύομαι', 'Τείνω να μην εμπιστεύομαι'], evidenceLink: { datasetId: 'noraya-public-opinion', metric: 'trust_national_government', positiveOption: 'Τείνω να εμπιστεύομαι' } },
      { id: 'aware', type: 'single_choice', text: 'Γνωρίζετε τη μάρκα X;', options: ['Όχι', 'Ναι'], brandLink: { category: 'testcat2', brand: 'X', measure: 'awareness_aided' } },
      { id: 'use', type: 'single_choice', text: 'Τη χρησιμοποιείτε;', options: ['Όχι', 'Ναι'], followUpOf: { questionId: 'aware', whenAnswerIn: ['Ναι'] } },
      { id: 'sat', type: 'likert', text: 'Ικανοποίηση', scale: ['1', '2', '3', '4', '5'], construct: { object: 'x', kind: 'evaluation' }, scenarioPrior: { probs: [1, 2, 3, 3, 1], rationale: 'σενάριο δοκιμής' } },
      { id: 'rec', type: 'likert', text: 'Σύσταση', scale: ['1', '2', '3', '4', '5'], construct: { object: 'x', kind: 'intention' }, scenarioPrior: { probs: [1, 2, 3, 3, 1], rationale: 'σενάριο δοκιμής' } },
      { id: 'free', type: 'likert', text: 'Χωρίς τίποτα', scale: ['1', '2', '3', '4', '5'] }
    ],
    assumptions: [], audience: { minAge: 18 }, sampleSize: 1200, warnings: [], plannerVersion: 't', plannerMode: 'rules', referenceYear: 2026, engine
  });
  it('NOT_ESTIMABLE: καμία συνθετική απάντηση (αντί για ομοιόμορφη)· follow-up κληρονομεί', async () => {
    const run = await runSurvey({ plan: plan('evidence'), populationId: CALIBRATED_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1 });
    const ag = Object.fromEntries(run.aggregates.map((a) => [a.questionId, a]));
    expect(ag.aware.evidence!.evidenceClass).toBe('NOT_ESTIMABLE');
    expect(ag.aware.n).toBe(0);
    expect(ag.use.evidence!.evidenceClass).toBe('NOT_ESTIMABLE');
    expect(ag.free.evidence!.evidenceClass).toBe('NOT_ESTIMABLE');
    expect(ag.free.n).toBe(0);
    expect(ag.trust.evidence!.evidenceClass).toBe('EMPIRICALLY_ANCHORED');
    expect(ag.trust.n).toBeGreaterThan(500);
    expect(ag.sat.evidence!.evidenceClass).toBe('MODEL_EXTRAPOLATED');
    expect(run.engine.engineVersion).toContain('egps');
    const col = (k: string) => run.respondents.map((r) => r.answers.find((a) => a.questionId === k)!.value!.scaleIndex as number);
    const J = (jointParams as any).classes.EI;
    expect(normalScoresCorr(col('sat'), col('rec'))).toBeGreaterThan(J.rho_mean - 0.15);
  });
  it('ο τυπικός μηχανισμός (prod-1) δεν αλλάζει: ομοιόμορφη προεπιλογή, ανεξάρτητες απαντήσεις', async () => {
    const run = await runSurvey({ plan: plan(), populationId: CALIBRATED_POPULATION_ID, seed: 3, save: false, stabilityRuns: 1 });
    const ag = Object.fromEntries(run.aggregates.map((a) => [a.questionId, a]));
    expect(ag.aware.n).toBeGreaterThan(500);
    expect(ag.aware.evidence).toBeUndefined();
    expect(run.engine.engineVersion).toContain('demo-rules');
  });
});
