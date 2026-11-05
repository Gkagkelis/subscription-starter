// ============================================================
// Structured engine — γρήγορος στατιστικός μηχανισμός για ΔΟΜΗΜΕΝΑ ερωτηματολόγια (skip logic, πολλαπλές επιλογές,
// κανόνες συνοχής), πάνω στα υπάρχοντα στοιχεία του Synthetic Lab:
//   * πληθυσμός: βαθμονομημένος GLOPOP-S Ελλάδας (population/store) και πάνελ PIE με εμπειρικές άγκυρες (persona/panel)·
//   * εμπειρικοί δείκτες: data lake / Eurostat / NORAYA, προσαρμοσμένοι ανά πρόσωπο με το mc-logit του prod-1 (fitPriorsForQuestions)·
//   * σενάριο: ρητό παραμετρικό μοντέλο (λανθάνοντες παράγοντες, ordinal/nominal/multi) με δηλωμένες παραδοχές.
// Κάθε ερώτηση έχει κατηγορία E/T/S· ο μηχανισμός ελέγχει ότι η δηλωμένη κατηγορία στηρίζεται πράγματι σε δεδομένα.
// Χωρίς AI, χωρίς δίκτυο. Ντετερμινιστικό για ίδιο seed.
// ============================================================
import { createHash } from 'crypto';
import { probit } from '../engine/demo-responder';
import { fitPriorsForQuestions } from '../engine/survey';
import { PRIOR_MODEL_VERSION } from '../engine/prior-model';
import { buildPanel } from '../persona/panel';
import { loadPopulation } from '../population/store';
import { createRng, deriveSeed, type Rng } from '../rng';
import type { Persona, Question } from '../types';
import { classFromBasis, EVIDENCE_CLASS_VERSION, type EvidenceClass } from './evidence-class';
import { evalBool, evalNum, identifiers, type Env, type Value } from './expr';
import type { Effect, QuestionSpec, RunOptions, StructuredStudySpec } from './types';

export const STRUCTURED_ENGINE_VERSION = 'structured-1.0';

export interface StructuredRespondent {
  respondent_id: string;
  persona_id: string;
  weight: number;
  covariates: Record<string, string | number | null>;
  latents: Record<string, number>;
  answers: Record<string, string | string[] | null>;
  classes: Record<string, EvidenceClass | null>;
  /** Ενεργοποιημένα εμπειρικά όρια / επαναλήψεις λόγω κανόνων. */
  flags: string[];
}

export interface StructuredRun {
  engineVersion: string;
  evidenceClassVersion: string;
  specSha256: string;
  studyId: string;
  options: Required<Omit<RunOptions, 'personaIds'>>;
  respondents: StructuredRespondent[];
  questionMeta: Record<string, { declared: EvidenceClass; derived: EvidenceClass; directMetrics: string[]; usesMetrics: string[]; usesPie: boolean; boundsActivated: number; constraintRedraws: number }>;
  metricFits: Record<string, { metric: string; label: string; wave: string | null; meanP: number | null; minP: number | null; maxP: number | null; fitErrorPp: number | null; ablated: boolean }>;
  population: { populationId: string; pieModel: string; poolSize: number; margins: Record<string, Record<string, number>> };
  timingsMs: Record<string, number>;
  warnings: string[];
}

const PIE_VARS = ['emp', 'inc6', 'econ4', 'class3', 'incq5', 'hhsize5'];
const logit = (p: number) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); return Math.log(q / (1 - q)); };
const invLogit = (x: number) => 1 / (1 + Math.exp(-x));

