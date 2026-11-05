// Viewscope benchmark v1 — BM.3: χρόνος, κόστος και εσωτερική συνοχή των υπαρχόντων μηχανισμών (μόνο ανάγνωση).
// Εκτέλεση (σε απομονωμένο φάκελο δεδομένων, χωρίς αποθήκευση μελετών):
//   SYNTHETIC_LAB_DATA_DIR=<isolated> node_modules/.bin/tsx benchmarks/viewscope_v1/scripts/runtime_coherence.ts
// Δεν αλλάζει κανένα παραγωγικό μοντέλο: καλεί runSurvey({save:false}) και runStructuredStudy σε αντίγραφο του spec.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runSurvey } from '../../../lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { runStructuredStudy } from '../../../lib/synthetic-lab/structured/engine';
import type { StructuredStudySpec } from '../../../lib/synthetic-lab/structured/types';

const REPO = path.resolve(__dirname, '../../..');
const OUT = path.join(REPO, 'benchmarks/viewscope_v1/results');
const STUDIES = path.join(REPO, '.synthetic-lab-data/studies');
const SEED = 20261105;

type Row = Record<string, string | number | null>;
type Matrix = { ids: string[]; cols: (string | null)[][]; ordinal: boolean[]; ordVals: (number | null)[][] };

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function cramersV(a: (string | null)[], b: (string | null)[]): number | null {
  const ra: string[] = [], rb: string[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) { ra.push(a[i]!); rb.push(b[i]!); }
  const n = ra.length; if (n < 30) return null;
  const la = Array.from(new Set(ra)), lb = Array.from(new Set(rb));
  if (la.length < 2 || lb.length < 2) return null;
  const ia = new Map(la.map((x, i) => [x, i])), ib = new Map(lb.map((x, i) => [x, i]));
  const t = la.map(() => lb.map(() => 0));
  for (let i = 0; i < n; i++) t[ia.get(ra[i])!][ib.get(rb[i])!]++;
  const rs = t.map((r) => r.reduce((s, x) => s + x, 0)), cs = lb.map((_, j) => t.reduce((s, r) => s + r[j], 0));
  let chi = 0;
  for (let i = 0; i < la.length; i++) for (let j = 0; j < lb.length; j++) { const e = (rs[i] * cs[j]) / n; chi += ((t[i][j] - e) ** 2) / e; }
  return Math.sqrt(chi / n / Math.min(la.length - 1, lb.length - 1));
}
function rank(v: number[]): number[] { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }
function spearman(a: (number | null)[], b: (number | null)[]): number | null {
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) { x.push(a[i]!); y.push(b[i]!); }
  if (x.length < 30) return null;
  const rx = rank(x), ry = rank(y), m = (rx.length - 1) / 2;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - m) * (ry[i] - m); sxx += (rx[i] - m) ** 2; syy += (ry[i] - m) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
function shuffled<T>(v: T[], rnd: () => number): T[] { const c = v.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; }

/** Συνοχή: μέση V Cramér μεταξύ ζευγών ερωτήσεων, μείον το επίπεδο ανεξαρτησίας (ίδιες κατανομές, τυχαία ανακατεμένες). */
function coherence(m: Matrix) {
  const rnd = mulberry32(SEED);
  const vs: number[] = [], vnull: number[] = [], rhos: number[] = [];
  const nullCols = m.cols.map((c) => shuffled(c, rnd));
  for (let i = 0; i < m.ids.length; i++) for (let j = i + 1; j < m.ids.length; j++) {
    const v = cramersV(m.cols[i], m.cols[j]); const v0 = cramersV(nullCols[i], nullCols[j]);
    if (v !== null && v0 !== null) { vs.push(v); vnull.push(v0); }
    if (m.ordinal[i] && m.ordinal[j]) { const r = spearman(m.ordVals[i], m.ordVals[j]); if (r !== null) rhos.push(Math.abs(r)); }
  }
  const mv = mean(vs), m0 = mean(vnull);
  return { pairs: vs.length, meanV: mv, meanVnull: m0, excessV: mv !== null && m0 !== null ? mv - m0 : null, strongPairsShare: vs.length ? vs.filter((x) => x >= 0.2).length / vs.length : null, ordinalPairs: rhos.length, meanAbsRho: mean(rhos) };
}

