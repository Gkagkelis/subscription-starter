// ============================================================
// Ρυθμίσεις μοντέλου (ModelConfig).
//
// Η ΠΑΡΑΓΩΓΙΚΗ έκδοση (PRODUCTION_MODEL) αναπαράγει ακριβώς τη συμπεριφορά
// του engine πριν από την εισαγωγή των ρυθμίσεων. Πειραματικές εκδόσεις
// δημιουργούνται και αξιολογούνται από το benchmark (lib/synthetic-lab/benchmark)
// και ΔΕΝ εφαρμόζονται στην εφαρμογή χωρίς ρητή προαγωγή (promote) μετά από
// αποδεδειγμένη βελτίωση στο validation και στο ανεξάρτητο final holdout.
// ============================================================

import type { ForecastConfig } from './forecast';

export interface ModelConfig {
  /** Αναγνωριστικό έκδοσης (π.χ. prod-1, exp-2026-10-28-a). */
  version: string;
  label: string;
  /**
   * Συρρίκνωση των στόχων ομάδων προς το συνολικό ποσοστό (σε «ισοδύναμους ερωτώμενους»):
   * στόχος = (n·p_ομάδας + k·p_συνόλου)/(n + k). 0 = καμία (παραγωγή).
   */
  shrinkage: number;
  /**
   * Πολιτική κύματος τεκμηρίωσης:
   *  - last: το τελευταίο επιτρεπτό κύμα (παραγωγή)·
   *  - pool: σταθμισμένος συνδυασμός έως `poolMaxWaves` επιτρεπτών κυμάτων με βάρη n·0.5^(Δέτη/halfLife).
   */
  wavePolicy: 'last' | 'pool' | 'forecast';
  /**
   * forecast (φάση 2.2): το κύμα τεκμηρίωσης είναι ΠΡΟΒΛΕΨΗ για το έτος της μελέτης από όλα τα προγενέστερα κύματα
   * (engine/forecast.ts), με ρυθμίσεις ανά οικογένεια πηγών επιλεγμένες στο calibration.
   */
  forecast?: { default: ForecastConfig; byFamily?: Record<string, ForecastConfig> };
  poolMaxWaves?: number;
  poolHalfLifeYears?: number;
  /**
   * Βάρη συνθετικών ερωτώμενων:
   *  - region_srs: απλή τυχαία επιλογή μέσα στην περιφέρεια, ίσα βάρη (παραγωγή — αγνοεί τη βαθμονόμηση ηλικίας/μόρφωσης)·
   *  - persona_weight: τα βάρη βαθμονόμησης του προσώπου μεταφέρονται στον ερωτώμενο (εκτιμητής Hájek ανά περιφέρεια).
   */
  respondentWeighting: 'region_srs' | 'persona_weight' | 'pps';
  /**
   * Πληθυσμός για έτος αναφοράς:
   *  - rule: κανόνας παραγωγής (baseline 2015 πριν από το 2025, αλλιώς βαθμονομημένος 2025)·
   *  - year_raked: baseline 2015 βαθμονομημένος στα επίσημα ηλικία×φύλο ΤΟΥ ΙΔΙΟΥ έτους (Eurostat demo_pjangroup) — χωρίς μελλοντικά δεδομένα.
   */
  population: 'rule' | 'year_raked';
  /**
   * Διαστάσεις του prior-model ανά σχήμα πηγής (παράκαμψη του SCHEME_DIMENSIONS)· χρησιμοποιείται σε
   * διαγνωστικά πειράματα (ablations). Απουσία = διαστάσεις παραγωγής.
   */
  dimensions?: Partial<Record<string, string[]>>;
  /**
   * Λανθάνον χαρακτηριστικό ανά «συστοιχία» ερωτήσεων (ίδιο ερωτηματολογικό μπλοκ, π.χ. Q10_1…Q10_9):
   * οι απαντήσεις ενός προσώπου στη συστοιχία μοιράζονται έναν κοινό παράγοντα (Gaussian copula με συσχέτιση ρ).
   * Τα ποσοστά ανά ερώτηση ΔΕΝ αλλάζουν· αλλάζει μόνο η συσχέτιση μεταξύ ερωτήσεων. 0 = ανεξάρτητες (παραγωγή).
   */
  batteryRho?: number;
  /**
   * Μεταφορά δομής ομάδων: όταν η πιο πρόσφατη συμβατή έρευνα δεν έχει διασπάσεις (φύλο/ηλικία/μόρφωση),
   * οι διαφορές ομάδων λαμβάνονται από την πιο πρόσφατη προγενέστερη με διασπάσεις, μετατοπισμένες στο νέο επίπεδο.
   */
  structureTransfer?: boolean;
  /**
   * Αγκύρωση επιπέδου: μετά το fit των ομάδων, το σταθμισμένο σύνολο στον πληθυσμό εξισώνεται με το παρατηρημένο σύνολο
   * της πηγής (οι διαφορές ομάδων διατηρούνται). Αντιμετωπίζει ασυμβατότητα σύνθεσης πληθυσμού/δείγματος.
   */
  anchorOverall?: boolean;
  /**
   * Αυστηρή αντιστοίχιση πληθυσμών (φάση 2.1B): το fit και η αγκύρωση γίνονται μόνο στο μέρος του συνθετικού
   * πληθυσμού που ανήκει στον πληθυσμό αναφοράς του δείκτη (π.χ. 16-74 για την Έρευνα ΤΠΕ) — data/universe.ts.
   */
  universeMatching?: boolean;
  /**
   * Φάση 2.4: φορτίσεις λανθανόντων παραγόντων ανά ερώτηση (αλυσίδα διαΝΕΟσις), εκτιμημένες ΜΟΝΟ από μικροδεδομένα κυμάτων
   * πριν από το έτος αξιολόγησης (fittedOnYears). Για ερωτήσεις χωρίς φορτίσεις ισχύει το batteryRho.
   */
  itemFactors?: { K: number; fittedOnYears: number[]; loadings: Record<string, number[]> };
  /**
   * Ακριβής αντιστοίχιση ερώτησης στην ανάκτηση τεκμηρίωσης: προηγείται η ίδια κανονικοποιημένη διατύπωση (μαζί με την
   * ετικέτα υπο-ερώτησης συστοιχίας). Εντοπίστηκε στο holdout2 — αξιολογείται μόνο στο validation (μη επιβεβαιωμένο).
   */
  exactQuestionMatch?: boolean;
  /** Ελεύθερες σημειώσεις/τεκμηρίωση αλλαγών. */
  notes?: string[];
  /** Προέλευση: από ποια έκδοση και ποιο πείραμα προέκυψε. */
  parent?: string | null;
}

