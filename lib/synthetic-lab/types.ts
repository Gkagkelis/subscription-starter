// ============================================================
// GREEK SYNTHETIC RESEARCH LAB — βασικοί τύποι
//
// Ανεξάρτητο module: δεν εξαρτάται από τη NORAYA (διαβάζει μόνο τα
// δεδομένα της μέσω adapter, χωρίς να τα αλλάζει).
//
// Κάθε τιμή που φτάνει στον χρήστη πρέπει να έχει "evidence kind":
//   observed   = μετρημένο σε πραγματική έρευνα (συγκεντρωτικά)
//   estimate   = στατιστική εκτίμηση από πραγματικά δεδομένα
//   simulation = συνθετική προσομοίωση (ΟΧΙ ανθρώπινα δεδομένα)
//   ai         = ερμηνεία από μοντέλο AI
// ============================================================

export type EvidenceKind = 'observed' | 'estimate' | 'simulation' | 'ai';

export const SIMULATED_LABEL = 'SIMULATED RESPONSE — NOT HUMAN SURVEY DATA';

// ------------------------------------------------------------
// Δεδομένα / registry
// ------------------------------------------------------------

export type DatasetKind =
  | 'aggregate_survey' // συγκεντρωτικά ποσοστά ανά ομάδα (όχι ατομικές απαντήσεις)
  | 'synthetic_population' // συνθετικός πληθυσμός (π.χ. GLOPOP-S)
  | 'calibration_targets' // περιθωριακές κατανομές για βαθμονόμηση
  | 'dev_fixture'; // τεχνητό, μόνο για development

export type UsageStatus =
  | 'used' // χρησιμοποιείται από τον μηχανισμό
  | 'validation_only' // μόνο για επικύρωση
  | 'excluded' // καταχωρημένο αλλά σκόπιμα εκτός χρήσης
  | 'not_connected'; // δεν έχει συνδεθεί (π.χ. δεν έχει γίνει import)

export type ValidationStatus = 'validated' | 'partially_validated' | 'not_validated' | 'not_applicable';

export interface DatasetMeta {
  id: string;
  name: string;
  organization: string;
  sourceUrl: string | null;
  /** Έτη ΣΥΛΛΟΓΗΣ (fieldwork), όχι δημοσίευσης. */
  collectionYears: [number, number] | null;
  /** Ημερομηνία δημοσίευσης της πηγής (αν είναι γνωστή). */
  publicationDate: string | null;
  /** Ημερομηνία εισαγωγής στο Lab. */
  importedAt: string | null;
  kind: DatasetKind;
  recordCount: number | null;
  recordUnit: string;
  variables: { name: string; description: string }[];
  weights: string;
  license: string;
  licenseVerified: boolean;
  commercialUse: 'allowed' | 'allowed_with_attribution' | 'unclear' | 'not_allowed';
  restrictions: string[];
  usage: UsageStatus;
  usageNote: string;
  validationStatus: ValidationStatus;
  /** sha256 του αρχείου πηγής (όπου υπάρχει τοπικό αρχείο). */
  sourceHash?: string | null;
  storage: string;
}

// ------------------------------------------------------------
// Πληθυσμός
// ------------------------------------------------------------

/** Ηλικιακές ζώνες όπως ορίζονται στο GLOPOP-S (στήλη AGE, κωδικοί 1-8). */
export type AgeBand = '0-4' | '5-14' | '15-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';

export type Gender = 'male' | 'female';
/** Εκπαίδευση (GLOPOP-S EDUC 1-5). */
export type Education = 'less_than_primary' | 'primary' | 'lower_secondary' | 'upper_secondary' | 'tertiary' | 'unknown';
export type Settlement = 'urban' | 'rural' | 'unknown';
export type Quintile = 1 | 2 | 3 | 4 | 5;
/** Τύπος νοικοκυριού (GLOPOP-S HHTYPE 1-8). */
export type HouseholdType =
  | 'single'
  | 'couple'
  | 'couple_with_children'
  | 'single_parent'
  | 'couple_with_relatives'
  | 'couple_with_children_and_relatives'
  | 'single_parent_with_relatives'
  | 'other'
  | 'unknown';

/** Πιθανοτικό χαρακτηριστικό: δεν είναι ετικέτα, είναι κατανομή. */
export interface ProbabilisticAttribute {
  distribution: Record<string, number>;
  basis: string;
}

