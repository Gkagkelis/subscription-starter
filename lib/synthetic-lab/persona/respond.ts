// ============================================================
// PIE — Στάδιο Β: κάθε πρόσωπο απαντά ατομικά, με βάση το ΗΔΗ διαμορφωμένο προφίλ του.
//
// Για κάθε ερώτηση:
//   1. σύνδεση με item του μοντέλου (personaLink) → κατηγορία υποστήριξης:
//        DIRECTLY_SUPPORTED       ίδια ερώτηση σε πραγματικά μικροδεδομένα (ή συγχώνευση επιλογών της), πρόσφατο κύμα
//        MODEL_EXTRAPOLATED       ρητή παραδοχή ισοδυναμίας διατύπωσης ή χρονική μεταφορά (> 4 έτη)· η παραδοχή καταγράφεται
//        NOT_RELIABLY_ESTIMABLE   καμία σύνδεση → καμία συνθετική απάντηση (όχι ομοιόμορφη κατανομή)
//   2. ατομική απάντηση: P(ΔΞ) από το προφίλ· αλλιώς ordinal probit  y* = η(προφίλ) + λ·θ + √(1−λ²)·ε
//      ή πολυωνυμικό logit — με τις παραμέτρους που εκτιμήθηκαν στα πραγματικά δεδομένα.
//   3. τα ποσοστά υπολογίζονται ΜΟΝΟ μετά, από τις ατομικές απαντήσεις (aggregateQuestion).
// Καμία δημοσκόπηση/ποσοστό-στόχος δεν χρησιμοποιείται. Όλα είναι στατιστικά (όχι LLM).
// ============================================================

import { createRng, deriveSeed } from '../rng';
import type { PersonaLink, PersonaSupport, Question, SyntheticAnswer } from '../types';
import { dkProb, featureVector, itemProbs, linear, type PersonaItem, type PersonaModel } from './model';
import { theta, type PersonaState } from './panel';
import { answerVote, prepareVote, type PreparedVote } from './vote';

export const PIE_TEMPORAL_LIMIT_YEARS = 4;

export interface PreparedPersonaQuestion {
  q: Question;
  support: PersonaSupport;
  reason: string;
  item: PersonaItem | null;
  codeToOption: Map<string, string> | null;
  dkOption: string | null;
  assumption: string | null;
  vote: PreparedVote | null;
  /** Απάντηση από άγκυρα του προσώπου: τιμή άγκυρας → επιλογή. */
  anchor: { name: string; valueToOption: Map<string, string> } | null;
  /** Πολλαπλή επιλογή: ένα δυαδικό item ανά επιλογή. */
  multi: { option: string; item: PersonaItem; yesCode: string }[] | null;
  provenance: PersonaQuestionProvenance;
}

export interface PersonaQuestionProvenance {
  questionId: string;
  support: PersonaSupport;
  reason: string;
  itemId: string | null;
  itemText: string | null;
  sourceFile: string | null;
  source: string | null;
  wave: string | null;
  licence: string | null;
  tier: string | null;
  n: number | null;
  observedSourceShares: { option: string; share: number }[] | null;
  modelVersion: string;
  features: string[];
  latentTrait: { key: string; loading: number } | null;
  assumption: string | null;
  responseModel: 'ordinal_probit' | 'multinomial_logit' | 'electoral_choice' | 'persona_anchor' | 'none';
  anchorSource?: { node: string; trainFiles: string[]; wave: string; n: number; observed: Record<string, number> } | null;
  generatedBy: 'statistical_model';
  /** Αυτόματη ερμηνεία (C6): πρόταση/αποδοχή σύνδεσης για ερώτηση χωρίς χειροκίνητη σύνδεση. */
  autoLink?: { version: string; accepted: boolean; confidence: number; target: string | null; reason: string } | null;
}

/**
 * Γνωστές εξαρτήσεις επιπέδου από το εργαλείο μέτρησης (sprint 10/2026, τυφλή αξιολόγηση σε ESS10 και DEMOTEC).
 * Δεν διορθώνουν την απάντηση· προστίθενται ως ρητή προειδοποίηση στην αιτιολόγηση.
 */
