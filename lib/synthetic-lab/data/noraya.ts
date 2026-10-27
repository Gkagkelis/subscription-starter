// ============================================================
// NORAYA adapter (ανάγνωση μόνο). Πηγή: noraya-priors.generated.json,
// που παράγεται από public/noraya-data/public_opinion.csv με το script
// scripts/synthetic-lab/build-noraya-priors.ts.
//
// Αντιστοίχιση χαρακτηριστικών GLOPOP-S -> ομάδες NORAYA/Eurobarometer:
//  - φύλο: άμεση.
//  - ηλικία: οι ζώνες GLOPOP (15-24, 25-34, …) δεν συμπίπτουν με τις ομάδες
//    Eurobarometer (15-17, 18-24, 25-39, 40-54, 55+). Η ζώνη 35-44 μοιράζεται
//    ΠΙΘΑΝΟΤΙΚΑ (υπόθεση ομοιόμορφης κατανομής ηλικιών: 50% 25-39, 50% 40-54)·
//    οι EB 15-17 και 18-24 συνενώνονται σε «15-24» (δεν διακρίνονται).
//  - μόρφωση: EB μετρά ηλικία ολοκλήρωσης σπουδών (≤15 / 16-19 / 20+),
//    GLOPOP επίπεδο (ISCED-like). Προσεγγιστικά: έως κατώτερη δευτεροβάθμια
//    -> low, ολοκληρωμένη δευτεροβάθμια -> medium, ανώτατη -> high.
//    Η ομάδα «ακόμη σπουδάζει» δεν αντιστοιχίζεται.
//  - επάγγελμα, οικονομική πίεση, κοινωνική τάξη: ΔΕΝ υπάρχουν στο GLOPOP-S
//    — δεν χρησιμοποιούνται (άγνωστα), δεν επινοούνται.
// ============================================================

import priorsJson from './noraya-priors.generated.json';
import ictJson from './official/eurostat-ict.json';
import silcJson from './official/eurostat-silc.json';
import type { GroupScheme, NorayaPriors, PriorCell, PriorMetric, PriorWave } from './noraya-build';
import type { AgeBand, Persona } from '../types';
import { researchDatasets, researchMetric, researchMetrics } from './research';

export const NORAYA_DATASET_ID = 'noraya-public-opinion';
export const EUROSTAT_ICT_DATASET_ID = 'eurostat-isoc-ict';
export const PRIORS = priorsJson as unknown as NorayaPriors;
const ICT = ictJson as unknown as { metrics: PriorMetric[]; source: string; license: string };
const SILC = silcJson as unknown as { metrics: PriorMetric[]; questions: OpenQuestion[]; source: string; license: string };
/** Δείκτες επίσημων ανοιχτών πηγών (Eurostat ΤΠΕ, EU-SILC). */
const ICT_METRICS: Record<string, PriorMetric> = Object.fromEntries([...(ICT.metrics || []), ...(SILC.metrics || [])].map((m) => [m.metric, m]));

/** Ερώτηση ανοιχτής πηγής με κατανομή επιλογών (π.χ. EU-SILC «τα βγάζετε πέρα;»). */
export interface OpenQuestion {
  id: string;
  text: string;
  options: string[];
  dkOptions: string[];
  optionMetrics: Record<string, string>;
  n: number;
  datasetId?: string;
}
export function openQuestions(): OpenQuestion[] {
  return (SILC.questions || []).map((q) => ({ ...q, datasetId: 'eurostat-silc' }));
}
export function silcMeta() {
  return { source: SILC.source, license: SILC.license, count: (SILC.metrics || []).length };
}

/** Διαστάσεις (Eurobarometer/NORAYA) που υπάρχουν ΚΑΙ στον πληθυσμό ΚΑΙ στα priors. */
export const LINKED_DIMENSIONS = ['age_group', 'gender', 'education_group'] as const;
export type LinkedDimension = string;

/** Διαστάσεις που χρησιμοποιεί το μοντέλο ανά σχήμα πηγής. */
export const SCHEME_DIMENSIONS: Record<GroupScheme, string[]> = {
  eurobarometer: ['age_group', 'gender', 'education_group'],
  // Eurostat ΤΠΕ: κοινή κατανομή ηλικίας × φύλου + μόρφωση (ISCED)
  eurostat_ict: ['age_gender', 'education_group'],
  // EU-SILC: κοινή κατανομή τύπος νοικοκυριού × κίνδυνος φτώχειας
  eurostat_silc: ['hh_pov'],
  // διαΝΕΟσις: ηλικία × φύλο, μόρφωση, περιφέρεια (μικροδεδομένα, υπολογισμένα τοπικά)
  dianeosis: ['age_gender', 'education_group', 'region']
};

