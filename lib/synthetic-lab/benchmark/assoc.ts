// ============================================================
// ΣΥΣΧΕΤΙΣΕΙΣ ΜΕΤΑΞΥ ΜΕΤΑΒΛΗΤΩΝ — πραγματικές (μικροδεδομένα διαΝΕΟσις) vs συνθετικές.
//
// Ελέγχει τη ΔΟΜΗ των απαντήσεων, όχι τα ποσοστά: τα περιθώρια κάθε ερώτησης δίνονται
// στο engine από το ίδιο κύμα (structural test) και μετριέται αν οι συνθετικοί ερωτώμενοι
// αναπαράγουν τη συσχέτιση (phi) μεταξύ «πρώτων ουσιαστικών επιλογών» ζευγών ερωτήσεων.
// Διαχωρισμός ανά κύμα: calibration 2017–2020, validation 2022, final holdout 2024.
// ============================================================

import { existsSync, readFileSync } from 'fs';
import { PRODUCTION_MODEL, type ModelConfig } from '../engine/model-config';
import { bankQuestion } from '../engine/question-bank';
import { runSurvey } from '../engine/survey';
import { CALIBRATED_POPULATION_ID } from '../population/store';
import type { Question, StudyPlan } from '../types';
import { benchDir } from './registry';

interface AssocFile {
  year: number;
  part: string;
  questions: string[];
  pairs: { a: string; b: string; optA: string; optB: string; phi: number; n: number }[];
}

export const ASSOC_SPLIT: Record<number, 'calibration' | 'validation' | 'holdout'> = { 2017: 'calibration', 2018: 'calibration', 2020: 'calibration', 2022: 'validation', 2024: 'holdout' };

export function batteryOf(qid: string): string | null {
  const m = qid.match(/^(dn\d\d_\d_[A-Za-z]+\d+)_\d+$/);
  return m ? m[1] : null;
}

export interface AssocSummary {
  split: string;
  files: number;
  withinPairs: number;
  acrossPairs: number;
  withinRealMean: number | null;
  withinSimMean: number | null;
  withinMae: number | null;
  acrossMae: number | null;
  /** συσχέτιση πραγματικών–συνθετικών phi σε όλα τα ζεύγη */
  corrRealSim: number | null;
}

