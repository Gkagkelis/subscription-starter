// ============================================================
// PIE — πρόθεση ψήφου χωρίς δημοσκοπήσεις (πειραματική σύνθεση, ΟΧΙ εκλογική πρόβλεψη).
//
// Κάθε πρόσωπο αποφασίζει ατομικά:
//   1. αποχή;           logit στο προφίλ (εκτίμηση σε πραγματικά μικροδεδομένα)
//   2. αναποφάσιστο/η;  logit στο προφίλ (εκτίμηση σε πραγματικά μικροδεδομένα πρόθεσης ψήφου)
//   3. κόμμα:           conditional logit ΧΩΡΙΣ σταθερές ανά κόμμα (δεν «ξέρει» τη δημοτικότητα κανενός κόμματος):
//        U_j = β_loyal·[προηγ. ψήφος = j] + β_lineage·[προηγ. ψήφος ∈ γενεαλογία(j)]
//            + β_dist·|lr − θέση_j| + β_dist2·(lr − θέση_j)² + β_logprev·log(αποτέλεσμα προηγ. εκλογών_j)
//            + β_new·νέο_j + β_inc·κυβερνών_j + β_incloyal·κυβερνών_j·[προηγ. ψήφος = j]
//      Οι συντελεστές εκτιμώνται σε μετεκλογικά μικροδεδομένα (CSES) με τρέχουσα ΚΑΙ προηγούμενη ψήφο του ίδιου ατόμου.
// Τα χαρακτηριστικά των κομμάτων (θέσεις CHES, αποτελέσματα εκλογών, γενεαλογία, κυβέρνηση) είναι ιστορικά γεγονότα
// σε αρχείο σεναρίου· ΔΕΝ χρησιμοποιείται κανένα ποσοστό δημοσκόπησης, ούτε διορθώνεται το τελικό αποτέλεσμα.
// ============================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createRng, hashString, type Rng } from '../rng';
import type { PersonaLink, Question } from '../types';
import { featureVector, linear, softmax, type PersonaModel, type VoteModel } from './model';
import type { PersonaState } from './panel';

export interface ScenarioParty {
  key: string;
  label: string;
  /** Θέση στην κλίμακα 1–7 της αυτοτοποθέτησης (από CHES lrgen 0–10 ή ρητή παραδοχή). */
  position: number;
  positionSource: string;
  /** Κλειδιά προηγούμενης ψήφου που θεωρούνται «γενεαλογία» του κόμματος (π.χ. διάσπαση, ίδιος αρχηγός). */
  lineage: string[];
  lineageSource: string;
  isNew: boolean;
  /** % στις προηγούμενες βουλευτικές (επίσημο αποτέλεσμα)· για νέα κόμματα null. */
  prevShare: number | null;
  prevShareSource: string;
  incumbent: boolean;
}

export interface VoteScenario {
  id: string;
  referenceMonth: string;
  previousElection: string;
  facts: string[];
  parties: ScenarioParty[];
  /** Κατανομή του συγχωνευμένου κωδικού «λοιπά κόμματα» της πηγής στα επιμέρους κόμματα (επίσημο αποτέλεσμα). */
  otherSplit: Record<string, number>;
  newPartyPrevShare: number;
}

export interface PreparedVote {
  scenario: VoteScenario;
  beta: Record<string, number>;
  optionOf: Map<string, string>;
  abstainOption: string | null;
  undecidedOption: string | null;
  model: VoteModel;
  features: string[];
  assumptions: string[];
}