export const ANCHOR_INSTRUMENT_CAVEATS: Record<string, string> = {
  polint4:
    'Το επίπεδο εξαρτάται από τη διατύπωση: στη διαΝΕΟσις (πηγή του μοντέλου) «πολύ» δηλώνει ~21%, ενώ στο ESS 2021–22 (CAPI) και στο DEMOTEC 2022 (online) 4–5%. ' +
    'Στην τυφλή αξιολόγηση τα πρόσωπα έδωσαν ~18–20% «πολύ» — η κατανομή να διαβάζεται ως κλίμακα τύπου διαΝΕΟσις, όχι ως ESS.'
};

function yearsBetween(wave: string, ref: string): number {
  const [y1, m1] = wave.split('-').map(Number);
  const [y2, m2] = ref.split('-').map(Number);
  return (y2 * 12 + (m2 || 1) - (y1 * 12 + (m1 || 1))) / 12;
}

/** Επιλογές της ερώτησης με τη σειρά που εμφανίζονται στις απαντήσεις. */
export function questionOptions(q: Question): string[] {
  if (q.type === 'likert' || q.type === 'concept_test') return q.scale || [];
  return q.options || [];
}

export function prepareQuestion(model: PersonaModel, q: Question, referenceMonth: string): PreparedPersonaQuestion {
  const base = (support: PersonaSupport, reason: string, extra: Partial<PreparedPersonaQuestion> = {}): PreparedPersonaQuestion => {
    const item = extra.item || null;
    const src = item ? model.sources.find((s) => s.fileId === item.file) : null;
    return {
      q,
      support,
      reason,
      item,
      codeToOption: null,
      dkOption: null,
      assumption: null,
      vote: null,
      multi: null,
      anchor: null,
      ...extra,
      provenance: {
        questionId: q.id,
        support,
        reason,
        itemId: item?.id || null,
        itemText: item?.text || null,
        sourceFile: item?.file || null,
        source: src?.source || null,
        wave: item?.wave || null,
        licence: src?.licence || null,
        tier: src?.tier || null,
        n: item?.n ?? null,
        observedSourceShares: item ? item.options.map((o, i) => ({ option: o.label, share: item.observed[i] })) : null,
        modelVersion: model.version,
        features: item?.feats || extra.vote?.features || [],
        latentTrait: item?.factorKey && item.lambda ? { key: item.factorKey, loading: item.lambda } : null,
        assumption: extra.assumption || null,
        responseModel: extra.vote ? 'electoral_choice' : extra.anchor ? 'persona_anchor' : item ? (item.model.kind === 'ordinal' ? 'ordinal_probit' : 'multinomial_logit') : 'none',
        anchorSource: extra.anchor ? (() => {
          const n = model.anchorNodes.find((x) => x.node === extra.anchor!.name);
          return n ? { node: n.node, trainFiles: n.trainFiles, wave: n.wave, n: n.n, observed: n.observed } : null;
        })() : null,
        generatedBy: 'statistical_model'
      }
    };
  };
  const link: PersonaLink | null | undefined = q.personaLink;
  if (!link) return base('NOT_RELIABLY_ESTIMABLE', 'Δεν υπάρχει σύνδεση με μετρημένη ερώτηση σε πραγματικά μικροδεδομένα του μοντέλου.');
  if (link.vote) {
    const pv = prepareVote(model, q, link);
    if (!pv.ok) return base('NOT_RELIABLY_ESTIMABLE', pv.reason);
    return base('MODEL_EXTRAPOLATED', pv.reason, { vote: pv.prepared, assumption: pv.prepared.assumptions.join(' · ') });
  }
  if (link.anchor) {
    const node = model.anchorNodes.find((n) => n.node === link.anchor!.name);
    if (!node) return base('NOT_RELIABLY_ESTIMABLE', `Η άγκυρα ${link.anchor.name} δεν υπάρχει στο μοντέλο ${model.version}.`);
    const opts = questionOptions(q);
    const valueToOption = new Map<string, string>();
    for (const [opt, vals] of Object.entries(link.anchor.optionMap)) {
      if (!opts.includes(opt)) return base('NOT_RELIABLY_ESTIMABLE', `Η επιλογή «${opt}» δεν υπάρχει στην ερώτηση ${q.id}.`);
      vals.forEach((v) => valueToOption.set(String(v), opt));
    }
    const age = yearsBetween(node.wave, referenceMonth);
    const extrap = link.kind === 'equivalent' || age > PIE_TEMPORAL_LIMIT_YEARS;
    const why =
      `Η απάντηση είναι χαρακτηριστικό του ίδιου του προσώπου (άγκυρα ${node.node}), που παράχθηκε στο Στάδιο Α από μοντέλο εκτιμημένο σε ${node.trainFiles.join(', ')} (κύμα ${node.wave}, n=${node.n}).` +
      (link.kind === 'equivalent' ? ` Η διατύπωση/κλίμακα διαφέρει: ${link.assumption || 'ρητή παραδοχή αντιστοίχισης'}.` : '') +
      (age > PIE_TEMPORAL_LIMIT_YEARS ? ` Χρονική μεταφορά ${age.toFixed(1)} ετών.` : '') +
      (ANCHOR_INSTRUMENT_CAVEATS[node.node] ? ` Προσοχή: ${ANCHOR_INSTRUMENT_CAVEATS[node.node]}` : '');
    return base(extrap ? 'MODEL_EXTRAPOLATED' : 'DIRECTLY_SUPPORTED', why, { anchor: { name: node.node, valueToOption }, assumption: extrap ? link.assumption || null : null });
  }
  if (link.optionItems) {
    const multi: { option: string; item: PersonaItem; yesCode: string }[] = [];
    const opts = questionOptions(q);
    for (const [opt, ref] of Object.entries(link.optionItems)) {
      const it = model.items.find((i) => i.id === ref.itemId);
      if (!opts.includes(opt)) return base('NOT_RELIABLY_ESTIMABLE', `Η επιλογή «${opt}» δεν υπάρχει στην ερώτηση ${q.id}.`);
      if (!it || it.wave > referenceMonth) return base('NOT_RELIABLY_ESTIMABLE', `Το item ${ref.itemId} δεν υπάρχει στο μοντέλο ή είναι μεταγενέστερο.`);
      multi.push({ option: opt, item: it, yesCode: ref.yesCode });
    }
    const oldest = multi.reduce((m, x) => (x.item.wave < m ? x.item.wave : m), '9999-12');
    const age = yearsBetween(oldest, referenceMonth);
    const extrap = link.kind === 'equivalent' || age > PIE_TEMPORAL_LIMIT_YEARS;
    const first = multi[0]?.item || null;
    return base(
      extrap ? 'MODEL_EXTRAPOLATED' : 'DIRECTLY_SUPPORTED',
      `Κάθε επιλογή από δικό της δυαδικό item πραγματικών μικροδεδομένων (${Array.from(new Set(multi.map((m) => m.item.file))).join(', ')}, κύμα ${oldest}).` +
        (extrap ? ` ${link.assumption || ''} ${age > PIE_TEMPORAL_LIMIT_YEARS ? `Χρονική μεταφορά ${age.toFixed(1)} ετών.` : ''}` : ''),
      { multi, item: first, assumption: extrap ? link.assumption || `Σταθερότητα σχέσεων από το ${oldest}.` : null }
    );
  }
  let item: PersonaItem | undefined;
  if (link.itemId) item = model.items.find((i) => i.id === link.itemId);
  if (!item && link.family) {
    const cands = model.items.filter((i) => i.family === link.family && i.wave <= referenceMonth);
    item = cands.sort((a, b) => b.wave.localeCompare(a.wave) || b.n - a.n)[0];
  }
  if (!item) return base('NOT_RELIABLY_ESTIMABLE', `Το item ${link.itemId || link.family} δεν υπάρχει στο μοντέλο ${model.version} (ή είναι μεταγενέστερο του μήνα αναφοράς).`);
  if (item.wave > referenceMonth) return base('NOT_RELIABLY_ESTIMABLE', `Το item ${item.id} μετρήθηκε μετά τον μήνα αναφοράς ${referenceMonth}.`);
  const opts = questionOptions(q);
  const codeToOption = new Map<string, string>();
  for (const [opt, codes] of Object.entries(link.optionMap)) {
    if (!opts.includes(opt)) return base('NOT_RELIABLY_ESTIMABLE', `Η επιλογή «${opt}» δεν υπάρχει στην ερώτηση ${q.id}.`);
    for (const c of codes) {
      if (codeToOption.has(c)) return base('NOT_RELIABLY_ESTIMABLE', `Ο κωδικός ${c} αντιστοιχίζεται σε δύο επιλογές (η διάσπαση κατηγορίας δεν εκτιμάται).`);
      codeToOption.set(c, opt);
    }
  }
  const missing = item.options.filter((o) => !codeToOption.has(o.code));
  if (missing.length) return base('NOT_RELIABLY_ESTIMABLE', `Η αντιστοίχιση δεν καλύπτει τις επιλογές του item: ${missing.map((m) => m.label).join(', ')}.`, { item });
  const age = yearsBetween(item.wave, referenceMonth);
  let support: PersonaSupport = 'DIRECTLY_SUPPORTED';
  let reason = `Ίδια ερώτηση σε πραγματικά μικροδεδομένα (${item.file}, κύμα ${item.wave}, n=${item.n})· η απάντηση κάθε προσώπου προκύπτει από το προφίλ του.`;
  const assumptions: string[] = [];
  if (link.kind === 'collapsed') reason += ' Οι επιλογές της πηγής συγχωνεύονται στις κατηγορίες της ερώτησης.';
  if (link.kind === 'equivalent') {
    support = 'MODEL_EXTRAPOLATED';
    reason = `Συγγενική (όχι ίδια) ερώτηση σε πραγματικά μικροδεδομένα (${item.file}, ${item.wave}). Ρητή παραδοχή ισοδυναμίας.`;
    assumptions.push(link.assumption || 'Η διατύπωση της πηγής θεωρείται ισοδύναμη.');
  }
  if (age > PIE_TEMPORAL_LIMIT_YEARS) {
    support = 'MODEL_EXTRAPOLATED';
    reason += ` Χρονική μεταφορά ${age.toFixed(1)} ετών (> ${PIE_TEMPORAL_LIMIT_YEARS}): οι σχέσεις θεωρούνται σταθερές, το επίπεδο μπορεί να έχει αλλάξει.`;
    assumptions.push(`Σταθερότητα σχέσεων από το ${item.wave} έως το ${referenceMonth}.`);
  }
  return base(support, reason, { item, codeToOption, dkOption: link.dkOption || null, assumption: assumptions.join(' · ') || null });
}

