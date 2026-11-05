// ============================================================
// Viewscope v2 — vs-xtab-1.0 (προαιρετικό): πραγματικοί δημοσιευμένοι πίνακες υποομάδων ως ΠΙΘΑΝΟΤΙΚΕΣ συνθήκες απάντησης.
//
// Για ερώτηση με γνωστό συνολικό ποσοστό p (π.χ. προηγούμενο δημοσιευμένο κύμα), κάθε συνθετικό πρόσωπο απαντά με πιθανότητες
// που εξαρτώνται από τις ομάδες του (προηγούμενη ψήφος 2023, ιδεολογία, ηλικία, φύλο), όπως τις δείχνουν επαληθευμένοι πίνακες.
//   1. Ελεγχόμενη συμφιλίωση (IPF) ανά διάσταση: σύνθεση των συνθετικών προσώπων × συνολικό p, κρατώντας τους λόγους πιθανοτήτων
//      του πίνακα· καταγράφεται πόσο «λύγισε» ο πίνακας (απόκλιση σε π.μ.). Διάσταση με απόκλιση > 6 π.μ. ή πίνακα > 24 μηνών
//      ΔΕΝ χρησιμοποιείται (όρια ασφαλείας, ορίστηκαν μετά τον ανεξάρτητο έλεγχο ως συντηρητικά).
//   2. Συνδυασμός διαστάσεων με πολυδιάστατο IPF· το συνολικό p επιβάλλεται τελευταίο (η απόκλιση καταγράφεται — μπορεί να
//      μην είναι ακριβώς 0 όταν οι περιορισμοί είναι ασύμβατοι).
//   3. Ανάθεση με ακριβή πλήθη ανά κελί και τυχαία σειρά: κάθε πρόσωπο κρατά ατομική τυχαιότητα (καμία ντετερμινιστική απάντηση).
// Η σχέση δύο ερωτήσεων ΜΕΣΑ σε κάθε ομάδα δεν είναι γνωστή από τους πίνακες: υποτίθεται ρητά ανεξαρτησία υπό συνθήκη (S).
// Κατηγορία: η πηγή είναι εμπειρική, η εκτίμηση μεταφέρεται χρονικά → T (ποτέ αυτόματα E).
// Αξιολόγηση: benchmarks/viewscope_v2/xtab/xtab_eval.json.
// ============================================================
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createRng, deriveSeed } from '../rng';
import { dataRoot } from '../storage/paths';
import type { PersonaState } from '../persona/panel';
import type { Question, SyntheticRespondent } from '../types';
import { monthsBetween } from './published-waves';
import { entityTokens, isDkOption, normalize, orgKey, sameEntities, trigramJaccard } from './text';

/** Ίδιο έγγραφο: ο πίνακας ανήκει στην ίδια ερώτηση μόνο αν μοιάζει το κείμενο ή αν οι οντότητές του (π.χ. «Τσίπρα») περιέχονται στην ερώτηση. */
function sameDocSameQuestion(t: { question: string }, q: string): boolean {
  if (trigramJaccard(t.question, q) >= 0.5) return true;
  const te = Array.from(entityTokens(`x ${t.question.replace(/^[.…\s]+/, '')}`)), qe = entityTokens(q); // «…Τσίπρα»: η πρώτη λέξη δεν είναι αρχή πρότασης
  return te.length > 0 && te.every((x) => qe.has(x));
}

export const XTAB_RULES = { maxAgeMonths: 24, maxReconcileDevPp: 6, textMin: 0.85, optionMin: 0.8, ipfIters: 60 } as const;

