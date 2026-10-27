// Δειγματοληψία πληθυσμού: αναλογική στρωματοποίηση + απλή τυχαία
// δειγματοληψία χωρίς επανάθεση μέσα σε κάθε στρώμα. Αναπαραγώγιμη (seed).

import { createRng } from '../rng';

/** Κατανομή n σε στρώματα αναλογικά, με τη μέθοδο μεγαλύτερου υπολοίπου. */
export function largestRemainder(sizes: Record<string, number>, n: number): Record<string, number> {
  const keys = Object.keys(sizes);
  const total = keys.reduce((s, k) => s + sizes[k], 0);
  const out: Record<string, number> = {};
  if (total <= 0 || n <= 0) {
    keys.forEach((k) => (out[k] = 0));
    return out;
  }
  const rema: { k: string; r: number }[] = [];
  let used = 0;
  keys.forEach((k) => {
    const exact = (sizes[k] / total) * n;
    out[k] = Math.floor(exact);
    used += out[k];
    rema.push({ k, r: exact - out[k] });
  });
  rema.sort((a, b) => b.r - a.r || a.k.localeCompare(b.k));
  for (let i = 0; i < n - used; i++) out[rema[i % rema.length].k]++;
  return out;
}

/** Floyd: k διακριτοί δείκτες από [0, N), ταξινομημένοι. */
export function sampleIndices(N: number, k: number, seed: number): number[] {
  if (k > N) throw new Error(`Δεν γίνεται δείγμα ${k} από ${N} εγγραφές χωρίς επανάθεση.`);
  const rng = createRng(seed);
  const chosen = new Set<number>();
  for (let j = N - k; j < N; j++) {
    const t = rng.int(j + 1);
    chosen.add(chosen.has(t) ? j : t);
  }
  return Array.from(chosen).sort((a, b) => a - b);
}

/** Σταθμισμένη δειγματοληψία με επανάθεση (για υποδείγματα κοινού). */
export function weightedSampleWithReplacement<T>(items: T[], weights: number[], k: number, seed: number): T[] {
  const rng = createRng(seed);
  const cum: number[] = [];
  let s = 0;
  for (const w of weights) {
    s += Math.max(0, w);
    cum.push(s);
  }
  const out: T[] = [];
  if (s <= 0) return out;
  for (let i = 0; i < k; i++) {
    const u = rng.next() * s;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] > u) hi = mid;
      else lo = mid + 1;
    }
    out.push(items[lo]);
  }
  return out;
}