/** Κλειδί σταθερής σειράς για JSON (για το hash της προδιαγραφής). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export function specHash(spec: StructuredStudySpec): string {
  return createHash('sha256').update(stable(spec)).digest('hex');
}

/** Ονόματα που χρησιμοποιεί το μοντέλο μιας ερώτησης (για έλεγχο κατηγορίας τεκμηρίωσης). */
function modelIdentifiers(q: QuestionSpec): string[] {
  const exprs: string[] = [];
  const effs = (e?: Effect[]) => (e || []).forEach((x) => { if (x.when) exprs.push(x.when); if (x.var) exprs.push(x.var); });
  const m = q.model;
  if (m.kind === 'nominal') { effs(m.effects); (m.probFrom || []).forEach((p) => exprs.push(p.expr)); (m.lowerBounds || []).forEach((b) => exprs.push(b.expr)); }
  if (m.kind === 'ordinal') { effs(m.effects); (m.extra || []).forEach((x) => effs(x.effects)); Object.keys(m.loadings || {}).forEach((k) => exprs.push(k)); }
  if (m.kind === 'multi') { effs(m.effects); (m.probFrom || []).forEach((p) => exprs.push(p.expr)); if (m.unionLowerBound) exprs.push(m.unionLowerBound.expr); }
  return Array.from(new Set(exprs.flatMap(identifiers)));
}

/** Ποιες εμπειρικές μετρήσεις επηρεάζουν άμεσα (όρια/πιθανότητες) ή έμμεσα (συμμεταβλητές) την ερώτηση. */
function metricDependencies(spec: StructuredStudySpec, q: QuestionSpec): { direct: string[]; covariate: string[]; pie: boolean } {
  const derivedDeps = new Map<string, string[]>();
  for (const d of spec.derived || []) {
    const ids = identifiers(d.expr);
    derivedDeps.set(d.name, Array.from(new Set(ids.flatMap((i) => (spec.metrics[i] ? [i] : derivedDeps.get(i) || [])))));
  }
  const resolve = (ids: string[]) => Array.from(new Set(ids.flatMap((i) => (spec.metrics[i] ? [i] : derivedDeps.get(i) || []))));
  const m = q.model;
  const directExprs: string[] = [];
  if (m.kind === 'nominal') { (m.probFrom || []).forEach((p) => directExprs.push(p.expr)); (m.lowerBounds || []).forEach((b) => directExprs.push(b.expr)); }
  if (m.kind === 'multi') { (m.probFrom || []).forEach((p) => directExprs.push(p.expr)); if (m.unionLowerBound) directExprs.push(m.unionLowerBound.expr); }
  const direct = resolve(directExprs.flatMap(identifiers));
  const all = modelIdentifiers(q);
  const covariate = resolve(all).filter((x) => !direct.includes(x));
  const latentNames = new Set((spec.latents || []).map((l) => l.name));
  const viaLatent = all.filter((x) => latentNames.has(x)).flatMap((l) => (spec.latents || []).find((z) => z.name === l)!.effects || []).flatMap((e) => [e.var, e.when].filter(Boolean) as string[]).flatMap(identifiers);
  const pie = [...all, ...viaLatent].some((x) => PIE_VARS.includes(x));
  return { direct, covariate: Array.from(new Set([...covariate, ...resolve(viaLatent)])).filter((x) => !direct.includes(x)), pie };
}

export function derivedClass(spec: StructuredStudySpec, q: QuestionSpec): EvidenceClass {
  if (q.model.kind === 'profile') return 'E';
  const d = metricDependencies(spec, q);
  return d.direct.length ? 'T' : 'S';
}

const RANK: Record<EvidenceClass, number> = { E: 0, T: 1, S: 2 };

