// ============================================================
// EGPS — Evidence-Grounded Predictive Simulation (ΠΕΙΡΑΜΑΤΙΚΟ).
//
// ΔΕΝ χρησιμοποιείται από την παραγωγή (prod-1 / runSurvey). Αντικαθιστά, για όσους το καλούν ρητά, την ομοιόμορφη
// προεπιλογή του demo responder με ιεραρχική χρήση τεκμηρίωσης και κατάταξη κάθε αποτελέσματος σε τρεις κατηγορίες:
//   EMPIRICALLY_ANCHORED — άμεση μέτρηση της ίδιας μεταβλητής (όπως η παραγωγή: main-effects logit στα περιθώρια).
//   MODEL_EXTRAPOLATED   — πρόβλεψη από συγγενικές μετρήσεις με μέθοδο που πέρασε προκαταχωρισμένη αξιολόγηση
//                          (Δοκιμή Α), ή σενάριο από ρητή ασθενή παραδοχή· πάντα με διάστημα και ευαισθησία.
//   NOT_ESTIMABLE        — καμία επαρκής τεκμηρίωση: ΚΑΜΙΑ σημειακή τιμή, οι συνθετικές απαντήσεις μένουν NA.
// Εξαρτήσεις μεταξύ απαντήσεων: Gaussian copula με συσχετίσεις ανά κατηγορία σχέσης, μαθημένες από ανεξάρτητα
// μικροδεδομένα (Δοκιμή Β)· κατηγορίες που δεν πέρασαν μένουν ανεξάρτητες και σημειώνονται.
// Αξιολόγηση: docs/synthetic-lab/EGPS_PREREGISTRATION.md, docs/synthetic-lab/EGPS_RESULTS.md.
// ============================================================

import transferParams from '@/config/synthetic-lab/egps/transfer_params.json';
import jointParams from '@/config/synthetic-lab/egps/joint_params.json';
import { getMetric, latestWaveFor, type EvidenceContext } from '../data/noraya';
import type { PriorCell, PriorWave } from '../data/noraya-build';
import { fitPriorModel } from '../engine/prior-model';
import { probit } from '../engine/demo-responder';
import { createRng, deriveSeed } from '../rng';
import type { Persona } from '../types';

export const EGPS_VERSION = 'egps-exp-0.1';
export type EvidenceClass = 'EMPIRICALLY_ANCHORED' | 'MODEL_EXTRAPOLATED' | 'NOT_ESTIMABLE';
export type ConstructKind = 'evaluation' | 'intention' | 'usage' | 'general_usage' | 'other';
export type RelationClass = 'EE' | 'EI' | 'UE' | 'UG' | 'UI' | 'II' | 'NONE';

export interface EgpsItem {
  id: string;
  text: string;
  /** Επιλογές με σειρά από «χαμηλό» σε «υψηλό» (π.χ. Όχι → Ναι, 1 → 5): ορίζει την κατεύθυνση της συσχέτισης. */
  options: string[];
  /** Άμεση μέτρηση της ίδιας μεταβλητής (δυαδικός δείκτης· η τελευταία επιλογή = «θετική»). */
  direct?: string | null;
  /** Συγγενικοί δείκτες της ίδιας κατηγορίας (υπο-κατηγορίες, ΟΧΙ η ίδια μάρκα) με τεκμηρίωση της επιλογής. */
  related?: { metrics: string[]; rationale: string } | null;
  /** Ρητή ασθενής παραδοχή (πιθανότητες ανά επιλογή) — δίνει μόνο ΣΕΝΑΡΙΟ με ευρύ διάστημα. */
  assumption?: { probs: number[]; concentration?: number; rationale: string } | null;
  /** Ποιο αντικείμενο αφορά και τι είδους ερώτηση είναι (για τη δομή εξαρτήσεων). */
  construct?: { object: string; kind: ConstructKind } | null;
}

export interface EgpsItemResult {
  id: string;
  evidenceClass: EvidenceClass;
  basis: 'direct' | 'related_transfer' | 'assumption_scenario' | 'none';
  reason: string;
  /** Ποσοστό «θετικής» (τελευταίας) επιλογής για δυαδικά· κατανομή για τα υπόλοιπα. */
  overall?: { point: number; int80: [number, number]; int95: [number, number] } | null;
  distribution?: { option: string; point: number; int80: [number, number] }[] | null;
  groups?: Record<string, Record<string, number>> | null;
  sources: string[];
  /** Πιθανότητα «θετικής» επιλογής ανά persona (δυαδικά) ή κατανομή (σενάρια) — για τη γέννηση απαντήσεων. */
  perPerson?: Map<string, number[]>;
}

