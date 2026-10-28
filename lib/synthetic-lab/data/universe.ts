// ============================================================
// Πληθυσμός αναφοράς (universe) δεικτών: αυστηρή αντιστοίχιση πληθυσμών.
//
// Κάθε δείκτης μετρά ένα ποσοστό ΣΕ ΣΥΓΚΕΚΡΙΜΕΝΟ πληθυσμό: άτομα 16-74 (Έρευνα ΤΠΕ), 16+ (EU-SILC/EHIS),
// όλες τις ηλικίες, νοικοκυριά, ή υποσύνολο (π.χ. χρήστες internet). Ο συνθετικός πληθυσμός είναι άτομα 15+ σε
// ζώνες ηλικίας. Για να μη συγκρίνουμε (ή αγκυρώνουμε) διαφορετικούς πληθυσμούς:
//   - universeFraction(p): τι μέρος ενός συνθετικού προσώπου ανήκει στον πληθυσμό του δείκτη. Οι ζώνες κόβονται
//     αναλογικά (ομοιόμορφη ηλικία μέσα στη ζώνη· π.χ. 16+ → 9/10 της 15-24) και η «65+» με τον επίσημο λόγο
//     65-74 / 65+ ανά φύλο (Eurostat 2025) όταν το άνω όριο είναι 74.
//   - overallComparable(u): αν το «σύνολο» και οι μη ηλικιακές ομάδες του δείκτη μπορούν να αναπαραχθούν.
//   Νοικοκυριά, υποσύνολα και «όλες οι ηλικίες» ΔΕΝ αναπαράγονται από άτομα 15+ → δεν συγκρίνονται.
// ============================================================

import officialEdu2025 from './official/eurostat-education-2025.json';
import type { MetricUniverse } from './noraya-build';
import type { Persona } from '../types';
import { AGE_BAND_BOUNDS } from '../population/glopop-schema';

const POP65 = (officialEdu2025 as unknown as { population65: Record<string, number> }).population65 || {};
const share6574 = (sex: string) => {
  const a = POP65[`65-74|${sex}`] || 0;
  const b = POP65[`75+|${sex}`] || 0;
  return a + b > 0 ? a / (a + b) : 0.5;
};

export function universeFraction(p: Persona, u: MetricUniverse | undefined | null): number {
  if (!u || u.ageMin === null || u.ageMin === undefined) return 1;
  const [lo, hi] = AGE_BAND_BOUNDS[p.ageBand];
  if (p.ageBand === '65+') {
    if (u.ageMax === null || u.ageMax === undefined) return 1;
    if (u.ageMax < 65) return 0;
    if (u.ageMax < 75) return share6574(p.gender);
    return 1;
  }
  const a = Math.max(lo, u.ageMin);
  const b = Math.min(hi, u.ageMax ?? hi);
  return b < a ? 0 : (b - a + 1) / (hi - lo + 1);
}

/** Το «σύνολο» και οι μη ηλικιακές ομάδες αναπαράγονται από τον συνθετικό πληθυσμό (άτομα 15+); */
export function overallComparable(u: MetricUniverse | undefined | null): boolean {
  if (!u) return true;
  if (u.kind !== 'individuals') return false;
  if (u.ageMin === null || u.ageMin === undefined) return false;
  return u.ageMin >= 15 && u.ageMin <= 25;
}

/** Η ζώνη «65+» της πηγής αντιστοιχεί πλήρως στη ζώνη 65+ του συνθετικού πληθυσμού; */
export function band65Comparable(u: MetricUniverse | undefined | null): boolean {
  if (!u) return true;
  return u.band65 === '65+' && (u.ageMax === null || u.ageMax === undefined);
}

export function describeUniverse(u: MetricUniverse | undefined | null): string {
  if (!u) return 'άτομα 15+ (προεπιλογή)';
  const kind = { individuals: 'άτομα', households: 'νοικοκυριά', subpopulation: 'υποσύνολο', unknown: 'άγνωστος πληθυσμός' }[u.kind];
  const age = u.ageMin === null || u.ageMin === undefined ? '' : ` ${u.ageMin}${u.ageMax ? `-${u.ageMax}` : '+'}`;
  return `${kind}${age}${u.base ? ` (${u.base})` : ''}`;
}
