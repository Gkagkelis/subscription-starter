// Συγκέντρωση συνθετικών απαντήσεων. Όλα τα ποσοστά είναι σταθμισμένα
// (βάρη επιλογής κοινού). Τα διαστήματα (Wilson με effective n) αφορούν
// ΜΟΝΟ τη μεταβλητότητα της προσομοίωσης — όχι σφάλμα μοντέλου.

import { effectiveN, wilson, round, weightedMean } from '../stats';
import type { AnswerBasis, Persona, Question, QuestionAggregate, SyntheticRespondent } from '../types';
import { EDU_LABEL, GENDER_LABEL, quintileLabel, SETTLEMENT_LABEL } from './persona-text';

const SCALE_DEFAULT = ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'];

export const SEGMENTS: { key: string; label: string; get: (p: Persona) => string }[] = [
  { key: 'ageBand', label: 'Ηλικία', get: (p) => p.ageBand },
  { key: 'gender', label: 'Φύλο', get: (p) => GENDER_LABEL[p.gender] },
  { key: 'education', label: 'Εκπαίδευση', get: (p) => EDU_LABEL[p.education] },
  { key: 'incomeQuintile', label: 'Εισόδημα', get: (p) => quintileLabel(p.incomeQuintile) },
  { key: 'settlement', label: 'Περιοχή', get: (p) => SETTLEMENT_LABEL[p.settlement] }
];

const THEMES: { theme: string; re: RegExp }[] = [
  { theme: 'Τιμή / κόστος', re: /τιμ|κόστ|κοστ|ακριβ|φθην|€|ευρώ|πληρ|εξοικονόμ/i },
  { theme: 'Εμπιστοσύνη / αξιοπιστία', re: /εμπιστ|υπόσχ|αξιόπ|στην πράξη|εγγύη/i },
  { theme: 'Ανάγκη πληροφόρησης', re: /πληροφορ|λεπτομέρ|να δω|να ακούσω|δεν ξέρω/i },
  { theme: 'Χρησιμότητα / ανάγκη', re: /χρήσιμ|καθημεριν|ανάγκ|βοηθ/i },
  { theme: 'Εξυπηρέτηση / ευκολία', re: /εξυπηρ|εύκολ|δύσκολ|γρήγορ/i },
  { theme: 'Ουδετερότητα / αδιαφορία', re: /δεν έχω ισχυρή|δεν με αφορά|εξαρτάται/i }
];

function headlineFor(q: Question, rs: { r: SyntheticRespondent; p: Persona }[]): number | null {
  const ans = rs.map(({ r }) => r.answers.find((a) => a.questionId === q.id)).filter((a) => a && !a.skipped && a.value);
  const ws = rs.filter(({ r }) => {
    const a = r.answers.find((x) => x.questionId === q.id);
    return a && !a.skipped && a.value;
  }).map(({ r }) => r.weight);
  if (!ans.length) return null;
  const share = (pred: (i: number) => boolean) => {
    let num = 0;
    let den = 0;
    ans.forEach((_, i) => {
      den += ws[i];
      if (pred(i)) num += ws[i];
    });
    return den ? (num / den) * 100 : null;
  };
  switch (q.type) {
    case 'likert':
    case 'concept_test': {
      const k = (q.scale || SCALE_DEFAULT).length;
      return share((i) => (ans[i]!.value!.scaleIndex ?? -1) >= k - 2);
    }
    case 'single_choice':
    case 'product_comparison': {
      const target = q.evidenceLink?.positiveOption || topOption(ans.map((a) => a!.value!.choice || ''), ws);
      return share((i) => ans[i]!.value!.choice === target);
    }
    case 'multiple_choice': {
      const target = topOption(ans.flatMap((a) => a!.value!.choices || []), ans.flatMap((a, i) => (a!.value!.choices || []).map(() => ws[i])));
      return share((i) => (ans[i]!.value!.choices || []).includes(target));
    }
    case 'ranking': {
      const target = topOption(ans.map((a) => a!.value!.ranking?.[0] || ''), ws);
      return share((i) => ans[i]!.value!.ranking?.[0] === target);
    }
    case 'price_test': {
      const pts = q.pricePoints || [];
      const mid = pts[Math.floor(pts.length / 2)];
      return mid === undefined ? null : share((i) => !!ans[i]!.value!.priceAcceptance?.[String(mid)]);
    }
    default:
      return null;
  }
}

function topOption(values: string[], ws: number[]): string {
  const m = new Map<string, number>();
  values.forEach((v, i) => m.set(v, (m.get(v) || 0) + (ws[i] ?? 1)));
  let best = '';
  let bw = -1;
  m.forEach((w, v) => {
    if (w > bw) {
      bw = w;
      best = v;
    }
  });
  return best;
}