const DIMS = ['age_band', 'gender', 'education_group'];
const logit = (p: number) => {
  const q = Math.min(0.995, Math.max(0.005, p / 100));
  return Math.log(q / (1 - q));
};
const inv = (x: number) => 100 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const TP = transferParams as unknown as {
  w: number; lambda: number; beta: number; global_logit_mean_cal: number;
  intervals_logit: { overall: Record<'80' | '95', [number, number]> };
  notEstimable: { minProxies: number; maxWidth80pp: number };
  acceptance: { model_extrapolated_capable: boolean };
};
const JP = jointParams as unknown as { classes: Record<string, { accepted: boolean; rho_mean: number; rho_min: number; rho_max: number; n_datasets: number }> };

function cell(value: number): PriorCell {
  return { value, n: 0, nUnknown: true, confidence: 'model', sources: 0, inconsistent: false };
}

/** Πρόβλεψη περιθωρίων για ένα item, με ιεραρχία: άμεση μέτρηση → συγγενικοί δείκτες → ρητή παραδοχή → NOT_ESTIMABLE. */
export function predictMarginal(item: EgpsItem, personas: Persona[], ctx: EvidenceContext = {}): EgpsItemResult {
  const binary = item.options.length === 2;
  // 1) Άμεση μέτρηση
  if (item.direct) {
    const wave = latestWaveFor(item.direct, ctx).wave;
    if (wave && wave.groups.all?.all && binary) {
      const fit = fitPriorModel(item.direct, wave, personas);
      const v = wave.groups.all.all.value;
      return {
        id: item.id, evidenceClass: 'EMPIRICALLY_ANCHORED', basis: 'direct', reason: `Άμεση μέτρηση (${wave.key}).`,
        overall: { point: r1(v), int80: [r1(v), r1(v)], int95: [r1(v), r1(v)] }, groups: groupsOf(wave), sources: [item.direct],
        perPerson: new Map(Array.from(fit.p.entries()).map(([id, p]) => [id, [1 - p, p]]))
      };
    }
  }
  // 2) Συγγενικοί δείκτες (μέθοδος Δοκιμής Α — μόνο αν πέρασε τους προκαταχωρισμένους κανόνες)
  if (item.related?.metrics.length && binary) {
    if (!TP.acceptance.model_extrapolated_capable) return none(item, 'Η μέθοδος μεταφοράς δεν πέρασε την αξιολόγηση.');
    const waves = item.related.metrics.map((m) => ({ m, w: latestWaveFor(m, ctx).wave })).filter((x): x is { m: string; w: PriorWave } => !!x.w?.groups.all?.all);
    if (waves.length < TP.notEstimable.minProxies) return none(item, `Λιγότεροι από ${TP.notEstimable.minProxies} συγγενικοί δείκτες με μέτρηση.`);
    const sib = waves.reduce((s, x) => s + logit(x.w.groups.all.all.value), 0) / waves.length;
    const lvl = (1 - TP.lambda) * sib + TP.lambda * TP.global_logit_mean_cal;
    const q80 = TP.intervals_logit.overall['80'], q95 = TP.intervals_logit.overall['95'];
    const int80: [number, number] = [r1(inv(lvl + q80[0])), r1(inv(lvl + q80[1]))];
    if (int80[1] - int80[0] > TP.notEstimable.maxWidth80pp) {
      return none(item, `Το διάστημα 80% (${int80[0]}–${int80[1]}%) είναι ευρύτερο από ${TP.notEstimable.maxWidth80pp} π.μ.: δεν δίνεται σημειακή εκτίμηση.`);
    }
    // προφίλ ομάδων: μέσες αποκλίσεις logit των συγγενικών δεικτών × β
    const groups: Record<string, Record<string, PriorCell>> = { all: { all: cell(inv(lvl)) } };
    for (const d of DIMS) {
      const keys = Array.from(new Set(waves.flatMap((x) => Object.keys(x.w.groups[d] || {}))));
      for (const g of keys) {
        const devs = waves.filter((x) => x.w.groups[d]?.[g]).map((x) => logit(x.w.groups[d][g].value) - logit(x.w.groups.all.all.value));
        if (devs.length === waves.length) (groups[d] ||= {})[g] = cell(inv(lvl + TP.beta * (devs.reduce((a, b) => a + b, 0) / devs.length)));
      }
    }
    const wave: PriorWave = { key: `egps-${item.id}`, year: waves[0].w.year, quarter: '', groups };
    const fit = fitPriorModel(waves[0].m, wave, personas); // ίδια σχήματα ομάδων με τους συγγενικούς δείκτες
    return {
      id: item.id, evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'related_transfer',
      reason: `Μεταφορά από ${waves.length} συγγενικούς δείκτες (${item.related.rationale}). Δεν είναι μέτρηση της ίδιας μεταβλητής.`,
      overall: { point: r1(inv(lvl)), int80, int95: [r1(inv(lvl + q95[0])), r1(inv(lvl + q95[1]))] },
      groups: groupsOf(wave), sources: waves.map((x) => x.m),
      perPerson: new Map(Array.from(fit.p.entries()).map(([id, p]) => [id, [1 - p, p]]))
    };
  }
  // 3) Ρητή ασθενής παραδοχή → σενάριο με Dirichlet διαστήματα (μικρή «ισοδύναμη» βάση = ευρύ διάστημα)
  if (item.assumption) {
    const a = item.assumption;
    const c = a.concentration ?? 4;
    const tot = a.probs.reduce((s, x) => s + x, 0);
    const p = a.probs.map((x) => x / tot);
    const dist = p.map((pi, k) => ({ option: item.options[k], point: r1(pi * 100), int80: betaInterval(pi * c, (1 - pi) * c, 0.8) }));
    return {
      id: item.id, evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'assumption_scenario',
      reason: `ΣΕΝΑΡΙΟ από ρητή παραδοχή (${a.rationale}), όχι από δεδομένα· ισοδύναμη βάση ${c} παρατηρήσεων → ευρύ διάστημα.`,
      distribution: dist, sources: [], perPerson: new Map(personas.map((x) => [x.id, p]))
    };
  }
  return none(item, 'Δεν υπάρχει άμεση ή συγγενική μέτρηση, ούτε ρητή παραδοχή.');
}

