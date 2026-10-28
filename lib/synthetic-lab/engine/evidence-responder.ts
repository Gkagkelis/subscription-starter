// ============================================================
// Μηχανισμός «Τεκμηριωμένη πρόβλεψη» (EGPS) μέσα στην πλατφόρμα.
//
// Επιλέγεται ανά μελέτη (plan.engine = 'evidence'). Για κάθε ερώτηση ορίζει κατηγορία τεκμηρίωσης:
//   EMPIRICALLY_ANCHORED — άμεση μέτρηση (ίδιο μοντέλο με την παραγωγή) ή μέτρηση της ίδιας της μάρκας.
//   MODEL_EXTRAPOLATED   — συγγενικοί δείκτες (Δοκιμή Α), άλλες μάρκες σε επικυρωμένη κατηγορία, ρητό σενάριο
//                          ερευνητή, ή δηλωμένες παραδοχές τιμής· πάντα με αιτία και (όπου ορίζεται) διάστημα.
//   NOT_ESTIMABLE        — καμία επαρκής τεκμηρίωση: ΚΑΜΙΑ συνθετική απάντηση (NA), καμία σημειακή τιμή.
// Εξαρτήσεις: Gaussian copula για ερωτήσεις με δηλωμένο construct (μόνο κατηγορίες σχέσης που πέρασαν τη Δοκιμή Β).
// Αξιολόγηση: docs/synthetic-lab/EGPS_RESULTS.md · κανόνες μαρκών: docs/synthetic-lab/EGPS_INTEGRATION.md.
// ============================================================

import { brandMeasures, brandSlug, categoryOf, categoryUpperBound, latestBrandMeasurements, measurementGroups, validateBrandCategory } from '../data/brands';
import type { EvidenceContext } from '../data/noraya';
import type { PriorWave } from '../data/noraya-build';
import { cholesky, correlationMatrix, EGPS_VERSION, predictMarginal, TRANSFER_BETA, transferWave, type EgpsItem } from '../experimental/egps';
import { createRng, deriveSeed } from '../rng';
import type { Persona, Question, QuestionEvidence, SyntheticAnswer } from '../types';
import { demoRespond, type ResponderContext } from './demo-responder';
import { optionProbabilities } from './evidence';
import { fitPriorModel, type PriorFit } from './prior-model';

export const EVIDENCE_ENGINE_VERSION = `${EGPS_VERSION}-platform`;
const SCALE_DEFAULT = ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'];
const logit = (p: number) => {
  const q = Math.min(0.995, Math.max(0.005, p / 100));
  return Math.log(q / (1 - q));
};
const inv = (x: number) => 100 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Πώς απαντά κάθε ερώτηση: κατανομή ανά persona (μία επιλογή/κλίμακα), ανά επιλογή (πολλαπλή), ή παραδοχές της παραγωγής. */
export interface PreparedQuestion {
  q: Question;
  evidence: QuestionEvidence;
  /** Επιλογές με τη σειρά της ερώτησης (για τη copula: «χαμηλό → υψηλό»). */
  labels: string[];
  dist?: (personaId: string) => number[] | null;
  /** Πολλαπλή επιλογή: πιθανότητα κάθε επιλογής ανά persona. */
  multi?: (personaId: string) => number[] | null;
  /** Ερωτήσεις τιμής/σύγκρισης: απάντηση από τις δηλωμένες παραδοχές του ερευνητή (όπως η παραγωγή). */
  researcherAssumptions?: boolean;
}

function labelsOf(q: Question): string[] {
  if (q.type === 'likert' || q.type === 'concept_test') return q.scale?.length ? q.scale : SCALE_DEFAULT;
  return q.options || [];
}

function notEstimable(q: Question, reason: string, extra: Partial<QuestionEvidence> = {}): PreparedQuestion {
  return { q, labels: labelsOf(q), evidence: { evidenceClass: 'NOT_ESTIMABLE', basis: 'none', reason, sources: [], point: null, int80: null, int95: null, ...extra } };
}

/** Θέση της «θετικής» επιλογής σε δυαδική ερώτηση (τελευταία επιλογή αν δεν ορίζεται). */
function positiveIndex(q: Question): number {
  const pos = q.evidenceLink?.positiveOption;
  const i = pos ? (q.options || []).indexOf(pos) : -1;
  return i >= 0 ? i : (q.options || []).length - 1;
}