/** Ατομική απάντηση ενός προσώπου σε μια προετοιμασμένη ερώτηση. */
export function answerPersona(pq: PreparedPersonaQuestion, ps: PersonaState, seed: number): SyntheticAnswer {
  const qid = pq.q.id;
  if (pq.support === 'NOT_RELIABLY_ESTIMABLE') return { questionId: qid, value: null, skipped: true, basis: 'not_estimable', rationale: pq.reason };
  const basis = pq.support === 'DIRECTLY_SUPPORTED' ? 'persona_model' : 'model_extrapolated';
  const rng = createRng(deriveSeed(seed, 'pie-answer', ps.personaId, qid));
  if (pq.vote) {
    const choice = answerVote(pq.vote, ps, rng);
    return choice == null ? { questionId: qid, value: null, skipped: true, basis, rationale: 'καμία επιλογή' } : { questionId: qid, value: { choice }, skipped: false, basis };
  }
  if (pq.anchor) {
    const a = ps.anchors as unknown as Record<string, string | number | null>;
    const raw = pq.anchor.name === 'lr7' && ps.anchors.lr_none === 1 ? 'none' : a[pq.anchor.name];
    const key = raw == null ? null : typeof raw === 'number' ? String(raw) : raw;
    const opt = key == null ? undefined : pq.anchor.valueToOption.get(key);
    return opt ? { questionId: qid, value: toValue(pq.q, opt), skipped: false, basis } : { questionId: qid, value: null, skipped: true, basis, rationale: `τιμή άγκυρας ${key} εκτός επιλογών` };
  }
  if (pq.multi) {
    const fv = featureVector(ps.demographics, ps.anchors);
    const picked: { option: string; p: number }[] = [];
    for (const m of pq.multi) {
      const p = itemProbs(m.item, fv);
      const yes = p[m.item.options.findIndex((o) => o.code === m.yesCode)] ?? 0;
      if (rng.next() < yes) picked.push({ option: m.option, p: yes });
    }
    const max = pq.q.maxSelections || picked.length;
    const choices = picked.sort((a, b) => b.p - a.p).slice(0, max).map((x) => x.option);
    return { questionId: qid, value: { choices }, skipped: false, basis };
  }
  const item = pq.item!;
  const fv = featureVector(ps.demographics, ps.anchors);
  if (item.dk && rng.next() < dkProb(item, fv)) {
    return pq.dkOption
      ? { questionId: qid, value: toValue(pq.q, pq.dkOption), skipped: false, basis }
      : { questionId: qid, value: null, skipped: true, basis, rationale: 'ΔΞ/ΔΑ' };
  }
  let k: number;
  if (item.model.kind === 'ordinal') {
    const eta = linear(item.feats, item.means, item.model.b, fv);
    let e: number;
    if (item.factorKey && item.latentRow?.length) {
      e = item.latentRow.reduce((s, l, k) => (l ? s + l * theta(ps.pseed, `${item.factorKey}#${k}`) : s), 0);
    } else {
      const lam = item.factorKey ? item.lambda : 0;
      e = lam * (lam ? theta(ps.pseed, item.factorKey!) : 0) + Math.sqrt(Math.max(1 - lam * lam, 0)) * rng.normal();
    }
    const y = eta + e;
    k = item.model.tau.filter((t) => t < y).length;
  } else {
    const p = itemProbs(item, fv);
    const u = rng.next();
    let c = 0;
    k = p.length - 1;
    for (let i = 0; i < p.length; i++) {
      c += p[i];
      if (u < c) {
        k = i;
        break;
      }
    }
  }
  const opt = pq.codeToOption!.get(item.options[k].code)!;
  return { questionId: qid, value: toValue(pq.q, opt), skipped: false, basis };
}

function toValue(q: Question, opt: string) {
  if (q.type === 'likert' || q.type === 'concept_test') return { scaleIndex: (q.scale || []).indexOf(opt) };
  if (q.type === 'multiple_choice') return { choices: [opt] };
  return { choice: opt };
}

/** Αναμενόμενη (χωρίς δειγματοληπτικό θόρυβο) σταθμισμένη κατανομή επί των επιλογών της ερώτησης — για διαγνωστικά. */
export function expectedDistribution(pq: PreparedPersonaQuestion, panel: PersonaState[]): Record<string, number> | null {
  if (!pq.item || !pq.codeToOption) return null;
  const out: Record<string, number> = {};
  let W = 0;
  for (const ps of panel) {
    const fv = featureVector(ps.demographics, ps.anchors);
    const p = itemProbs(pq.item, fv);
    pq.item.options.forEach((o, i) => {
      const opt = pq.codeToOption!.get(o.code)!;
      out[opt] = (out[opt] || 0) + ps.weight * p[i];
    });
    W += ps.weight;
  }
  Object.keys(out).forEach((k) => (out[k] = Math.round((1000 * out[k]) / W) / 10));
  return out;
}
