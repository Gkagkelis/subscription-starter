// Viewscope v2 — Π1: τρεις ΞΕΧΩΡΙΣΤΟΙ δείκτες κάλυψης (ποτέ ενωμένοι σε έναν).
//   τεχνική     = ερωτήσεις στις οποίες ο μηχανισμός δίνει απάντηση (μαζί με σενάρια S)
//   εμπειρική   = ερωτήσεις με κατηγορία E ή T (μετά τη φραγή μορφής)
//   επικυρωμένη = ερωτήσεις E/T από διαδρομή με ΜΕΤΡΗΜΕΝΟ σφάλμα σε holdout (validated / validated_historical)
import type { QuestionRoute } from './routes';

export interface CoverageReport {
  questions: number;
  technical: { n: number; share: number };
  empirical: { n: number; share: number; E: number; T: number };
  validated: { n: number; share: number; meanExpectedMAE: number | null };
  scenarioS: number;
  abstained: number;
  note: string;
}

export function coverage(rs: QuestionRoute[]): CoverageReport {
  const n = rs.length || 1;
  const tech = rs.filter((r) => r.answerable);
  const emp = tech.filter((r) => r.class === 'E' || r.class === 'T');
  const val = emp.filter((r) => r.validated);
  const maes = val.map((r) => r.expectedMAE).filter((x): x is number => typeof x === 'number');
  return {
    questions: rs.length,
    technical: { n: tech.length, share: tech.length / n },
    empirical: { n: emp.length, share: emp.length / n, E: emp.filter((r) => r.class === 'E').length, T: emp.filter((r) => r.class === 'T').length },
    validated: { n: val.length, share: val.length / n, meanExpectedMAE: maes.length ? maes.reduce((s, x) => s + x, 0) / maes.length : null },
    scenarioS: tech.filter((r) => r.class === 'S').length,
    abstained: rs.length - tech.length,
    note: 'Η τεχνική κάλυψη ΔΕΝ είναι προβλεπτική ακρίβεια· μόνο η επικυρωμένη κάλυψη συνοδεύεται από μετρημένο σφάλμα.'
  };
}