async function surveyCase(file: string, engineOverride: string | null, n: number) {
  const doc = JSON.parse(readFileSync(path.join(STUDIES, file), 'utf8'));
  const plan = { ...doc.plan, sampleSize: n, ...(engineOverride ? { engine: engineOverride } : {}) };
  const t0 = process.hrtime.bigint();
  const run = await runSurvey({ plan, populationId: doc.populationId || DEFAULT_POPULATION_ID, seed: SEED, save: false, stabilityRuns: 0, mode: 'demo' } as any);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const qs = plan.questions as { id: string; type: string; scale?: string[] }[];
  const basis: Record<string, number> = {}; let total = 0, na = 0;
  const ids = qs.map((q) => q.id);
  const cols: (string | null)[][] = ids.map(() => []), ordVals: (number | null)[][] = ids.map(() => []);
  for (const r of run.respondents) {
    const byQ = new Map(r.answers.map((a) => [a.questionId, a]));
    ids.forEach((id, k) => {
      const a = byQ.get(id);
      if (a) { basis[a.basis] = (basis[a.basis] || 0) + 1; total++; if (a.value === null || a.skipped) na++; }
      const v = a?.value || null;
      const cat = v ? (v.choice ?? (v.scaleIndex !== undefined ? String(v.scaleIndex) : v.choices ? v.choices.slice().sort().join('|') : null)) : null;
      cols[k].push(cat); ordVals[k].push(v && v.scaleIndex !== undefined ? v.scaleIndex : null);
    });
  }
  const ordinal = ids.map((_, k) => ordVals[k].some((x) => x !== null));
  const coh = coherence({ ids, cols, ordinal, ordVals });
  return { wallMs: ms, respondents: run.respondents.length, questions: ids.length, engineVersion: run.engine.engineVersion, apiCalls: run.cost.calls, usd: run.cost.usd, basisShares: Object.fromEntries(Object.entries(basis).map(([k, v]) => [k, v / Math.max(1, total)])), naShare: na / Math.max(1, total), coherence: coh };
}

