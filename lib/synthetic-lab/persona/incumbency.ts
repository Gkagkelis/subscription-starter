// ============================================================
// PHASE3 E3: αντιστοίχιση με επίγνωση κυβερνητικής περιόδου.
// Ερωτήσεις αξιολόγησης κυβέρνησης/πρωθυπουργού έχουν σχέση με κόμμα και ιδεολογία που ΑΝΤΙΣΤΡΕΦΕΤΑΙ όταν αλλάζει το
// κυβερνών κόμμα (π.χ. διαΝΕΟσις 12/2017 υπό ΣΥΡΙΖΑ: lr ≈ 0 · 12/2023 υπό ΝΔ: lr > 0). Ένα item μετρημένο υπό άλλο
// κυβερνών κόμμα από τον μήνα αναφοράς δεν θεωρείται άμεση στήριξη: γίνεται MODEL_EXTRAPOLATED με ρητή προειδοποίηση,
// και η αυτόματη αντιστοίχιση προτιμά item της ίδιας περιόδου. Περίοδοι: config/synthetic-lab/persona/incumbents.json (γεγονότα).
// ============================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';

interface Period { from: string; to: string; party: string | null; side: string | null }

let PERIODS: Period[] | null = null;
function periods(): Period[] {
  if (PERIODS) return PERIODS;
  const f = path.join(process.cwd(), 'config', 'synthetic-lab', 'persona', 'incumbents.json');
  PERIODS = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')).periods as Period[]) : [];
  return PERIODS;
}

export function incumbentAt(month: string): string | null {
  const p = periods().find((x) => x.from <= month && month < x.to);
  return p ? p.party : null;
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GOV_RX = /κυβερνησ|πρωθυπουργ|government|prime minister|cabinet/;

export function isGovernmentEvaluation(text: string): boolean {
  return GOV_RX.test(strip(text));
}

/** Διαφορετικό κυβερνών κόμμα ανάμεσα στο κύμα του item και στον μήνα αναφοράς (μόνο για ερωτήσεις κυβέρνησης/πρωθυπουργού). */
export function incumbencyMismatch(itemText: string, itemWave: string, referenceMonth: string): { itemParty: string | null; refParty: string | null } | null {
  if (!isGovernmentEvaluation(itemText)) return null;
  const a = incumbentAt(itemWave);
  const b = incumbentAt(referenceMonth);
  // ίδιο κόμμα → καμία ασυμφωνία· άγνωστη/υπηρεσιακή περίοδος σε μία από τις δύο → θεωρείται ασυμφωνία (συντηρητικά)
  return a && a === b ? null : { itemParty: a, refParty: b };
}