export function aggregateQuestion(q: Question, respondents: SyntheticRespondent[], personas: Map<string, Persona>): QuestionAggregate {
  const rows = respondents
    .map((r) => ({ r, a: r.answers.find((x) => x.questionId === q.id) }))
    .filter((x) => x.a && !x.a.skipped && x.a.value);
  const weights = rows.map((x) => x.r.weight);
  const n = rows.length;
  const effN = effectiveN(weights);
  const totalW = weights.reduce((s, w) => s + w, 0);
  const basisMix: Record<AnswerBasis, number> = { empirical_prior: 0, assumption: 0, uninformed: 0, llm: 0, model_extrapolated: 0, not_estimable: 0, persona_model: 0 };
  rows.forEach((x) => (basisMix[x.a!.basis] += 1));
  Object.keys(basisMix).forEach((k) => (basisMix[k as AnswerBasis] = n ? round((basisMix[k as AnswerBasis] / n) * 100, 1) : 0));

  const agg: QuestionAggregate = {
    questionId: q.id,
    type: q.type,
    n,
    effectiveN: round(effN, 1),
    basisMix,
    evidenceKind: basisMix.empirical_prior >= 50 ? 'estimate' : 'simulation'
  };

  const shareOf = (pred: (i: number) => boolean, option: string) => {
    let w = 0;
    let c = 0;
    rows.forEach((_, i) => {
      if (pred(i)) {
        w += weights[i];
        c++;
      }
    });
    const p = totalW ? w / totalW : 0;
    const [lo, hi] = wilson(p, effN);
    return { option, share: round(p * 100, 1), ciLow: round(lo * 100, 1), ciHigh: round(hi * 100, 1), count: c };
  };

  switch (q.type) {
    case 'single_choice':
    case 'product_comparison': {
      const opts = q.type === 'product_comparison' ? (q.products || []).map((x) => x.label) : q.options || [];
      agg.shares = opts.map((o) => shareOf((i) => rows[i].a!.value!.choice === o, o));
      break;
    }
    case 'multiple_choice': {
      agg.shares = (q.options || []).map((o) => shareOf((i) => (rows[i].a!.value!.choices || []).includes(o), o));
      break;
    }
    case 'likert':
    case 'concept_test': {
      const sc = q.scale || SCALE_DEFAULT;
      agg.shares = sc.map((o, k) => shareOf((i) => rows[i].a!.value!.scaleIndex === k, o));
      const scores = rows.map((x) => (x.a!.value!.scaleIndex ?? 0) + 1);
      const m = weightedMean(scores, weights);
      const v = weightedMean(scores.map((s) => (s - m) ** 2), weights);
      const se = Math.sqrt(v / Math.max(1, effN));
      agg.meanScore = n ? round(m, 2) : null;
      agg.meanScoreCi = n ? [round(m - 1.96 * se, 2), round(m + 1.96 * se, 2)] : null;
      break;
    }
    case 'ranking': {
      const opts = q.options || [];
      agg.rankingScores = opts.map((o) => {
        const ranks = rows.map((x) => (x.a!.value!.ranking || []).indexOf(o) + 1).map((r) => (r > 0 ? r : opts.length));
        const first = shareOf((i) => (rows[i].a!.value!.ranking || [])[0] === o, o);
        return { option: o, meanRank: round(weightedMean(ranks, weights), 2), firstPlaceShare: first.share };
      });
      break;
    }
    case 'price_test': {
      agg.priceCurve = (q.pricePoints || []).map((pp) => {
        const s = shareOf((i) => !!rows[i].a!.value!.priceAcceptance?.[String(pp)], String(pp));
        return { price: pp, acceptance: s.share, ciLow: s.ciLow, ciHigh: s.ciHigh };
      });
      break;
    }
    case 'open_ended': {
      const texts = rows.map((x) => (x.a!.value!.text || '').replace(/\s*\[Πρότυπο demo[^\]]*\]$/, ''));
      agg.openThemes = THEMES.map((t) => {
        const hits = texts.filter((tx) => t.re.test(tx));
        return { theme: t.theme, count: hits.length, examples: Array.from(new Set(hits)).slice(0, 3) };
      })
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);
      break;
    }
  }

  // Ανάλυση ανά κοινωνική ομάδα (headline δείκτης).
  const withP = respondents.map((r) => ({ r, p: personas.get(r.personaId)! })).filter((x) => x.p);
  agg.bySegment = {};
  for (const seg of SEGMENTS) {
    const groups = new Map<string, { r: SyntheticRespondent; p: Persona }[]>();
    withP.forEach((x) => {
      const g = seg.get(x.p);
      groups.set(g, [...(groups.get(g) || []), x]);
    });
    agg.bySegment[seg.key] = Array.from(groups.entries())
      .map(([segment, rs]) => ({ segment, n: rs.length, headline: headlineFor(q, rs) }))
      .map((x) => ({ ...x, headline: x.headline === null ? null : round(x.headline, 1) }))
      .sort((a, b) => a.segment.localeCompare(b.segment, 'el'));
  }
  return agg;
}

export function headlineLabel(q: Question): string {
  switch (q.type) {
    case 'likert':
    case 'concept_test':
      return '% στις δύο υψηλότερες θέσεις';
    case 'price_test':
      return '% αποδοχής στη μεσαία τιμή';
    case 'ranking':
      return '% πρώτης θέσης (κορυφαία επιλογή)';
    case 'open_ended':
      return '—';
    default:
      return q.evidenceLink ? `% «${q.evidenceLink.positiveOption}»` : '% κορυφαίας επιλογής';
  }
}