function none(item: EgpsItem, reason: string): EgpsItemResult {
  return { id: item.id, evidenceClass: 'NOT_ESTIMABLE', basis: 'none', reason, overall: null, groups: null, sources: [] };
}

function groupsOf(w: PriorWave): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const d of ['all', ...DIMS]) if (w.groups[d]) out[d] = Object.fromEntries(Object.entries(w.groups[d]).map(([g, c]) => [g, r1(c.value)]));
  return out;
}

/** Διάστημα beta με αριθμητική ολοκλήρωση (μικρά α, β· αρκεί για εμφάνιση). */
export function betaInterval(a: number, b: number, level: number): [number, number] {
  const N = 2000;
  const xs = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
  const dens = xs.map((x) => Math.pow(x, a - 1) * Math.pow(1 - x, b - 1));
  const tot = dens.reduce((s, x) => s + x, 0);
  let acc = 0;
  let lo = 0;
  let hi = 1;
  const t = (1 - level) / 2;
  for (let i = 0; i < N; i++) {
    const prev = acc;
    acc += dens[i] / tot;
    if (prev < t && acc >= t) lo = xs[i];
    if (prev < 1 - t && acc >= 1 - t) hi = xs[i];
  }
  return [r1(lo * 100), r1(hi * 100)];
}

/** Κατηγορία σχέσης ζεύγους (ίδιο αντικείμενο ή γενική χρήση κατηγορίας). */
export function relationClass(a: EgpsItem['construct'], b: EgpsItem['construct']): RelationClass {
  if (!a || !b) return 'NONE';
  const k = [a.kind, b.kind].sort().join('|');
  if (a.kind === 'general_usage' || b.kind === 'general_usage') {
    const other = a.kind === 'general_usage' ? b.kind : a.kind;
    return other === 'evaluation' || other === 'intention' ? 'UG' : 'NONE';
  }
  if (a.object !== b.object) return 'NONE';
  return ({ 'evaluation|evaluation': 'EE', 'evaluation|intention': 'EI', 'evaluation|usage': 'UE', 'intention|usage': 'UI', 'intention|intention': 'II' } as Record<string, RelationClass>)[k] || 'NONE';
}

export type DependenceScenario = 'mean' | 'min' | 'max';

