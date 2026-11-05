// Viewscope v2 — Π3: ΧΩΡΙΣΤΗ παρουσίαση εθνικών πολιτικών ποσοστών και διαφορών υποομάδων.
// Οι διαφορές πολιτικών υποομάδων απέτυχαν στον προκαταχωρημένο έλεγχο (P2) → εμφανίζονται μόνο ως S «σενάριο»,
// ποτέ ως πρόβλεψη. Η κατηγορία του εθνικού ποσοστού ΔΕΝ μεταφέρεται στις υποομάδες.
import { detectDomain } from '../persona/evidence-tier';
import type { Question, QuestionAggregate } from '../types';
import { loadRoutes, isValidatedStatus, type QuestionRoute } from './routes';

export const SUBGROUP_LABEL = 'Σενάριο — μη επικυρωμένη διαφορά ομάδων (όχι πρόβλεψη)';

export interface PoliticalSplit {
  questionId: string;
  national: { class: QuestionRoute['class']; route: string | null; validated: boolean };
  subgroups: { class: 'S' | 'T' | 'E'; isForecast: boolean; label: string; route: string; segments: string[] } | null;
}

export function isPolitical(q: Question): boolean {
  return detectDomain(q) === 'POLITICAL';
}

export function politicalSplit(q: Question, r: QuestionRoute, a?: QuestionAggregate): PoliticalSplit | null {
  if (!isPolitical(q)) return null;
  const sub = loadRoutes().routes['political_subgroup'];
  const validatedSub = isValidatedStatus(sub?.validation.status);
  const segments = Object.keys(a?.bySegment || {});
  return {
    questionId: q.id,
    national: { class: r.class, route: r.route, validated: r.validated },
    subgroups: r.answerable
      ? { class: validatedSub ? (sub.class as 'S' | 'T' | 'E') : 'S', isForecast: validatedSub, label: validatedSub ? sub.label : SUBGROUP_LABEL, route: 'political_subgroup', segments }
      : null
  };
}