/** Έλεγχος προδιαγραφής: δηλωμένη κατηγορία όχι ισχυρότερη από ό,τι στηρίζουν τα δεδομένα· έγκυροι κωδικοί· σειρά παραγωγής. */
export function validateSpec(spec: StructuredStudySpec): string[] {
  const errs: string[] = [];
  const ids = new Set(spec.questions.map((q) => q.id));
  for (const q of spec.questions) {
    const codes = new Set(q.options.map((o) => o.code));
    const dc = derivedClass(spec, q);
    if (RANK[q.class] < RANK[dc]) errs.push(`${q.id}: δηλωμένη κατηγορία ${q.class} ισχυρότερη από την τεκμηρίωση που χρησιμοποιεί (${dc}).`);
    if (q.class === 'E' && q.model.kind !== 'profile') errs.push(`${q.id}: κατηγορία E επιτρέπεται μόνο για άμεση μέτρηση/προφίλ σε αυτή την έκδοση.`);
    const m = q.model;
    const check = (c: string | undefined, where: string) => { if (c !== undefined && !codes.has(c)) errs.push(`${q.id}: άγνωστος κωδικός «${c}» (${where}).`); };
    if (m.kind === 'nominal' || m.kind === 'multi') {
      Object.keys(m.base).forEach((c) => check(c, 'base'));
      (m.effects || []).forEach((e) => check(e.code, 'effect'));
      (m.probFrom || []).forEach((p) => check(p.code, 'probFrom'));
      for (const o of q.options) if (!(o.code in m.base) && !(m.probFrom || []).some((p) => p.code === o.code)) errs.push(`${q.id}: η επιλογή ${o.code} δεν έχει πιθανότητα βάσης.`);
    }
    if (m.kind === 'ordinal') {
      m.scale.forEach((c) => check(c, 'scale'));
      (m.extra || []).forEach((x) => check(x.code, 'extra'));
      if (m.scale.length !== m.base.length) errs.push(`${q.id}: scale/base διαφορετικό μήκος.`);
      if (Math.abs(m.base.reduce((a, b) => a + b, 0) - 1) > 0.02) errs.push(`${q.id}: τα μερίδια βάσης δεν αθροίζουν σε 1.`);
      const covered = new Set([...m.scale, ...(m.extra || []).map((x) => x.code)]);
      for (const o of q.options) if (!covered.has(o.code)) errs.push(`${q.id}: η επιλογή ${o.code} δεν καλύπτεται από το μοντέλο.`);
    }
  }
  const order = spec.generationOrder || spec.questions.map((q) => q.id);
  if (new Set(order).size !== ids.size || order.some((x) => !ids.has(x))) errs.push('generationOrder: πρέπει να περιέχει κάθε ερώτηση ακριβώς μία φορά.');
  return errs;
}

function effectSum(effs: Effect[] | undefined, code: string | null, env: Env, scale: number): number {
  let s = 0;
  for (const e of effs || []) {
    if (code !== null && e.code !== undefined && e.code !== code) continue;
    if (code === null && e.code !== undefined) continue;
    if (e.when && !evalBool(e.when, env)) continue;
    let v = e.shift || 0;
    if (e.var) { const x = evalNum(e.var, env); if (!Number.isNaN(x)) v += (e.coef ?? 1) * (x - (e.center ?? 0)); }
    s += v * scale;
  }
  return s;
}

function drawIndex(probs: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
  return probs.length - 1;
}

interface Ctx {
  spec: StructuredStudySpec;
  opt: Required<Omit<RunOptions, 'personaIds'>>;
  isS: (q: QuestionSpec) => boolean;
}

function nominalProbs(q: QuestionSpec, m: Extract<QuestionSpec['model'], { kind: 'nominal' }>, env: Env, ctx: Ctx, flags: string[]): number[] {
  const codes = q.options.map((o) => o.code);
  const scale = ctx.opt.effectScale;
  const fixed = new Map<string, number>();
  for (const p of m.probFrom || []) fixed.set(p.code, Math.min(0.97, Math.max(0, evalNum(p.expr, env))));
  const free = codes.filter((c) => !fixed.has(c));
  // (η baseShift αφορά μόνο κλίμακες και πολλαπλές επιλογές· στις ονομαστικές δεν υπάρχει «θετική» κατεύθυνση)
  const lg = free.map((c) => Math.log(Math.max(1e-9, m.base[c] ?? 0)) + (m.base[c] ? effectSum(m.effects, c, env, scale) : -50));
  const mx = Math.max(...lg);
  const ex = lg.map((x) => Math.exp(x - mx));
  const z = ex.reduce((a, b) => a + b, 0);
  const fixedSum = Array.from(fixed.values()).reduce((a, b) => a + b, 0);
  const rest = Math.max(0, 1 - fixedSum);
  let probs = codes.map((c) => (fixed.has(c) ? fixed.get(c)! : (rest * ex[free.indexOf(c)]) / z));
  for (const b of m.lowerBounds || []) {
    const i = codes.indexOf(b.code);
    const lb = Math.min(0.99, Math.max(0, evalNum(b.expr, env)));
    if (probs[i] < lb) {
      const others = 1 - probs[i];
      probs = probs.map((p, j) => (j === i ? lb : others > 0 ? (p * (1 - lb)) / others : 0));
      flags.push(`bound:${q.id}:${b.code}`);
    }
  }
  return probs;
}

