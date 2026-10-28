// ============================================================
// BENCHMARK SCORING — μετρήσεις σφάλματος σε ποσοστιαίες μονάδες (π.μ.).
//
// Ανά item: MAE συνόλου (μέσο |προσομοίωση − πραγματικό| στις επιλογές), MAE ομάδων,
// MAE «επιμονής» (αντιγραφή της προγενέστερης έρευνας χωρίς μοντέλο), όριο θορύβου
// δειγματοληψίας της πραγματικής έρευνας, διασπορά μεταξύ seeds.
// Επιδράσεις ομάδων: διαφορά (π.χ. νεότεροι − μεγαλύτεροι) πραγματική vs προσομοιωμένη·
// κλίση < 1 = υποεκτίμηση, > 1 = υπερεκτίμηση της επίδρασης.
// Κάθε σύνοψη αναφέρει πλήθος items ΚΑΙ ανεξάρτητων δειγμάτων.
// ============================================================

import type { CellResult, ItemResult } from './runner';

export interface ItemScore {
  itemId: string;
  family: string;
  split: string;
  sampleKey: string;
  year: number;
  topics: string[];
  overallMae: number | null;
  persistOverallMae: number | null;
  groupMae: number | null;
  persistGroupMae: number | null;
  dkMae: number | null;
  substantiveMae: number | null;
  simSd: number | null;
  noiseFloor: number | null;
  gapYears: number | null;
  surveyTypeMatch: boolean | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

export function scoreItem(r: ItemResult): ItemScore {
  const all = r.cells.filter((c) => c.dim === 'all');
  const grp = r.cells.filter((c) => c.dim !== 'all');
  const isDk = (c: CellResult) => r.dkOptions.includes(c.option);
  return {
    itemId: r.itemId,
    family: r.family,
    split: r.split,
    sampleKey: r.sampleKey,
    year: r.year,
    topics: r.topics,
    overallMae: r2(avg(all.map((c) => Math.abs(c.sim - c.real)))),
    persistOverallMae: r2(avg(all.filter((c) => c.persist !== null).map((c) => Math.abs((c.persist as number) - c.real)))),
    groupMae: r2(avg(grp.map((c) => Math.abs(c.sim - c.real)))),
    persistGroupMae: r2(avg(grp.filter((c) => c.persist !== null).map((c) => Math.abs((c.persist as number) - c.real)))),
    dkMae: r2(avg(all.filter(isDk).map((c) => Math.abs(c.sim - c.real)))),
    substantiveMae: r2(avg(all.filter((c) => !isDk(c)).map((c) => Math.abs(c.sim - c.real)))),
    simSd: r2(avg(r.cells.map((c) => c.simSd))),
    noiseFloor: r.noiseFloorPp,
    gapYears: r.evidence?.gapYears ?? null,
    surveyTypeMatch: r.evidence?.surveyTypeMatch ?? null
  };
}

/** Ζεύγη ομάδων «άκρων» ανά διάσταση για τη μέτρηση επιδράσεων. */
const EXTREMES: Record<string, [string, string][]> = {
  age_band: [['15-24', '65+'], ['15-24', '55-64']],
  age_group4: [['15-24', '55+']],
  age_group: [['15-24', '55+']],
  age_findex: [['15-24', '25+']],
  gender: [['female', 'male']],
  education_group: [['high_education', 'low_education']],
  education_findex: [['secondary_or_more', 'primary_or_less']],
  income_findex: [['richest_60', 'poorest_40']]
};
const FAMILY_OF_DIM: Record<string, string> = {
  age_band: 'ηλικία', age_group4: 'ηλικία', age_group: 'ηλικία', age_findex: 'ηλικία', gender: 'φύλο',
  education_group: 'μόρφωση', education_findex: 'μόρφωση', income_findex: 'εισόδημα'
};

export interface GapStat {
  factor: string;
  pairs: number;
  /** κλίση (μέσω αρχής) προσομοιωμένης ως προς πραγματική διαφορά: 1 = σωστό μέγεθος επίδρασης */
  slope: number | null;
  meanAbsRealGap: number | null;
  meanAbsSimGap: number | null;
  /** MAE της διαφοράς (π.μ.) */
  gapMae: number | null;
  /** ποσοστό ζευγών με σωστό πρόσημο (όταν |πραγματική διαφορά| ≥ 5 π.μ.) */
  signAgreement: number | null;
}

export function gapStats(results: ItemResult[]): GapStat[] {
  const by: Record<string, { real: number; sim: number }[]> = {};
  for (const r of results) {
    if (r.status !== 'ok') continue;
    const idx = new Map<string, CellResult>();
    r.cells.forEach((c) => idx.set(`${c.dim}|${c.group}|${c.option}`, c));
    const options = Array.from(new Set(r.cells.map((c) => c.option))).filter((o) => !r.dkOptions.includes(o));
    for (const [dim, pairs] of Object.entries(EXTREMES)) {
      for (const [a, b] of pairs) {
        for (const o of options) {
          const ca = idx.get(`${dim}|${a}|${o}`);
          const cb = idx.get(`${dim}|${b}|${o}`);
          if (!ca || !cb) continue;
          (by[FAMILY_OF_DIM[dim]] ||= []).push({ real: ca.real - cb.real, sim: ca.sim - cb.sim });
          break;
        }
      }
    }
  }
  return Object.entries(by).map(([factor, xs]) => {
    const sxy = xs.reduce((s, x) => s + x.sim * x.real, 0);
    const sxx = xs.reduce((s, x) => s + x.real * x.real, 0);
    const big = xs.filter((x) => Math.abs(x.real) >= 5);
    return {
      factor,
      pairs: xs.length,
      slope: sxx > 0 ? Math.round((sxy / sxx) * 1000) / 1000 : null,
      meanAbsRealGap: r2(avg(xs.map((x) => Math.abs(x.real)))),
      meanAbsSimGap: r2(avg(xs.map((x) => Math.abs(x.sim)))),
      gapMae: r2(avg(xs.map((x) => Math.abs(x.sim - x.real)))),
      signAgreement: big.length ? Math.round((100 * big.filter((x) => Math.sign(x.sim) === Math.sign(x.real)).length) / big.length) : null
    };
  });
}

export interface Summary {
  items: number;
  okItems: number;
  samples: number;
  coverage: number;
  overallMae: number | null;
  overallMedian: number | null;
  persistOverallMae: number | null;
  groupMae: number | null;
  persistGroupMae: number | null;
  noiseFloor: number | null;
  /** MAE ανά ανεξάρτητο δείγμα (μέσος όρος items του δείγματος, μετά μέσος όρος δειγμάτων) */
  sampleMeanMae: number | null;
  simSd: number | null;
  statuses: Record<string, number>;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(results: ItemResult[]): Summary {
  const sc = results.filter((r) => r.status === 'ok').map(scoreItem);
  const statuses: Record<string, number> = {};
  results.forEach((r) => (statuses[r.status] = (statuses[r.status] || 0) + 1));
  const ov = sc.map((s) => s.overallMae).filter((x): x is number => x !== null);
  const gm = sc.map((s) => s.groupMae).filter((x): x is number => x !== null);
  const bySample = new Map<string, number[]>();
  sc.forEach((s) => {
    const v = s.overallMae ?? s.groupMae;
    if (v !== null) bySample.set(s.sampleKey, [...(bySample.get(s.sampleKey) || []), v]);
  });
  return {
    items: results.length,
    okItems: sc.length,
    samples: new Set(results.filter((r) => r.status === 'ok').map((r) => r.sampleKey)).size,
    coverage: results.length ? Math.round((1000 * sc.length) / results.length) / 10 : 0,
    overallMae: r2(avg(ov)),
    overallMedian: r2(median(ov)),
    persistOverallMae: r2(avg(sc.map((s) => s.persistOverallMae).filter((x): x is number => x !== null))),
    groupMae: r2(avg(gm)),
    persistGroupMae: r2(avg(sc.map((s) => s.persistGroupMae).filter((x): x is number => x !== null))),
    noiseFloor: r2(avg(sc.map((s) => s.noiseFloor).filter((x): x is number => x !== null))),
    sampleMeanMae: r2(avg(Array.from(bySample.values()).map((v) => avg(v) as number))),
    simSd: r2(avg(sc.map((s) => s.simSd).filter((x): x is number => x !== null))),
    statuses
  };
}

/** Σύνοψη ανά κλειδί (οικογένεια, θέμα, έτος…). */
export function summarizeBy(results: ItemResult[], key: (r: ItemResult) => string | string[]): Record<string, Summary> {
  const groups = new Map<string, ItemResult[]>();
  for (const r of results) {
    const ks = key(r);
    for (const k of Array.isArray(ks) ? ks : [ks]) groups.set(k, [...(groups.get(k) || []), r]);
  }
  return Object.fromEntries(Array.from(groups.entries()).map(([k, v]) => [k, summarize(v)]));
}

/** Βασικό κριτήριο σύγκρισης εκδόσεων: MAE ανά ανεξάρτητο δείγμα, συνδυάζοντας σύνολο (όπου συγκρίσιμο) και ομάδες. */
export function primaryScore(results: ItemResult[]): number | null {
  return summarize(results).sampleMeanMae;
}

// ---------------- Φάση 2: προκαθορισμένες μετρικές (PHASE2_PREREGISTRATION.md §3) ----------------

/** Τιμή κύριας μετρικής ανά item (σύνολο όπου συγκρίσιμο, αλλιώς ομάδες). */
function itemValue(r: ItemResult): number | null {
  const s = scoreItem(r);
  return s.overallMae ?? s.groupMae;
}

/** Μέσος όρος με ίσο βάρος ανά οικογένεια πηγών (οι οικογένειες: μέσος όρος συστάδων). */
export function familyBalanced(results: ItemResult[]): number | null {
  const fam = new Map<string, Map<string, number[]>>();
  for (const r of results) {
    if (r.status !== 'ok') continue;
    const v = itemValue(r);
    if (v === null) continue;
    const m = fam.get(r.family) || new Map<string, number[]>();
    m.set(r.sampleKey, [...(m.get(r.sampleKey) || []), v]);
    fam.set(r.family, m);
  }
  const fams = Array.from(fam.values()).map((m) => avg(Array.from(m.values()).map((v) => avg(v) as number)) as number);
  return r2(avg(fams));
}

/**
 * Ζευγαρωτή διαφορά (alt − ref) στην κύρια μετρική: μέσος όρος ανά συστάδα (δείγμα), μετά μέσος όρος συστάδων.
 * Διάστημα 95%: cluster bootstrap στρωματοποιημένο ανά οικογένεια πηγών (2.000 επαναλήψεις, σταθερό seed).
 * Μόνο κοινά items με τιμή και στις δύο εκδόσεις.
 */
export function pairedCompareStrat(ref: ItemResult[], alt: ItemResult[], reps = 2000) {
  const a = new Map(ref.filter((r) => r.status === 'ok').map((r) => [r.itemId, r]));
  const byCluster = new Map<string, { family: string; d: number[]; g: number[] }>();
  let n = 0;
  for (const r of alt) {
    const r0 = a.get(r.itemId);
    if (!r0 || r.status !== 'ok') continue;
    const v0 = itemValue(r0);
    const v1 = itemValue(r);
    if (v0 === null || v1 === null) continue;
    n++;
    const c = byCluster.get(r.sampleKey) || { family: r.family, d: [], g: [] };
    c.d.push(v1 - v0);
    const g0 = scoreItem(r0).groupMae;
    const g1 = scoreItem(r).groupMae;
    if (g0 !== null && g1 !== null) c.g.push(g1 - g0);
    byCluster.set(r.sampleKey, c);
  }
  const clusters = Array.from(byCluster.values()).map((c) => ({ family: c.family, d: avg(c.d) as number, g: avg(c.g) }));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const est = mean(clusters.map((c) => c.d));
  const strata = new Map<string, number[]>();
  clusters.forEach((c) => strata.set(c.family, [...(strata.get(c.family) || []), c.d]));
  let seed = 20261028;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const boots: number[] = [];
  for (let b = 0; b < reps; b++) {
    const all: number[] = [];
    strata.forEach((xs) => {
      for (let i = 0; i < xs.length; i++) all.push(xs[Math.floor(rnd() * xs.length)]);
    });
    boots.push(mean(all));
  }
  boots.sort((x, y) => x - y);
  const gs = clusters.map((c) => c.g).filter((x): x is number => x !== null);
  return {
    items: n,
    clusters: clusters.length,
    meanDelta: r2(est),
    ci95: clusters.length >= 5 ? ([r2(boots[Math.floor(0.025 * reps)]), r2(boots[Math.floor(0.975 * reps)])] as [number | null, number | null]) : null,
    meanDeltaGroup: r2(gs.length ? mean(gs) : null),
    improvedClusters: Math.round((1000 * clusters.filter((c) => c.d < 0).length) / Math.max(1, clusters.length)) / 10
  };
}