/** Δυαδική πιθανότητα → διάνυσμα στις επιλογές της ερώτησης. */
function binaryVector(q: Question, p: number): number[] {
  const opts = q.options || ['Όχι', 'Ναι'];
  const pi = positiveIndex(q);
  return opts.map((_, k) => (k === pi ? p : (1 - p) / Math.max(1, opts.length - 1)));
}

/** Θετικό μισό κλίμακας όπως στην παραγωγή: 60% στο προτελευταίο, 40% στο τελευταίο· αρνητικό ομοιόμορφα στο κάτω μισό. */
function likertVector(k: number, p: number): number[] {
  const half = Math.floor(k / 2);
  const negN = k % 2 === 1 ? half + 1 : half;
  return Array.from({ length: k }, (_, i) => (i === k - 2 ? p * 0.6 : i === k - 1 ? p * 0.4 : i < negN ? (1 - p) / negN : 0));
}

function fitBrandWave(wave: PriorWave, personas: Persona[]): PriorFit {
  return fitPriorModel(`brand:${wave.key}`, wave, personas, { scheme: 'lake' });
}

function waveFromValues(key: string, year: number, values: Record<string, Record<string, number>>): PriorWave {
  return {
    key,
    year,
    quarter: '',
    groups: Object.fromEntries(Object.entries(values).map(([d, g]) => [d, Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { value: v, n: 0, nUnknown: true, confidence: 'survey', sources: 1, inconsistent: false }]))]))
  };
}

/** Τεκμηρίωση μιας μάρκας για μία μέτρηση: δική της μέτρηση → επικυρωμένη μεταφορά από άλλες μάρκες → NOT_ESTIMABLE. */
export function brandEvidence(category: string, brand: string, measure: string, personas: Persona[], asOfYear?: number): { evidence: QuestionEvidence; p?: Map<string, number> } {
  const id = brandSlug(brand);
  const cat = categoryOf(category);
  const measureLabel = brandMeasures()[measure] || measure;
  const bound = categoryUpperBound(category, measure, asOfYear);
  const all = latestBrandMeasurements(category, measure, asOfYear);
  const own = all.find((m) => m.brandId === id);
  if (own) {
    const wave = waveFromValues(`${category}:${id}:${measure}:${own.year}`, own.year, measurementGroups(own));
    const fit = fitBrandWave(wave, personas);
    return {
      evidence: { evidenceClass: 'EMPIRICALLY_ANCHORED', basis: 'direct', reason: `Μέτρηση της μάρκας «${own.brand}» (${measureLabel}, ${own.year}) από «${own.source}» (άδεια: ${own.license}).`, sources: [`${own.source} ${own.year}`], point: own.value, int80: null, int95: null, upperBound: bound },
      p: fit.p
    };
  }
  const v = validateBrandCategory(category, measure, asOfYear);
  if (v.status !== 'validated' || !v.halfWidthLogit) {
    return {
      evidence: {
        evidenceClass: 'NOT_ESTIMABLE', basis: 'none', sources: [], point: null, int80: null, int95: null, upperBound: bound,
        reason: `Δεν υπάρχει μέτρηση για «${brand}» (${cat.label}, ${measureLabel}). ${v.message}`
      }
    };
  }
  const others = all.filter((m) => m.brandId !== id);
  const lvl = others.reduce((s, m) => s + logit(m.value), 0) / others.length;
  const cap = (x: number) => (bound ? Math.min(x, bound.value) : x);
  const int80: [number, number] = [r1(inv(lvl - v.halfWidthLogit['80'])), r1(cap(inv(lvl + v.halfWidthLogit['80'])))];
  const int95: [number, number] = [r1(inv(lvl - v.halfWidthLogit['95'])), r1(cap(inv(lvl + v.halfWidthLogit['95'])))];
  const point = r1(cap(inv(lvl)));
  const wave = transferWave(logit(point), others.map((m) => measurementGroups(m)), TRANSFER_BETA, `${category}:${id}:${measure}:transfer`, Math.max(...others.map((m) => m.year)));
  const fit = fitBrandWave(wave, personas);
  return {
    evidence: {
      evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'brand_transfer', point, int80, int95, upperBound: bound,
      sources: others.map((m) => `${m.brand} (${m.source} ${m.year})`),
      reason: `ΠΡΟΒΛΕΨΗ από ${others.length} άλλες μάρκες της κατηγορίας «${cat.label}» (${v.message}). Δεν είναι μέτρηση της «${brand}»: μια μάρκα μπορεί να απέχει πολύ από την τυπική μάρκα της κατηγορίας.`
    },
    p: fit.p
  };
}

