// ============================================================
// PHASE6 Part I/J — δρομολόγηση μικτού ερωτηματολογίου και επίπεδο απόφασης τεκμηρίωσης (Tier 1–5) με αποχή.
//
// Για κάθε ερώτηση: τομέας → έννοια/δομή απάντησης → απαιτούμενο τεκμήριο → ειδικό μοντέλο → βαθμίδα → εκτίμηση ή αποχή.
// Οι βαθμίδες είναι ΚΑΤΗΓΟΡΙΕΣ ΤΕΚΜΗΡΙΟΥ, όχι εγγύηση ακρίβειας. Το αναμενόμενο σφάλμα κάθε βαθμίδας και οι κανόνες
// αποχής βαθμονομήθηκαν σε ήδη βαθμολογημένα πραγματικά ελληνικά holdouts (scripts/synthetic-lab/persona/gpm_tiers.py →
// config/synthetic-lab/persona/gpm/evidence-tiers.json). Ενεργοποιείται ΜΟΝΟ όταν το μοντέλο δηλώνει πολιτική τεκμηρίωσης
// (pie-0.7 και μετά)· οι παλαιότερες εκδόσεις δεν αλλάζουν συμπεριφορά.
// ============================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { Question } from '../types';
import type { PersonaModel } from './model';
import type { PreparedPersonaQuestion } from './respond';

export const ABSTAIN_MESSAGE = 'Δεν υπάρχει επαρκής εμπειρική τεκμηρίωση για αξιόπιστη εκτίμηση. Απαιτείται πραγματική ελληνική βαθμονόμηση.';

export type EvidenceTier = 1 | 2 | 3 | 4 | 5;
export type QuestionDomain = 'POLITICAL' | 'SOCIAL' | 'CONSUMER' | 'ECONOMIC' | 'MEDIA_TECH';
export type Specialist = 'vote_model' | 'persona_item' | 'persona_anchor' | 'international_transfer' | 'related_inference' | 'brand_entity' | 'none';

export interface TierCalibration {
  label: string;
  validated: boolean;
  expectedMAE: number | null;
  medianAE: number | null;
  p90: number | null;
  cover80: number | null;
  uniformMAE: number | null;
  n: number;
  source: string;
}

export interface EvidencePolicy {
  version: string;
  calibratedAt: string;
  tiers: Record<string, TierCalibration>;
  rules: { greekRelatedOnly: 'abstain' | 'experimental'; relatedEquivalentLink: 'abstain' | 'experimental'; driftYears: number; voteCurrentMonths: number };
}

export interface EvidenceDecision {
  tier: EvidenceTier;
  label: string;
  domain: QuestionDomain;
  specialist: Specialist;
  validated: boolean;
  experimental: boolean;
  abstain: boolean;
  expectedMAE: number | null;
  p90: number | null;
  sources: string[];
  modelVersion: string;
  policyVersion: string;
  calibrationDate: string;
  limitations: string[];
  message: string | null;
}

const POLICY_FILE = path.join(process.cwd(), 'config', 'synthetic-lab', 'persona', 'gpm', 'evidence-tiers.json');
let cached: EvidencePolicy | null | undefined;