/** Πίνακας συσχετίσεων copula + σημειώσεις για ζεύγη που μένουν ανεξάρτητα επειδή η εξάρτηση είναι NOT_ESTIMABLE. */
export function correlationMatrix(items: EgpsItem[], scenario: DependenceScenario = 'mean'): { R: number[][]; notes: string[]; pairs: { a: string; b: string; cls: RelationClass; rho: number; status: string }[] } {
  const n = items.length;
  const R: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const pairs: { a: string; b: string; cls: RelationClass; rho: number; status: string }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const cls = relationClass(items[i].construct, items[j].construct);
      if (cls === 'NONE') continue;
      const c = JP.classes[cls];
      if (c?.accepted) {
        const rho = scenario === 'min' ? c.rho_min : scenario === 'max' ? c.rho_max : c.rho_mean;
        R[i][j] = R[j][i] = rho;
        pairs.push({ a: items[i].id, b: items[j].id, cls, rho, status: 'MODEL_EXTRAPOLATED' });
      } else pairs.push({ a: items[i].id, b: items[j].id, cls, rho: 0, status: 'NOT_ESTIMABLE (ανεξαρτησία)' });
    }
  return { R: nearestPD(R), notes: pairs.filter((p) => p.rho === 0).map((p) => `${p.a}–${p.b} (${p.cls}): εξάρτηση NOT ESTIMABLE — ανεξάρτητες.`), pairs };
}

/** Αν ο πίνακας δεν είναι θετικά ορισμένος, συρρικνώνονται οι εκτός διαγωνίου μέχρι να επιτύχει το Cholesky. */
export function nearestPD(R: number[][]): number[][] {
  let s = 1;
  for (let t = 0; t < 50; t++) {
    const M = R.map((row, i) => row.map((v, j) => (i === j ? 1 : v * s)));
    if (cholesky(M)) return M;
    s *= 0.95;
  }
  return R.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
}

export function cholesky(A: number[][]): number[][] | null {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-9) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  return L;
}

const PHI = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * Γέννηση εξαρτημένων συνθετικών απαντήσεων: z ~ N(0, R) ανά persona, u = Φ(z), απάντηση = πρώτη επιλογή με
 * σωρευτική πιθανότητα ≥ u (επιλογές από «χαμηλό» σε «υψηλό»). Τα περιθώρια κάθε item μένουν όπως τα έδωσε το
 * predictMarginal· NOT_ESTIMABLE → null (NA).
 */
export function simulateJoint(items: EgpsItem[], results: EgpsItemResult[], personas: Persona[], seed: number, scenario: DependenceScenario = 'mean') {
  const { R } = correlationMatrix(items, scenario);
  const L = cholesky(R)!;
  return personas.map((p) => {
    const rng = createRng(deriveSeed(seed, p.id, 'egps'));
    const e = items.map(() => rng.normal());
    const z = L.map((row) => row.reduce((s, v, k) => s + v * e[k], 0));
    const answers: Record<string, string | null> = {};
    items.forEach((it, i) => {
      const probs = results[i].perPerson?.get(p.id);
      if (!probs || results[i].evidenceClass === 'NOT_ESTIMABLE') return void (answers[it.id] = null);
      const u = PHI(z[i]);
      let acc = 0;
      let choice = it.options[it.options.length - 1];
      for (let k = 0; k < probs.length; k++) {
        acc += probs[k];
        if (u <= acc) {
          choice = it.options[k];
          break;
        }
      }
      answers[it.id] = choice;
    });
    return { personaId: p.id, answers };
  });
}

/** Συσχέτιση normal-scores δύο στηλών απαντήσεων (για έλεγχο ότι η προσομοίωση αναπαράγει την εξάρτηση). */
export function normalScoresCorr(x: number[], y: number[]): number {
  const ns = (v: number[]) => {
    const idx = v.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].val === idx[i].val) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k].i] = probit((avg - 0.5) / v.length);
      i = j + 1;
    }
    return r as number[];
  };
  const a = ns(x);
  const b = ns(y);
  const m = (v: number[]) => v.reduce((s, t) => s + t, 0) / v.length;
  const ma = m(a);
  const mb = m(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** Δοκιμή μηνυμάτων: χωρίς ελεγμένο μοντέλο επίδρασης μηνύματος, το αποτέλεσμα είναι εξ ορισμού NOT_ESTIMABLE. */
export function messageEffect(): { evidenceClass: EvidenceClass; reason: string } {
  return { evidenceClass: 'NOT_ESTIMABLE', reason: 'Δεν υπάρχει ελεγμένο μοντέλο επίδρασης περιεχομένου μηνύματος· δεν κατασκευάζεται διαφορά A/B.' };
}

/** Περιγραφή μεταδεδομένων για αναφορές. */
export function egpsMeta() {
  return { version: EGPS_VERSION, transfer: transferParams, joint: jointParams, metricExists: (m: string) => !!getMetric(m) };
}
