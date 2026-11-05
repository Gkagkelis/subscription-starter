// Viewscope v2 — έλεγχος αποδοχής: 4 ΝΕΕΣ μελέτες (πολιτική, κοινωνική, οικονομική, καταναλωτική).
// Ξεκινούν από τον κανονικό planner του Lab (όπως κάθε νέα μελέτη)· ο «ερευνητής» προσθέτει τυπικές ερωτήσεις παρακολούθησης
// (ερωτηματολόγιο — ΟΧΙ αποτελέσματα). Κανένα αποτέλεσμα δεν ορίζεται εδώ.
//   tsx scripts/synthetic-lab/viewscope/acceptance_plans.ts
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { planStudy } from '../../../lib/synthetic-lab/engine/planner';
import type { Question, StudyPlan } from '../../../lib/synthetic-lab/types';

const OUT = path.resolve(__dirname, '../../../benchmarks/viewscope_v2/acceptance/plans');
const DK = 'ΔΓ/ΔΑ (αυθ.)';
const pos = ['Θετική', 'Ούτε-ούτε (αυθ.)', 'Αρνητική', DK];
function plan(text: string, domain: StudyPlan['domain'], extra: Question[], o: Partial<StudyPlan> = {}): StudyPlan {
  const r = planStudy({ text, domain, sampleSize: 1000, referenceYear: 2026, referenceMonth: 11 });
  if (!r.plan) throw new Error(`μπλοκαρισμένο σχέδιο: ${text}`);
  return { ...r.plan, questions: [...r.plan.questions, ...extra], ...o };
}
const studies: Record<string, { plan: StudyPlan; study: { org: string | null; fieldworkStart: string }; applyScenario?: boolean; label: string }> = {
  political: {
    label: 'Πολιτική — πολιτικό κλίμα Νοεμβρίου 2026 (φορέας: Metron Analysis)',
    study: { org: 'Metron Analysis', fieldworkStart: '2026-11-16' },
    plan: plan('Πολιτικό κλίμα Νοεμβρίου 2026: αξιολόγηση κυβέρνησης, πορεία της χώρας και πρόθεση ψήφου', 'political', [
      { id: 't1', type: 'single_choice', text: 'Κατά τη γνώμη σας η χώρα μας αυτή την περίοδο κινείται προς τη σωστή ή προς τη λάθος κατεύθυνση;', options: ['Προς τη σωστή', 'Προς τη λάθος', 'Ούτε-ούτε (αυθ.)', DK] },
      { id: 't2', type: 'single_choice', text: 'Ποια είναι η εντύπωση σας για το έργο της Κυβέρνησης συνολικά, θετική ή αρνητική;', options: pos },
      { id: 't3', type: 'single_choice', text: 'Ποια είναι η γνώμη σας για τον τρόπο με τον οποίο ασκεί τα καθήκοντά του μέχρι στιγμής ο Πρωθυπουργός κ. Μητσοτάκης; Θετική ή αρνητική;', options: pos },
      { id: 't4', type: 'single_choice', text: 'Τι θα λέγατε ότι χρειάζεται περισσότερο η διακυβέρνηση της χώρας σήμερα; Πολιτική σταθερότητα ή πολιτική αλλαγή;', options: ['Πολιτική σταθερότητα', 'Πολιτική αλλαγή', DK] }
    ])
  },
  social: {
    label: 'Κοινωνική — εμπιστοσύνη στους θεσμούς (τυπικός μηχανισμός του planner)',
    study: { org: null, fieldworkStart: '2026-11-16' },
    plan: plan('Εμπιστοσύνη στους θεσμούς και κοινωνική συνοχή στην Ελλάδα', 'social_policy', [
      { id: 'x1', type: 'likert', text: 'Πόσο εμπιστεύεστε τη Δικαιοσύνη;', scale: ['Πολύ', 'Αρκετά', 'Λίγο', 'Καθόλου'] },
      { id: 'x2', type: 'likert', text: 'Πόσο ικανοποιημένος/η είστε από τη ζωή σας γενικά;', scale: ['Πολύ', 'Αρκετά', 'Λίγο', 'Καθόλου'] }
    ])
  },
  social_pie: {
    label: 'Κοινωνική — ίδιο ερωτηματολόγιο με PIE pie-0.7 (χωρίς προετοιμασμένες συνδέσεις PIE)',
    study: { org: null, fieldworkStart: '2026-11-16' },
    plan: plan('Εμπιστοσύνη στους θεσμούς και κοινωνική συνοχή στην Ελλάδα', 'social_policy', [
      { id: 'x1', type: 'likert', text: 'Πόσο εμπιστεύεστε τη Δικαιοσύνη;', scale: ['Πολύ', 'Αρκετά', 'Λίγο', 'Καθόλου'] },
      { id: 'x2', type: 'likert', text: 'Πόσο ικανοποιημένος/η είστε από τη ζωή σας γενικά;', scale: ['Πολύ', 'Αρκετά', 'Λίγο', 'Καθόλου'] }
    ], { engine: 'persona', personaModelVersion: 'pie-0.7' })
  },
  economic: {
    label: 'Οικονομική — ακρίβεια και οικονομική κατάσταση νοικοκυριών (φορέας: GPO)',
    study: { org: 'GPO', fieldworkStart: '2026-11-16' },
    plan: plan('Μέτρα στήριξης για την ακρίβεια και το κόστος ζωής των νοικοκυριών', 'social_policy', [
      { id: 'e1', type: 'single_choice', text: 'Ποια από τις παρακάτω φράσεις περιγράφει καλύτερα την οικονομική σας κατάσταση:', options: ['Δεν μπορούμε να καλύψουμε ούτε τις βασικές μας ανάγκες', 'Δεν μπορούμε να καλύψουμε όλες τις ανάγκες μας, δυσκολευόμαστε πολύ', 'Καταφέρνουμε να καλύπτουμε τις ανάγκες μας με δυσκολία', 'Ζούμε άνετα αλλά δεν έχουμε δυνατότητα αποταμίευσης', 'Ζούμε άνετα και μπορούμε να αποταμιεύουμε', 'Δεν ξέρω / Δεν απαντώ'] },
      { id: 'e2', type: 'likert', text: 'Τους επόμενους 12 μήνες η οικονομική κατάσταση του νοικοκυριού σας θα είναι:', scale: ['Πολύ καλύτερη', 'Λίγο καλύτερη', 'Ίδια', 'Λίγο χειρότερη', 'Πολύ χειρότερη'] }
    ])
  },
  consumer: {
    label: 'Καταναλωτική — online αγορές ηλεκτρονικών ειδών (prod-1 + κοινός πυρήνας στα σενάρια)',
    study: { org: null, fieldworkStart: '2026-11-16' },
    applyScenario: true,
    plan: plan('Online αγορές ηλεκτρονικών ειδών και πρόθεση αγοράς τους επόμενους 6 μήνες', 'consumer', [])
  }
};
mkdirSync(OUT, { recursive: true });
for (const [k, v] of Object.entries(studies)) {
  writeFileSync(path.join(OUT, `${k}.json`), JSON.stringify({ label: v.label, study: v.study, applyScenario: !!v.applyScenario, plan: v.plan }, null, 1));
  console.log(k, v.plan.questions.length, v.plan.engine || 'standard');
}