export function loadEvidencePolicy(): EvidencePolicy | null {
  if (cached !== undefined) return cached;
  cached = existsSync(POLICY_FILE) ? (JSON.parse(readFileSync(POLICY_FILE, 'utf8')) as EvidencePolicy) : null;
  return cached;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DOMAIN_RULES: [QuestionDomain, RegExp][] = [
  ['POLITICAL', /(ψηφ|κομμ|εκλογ|βουλ|κυβερν|πρωθυπουργ|αρχηγ|πολιτικ|δημοκρατ|θεσμ|vote|party|election|government|parliament|politic|democra)/],
  ['CONSUMER', /(αγορ|ψωνι|σουπερ\s?μαρκετ|μαρκ|προιον|τιμη|τιμες|εκπτωσ|συνδρομ|παροχ|κινητ|streaming|netflix|καταστημ|ηλεκτρονικ\w* αγορ|brand|shop|price|subscription|provider|purchase|buy)/],
  ['MEDIA_TECH', /(ιντερνετ|διαδικτυ|τηλεορασ|εφημεριδ|ειδησ|μεσα κοινωνικ|social media|κινητο τηλεφων|τεχνητη νοημοσυν|internet|television|news|online|smartphone|\bai\b)/],
  ['ECONOMIC', /(οικονομ|εισοδημ|μισθ|ανεργ|πληθωρισμ|δαπαν|δαν|λογαριασμ|economy|income|job|unemploy|inflation|debt|bills)/]
];

export function detectDomain(q: Question): QuestionDomain {
  const t = norm(`${q.text} ${(q.options || q.scale || []).join(' ')}`);
  for (const [d, re] of DOMAIN_RULES) if (re.test(t)) return d;
  return 'SOCIAL';
}

/** Ερώτηση για συγκεκριμένη μάρκα/προϊόν/οντότητα: ρητός σύνδεσμος μάρκας ή επιλογές-μάρκες. */
export function isEntitySpecific(q: Question): boolean {
  return !!(q.brandLink || q.brandOptions);
}

function monthsBetween(a: string, b: string): number {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return y2 * 12 + (m2 || 1) - (y1 * 12 + (m1 || 1));
}

/** Απόφαση βαθμίδας για μία προετοιμασμένη ερώτηση. Δεν αλλάζει την ερώτηση· βλ. applyEvidenceDecision. */
export function classifyEvidence(pq: PreparedPersonaQuestion, model: PersonaModel, policy: EvidencePolicy, referenceMonth: string, opts: { allowExperimental?: boolean } = {}): EvidenceDecision {
  const domain = detectDomain(pq.q);
  const T = (t: EvidenceTier) => policy.tiers[String(t)];
  const limitations: string[] = [];
  const mk = (tier: EvidenceTier, specialist: Specialist, sources: string[], experimental = false): EvidenceDecision => {
    const c = T(tier);
    const abstain = tier === 5;
    return {
      tier,
      label: c?.label || `Tier ${tier}`,
      domain,
      specialist,
      validated: !!c?.validated && !experimental,
      experimental,
      abstain,
      expectedMAE: abstain ? null : c?.expectedMAE ?? null,
      p90: abstain ? null : c?.p90 ?? null,
      sources,
      modelVersion: model.version,
      policyVersion: policy.version,
      calibrationDate: policy.calibratedAt,
      limitations,
      message: abstain ? ABSTAIN_MESSAGE : null
    };
  };
  if (isEntitySpecific(pq.q)) {
    limitations.push('Ερώτηση για συγκεκριμένη μάρκα/προϊόν: δεν υπάρχουν ελληνικά ατομικά δεδομένα για την οντότητα· δεν συμπεραίνεται από γενικά χαρακτηριστικά (π.χ. «πιστότητα σε μάρκες»).');
    return mk(5, 'brand_entity', []);
  }
  if (pq.support === 'NOT_RELIABLY_ESTIMABLE') {
    limitations.push(pq.reason);
    return mk(5, 'none', []);
  }
  if (pq.vote) {
    const sc = pq.vote.scenario as unknown as { referenceMonth?: string; month?: string; parties?: { key: string; isNew?: boolean }[] };
    const scMonth = sc.referenceMonth || sc.month;
    const m = scMonth ? Math.abs(monthsBetween(scMonth, referenceMonth)) : Infinity;
    const src = pq.vote.model.trainedOn;
    const newParties = (sc.parties || []).filter((p) => p.isNew).map((p) => p.key);
    limitations.push('Πρόθεση ψήφου από ελληνικά μικροδεδομένα (μοντέλο επιλογής) και σενάριο κομμάτων· τα επίπεδα ΔΕΝ βαθμονομούνται σε δημοσκοπήσεις.');
    if (newParties.length) {
      limitations.push(`Νέα κόμματα χωρίς ελληνική ατομική μέτρηση (${newParties.join(', ')}): το μερίδιό τους προκύπτει από θέση/προέλευση, όχι από μέτρηση· απαιτείται βαθμονόμηση με σύγχρονες δημοσκοπήσεις.`);
      if (!opts.allowExperimental) return mk(5, 'vote_model', src);
      return mk(4, 'vote_model', src, true);
    }
    if (m <= policy.rules.voteCurrentMonths) return mk(1, 'vote_model', src);
    limitations.push(`Το σενάριο ψήφου δεν είναι σύγχρονο με τον μήνα αναφοράς (${referenceMonth})· ιστορική ανασύνθεση, όχι τρέχουσα εκτίμηση.`);
    return mk(4, 'vote_model', src, true);
  }
  if (pq.anchor) {
    const ext = pq.support === 'MODEL_EXTRAPOLATED';
    if (ext) limitations.push('Άγκυρα με διαφορετική διατύπωση ή χρονική μεταφορά.');
    return ext ? mk(4, 'persona_anchor', pq.provenance.anchorSource?.trainFiles || [], true) : mk(1, 'persona_anchor', pq.provenance.anchorSource?.trainFiles || []);
  }
  const g = pq.q.personaLink?.iqge;
  if (pq.iqge && g) {
    const ev = g.evidence.map((e) => e.id);
    if (g.tier === 'international' && g.international) {
      limitations.push('Μεταφορά από ισοδύναμη τυποποιημένη ερώτηση άλλων χωρών· δεν ισχύει για ψήφο/κόμματα/αρχηγούς.');
      return mk(3, 'international_transfer', [g.international.itemId, ...g.international.countries.map((c) => `country:${c}`)]);
    }
    if ((g as { lake?: string }).lake === 'international') {
      limitations.push('Πειραματικό: επίπεδο από συγγενείς (όχι ίδιες) ερωτήσεις με διεθνή τεκμήρια (Phase 5 S2: 14,0 έναντι 20,6 π.μ. της ομοιόμορφης· χειρότερο από την ομοιόμορφη στο 26% των ερωτήσεων).');
      return mk(4, 'related_inference', ev, true);
    }
    limitations.push('Μόνο ελληνικά συγγενή τεκμήρια (IQGE): στα τελικά holdouts το σφάλμα ήταν ίσο με την ομοιόμορφη κατανομή (12,8 έναντι 13,1 π.μ.).');
    if (policy.rules.greekRelatedOnly === 'abstain' && !opts.allowExperimental) return mk(5, 'related_inference', ev);
    return mk(4, 'related_inference', ev, true);
  }
  if (pq.item || pq.multi) {
    const file = pq.item?.file || pq.multi?.[0]?.item.file || '';
    const kind = pq.q.personaLink?.kind;
    if (kind === 'equivalent') {
      limitations.push('Συγγενική (όχι ίδια) ερώτηση με ρητή παραδοχή ισοδυναμίας: στην τυφλή αξιολόγηση συχνά χειρότερη από την ομοιόμορφη.');
      if (policy.rules.relatedEquivalentLink === 'abstain' && !opts.allowExperimental) return mk(5, 'persona_item', [file]);
      return mk(4, 'persona_item', [file], true);
    }
    const wave = pq.item?.wave || '';
    const age = wave ? monthsBetween(wave, referenceMonth) / 12 : 0;
    if (age > policy.rules.driftYears) limitations.push(`Η ίδια ερώτηση μετρήθηκε ${age.toFixed(1)} έτη πριν· πιθανή χρονική μετατόπιση επιπέδου.`);
    if (pq.support === 'MODEL_EXTRAPOLATED' && age <= policy.rules.driftYears) limitations.push(pq.reason);
    return mk(1, 'persona_item', [file]);
  }
  limitations.push(pq.reason);
  return mk(5, 'none', []);
}

/** Εφαρμογή απόφασης: Tier 5 → καμία συνθετική απάντηση (αποχή) με το ρητό μήνυμα. */
export function applyEvidenceDecision(pq: PreparedPersonaQuestion, d: EvidenceDecision): PreparedPersonaQuestion {
  const out: PreparedPersonaQuestion = { ...pq, provenance: { ...pq.provenance, evidenceTier: d } };
  if (d.abstain && pq.support !== 'NOT_RELIABLY_ESTIMABLE') {
    out.support = 'NOT_RELIABLY_ESTIMABLE';
    out.reason = `${ABSTAIN_MESSAGE} (${d.limitations.join(' ') || 'Tier 5'})`;
    out.provenance = { ...out.provenance, support: 'NOT_RELIABLY_ESTIMABLE', reason: out.reason };
  }
  return out;
}

/** Σύνοψη δρομολόγησης για την αναφορά της μελέτης. */
export function routingSummary(ds: { questionId: string; d: EvidenceDecision }[]): string {
  const by = new Map<number, string[]>();
  ds.forEach(({ questionId, d }) => by.set(d.tier, [...(by.get(d.tier) || []), questionId]));
  const parts = [1, 2, 3, 4, 5].filter((t) => by.has(t)).map((t) => `Tier ${t}: ${by.get(t)!.join(', ')}`);
  return `Βαθμίδες τεκμηρίωσης (${ds[0]?.d.policyVersion || 'evidence'}): ${parts.join(' · ')}. Οι βαθμίδες είναι κατηγορίες τεκμηρίου, όχι εγγύηση ακρίβειας.`;
}
