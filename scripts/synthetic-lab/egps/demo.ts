// Παράδειγμα χρήσης του πειραματικού EGPS (δεν τρέχει έρευνα· δείχνει τις τρεις κατηγορίες τεκμηρίωσης).
// Χρήση: npx tsx scripts/synthetic-lab/egps/demo.ts
import { predictMarginal, correlationMatrix, messageEffect, type EgpsItem } from '../../../lib/synthetic-lab/experimental/egps';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../../../lib/synthetic-lab/population/store';
import { lakeQuestions } from '../../../lib/synthetic-lab/data/lake';

lakeQuestions(); // φόρτωση lake
const adults = loadPopulation(CALIBRATED_POPULATION_ID)!.personas.filter((p) => !['0-4', '5-14'].includes(p.ageBand));
const ctx = { asOfYear: 2026 };
const items: EgpsItem[] = [
  { id: 'vod', text: 'Παρακολούθηση video on demand (3 μήνες)', options: ['Όχι', 'Ναι'], direct: 'lake:eurostat:isoc_ci_ac_i::86427b640b' },
  { id: 'svod_hidden', text: 'Πληρωμένη συνδρομή streaming ταινιών/σειρών — ΧΩΡΙΣ την άμεση μέτρηση (παράδειγμα μεταφοράς)', options: ['Όχι', 'Ναι'],
    related: { metrics: ['lake:eurostat:isoc_ec_ibgs::d28c77321f', 'lake:eurostat:isoc_ec_ibgs::9d0bd48c76'], rationale: 'συνδρομές streaming μουσικής και παιχνιδιών: υπο-κατηγορίες της ίδιας κατηγορίας' } },
  { id: 'cinobo_aware', text: 'Γνωρίζετε το Cinobo;', options: ['Όχι', 'Ναι'] },
  { id: 'sat', text: 'Ικανοποίηση από την πλατφόρμα (1–5)', options: ['1', '2', '3', '4', '5'], construct: { object: 'cinobo', kind: 'evaluation' } },
  { id: 'nps', text: 'Πρόθεση σύστασης (0–10)', options: Array.from({ length: 11 }, (_, i) => String(i)), construct: { object: 'cinobo', kind: 'intention' } },
  { id: 'freq', text: 'Συχνότητα θέασης στην πλατφόρμα', options: ['σπάνια', 'μηνιαία', 'εβδομαδιαία', 'καθημερινά'], construct: { object: 'cinobo', kind: 'usage' } }
];
for (const it of items) {
  const r = predictMarginal(it, adults, ctx);
  console.log(it.id.padEnd(13), r.evidenceClass.padEnd(21), r.overall ? `${r.overall.point}% [80%: ${r.overall.int80.join('–')}] [95%: ${r.overall.int95.join('–')}]` : '—', '|', r.reason);
}
const { pairs } = correlationMatrix(items);
pairs.forEach((p) => console.log('εξάρτηση', p.a, '–', p.b, p.cls, p.rho, p.status));
console.log('A/B:', messageEffect());