/** Ορίζει για κάθε ερώτηση την τεκμηρίωση και τον τρόπο απάντησης (χωρίς να παράγει απαντήσεις). */
export function prepareEvidence(questions: Question[], personas: Persona[], fits: Record<string, PriorFit>, ctx: EvidenceContext = {}): PreparedQuestion[] {
  const prepared = questions.map((q) => prepareOne(q, personas, fits, ctx));
  // εξαρτήσεις (μόνο για ερωτήσεις μίας επιλογής/κλίμακας με construct)
  // (εμφάνιση: όλα τα ζεύγη με construct· η copula στην απάντηση χρησιμοποιεί μόνο όσα έχουν κατανομή)
  const items: EgpsItem[] = prepared.filter((x) => x.q.construct).map((x) => ({ id: x.q.id, text: x.q.text, options: x.labels, construct: x.q.construct || null }));
  const { pairs } = correlationMatrix(items);
  prepared.forEach((x) => {
    const deps = pairs.filter((p) => p.a === x.q.id || p.b === x.q.id).map((p) => ({ with: p.a === x.q.id ? p.b : p.a, cls: p.cls, rho: p.rho, status: p.status }));
    if (deps.length) x.evidence.dependence = deps;
  });
  // follow-up σε μη εκτιμήσιμη ερώτηση → μη εκτιμήσιμη
  const byId = new Map(prepared.map((x) => [x.q.id, x]));
  prepared.forEach((x) => {
    const g = x.q.followUpOf ? byId.get(x.q.followUpOf.questionId) : null;
    if (g && g.evidence.evidenceClass === 'NOT_ESTIMABLE' && x.evidence.evidenceClass !== 'NOT_ESTIMABLE') {
      Object.assign(x, notEstimable(x.q, `Εμφανίζεται μόνο μετά την ${g.q.id}, που δεν είναι εκτιμήσιμη: δεν ορίζεται ποιοι απαντούν.`));
    }
  });
  return prepared;
}