export interface Persona {
  /** Σταθερό συνθετικό ID (ίδιο σε κάθε εκτέλεση για την ίδια εγγραφή). */
  id: string;
  /** Περιφέρεια (GDL code + όνομα). */
  regionCode: string;
  regionName: string;
  settlement: Settlement;
  ageBand: AgeBand;
  gender: Gender;
  education: Education;
  incomeQuintile: Quintile | null;
  wealthQuintile: Quintile | null;
  householdType: HouseholdType;
  /** Κατηγορία μεγέθους νοικοκυριού (GLOPOP-S HHSIZE_CAT): '1','2','3-4','5-6','7-10','10+'. */
  householdSize: string | null;
  /** Ρόλος στο νοικοκυριό αν υπάρχει (head/spouse/child/...). */
  householdRole: string | null;
  employment: 'unknown';
  /** Στατιστικό βάρος: πόσα άτομα του πληθυσμού αναφοράς αντιπροσωπεύει. */
  weight: number;
  /** Χαρακτηριστικά που ΔΕΝ υπάρχουν στα δεδομένα δηλώνονται ρητά. */
  unknownAttributes: string[];
  probabilistic?: Record<string, ProbabilisticAttribute>;
  provenance: {
    datasetId: string;
    sourceFile: string | null;
    sourceRecord: number | null;
    householdId: string | null;
  };
  dataVintage: number;
}

export interface PopulationSummary {
  id: string;
  name: string;
  datasetId: string;
  isDevFixture: boolean;
  referenceYear: number;
  /** Πληθυσμός που αντιπροσωπεύει το δείγμα (άθροισμα βαρών). */
  representedPopulation: number;
  sampleSize: number;
  seed: number;
  createdAt: string;
  /** Κατάσταση επικαιροποίησης στο τρέχον έτος. */
  updateStatus: PopulationUpdateStatus;
  qualityNotes: string[];
}

export interface PopulationUpdateStatus {
  calibrated: boolean;
  targetYear: number | null;
  targetsDatasetIds: string[];
  message: string;
}

export interface Population {
  summary: PopulationSummary;
  personas: Persona[];
}

/** Φίλτρο κοινού (audience) πάνω στον πληθυσμό. */
export interface AudienceFilter {
  minAge?: number;
  maxAge?: number;
  genders?: Gender[];
  regions?: string[];
  settlements?: Settlement[];
  educations?: Education[];
  incomeQuintiles?: Quintile[];
}

// ------------------------------------------------------------
// Ερωτηματολόγιο
// ------------------------------------------------------------

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'likert'
  | 'ranking'
  | 'open_ended'
  | 'concept_test'
  | 'product_comparison'
  | 'price_test';

export interface ProductOption {
  id: string;
  label: string;
  /** Τιμή σε € (αν ισχύει). */
  price?: number | null;
  description?: string;
  /** Αξία/ποιότητα 1-5 όπως την κρίνει ο ερευνητής (παραδοχή, όχι δεδομένο). */
  quality?: number | null;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  /** Για single/multiple/ranking. */
  options?: string[];
  /** Για likert/concept_test: ετικέτες κλίμακας (π.χ. 5 σημείων). */
  scale?: string[];
  /** Για product_comparison. */
  products?: ProductOption[];
  /** Για price_test: σημεία τιμής σε €. */
  pricePoints?: number[];
  /** Ακολουθεί (follow-up) άλλη ερώτηση: εμφανίζεται μόνο αν ισχύει η συνθήκη. */
  followUpOf?: { questionId: string; whenAnswerIn: string[] } | null;
  /**
   * Σύνδεση με εμπειρική μέτρηση (π.χ. NORAYA/Eurobarometer metric).
   * Μόνο τότε οι απαντήσεις έχουν εμπειρική βάση.
   */
  evidenceLink?: { datasetId: string; metric: string; positiveOption: string } | null;
  maxSelections?: number;
}

// ------------------------------------------------------------
// Παραδοχές (ρητές, επεξεργάσιμες, ορατές στην αναφορά)
// ------------------------------------------------------------