export function metricScheme(metric: string): GroupScheme {
  return getMetric(metric)?.scheme || 'eurobarometer';
}

export const UNLINKED_DIMENSIONS: Record<string, string> = {
  occupation_group: 'Επάγγελμα: δεν υπάρχει στο GLOPOP-S.',
  financial_difficulty_group: 'Οικονομική πίεση: δεν υπάρχει στο GLOPOP-S (το εισοδηματικό πεμπτημόριο δεν είναι ισοδύναμο).',
  social_class_group: 'Αυτοπροσδιοριζόμενη κοινωνική τάξη: δεν υπάρχει στο GLOPOP-S.'
};

// Οι ομάδες EB 15-17 και 18-24 πέφτουν ΟΛΟΚΛΗΡΕΣ στη ζώνη GLOPOP 15-24, άρα
// δεν διακρίνονται στον πληθυσμό: συνενώνονται σε παράγωγη ομάδα «15-24»
// (σταθμισμένος μέσος με βάση το n). Οι 25-39/40-54 διακρίνονται (25-34 / 45-54).
export const AGE_TO_EB: Partial<Record<AgeBand, Record<string, number>>> = {
  '15-24': { '15-24': 1 },
  '25-34': { '25-39': 1 },
  '35-44': { '25-39': 0.5, '40-54': 0.5 },
  '45-54': { '40-54': 1 },
  '55-64': { '55+': 1 },
  '65+': { '55+': 1 }
};

const EDU_TO_EB: Record<string, string | null> = {
  less_than_primary: 'low_education',
  primary: 'low_education',
  lower_secondary: 'low_education',
  upper_secondary: 'medium_education',
  tertiary: 'high_education',
  unknown: null
};

// διαΝΕΟσις D3: «Α Βάθμια» / «Β Βάθμια» (γυμνάσιο ΚΑΙ λύκειο μαζί) + ΙΕΚ / ΑΕΙ-ΤΕΙ-μεταπτυχιακό.
// Άρα «low» = έως δημοτικό και η κατώτερη δευτεροβάθμια πάει στη «medium».
const EDU_TO_DN: Record<string, string | null> = {
  less_than_primary: 'low_education',
  primary: 'low_education',
  lower_secondary: 'medium_education',
  upper_secondary: 'medium_education',
  tertiary: 'high_education',
  unknown: null
};

/**
 * Τύπος νοικοκυριού GLOPOP-S -> κατηγορία EU-SILC (hhcomp). «Παιδιά» στο GLOPOP
 * μπορεί να είναι και ενήλικα· ο αριθμός εξαρτώμενων παιδιών εκτιμάται από το μέγεθος.
 * Κίνδυνος φτώχειας (κάτω από 60% του διάμεσου) ≈ χαμηλότερο εισοδηματικό πεμπτημόριο.
 */
export function silcHousehold(p: Persona): Record<string, number> | null {
  if (p.ageBand === '0-4' || p.ageBand === '5-14') return null;
  const size = p.householdSize;
  switch (p.householdType) {
    case 'single':
      return { [p.gender === 'male' ? 'M1' : 'F1']: 1 };
    case 'couple':
      return { A2: 1 };
    case 'couple_with_children':
      return size === '3-4' ? { A2_DCH1: 0.5, A2_DCH2: 0.5 } : size === '2' || size === '1' ? { A2_DCH1: 1 } : { A2_DCH_GE3: 1 };
    case 'single_parent':
      return { A1_DCH: 1 };
    case 'couple_with_relatives':
    case 'other':
      return { A_GE3: 1 };
    case 'couple_with_children_and_relatives':
    case 'single_parent_with_relatives':
      return { A_GE3_DCH: 1 };
    default:
      return null;
  }
}

/** Πιθανοτική συμμετοχή ενός προσώπου σε ομάδες ανά διάσταση, για το σχήμα της πηγής. */
export function norayaMembership(p: Persona, scheme: GroupScheme = 'eurobarometer'): Record<string, Record<string, number>> | null {
  const edu = EDU_TO_EB[p.education];
  if (scheme === 'eurostat_silc') {
    const hh = silcHousehold(p);
    if (!hh || p.incomeQuintile === null) return null;
    const pov = p.incomeQuintile === 1 ? 'below' : 'above';
    return { hh_pov: Object.fromEntries(Object.entries(hh).map(([k, f]) => [`${k}|${pov}`, f])) };
  }
  if (scheme === 'dianeosis') {
    // Δείγμα 17+: η ζώνη GLOPOP 15-24 αντιστοιχίζεται στην ομάδα 17-24 της έρευνας.
    if (p.ageBand === '0-4' || p.ageBand === '5-14') return null;
    const dn = EDU_TO_DN[p.education];
    return {
      age_gender: { [`${p.ageBand}|${p.gender}`]: 1 },
      education_group: dn ? { [dn]: 1 } : {},
      region: { [p.regionCode]: 1 }
    };
  }
  if (scheme === 'eurostat_ict') {
    // Ζώνες GLOPOP = ζώνες Eurostat (16-24 ≈ 15-24· 65+ ≈ 65-74, με προέκταση στους 75+).
    if (p.ageBand === '0-4' || p.ageBand === '5-14') return null;
    return {
      age_gender: { [`${p.ageBand}|${p.gender}`]: 1 },
      education_group: edu ? { [edu]: 1 } : {}
    };
  }
  const age = AGE_TO_EB[p.ageBand];
  if (!age) return null; // εκτός πληθυσμού έρευνας (κάτω των 15)
  return {
    age_group: age,
    gender: { [p.gender]: 1 },
    education_group: edu ? { [edu]: 1 } : {}
  };
}

