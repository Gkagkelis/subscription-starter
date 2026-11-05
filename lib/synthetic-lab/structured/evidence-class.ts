// ============================================================
// Ενιαία κατηγορία τεκμηρίωσης E / T / S για όλους τους γρήγορους μηχανισμούς του Synthetic Lab.
//
//   E — εμπειρικά βαθμονομημένη εκτίμηση: η ίδια (ή λογικά ισοδύναμη) μέτρηση σε πραγματικά δεδομένα του πληθυσμού-στόχου.
//   T — μεταφερόμενη ή έμμεσα τεκμηριωμένη εκτίμηση: συγγενής μέτρηση, άλλη χώρα/περίοδος, όριο ή πλαίσιο από άλλη μέτρηση.
//   S — συνθετική εκτίμηση σεναρίου: ρητές παραδοχές (ή AI) χωρίς άμεση εμπειρική μέτρηση.
//   null — αποχή (καμία συνθετική απάντηση).
//
// Η αντιστοίχιση ΔΕΝ αλλάζει τη συμπεριφορά των υπαρχόντων μηχανισμών (prod-1, EGPS, PIE): μόνο ταξινομεί ό,τι ήδη καταγράφουν
// (basis / evidenceClass / evidenceTier), ώστε η αναφορά πελάτη και ο εσωτερικός φάκελος να μιλούν την ίδια γλώσσα.
// ============================================================
import type { AnswerBasis } from '../types';

export type EvidenceClass = 'E' | 'T' | 'S';
export const EVIDENCE_CLASS_VERSION = 'ets-1.0';

export const CLASS_LABEL: Record<EvidenceClass, string> = {
  E: 'Εμπειρικά τεκμηριωμένη εκτίμηση',
  T: 'Μεταφερόμενη / έμμεσα τεκμηριωμένη εκτίμηση',
  S: 'Συνθετική εκτίμηση σεναρίου'
};

/** Σήμα στην παρουσίαση πελάτη: δύο εικονίδια της Viewscope· η T δείχνεται με το βιβλίο αλλά ΠΑΝΤΑ με τη σήμανση «μεταφερόμενη». */
export const CLIENT_BADGE: Record<EvidenceClass, { icon: 'empirical_book' | 'synthetic_pc'; note: string | null }> = {
  E: { icon: 'empirical_book', note: null },
  T: { icon: 'empirical_book', note: 'μεταφερόμενη εκτίμηση' },
  S: { icon: 'synthetic_pc', note: null }
};

/** prod-1 / demo responder και κοινά answer bases. */
export function classFromBasis(b: AnswerBasis | null | undefined): EvidenceClass | null {
  switch (b) {
    case 'empirical_prior':
      return 'E';
    case 'model_extrapolated':
      return 'T';
    case 'assumption':
    case 'uninformed':
    case 'llm':
      return 'S';
    case 'persona_model':
      return 'E'; // ατομικό μοντέλο σε πραγματικά μικροδεδομένα· η ακριβής κατηγορία δίνεται από τη βαθμίδα (classFromPieTier)
    case 'not_estimable':
      return null;
    default:
      return null;
  }
}

/** EGPS: EMPIRICALLY_ANCHORED / MODEL_EXTRAPOLATED / NOT_ESTIMABLE. */
export function classFromEgps(c: string | null | undefined): EvidenceClass | null {
  if (c === 'EMPIRICALLY_ANCHORED') return 'E';
  if (c === 'MODEL_EXTRAPOLATED') return 'T';
  return null;
}

/** PIE βαθμίδες 1–5 (persona/evidence-tier.ts): 1–2 άμεση ελληνική μέτρηση, 3 διεθνής μεταφορά, 4 συγγενής/πειραματική, 5 αποχή. */
export function classFromPieTier(tier: number | null | undefined, support?: string | null): EvidenceClass | null {
  if (tier == null) return support === 'NOT_RELIABLY_ESTIMABLE' ? null : support === 'MODEL_EXTRAPOLATED' ? 'T' : support ? 'E' : null;
  if (tier <= 2) return 'E';
  if (tier <= 4) return 'T';
  return null;
}

/** ASE inference_mode (για σύγκριση με το ιστορικό ASE). */
export function classFromAseMode(mode: string | null | undefined): EvidenceClass | null {
  if (!mode) return null;
  if (mode === 'PROFILE' || mode === 'A_LAB' || mode === 'A_EMPIRICAL') return 'E';
  if (mode.startsWith('C_EVIDENCE')) return 'T';
  if (mode === 'SKIP_LOGIC') return null;
  return 'S';
}

const RANK: Record<EvidenceClass, number> = { E: 0, T: 1, S: 2 };

/**
 * Κατηγορία ερώτησης από τις κατηγορίες των απαντήσεών της: η ΑΣΘΕΝΕΣΤΕΡΗ κατηγορία που αφορά ≥ minShare των απαντήσεων
 * (συντηρητικός κανόνας: μια ερώτηση δεν δηλώνεται E αν ουσιαστικό μέρος της είναι σενάριο).
 */
export function questionClass(classes: (EvidenceClass | null)[], minShare = 0.05): { cls: EvidenceClass | null; shares: Record<EvidenceClass, number> } {
  const vals = classes.filter((c): c is EvidenceClass => !!c);
  const shares: Record<EvidenceClass, number> = { E: 0, T: 0, S: 0 };
  vals.forEach((c) => (shares[c] += 1 / vals.length));
  const present = (Object.keys(shares) as EvidenceClass[]).filter((c) => shares[c] >= minShare);
  return { cls: present.length ? present.sort((a, b) => RANK[b] - RANK[a])[0] : null, shares };
}
