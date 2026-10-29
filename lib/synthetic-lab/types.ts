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
  /** Βαθμίδα πρόσβασης/άδειας. */
  tier?: DataTier;
  /** Βήματα για σύνδεση (για πηγές που απαιτούν εγγραφή ή λήψη). */
  howToConnect?: string;
}

/**
 * open: ανοιχτή άδεια, μέσα στο Lab · research_only: μόνο μη εμπορική έρευνα (ιδιωτικά, εκτός repo)
 * registration: δωρεάν με εγγραφή (ο χρήστης κατεβάζει) · cite_only: δημοσιευμένα νούμερα μόνο για σύγκριση/αναφορά
 * paid: συνδρομητικά/εμπορικά
 */
export type DataTier = 'open' | 'research_only' | 'registration' | 'cite_only' | 'paid';

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
   * optionMetrics: για ερωτήσεις πολλών επιλογών, δείκτης ανά επιλογή
   * (ποσοστό που επιλέγει την επιλογή)· οι πιθανότητες κανονικοποιούνται.
   */
  evidenceLink?: { datasetId: string; metric: string; positiveOption: string; optionMetrics?: Record<string, string> } | null;
  maxSelections?: number;
  /**
   * EGPS (μηχανισμός «Τεκμηριωμένη πρόβλεψη»): συγγενικοί δείκτες της ίδιας κατηγορίας για μεταβλητή χωρίς άμεση μέτρηση
   * (π.χ. άλλες υπο-κατηγορίες). Δυαδικές ερωτήσεις· η τελευταία επιλογή = «θετική».
   */
  relatedEvidence?: { metrics: string[]; rationale: string } | null;
  /** EGPS: σύνδεση με το μητρώο μαρκών (μέτρηση μάρκας, ή πρόβλεψη από άλλες μάρκες της κατηγορίας αν έχει επικυρωθεί). */
  brandLink?: { category: string; brand: string; measure: string } | null;
  /** EGPS: για πολλαπλή επιλογή μαρκών — κάθε επιλογή αντιστοιχεί σε μάρκα της κατηγορίας. */
  brandOptions?: { category: string; measure: string; brands: Record<string, string> } | null;
  /** EGPS: τι μετρά η ερώτηση (για τη δομή εξαρτήσεων μεταξύ απαντήσεων). Επιλογές με σειρά «χαμηλό → υψηλό». */
  construct?: { object: string; kind: ConstructKind } | null;
  /** EGPS: ρητή ασθενής παραδοχή του ερευνητή (πιθανότητα ανά επιλογή) — δίνει ΜΟΝΟ σενάριο με ευρύ διάστημα. */
  scenarioPrior?: { probs: number[]; rationale: string } | null;
  /** PIE (Persona Intelligence Engine): σύνδεση με ερώτηση που μετρήθηκε σε πραγματικά μικροδεδομένα του μοντέλου. */
  personaLink?: PersonaLink | null;
}

/**
 * Σύνδεση ερώτησης με item του μοντέλου PIE.
 *  direct     ίδια ερώτηση και επιλογές
 *  collapsed  ίδια ερώτηση· επιλογές της πηγής συγχωνεύονται (η διάσπαση κατηγορίας ΔΕΝ επιτρέπεται)
 *  equivalent συγγενική διατύπωση με ρητή παραδοχή ισοδυναμίας (→ MODEL_EXTRAPOLATED)
 */
export interface PersonaLink {
  itemId?: string | null;
  family?: string | null;
  optionMap: Record<string, string[]>;
  dkOption?: string | null;
  kind: 'direct' | 'collapsed' | 'equivalent';
  assumption?: string | null;
  /** Πολλαπλή επιλογή: κάθε επιλογή απαντιέται από δικό της δυαδικό item (κωδικός «ναι»). */
  optionItems?: Record<string, { itemId: string; yesCode: string }> | null;
  /** Απάντηση από άγκυρα του προσώπου (π.χ. econ4, lr7, pv, polint4): τιμές άγκυρας ανά επιλογή ('none' = καμία αυτοτοποθέτηση). */
  anchor?: { name: 'emp' | 'inc6' | 'econ4' | 'class3' | 'lr7' | 'pv' | 'believer' | 'polint4' | 'incq5' | 'hhsize5'; optionMap: Record<string, string[]> } | null;
  /** Πρόθεση ψήφου: μοντέλο εκλογικής επιλογής με σενάριο κομμάτων (χωρίς δημοσκοπήσεις). */
  vote?: { scenario: string; optionParty: Record<string, string>; abstainOption?: string | null; undecidedOption?: string | null } | null;
  /** PHASE4 IQGE: προϋπολογισμένη ερμηνεία νέας ερώτησης (scripts/synthetic-lab/persona/iqge.py)· βλ. IqgeLink. */
  iqge?: IqgeLink | null;
}

