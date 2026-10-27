// ============================================================
// Ρητές παραδοχές του demo μοντέλου απαντήσεων.
//
// Καμία από αυτές ΔΕΝ προκύπτει από δεδομένα του Lab. Είναι επιλογές του
// ερευνητή, εμφανίζονται στο Βήμα 4 του wizard και στην αναφορά, και
// μπορούν να απενεργοποιηθούν. Όταν όλες είναι ανενεργές, οι απαντήσεις
// χωρίς εμπειρική σύνδεση είναι «ουδέτερες» (uninformed).
// ============================================================

import type { Assumption, ResearchDomain } from '../types';
import { BCS, bcsIndicator } from '../data/ec-bcs';

export const ASSUMPTION_IDS = {
  priceIncome: 'price_sensitivity_by_income',
  referencePrice: 'reference_price',
  wtpDispersion: 'wtp_dispersion',
  ageNovelty: 'age_novelty_openness',
  salienceSupport: 'salience_support_link',
  statusQuo: 'status_quo_preference',
  behaviourInterest: 'behaviour_interest_link',
  consumerClimate: 'consumer_climate_link'
} as const;

/** Παραδοχή: ενδιαφέρον/πρόθεση συνδέεται με σχετική μετρημένη συμπεριφορά (π.χ. συνδρομή streaming). */
export function behaviourAssumption(metric: string, label: string): Assumption {
  return {
    id: ASSUMPTION_IDS.behaviourInterest,
    title: `Ενδιαφέρον ανάλογο με τη σχετική συμπεριφορά: «${label}»`,
    description:
      'Όσοι, σύμφωνα με την Έρευνα ΤΠΕ ΕΛΣΤΑΤ/Eurostat, έχουν μεγαλύτερη πιθανότητα να έχουν τη σχετική συμπεριφορά (ανά ηλικία, φύλο, μόρφωση) δείχνουν μεγαλύτερο ενδιαφέρον. Η συμπεριφορά είναι μετρημένη· η ΣΥΝΔΕΣΗ της με το ενδιαφέρον για το νέο προϊόν είναι παραδοχή.',
    source: 'default_assumption',
    enabled: true,
    strength: 1,
    metric
  };
}

export function defaultAssumptions(domain: ResearchDomain, referencePrice?: number | null): Assumption[] {
  const q11 = bcsIndicator('11')?.groups.income_quartile;
  const q9 = bcsIndicator('9')?.groups;
  const [y, mo] = BCS.latestMonth.split('-');
  const consumer: Assumption[] = [
    {
      id: ASSUMPTION_IDS.priceIncome,
      title: 'Ευαισθησία στην τιμή ανά εισόδημα',
      description: `Τα χαμηλότερα εισοδηματικά πεμπτημόρια (GLOPOP-S) αντιδρούν εντονότερα στην τιμή. Οικονομική παραδοχή — η ΙΣΧΥΣ της δεν έχει εκτιμηθεί από ελληνικά δεδομένα. Ενδεικτικό τεκμήριο (Έρευνα Καταναλωτών ΕΕ/ΙΟΒΕ, ${mo}/${y}): ισοζύγιο αποταμίευσης χαμηλότερο→υψηλότερο τεταρτημόριο ${q11?.['1']?.latest ?? '—'} → ${q11?.['4']?.latest ?? '—'}.`,
      source: 'default_assumption',
      enabled: true,
      strength: 1
    },
    {
      id: ASSUMPTION_IDS.referencePrice,
      title: 'Τιμή αναφοράς αγοράς (€)',
      description:
        'Η τιμή που θεωρείς «συνηθισμένη» για αντίστοιχο προϊόν/υπηρεσία. Η προθυμία πληρωμής των συνθετικών προφίλ κατανέμεται γύρω από αυτή. Δώσε την από πραγματική έρευνα αγοράς αν υπάρχει.',
      source: 'researcher',
      enabled: true,
      strength: 1,
      value: referencePrice ?? null
    },
    {
      id: ASSUMPTION_IDS.wtpDispersion,
      title: 'Διασπορά προθυμίας πληρωμής',
      description: 'Πόσο διαφέρουν μεταξύ τους τα προφίλ στην προθυμία πληρωμής (1 = ±25% περίπου).',
      source: 'default_assumption',
      enabled: true,
      strength: 1
    },
    {
      id: ASSUMPTION_IDS.consumerClimate,
      title: 'Πρόθεση αγοράς ανάλογη με το οικονομικό κλίμα της ομάδας',
      description: `Οι διαφορές μεταξύ ομάδων (εισόδημα, μόρφωση, ηλικία, φύλο) στην πρόθεση μεγάλων αγορών είναι ΜΕΤΡΗΜΕΝΕΣ (Έρευνα Καταναλωτών ΕΕ/ΙΟΒΕ, μέσος όρος 12 μηνών έως ${mo}/${y}· σύνολο ${q9?.all?.all?.mean12m ?? '—'}). Η μεταφορά τους στο ενδιαφέρον για το συγκεκριμένο προϊόν είναι παραδοχή: 10 μονάδες ισοζυγίου ≈ 0,1 τυπική απόκλιση στη λανθάνουσα διάθεση (ισχύς 1).`,
      source: 'data',
      enabled: true,
      strength: 1
    },
    {
      id: ASSUMPTION_IDS.ageNovelty,
      title: 'Νεότερες ηλικίες πιο ανοιχτές σε νέα προϊόντα',
      description:
        'Μετατοπίζει ελαφρά το ενδιαφέρον υπέρ των 15-34 και κατά των 65+. Απενεργοποιημένη: είναι γενίκευση που μπορεί να αναπαράγει στερεότυπα.',
      source: 'default_assumption',
      enabled: false,
      strength: 1
    }
  ];
  const policy: Assumption[] = [
    {
      id: ASSUMPTION_IDS.salienceSupport,
      title: 'Όσοι θεωρούν το θέμα σημαντικό στηρίζουν περισσότερο σχετικά μέτρα',
      description:
        'Συνδέει την (εμπειρικά εκτιμώμενη) σημασία του θέματος με τη στήριξη στο μέτρο. Η σύνδεση αυτή ΔΕΝ έχει μετρηθεί — είναι υπόθεση.',
      source: 'default_assumption',
      enabled: false,
      strength: 1
    },
    {
      id: ASSUMPTION_IDS.statusQuo,
      title: 'Προτίμηση στην υπάρχουσα κατάσταση',
      description: 'Ελαφρά μετατόπιση προς ουδέτερες/αρνητικές απαντήσεις για αλλαγές πολιτικής. Απενεργοποιημένη από προεπιλογή.',
      source: 'default_assumption',
      enabled: false,
      strength: 1
    }
  ];
  return domain === 'consumer' ? consumer : policy;
}

export function getAssumption(list: Assumption[], id: string): Assumption | null {
  const a = list.find((x) => x.id === id);
  return a && a.enabled && a.strength > 0 ? a : null;
}
