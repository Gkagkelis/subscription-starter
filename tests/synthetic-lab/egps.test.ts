// EGPS (πειραματικό): κατηγορίες τεκμηρίωσης, μεταφορά από συγγενικούς δείκτες, εξαρτήσεις copula.
import { existsSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetLakeCache } from '@/lib/synthetic-lab/data/lake';
import { betaInterval, correlationMatrix, messageEffect, normalScoresCorr, predictMarginal, relationClass, simulateJoint, type EgpsItem } from '@/lib/synthetic-lab/experimental/egps';
import jointParams from '@/config/synthetic-lab/egps/joint_params.json';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '@/lib/synthetic-lab/population/store';

const REAL = process.env.SYNTHETIC_LAB_REAL_LAKE_DIR || path.join(__dirname, '..', '..', '.synthetic-lab-data', 'lake');
const lakeOk = existsSync(path.join(REAL, 'export', 'lake_index.json'));
beforeAll(() => {
  if (lakeOk) {
    process.env.SYNTHETIC_LAB_LAKE_DIR = REAL;
    resetLakeCache();
  }
});
const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
const adults = pop.personas.filter((p) => p.ageBand !== '0-4' && p.ageBand !== '5-14');
const VOD = 'lake:eurostat:isoc_ci_ac_i::86427b640b';
const PAID_SVOD = 'lake:eurostat:isoc_ec_ibgs::66be139691';
const MUSIC = 'lake:eurostat:isoc_ec_ibgs::d28c77321f';

describe('EGPS — κατηγορίες τεκμηρίωσης', () => {
  it('μάρκα χωρίς καμία τεκμηρίωση → NOT_ESTIMABLE, χωρίς σημειακή τιμή', () => {
    const r = predictMarginal({ id: 'aware', text: 'Γνωρίζετε το Cinobo;', options: ['Όχι', 'Ναι'] }, adults);
    expect(r.evidenceClass).toBe('NOT_ESTIMABLE');
    expect(r.overall).toBeNull();
    expect(r.perPerson).toBeUndefined();
  });
  it.skipIf(!lakeOk)('άμεση μέτρηση → EMPIRICALLY_ANCHORED με πιθανότητα ανά πρόσωπο', () => {
    const r = predictMarginal({ id: 'vod', text: 'VOD', options: ['Όχι', 'Ναι'], direct: VOD }, adults, { asOfYear: 2026 });
    expect(r.evidenceClass).toBe('EMPIRICALLY_ANCHORED');
    expect(r.perPerson!.size).toBeGreaterThan(1000);
  });
  it.skipIf(!lakeOk)('συγγενικοί δείκτες → MODEL_EXTRAPOLATED με διάστημα που περιέχει τη σημειακή τιμή', () => {
    const r = predictMarginal({ id: 'svod', text: 'Συνδρομή', options: ['Όχι', 'Ναι'], related: { metrics: [VOD, MUSIC], rationale: 'δοκιμή' } }, adults, { asOfYear: 2026 });
    if (r.evidenceClass === 'MODEL_EXTRAPOLATED') {
      expect(r.overall!.int80[0]).toBeLessThanOrEqual(r.overall!.point);
      expect(r.overall!.int80[1]).toBeGreaterThanOrEqual(r.overall!.point);
      expect(r.overall!.int95[1] - r.overall!.int95[0]).toBeGreaterThanOrEqual(r.overall!.int80[1] - r.overall!.int80[0]);
    } else expect(r.evidenceClass).toBe('NOT_ESTIMABLE');
    expect(r.sources).not.toContain(PAID_SVOD);
  });
  it('ρητή παραδοχή → σενάριο με ευρύ διάστημα, όχι μέτρηση', () => {
    const r = predictMarginal({ id: 'x', text: 'x', options: ['1', '2', '3'], assumption: { probs: [1, 1, 1], rationale: 'ουδέτερο' } }, adults);
    expect(r.basis).toBe('assumption_scenario');
    expect(r.distribution![0].int80[1] - r.distribution![0].int80[0]).toBeGreaterThan(30);
  });
  it('A/B μηνυμάτων → NOT_ESTIMABLE (καμία κατασκευασμένη επίδραση)', () => {
    expect(messageEffect().evidenceClass).toBe('NOT_ESTIMABLE');
  });
  it('διάστημα beta: συμμετρικό για α = β', () => {
    const [lo, hi] = betaInterval(5, 5, 0.8);
    expect(lo + hi).toBeCloseTo(100, 0);
  });
});

describe('EGPS — εξαρτήσεις', () => {
  const ev = (id: string, kind: 'evaluation' | 'intention' | 'usage', object = 'brand'): EgpsItem => ({
    id, text: id, options: ['1', '2', '3', '4', '5'], construct: { object, kind }, assumption: { probs: [1, 2, 3, 3, 1], rationale: 'δοκιμή' }
  });
  it('κατηγορίες σχέσης', () => {
    expect(relationClass({ object: 'a', kind: 'evaluation' }, { object: 'a', kind: 'intention' })).toBe('EI');
    expect(relationClass({ object: 'a', kind: 'evaluation' }, { object: 'b', kind: 'intention' })).toBe('NONE');
    expect(relationClass({ object: 'a', kind: 'general_usage' }, { object: 'b', kind: 'evaluation' })).toBe('UG');
  });
  it('μόνο αποδεκτές κατηγορίες παίρνουν συσχέτιση· οι άλλες μένουν ανεξάρτητες', () => {
    const items = [ev('sat', 'evaluation'), ev('rec', 'intention'), ev('freq', 'usage')];
    const { R, pairs } = correlationMatrix(items);
    const J = (jointParams as any).classes;
    expect(R[0][1]).toBeCloseTo(J.EI.accepted ? J.EI.rho_mean : 0, 6);
    expect(pairs.find((p) => p.cls === 'UE')!.rho).toBe(J.UE.accepted ? J.UE.rho_mean : 0);
  });
  it('η προσομοίωση αναπαράγει την εξάρτηση (EI) και την ανεξαρτησία (UE) χωρίς να αλλάζει τα περιθώρια', () => {
    const items = [ev('sat', 'evaluation'), ev('rec', 'intention'), ev('freq', 'usage')];
    const res = items.map((it) => predictMarginal(it, adults));
    const sim = simulateJoint(items, res, adults, 7);
    const col = (k: string) => sim.map((s) => Number(s.answers[k]));
    const J = (jointParams as any).classes;
    expect(normalScoresCorr(col('sat'), col('rec'))).toBeGreaterThan(J.EI.rho_mean - 0.12);
    expect(Math.abs(normalScoresCorr(col('sat'), col('freq')))).toBeLessThan(0.06);
    const share1 = col('sat').filter((x) => x === 1).length / sim.length;
    expect(share1).toBeGreaterThan(0.07);
    expect(share1).toBeLessThan(0.13);
  });
});