function answerOrdinal(q: QuestionSpec, m: Extract<QuestionSpec['model'], { kind: 'ordinal' }>, env: Env, ctx: Ctx, rng: Rng, latents: Record<string, number>): string {
  const scale = ctx.opt.effectScale;
  for (const x of m.extra || []) {
    const p = invLogit(logit(x.base) + effectSum(x.effects, null, env, scale));
    if (rng.next() < p) return x.code;
  }
  const loads = Object.entries(m.loadings || {});
  const sd = Math.sqrt(1 + loads.reduce((s, [, a]) => s + a * a, 0));
  let cum = 0;
  const cuts: number[] = [];
  for (let k = 0; k < m.base.length - 1; k++) { cum += m.base[k]; cuts.push(probit(Math.min(0.999, Math.max(0.001, cum))) * sd); }
  const shiftBase = ctx.isS(q) ? ctx.opt.baseShift * sd : 0; // +: προς τις υψηλότερες κατηγορίες της κλίμακας
  const ystar = loads.reduce((s, [l, a]) => s + a * (latents[l] ?? 0) * scale, 0) + effectSum(m.effects, null, env, scale) + rng.normal() + shiftBase;
  let k = 0;
  while (k < cuts.length && ystar > cuts[k]) k++;
  return m.scale[k];
}