function prepareOne(q: Question, personas: Persona[], fits: Record<string, PriorFit>, ctx: EvidenceContext): PreparedQuestion {
  const labels = labelsOf(q);
  // 1) μάρκα (μία επιλογή, δυαδική)
  if (q.brandLink) {
    if (q.type !== 'single_choice' || (q.options || []).length !== 2) return notEstimable(q, 'Η σύνδεση με μάρκα υποστηρίζεται σε ερωτήσεις μίας επιλογής με 2 επιλογές (Όχι / Ναι).');
    const { evidence, p } = brandEvidence(q.brandLink.category, q.brandLink.brand, q.brandLink.measure, personas, ctx.asOfYear);
    if (!p) return { q, labels, evidence };
    return { q, labels, evidence, dist: (id) => (p.has(id) ? binaryVector(q, p.get(id)!) : null) };
  }
  // 2) πολλαπλή επιλογή μαρκών
  if (q.brandOptions && q.type === 'multiple_choice') {
    const opts = q.options || [];
    const per = opts.map((o) => {
      const b = q.brandOptions!.brands[o];
      return b ? brandEvidence(q.brandOptions!.category, b, q.brandOptions!.measure, personas, ctx.asOfYear) : null;
    });
    const missing = opts.filter((_, i) => !per[i] || !per[i]!.p);
    if (missing.length) {
      return notEstimable(q, `Μη εκτιμήσιμες επιλογές: ${missing.join(', ')}. ${per.find((x) => x && !x.p)?.evidence.reason || 'Επιλογές χωρίς αντιστοίχιση σε μάρκα.'}`);
    }
    const cls = per.some((x) => x!.evidence.evidenceClass === 'MODEL_EXTRAPOLATED') ? 'MODEL_EXTRAPOLATED' : 'EMPIRICALLY_ANCHORED';
    return {
      q, labels,
      evidence: { evidenceClass: cls, basis: cls === 'EMPIRICALLY_ANCHORED' ? 'direct' : 'brand_transfer', reason: per.map((x, i) => `${opts[i]}: ${x!.evidence.evidenceClass}`).join(' · '), sources: per.flatMap((x) => x!.evidence.sources) },
      multi: (id) => (per.every((x) => x!.p!.has(id)) ? per.map((x) => x!.p!.get(id)!) : null)
    };
  }
  // 3) άμεση μέτρηση (ίδιο μοντέλο με την παραγωγή)
  if (q.evidenceLink) {
    const om = q.evidenceLink.optionMetrics;
    if (om && Object.values(om).every((m) => fits[m])) {
      const src = [`${q.evidenceLink.datasetId}`];
      if (q.type === 'multiple_choice') {
        const ms = (q.options || []).map((o) => om[o]);
        if (ms.every((m) => m && fits[m])) {
          return { q, labels, evidence: { evidenceClass: 'EMPIRICALLY_ANCHORED', basis: 'direct', reason: 'Άμεση μέτρηση ανά επιλογή.', sources: src }, multi: (id) => (ms.every((m) => fits[m].p.has(id)) ? ms.map((m) => fits[m].p.get(id)!) : null) };
        }
      } else {
        return {
          q, labels, evidence: { evidenceClass: 'EMPIRICALLY_ANCHORED', basis: 'direct', reason: 'Άμεση μέτρηση της ίδιας ερώτησης (κατανομή ανά επιλογή).', sources: src },
          dist: (id) => {
            const d = optionProbabilities(q, fits, id);
            return d ? labels.map((o) => d.find((x) => x.option === o)?.p ?? 0) : null;
          }
        };
      }
    }
    const fit = fits[q.evidenceLink.metric];
    if (fit) {
      const isLik = q.type === 'likert' || q.type === 'concept_test';
      const partial = !isLik && (q.options || []).length > 2;
      if (q.type === 'single_choice' || isLik) {
        return {
          q, labels,
          evidence: {
            evidenceClass: 'EMPIRICALLY_ANCHORED', basis: 'direct', sources: [q.evidenceLink.datasetId],
            reason: isLik ? 'Μετρημένο το ποσοστό της θετικής πλευράς· η κατανομή μέσα σε κάθε πλευρά της κλίμακας είναι κανόνας της πλατφόρμας.' : partial ? 'Μετρημένη η «θετική» επιλογή· η κατανομή στις υπόλοιπες επιλογές είναι ισομερής (δεν μετρήθηκε).' : 'Άμεση μέτρηση.'
          },
          dist: (id) => (fit.p.has(id) ? (isLik ? likertVector(labels.length, fit.p.get(id)!) : binaryVector(q, fit.p.get(id)!)) : null)
        };
      }
    }
  }
  // 4) συγγενικοί δείκτες (Δοκιμή Α)
  if (q.relatedEvidence) {
    if (q.type !== 'single_choice' || (q.options || []).length !== 2) return notEstimable(q, 'Η πρόβλεψη από συγγενικούς δείκτες είναι επικυρωμένη μόνο για δυαδικές ερωτήσεις (Όχι / Ναι).');
    const r = predictMarginal({ id: q.id, text: q.text, options: q.options!, related: q.relatedEvidence }, personas, ctx);
    if (r.evidenceClass === 'NOT_ESTIMABLE' || !r.perPerson) return notEstimable(q, r.reason);
    return {
      q, labels,
      evidence: { evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'related_transfer', reason: r.reason, sources: r.sources, point: r.overall?.point ?? null, int80: r.overall?.int80 ?? null, int95: r.overall?.int95 ?? null },
      dist: (id) => (r.perPerson!.has(id) ? binaryVector(q, r.perPerson!.get(id)![1]) : null)
    };
  }
  // 5) ρητό σενάριο ερευνητή
  if (q.scenarioPrior && (q.type === 'single_choice' || q.type === 'likert' || q.type === 'concept_test') && q.scenarioPrior.probs.length === labels.length) {
    const r = predictMarginal({ id: q.id, text: q.text, options: labels, assumption: { probs: q.scenarioPrior.probs, rationale: q.scenarioPrior.rationale } }, personas, ctx);
    const probs = r.perPerson?.values().next().value as number[];
    return {
      q, labels,
      evidence: { evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'assumption_scenario', reason: r.reason, sources: [], point: null, int80: null, int95: null, distribution: r.distribution || null },
      dist: () => probs
    };
  }
  // 6) τιμή / σύγκριση προϊόντων: δηλωμένες παραδοχές του ερευνητή (όπως η παραγωγή)
  if (q.type === 'price_test' || q.type === 'product_comparison') {
    return { q, labels, researcherAssumptions: true, evidence: { evidenceClass: 'MODEL_EXTRAPOLATED', basis: 'researcher_assumptions', reason: 'Σενάριο από τις δηλωμένες παραδοχές του ερευνητή (τιμή αναφοράς, ευαισθησία τιμής) — όχι από μέτρηση.', sources: [] } };
  }
  if (q.type === 'open_ended') return notEstimable(q, 'Ανοιχτές απαντήσεις δεν παράγονται χωρίς AI (η παραγωγή δίνει μόνο πρότυπα κείμενα).');
  return notEstimable(q, 'Δεν υπάρχει άμεση μέτρηση, συγγενικοί δείκτες, μέτρηση μάρκας ή ρητό σενάριο.');
}