export interface Assumption {
  id: string;
  title: string;
  description: string;
  /** Η παραδοχή ΔΕΝ προκύπτει από δεδομένα του Lab — είναι επιλογή του ερευνητή. */
  source: 'researcher' | 'default_assumption' | 'data';
  enabled: boolean;
  /** 0 = καμία επίδραση, 1 = προεπιλογή, 2 = διπλάσια. */
  strength: number;
  /** Π.χ. τιμή αναφοράς σε €. */
  value?: number | null;
}

// ------------------------------------------------------------
// Μελέτες
// ------------------------------------------------------------

export type ResearchDomain = 'consumer' | 'social_policy';
export type StudyKind = 'survey' | 'focus_group' | 'scenario_comparison';
export type EngineMode = 'demo' | 'live';

export interface StudyPlan {
  domain: ResearchDomain;
  kind: StudyKind;
  title: string;
  researchQuestion: string;
  questions: Question[];
  assumptions: Assumption[];
  audience: AudienceFilter;
  sampleSize: number;
  warnings: string[];
  plannerVersion: string;
  plannerMode: 'rules' | 'ai';
}

export interface AnswerValue {
  /** Επιλογή/επιλογές, θέση likert, κατάταξη ή ελεύθερο κείμενο. */
  choice?: string;
  choices?: string[];
  scaleIndex?: number;
  ranking?: string[];
  text?: string;
  /** Για price_test: πρόθεση αγοράς ανά σημείο τιμής (0-1). */
  priceAcceptance?: Record<string, boolean>;
}

export type AnswerBasis =
  | 'empirical_prior' // βασίζεται σε εμπειρική κατανομή (π.χ. Eurobarometer)
  | 'assumption' // βασίζεται σε δηλωμένες παραδοχές του ερευνητή
  | 'uninformed' // καμία εμπειρική πληροφορία — ουδέτερη προεπιλογή
  | 'llm'; // παράχθηκε από μοντέλο AI (μη επικυρωμένο)

export interface SyntheticAnswer {
  questionId: string;
  value: AnswerValue | null;
  skipped: boolean;
  basis: AnswerBasis;
  /** Σύντομη αιτιολόγηση (template ή AI). */
  rationale?: string;
  unsupported?: boolean;
}

export interface SyntheticRespondent {
  personaId: string;
  weight: number;
  label: typeof SIMULATED_LABEL;
  answers: SyntheticAnswer[];
  /** Χρόνος/κόστος για live mode. */
  costUsd?: number;
}

export interface OptionShare {
  option: string;
  /** Σταθμισμένο ποσοστό 0-100. */
  share: number;
  ciLow: number;
  ciHigh: number;
  count: number;
}

export interface QuestionAggregate {
  questionId: string;
  type: QuestionType;
  n: number;
  effectiveN: number;
  shares?: OptionShare[];
  meanScore?: number | null;
  meanScoreCi?: [number, number] | null;
  rankingScores?: { option: string; meanRank: number; firstPlaceShare: number }[];
  priceCurve?: { price: number; acceptance: number; ciLow: number; ciHigh: number }[];
  openThemes?: { theme: string; count: number; examples: string[] }[];
  bySegment?: Record<string, { segment: string; n: number; headline: number | null }[]>;
  basisMix: Record<AnswerBasis, number>;
  evidenceKind: EvidenceKind;
}

export interface CostRecord {
  mode: EngineMode;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  capUsd: number;
  calls: number;
}

export interface StudyRun {
  id: string;
  createdAt: string;
  completedAt: string | null;
  status: 'completed' | 'failed' | 'cancelled' | 'blocked';
  plan: StudyPlan;
  populationId: string;
  populationSummary: PopulationSummary;
  engine: { mode: EngineMode; engineVersion: string; model: string | null };
  seed: number;
  respondentCount: number;
  durationMs: number;
  cost: CostRecord;
  respondents: SyntheticRespondent[];
  aggregates: QuestionAggregate[];
  warnings: string[];
  datasetsUsed: string[];
  validation: StudyValidationSummary;
  stability?: StabilityResult | null;
}

export interface StudyValidationSummary {
  status: ValidationStatus;
  message: string;
  linkedMetrics: string[];
  backtestIds: string[];
}

export interface StabilityResult {
  runs: number;
  seeds: number[];
  perQuestion: { questionId: string; option: string; mean: number; sd: number; min: number; max: number }[];
  maxSd: number;
}