export interface Crosstab {
  id: string; org: string; orgLabel: string | null; question: string; options: string[]; groups: Record<string, number[]>;
  dims: Record<string, number>; partyBase: string | null; availableAt: string | null; fieldworkEnd: string | null;
  doc: { docId: string; page: number; url: string | null; title: string | null }; verification: Record<string, unknown>;
}
let cache: Crosstab[] | null = null;
export function loadCrosstabs(file?: string): Crosstab[] {
  if (cache && !file) return cache;
  const f = file || path.join(dataRoot(), 'viewscope', 'crosstabs.json');
  const t = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')).tables as Crosstab[]) : [];
  if (!file) cache = t;
  return t;
}

/** Ομάδα του συνθετικού προσώπου σε μια διάσταση, με τα κλειδιά του πίνακα. */
const AGE_MID: Record<string, number> = { '17-24': 20.5, '25-34': 29.5, '35-44': 39.5, '45-54': 49.5, '55-64': 59.5, '65+': 72 };
export function personaGroup(ps: PersonaState, dim: string, keys: string[], partyBase: string | null): string | null {
  const d = ps.demographics, a = ps.anchors as any;
  if (dim === 'gender') return d.gender === 'male' || d.gender === 'female' ? `gender:${d.gender}` : null;
  if (dim === 'age') {
    const mid = d.age_band ? AGE_MID[d.age_band] : undefined;
    if (mid == null) return null;
    const k = keys.find((x) => { const [lo, hi] = x.slice(4).split('-').map(Number); return mid >= lo && mid <= hi + 0.99; });
    return k || null;
  }
  if (dim === 'party') {
    if (partyBase !== 'pastvote_2023-06' || !a.pv) return null; // μόνο πίνακες με βάση την ψήφο 2023 (ίδια με την άγκυρα PIE)
    const k = `party:${a.pv}`;
    return keys.includes(k) ? k : null;
  }
  if (dim === 'ideology') {
    if (a.lr7 == null) return null;
    const x = Number(a.lr7);
    const b = x <= 2 ? 'left' : x <= 3 ? 'centre_left' : x <= 4 ? 'centre' : x <= 5 ? 'centre_right' : 'right';
    return keys.includes(`ideology:${b}`) ? `ideology:${b}` : null;
  }
  return null;
}

/** Αντιστοίχιση επιλογών πίνακα → επιλογές ερώτησης (χωρίς ΔΓ/ΔΑ). null αν δεν είναι 1:1 στις ουσιαστικές επιλογές. */
function optionIndex(table: string[], target: string[]): number[] | null {
  const subst = target.filter((o) => !isDkOption(o));
  const used = new Set<number>();
  const idx: number[] = [];
  for (const t of subst) {
    let best = -1, bs = 0;
    table.forEach((o, j) => { if (used.has(j)) return; const s = normalize(o) === normalize(t) ? 1 : trigramJaccard(o, t); if (s > bs) { bs = s; best = j; } });
    if (best < 0 || bs < XTAB_RULES.optionMin) return null;
    used.add(best); idx.push(best);
  }
  return idx;
}

export interface XtabReport { questionId: string; tables: string[]; dimsUsed: { dim: string; table: string; reconcileDevPp: number; groups: number }[]; dimsDropped: { dim: string; reason: string }[]; maxMarginalDevPp: number; residual: string }

/** Πίνακες που ταιριάζουν στην ερώτηση (ρητή σύνδεση, ίδιο έγγραφο με την πηγή της διαδρομής, ή ίδια διατύπωση και επιλογές). */
export function matchCrosstabs(q: Question, opts: string[], ctx: { org: string | null; fieldworkStart: string; sourceDocId?: string | null; explicit?: string[] }, tables = loadCrosstabs()): Crosstab[] {
  const ok = (t: Crosstab) => t.availableAt && t.availableAt < ctx.fieldworkStart && monthsBetween(t.fieldworkEnd || t.availableAt, ctx.fieldworkStart) <= XTAB_RULES.maxAgeMonths && optionIndex(t.options, opts);
  if (ctx.explicit?.length) return tables.filter((t) => ctx.explicit!.includes(t.id) && ok(t));
  return tables.filter((t) => ok(t) && ((ctx.sourceDocId && t.doc.docId === ctx.sourceDocId && sameDocSameQuestion(t, q.text)) || (trigramJaccard(t.question, q.text) >= XTAB_RULES.textMin && sameEntities(t.question, q.text) && (!ctx.org || t.org === orgKey(ctx.org)))));
}

