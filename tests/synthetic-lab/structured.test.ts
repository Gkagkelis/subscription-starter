// Structured engine (γρήγορος στατιστικός μηχανισμός για δομημένα ερωτηματολόγια) + ενιαίες κατηγορίες τεκμηρίωσης E/T/S.
import { cpSync, existsSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { clearPersonaModelCache } from '@/lib/synthetic-lab/persona/model';
import { CALIBRATED_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import { dataRoot } from '@/lib/synthetic-lab/storage/paths';
import { classFromAseMode, classFromBasis, classFromEgps, classFromPieTier, questionClass } from '@/lib/synthetic-lab/structured/evidence-class';
import { derivedClass, runStructuredStudy, validateSpec } from '@/lib/synthetic-lab/structured/engine';
import { evalBool, evalNum, identifiers } from '@/lib/synthetic-lab/structured/expr';
import type { StructuredStudySpec } from '@/lib/synthetic-lab/structured/types';

const REAL_MODELS = path.join(__dirname, '..', '..', '.synthetic-lab-data', 'persona', 'models');
const MODEL = 'pie-0.7';
const realOk = existsSync(path.join(REAL_MODELS, MODEL, 'model.json'));
beforeAll(() => {
  if (realOk) cpSync(path.join(REAL_MODELS, MODEL), path.join(dataRoot(), 'persona', 'models', MODEL), { recursive: true });
  clearPersonaModelCache();
});

describe('expr — συνθήκες και αριθμητική (ίδια σύνταξη με το ASE)', () => {
  const env = (a: Record<string, unknown>) => (n: string) => (n in a ? (a[n] as never) : undefined);
  it('συγκρίσεις, in, contains, and/or/not, null για μη απαντημένη ερώτηση', () => {
    const e = env({ Q01: '1', Q02: ['2', '4'], Q05: null, age_band: '65+' });
    expect(evalBool("Q01 == '1' and contains(Q02, '4')", e)).toBe(true);
    expect(evalBool("Q05 == '1'", e)).toBe(false);
    expect(evalBool("Q05 != '1'", e)).toBe(true);
    expect(evalBool("age_band in ['55-64', '65+'] and not contains(Q02, '1')", e)).toBe(true);
    expect(evalBool("Q01 == '2' or contains(Q02, '9')", e)).toBe(false);
  });
  it('αριθμητικές συναρτήσεις και λογικές τιμές ως 1/0', () => {
    const e = env({ a: 0.2, b: 0.5, Q06: '2' });
    expect(evalNum('union(a, b)', e)).toBeCloseTo(0.6);
    expect(evalNum("a * (0.5 + 0.5 * (Q06 == '2'))", e)).toBeCloseTo(0.2);
    expect(evalNum('inv_logit(logit(b))', e)).toBeCloseTo(0.5);
    expect(evalNum('min(0.9, a / max(b, 0.05))', e)).toBeCloseTo(0.4);
    expect(identifiers("contains(Q23, '7') and L_brand > 0").sort()).toEqual(['L_brand', 'Q23']);
  });
  it('άγνωστο όνομα → σφάλμα (όχι σιωπηλή τιμή)', () => {
    expect(() => evalBool("Q99 == '1'", () => undefined)).toThrow();
  });
});

describe('E/T/S — ενιαία ταξινόμηση πάνω στους υπάρχοντες μηχανισμούς (χωρίς αλλαγή συμπεριφοράς)', () => {
  it('prod-1 / EGPS / PIE / ASE', () => {
    expect(classFromBasis('empirical_prior')).toBe('E');
    expect(classFromBasis('model_extrapolated')).toBe('T');
    expect(classFromBasis('assumption')).toBe('S');
    expect(classFromBasis('uninformed')).toBe('S');
    expect(classFromBasis('not_estimable')).toBeNull();
    expect(classFromEgps('EMPIRICALLY_ANCHORED')).toBe('E');
    expect(classFromEgps('MODEL_EXTRAPOLATED')).toBe('T');
    expect(classFromEgps('NOT_ESTIMABLE')).toBeNull();
    expect(classFromPieTier(1)).toBe('E');
    expect(classFromPieTier(3)).toBe('T');
    expect(classFromPieTier(5)).toBeNull();
    expect(classFromAseMode('C_EVIDENCE_CONSTRAINED')).toBe('T');
    expect(classFromAseMode('D_AI')).toBe('S');
  });
  it('κατηγορία ερώτησης = η ασθενέστερη με ουσιαστικό μερίδιο (συντηρητικός κανόνας)', () => {
    expect(questionClass(['E', 'E', 'E', 'S']).cls).toBe('S');
    expect(questionClass([...Array(99).fill('E'), 'S']).cls).toBe('E');
    expect(questionClass(['T', 'E', null]).cls).toBe('T');
  });
});

function spec(over: Partial<StructuredStudySpec> = {}): StructuredStudySpec {
  return {
    studyId: 'test', title: 'test', specVersion: 't1', domain: 'consumer', referenceYear: 2026,
    population: { populationId: CALIBRATED_POPULATION_ID, pieModel: MODEL, minAge: 18 },
    metrics: { m1: { metric: 'lake:eurostat:does_not_exist::x', label: 'ανύπαρκτος δείκτης', fallback: 0.3 } },
    latents: [{ name: 'L', effects: [{ var: 'econ4', coef: -0.3, center: 2.5 }] }],
    questions: [
      { id: 'D1', block: 'B', type: 'single_choice', text: 'Φύλο', options: [{ code: '1', label: 'Γ' }, { code: '2', label: 'Α' }], condition: null, class: 'E', model: { kind: 'profile', attribute: 'gender', map: { female: '1', male: '2' } } },
      { id: 'A1', block: 'B', type: 'single_choice', text: 'Αγόρασε;', options: [{ code: '1', label: 'Ναι' }, { code: '2', label: 'Όχι' }], condition: null, class: 'T',
        model: { kind: 'nominal', base: { '1': 0.5, '2': 0.5 }, lowerBounds: [{ code: '1', expr: 'm1' }] } },
      { id: 'A2', block: 'B', type: 'single_choice', text: 'Ικανοποίηση', options: ['1', '2', '3', '4', '5', '6'].map((c) => ({ code: c, label: c })), condition: "A1 == '1'", class: 'S',
        model: { kind: 'ordinal', scale: ['1', '2', '3', '4', '5'], base: [0.1, 0.2, 0.4, 0.2, 0.1], loadings: { L: 1 }, extra: [{ code: '6', base: 0.05 }] } },
      { id: 'A3', block: 'B', type: 'multiple_choice', text: 'Κανάλια', minChoices: 1, maxChoices: 2, condition: "A1 == '1'", class: 'S',
        options: [{ code: '1', label: 'x' }, { code: '2', label: 'y' }, { code: '3', label: 'z' }, { code: '9', label: 'ΔΓ', exclusive: true }],
        model: { kind: 'multi', base: { '1': 0.6, '2': 0.5, '3': 0.3, '9': 0.05 } } }
    ],
    constraints: [{ id: 'C1', forbid: "A2 == '1' and contains(A3, '1')" }],
    ...over
  };
}

describe('validateSpec — η κατηγορία δεν μπορεί να υπερβαίνει την τεκμηρίωση', () => {
  it('T χωρίς εμπειρική πηγή → σφάλμα· S με πηγή επιτρέπεται (συντηρητικό)', () => {
    const s = spec();
    expect(validateSpec(s)).toEqual([]);
    expect(derivedClass(s, s.questions[1])).toBe('T');
    const bad = spec();
    bad.questions[2] = { ...bad.questions[2], class: 'T' };
    expect(validateSpec(bad).join(' ')).toMatch(/A2: δηλωμένη κατηγορία T ισχυρότερη/);
    const bad2 = spec();
    bad2.questions[1] = { ...bad2.questions[1], class: 'E' };
    expect(validateSpec(bad2).join(' ')).toMatch(/A1: κατηγορία E επιτρέπεται μόνο/);
  });
  it('κάθε επιλογή πρέπει να έχει πιθανότητα', () => {
    const s = spec();
    s.questions[3] = { ...s.questions[3], model: { kind: 'multi', base: { '1': 0.5, '2': 0.5, '3': 0.3 } } };
    expect(validateSpec(s).join(' ')).toMatch(/η επιλογή 9 δεν έχει πιθανότητα/);
  });
});

describe.skipIf(!realOk)('runStructuredStudy — παραγωγή (πληθυσμός Lab + PIE, χωρίς AI)', () => {
  it('γρήγορη, ντετερμινιστική, με σωστό skip logic, κανόνες, κατηγορίες και καταγραφή απούσας πηγής', () => {
    const t0 = Date.now();
    const r1 = runStructuredStudy(spec(), { n: 120, seed: 7 });
    const ms = Date.now() - t0;
    const r2 = runStructuredStudy(spec(), { n: 120, seed: 7 });
    expect(r1.respondents.length).toBe(120);
    expect(new Set(r1.respondents.map((r) => r.persona_id)).size).toBe(120);
    expect(JSON.stringify(r1.respondents.map((r) => r.answers))).toBe(JSON.stringify(r2.respondents.map((r) => r.answers)));
    expect(ms).toBeLessThan(30_000);
    for (const r of r1.respondents) {
      expect(r.answers.D1).toBe(r.covariates.gender === 'female' ? '1' : '2');
      if (r.answers.A1 !== '1') { expect(r.answers.A2).toBeNull(); expect(r.answers.A3).toBeNull(); }
      else {
        const a3 = r.answers.A3 as string[];
        expect(a3.length).toBeGreaterThanOrEqual(1);
        expect(a3.length).toBeLessThanOrEqual(2);
        if (a3.includes('9')) expect(a3).toEqual(['9']);
        expect(r.answers.A2 === '1' && a3.includes('1')).toBe(false);          // C1 ποτέ
      }
      expect(r.classes.D1).toBe('E');
      if (r.answers.A2 !== null) expect(r.classes.A2).toBe('S');
    }
    // ανύπαρκτη πηγή: ρητή προειδοποίηση + fallback (0,3 ως κάτω όριο του A1) — όχι σιωπηλή επινόηση
    expect(r1.metricFits.m1.ablated).toBe(true);
    expect(r1.warnings.join(' ')).toMatch(/δεν είναι διαθέσιμος/);
    const yes = r1.respondents.filter((r) => r.answers.A1 === '1').length / 120;
    expect(yes).toBeGreaterThan(0.35);
  }, 60_000);
  it('ευαισθησία: μεγαλύτερη μετατόπιση επιπέδων ⇒ υψηλότερες κλίμακες· αφαίρεση PIE καταγράφεται', () => {
    const lo = runStructuredStudy(spec(), { n: 150, seed: 3, baseShift: -0.5 });
    const hi = runStructuredStudy(spec(), { n: 150, seed: 3, baseShift: 0.5 });
    const mean = (r: typeof lo) => { const v = r.respondents.map((x) => x.answers.A2).filter((x): x is string => !!x && x !== '6').map(Number); return v.reduce((a, b) => a + b, 0) / v.length; };
    expect(mean(hi)).toBeGreaterThan(mean(lo));
    const np = runStructuredStudy(spec(), { n: 50, seed: 3, ablatePie: true });
    expect(new Set(np.respondents.map((r) => r.covariates.econ4)).size).toBe(1);
  }, 60_000);
});
