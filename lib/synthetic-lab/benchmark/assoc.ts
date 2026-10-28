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