function ipf2(nG: number[], P: number[][], p: number[]): { Q: number[][]; dev: number } {
  const K = p.length, N = nG.reduce((s, x) => s + x, 0);
  let T = P.map((row, g) => row.map((x) => nG[g] * (x + 1e-6)));
  for (let it = 0; it < 200; it++) {
    for (let k = 0; k < K; k++) { const c = T.reduce((s, r) => s + r[k], 0) || 1e-12; const f = (N * p[k]) / c; T.forEach((r) => (r[k] *= f)); }
    T = T.map((r, g) => { const s = r.reduce((a, b) => a + b, 0) || 1e-12; return r.map((x) => (x * nG[g]) / s); });
  }
  const Q = T.map((r) => { const s = r.reduce((a, b) => a + b, 0) || 1; return r.map((x) => x / s); });
  const dev = (100 * Q.reduce((s, r, g) => s + r.reduce((a, x, k) => a + Math.abs(x - P[g][k]), 0) / K, 0)) / Q.length;
  return { Q, dev };
}

/**
 * Επιστρέφει δείκτη επιλογής ανά ενεργό ερωτώμενο (ίδια σειρά με rs) ή null αν δεν εφαρμόζεται. p: κατανομή-στόχος σε όλες τις επιλογές.
 */
export function xtabAssign(q: Question, opts: string[], p: number[], rs: SyntheticRespondent[], states: Map<string, PersonaState>, tables: Crosstab[], seed: number): { picks: number[] | null; report: XtabReport } | null {
  if (!tables.length) return null;
  const n = rs.length;
  const ps = rs.map((r) => states.get(r.personaId));
  if (ps.some((x) => !x)) return null;
  const dkIdx = opts.findIndex((o) => isDkOption(o));
  const subst = opts.map((_, k) => k).filter((k) => k !== dkIdx);
  const ps0 = subst.map((k) => p[k]); const tot = ps0.reduce((s, x) => s + x, 0) || 1;
  const pS = ps0.map((x) => x / tot); const K = subst.length;
  // ΔΓ/ΔΑ: ανεξάρτητα στο ποσοστό της διαδρομής (οι πίνακες συνήθως δεν το περιέχουν με αξιόπιστο τρόπο)
  const out = new Array(n).fill(-1);
  const pool: number[] = [];
  for (let i = 0; i < n; i++) { const u = createRng(deriveSeed(seed, 'vs2-xt-dk', q.id, rs[i].personaId)).next(); if (dkIdx >= 0 && u < p[dkIdx]) out[i] = dkIdx; else pool.push(i); }
  const report: XtabReport = { questionId: q.id, tables: [], dimsUsed: [], dimsDropped: [], maxMarginalDevPp: 0, residual: 'Η σχέση με άλλες ερωτήσεις ΜΕΣΑ σε κάθε ομάδα δεν μετρήθηκε· υποτίθεται ανεξαρτησία υπό συνθήκη (S).' };
  // διαστάσεις: για κάθε διάσταση ο πιο πρόσφατος πίνακας που τη δίνει
  const byDim = new Map<string, Crosstab>();
  tables.slice().sort((a, b) => ((b.availableAt || '') > (a.availableAt || '') ? 1 : -1)).forEach((t) => Object.keys(t.dims).forEach((d) => { if (!byDim.has(d)) byDim.set(d, t); }));
  const comps: { dim: string; g: (string | null)[]; keys: string[]; Q: number[][] }[] = [];
  byDim.forEach((t, dim) => {
    const map = optionIndex(t.options, opts)!;
    const keys = Object.keys(t.groups).filter((k) => k.startsWith(`${dim}:`));
    const g = pool.map((i) => personaGroup(ps[i]!, dim, keys, t.partyBase));
    const present = keys.filter((k) => g.some((x) => x === k));
    if (present.length < 2) { report.dimsDropped.push({ dim, reason: dim === 'party' && t.partyBase !== 'pastvote_2023-06' ? 'ο πίνακας δεν έχει βάση την ψήφο 2023' : 'λιγότερες από 2 ομάδες στο δείγμα' }); return; }
    const P = present.map((k) => { const row = map.map((j) => Math.max(t.groups[k][j] || 0, 0)); const s = row.reduce((a, b) => a + b, 0) || 1; return row.map((x) => x / s); });
    const nG = present.map((k) => g.filter((x) => x === k).length);
    const { Q, dev } = ipf2(nG, P, pS);
    if (dev > XTAB_RULES.maxReconcileDevPp) { report.dimsDropped.push({ dim, reason: `απόκλιση συμφιλίωσης ${dev.toFixed(1)} π.μ. > ${XTAB_RULES.maxReconcileDevPp}` }); return; }
    comps.push({ dim, g, keys: present, Q });
    report.dimsUsed.push({ dim, table: t.id, reconcileDevPp: +dev.toFixed(2), groups: present.length });
    if (!report.tables.includes(t.id)) report.tables.push(t.id);
  });
  if (!comps.length) return { picks: null, report }; // όλες οι διαστάσεις απορρίφθηκαν (καταγράφεται το γιατί)
  // πολυδιάστατη συμφιλίωση σε κελιά (συνδυασμός ομάδων)
  const cellKey = pool.map((_, i) => comps.map((c) => c.g[i] ?? '·').join('|'));
  const cells = Array.from(new Set(cellKey)); const ci = cellKey.map((k) => cells.indexOf(k));
  const nC = cells.map((_, c) => ci.filter((x) => x === c).length); const N = pool.length;
  let T = nC.map((m) => pS.map((x) => m * x));
  const memb = comps.map((c) => c.keys.map((k) => cells.map((cell, cc) => { const idx = pool.map((_, i) => i).filter((i) => ci[i] === cc); return idx.length ? idx.filter((i) => c.g[i] === k).length / idx.length : 0; })));
  for (let it = 0; it < XTAB_RULES.ipfIters; it++) {
    comps.forEach((c, di) => c.keys.forEach((k, gi) => {
      const w = memb[di][gi]; const nk = c.g.filter((x) => x === k).length;
      for (let a = 0; a < K; a++) {
        const cur = T.reduce((s, row, cc) => s + row[a] * w[cc], 0) || 1e-12; const f = (nk * c.Q[gi][a]) / cur;
        T.forEach((row, cc) => (row[a] = row[a] * (1 - w[cc]) + row[a] * w[cc] * f));
      }
    }));
    for (let a = 0; a < K; a++) { const cs = T.reduce((s, row) => s + row[a], 0) || 1e-12; const f = (N * pS[a]) / cs; T.forEach((row) => (row[a] *= f)); }
    T = T.map((row, cc) => { const s = row.reduce((x, y) => x + y, 0) || 1e-12; return row.map((x) => (x * nC[cc]) / s); });
  }
  // ανάθεση: ακριβή πλήθη ανά κελί (μεγαλύτερο υπόλοιπο), τυχαία σειρά μέσα στο κελί
  cells.forEach((_, cc) => {
    const idx = pool.filter((_, i) => ci[i] === cc);
    const want = T[cc].map((x) => x); const base = want.map((x) => Math.floor(x)); let rem = idx.length - base.reduce((s, x) => s + x, 0);
    want.map((x, a) => [x - Math.floor(x), a] as [number, number]).sort((x, y) => y[0] - x[0]).forEach(([, a]) => { if (rem > 0) { base[a]++; rem--; } });
    const order = idx.map((i) => [createRng(deriveSeed(seed, 'vs2-xt', q.id, rs[i].personaId)).next(), i] as [number, number]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    let pos = 0;
    base.forEach((cnt, a) => { for (let j = 0; j < cnt && pos < order.length; j++) out[order[pos++]] = subst[a]; });
    while (pos < order.length) out[order[pos++]] = subst[K - 1];
  });
  const got = subst.map((k) => out.filter((x) => x === k).length / Math.max(1, pool.length));
  report.maxMarginalDevPp = +(100 * Math.max(...got.map((x, a) => Math.abs(x - pS[a])))).toFixed(2);
  return { picks: out, report };
}

// ------------------------------------------------------------ δηλωμένες σχέσεις S (κοινωνικές/οικονομικές/καταναλωτικές)
export type Driver = 'econ4' | 'inc6' | 'age' | 'edu' | 'gender' | 'lr7' | 'class3' | 'polint4';
export interface DeclaredRelation { questionId: string; driver: Driver; direction: 1 | -1; strength: 'mild' | 'moderate'; note?: string }
export const STRENGTH: Record<'none' | 'mild' | 'moderate', number> = { none: 0, mild: 0.15, moderate: 0.3 };
export function driverValue(ps: PersonaState, d: Driver): number | null {
  const a = ps.anchors as any, dm = ps.demographics;
  if (d === 'age') return dm.age_band ? AGE_MID[dm.age_band] ?? null : null;
  if (d === 'edu') return dm.edu3 === 'low' ? 0 : dm.edu3 === 'medium' ? 1 : dm.edu3 === 'high' ? 2 : null;
  if (d === 'gender') return dm.gender === 'female' ? 1 : dm.gender === 'male' ? 0 : null;
  const v = a[d]; return v == null || Number.isNaN(Number(v)) ? null : Number(v);
}
/** Σενάριο S: ήπια/μέτρια δηλωμένη σχέση με χαρακτηριστικό του προσώπου, ίδιο ακριβώς συνολικό ποσοστό. */
export function declaredAssign(q: Question, opts: string[], p: number[], rs: SyntheticRespondent[], states: Map<string, PersonaState>, rel: DeclaredRelation, s: number, seed: number): number[] | null {
  const ps = rs.map((r) => states.get(r.personaId)); if (ps.some((x) => !x)) return null;
  const v = ps.map((x) => driverValue(x!, rel.driver));
  const ok = v.filter((x): x is number => x != null); if (ok.length < 10) return null;
  const m = ok.reduce((a, b) => a + b, 0) / ok.length, sd = Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / ok.length) || 1;
  const z = rs.map((r, i) => s * rel.direction * (v[i] == null ? 0 : (v[i]! - m) / sd) + Math.sqrt(1 - s * s) * createRng(deriveSeed(seed, 'vs2-decl', q.id, r.personaId)).normal());
  const dkIdx = opts.findIndex((o) => isDkOption(o)); const out = new Array(rs.length).fill(-1); const pool: number[] = [];
  rs.forEach((r, i) => { const u = createRng(deriveSeed(seed, 'vs2-decl-dk', q.id, r.personaId)).next(); if (dkIdx >= 0 && u < p[dkIdx]) out[i] = dkIdx; else pool.push(i); });
  const subst = opts.map((_, k) => k).filter((k) => k !== dkIdx); const pp = subst.map((k) => p[k]); const tot = pp.reduce((a, b) => a + b, 0) || 1;
  const order = pool.slice().sort((x, y) => z[x] - z[y]); let pos = 0;
  subst.forEach((k, j) => { const c = j === subst.length - 1 ? order.length - pos : Math.round((pp[j] / tot) * order.length); for (let t = 0; t < c && pos < order.length; t++) out[order[pos++]] = k; });
  return out;
}