export const PRODUCTION_MODEL: ModelConfig = {
  version: 'prod-1',
  label: 'Παραγωγική έκδοση (mc-logit-1.1, τελευταίο κύμα, χωρίς συρρίκνωση, δειγματοληψία ανά περιφέρεια)',
  shrinkage: 0,
  wavePolicy: 'last',
  respondentWeighting: 'region_srs',
  population: 'rule',
  parent: null
};

export function describeModel(c: ModelConfig): string {
  return [
    `συρρίκνωση k=${c.shrinkage}`,
    c.wavePolicy === 'pool'
      ? `συνδυασμός έως ${c.poolMaxWaves ?? 3} κυμάτων (half-life ${c.poolHalfLifeYears ?? 2} έτη)`
      : c.wavePolicy === 'forecast'
        ? `χρονική πρόβλεψη (${Array.from(new Set([c.forecast?.default.params.method, ...Object.values(c.forecast?.byFamily || {}).map((f) => f.params.method)])).join('/')}${c.forecast?.default.decompose || Object.values(c.forecast?.byFamily || {}).some((f) => f.decompose) ? ', επίπεδο + επιδράσεις ομάδων' : ''})`
        : 'τελευταίο κύμα',
    c.respondentWeighting === 'persona_weight' ? 'βάρη βαθμονόμησης στους ερωτώμενους' : c.respondentWeighting === 'pps' ? 'επιλογή ανάλογη του βάρους (PPS)' : 'ίσα βάρη ανά περιφέρεια',
    c.population === 'year_raked' ? 'πληθυσμός βαθμονομημένος στο έτος αναφοράς' : 'πληθυσμός κατά τον κανόνα παραγωγής',
    ...(c.anchorOverall ? ['αγκύρωση επιπέδου'] : []),
    ...(c.structureTransfer ? ['μεταφορά δομής ομάδων'] : []),
    ...(c.batteryRho ? [`λανθάνων παράγοντας συστοιχίας ρ=${c.batteryRho}`] : []),
    ...(c.universeMatching ? ['αντιστοίχιση πληθυσμού αναφοράς'] : []),
    ...(c.exactQuestionMatch ? ['ακριβής αντιστοίχιση ερώτησης'] : []),
    ...(c.itemFactors ? [`παράγοντες ερωτήσεων K=${c.itemFactors.K} (μικροδεδομένα ${c.itemFactors.fittedOnYears.join(', ')})`] : [])
  ].join(' · ');
}