const r3 = (x: number | null) => (x === null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function pearson(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const ma = avg(a)!;
  const mb = avg(b)!;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

export function loadAssocData(): AssocFile[] {
  const p = benchDir('microdata_assoc.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).files as AssocFile[]) : [];
}

export async function associationBenchmark(opts: { model?: ModelConfig; n?: number; seed?: number; splits?: string[] } = {}) {
  const model = opts.model || PRODUCTION_MODEL;
  const files = loadAssocData().filter((f) => !opts.splits || opts.splits.includes(ASSOC_SPLIT[f.year]));
  const rows: { split: string; within: boolean; real: number; sim: number }[] = [];
  for (const f of files) {
    const questions: Question[] = [];
    const idOf = new Map<string, string>();
    f.questions.forEach((qid, i) => {
      const q = bankQuestion(qid, `a${i + 1}`);
      if (q) {
        questions.push(q);
        idOf.set(qid, q.id);
      }
    });
    if (questions.length < 2) continue;
    const plan: StudyPlan = {
      domain: 'social_policy', kind: 'survey', title: `Assoc ${f.year}/${f.part}`, researchQuestion: 'Benchmark συσχετίσεων', questions, assumptions: [],
      audience: { minAge: 17 }, sampleSize: opts.n ?? 3000, warnings: [], plannerVersion: 'benchmark', plannerMode: 'rules', referenceYear: f.year, holdoutDatasets: []
    };
    // eslint-disable-next-line no-await-in-loop
    const run = await runSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: opts.seed ?? 7, mode: 'demo', save: false, stabilityRuns: 1, modelConfig: model });
    const answers = run.respondents.map((r) => ({ w: r.weight, a: new Map(r.answers.map((x) => [x.questionId, x.value?.choice ?? null])) }));
    for (const pr of f.pairs) {
      const qa = idOf.get(pr.a);
      const qb = idOf.get(pr.b);
      if (!qa || !qb) continue;
      let sw = 0;
      let sa = 0;
      let sb = 0;
      let sab = 0;
      for (const r of answers) {
        const ca = r.a.get(qa);
        const cb = r.a.get(qb);
        if (ca == null || cb == null) continue;
        const xa = ca === pr.optA ? 1 : 0;
        const xb = cb === pr.optB ? 1 : 0;
        sw += r.w;
        sa += r.w * xa;
        sb += r.w * xb;
        sab += r.w * xa * xb;
      }
      if (sw <= 0) continue;
      const pa = sa / sw;
      const pb = sb / sw;
      const den = Math.sqrt(pa * (1 - pa) * pb * (1 - pb));
      if (den <= 1e-9) continue;
      const ba = batteryOf(pr.a);
      rows.push({ split: ASSOC_SPLIT[f.year], within: !!ba && ba === batteryOf(pr.b), real: pr.phi, sim: (sab / sw - pa * pb) / den });
    }
  }
  const summarizeRows = (split: string, rs: typeof rows): AssocSummary => {
    const w = rs.filter((r) => r.within);
    const a = rs.filter((r) => !r.within);
    return {
      split,
      files: files.filter((f) => split === 'all' || ASSOC_SPLIT[f.year] === split).length,
      withinPairs: w.length,
      acrossPairs: a.length,
      withinRealMean: r3(avg(w.map((r) => r.real))),
      withinSimMean: r3(avg(w.map((r) => r.sim))),
      withinMae: r3(avg(w.map((r) => Math.abs(r.sim - r.real)))),
      acrossMae: r3(avg(a.map((r) => Math.abs(r.sim - r.real)))),
      corrRealSim: r3(pearson(rs.map((r) => r.real), rs.map((r) => r.sim)))
    };
  };
  const splits = Array.from(new Set(rows.map((r) => r.split)));
  return { model: model.version, rho: model.batteryRho || 0, bySplit: Object.fromEntries(splits.map((s) => [s, summarizeRows(s, rows.filter((r) => r.split === s))])) as Record<string, AssocSummary> };
}

// ---------------- Φάση 2.4: συσχετίσεις μεταξύ θεμάτων από μικροδεδομένα ΠΡΟΗΓΟΥΜΕΝΩΝ κυμάτων ----------------

interface LinkedPair { a: string; b: string; pa: number; pb: number; phi: number; n: number }
interface LinkedFile { year: number; part: string; questions: string[]; pairs: LinkedPair[] }

export function loadLinkedAssoc(): LinkedFile[] {
  const p = benchDir('microdata_assoc_linked.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).files as LinkedFile[]) : [];
}

/** Συστοιχία από κανονικό id αλυσίδας (dn24_1_Q10_3 → dn24_1_Q10). */
export function chainBattery(id: string): string | null {
  const m = id.match(/^(dn\d\d_\d_[A-Za-z]+\d+)_\d+$/);
  return m ? m[1] : null;
}

export interface PairResult { year: number; a: string; b: string; within: boolean; real: number; sim: number; pa: number; pb: number }

/** Συνθετικός phi για τα ζεύγη κάθε αρχείου (περιθώρια από το ίδιο κύμα: δομικός έλεγχος). */
export async function linkedPairs(opts: { model?: ModelConfig; years: number[]; n?: number; seed?: number }): Promise<PairResult[]> {
  const model = opts.model || PRODUCTION_MODEL;
  const out: PairResult[] = [];
  for (const f of loadLinkedAssoc().filter((x) => opts.years.includes(x.year))) {
    const questions: Question[] = [];
    const idOf = new Map<string, string>();
    f.questions.forEach((qid, i) => {
      const q = bankQuestion(qid, `a${i + 1}`);
      if (q) {
        questions.push(q);
        idOf.set(qid, q.id);
      }
    });
    if (questions.length < 2) continue;
    const plan: StudyPlan = {
      domain: 'social_policy', kind: 'survey', title: `Assoc ${f.year}/${f.part}`, researchQuestion: 'Benchmark συσχετίσεων', questions, assumptions: [],
      audience: { minAge: 17 }, sampleSize: opts.n ?? 3000, warnings: [], plannerVersion: 'benchmark', plannerMode: 'rules', referenceYear: f.year, holdoutDatasets: []
    };
    // eslint-disable-next-line no-await-in-loop
    const run = await runSurvey({ plan, populationId: CALIBRATED_POPULATION_ID, seed: opts.seed ?? 7, mode: 'demo', save: false, stabilityRuns: 1, modelConfig: model });
    const optOf = new Map(questions.map((q) => [q.id, (q.options || []).find((o) => !/ΔΓ|ΔΑ|δεν γνωρ|δεν απαντ/i.test(o)) || null]));
    const answers = run.respondents.map((r) => ({ w: r.weight, a: new Map(r.answers.map((x) => [x.questionId, x.value?.choice ?? null])) }));
    for (const pr of f.pairs) {
      const qa = idOf.get(pr.a);
      const qb = idOf.get(pr.b);
      if (!qa || !qb) continue;
      const oa = optOf.get(qa);
      const ob = optOf.get(qb);
      let sw = 0, sa = 0, sb = 0, sab = 0;
      for (const r of answers) {
        const ca = r.a.get(qa);
        const cb = r.a.get(qb);
        if (ca == null || cb == null) continue;
        const xa = ca === oa ? 1 : 0;
        const xb = cb === ob ? 1 : 0;
        sw += r.w;
        sa += r.w * xa;
        sb += r.w * xb;
        sab += r.w * xa * xb;
      }
      if (sw <= 0) continue;
      const pa = sa / sw;
      const pb = sb / sw;
      const den = Math.sqrt(pa * (1 - pa) * pb * (1 - pb));
      if (den <= 1e-9) continue;
      const ba = chainBattery(pr.a);
      out.push({ year: f.year, a: pr.a, b: pr.b, within: !!ba && ba === chainBattery(pr.b), real: pr.phi, sim: (sab / sw - pa * pb) / den, pa: pr.pa, pb: pr.pb });
    }
  }
  return out;
}

const dnorm = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
function qnorm(p: number): number {
  // Acklam
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = Math.min(1 - 1e-9, Math.max(1e-9, p));
  if (pl < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(pl));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (pl > 1 - 0.02425) return -qnorm(1 - pl);
  const q = pl - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Φορτίσεις K παραγόντων ανά ερώτηση από το ΥΠΟΛΟΙΠΟ των συσχετίσεων (πραγματικός − δημογραφικά επαγόμενος phi του engine),
 * μετατρεπόμενο σε λανθάνουσα συσχέτιση (r ≈ Δphi·√(pa qa pb qb)/(φ(za)φ(zb))) και προσαρμοσμένο με ALS χαμηλού βαθμού
 * (ποινή μ). Μόνο ζεύγη των κυμάτων εκπαίδευσης· τιμές |r| > 0.9 κόβονται.
 */
export function fitItemFactors(train: PairResult[], K = 3, mu = 0.5, iters = 60) {
  const acc = new Map<string, { a: string; b: string; s: number; n: number }>();
  for (const p of train) {
    const za = qnorm(p.pa);
    const zb = qnorm(p.pb);
    const den = dnorm(za) * dnorm(zb);
    if (den < 1e-4) continue;
    const r = Math.max(-0.9, Math.min(0.9, ((p.real - p.sim) * Math.sqrt(p.pa * (1 - p.pa) * p.pb * (1 - p.pb))) / den));
    const k = `${p.a}|${p.b}`;
    const e = acc.get(k) || { a: p.a, b: p.b, s: 0, n: 0 };
    e.s += r;
    e.n++;
    acc.set(k, e);
  }
  const items = Array.from(new Set(Array.from(acc.values()).flatMap((e) => [e.a, e.b]))).sort();
  const idx = new Map(items.map((x, i) => [x, i]));
  const nb: { j: number; r: number }[][] = items.map(() => []);
  acc.forEach((e) => {
    const i = idx.get(e.a)!;
    const j = idx.get(e.b)!;
    nb[i].push({ j, r: e.s / e.n });
    nb[j].push({ j: i, r: e.s / e.n });
  });
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  const L = items.map(() => Array.from({ length: K }, () => 0.2 * rnd()));
  const solve = (A: number[][], y: number[]) => {
    // Gauss-Jordan για μικρό K
    const n = y.length;
    const M = A.map((row, i) => [...row, y[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-12;
      for (let k = c; k <= n; k++) M[c][k] /= d;
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = M[r][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row) => row[n]);
  };
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < items.length; i++) {
      const A = Array.from({ length: K }, (_, a) => Array.from({ length: K }, (_, b) => (a === b ? mu : 0)));
      const y = Array(K).fill(0);
      for (const { j, r } of nb[i]) {
        const lj = L[j];
        for (let a = 0; a < K; a++) {
          y[a] += r * lj[a];
          for (let b = 0; b < K; b++) A[a][b] += lj[a] * lj[b];
        }
      }
      const li = solve(A, y);
      const n2 = li.reduce((s, x) => s + x * x, 0);
      L[i] = n2 > 0.95 ? li.map((x) => x * Math.sqrt(0.95 / n2)) : li;
    }
  }
  const loadings: Record<string, number[]> = {};
  items.forEach((x, i) => (loadings[x] = L[i].map((v) => Math.round(v * 1000) / 1000)));
  let se = 0;
  let n = 0;
  acc.forEach((e) => {
    const li = L[idx.get(e.a)!];
    const lj = L[idx.get(e.b)!];
    se += (e.s / e.n - li.reduce((s, v, k) => s + v * lj[k], 0)) ** 2;
    n++;
  });
  return { K, loadings, items: items.length, pairs: n, rmseTrain: Math.round(Math.sqrt(se / Math.max(1, n)) * 1000) / 1000 };
}

export function summarizePairs(rows: PairResult[]) {
  const w = rows.filter((r) => r.within);
  const a = rows.filter((r) => !r.within);
  const m = (xs: number[]) => r3(avg(xs));
  return {
    pairs: rows.length,
    withinPairs: w.length,
    acrossPairs: a.length,
    withinMae: m(w.map((r) => Math.abs(r.sim - r.real))),
    acrossMae: m(a.map((r) => Math.abs(r.sim - r.real))),
    acrossRealMeanAbs: m(a.map((r) => Math.abs(r.real))),
    corrRealSim: r3(pearson(rows.map((r) => r.real), rows.map((r) => r.sim)))
  };
}
