// Βοηθητικά για ερωτήσεις με εμπειρική σύνδεση (δυαδική ή ανά επιλογή).

import { latestWaveFor, type EvidenceContext } from '../data/noraya';
import type { Question } from '../types';
import type { PriorFit } from './prior-model';

/** Όλοι οι δείκτες που χρειάζεται μια ερώτηση (κύριος + ανά επιλογή). */
export function questionMetrics(q: Question): string[] {
  if (!q.evidenceLink) return [];
  return Array.from(new Set([q.evidenceLink.metric, ...Object.values(q.evidenceLink.optionMetrics || {})]));
}

/**
 * Κατανομή πιθανοτήτων επιλογών για ένα πρόσωπο: κάθε επιλογή έχει δικό της
 * fit (ποσοστό που την επιλέγει ανά ομάδα)· οι p κανονικοποιούνται ώστε να
 * αθροίζουν σε 1 (τα ξεχωριστά μοντέλα δεν το εγγυώνται). null αν λείπει fit.
 */
export function optionProbabilities(q: Question, fits: Record<string, PriorFit>, personaId: string): { option: string; p: number }[] | null {
  const om = q.evidenceLink?.optionMetrics;
  if (!om) return null;
  const rows: { option: string; p: number }[] = [];
  for (const option of q.options || Object.keys(om)) {
    const metric = om[option];
    if (!metric) continue;
    const p = fits[metric]?.p.get(personaId);
    if (p === undefined) return null;
    rows.push({ option, p });
  }
  const total = rows.reduce((s, r) => s + r.p, 0);
  if (!rows.length || total <= 0) return null;
  return rows.map((r) => ({ option: r.option, p: r.p / total }));
}

/** Παρατηρημένη συνολική κατανομή της πηγής (τελευταίο κύμα) για ερώτηση ανά επιλογή. */
export function observedDistribution(q: Question, ctx: EvidenceContext = {}): { option: string; value: number; n: number; waveKey: string }[] {
  const om = q.evidenceLink?.optionMetrics;
  if (!om) return [];
  return Object.entries(om)
    .map(([option, metric]) => {
      const w = latestWaveFor(metric, ctx).wave;
      const c = w?.groups.all?.all;
      return c && w ? { option, value: c.value, n: c.n, waveKey: w.key } : null;
    })
    .filter((x): x is { option: string; value: number; n: number; waveKey: string } => !!x);
}
