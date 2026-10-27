// ============================================================
// Έρευνα Καταναλωτών ΕΕ (DG ECFIN· στην Ελλάδα ΙΟΒΕ): οικονομικό κλίμα
// ανά εισόδημα, μόρφωση, ηλικία, φύλο. Πηγή: official/ec-bcs-consumer-greece.json
// (scripts/synthetic-lab/import_ec_bcs.py). Άδεια: Ευρωπαϊκή Επιτροπή, CC BY 4.0.
//
// Οι τιμές είναι ΙΣΟΖΥΓΙΑ (θετικές μείον αρνητικές απαντήσεις), όχι ποσοστά:
// δεν γίνονται πιθανότητες απάντησης. Χρησιμοποιούνται (α) ως πλαίσιο στις
// αναφορές και (β) για ΣΧΕΤΙΚΕΣ διαφορές ομάδων σε δηλωμένη παραδοχή.
// ============================================================

import bcsJson from './official/ec-bcs-consumer-greece.json';
import type { Persona } from '../types';

interface BcsCell {
  latest: number | null;
  mean12m: number | null;
  series: Record<string, number>;
}
export interface BcsIndicator {
  id: string;
  question: string;
  label: string;
  groups: Record<string, Record<string, BcsCell>>;
}
interface BcsFile {
  datasetId: string;
  source: string;
  url: string;
  license: string;
  latestMonth: string;
  fetchedAt: string;
  unit: string;
  note: string;
  indicators: BcsIndicator[];
}

export const BCS = bcsJson as unknown as BcsFile;
export const BCS_DATASET_ID = BCS.datasetId;

export function bcsIndicator(question: string): BcsIndicator | null {
  return BCS.indicators.find((i) => i.question === question) || null;
}

const AGE: Record<string, Record<string, number>> = {
  '15-24': { '16-29': 1 },
  '25-34': { '16-29': 0.5, '30-49': 0.5 },
  '35-44': { '30-49': 1 },
  '45-54': { '30-49': 0.5, '50-64': 0.5 },
  '55-64': { '50-64': 1 },
  '65+': { '65+': 1 }
};
// ED1 πρωτοβάθμια, ED2 δευτεροβάθμια, ED3 ανώτερη
const EDU: Record<string, string | null> = {
  less_than_primary: 'low_education',
  primary: 'low_education',
  lower_secondary: 'medium_education',
  upper_secondary: 'medium_education',
  tertiary: 'high_education',
  unknown: null
};
// πεμπτημόριο GLOPOP -> τεταρτημόριο εισοδήματος (επικάλυψη διαστημάτων 20% / 25%)
const INCOME: Record<number, Record<string, number>> = {
  1: { '1': 1 },
  2: { '1': 0.25, '2': 0.75 },
  3: { '2': 0.5, '3': 0.5 },
  4: { '3': 0.75, '4': 0.25 },
  5: { '4': 1 }
};

/** Πιθανοτική συμμετοχή του προφίλ στις ομάδες της έρευνας (null για <15). */
export function bcsMembership(p: Persona): Record<string, Record<string, number>> | null {
  const age = AGE[p.ageBand];
  if (!age) return null;
  const edu = EDU[p.education];
  return {
    age_group: age,
    gender: { [p.gender]: 1 },
    ...(edu ? { education_group: { [edu]: 1 } } : {}),
    ...(p.incomeQuintile ? { income_quartile: INCOME[p.incomeQuintile] } : {})
  };
}

/**
 * Απόκλιση του προφίλ από το σύνολο σε μονάδες ισοζυγίου: άθροισμα των
 * αποκλίσεων κάθε ομάδας του (κύριες επιδράσεις· οι διαστάσεις συσχετίζονται,
 * άρα το άθροισμα είναι άνω όριο — γι' αυτό η παραδοχή το μειώνει).
 */
export function bcsDeviation(p: Persona, question = '9', stat: 'mean12m' | 'latest' = 'mean12m'): number | null {
  const ind = bcsIndicator(question);
  const m = bcsMembership(p);
  const total = ind?.groups.all?.all?.[stat];
  if (!ind || !m || total === null || total === undefined) return null;
  let dev = 0;
  for (const [dim, groups] of Object.entries(m)) {
    for (const [g, frac] of Object.entries(groups)) {
      const v = ind.groups[dim]?.[g]?.[stat];
      if (v !== null && v !== undefined) dev += frac * (v - total);
    }
  }
  return dev;
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('el-GR', { maximumFractionDigits: 1 }));

/** Σύντομη περιγραφή του κλίματος για αναφορές/προειδοποιήσεις. */
export function climateSummary(): string {
  const cof = bcsIndicator('COF');
  const q9 = bcsIndicator('9');
  const q11 = bcsIndicator('11');
  const [y, mo] = BCS.latestMonth.split('-');
  const inc = (ind: BcsIndicator | null) => ['1', '2', '3', '4'].map((k) => fmt(ind?.groups.income_quartile?.[k]?.latest)).join(' / ');
  return (
    `Οικονομικό κλίμα (Έρευνα Καταναλωτών ΕΕ/ΙΟΒΕ, ${mo}/${y}, ισοζύγια −100..+100): εμπιστοσύνη καταναλωτών ${fmt(cof?.groups.all?.all?.latest)}· ` +
    `πρόθεση μεγάλων αγορών στους επόμενους 12 μήνες ${fmt(q9?.groups.all?.all?.latest)} (τεταρτημόρια εισοδήματος χαμηλό→υψηλό: ${inc(q9)})· ` +
    `πρόθεση αποταμίευσης ${fmt(q11?.groups.all?.all?.latest)} (${inc(q11)}).`
  );
}
