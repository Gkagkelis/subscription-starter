// ============================================================
// Επικαιροποίηση / βαθμονόμηση πληθυσμού (raking / IPF).
//
// Αρχή: ο πληθυσμός 2015 ΔΕΝ βαφτίζεται 2026. Βαθμονόμηση γίνεται ΜΟΝΟ
// όταν υπάρχουν φορτωμένοι στόχοι (targets) από κατάλληλα αδειοδοτημένη
// νεότερη πηγή (π.χ. ΕΛΣΤΑΤ), με δηλωμένο έτος. Χωρίς αυτούς εμφανίζεται:
// «Η επικαιροποίηση του πληθυσμού δεν έχει ολοκληρωθεί — χρησιμοποιείται
//  ιστορικό baseline 2015».
// ============================================================

import type { Persona, PopulationUpdateStatus } from '../types';

export const BASELINE_MESSAGE =
  'Η επικαιροποίηση του πληθυσμού δεν έχει ολοκληρωθεί — χρησιμοποιείται ιστορικό baseline 2015';

export function baselineUpdateStatus(referenceYear: number): PopulationUpdateStatus {
  return {
    calibrated: false,
    targetYear: null,
    targetsDatasetIds: [],
    message: referenceYear === 2015 ? BASELINE_MESSAGE : `Η επικαιροποίηση δεν έχει ολοκληρωθεί — έτος βάσης ${referenceYear}`
  };
}

/** Χαρακτηριστικά προσώπων που επιτρέπεται να βαθμονομηθούν. */
export const CALIBRATABLE_ATTRIBUTES = ['ageBand', 'gender', 'regionCode', 'education', 'settlement', 'householdSize'] as const;
export type SimpleAttribute = (typeof CALIBRATABLE_ATTRIBUTES)[number];
/** Απλό χαρακτηριστικό ή κοινή κατανομή δύο, π.χ. "regionCode|ageBand" (κατηγορίες "GRCr101|25-34"). */
export type CalibratableAttribute = SimpleAttribute | `${SimpleAttribute}|${SimpleAttribute}`;

export function isCalibratableAttribute(a: string): a is CalibratableAttribute {
  const parts = a.split('|');
  return parts.length <= 2 && parts.every((x) => (CALIBRATABLE_ATTRIBUTES as readonly string[]).includes(x));
}

export interface MarginTarget {
  attribute: CalibratableAttribute;
  /** Κατηγορία -> πληθυσμός (ή ποσοστό· κανονικοποιείται στο σύνολο). */
  totals: Record<string, number>;
}

export interface CalibrationTargets {
  datasetId: string;
  year: number;
  source: string;
  license: string;
  margins: MarginTarget[];
}

export interface RakingResult {
  weights: number[];
  iterations: number;
  converged: boolean;
  /** Μέγιστη απόκλιση (ποσοστιαίες μονάδες) από στόχο μετά τη βαθμονόμηση. */
  maxDeviationPp: number;
  /** Αναλογία max/min βάρους — δείκτης αστάθειας. */
  weightRatio: number;
  issues: string[];
  before: Record<string, Record<string, number>>;
  after: Record<string, Record<string, number>>;
}

function attr(p: Persona, a: CalibratableAttribute): string {
  return a
    .split('|')
    .map((k) => {
      const v = p[k as SimpleAttribute];
      return v === null || v === undefined ? 'unknown' : String(v);
    })
    .join('|');
}

export function marginalShares(personas: Persona[], weights: number[], a: CalibratableAttribute): Record<string, number> {
  const out: Record<string, number> = {};
  let tot = 0;
  personas.forEach((p, i) => {
    const k = attr(p, a);
    out[k] = (out[k] || 0) + weights[i];
    tot += weights[i];
  });
  Object.keys(out).forEach((k) => (out[k] = tot > 0 ? (out[k] / tot) * 100 : 0));
  return out;
}

/**
 * Raking (iterative proportional fitting) των βαρών ώστε οι περιθωριακές
 * κατανομές να ταιριάζουν με τους στόχους. Περιορίζει τα βάρη σε [lo, hi]
 * φορές το αρχικό για να μην εκρήγνυνται.
 */
