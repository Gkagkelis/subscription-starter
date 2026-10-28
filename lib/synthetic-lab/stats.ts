// Στατιστικά εργαλεία του Lab. Μικρά, καθαρά, με tests.

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function logit(p: number): number {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : NaN;
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Kish effective sample size για σταθμισμένο δείγμα. */
export function effectiveN(weights: number[]): number {
  const s = sum(weights);
  const s2 = sum(weights.map((w) => w * w));
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Σταθμισμένο ποσοστό (0-1). */
export function weightedShare(values: boolean[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    den += weights[i];
    if (values[i]) num += weights[i];
  }
  return den > 0 ? num / den : NaN;
}

/**
 * Wilson interval για ποσοστό p με (effective) n. Επιστρέφει [low, high] σε 0-1.
 * Αφορά ΜΟΝΟ τη δειγματοληπτική μεταβλητότητα — όχι σφάλμα μοντέλου.
 */
export function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (!(n > 0) || Number.isNaN(p)) return [NaN, NaN];
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [clamp(center - half, 0, 1), clamp(center + half, 0, 1)];
}

/** Τυπικό σφάλμα ποσοστού. */
export function seProportion(p: number, n: number): number {
  return n > 0 ? Math.sqrt((p * (1 - p)) / n) : NaN;
}

/** Μέσο απόλυτο σφάλμα. */
export function mae(pairs: { predicted: number; observed: number }[]): number {
  if (!pairs.length) return NaN;
  return mean(pairs.map((p) => Math.abs(p.predicted - p.observed)));
}

/** Weighted mean με βάρη. */
export function weightedMean(xs: number[], ws: number[]): number {
  let s = 0;
  let w = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i] * ws[i];
    w += ws[i];
  }
  return w > 0 ? s / w : NaN;
}

/** Συνολική απόσταση μεταβολής (TVD) μεταξύ δύο κατανομών (0-1). */
export function totalVariationDistance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const sa = sum(Object.values(a)) || 1;
  const sb = sum(Object.values(b)) || 1;
  let d = 0;
  keys.forEach((k) => {
    d += Math.abs((a[k] || 0) / sa - (b[k] || 0) / sb);
  });
  return d / 2;
}

/** Κανονικοποίηση κατανομής σε άθροισμα 1. */
export function normalize(d: Record<string, number>): Record<string, number> {
  const s = sum(Object.values(d));
  const out: Record<string, number> = {};
  Object.keys(d).forEach((k) => (out[k] = s > 0 ? d[k] / s : 0));
  return out;
}

export function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Ποσοστημόριο ταξινομημένου πίνακα. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Τυπική κανονική αθροιστική (Abramowitz–Stegun 7.1.26, σφάλμα < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