function structuredCase(n: number) {
  const spec = JSON.parse(readFileSync(path.join(REPO, 'studies/kotsovolos_lab_pilot_2026/spec.json'), 'utf8')) as StructuredStudySpec;
  const t0 = process.hrtime.bigint();
  const run = runStructuredStudy(spec, { n, seed: SEED, effectScale: 1, baseShift: 0, ablateMetrics: [], ablatePie: false });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const ids = spec.questions.map((q) => q.id);
  const cols = ids.map((id) => run.respondents.map((r) => { const v = r.answers[id]; return v === null || v === undefined ? null : Array.isArray(v) ? v.slice().sort().join('|') : String(v); }));
  const cls: Record<string, number> = {}; let total = 0, na = 0;
  for (const r of run.respondents) for (const id of ids) { const c = r.classes[id]; total++; if (r.answers[id] === null || r.answers[id] === undefined) na++; else cls[c || 'null'] = (cls[c || 'null'] || 0) + 1; }
  const coh = coherence({ ids, cols, ordinal: ids.map(() => false), ordVals: ids.map(() => []) });
  // Οι πολλαπλές απαντήσεις (συνδυασμοί επιλογών) έχουν πολλές κατηγορίες και φουσκώνουν το V και στο μηδενικό· γι' αυτό και μόνο μονής επιλογής.
  const single = ids.map((id, k) => [id, k] as const).filter(([id]) => spec.questions.find((q) => q.id === id)!.type === 'single_choice');
  const cohSingle = coherence({ ids: single.map((x) => x[0]), cols: single.map((x) => cols[x[1]]), ordinal: single.map(() => false), ordVals: single.map(() => []) });
  return { coherenceSingleChoice: cohSingle, wallMs: ms, generationMs: run.timingsMs.generation_ms ?? null, respondents: run.respondents.length, questions: ids.length, engineVersion: run.engineVersion, apiCalls: 0, usd: 0, basisShares: Object.fromEntries(Object.entries(cls).map(([k, v]) => [k, v / Math.max(1, total)])), naShare: na / Math.max(1, total), coherence: coh, note: 'NA = ερωτήσεις εκτός διαδρομής (skip logic), όχι αποχή' };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cases: { name: string; domain: string; file?: string; engine?: string | null; structured?: boolean }[] = [
    { name: 'prod-1', domain: 'καταναλωτική/οικονομική', file: 'study-mvr0mtz8-1srzsi.json', engine: null },
    { name: 'EGPS', domain: 'καταναλωτική/οικονομική (ίδιο σχέδιο)', file: 'study-mvr0mtz8-1srzsi.json', engine: 'evidence' },
    { name: 'PIE (pie-0.2) πολιτική', domain: 'πολιτική', file: 'study-mvslb843-v7hait.json', engine: null },
    { name: 'PIE βαρόμετρο', domain: 'κοινωνική/πολιτική', file: 'study-mvsjkfa5-5medyu.json', engine: null },
    { name: 'PIE Cinobo', domain: 'καταναλωτική', file: 'study-mvsjt73p-5czv7q.json', engine: null },
    { name: 'structured-1.0 (Κωτσόβολος pilot)', domain: 'καταναλωτική', structured: true }
  ];
  const results: any[] = [];
  for (const c of cases) for (const n of [500, 1000]) {
    try {
      // Μία «ζεστή» εκτέλεση για να μη μετρηθεί η φόρτωση cache, και μία μετρημένη.
      const cold = c.structured ? structuredCase(n) : await surveyCase(c.file!, c.engine ?? null, n);
      const warm = c.structured ? structuredCase(n) : await surveyCase(c.file!, c.engine ?? null, n);
      results.push({ case: c.name, domain: c.domain, n, coldWallMs: Math.round(cold.wallMs), ...warm, wallMs: Math.round(warm.wallMs) });
      console.log(`${c.name} n=${n}: cold ${(cold.wallMs / 1000).toFixed(2)}s warm ${(warm.wallMs / 1000).toFixed(2)}s · excessV ${warm.coherence.excessV?.toFixed(3)} · NA ${(warm.naShare * 100).toFixed(1)}%`);
    } catch (e) {
      results.push({ case: c.name, domain: c.domain, n, error: String((e as Error).message).slice(0, 300) });
      console.log(`${c.name} n=${n}: ΣΦΑΛΜΑ ${(e as Error).message.slice(0, 200)}`);
    }
  }
  writeFileSync(path.join(OUT, 'runtime_coherence.json'), JSON.stringify({ seed: SEED, dataDir: process.env.SYNTHETIC_LAB_DATA_DIR ? 'isolated' : 'default', node: process.version, results }, null, 1));
  const head = ['case', 'domain', 'n', 'questions', 'engine', 'cold_s', 'warm_s', 'api_calls', 'usd', 'na_share', 'pairs', 'meanV', 'meanV_null', 'excessV', 'share_V>=0.2', 'ordinal_pairs', 'mean_abs_rho', 'basis_shares'];
  const lines = [head.join(',')];
  for (const r of results) {
    if (r.error) { lines.push([r.case, r.domain, r.n, '', 'ERROR', '', '', '', '', '', '', '', '', '', '', '', '', JSON.stringify(r.error)].map((x) => `"${String(x).replace(/"/g, "'")}"`).join(',')); continue; }
    const f = (x: number | null, d = 3) => (x === null || x === undefined ? '' : x.toFixed(d));
    lines.push([r.case, r.domain, r.n, r.questions, r.engineVersion, f(r.coldWallMs / 1000, 2), f(r.wallMs / 1000, 2), r.apiCalls, r.usd, f(r.naShare), r.coherence.pairs, f(r.coherence.meanV), f(r.coherence.meanVnull), f(r.coherence.excessV), f(r.coherence.strongPairsShare), r.coherence.ordinalPairs, f(r.coherence.meanAbsRho), Object.entries(r.basisShares).map(([k, v]) => `${k}:${(v as number).toFixed(2)}`).join(' ')].map((x) => `"${String(x)}"`).join(','));
  }
  writeFileSync(path.join(OUT, 'runtime_coherence.csv'), lines.join('\n') + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