/**
 * PHASE4 IQGE (Intelligent Question Generalization Engine) — αποτέλεσμα της εκτός σύνδεσης ερμηνείας μιας νέας ερώτησης.
 * Η «κατανόηση» (πολυγλωσσικά embeddings, ανάκτηση τεκμηρίων) γίνεται ΕΚΤΟΣ runtime· εδώ υπάρχουν μόνο στατιστικές ποσότητες:
 * επίπεδο από τεκμήρια της βάσης (μαθημένη «κάρτα ταιριάσματος»), σειρά προσώπων από λανθάνοντα items του μοντέλου, εξασθένιση.
 * Κανένα ποσοστό δεν παράγεται από γλωσσικό μοντέλο.
 */
export interface IqgeLink {
  version: string;
  /** Μοντέλο PIE για το οποίο υπολογίστηκαν οι πηγές σειράς (mean/sd). */
  modelVersion: string;
  /** Μερίδιο ανά ουσιαστική επιλογή (άθροισμα 1). */
  level: Record<string, number>;
  /** Εμπειρικό 80% διάστημα ανά επιλογή (π.μ.), από τα σφάλματα της ανάπτυξης για τη βαθμίδα τεκμηρίου. */
  int80?: Record<string, [number, number]> | null;
  /** Πηγές σειράς προσώπων: ordinal items του μοντέλου, πρόσημο από σημασιολογική σύγκριση άκρων, βάρος από ομοιότητα. */
  rank: { itemId: string; weight: number; sign: 1 | -1; mean: number; sd: number }[];
  /** Τυπική απόκλιση του σταθμισμένου αθροίσματος σε πληθυσμό αναφοράς. */
  scoreSd: number;
  /** Εξασθένιση της σχέσης με τις πηγές (0 = ανεξάρτητη απάντηση, 1 = πλήρης). */
  atten: number;
  /** 'international' (PHASE5): ισοδύναμη ερώτηση σε διεθνή έρευνα — ελληνικό επίπεδο πραγματικό ή μεταφερμένο από εμπειρικά κοντινές χώρες. */
  tier: 'paraphrase' | 'related' | 'weak' | 'international';
  /** Αναμενόμενο MAE περιθωρίων (π.μ.) της βαθμίδας στην ανάπτυξη (leave-one-family-out). */
  expectedMAE: number;
  /** Τεκμήρια που χρησιμοποιήθηκαν (για την αναφορά προέλευσης). */
  evidence: { id: string; sim: number; text: string; weight: number }[];
  /**
   * PHASE5: μετατόπιση της λανθάνουσας κλίμακας ανά υποομάδα (κλειδιά «age_band:65+», «gender:female», «edu3:low»),
   * από τις δεσμευμένες αποκλίσεις (ridit) της ίδιας ερώτησης σε άλλες χώρες (επικυρωμένο: −30% σφάλμα υποομάδων).
   */
  groupShift?: Record<string, number> | null;
  /** PHASE5: διεθνής βάση — χώρες-πηγές και τρόπος (greek_observed | international_transfer). */
  international?: { basis: string; countries: string[]; survey: string; itemId: string } | null;
}

/** Κατηγορία υποστήριξης μιας ερώτησης στον μηχανισμό PIE. */
export type PersonaSupport = 'DIRECTLY_SUPPORTED' | 'MODEL_EXTRAPOLATED' | 'NOT_RELIABLY_ESTIMABLE';

export type ConstructKind = 'evaluation' | 'intention' | 'usage' | 'general_usage' | 'other';
/** Μηχανισμός απαντήσεων: «standard» = prod-1 (ομοιόμορφη προεπιλογή όπου λείπουν δεδομένα)· «evidence» = EGPS. */
export type ResponseEngine = 'standard' | 'evidence' | 'persona';
export type EvidenceClass = 'EMPIRICALLY_ANCHORED' | 'MODEL_EXTRAPOLATED' | 'NOT_ESTIMABLE';
export interface QuestionEvidence {
  evidenceClass: EvidenceClass;
  basis: 'direct' | 'related_transfer' | 'brand_transfer' | 'assumption_scenario' | 'researcher_assumptions' | 'none';
  reason: string;
  sources: string[];
  /** Για δυαδικές MODEL_EXTRAPOLATED: διαστήματα του ποσοστού της «θετικής» επιλογής (π.μ.). */
  point?: number | null;
  int80?: [number, number] | null;
  int95?: [number, number] | null;
  /** Λογικό άνω όριο από την κατηγορία (π.χ. χρήστες μάρκας ≤ χρήστες κατηγορίας). */
  upperBound?: { value: number; source: string } | null;
  /** Σενάρια ερευνητή: σημείο και διάστημα 80% ανά επιλογή (ευρύ — μικρή ισοδύναμη βάση). */
  distribution?: { option: string; point: number; int80: [number, number] }[] | null;
  /** Εξαρτήσεις με άλλες ερωτήσεις (κατηγορία σχέσης, ρ, κατάσταση). */
  dependence?: { with: string; cls: string; rho: number; status: string }[];
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
  /** Εμπειρικός δείκτης που χρησιμοποιεί η παραδοχή (π.χ. σχετική συμπεριφορά Eurostat). */
  metric?: string | null;
}