/** Συνενωμένες ομάδες που δεν διακρίνονται στον πληθυσμό. */
export const MERGED_GROUPS: Record<string, Record<string, string[]>> = {
  age_group: { '15-24': ['15-17', '18-24'] }
};

/**
 * Κελιά ενός κύματος για μια διάσταση, με τις συνενωμένες ομάδες
 * (n-σταθμισμένος μέσος· ασυμβατότητα αν οποιοδήποτε μέρος είναι ασύμβατο).
 */
export function waveCells(wave: PriorWave, dim: string): Record<string, PriorCell> {
  const cells: Record<string, PriorCell> = { ...(wave.groups[dim] || {}) };
  const merges = MERGED_GROUPS[dim] || {};
  for (const [merged, parts] of Object.entries(merges)) {
    const present = parts.map((g) => cells[g]).filter(Boolean);
    parts.forEach((g) => delete cells[g]);
    if (!present.length) continue;
    const n = present.reduce((s, c) => s + c.n, 0) || present.length;
    cells[merged] = {
      value: Math.round((present.reduce((s, c) => s + c.value * c.n, 0) / n) * 100) / 100,
      n,
      confidence: present.length < parts.length ? 'partial' : present[0].confidence,
      sources: present.reduce((s, c) => s + c.sources, 0),
      inconsistent: present.some((c) => c.inconsistent) || present.length < parts.length
    };
  }
  return cells;
}

/** Όλοι οι δείκτες: ανοιχτοί (NORAYA, Eurostat) + ερευνητικής βαθμίδας αν υπάρχουν τοπικά και επιτρέπονται. */
export function listMetrics(): PriorMetric[] {
  return [...Object.values(PRIORS.metrics), ...Object.values(ICT_METRICS), ...researchMetrics()].sort((a, b) =>
    a.label.localeCompare(b.label, 'el')
  );
}

export function getMetric(metric: string): PriorMetric | null {
  return PRIORS.metrics[metric] || ICT_METRICS[metric] || researchMetric(metric) || null;
}

export function metricTier(metric: string): 'open' | 'research_only' {
  return getMetric(metric)?.tier || 'open';
}

/** Dataset προέλευσης ενός δείκτη. */
export function metricDatasetId(metric: string): string {
  return getMetric(metric)?.datasetId || NORAYA_DATASET_ID;
}

/** Σύντομη περιγραφή πηγής για prompts/αναφορές. */
export function metricSourceLabel(metric: string): string {
  const scheme = metricScheme(metric);
  if (scheme === 'eurostat_ict') return 'Έρευνα ΤΠΕ ΕΛΣΤΑΤ/Eurostat';
  if (scheme === 'eurostat_silc') return 'EU-SILC ΕΛΣΤΑΤ/Eurostat';
  if (scheme === 'dianeosis') {
    const ds = researchDatasets().find((d) => d.datasetId === getMetric(metric)?.datasetId);
    return ds ? 'διαΝΕΟσις «Τι πιστεύουν οι Έλληνες» (μόνο για έρευνα)' : 'διαΝΕΟσις (μόνο για έρευνα)';
  }
  return 'Eurobarometer (NORAYA)';
}

export function ictMeta() {
  return { source: ICT.source, license: ICT.license, count: Object.keys(ICT_METRICS).length };
}

/** Τελευταίο κύμα με συνολική τιμή ("all"). */
export function latestWave(metric: string, beforeKey?: string): PriorWave | null {
  const m = getMetric(metric);
  if (!m) return null;
  const waves = m.waves.filter((w) => w.groups.all?.all && (!beforeKey || w.key < beforeKey));
  return waves.length ? waves[waves.length - 1] : null;
}

export function waveByKey(metric: string, key: string): PriorWave | null {
  return getMetric(metric)?.waves.find((w) => w.key === key) || null;
}

export function priorsMeta() {
  return PRIORS.meta;
}