export function loadScenario(id: string): VoteScenario | null {
  if (!/^[\w.\-]+$/.test(id)) return null;
  const f = path.join(process.cwd(), 'config', 'synthetic-lab', 'persona', 'vote-scenarios', `${id}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as VoteScenario) : null;
}

export function prepareVote(model: PersonaModel, q: Question, link: PersonaLink): { ok: true; prepared: PreparedVote; reason: string } | { ok: false; reason: string } {
  const v = link.vote!;
  if (!model.vote) return { ok: false, reason: `Το μοντέλο ${model.version} δεν έχει μοντέλο εκλογικής επιλογής.` };
  const sc = loadScenario(v.scenario);
  if (!sc) return { ok: false, reason: `Το σενάριο ${v.scenario} δεν βρέθηκε.` };
  const pvNode = model.anchorNodes.find((n) => n.node === 'pv');
  if (!pvNode || pvNode.pvElection !== sc.previousElection) {
    return { ok: false, reason: `Η προηγούμενη ψήφος των προσώπων αφορά τις εκλογές ${pvNode?.pvElection}, ενώ το σενάριο απαιτεί ${sc.previousElection}.` };
  }
  const optionOf = new Map<string, string>();
  for (const [opt, party] of Object.entries(v.optionParty)) {
    if (!(q.options || []).includes(opt)) return { ok: false, reason: `Η επιλογή «${opt}» δεν υπάρχει στην ερώτηση.` };
    if (!sc.parties.find((p) => p.key === party)) return { ok: false, reason: `Το κόμμα ${party} δεν υπάρχει στο σενάριο.` };
    optionOf.set(party, opt);
  }
  const unmapped = sc.parties.filter((p) => !optionOf.has(p.key));
  if (unmapped.length) return { ok: false, reason: `Κόμματα του σεναρίου χωρίς επιλογή: ${unmapped.map((p) => p.label).join(', ')}.` };
  const assumptions = [
    'Πειραματική σύνθεση πρόθεσης ψήφου χωρίς δημοσκοπήσεις· όχι εκλογική πρόβλεψη.',
    `Συντελεστές επιλογής από ${model.vote.trainedOn.join(', ')} (μεταφορά σχέσεων στο ${sc.referenceMonth}).`,
    ...sc.parties.filter((p) => p.isNew || /παραδοχ/i.test(p.positionSource)).map((p) => `${p.label}: θέση ${p.position} (${p.positionSource}), γενεαλογία ${p.lineage.join('/') || '—'} (${p.lineageSource}).`)
  ];
  return {
    ok: true,
    prepared: {
      scenario: sc,
      beta: model.vote.beta,
      optionOf,
      abstainOption: v.abstainOption || null,
      undecidedOption: v.undecidedOption || null,
      model: model.vote,
      features: ['pv', 'lr7', ...(model.vote.abstain?.feats || []), ...(model.vote.undecided?.feats || [])],
      assumptions
    },
    reason:
      'Μοντέλο εκλογικής επιλογής χωρίς σταθερές ανά κόμμα, εκτιμημένο σε πραγματικά μικροδεδομένα (τρέχουσα και προηγούμενη ψήφος)· χαρακτηριστικά κομμάτων = ιστορικά γεγονότα του σεναρίου. Κανένα ποσοστό δημοσκόπησης.'
  };
}

/** Τα κόμματα «λοιπά» της προηγούμενης ψήφου κατανέμονται στα επιμέρους με βάση το επίσημο αποτέλεσμα και την ιδεολογική εγγύτητα. */
function resolvePrev(pv: string | null, lr: number | null, sc: VoteScenario, beta: Record<string, number>, rng: Rng): string | null {
  if (pv !== 'other') return pv;
  const keys = Object.keys(sc.otherSplit);
  if (!keys.length) return pv;
  const w = keys.map((k) => {
    const p = sc.parties.find((x) => x.key === k);
    const d = lr == null || !p ? 0 : Math.abs(lr - p.position);
    return Math.log(Math.max(sc.otherSplit[k], 1e-6)) + (beta.dist || 0) * d + (beta.dist2 || 0) * d * d;
  });
  const p = softmax(w);
  const u = rng.next();
  let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i];
    if (u < c) return keys[i];
  }
  return keys[keys.length - 1];
}

export function partyUtilities(prep: PreparedVote, prev: string | null, lr: number | null): number[] {
  const b = prep.beta;
  return prep.scenario.parties.map((p) => {
    const loyal = prev === p.key ? 1 : 0;
    const lineage = prev != null && prev !== p.key && p.lineage.includes(prev) ? 1 : 0;
    const d = lr == null ? 0 : Math.abs(lr - p.position);
    const share = p.prevShare ?? prep.scenario.newPartyPrevShare;
    return (
      (b.loyal || 0) * loyal +
      (b.lineage || 0) * lineage +
      (b.dist || 0) * d +
      (b.dist2 || 0) * d * d +
      (b.logprev || 0) * Math.log(Math.max(share, 0.1)) +
      (b.new || 0) * (p.isNew ? 1 : 0) +
      (b.incumbent || 0) * (p.incumbent ? 1 : 0) +
      (b.incumbent_loyal || 0) * (p.incumbent ? loyal : 0)
    );
  });
}

/**
 * Ψήφος ως χαρακτηριστικό του προσώπου (pie-runtime-2): οι τυχαίοι αριθμοί προέρχονται από τον σπόρο του ΠΡΟΣΩΠΟΥ
 * (κοινοί σε όλες τις εκτελέσεις), όχι της εκτέλεσης. Η κατανομή μένει ίδια· το ίδιο πρόσωπο σε μόνιμο panel δίνει την ίδια
 * ψήφο όσο δεν αλλάζει το σενάριο, και όταν αλλάζει, μετακινείται συνεκτικά (αντίστροφη συνάρτηση κατανομής με κόμματα
 * ταξινομημένα κατά θέση αριστερά→δεξιά). pie-runtime-1: νέα κλήρωση σε κάθε εκτέλεση (επανάληψη ίδιας ψήφου ~29%).
 */
export function answerVote(prep: PreparedVote, ps: PersonaState, _rng: Rng): string | null {
  const rng = createRng(hashString(`vote|${ps.pseed}`));
  const fv = featureVector(ps.demographics, ps.anchors);
  const m = prep.model;
  if (m.abstain) {
    const pa = 1 / (1 + Math.exp(-(m.abstain.a + linear(m.abstain.feats, m.abstain.means, m.abstain.b, fv))));
    if (rng.next() < pa) return prep.abstainOption;
  }
  if (m.undecided) {
    const pu = 1 / (1 + Math.exp(-(m.undecided.a + linear(m.undecided.feats, m.undecided.means, m.undecided.b, fv))));
    if (rng.next() < pu) return prep.undecidedOption;
  }
  const lr = ps.anchors.lr_none === 1 ? null : ps.anchors.lr7;
  const prev = resolvePrev(ps.anchors.pv, lr, prep.scenario, prep.beta, rng);
  const p = softmax(partyUtilities(prep, prev, lr));
  const order = p.map((_, i) => i).sort((a, b) => prep.scenario.parties[a].position - prep.scenario.parties[b].position || a - b);
  const u = rng.next();
  let c = 0;
  let k = order[order.length - 1];
  for (const i of order) {
    c += p[i];
    if (u < c) {
      k = i;
      break;
    }
  }
  return prep.optionOf.get(prep.scenario.parties[k].key) || null;
}
