// ============================================================
// Demo responder — διαφανές, ντετερμινιστικό μοντέλο απαντήσεων ΧΩΡΙΣ AI.
//
// Κάθε απάντηση έχει "basis":
//   empirical_prior — ερώτηση συνδεδεμένη με δείκτη NORAYA/Eurobarometer:
//                     P(θετικής απάντησης) = p_i από το prior-model.
//   assumption      — επηρεάζεται από ρητές παραδοχές του ερευνητή.
//   uninformed      — καμία πληροφορία: ουδέτερη τυχαία απάντηση.
// Ελεύθερο κείμενο = πρότυπα (templates), σημειωμένα ως ατεκμηρίωτα.
// ============================================================

import { createRng, deriveSeed, type Rng } from '../rng';
import { logit } from '../stats';
import type { AnswerBasis, Assumption, Persona, Question, SyntheticAnswer } from '../types';
import { ASSUMPTION_IDS, getAssumption } from './assumptions';
import type { PriorFit } from './prior-model';
import { describePersonaShort } from './persona-text';
import { optionProbabilities } from './evidence';

export const DEMO_ENGINE_VERSION = 'demo-rules-1.0';

export interface ResponderContext {
  seed: number;
  assumptions: Assumption[];
  priorFits: Record<string, PriorFit>;
  /** Σενάριο (για σύγκριση σεναρίων): ρητές τιμές/ποιότητα. */
  scenario?: { id: string; label: string; price?: number | null; quality?: number | null } | null;
}

/** Λανθάνουσα «διάθεση» ανά persona+ερώτηση από παραδοχές (0 = ουδέτερο). */
function assumptionShift(p: Persona, q: Question, ctx: ResponderContext, salienceP: number | null): { shift: number; used: boolean } {
  let shift = 0;
  let used = false;
  const novelty = getAssumption(ctx.assumptions, ASSUMPTION_IDS.ageNovelty);
  if (novelty && (q.type === 'likert' || q.type === 'concept_test')) {
    if (p.ageBand === '15-24' || p.ageBand === '25-34') shift += 0.3 * novelty.strength;
    if (p.ageBand === '65+') shift -= 0.3 * novelty.strength;
    used = true;
  }
  const sq = getAssumption(ctx.assumptions, ASSUMPTION_IDS.statusQuo);
  if (sq && (q.type === 'likert' || q.type === 'concept_test')) {
    shift -= 0.25 * sq.strength;
    used = true;
  }
  const sal = getAssumption(ctx.assumptions, ASSUMPTION_IDS.salienceSupport);
  if (sal && salienceP !== null && (q.type === 'likert' || q.type === 'concept_test')) {
    shift += (salienceP - 0.5) * 1.2 * sal.strength;
    used = true;
  }
  const beh = getAssumption(ctx.assumptions, ASSUMPTION_IDS.behaviourInterest);
  if (beh?.metric && (q.type === 'likert' || q.type === 'concept_test')) {
    const fit = ctx.priorFits[beh.metric];
    const pi = fit?.p.get(p.id);
    if (fit && pi !== undefined) {
      // σχετικό logit ως προς τον μέσο όρο πληθυσμού (μηδενική μετατόπιση κατά μέσο όρο)
      const pbar = Math.min(0.99, Math.max(0.01, (fit.usedTargets[0]?.fitted ?? 50) / 100));
      shift += 0.5 * beh.strength * (logit(pi) - logit(pbar));
      used = true;
    }
  }
  // Σενάριο με τιμή: η τιμή επηρεάζει το ενδιαφέρον μέσω ευαισθησίας τιμής.
  if (ctx.scenario?.price != null && (q.type === 'likert' || q.type === 'concept_test')) {
    const ref = getAssumption(ctx.assumptions, ASSUMPTION_IDS.referencePrice)?.value;
    if (ref && ref > 0) {
      shift -= priceSensitivity(p, ctx) * Math.log(ctx.scenario.price / ref);
      used = true;
    }
  }
  if (ctx.scenario?.quality != null && (q.type === 'likert' || q.type === 'concept_test')) {
    shift += 0.25 * (ctx.scenario.quality - 3);
    used = true;
  }
  return { shift, used };
}