const PHI = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/** Απαντήσεις ενός συνθετικού ερωτώμενου με τον μηχανισμό EGPS. */
export function evidenceRespond(p: Persona, prepared: PreparedQuestion[], seed: number, demoCtx: ResponderContext): SyntheticAnswer[] {
  const rng = createRng(deriveSeed(seed, p.id, 'egps-platform'));
  const cop = prepared.filter((x) => x.q.construct && x.dist);
  const { R } = correlationMatrix(cop.map((x) => ({ id: x.q.id, text: x.q.text, options: x.labels, construct: x.q.construct || null })));
  const L = cholesky(R) || R.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  const e = cop.map(() => rng.normal());
  const zById = new Map(cop.map((x, i) => [x.q.id, L[i].reduce((s, v, k) => s + v * e[k], 0)]));
  const out: SyntheticAnswer[] = [];
  const given = new Map<string, string | undefined>();
  for (const x of prepared) {
    const q = x.q;
    const na = (basis: SyntheticAnswer['basis'] = 'not_estimable'): SyntheticAnswer => ({ questionId: q.id, value: null, skipped: true, basis });
    if (q.followUpOf) {
      const g = given.get(q.followUpOf.questionId);
      if (g === undefined || !q.followUpOf.whenAnswerIn.includes(g)) {
        out.push(na(x.evidence.evidenceClass === 'NOT_ESTIMABLE' ? 'not_estimable' : 'uninformed'));
        continue;
      }
    }
    const basis: SyntheticAnswer['basis'] = x.evidence.evidenceClass === 'EMPIRICALLY_ANCHORED' ? 'empirical_prior' : x.evidence.evidenceClass === 'MODEL_EXTRAPOLATED' ? (x.researcherAssumptions || x.evidence.basis === 'assumption_scenario' ? 'assumption' : 'model_extrapolated') : 'not_estimable';
    if (x.evidence.evidenceClass === 'NOT_ESTIMABLE') {
      out.push(na());
      continue;
    }
    if (x.researcherAssumptions) {
      const a = demoRespond(p, [q], demoCtx)[0];
      out.push({ ...a, basis: 'assumption' });
      continue;
    }
    if (x.multi) {
      const ps = x.multi(p.id);
      if (!ps) {
        out.push(na('uninformed'));
        continue;
      }
      const max = q.maxSelections || x.labels.length;
      const chosen = x.labels.filter((_, k) => rng.next() < ps[k]).slice(0, max);
      out.push({ questionId: q.id, value: { choices: chosen }, skipped: false, basis });
      continue;
    }
    const d = x.dist?.(p.id);
    if (!d) {
      out.push(na('uninformed')); // εκτός πληθυσμού της πηγής (π.χ. ηλικία)
      continue;
    }
    const z = zById.get(q.id);
    const u = z !== undefined ? PHI(z) : rng.next();
    const tot = d.reduce((s, v) => s + v, 0) || 1;
    let acc = 0;
    let k = d.length - 1;
    for (let i = 0; i < d.length; i++) {
      acc += d[i] / tot;
      if (u <= acc) {
        k = i;
        break;
      }
    }
    if (q.type === 'likert' || q.type === 'concept_test') {
      out.push({ questionId: q.id, value: { scaleIndex: k }, skipped: false, basis });
      given.set(q.id, x.labels[k]);
    } else {
      out.push({ questionId: q.id, value: { choice: x.labels[k] }, skipped: false, basis });
      given.set(q.id, x.labels[k]);
    }
  }
  return out;
}

/** Έλεγχος εκτιμησιμότητας πριν από την εκτέλεση: κατηγορία ανά ερώτηση και σύνοψη. */
export function summarizeEstimability(prepared: PreparedQuestion[]) {
  const rows = prepared.map((x) => ({ id: x.q.id, text: x.q.text, ...x.evidence }));
  const count = (c: string) => rows.filter((r) => r.evidenceClass === c).length;
  return {
    engineVersion: EVIDENCE_ENGINE_VERSION,
    counts: { EMPIRICALLY_ANCHORED: count('EMPIRICALLY_ANCHORED'), MODEL_EXTRAPOLATED: count('MODEL_EXTRAPOLATED'), NOT_ESTIMABLE: count('NOT_ESTIMABLE') },
    rows
  };
}
