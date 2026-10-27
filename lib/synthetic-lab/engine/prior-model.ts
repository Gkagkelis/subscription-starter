// ============================================================
// Empirical prior model — "marginal-constrained main-effects logit".
//
// Πρόβλημα: τα δεδομένα NORAYA δίνουν ποσοστά ανά ΜΙΑ διάσταση (π.χ. ανά
// ηλικία, ανά φύλο), όχι κοινές κατανομές. Για να δώσουμε σε κάθε συνθετικό
// πρόσωπο μια πιθανότητα p_i, υποθέτουμε μοντέλο κύριων επιδράσεων:
//
//   logit(p_i) = a + Σ_d Σ_g π_{i,d,g} · β_{d,g}
//
// (π = πιθανοτική συμμετοχή στην ομάδα) και προσαρμόζουμε τα a, β με
// επαναληπτική αναλογική προσαρμογή ανά διάσταση (IPF στην κλίμακα logit)
// ώστε οι ΣΤΑΘΜΙΣΜΕΝΕΣ μέσες πιθανότητες στον συνθετικό πληθυσμό να
// πλησιάζουν τα παρατηρημένα ποσοστά κάθε ομάδας.
//
// Όταν οι περιθωριακές κατανομές της έρευνας δεν είναι συμβατές με τη δομή
// του πληθυσμού 2015 (π.χ. άλλη ηλικιακή σύνθεση), δεν υπάρχει ακριβής λύση:
// το υπόλοιπο σφάλμα αναφέρεται ρητά (maxFitErrorPp).
//
// Παραδοχές: (1) καμία αλληλεπίδραση μεταξύ διαστάσεων, (2) δομή πληθυσμού
// GLOPOP-S 2015, (3) αντιστοίχιση ομάδων όπως στο data/noraya.ts.
// Αποτέλεσμα = ΣΤΑΤΙΣΤΙΚΗ ΕΚΤΙΜΗΣΗ, όχι μέτρηση.
// ============================================================

import { LINKED_DIMENSIONS, norayaMembership, waveCells, type LinkedDimension } from '../data/noraya';
import type { PriorWave } from '../data/noraya-build';
import { logit, sigmoid } from '../stats';
import type { Persona } from '../types';

export const PRIOR_MODEL_VERSION = 'mc-logit-1.1';
export const MIN_GROUP_N = 30;
/** Πάνω από αυτό το υπόλοιπο σφάλμα fit εμφανίζεται προειδοποίηση. */
export const FIT_WARNING_PP = 2;
// Απόσβεση βήματος: οι πιθανοτικές συμμετοχές (π.χ. ζώνη 35-44 σε δύο ομάδες) ταλαντώνονται χωρίς αυτή.
const DAMPING = 0.6;
/** Ισχύς συρρίκνωσης σε «ισοδύναμους ερωτώμενους» (ρυθμίζεται με backtest σε παλαιότερα κύματα). */
export const DEFAULT_SHRINKAGE = 0;

export interface PriorFit {
  metric: string;
  waveKey: string;
  intercept: number;
  betas: Record<string, Record<string, number>>;
  /** Πιθανότητα ανά persona id (μόνο για όσα είναι στον πληθυσμό έρευνας). */
  p: Map<string, number>;
  usedTargets: { dimension: string; group: string; target: number; fitted: number; n: number }[];
  skippedTargets: { dimension: string; group: string; reason: string }[];
  iterations: number;
  /** Σύγκλιση παραμέτρων (όχι απαραίτητα μηδενικό σφάλμα). */
  converged: boolean;
  /** Μέγιστο υπόλοιπο σφάλμα έναντι στόχων (π.μ.). */
  maxFitErrorPp: number;
  outOfUniverse: number;
}

interface Target {
  dim: number; // δείκτης διάστασης
  group: string;
  slot: number; // δείκτης παραμέτρου
  t: number;
  n: number;
}