function priceSensitivity(p: Persona, ctx: ResponderContext): number {
  const a = getAssumption(ctx.assumptions, ASSUMPTION_IDS.priceIncome);
  if (!a || p.incomeQuintile === null) return 1;
  // πεμπτημόριο 1 -> 1.4, 5 -> 0.6 (στο strength = 1)
  return Math.max(0.1, 1 + (3 - p.incomeQuintile) * 0.2 * a.strength);
}

function scaleOf(q: Question): string[] {
  if (q.scale?.length) return q.scale;
  return ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'];
}

/** Επιλογή σημείου κλίμακας από λανθάνουσα τιμή (ordered probit με ίσα κατώφλια). */
function latentToScale(latent: number, k: number): number {
  // κατώφλια στο N(0,1) ώστε χωρίς shift να είναι ~ομοιόμορφα κατανεμημένα
  for (let i = 1; i < k; i++) {
    const cut = probit(i / k);
    if (latent < cut) return i - 1;
  }
  return k - 1;
}

/** Αντίστροφη τυπική κανονική (Acklam, επαρκής ακρίβεια). */
export function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function salienceFor(p: Persona, ctx: ResponderContext): number | null {
  const fits = Object.values(ctx.priorFits).filter((f) => f.metric.startsWith('issue_country_'));
  if (!fits.length) return null;
  const v = fits[0].p.get(p.id);
  return v === undefined ? null : v;
}

