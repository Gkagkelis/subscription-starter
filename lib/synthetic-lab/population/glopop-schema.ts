// ============================================================
// GLOPOP-S — σχήμα αρχείων και κωδικοποιήσεις (ανεξάρτητη υλοποίηση).
//
// Πηγή: Ton, M.J., et al. GLOPOP-S: global synthetic population,
//   Harvard Dataverse, doi:10.7910/DVN/KJC3RH (έκδοση 5.0, 2026-01-13).
//   Άδεια δεδομένων: CC BY 4.0 (εμπορική χρήση επιτρέπεται με αναφορά).
//   Το repository κώδικα VU-IVM/GLOPOP-S δεν έχει άδεια — ΔΕΝ αντιγράφουμε
//   κώδικα· το format (int32 LE, 15 στήλες column-major, gzip) υλοποιείται
//   ανεξάρτητα.
//
// Έτος αναφοράς: 2015. ΔΕΝ είναι πληθυσμός 2026.
// ============================================================

import type { AgeBand, Education, HouseholdType, Quintile, Settlement } from '../types';

export const GLOPOP_DATASET_ID = 'glopop-s-grc-2015';
export const GLOPOP_DOI = 'https://doi.org/10.7910/DVN/KJC3RH';
export const GLOPOP_VERSION = '5.0';
export const GLOPOP_REFERENCE_YEAR = 2015;
export const GLOPOP_ATTRIBUTION =
  'GLOPOP-S (Ton et al.), Harvard Dataverse, doi:10.7910/DVN/KJC3RH, v5.0 — CC BY 4.0. Δείγμα και κωδικοποίηση από το Greek Synthetic Research Lab.';

export const GLOPOP_COLUMNS = [
  'HID',
  'RELATE_HEAD',
  'INCOME',
  'WEALTH',
  'RURAL',
  'AGE',
  'GENDER',
  'EDUC',
  'HHTYPE',
  'HHSIZE_CAT',
  'AGRI_OWNERSHIP',
  'FLOOR',
  'WALL',
  'ROOF',
  'SOURCE'
] as const;
export type GlopopColumn = (typeof GLOPOP_COLUMNS)[number];
export const GLOPOP_NCOLS = GLOPOP_COLUMNS.length; // 15
export const GLOPOP_BYTES_PER_ROW = GLOPOP_NCOLS * 4; // int32

export interface GlopopRegion {
  code: string; // GDL code
  name: string;
  nameEl: string;
  dataverseFileId: number;
  fileBytes: number;
  /** Από τον πίνακα διαθεσιμότητας του GLOPOP-S. */
  individuals: number;
  households: number;
}

// Πίνακας: Nr_individuals_data_availability (GLOPOP-S) + Dataverse file listing.
export const GLOPOP_GREECE_REGIONS: GlopopRegion[] = [
  { code: 'GRCr101', name: 'Attiki', nameEl: 'Αττική', dataverseFileId: 10483832, fileBytes: 3850266, individuals: 3824799, households: 1479316 },
  { code: 'GRCr102', name: 'Voreio Aigaio', nameEl: 'Βόρειο Αιγαίο', dataverseFileId: 10483817, fileBytes: 341205, individuals: 293863, households: 105962 },
  { code: 'GRCr103', name: 'Notio Aigaio', nameEl: 'Νότιο Αιγαίο', dataverseFileId: 10483982, fileBytes: 229577, individuals: 183667, households: 67000 },
  { code: 'GRCr104', name: 'Kriti', nameEl: 'Κρήτη', dataverseFileId: 10484011, fileBytes: 622114, individuals: 612121, households: 217973 },
  { code: 'GRCr105', name: 'Anatoliki Makedonia, Thraki', nameEl: 'Ανατολική Μακεδονία & Θράκη', dataverseFileId: 10484010, fileBytes: 643169, individuals: 597092, households: 241221 },
  { code: 'GRCr106', name: 'Kentriki Makedonia', nameEl: 'Κεντρική Μακεδονία', dataverseFileId: 10483938, fileBytes: 1841059, individuals: 1869381, households: 754181 },
  { code: 'GRCr107', name: 'Dytiki Makedonia', nameEl: 'Δυτική Μακεδονία', dataverseFileId: 10483846, fileBytes: 320995, individuals: 277658, households: 112244 },
  { code: 'GRCr108', name: 'Ipeiros', nameEl: 'Ήπειρος', dataverseFileId: 10483860, fileBytes: 388322, individuals: 340347, households: 137854 },
  { code: 'GRCr109', name: 'Thessalia', nameEl: 'Θεσσαλία', dataverseFileId: 10483826, fileBytes: 777559, individuals: 718561, households: 287662 },
  { code: 'GRCr110', name: 'Ionia Nisia', nameEl: 'Ιόνια Νησιά', dataverseFileId: 10483928, fileBytes: 239270, individuals: 194755, households: 77975 },
  { code: 'GRCr111', name: 'Dytiki Ellada', nameEl: 'Δυτική Ελλάδα', dataverseFileId: 10483850, fileBytes: 705732, individuals: 644688, households: 258058 },
  { code: 'GRCr112', name: 'Sterea Ellada', nameEl: 'Στερεά Ελλάδα', dataverseFileId: 10483954, fileBytes: 578110, individuals: 521534, households: 208632 },
  { code: 'GRCr113', name: 'Peloponnisos', nameEl: 'Πελοπόννησος', dataverseFileId: 10483980, fileBytes: 602036, individuals: 547276, households: 218916 }
];

