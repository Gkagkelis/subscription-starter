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
import type { NorayaPriors, PriorCell, PriorMetric, PriorWave } from './noraya-build';
import type { AgeBand, Persona } from '../types';

export const NORAYA_DATASET_ID = 'noraya-public-opinion';
export const PRIORS = priorsJson as unknown as NorayaPriors;

/** Διαστάσεις που υπάρχουν ΚΑΙ στον πληθυσμό ΚΑΙ στα priors. */
export const LINKED_DIMENSIONS = ['age_group', 'gender', 'education_group'] as const;
export type LinkedDimension = (typeof LINKED_DIMENSIONS)[number];

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

/** Πιθανοτική συμμετοχή ενός προσώπου σε ομάδες NORAYA ανά διάσταση. */
export function norayaMembership(p: Persona): Record<LinkedDimension, Record<string, number>> | null {
  const age = AGE_TO_EB[p.ageBand];
  if (!age) return null; // εκτός πληθυσμού έρευνας (κάτω των 15)
  const edu = EDU_TO_EB[p.education];
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
    const n = present.reduce((s, c) => s + c.n, 0);
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

export function listMetrics(): PriorMetric[] {
  return Object.values(PRIORS.metrics).sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

export function getMetric(metric: string): PriorMetric | null {
  return PRIORS.metrics[metric] || null;
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