function answerMulti(q: QuestionSpec, m: Extract<QuestionSpec['model'], { kind: 'multi' }>, env: Env, ctx: Ctx, rng: Rng, flags: string[]): string[] {
  const scale = ctx.opt.effectScale;
  const fixed = new Map<string, number>();
  for (const p of m.probFrom || []) fixed.set(p.code, Math.min(0.97, Math.max(0, evalNum(p.expr, env))));
  const shiftBase = ctx.isS(q) ? ctx.opt.baseShift : 0;
  const prob = new Map<string, number>();
  for (const o of q.options) {
    prob.set(o.code, fixed.has(o.code) ? fixed.get(o.code)! : invLogit(logit(m.base[o.code] ?? 0) + effectSum(m.effects, o.code, env, scale) + (o.exclusive ? 0 : shiftBase)));
  }
  for (const o of q.options.filter((x) => x.exclusive)) if (rng.next() < prob.get(o.code)!) return [o.code];
  if (m.unionLowerBound) {
    const codes = m.unionLowerBound.codes;
    const need = Math.min(0.99, Math.max(0, evalNum(m.unionLowerBound.expr, env)));
    const union = (d: number) => 1 - codes.reduce((s, c) => s * (1 - invLogit(logit(prob.get(c)!) + d)), 1);
    if (union(0) < need) {
      let lo = 0, hi = 12;
      for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (union(mid) < need) lo = mid; else hi = mid; }
      codes.forEach((c) => prob.set(c, invLogit(logit(prob.get(c)!) + hi)));
      flags.push(`bound:${q.id}:union`);
    }
  }
  const cand = q.options.filter((o) => !o.exclusive);
  let chosen = cand.filter((o) => rng.next() < prob.get(o.code)!).map((o) => o.code);
  const minC = Math.max(1, q.minChoices ?? 1);
  const maxC = q.maxChoices ?? cand.length;
  if (chosen.length < minC) {
    const rest = cand.filter((o) => !chosen.includes(o.code));
    while (chosen.length < minC && rest.length) {
      const w = rest.map((o) => prob.get(o.code)!);
      const i = drawIndex(w.map((x) => x / w.reduce((a, b) => a + b, 0)), rng.next());
      chosen.push(rest[i].code);
      rest.splice(i, 1);
    }
  }
  if (chosen.length > maxC) {
    // κλήρωση χωρίς επανάθεση με βάρη τις πιθανότητες (Efraimidis–Spirakis)
    chosen = chosen.map((c) => ({ c, k: Math.pow(rng.next(), 1 / Math.max(1e-6, prob.get(c)!)) })).sort((a, b) => b.k - a.k).slice(0, maxC).map((x) => x.c);
  }
  const order = q.options.map((o) => o.code);
  return chosen.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function runStructuredStudy(spec: StructuredStudySpec, options: RunOptions): StructuredRun {
  const t: Record<string, number> = {};
  const t0 = Date.now();
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(`Μη έγκυρη προδιαγραφή:\n- ${errs.join('\n- ')}`);
  const opt = { n: options.n, seed: options.seed, effectScale: options.effectScale ?? 1, baseShift: options.baseShift ?? 0, ablateMetrics: options.ablateMetrics || [], ablatePie: !!options.ablatePie };
  const warnings: string[] = [];

  // 1) Πληθυσμός + πάνελ PIE (εμπειρικές άγκυρες ανά πρόσωπο)
  const pop = loadPopulation(spec.population.populationId);
  if (!pop) throw new Error(`Ο πληθυσμός ${spec.population.populationId} δεν βρέθηκε.`);
  const byId = new Map(pop.personas.map((p) => [p.id, p]));
  const personasIn = options.personaIds ? options.personaIds.map((id) => byId.get(id)).filter((p): p is Persona => !!p) : undefined;
  const panel = buildPanel({ modelVersion: spec.population.pieModel, populationId: spec.population.populationId, size: opt.n, seed: deriveSeed(opt.seed, 'panel'), audience: { minAge: spec.population.minAge }, save: false, personas: personasIn, sampling: spec.population.sampling || 'pps' });
  const members = panel.personas;
  const personas = members.map((m) => byId.get(m.personaId)!);
  t.population_ms = Date.now() - t0;

  // 2) Εμπειρικοί δείκτες ανά πρόσωπο (prod-1 mc-logit πάνω στους δείκτες του lake / Eurostat / NORAYA)
  const t1 = Date.now();
  const qs: Question[] = Object.entries(spec.metrics).map(([name, m]) => ({ id: `metric:${name}`, type: 'single_choice', text: m.label, options: ['Ναι', 'Όχι'], evidenceLink: { datasetId: 'lab', metric: m.metric, positiveOption: 'Ναι' } }) as unknown as Question);
  const fit = fitPriorsForQuestions(qs, personas, [], { asOfYear: spec.referenceYear } as never);
  warnings.push(...fit.warnings);
  const metricVals = new Map<string, Map<string, number>>();
  const metricFits: StructuredRun['metricFits'] = {};
  for (const [name, m] of Object.entries(spec.metrics)) {
    const f = fit.fits[m.metric] as unknown as { p: Map<string, number>; waveKey: string; maxFitErrorPp: number } | undefined;
    const vals = new Map<string, number>();
    const ps = personas.map((p) => f?.p.get(p.id)).filter((x): x is number => x !== undefined);
    const mean = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : NaN;
    const ablated = opt.ablateMetrics.includes(name) || !f;
    if (!f) warnings.push(`Ο δείκτης ${name} (${m.metric}) δεν είναι διαθέσιμος· χρησιμοποιείται το fallback.`);
    personas.forEach((p) => vals.set(p.id, ablated ? (m.fallback ?? mean) : (f!.p.get(p.id) ?? mean)));
    metricVals.set(name, vals);
    metricFits[name] = { metric: m.metric, label: m.label, wave: f?.waveKey ?? null, meanP: ps.length ? mean : null, minP: ps.length ? Math.min(...ps) : null, maxP: ps.length ? Math.max(...ps) : null, fitErrorPp: f?.maxFitErrorPp ?? null, ablated };
  }
  t.metrics_ms = Date.now() - t1;

  // 3) Συμμεταβλητές ανά πρόσωπο (δημογραφικά πληθυσμού + άγκυρες PIE)
  const t2 = Date.now();
  const anchorMeans: Record<string, number> = {};
  for (const v of PIE_VARS.filter((x) => x !== 'emp')) {
    const xs = members.map((m) => (m.anchors as unknown as Record<string, number | null>)[v]).filter((x): x is number => typeof x === 'number');
    anchorMeans[v] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  }
  const covs = members.map((m, i) => {
    const p = personas[i];
    const a = m.anchors as unknown as Record<string, string | number | null>;
    const c: Record<string, string | number | null> = {
      age_band: p.ageBand, gender: p.gender, education: p.education, edu3: m.demographics.edu3 ?? null, region: p.regionCode, region_name: p.regionName,
      urban: m.demographics.urban ?? null, nuts1: m.demographics.nuts1 ?? null, income_q: p.incomeQuintile ?? null
    };
    for (const v of PIE_VARS) c[v] = opt.ablatePie ? (v === 'emp' ? null : Math.round(anchorMeans[v] * 100) / 100) : (a[v] ?? null);
    return c;
  });
  // παράγωγες ποσότητες ανά πρόσωπο (πριν από τυποποίηση)
  const derivedVals: Record<string, number>[] = members.map(() => ({}));
  for (const d of spec.derived || []) {
    const raw = members.map((_, i) => evalNum(d.expr, (nm) => (nm in derivedVals[i] ? derivedVals[i][nm] : metricVals.has(nm) ? metricVals.get(nm)!.get(personas[i].id)! : (covs[i][nm] as Value) ?? undefined)));
    let vals = raw;
    if (d.standardize) {
      const ok = raw.filter((x) => !Number.isNaN(x));
      const mu = ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length);
      const sd = Math.sqrt(ok.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, ok.length - 1)) || 1;
      vals = raw.map((x) => (Number.isNaN(x) ? 0 : (x - mu) / sd));
    }
    vals.forEach((v, i) => (derivedVals[i][d.name] = v));
  }
  t.covariates_ms = Date.now() - t2;

  // 4) Παραγωγή απαντήσεων
  const t3 = Date.now();
  const qById = new Map(spec.questions.map((q) => [q.id, q]));
  const order = spec.generationOrder || spec.questions.map((q) => q.id);
  const qIds = new Set(spec.questions.map((q) => q.id));
  const lastOf = new Map<string, string>(); // κανόνας → ερώτηση που ελέγχεται (η τελευταία στη σειρά παραγωγής)
  for (const c of spec.constraints || []) {
    const refs = identifiers(c.forbid).filter((x) => qIds.has(x));
    lastOf.set(c.id, refs.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]);
  }
  const ctx: Ctx = { spec, opt, isS: (q) => q.class === 'S' };
  const meta: StructuredRun['questionMeta'] = {};
  for (const q of spec.questions) {
    const dep = metricDependencies(spec, q);
    meta[q.id] = { declared: q.class, derived: derivedClass(spec, q), directMetrics: dep.direct, usesMetrics: [...dep.direct, ...dep.covariate], usesPie: dep.pie, boundsActivated: 0, constraintRedraws: 0 };
  }
  const respondents: StructuredRespondent[] = members.map((m, i) => {
    // ανεξάρτητη ροή τυχαίων αριθμών ανά ερώτηση: η αλλαγή μιας απάντησης δεν μετατοπίζει τις κληρώσεις άλλων ερωτήσεων
    // (έτσι η δοκιμή αφαίρεσης πηγής μετρά μόνο την πραγματική, μέσω του μοντέλου, επίδραση)
    const rngFor = (key: string): Rng => createRng(deriveSeed(opt.seed, 'resp', m.personaId, i, key));
    const rngLat = rngFor('latents');
    const answers: Record<string, string | string[] | null> = Object.fromEntries(spec.questions.map((q) => [q.id, null]));
    const latents: Record<string, number> = {};
    const flags: string[] = [];
    const env: Env = (nm) => {
      if (nm in answers) return answers[nm];
      if (nm in latents) return latents[nm];
      if (nm in derivedVals[i]) return derivedVals[i][nm];
      if (metricVals.has(nm)) return metricVals.get(nm)!.get(personas[i].id)!;
      if (nm in covs[i]) return covs[i][nm] as Value;
      return undefined;
    };
    for (const l of spec.latents || []) latents[l.name] = rngLat.normal() + effectSum(l.effects, null, env, opt.effectScale);
    for (const qid of order) {
      const q = qById.get(qid)!;
      if (q.condition && !evalBool(q.condition, env)) continue;
      const checks = (spec.constraints || []).filter((c) => lastOf.get(c.id) === qid);
      const rng = rngFor(qid);
      for (let attempt = 0; attempt < 60; attempt++) {
        const f: string[] = [];
        const m2 = q.model;
        if (m2.kind === 'profile') {
          const v = String(covs[i][m2.attribute] ?? '');
          answers[qid] = m2.map[v] ?? m2.map['*'] ?? null;
          if (answers[qid] === null) warnings.push(`${qid}: τιμή προφίλ «${v}» χωρίς αντιστοίχιση (${m.personaId}).`);
        } else if (m2.kind === 'nominal') {
          answers[qid] = q.options[drawIndex(nominalProbs(q, m2, env, ctx, f), rng.next())].code;
        } else if (m2.kind === 'ordinal') {
          answers[qid] = answerOrdinal(q, m2, env, ctx, rng, latents);
        } else {
          answers[qid] = answerMulti(q, m2, env, ctx, rng, f);
        }
        const bad = checks.filter((c) => evalBool(c.forbid, env));
        if (!bad.length) { flags.push(...f); meta[qid].boundsActivated += f.length ? 1 : 0; break; }
        meta[qid].constraintRedraws++;
        if (attempt === 59) flags.push(`unresolved:${bad.map((b) => b.id).join('+')}`);
      }
    }
    const classes: Record<string, EvidenceClass | null> = Object.fromEntries(spec.questions.map((q) => [q.id, answers[q.id] === null ? null : q.class]));
    return {
      respondent_id: `VS${String(i + 1).padStart(4, '0')}`,
      persona_id: m.personaId,
      weight: 1,
      covariates: { ...covs[i], ...Object.fromEntries(Object.entries(derivedVals[i]).map(([k, v]) => [`d_${k}`, Math.round(v * 1e4) / 1e4])) },
      latents: Object.fromEntries(Object.entries(latents).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])),
      answers,
      classes,
      flags
    };
  });
  t.generation_ms = Date.now() - t3;
  t.total_ms = Date.now() - t0;
  return {
    engineVersion: `${STRUCTURED_ENGINE_VERSION}+${PRIOR_MODEL_VERSION}+${spec.population.pieModel}`,
    evidenceClassVersion: EVIDENCE_CLASS_VERSION,
    specSha256: specHash(spec),
    studyId: spec.studyId,
    options: opt,
    respondents,
    questionMeta: meta,
    metricFits,
    population: { populationId: spec.population.populationId, pieModel: spec.population.pieModel, poolSize: pop.personas.length, margins: adultMargins(pop.personas) },
    timingsMs: t,
    warnings: Array.from(new Set(warnings))
  };
}

/** Σταθμισμένα ποσοστά του ενήλικου βαθμονομημένου πληθυσμού (στόχοι για τον έλεγχο δημογραφικής σύνθεσης του δείγματος). */
function adultMargins(personas: Persona[]): Record<string, Record<string, number>> {
  const adults = personas.filter((p) => !['0-4', '5-14'].includes(p.ageBand));
  const tot = adults.reduce((s, p) => s + p.weight, 0) || 1;
  const out: Record<string, Record<string, number>> = { age_band: {}, gender: {}, region: {}, education: {} };
  for (const p of adults) {
    out.age_band[p.ageBand] = (out.age_band[p.ageBand] || 0) + p.weight / tot;
    out.gender[p.gender] = (out.gender[p.gender] || 0) + p.weight / tot;
    out.region[p.regionCode] = (out.region[p.regionCode] || 0) + p.weight / tot;
    out.education[p.education] = (out.education[p.education] || 0) + p.weight / tot;
  }
  return out;
}

/** Επανεξαγωγή για ελέγχους: η prod-1 βάση «empirical_prior» αντιστοιχεί σε E (ίδιος κανόνας με το evidence-class). */
export const _classFromBasis = classFromBasis;