export function fitPriorModel(
  metric: string,
  wave: PriorWave,
  personas: Persona[],
  opts: { dimensions?: LinkedDimension[]; maxIter?: number; shrinkage?: number } = {}
): PriorFit {
  const k = opts.shrinkage ?? DEFAULT_SHRINKAGE;
  const dims = opts.dimensions ?? [...LINKED_DIMENSIONS];
  const maxIter = opts.maxIter ?? 300;
  const all = wave.groups.all?.all;
  if (!all) throw new Error(`Το κύμα ${wave.key} δεν έχει συνολική τιμή για ${metric}.`);

  // --- Προετοιμασία: συμπαγείς πίνακες συμμετοχής ---
  const ids: string[] = [];
  const weights: number[] = [];
  const memb: { slot: number; frac: number }[][] = [];
  const skippedTargets: PriorFit['skippedTargets'] = [];
  const targets: Target[] = [];
  const slotOf = new Map<string, number>();
  const slotKey = (d: number, g: string) => `${d}\u0001${g}`;

  const memberships = personas.map((p) => ({ p, m: norayaMembership(p) }));
  const inUniverse = memberships.filter((x) => x.m);
  const outOfUniverse = personas.length - inUniverse.length;

  dims.forEach((d, di) => {
    const cells = waveCells(wave, d);
    Object.keys(cells).forEach((g) => {
      const c = cells[g];
      const present = inUniverse.some((x) => (x.m![d][g] || 0) > 0);
      if (!present) skippedTargets.push({ dimension: d, group: g, reason: 'Η ομάδα δεν αντιστοιχίζεται στον πληθυσμό' });
      else if (c.n < MIN_GROUP_N) skippedTargets.push({ dimension: d, group: g, reason: `Μικρό δείγμα (n=${c.n})` });
      else if (c.inconsistent) skippedTargets.push({ dimension: d, group: g, reason: 'Ασυμβατότητα μετρήσεων στο ίδιο κύμα' });
      else {
        const slot = slotOf.size;
        slotOf.set(slotKey(di, g), slot);
        // Συρρίκνωση (τύπου empirical Bayes) προς το συνολικό ποσοστό: ομάδες με
        // μικρό n δεν «μεταφέρουν» τον θόρυβο του κύματος ως πραγματική διαφορά.
        const shrunk = (c.n * (c.value / 100) + k * (all.value / 100)) / (c.n + k);
        targets.push({ dim: di, group: g, slot, t: shrunk, n: c.n });
      }
    });
  });

  for (const x of inUniverse) {
    ids.push(x.p.id);
    weights.push(x.p.weight);
    const row: { slot: number; frac: number }[] = [];
    dims.forEach((d, di) => {
      const gm = x.m![d];
      for (const g in gm) {
        const s = slotOf.get(slotKey(di, g));
        if (s !== undefined && gm[g] > 0) row.push({ slot: s, frac: gm[g] });
      }
    });
    memb.push(row);
  }

  const N = ids.length;
  const beta = new Float64Array(slotOf.size);
  let a = logit(all.value / 100);
  const prob = new Float64Array(N);

  const recompute = () => {
    for (let i = 0; i < N; i++) {
      let e = a;
      const row = memb[i];
      for (let k = 0; k < row.length; k++) e += row[k].frac * beta[row[k].slot];
      prob[i] = sigmoid(e);
    }
  };
  const groupMeans = () => {
    const num = new Float64Array(slotOf.size);
    const den = new Float64Array(slotOf.size);
    let tn = 0;
    let td = 0;
    for (let i = 0; i < N; i++) {
      const w = weights[i];
      tn += w * prob[i];
      td += w;
      const row = memb[i];
      for (let k = 0; k < row.length; k++) {
        const ww = w * row[k].frac;
        num[row[k].slot] += ww * prob[i];
        den[row[k].slot] += ww;
      }
    }
    const m = new Float64Array(slotOf.size);
    for (let s = 0; s < m.length; s++) m[s] = den[s] > 0 ? num[s] / den[s] : NaN;
    return { m, overall: td > 0 ? tn / td : NaN };
  };

  // Κεντράρισμα: οι παράμετροι κάθε διάστασης έχουν σταθμισμένο μέσο 0 και το
  // επίπεδο πηγαίνει στο intercept. Χωρίς αυτό, όταν οι διαστάσεις «διαφωνούν»
  // για το συνολικό επίπεδο, οι β απομακρύνονται χωρίς όριο (μη ταυτοποίηση).
  const groupWeight = new Float64Array(slotOf.size);
  for (let i = 0; i < N; i++) for (const r of memb[i]) groupWeight[r.slot] += weights[i] * r.frac;
  const center = () => {
    for (let di = 0; di < dims.length; di++) {
      let sw = 0;
      let sb = 0;
      for (const tg of targets) {
        if (tg.dim !== di) continue;
        sw += groupWeight[tg.slot];
        sb += groupWeight[tg.slot] * beta[tg.slot];
      }
      if (sw <= 0) continue;
      const mu = sb / sw;
      for (const tg of targets) if (tg.dim === di) beta[tg.slot] -= mu;
      a += mu;
    }
  };

  let iterations = 0;
  let converged = false;
  recompute();
  const prev = new Float64Array(N);
  for (; iterations < maxIter; iterations++) {
    prev.set(prob);
    // IPF ανά διάσταση (ομάδες της ίδιας διάστασης ενημερώνονται μαζί)
    for (let di = 0; di < dims.length; di++) {
      const { m } = groupMeans();
      for (const tg of targets) {
        if (tg.dim !== di || Number.isNaN(m[tg.slot])) continue;
        beta[tg.slot] += DAMPING * (logit(tg.t) - logit(m[tg.slot]));
      }
      recompute();
    }
    if (targets.length) center();
    else {
      // Χωρίς στόχους ομάδων: μόνο το συνολικό ποσοστό.
      const { overall } = groupMeans();
      a += logit(all.value / 100) - logit(overall);
    }
    recompute();
    let maxChange = 0;
    for (let i = 0; i < N; i++) maxChange = Math.max(maxChange, Math.abs(prob[i] - prev[i]));
    if (maxChange < 1e-7) {
      converged = true;
      break;
    }
  }

  const { m, overall } = groupMeans();
  const usedTargets: PriorFit['usedTargets'] = [
    { dimension: 'all', group: 'all', target: all.value, fitted: overall * 100, n: all.n }
  ];
  let maxErr = Math.abs(overall * 100 - all.value);
  for (const tg of targets) {
    usedTargets.push({ dimension: dims[tg.dim], group: tg.group, target: tg.t * 100, fitted: m[tg.slot] * 100, n: tg.n });
    maxErr = Math.max(maxErr, Math.abs(m[tg.slot] - tg.t) * 100);
  }

  const betas: Record<string, Record<string, number>> = {};
  dims.forEach((d) => (betas[d] = {}));
  targets.forEach((tg) => (betas[dims[tg.dim]][tg.group] = beta[tg.slot]));
  const p = new Map<string, number>();
  for (let i = 0; i < N; i++) p.set(ids[i], prob[i]);

  return {
    metric,
    waveKey: wave.key,
    intercept: a,
    betas,
    p,
    usedTargets,
    skippedTargets,
    iterations,
    converged,
    maxFitErrorPp: maxErr,
    outOfUniverse
  };
}