// ------------------------------------------------------------
// Μελέτες
// ------------------------------------------------------------

export type ResearchDomain = 'consumer' | 'social_policy' | 'political';
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
  /**
   * Έτος αναφοράς της προσομοίωσης: δεν χρησιμοποιείται κανένα δεδομένο που συλλέχθηκε μετά από αυτό
   * (και ο πληθυσμός είναι ο ιστορικός baseline αν το έτος είναι πριν από τη βαθμονόμηση). null = σήμερα.
   */
  referenceYear?: number | null;
  /**
   * Μήνας αναφοράς (1–12) μέσα στο referenceYear. Αν δοθεί, κύματα του ίδιου έτους χρησιμοποιούνται μόνο
   * αν το τρίμηνό τους έληξε έως αυτόν τον μήνα· κύματα του ίδιου έτους χωρίς τρίμηνο εξαιρούνται.
   */
  referenceMonth?: number | null;
  /** Μελέτες αξιολόγησης (holdout): εξαιρούνται από τη βαθμονόμηση μαζί με διπλότυπα/παράγωγά τους. */
  holdoutDatasets?: string[];
  /** Μηχανισμός απαντήσεων (προεπιλογή «standard» = prod-1). */
  engine?: ResponseEngine;
  /** PIE: έκδοση μοντέλου (προεπιλογή: η εγκεκριμένη/τελευταία υποψήφια του μητρώου). */
  personaModelVersion?: string | null;
  /** PIE: επαναχρησιμοποίηση υπάρχοντος συνθετικού panel (αντί για νέο). */
  panelId?: string | null;
  /** PIE: αυτόματη ερμηνεία ερωτήσεων χωρίς χειροκίνητη σύνδεση (προεπιλογή: ναι· αποδοχή μόνο πάνω από κατώφλι). */
  personaAutoLink?: boolean;
}

/** Προέλευση μιας εμπειρικής παραμέτρου (ποσοστό επιλογής) που χρησιμοποιήθηκε σε μια εκτέλεση. */
export interface ParameterProvenance {
  questionId: string | null;
  option: string | null;
  metric: string;
  kind: 'observed' | 'excluded';
  datasetId: string;
  source: string;
  waveKey: string | null;
  year: number | null;
  /** Παρατηρημένη συνολική τιμή (%) και μέγεθος δείγματος του κελιού, όπου δημοσιεύεται. */
  observed: number | null;
  n: number | null;
  dimensions: string[];
  level: string | null;
  quality: number | null;
  tier: 'open' | 'research_only';
  license: string | null;
  url: string | null;
  fitErrorPp: number | null;
  reason?: string;
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
  | 'llm' // παράχθηκε από μοντέλο AI (μη επικυρωμένο)
  | 'model_extrapolated' // EGPS: μεταφορά από συγγενικές μετρήσεις ή ρητό σενάριο
  | 'not_estimable' // EGPS/PIE: καμία επαρκής τεκμηρίωση — η απάντηση μένει NA
  | 'persona_model'; // PIE: ατομική απάντηση από μοντέλο εκτιμημένο σε πραγματικά μικροδεδομένα της ίδιας ερώτησης

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
  /** Μόνο με τον μηχανισμό EGPS: κατηγορία τεκμηρίωσης, αιτία, διαστήματα. */
  evidence?: QuestionEvidence;
  /** Μόνο με τον μηχανισμό PIE: κατηγορία υποστήριξης και προέλευση. */
  persona?: { support: PersonaSupport; reason: string; provenance: Record<string, unknown> };
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
  /** Ανά παράμετρο: από ποια μελέτη/κύμα προήλθε (ή γιατί εξαιρέθηκε). Παρατηρήσεις ≠ παραδοχές ≠ συνθετικά αποτελέσματα. */
  provenance?: ParameterProvenance[];
  evidenceContext?: { referenceYear: number | null; referenceMonth?: number | null; holdout: string[]; populationNote: string | null };
  validation: StudyValidationSummary;
  stability?: StabilityResult | null;
  /** PIE: panel και έκδοση μοντέλου (αναπαραγωγιμότητα). */
  personaRun?: { panelId: string; modelVersion: string; modelSnapshot: string; licencePolicy: string; modelStatus: string | null; anchorSources: unknown[] } | null;
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