export function rake(
  personas: Persona[],
  initialWeights: number[],
  targets: MarginTarget[],
  opts: { maxIter?: number; tolerancePp?: number; bounds?: [number, number] } = {}
): RakingResult {
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tolerancePp ?? 0.05;
  const [lo, hi] = opts.bounds ?? [0.2, 5];
  const w = initialWeights.slice();
  const issues: string[] = [];
  const before: Record<string, Record<string, number>> = {};
  targets.forEach((t) => (before[t.attribute] = marginalShares(personas, w, t.attribute)));

  // Έλεγχος: κάθε κατηγορία στόχου πρέπει να υπάρχει στο δείγμα.
  targets.forEach((t) => {
    Object.keys(t.totals).forEach((cat) => {
      if (!personas.some((p) => attr(p, t.attribute) === cat) && t.totals[cat] > 0) {
        issues.push(`Η κατηγορία «${cat}» (${t.attribute}) δεν υπάρχει στο δείγμα — δεν μπορεί να βαθμονομηθεί.`);
      }
    });
  });

  let iterations = 0;
  let maxDev = Infinity;
  for (; iterations < maxIter && maxDev > tol; iterations++) {
    for (const t of targets) {
      const totW = w.reduce((s, x) => s + x, 0);
      const tTot = Object.values(t.totals).reduce((s, x) => s + x, 0);
      const cur: Record<string, number> = {};
      personas.forEach((p, i) => {
        const k = attr(p, t.attribute);
        cur[k] = (cur[k] || 0) + w[i];
      });
      personas.forEach((p, i) => {
        const k = attr(p, t.attribute);
        if (t.totals[k] === undefined || !cur[k]) return;
        const desired = (t.totals[k] / tTot) * totW;
        const f = desired / cur[k];
        w[i] = Math.min(hi * initialWeights[i], Math.max(lo * initialWeights[i], w[i] * f));
      });
    }
    maxDev = 0;
    for (const t of targets) {
      const sh = marginalShares(personas, w, t.attribute);
      const tTot = Object.values(t.totals).reduce((s, x) => s + x, 0);
      Object.keys(t.totals).forEach((k) => {
        maxDev = Math.max(maxDev, Math.abs((sh[k] || 0) - (t.totals[k] / tTot) * 100));
      });
    }
  }

  const after: Record<string, Record<string, number>> = {};
  targets.forEach((t) => (after[t.attribute] = marginalShares(personas, w, t.attribute)));
  const ratios = w.map((x, i) => x / initialWeights[i]);
  const weightRatio = Math.max(...ratios) / Math.max(1e-12, Math.min(...ratios));
  const converged = maxDev <= tol;
  if (!converged) issues.push(`Η βαθμονόμηση δεν συνέκλινε (μέγιστη απόκλιση ${maxDev.toFixed(2)} π.μ.).`);
  return { weights: w, iterations, converged, maxDeviationPp: maxDev, weightRatio, issues, before, after };
}

/** Πότε θεωρείται «επικαιροποιημένος» ο πληθυσμός για το τρέχον έτος. */
export function updateStatusFromTargets(
  referenceYear: number,
  targets: CalibrationTargets[],
  result: RakingResult | null,
  currentYear: number
): PopulationUpdateStatus {
  const recent = targets.filter((t) => t.year >= currentYear - 1);
  if (!recent.length || !result || !result.converged) return baselineUpdateStatus(referenceYear);
  const attrs = new Set(recent.flatMap((t) => t.margins.flatMap((m) => m.attribute.split('|'))));
  const year = Math.max(...recent.map((t) => t.year));
  const LABEL: Record<string, string> = { ageBand: 'ηλικία', gender: 'φύλο', regionCode: 'περιφέρεια', education: 'εκπαίδευση', settlement: 'αστική/αγροτική', householdSize: 'μέγεθος νοικοκυριού' };
  const covered = Array.from(attrs).map((a) => LABEL[a] || a).join(', ');
  const missing = CALIBRATABLE_ATTRIBUTES.filter((a) => !attrs.has(a)).map((a) => LABEL[a]);
  const partial = !(attrs.has('ageBand') && attrs.has('gender') && attrs.has('regionCode'));
  return {
    calibrated: true,
    targetYear: year,
    targetsDatasetIds: recent.map((t) => t.datasetId),
    message: `${partial ? 'Μερική βαθμονόμηση' : 'Βαθμονομημένο'} σε επίσημα στοιχεία ${year} (${covered}). ${missing.length ? `Τα υπόλοιπα χαρακτηριστικά (${missing.join(', ')}, εισόδημα, τύπος νοικοκυριού) και οι συσχετίσεις τους παραμένουν του 2015.` : 'Οι υπόλοιπες συσχετίσεις παραμένουν του 2015.'}`
  };
}