function answerQuestion(
  p: Persona,
  q: Question,
  questions: Question[],
  ctx: ResponderContext,
  previous: Map<string, SyntheticAnswer>
): SyntheticAnswer {
  const rng: Rng = createRng(deriveSeed(ctx.seed, p.id, q.id, ctx.scenario?.id || ''));
  // Follow-up: μόνο αν ισχύει η συνθήκη.
  if (q.followUpOf) {
    const prev = previous.get(q.followUpOf.questionId);
    const ans = prev?.value;
    const given = ans?.choice ?? (ans?.scaleIndex !== undefined ? scaleOf(questions.find((x) => x.id === q.followUpOf!.questionId) || q)[ans.scaleIndex] : undefined);
    const hit = given !== undefined && q.followUpOf.whenAnswerIn.includes(given);
    if (!hit) return { questionId: q.id, value: null, skipped: true, basis: 'uninformed' };
  }

  // 1) Εμπειρικά συνδεδεμένη ερώτηση
  if (q.evidenceLink?.optionMetrics) {
    // Ερώτηση πηγής με κατανομή ανά επιλογή (π.χ. διαΝΕΟσις)
    const dist = optionProbabilities(q, ctx.priorFits, p.id);
    if (dist) {
      let u = rng.next();
      let choice = dist[dist.length - 1].option;
      for (const d of dist) {
        if (u < d.p) {
          choice = d.option;
          break;
        }
        u -= d.p;
      }
      const top = [...dist].sort((a, b) => b.p - a.p).slice(0, 3);
      const fit = ctx.priorFits[q.evidenceLink.metric];
      return {
        questionId: q.id,
        value: { choice },
        skipped: false,
        basis: 'empirical_prior',
        rationale: `Κατανομή επιλογών για το προφίλ: ${top.map((d) => `«${d.option}» ${(d.p * 100).toFixed(0)}%`).join(', ')} (${fit?.waveKey || ''})`
      };
    }
  } else if (q.evidenceLink) {
    const fit = ctx.priorFits[q.evidenceLink.metric];
    const pi = fit?.p.get(p.id);
    if (fit && pi !== undefined) {
      const positive = rng.next() < pi;
      if (q.type === 'likert' || q.type === 'concept_test') {
        const sc = scaleOf(q);
        const k = sc.length;
        const half = Math.floor(k / 2);
        // θετικό μισό: πάνω από τη μέση· αρνητικό: κάτω (η μέση θέση μόνο αν k περιττό & αρνητικό)
        const idx = positive ? k - 1 - (rng.next() < 0.6 ? 1 : 0) : rng.int(k % 2 === 1 ? half + 1 : half);
        return { questionId: q.id, value: { scaleIndex: Math.max(0, Math.min(k - 1, idx)) }, skipped: false, basis: 'empirical_prior', rationale: `P(θετικής απάντησης) = ${(pi * 100).toFixed(1)}% από ${fit.metric} (${fit.waveKey})` };
      }
      const opts = q.options || ['Ναι', 'Όχι'];
      const others = opts.filter((o) => o !== q.evidenceLink!.positiveOption);
      const choice = positive ? q.evidenceLink.positiveOption : others.length ? rng.pick(others) : opts[0];
      return { questionId: q.id, value: { choice }, skipped: false, basis: 'empirical_prior', rationale: `P = ${(pi * 100).toFixed(1)}% (${fit.metric}, ${fit.waveKey})` };
    }
    // εκτός πληθυσμού έρευνας (π.χ. <15) ή χωρίς fit -> ουδέτερη
  }

  switch (q.type) {
    case 'likert':
    case 'concept_test': {
      const { shift, used } = assumptionShift(p, q, ctx, salienceFor(p, ctx));
      const sc = scaleOf(q);
      const idx = latentToScale(rng.normal() + shift, sc.length);
      return { questionId: q.id, value: { scaleIndex: idx }, skipped: false, basis: used ? 'assumption' : 'uninformed' };
    }
    case 'single_choice': {
      const opts = q.options || [];
      return { questionId: q.id, value: { choice: rng.pick(opts) }, skipped: false, basis: 'uninformed' };
    }
    case 'multiple_choice': {
      const opts = q.options || [];
      const max = q.maxSelections || opts.length;
      const chosen = rng.shuffle(opts.filter(() => rng.next() < 0.35)).slice(0, max);
      return { questionId: q.id, value: { choices: chosen }, skipped: false, basis: 'uninformed' };
    }
    case 'ranking': {
      const opts = q.options || [];
      const ranked = opts.map((o) => ({ o, u: rng.gumbel() })).sort((a, b) => b.u - a.u).map((x) => x.o);
      return { questionId: q.id, value: { ranking: ranked }, skipped: false, basis: 'uninformed' };
    }
    case 'product_comparison': {
      const products = q.products || [];
      const ref = getAssumption(ctx.assumptions, ASSUMPTION_IDS.referencePrice)?.value || medianPrice(products) || 1;
      const lam = priceSensitivity(p, ctx);
      const usedPrice = products.some((x) => x.price != null);
      const usedQuality = products.some((x) => x.quality != null);
      const util = products.map((x) => ({
        id: x.label,
        u: (x.price != null ? -lam * 2 * Math.log(x.price / ref) : 0) + (x.quality != null ? 0.5 * (x.quality - 3) : 0) + rng.gumbel()
      }));
      util.sort((a, b) => b.u - a.u);
      return {
        questionId: q.id,
        value: { choice: util[0]?.id, ranking: util.map((x) => x.id) },
        skipped: false,
        basis: usedPrice || usedQuality ? 'assumption' : 'uninformed'
      };
    }
    case 'price_test': {
      const prices = q.pricePoints || [];
      const refA = getAssumption(ctx.assumptions, ASSUMPTION_IDS.referencePrice);
      const ref = refA?.value || median(prices) || 1;
      const disp = getAssumption(ctx.assumptions, ASSUMPTION_IDS.wtpDispersion)?.strength ?? 1;
      const pr = getAssumption(ctx.assumptions, ASSUMPTION_IDS.priceIncome);
      // Ίδια z για όλα τα σημεία τιμής -> μονοτονική αποδοχή.
      const z = createRng(deriveSeed(ctx.seed, p.id, 'wtp')).normal();
      const incomeShift = pr && p.incomeQuintile !== null ? 0.08 * (p.incomeQuintile - 3) * pr.strength : 0;
      const quality = ctx.scenario?.quality != null ? 0.06 * (ctx.scenario.quality - 3) : 0;
      const wtp = ref * Math.exp(0.25 * disp * z + incomeShift + quality);
      const acc: Record<string, boolean> = {};
      prices.forEach((x) => (acc[String(x)] = wtp >= x));
      return {
        questionId: q.id,
        value: { priceAcceptance: acc },
        skipped: false,
        basis: 'assumption',
        rationale: `Υποθετική προθυμία πληρωμής ≈ ${wtp.toFixed(2)}€ (τιμή αναφοράς ${ref}€${refA?.value ? '' : ' — δεν δόθηκε, χρησιμοποιήθηκε η διάμεση τιμή ερώτησης'})`
      };
    }
    case 'open_ended': {
      return { questionId: q.id, value: { text: templateText(p, q, previous, rng) }, skipped: false, basis: 'uninformed', unsupported: true };
    }
  }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function medianPrice(ps: { price?: number | null }[]): number | null {
  return median(ps.map((x) => x.price).filter((x): x is number => typeof x === 'number'));
}

const OPEN_TEMPLATES = {
  price: [
    'Η τιμή είναι το πρώτο που κοιτάω — θα ήθελα να ξέρω ακριβώς τι περιλαμβάνει.',
    'Αν το κόστος είναι πάνω από αυτό που πληρώνω τώρα, δύσκολα θα άλλαζα.',
    'Θα με ενδιέφερε μόνο αν υπάρχει καθαρή εξοικονόμηση στον μήνα.'
  ],
  trust: [
    'Θέλω να δω ότι αυτό που υπόσχεται θα γίνει στην πράξη.',
    'Χρειάζομαι περισσότερες πληροφορίες πριν πάρω θέση.',
    'Με απασχολεί αν θα υπάρχει καλή εξυπηρέτηση όταν χρειαστώ βοήθεια.'
  ],
  positive: [
    'Μου φαίνεται χρήσιμο για την καθημερινότητά μου.',
    'Θα το δοκίμαζα αν ήταν εύκολο να ξεκινήσω.',
    'Ακούγεται λογικό, θα ήθελα να το δω σε λειτουργία.'
  ],
  neutral: [
    'Δεν έχω ισχυρή άποψη — εξαρτάται από τις λεπτομέρειες.',
    'Δεν είμαι σίγουρος/η ότι με αφορά άμεσα.',
    'Θα ήθελα να ακούσω και τη γνώμη ανθρώπων που το έχουν δοκιμάσει.'
  ]
};

function templateText(p: Persona, q: Question, previous: Map<string, SyntheticAnswer>, rng: Rng): string {
  // stance από προηγούμενη likert/concept απάντηση (αν υπάρχει)
  let stance: 'positive' | 'neutral' | 'price' | 'trust' = 'neutral';
  const prevScale = Array.from(previous.values()).find((a) => a.value?.scaleIndex !== undefined);
  if (prevScale?.value?.scaleIndex !== undefined) stance = prevScale.value.scaleIndex >= 3 ? 'positive' : prevScale.value.scaleIndex <= 1 ? 'trust' : 'neutral';
  if (p.incomeQuintile !== null && p.incomeQuintile <= 2 && /τιμ|κοστ|€|ευρω|πληρ/i.test(q.text)) stance = 'price';
  const base = rng.pick(OPEN_TEMPLATES[stance]);
  return `${base} [Πρότυπο demo κειμένου για προφίλ: ${describePersonaShort(p)}]`;
}

/** Απαντήσεις ενός συνθετικού ερωτώμενου σε όλο το ερωτηματολόγιο. */
export function demoRespond(p: Persona, questions: Question[], ctx: ResponderContext): SyntheticAnswer[] {
  const prev = new Map<string, SyntheticAnswer>();
  const out: SyntheticAnswer[] = [];
  for (const q of questions) {
    const a = answerQuestion(p, q, questions, ctx, prev);
    prev.set(q.id, a);
    out.push(a);
  }
  return out;
}

export function basisLabel(b: AnswerBasis): string {
  return {
    empirical_prior: 'Εμπειρική βάση (εκτίμηση από πραγματική έρευνα)',
    assumption: 'Παραδοχή ερευνητή',
    uninformed: 'Χωρίς εμπειρική βάση',
    llm: 'Παραγωγή AI (μη επικυρωμένη)'
  }[b];
}