export const GLOPOP_GREECE_TOTALS = { individuals: 10625742, households: 4166994, regions: 13 };

export const GLOPOP_KNOWN_ISSUES = [
  'Οι πληθυσμοί Βορείου Αιγαίου (GRCr102: 293.863) και Νοτίου Αιγαίου (GRCr103: 183.667) φαίνεται να είναι αντεστραμμένοι στην πηγή (GHS-based κατανομή)· άλλες σειρές (GDL 2015, ΕΛΣΤΑΤ 2011) δίνουν περίπου 199 χιλ. και 309 χιλ. αντίστοιχα. Δεν διορθώνεται αυτόματα — τα περιφερειακά βάρη των δύο περιφερειών πρέπει να διαβάζονται με επιφύλαξη.',
  'Ο πλούτος (WEALTH) δεν είναι διαθέσιμος για την Ελλάδα (κωδικός −1).',
  'Δεν υπάρχει μεταβλητή απασχόλησης/επαγγέλματος.',
  'Η ηλικία είναι σε ζώνες (0-4, 5-14, 15-24, …, 65+)· δεν μπορεί να διαχωριστεί το 18+ με ακρίβεια.',
  'Έτος αναφοράς 2015 (LIS) — δεν αντιπροσωπεύει τον πληθυσμό του 2026.'
];

export function dataverseUrl(fileId: number): string {
  return `https://dataverse.harvard.edu/api/access/datafile/${fileId}`;
}

export const AGE_CODES: Record<number, AgeBand> = {
  1: '0-4',
  2: '5-14',
  3: '15-24',
  4: '25-34',
  5: '35-44',
  6: '45-54',
  7: '55-64',
  8: '65+'
};

export const AGE_BAND_BOUNDS: Record<AgeBand, [number, number]> = {
  '0-4': [0, 4],
  '5-14': [5, 14],
  '15-24': [15, 24],
  '25-34': [25, 34],
  '35-44': [35, 44],
  '45-54': [45, 54],
  '55-64': [55, 64],
  '65+': [65, 120]
};

export const EDUC_CODES: Record<number, Education> = {
  1: 'less_than_primary',
  2: 'primary',
  3: 'lower_secondary',
  4: 'upper_secondary',
  5: 'tertiary'
};

export const HHTYPE_CODES: Record<number, HouseholdType> = {
  1: 'single',
  2: 'couple',
  3: 'couple_with_children',
  4: 'single_parent',
  5: 'couple_with_relatives',
  6: 'couple_with_children_and_relatives',
  7: 'single_parent_with_relatives',
  8: 'other'
};

export const HHSIZE_CODES: Record<number, string> = { 1: '1', 2: '2', 3: '3-4', 4: '5-6', 5: '7-10', 6: '10+' };

export const RELATE_CODES: Record<number, string> = {
  1: 'head',
  2: 'partner',
  3: 'child',
  4: 'relative',
  5: 'non_relative'
};

export function decodeQuintile(v: number): Quintile | null {
  return v >= 1 && v <= 5 ? (v as Quintile) : null;
}

export function decodeSettlement(v: number): Settlement {
  return v === 1 ? 'rural' : v === 0 ? 'urban' : 'unknown';
}

/** Γραμμή GLOPOP σε ακατέργαστους κωδικούς. */
export type GlopopRow = Record<GlopopColumn, number>;
