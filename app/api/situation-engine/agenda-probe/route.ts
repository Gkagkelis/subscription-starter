import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type MatchMode = "exact" | "prefix" | "phrase";

type KeywordSpec = {
  term: string;
  weight: number;
  mode?: MatchMode;
};

type MicroAgendaRule = {
  id: string;
  label: string;
  parentHints?: string[];
  keywords: KeywordSpec[];
  priority?: number;
  sensitivity?: "normal" | "medium" | "high";
};

type PreparedKeyword = KeywordSpec & {
  normalized: string;
  normalizedTokens: string[];
};

type PreparedRule = Omit<MicroAgendaRule, "keywords" | "parentHints"> & {
  keywords: PreparedKeyword[];
  parentHints: string[];
};

type ClassificationResult = {
  micro_agenda_id: string;
  micro_agenda: string;
  confidence: number;
  matches: string[];
  mode: "rule_based_micro_agenda" | "fallback_low_confidence";
  rule_score: number;
};

type SensitivityResult = {
  level: "normal" | "medium" | "high";
  requires_human_review: boolean;
  ranking_policy: "standard" | "careful_context" | "do_not_optimize_for_engagement";
  reasons: string[];
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONFIG = {
  maxHours: 168,
  minHours: 24,
  defaultHours: 168,
  maxEvents: 300,
  topBriefMicroAgendas: 10,
  topBriefEventsPerAgenda: 3,
  topBriefEvidencePerAgenda: 3,
  topDebugEventsPerAgenda: 8,
  topDebugEvidencePerAgenda: 8,
  fallbackConfidence: 35,
  minimumRuleScore: 10,
  monitoringCap: 59,
  highSeverityScore: 88,
  formulaVersion: "micro_agenda_hardened_sensitive_v4",
};

const MICRO_AGENDA_RULES: MicroAgendaRule[] = [
  // Οικονομία
  { id: "cost_of_living", label: "Ακρίβεια / κόστος ζωής", parentHints: ["οικονομια", "κοινωνια", "ακριβεια"], priority: 20, keywords: [
    { term: "ακριβεια", weight: 12, mode: "exact" }, { term: "πληθωρισ", weight: 10, mode: "prefix" }, { term: "τιμες", weight: 6, mode: "exact" }, { term: "καλαθι", weight: 6, mode: "exact" }, { term: "κοστος ζωης", weight: 11, mode: "phrase" }, { term: "τροφ", weight: 5, mode: "prefix" },
  ]},
  { id: "consumer_price_tools", label: "Ακρίβεια / σύγκριση τιμών / εργαλεία καταναλωτή", parentHints: ["οικονομια", "ακριβεια", "κοινωνια"], priority: 45, keywords: [
    { term: "posokanei", weight: 18, mode: "exact" }, { term: "ποσο κανει", weight: 18, mode: "phrase" }, { term: "συγκριση τιμων", weight: 16, mode: "phrase" }, { term: "βασικα αγαθα", weight: 12, mode: "phrase" }, { term: "εργαλειο καταναλωτη", weight: 14, mode: "phrase" }, { term: "παρατηρητηριο τιμων", weight: 14, mode: "phrase" }, { term: "τιμες στα βασικα αγαθα", weight: 14, mode: "phrase" },
  ]},
  { id: "energy_heating_support", label: "Ενεργειακό κόστος / επίδομα θέρμανσης", parentHints: ["ακριβεια", "οικονομια", "κοινωνια", "ενεργεια"], priority: 50, keywords: [
    { term: "επιδομα θερμανσης", weight: 18, mode: "phrase" }, { term: "θερμανση", weight: 11, mode: "prefix" }, { term: "ενεργειακο κοστος", weight: 15, mode: "phrase" }, { term: "λογαριασμοι ρευματος", weight: 14, mode: "phrase" }, { term: "ρευμα", weight: 8, mode: "exact" },
  ]},
  { id: "electricity_theft_energy_grid", label: "Ρευματοκλοπές / ενεργειακό δίκτυο", parentHints: ["ενεργεια", "οικονομια", "ασφαλεια", "κοινωνια"], priority: 70, keywords: [
    { term: "ρευματοκλοπ", weight: 22, mode: "prefix" }, { term: "κλοπη ρευματος", weight: 20, mode: "phrase" }, { term: "παρανομες συνδεσεις", weight: 16, mode: "phrase" }, { term: "δεδδηε", weight: 12, mode: "exact" }, { term: "ενεργειακο δικτυο", weight: 14, mode: "phrase" },
  ]},
  { id: "social_benefits_support", label: "Επιδόματα / κοινωνική στήριξη", parentHints: ["ακριβεια", "κοινωνια", "οικονομια", "εργασια", "ασφαλιστικο"], priority: 42, keywords: [
    { term: "επιδομα", weight: 13, mode: "prefix" }, { term: "κοινωνικα προγραμματα", weight: 15, mode: "phrase" }, { term: "κοινωνικη στηριξη", weight: 15, mode: "phrase" }, { term: "ενισχυση νοικοκυριων", weight: 14, mode: "phrase" }, { term: "χρηματοδοτηση νοικοκυριων", weight: 13, mode: "phrase" },
  ]},
  { id: "banks_loans_private_debt", label: "Τράπεζες / δάνεια / ιδιωτικό χρέος", parentHints: ["οικονομια"], priority: 15, keywords: [
    { term: "τραπεζ", weight: 10, mode: "prefix" }, { term: "δανει", weight: 9, mode: "prefix" }, { term: "κοκκινα δανεια", weight: 14, mode: "phrase" }, { term: "ιδιωτικο χρεος", weight: 13, mode: "phrase" }, { term: "πλειστηριασ", weight: 12, mode: "prefix" }, { term: "fund", weight: 5, mode: "exact" }, { term: "servicer", weight: 6, mode: "prefix" },
  ]},
  { id: "banking_consumer_protection", label: "Τράπεζες / καταναλωτική προστασία", parentHints: ["οικονομια", "τραπεζ"], priority: 60, keywords: [
    { term: "τραπεζικος τομεας", weight: 16, mode: "phrase" }, { term: "τραπεζικο τομεα", weight: 16, mode: "phrase" }, { term: "προστασια καταναλωτων", weight: 18, mode: "phrase" }, { term: "νομοσχεδιο προστασιας καταναλωτων", weight: 20, mode: "phrase" }, { term: "τραπεζ", weight: 10, mode: "prefix" }, { term: "καταναλωτων", weight: 8, mode: "exact" },
  ]},
  { id: "taxation_public_revenue", label: "Φορολογία / δημόσια έσοδα", parentHints: ["οικονομια", "φορολογια"], keywords: [
    { term: "φορο", weight: 8, mode: "prefix" }, { term: "φορολογ", weight: 10, mode: "prefix" }, { term: "τεκμηρι", weight: 8, mode: "prefix" }, { term: "φπα", weight: 9, mode: "exact" }, { term: "ενφια", weight: 9, mode: "exact" }, { term: "ααδε", weight: 8, mode: "exact" },
  ]},
  { id: "debt_settlement_installments", label: "Ρύθμιση οφειλών / δόσεις", parentHints: ["φορολογια", "οικονομια", "ασφαλιστικο"], priority: 45, keywords: [
    { term: "ρυθμιση οφειλων", weight: 18, mode: "phrase" }, { term: "ρυθμιση φορολογικων χρεων", weight: 18, mode: "phrase" }, { term: "οφειλετ", weight: 10, mode: "prefix" }, { term: "οφειλων", weight: 10, mode: "exact" }, { term: "δοσεισ", weight: 11, mode: "exact" }, { term: "δοσεις", weight: 11, mode: "exact" }, { term: "72 δοσεις", weight: 18, mode: "phrase" }, { term: "72 δοσεισ", weight: 18, mode: "phrase" }, { term: "χρεη σε εφορια", weight: 14, mode: "phrase" },
  ]},
  { id: "income_protection_unseizable", label: "Ακατάσχετο / προστασία εισοδήματος", parentHints: ["ασφαλιστικο", "συνταξεις", "φορολογια", "οικονομια"], priority: 55, keywords: [
    { term: "ακατασχετο", weight: 18, mode: "exact" }, { term: "ακατασχετου", weight: 18, mode: "exact" }, { term: "ακατασχετο οριο", weight: 20, mode: "phrase" }, { term: "μισθους και συνταξεις", weight: 15, mode: "phrase" }, { term: "προστασια εισοδηματος", weight: 14, mode: "phrase" },
  ]},
  { id: "professional_insurance_pensions", label: "Επαγγελματική ασφάλιση / επικουρικό", parentHints: ["ασφαλιστικο", "συνταξεις", "εργασια", "οικονομια"], priority: 50, keywords: [
    { term: "επαγγελματικη ασφαλιση", weight: 20, mode: "phrase" }, { term: "επαγγελματικης ασφαλισης", weight: 20, mode: "phrase" }, { term: "επικουρικ", weight: 11, mode: "prefix" }, { term: "ασφαλιστικο νομοσχεδιο", weight: 14, mode: "phrase" }, { term: "κεραμεως", weight: 8, mode: "exact" },
  ]},
  { id: "public_debt_fiscal", label: "Δημόσιο χρέος / δημοσιονομικά", parentHints: ["οικονομια"], priority: 20, keywords: [
    { term: "δημοσιο χρεος", weight: 13, mode: "phrase" }, { term: "δημοσιου χρεους", weight: 13, mode: "phrase" }, { term: "χρεο", weight: 9, mode: "prefix" }, { term: "χρεου", weight: 9, mode: "prefix" }, { term: "πλεονασμα", weight: 8, mode: "prefix" }, { term: "ελλειμμα", weight: 8, mode: "prefix" }, { term: "δημοσιονομ", weight: 10, mode: "prefix" }, { term: "προυπολογισ", weight: 8, mode: "prefix" },
  ]},
  { id: "business_market_competition", label: "Επιχειρήσεις / αγορά / ανταγωνισμός", parentHints: ["οικονομια"], keywords: [
    { term: "επιχειρη", weight: 7, mode: "prefix" }, { term: "αγορα", weight: 5, mode: "exact" }, { term: "ανταγωνισμ", weight: 9, mode: "prefix" }, { term: "καρτελ", weight: 9, mode: "prefix" }, { term: "επενδυ", weight: 7, mode: "prefix" }, { term: "αναπτυξ", weight: 6, mode: "prefix" },
  ]},
  { id: "party_economic_programs", label: "Οικονομικά προγράμματα κομμάτων", parentHints: ["οικονομια", "πολιτικο", "κομμα"], priority: 50, keywords: [
    { term: "οικονομικο οραμα", weight: 18, mode: "phrase" }, { term: "οραμα του πασοκ", weight: 18, mode: "phrase" }, { term: "πασοκ", weight: 9, mode: "exact" }, { term: "ανδρουλακη", weight: 9, mode: "prefix" }, { term: "σεβ", weight: 7, mode: "exact" }, { term: "προγραμμα οικονομιας", weight: 14, mode: "phrase" },
  ]},

  // Στέγαση
  { id: "short_term_rentals_airbnb", label: "Βραχυχρόνιες μισθώσεις / Airbnb", parentHints: ["στεγαση", "οικονομια", "τουρισμ"], priority: 45, keywords: [
    { term: "airbnb", weight: 16, mode: "exact" }, { term: "βραχυχρονια", weight: 15, mode: "prefix" }, { term: "βραχυχρονιες μισθωσεις", weight: 18, mode: "phrase" }, { term: "μισθωσεις", weight: 7, mode: "prefix" },
  ]},
  { id: "housing_renovation_programs", label: "Προγράμματα κατοικίας / ανακαινίσεις", parentHints: ["στεγαση", "οικονομια", "κοινωνια", "ακριβεια"], priority: 58, keywords: [
    { term: "ανακαινιζω", weight: 18, mode: "exact" }, { term: "ανακαινιση κατοικιας", weight: 18, mode: "phrase" }, { term: "ανακαινισ", weight: 14, mode: "prefix" }, { term: "προγραμμα κατοικιας", weight: 16, mode: "phrase" }, { term: "επιδοτησεις εως", weight: 10, mode: "phrase" }, { term: "δικαιουχ", weight: 6, mode: "prefix" },
  ]},
  { id: "housing_rents", label: "Στέγαση / ενοίκια", parentHints: ["στεγαση", "κοινωνια", "οικονομια"], priority: 25, keywords: [
    { term: "στεγασ", weight: 10, mode: "prefix" }, { term: "ενοικ", weight: 12, mode: "prefix" }, { term: "ενοικιαστη", weight: 11, mode: "prefix" }, { term: "οικονομικη ασφυξια", weight: 11, mode: "phrase" }, { term: "πρωτη κατοικια", weight: 12, mode: "phrase" }, { term: "κατοικι", weight: 5, mode: "prefix" },
  ]},

  // Υγεία
  { id: "nhs_hospitals", label: "Νοσοκομεία / ΕΣΥ", parentHints: ["υγεια"], priority: 20, keywords: [
    { term: "νοσοκομ", weight: 12, mode: "prefix" }, { term: "εσυ", weight: 12, mode: "exact" }, { term: "εφημερι", weight: 8, mode: "prefix" }, { term: "γιατρο", weight: 7, mode: "prefix" }, { term: "νοσηλευ", weight: 8, mode: "prefix" }, { term: "κλινικ", weight: 6, mode: "prefix" },
  ]},
  { id: "health_infrastructure", label: "Υποδομές υγείας / νοσοκομειακά έργα", parentHints: ["υγεια"], priority: 30, keywords: [
    { term: "υποδομ", weight: 9, mode: "prefix" }, { term: "εργα", weight: 5, mode: "exact" }, { term: "κατασκευ", weight: 6, mode: "prefix" }, { term: "νοσοκομ", weight: 12, mode: "prefix" }, { term: "κεντρο υγειας", weight: 14, mode: "phrase" }, { term: "δομη υγειας", weight: 12, mode: "phrase" }, { term: "ροδο", weight: 3, mode: "prefix" }, { term: "κω", weight: 3, mode: "exact" },
  ]},
  { id: "medicines_access", label: "Φάρμακα / πρόσβαση σε περίθαλψη", parentHints: ["υγεια"], keywords: [
    { term: "φαρμακ", weight: 11, mode: "prefix" }, { term: "ελλειψη φαρμακ", weight: 14, mode: "phrase" }, { term: "συνταγογραφ", weight: 8, mode: "prefix" }, { term: "περιθαλψ", weight: 8, mode: "prefix" }, { term: "ασθεν", weight: 6, mode: "prefix" },
  ]},
  { id: "public_health_mortality", label: "Δημόσια υγεία / θνησιμότητα", parentHints: ["υγεια"], sensitivity: "medium", keywords: [
    { term: "δημοσια υγεια", weight: 11, mode: "phrase" }, { term: "θνησιμοτητα", weight: 12, mode: "exact" }, { term: "επιδημι", weight: 9, mode: "prefix" }, { term: "κρουσμα", weight: 7, mode: "prefix" }, { term: "covid", weight: 7, mode: "exact" },
  ]},

  // Παιδεία / Νεολαία
  { id: "schools_education", label: "Σχολεία / εκπαίδευση", parentHints: ["παιδεια", "νεολαια"], keywords: [
    { term: "σχολ", weight: 9, mode: "prefix" }, { term: "μαθητ", weight: 8, mode: "prefix" }, { term: "εκπαιδευ", weight: 8, mode: "prefix" }, { term: "πανελληνι", weight: 9, mode: "prefix" }, { term: "εκπαιδευτικ", weight: 8, mode: "prefix" },
  ]},
  { id: "universities_students", label: "Πανεπιστήμια / φοιτητές", parentHints: ["παιδεια", "νεολαια"], keywords: [
    { term: "πανεπιστημ", weight: 11, mode: "prefix" }, { term: "φοιτητ", weight: 10, mode: "prefix" }, { term: "αει", weight: 9, mode: "exact" }, { term: "ιδιωτικα πανεπιστημια", weight: 14, mode: "phrase" }, { term: "μη κρατικα", weight: 10, mode: "phrase" },
  ]},
  { id: "youth_burnout_mental_pressure", label: "Ψυχική υγεία νέων / burnout", parentHints: ["νεολαια", "υγεια", "κοινωνια", "εργασια"], sensitivity: "medium", priority: 45, keywords: [
    { term: "burnout", weight: 16, mode: "exact" }, { term: "ψυχοσωματικ", weight: 13, mode: "prefix" }, { term: "ψυχικες πιεσεις", weight: 14, mode: "phrase" }, { term: "νεοι εργαζομενοι", weight: 12, mode: "phrase" }, { term: "πανελλαδικη ερευνα", weight: 8, mode: "phrase" },
  ]},
  { id: "youth_mental_health_addiction", label: "Ψυχική υγεία / εξαρτήσεις", parentHints: ["νεολαια", "υγεια", "κοινωνια"], sensitivity: "medium", priority: 25, keywords: [
    { term: "ψυχικη υγεια", weight: 14, mode: "phrase" }, { term: "ψυχιατρ", weight: 9, mode: "prefix" }, { term: "εξαρτησ", weight: 10, mode: "prefix" }, { term: "αλκοολ", weight: 7, mode: "prefix" }, { term: "εφηβ", weight: 5, mode: "prefix" },
  ]},
  { id: "demographic_crisis", label: "Δημογραφικό / γήρανση πληθυσμού", parentHints: ["νεολαια", "κοινωνια", "οικονομια"], priority: 45, keywords: [
    { term: "δημογραφ", weight: 15, mode: "prefix" }, { term: "γεννησ", weight: 9, mode: "prefix" }, { term: "γηρανσ", weight: 11, mode: "prefix" }, { term: "πληθυσμ", weight: 9, mode: "prefix" }, { term: "συρρικνωση", weight: 8, mode: "exact" },
  ]},

  // Εργασία
  { id: "wages_labor_rights", label: "Μισθοί / εργασιακά δικαιώματα", parentHints: ["εργασια", "κοινωνια", "οικονομια"], keywords: [
    { term: "μισθ", weight: 10, mode: "prefix" }, { term: "κατωτατος", weight: 8, mode: "exact" }, { term: "εργασιακ", weight: 10, mode: "prefix" }, { term: "συλλογικες συμβασεις", weight: 12, mode: "phrase" }, { term: "απεργ", weight: 8, mode: "prefix" },
  ]},
  { id: "unemployment_precarity", label: "Ανεργία / επισφάλεια", parentHints: ["εργασια", "κοινωνια", "οικονομια"], keywords: [
    { term: "ανεργ", weight: 11, mode: "prefix" }, { term: "επισφαλ", weight: 9, mode: "prefix" }, { term: "οαεδ", weight: 7, mode: "exact" }, { term: "δυπα", weight: 7, mode: "exact" },
  ]},

  // Περιβάλλον
  { id: "water_scarcity", label: "Λειψυδρία / διαχείριση νερού", parentHints: ["περιβαλλον", "κλιματικ"], priority: 20, keywords: [
    { term: "λειψυδρ", weight: 14, mode: "prefix" }, { term: "υδρευση", weight: 11, mode: "exact" }, { term: "υδρευ", weight: 10, mode: "prefix" }, { term: "υδατ", weight: 8, mode: "prefix" }, { term: "νερο", weight: 6, mode: "exact" }, { term: "νερου", weight: 6, mode: "exact" }, { term: "εξοικονομηση", weight: 8, mode: "exact" }, { term: "σπαταλ", weight: 7, mode: "prefix" }, { term: "πισιν", weight: 7, mode: "prefix" },
  ]},
  { id: "heatwaves_climate_extremes", label: "Καύσωνες / ακραία θερμικά επεισόδια", parentHints: ["περιβαλλον", "κλιματικ"], keywords: [
    { term: "καυσων", weight: 12, mode: "prefix" }, { term: "θερμικ", weight: 8, mode: "prefix" }, { term: "ακραια θερμικα", weight: 14, mode: "phrase" }, { term: "υψηλες θερμοκρασιες", weight: 10, mode: "phrase" }, { term: "κλιματικη κριση", weight: 9, mode: "phrase" },
  ]},
  { id: "public_safety_accidents", label: "Ατυχήματα / δημόσια ευθύνη", parentHints: ["πολιτικη προστασια", "τοπικη αυτοδιοικηση", "ασφαλεια", "κοινωνια"], sensitivity: "medium", priority: 70, keywords: [
    { term: "δυστυχημ", weight: 16, mode: "prefix" }, { term: "λουνα παρκ", weight: 18, mode: "phrase" }, { term: "ατυχημ", weight: 13, mode: "prefix" }, { term: "αργια", weight: 9, mode: "exact" }, { term: "δημαρχ", weight: 7, mode: "prefix" }, { term: "δημοσια ευθυνη", weight: 15, mode: "phrase" }, { term: "ασφαλεια χωρων", weight: 13, mode: "phrase" },
  ]},
  { id: "disasters_loss_of_life", label: "Φυσικές καταστροφές / απώλειες ζωής", parentHints: ["πολιτικη προστασια", "περιβαλλον", "κοινωνια"], sensitivity: "high", priority: 60, keywords: [
    { term: "πυρκαγι", weight: 12, mode: "prefix" }, { term: "νεκρ", weight: 12, mode: "prefix" }, { term: "τραγωδια", weight: 12, mode: "exact" }, { term: "κοντεινερ", weight: 10, mode: "prefix" }, { term: "θυματα", weight: 10, mode: "prefix" }, { term: "σεισμ", weight: 7, mode: "prefix" },
  ]},
  { id: "wildfire_prevention", label: "Πυροπροστασία / καθαρισμοί οικοπέδων", parentHints: ["περιβαλλον", "κλιματικ", "πολιτικη προστασια"], priority: 30, keywords: [
    { term: "πυροπροστασ", weight: 15, mode: "prefix" }, { term: "πυρκαγι", weight: 10, mode: "prefix" }, { term: "φωτια", weight: 12, mode: "exact" }, { term: "καθαρισμ", weight: 10, mode: "prefix" }, { term: "οικοπεδ", weight: 10, mode: "prefix" }, { term: "112", weight: 7, mode: "exact" },
  ]},
  { id: "pollution_waste", label: "Ρύπανση / απόβλητα", parentHints: ["περιβαλλον"], keywords: [
    { term: "ρυπανσ", weight: 11, mode: "prefix" }, { term: "αποβλητ", weight: 10, mode: "prefix" }, { term: "χωματερ", weight: 11, mode: "prefix" }, { term: "σκουπιδ", weight: 8, mode: "prefix" }, { term: "λυματ", weight: 8, mode: "prefix" },
  ]},
  { id: "biodiversity_land_use", label: "Βιοποικιλότητα / χρήσεις γης", parentHints: ["περιβαλλον", "αγροτικ"], keywords: [
    { term: "βιοποικιλ", weight: 12, mode: "prefix" }, { term: "natura", weight: 10, mode: "exact" }, { term: "μεταλλαγμεν", weight: 10, mode: "prefix" }, { term: "χρησεις γης", weight: 11, mode: "phrase" }, { term: "δασ", weight: 5, mode: "prefix" },
  ]},

  // Ασφάλεια / Δικαιοσύνη / Θεσμοί
  { id: "youth_violence", label: "Ανήλικοι / σχολική βία", parentHints: ["ασφαλεια", "νεολαια", "παιδεια", "κοινωνια"], sensitivity: "high", keywords: [
    { term: "ανηλικ", weight: 12, mode: "prefix" }, { term: "σχολικη βια", weight: 14, mode: "phrase" }, { term: "bullying", weight: 10, mode: "exact" }, { term: "ξυλοδαρμ", weight: 11, mode: "prefix" }, { term: "συμμορια ανηλικων", weight: 14, mode: "phrase" },
  ]},
  { id: "gender_domestic_violence", label: "Έμφυλη / ενδοοικογενειακή βία", parentHints: ["ασφαλεια", "κοινωνια", "δικαιοσυνη"], sensitivity: "high", priority: 95, keywords: [
    { term: "γυναικοκτον", weight: 22, mode: "prefix" }, { term: "ενδοοικογενειακ", weight: 18, mode: "prefix" }, { term: "εμφυλη βια", weight: 18, mode: "phrase" }, { term: "κακοποιησ", weight: 12, mode: "prefix" }, { term: "βιασμ", weight: 18, mode: "prefix" }, { term: "συζυγ", weight: 8, mode: "prefix" }, { term: "συντροφο", weight: 8, mode: "prefix" },
  ]},
  { id: "organized_crime_drugs", label: "Οργανωμένο έγκλημα / ναρκωτικά", parentHints: ["ασφαλεια", "δικαιοσυνη"], sensitivity: "medium", priority: 45, keywords: [
    { term: "οργανωμενο εγκλημα", weight: 18, mode: "phrase" }, { term: "εγκληματικο δικτυο", weight: 17, mode: "phrase" }, { term: "διεθνες εγκληματικο δικτυο", weight: 18, mode: "phrase" }, { term: "μαφια", weight: 12, mode: "exact" }, { term: "ναρκωτικ", weight: 15, mode: "prefix" }, { term: "κοσμο των ναρκωτικων", weight: 18, mode: "phrase" }, { term: "κυκλωμα", weight: 13, mode: "prefix" }, { term: "διακινηση ναρκωτικων", weight: 20, mode: "phrase" }, { term: "βαρονοι ναρκωτικων", weight: 20, mode: "phrase" }, { term: "εν ψυχρω εκτελεση", weight: 11, mode: "phrase" },
  ]},
  { id: "justice_rule_of_law", label: "Δικαιοσύνη / κράτος δικαίου", parentHints: ["δικαιοσυνη", "θεσμ", "πολιτικο συστημα"], keywords: [
    { term: "δικαιοσυν", weight: 10, mode: "prefix" }, { term: "κρατος δικαιου", weight: 13, mode: "phrase" }, { term: "εισαγγελ", weight: 8, mode: "prefix" }, { term: "δικαστ", weight: 8, mode: "prefix" }, { term: "ανεξαρτητη αρχη", weight: 10, mode: "phrase" },
  ]},
  { id: "corruption_transparency", label: "Διαφάνεια / διαφθορά / σκάνδαλα", parentHints: ["θεσμ", "δικαιοσυνη", "πολιτικο συστημα", "οικονομια"], keywords: [
    { term: "διαφθορα", weight: 12, mode: "exact" }, { term: "σκανδαλ", weight: 11, mode: "prefix" }, { term: "αδιαφαν", weight: 9, mode: "prefix" }, { term: "αναθεσ", weight: 7, mode: "prefix" }, { term: "απευθειας αναθεση", weight: 13, mode: "phrase" }, { term: "πορισμα", weight: 8, mode: "prefix" },
  ]},

  // Εξωτερικά / Άμυνα / Μεταναστευτικό
  { id: "nato_defense_spending", label: "ΝΑΤΟ / στρατιωτικές δαπάνες", parentHints: ["αμυνα", "εξωτερικη"], priority: 45, keywords: [
    { term: "nato", weight: 15, mode: "exact" }, { term: "νατο", weight: 15, mode: "exact" }, { term: "στρατιωτικες δαπανες", weight: 15, mode: "phrase" }, { term: "αμυντικες δαπανες", weight: 15, mode: "phrase" }, { term: "hegseth", weight: 10, mode: "exact" }, { term: "rutte", weight: 8, mode: "exact" },
  ]},
  { id: "defense_armaments", label: "Άμυνα / εξοπλισμοί", parentHints: ["αμυνα", "εξωτερικη"], priority: 20, keywords: [
    { term: "εξοπλισ", weight: 13, mode: "prefix" }, { term: "οπλικ", weight: 9, mode: "prefix" }, { term: "φρεγατ", weight: 10, mode: "prefix" }, { term: "rafale", weight: 10, mode: "exact" }, { term: "f35", weight: 10, mode: "exact" }, { term: "belharra", weight: 9, mode: "exact" },
  ]},
  { id: "defense_drones_technology", label: "Drones / αμυντική τεχνολογία", parentHints: ["αμυνα", "εξωτερικη"], priority: 55, keywords: [
    { term: "drone", weight: 18, mode: "exact" }, { term: "drones", weight: 18, mode: "exact" }, { term: "ουκρανικο drone", weight: 20, mode: "phrase" }, { term: "ουκρανια", weight: 8, mode: "exact" }, { term: "ζελενσκι", weight: 8, mode: "exact" }, { term: "αμυντικη τεχνολογια", weight: 14, mode: "phrase" },
  ]},
  { id: "international_missions_maritime_security", label: "Διεθνείς αποστολές / θαλάσσια ασφάλεια", parentHints: ["αμυνα", "εξωτερικη"], priority: 72, keywords: [
    { term: "στενα του ορμουζ", weight: 22, mode: "phrase" }, { term: "ορμουζ", weight: 18, mode: "exact" }, { term: "διεθνη αποστολη", weight: 18, mode: "phrase" }, { term: "διεθνης αποστολη", weight: 18, mode: "phrase" }, { term: "θαλασσια ασφαλεια", weight: 15, mode: "phrase" }, { term: "φρεγατα", weight: 10, mode: "prefix" },
  ]},
  { id: "defense_reorganization_forces", label: "Αμυντική πολιτική / ανασυγκρότηση Ενόπλων Δυνάμεων", parentHints: ["αμυνα", "εξωτερικη"], priority: 68, keywords: [
    { term: "ανασυγκροτηση ελληνικης αμυνας", weight: 22, mode: "phrase" }, { term: "ελληνικη αμυνα", weight: 15, mode: "phrase" }, { term: "ενόπλων δυναμεων", weight: 18, mode: "phrase" }, { term: "ενοπλων δυναμεων", weight: 18, mode: "phrase" }, { term: "ενοπλες δυναμεις", weight: 16, mode: "phrase" }, { term: "αμυντικη πολιτικη", weight: 16, mode: "phrase" },
  ]},
  { id: "foreign_policy_turkey", label: "Ελληνοτουρκικά / εξωτερική πολιτική", parentHints: ["εξωτερικη", "αμυνα"], keywords: [
    { term: "ελληνοτουρκ", weight: 14, mode: "prefix" }, { term: "τουρκ", weight: 8, mode: "prefix" }, { term: "αιγαιο", weight: 9, mode: "exact" }, { term: "κυπρ", weight: 8, mode: "prefix" }, { term: "υφαλοκρηπ", weight: 10, mode: "prefix" }, { term: "αοζ", weight: 9, mode: "exact" },
  ]},
  { id: "migration_asylum", label: "Μεταναστευτικό / άσυλο", parentHints: ["μεταναστευτικ", "κοινωνια", "εξωτερικη"], sensitivity: "medium", keywords: [
    { term: "μεταναστ", weight: 11, mode: "prefix" }, { term: "προσφυγ", weight: 10, mode: "prefix" }, { term: "ασυλο", weight: 9, mode: "exact" }, { term: "δομη φιλοξενιας", weight: 12, mode: "phrase" }, { term: "εβρος", weight: 8, mode: "exact" }, { term: "ναυαγ", weight: 10, mode: "prefix" },
  ]},

  // Υποδομές / Μεταφορές / Ενέργεια
  { id: "road_safety_school_crossings", label: "Οδική ασφάλεια / σχολικές διαβάσεις", parentHints: ["υποδομ", "μεταφορ", "παιδεια", "τοπικη αυτοδιοικηση"], priority: 45, keywords: [
    { term: "διαβασεις", weight: 14, mode: "exact" }, { term: "εξυπνες διαβασεις", weight: 18, mode: "phrase" }, { term: "οδικη ασφαλεια", weight: 14, mode: "phrase" }, { term: "σχολεια", weight: 8, mode: "exact" }, { term: "δρόμους", weight: 8, mode: "exact" }, { term: "δρομους", weight: 8, mode: "exact" },
  ]},
  { id: "vehicle_fleet_road_safety", label: "Οχήματα / στόλος / οδική ασφάλεια", parentHints: ["υποδομ", "μεταφορ", "οικονομια"], priority: 40, keywords: [
    { term: "στολος οχηματων", weight: 15, mode: "phrase" }, { term: "γηραιοτερο", weight: 12, mode: "prefix" }, { term: "οχηματων", weight: 10, mode: "exact" }, { term: "οχημα", weight: 9, mode: "prefix" },
  ]},
  { id: "public_infrastructure_projects", label: "Υποδομές / δημόσια έργα", parentHints: ["υποδομ", "μεταφορ", "τοπικη αυτοδιοικηση"], priority: 15, keywords: [
    { term: "υποδομ", weight: 10, mode: "prefix" }, { term: "δημοσια εργα", weight: 12, mode: "phrase" }, { term: "εργοταξ", weight: 7, mode: "prefix" }, { term: "κατασκευ", weight: 7, mode: "prefix" }, { term: "αναπλασ", weight: 8, mode: "prefix" },
  ]},
  { id: "transport_public_transit", label: "Μεταφορές / συγκοινωνίες", parentHints: ["μεταφορ", "υποδομ"], keywords: [
    { term: "μεταφορ", weight: 9, mode: "prefix" }, { term: "συγκοινων", weight: 10, mode: "prefix" }, { term: "λεωφορει", weight: 8, mode: "prefix" }, { term: "μετρο", weight: 8, mode: "exact" }, { term: "οσε", weight: 8, mode: "exact" }, { term: "σιδηροδρομ", weight: 10, mode: "prefix" },
  ]},
  { id: "energy_prices_grid", label: "Ενέργεια / τιμές ρεύματος", parentHints: ["ενεργεια", "οικονομια", "περιβαλλον"], keywords: [
    { term: "ενεργεια", weight: 10, mode: "exact" }, { term: "ρευμα", weight: 10, mode: "exact" }, { term: "λογαριασμ", weight: 7, mode: "prefix" }, { term: "κιλοβατ", weight: 8, mode: "prefix" }, { term: "φυσικο αεριο", weight: 10, mode: "phrase" }, { term: "απε", weight: 7, mode: "exact" },
  ]},

  // Αγροτικά / Τοπική / Πολιτική
  { id: "farmers_rural_production", label: "Αγροτικά / παραγωγή / επιδοτήσεις", parentHints: ["αγροτικ", "περιφερεια", "οικονομια"], keywords: [
    { term: "αγροτ", weight: 10, mode: "prefix" }, { term: "κτηνοτροφ", weight: 10, mode: "prefix" }, { term: "οπεκεπε", weight: 12, mode: "exact" }, { term: "επιδοτησ", weight: 9, mode: "prefix" }, { term: "καλλιεργ", weight: 8, mode: "prefix" },
  ]},
  { id: "local_government_municipal", label: "Τοπική αυτοδιοίκηση / δήμοι", parentHints: ["τοπικη", "αυτοδιοικηση", "κοινωνια"], keywords: [
    { term: "δημος", weight: 7, mode: "exact" }, { term: "δημαρχ", weight: 9, mode: "prefix" }, { term: "περιφερεια", weight: 8, mode: "prefix" }, { term: "δημοτικ", weight: 8, mode: "prefix" }, { term: "κοινοτητα", weight: 6, mode: "exact" },
  ]},
  { id: "elections_party_system", label: "Εκλογές / κόμματα / πολιτικό σύστημα", parentHints: ["πολιτικο", "εκλογ", "κομμα"], keywords: [
    { term: "εκλογ", weight: 11, mode: "prefix" }, { term: "κομμα", weight: 9, mode: "prefix" }, { term: "δημοσκοπ", weight: 10, mode: "prefix" }, { term: "βουλη", weight: 8, mode: "exact" }, { term: "κυβερνησ", weight: 8, mode: "prefix" }, { term: "αντιπολιτευ", weight: 8, mode: "prefix" },
  ]},
  { id: "digital_governance_ai_cyber", label: "Ψηφιακή διακυβέρνηση / AI / κυβερνοασφάλεια", parentHints: ["ψηφιακ", "τεχνολογ", "κυβερνησ"], keywords: [
    { term: "τεχνητη νοημοσυνη", weight: 14, mode: "phrase" }, { term: "ai", weight: 11, mode: "exact" }, { term: "κυβερνοασφαλεια", weight: 13, mode: "exact" }, { term: "ψηφιακ", weight: 8, mode: "prefix" }, { term: "gov gr", weight: 8, mode: "phrase" }, { term: "προσωπικα δεδομενα", weight: 11, mode: "phrase" },
  ]},
];

const SENSITIVE_KEYWORDS: KeywordSpec[] = [
  { term: "γυναικοκτον", weight: 18, mode: "prefix" },
  { term: "αυτοκτον", weight: 18, mode: "prefix" },
  { term: "βιασμ", weight: 16, mode: "prefix" },
  { term: "σεξουαλικη κακοποιηση", weight: 18, mode: "phrase" },
  { term: "ενδοοικογενειακ", weight: 16, mode: "prefix" },
  { term: "ανηλικ", weight: 12, mode: "prefix" },
  { term: "παιδοφιλ", weight: 18, mode: "prefix" },
  { term: "νεκρ", weight: 12, mode: "prefix" },
  { term: "θυμα", weight: 8, mode: "prefix" },
  { term: "τραγωδια", weight: 12, mode: "exact" },
  { term: "δυστυχημ", weight: 12, mode: "prefix" },
  { term: "ναυαγ", weight: 12, mode: "prefix" },
  { term: "κακοποιησ", weight: 12, mode: "prefix" },
];

const STOPWORDS = new Set([
  "και", "της", "των", "τον", "την", "του", "το", "τα", "σε", "στο", "στη", "στην", "στον", "για", "με", "απο", "ως", "που", "πως", "ένα", "μια", "ενα", "μια", "οι", "η", "ο", "είναι", "ειναι", "νέο", "νεο", "νέα", "νεα", "μετα", "κατα", "χωρις", "προς", "από", "στης", "στις", "στους", "στα", "στις", "this", "that", "with", "from", "and", "the", "for"
]);

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[^0-9a-zα-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalized(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function makeTextIndex(value: unknown) {
  const normalized = normalizeText(value);
  const tokens = tokenizeNormalized(normalized);
  const tokenSet = new Set(tokens);
  const padded = ` ${normalized} `;
  return { normalized, tokens, tokenSet, padded };
}

function containsLatin(value: string): boolean {
  return /[a-z]/i.test(value);
}

function prepareKeyword(keyword: KeywordSpec): PreparedKeyword {
  const normalized = normalizeText(keyword.term);
  return {
    ...keyword,
    normalized,
    normalizedTokens: tokenizeNormalized(normalized),
  };
}

function prepareRule(rule: MicroAgendaRule): PreparedRule {
  return {
    ...rule,
    keywords: rule.keywords.map(prepareKeyword),
    parentHints: (rule.parentHints || []).map(normalizeText).filter(Boolean),
  };
}

const PREPARED_RULES = MICRO_AGENDA_RULES.map(prepareRule);
const PREPARED_SENSITIVE_KEYWORDS = SENSITIVE_KEYWORDS.map(prepareKeyword);

function preparedRuleById(ruleId: string): PreparedRule | null {
  return PREPARED_RULES.find((rule) => rule.id === ruleId) || null;
}

function forcedClassificationResult(ruleId: string, matches: string[], ruleScore: number): ClassificationResult | null {
  const rule = preparedRuleById(ruleId);
  if (!rule) return null;
  return {
    micro_agenda_id: rule.id,
    micro_agenda: rule.label,
    confidence: clampScore(ruleScore * 3 + Math.min(25, matches.length * 5)),
    matches,
    mode: "rule_based_micro_agenda",
    rule_score: ruleScore,
  };
}

function scoreInlineTerms(index: ReturnType<typeof makeTextIndex>, keywords: KeywordSpec[]) {
  return scoreKeywords(keywords.map(prepareKeyword), index);
}


function keywordMatches(keyword: PreparedKeyword, index: ReturnType<typeof makeTextIndex>): boolean {
  const term = keyword.normalized;
  if (!term) return false;

  const mode = keyword.mode || (keyword.normalizedTokens.length > 1 ? "phrase" : "prefix");

  if (mode === "phrase" || keyword.normalizedTokens.length > 1) {
    return index.padded.includes(` ${term} `);
  }

  if (mode === "exact") {
    return index.tokenSet.has(term);
  }

  // Prefix matching is allowed only for meaningful stems.
  // This prevents ai/eu/112-style false positives and avoids substring collisions.
  if (containsLatin(term) && term.length <= 3) {
    return index.tokenSet.has(term);
  }
  if (!containsLatin(term) && term.length < 4) {
    return index.tokenSet.has(term);
  }

  return index.tokens.some((token) => token === term || token.startsWith(term));
}

function scoreKeywords(keywords: PreparedKeyword[], index: ReturnType<typeof makeTextIndex>) {
  let score = 0;
  const matches: string[] = [];

  for (const keyword of keywords) {
    if (keywordMatches(keyword, index)) {
      score += keyword.weight;
      matches.push(keyword.normalized);
    }
  }

  return { score, matches };
}

function parentMatches(rule: PreparedRule, parentIndex: ReturnType<typeof makeTextIndex>) {
  if (!rule.parentHints.length) return true;
  return rule.parentHints.some((hint) => parentIndex.padded.includes(` ${hint} `) || parentIndex.tokens.some((t) => t.startsWith(hint)));
}

function eventEvidenceText(event: any): string {
  return Array.isArray(event?.evidence_articles)
    ? event.evidence_articles.map((a: any) => a?.title || "").join(" ")
    : "";
}

function eventCoreText(event: any): string {
  const detectionTerms = Array.isArray(event?.detection_terms)
    ? event.detection_terms.join(" ")
    : typeof event?.detection_terms === "string"
      ? event.detection_terms
      : JSON.stringify(event?.detection_terms || "");

  return [
    event?.title,
    event?.summary,
    event?.framing_summary,
    event?.recommended_action,
    detectionTerms,
  ]
    .filter(Boolean)
    .join(" ");
}

function eventText(event: any): string {
  return [eventCoreText(event), eventEvidenceText(event)].filter(Boolean).join(" ");
}

function forcedClassification(
  event: any,
  parentIndex: ReturnType<typeof makeTextIndex>,
  coreIndex: ReturnType<typeof makeTextIndex>,
  fullIndex: ReturnType<typeof makeTextIndex>
): ClassificationResult | null {
  // Hard guards for high-risk conflicts. These prevent generic terms like
  // "δολοφονία" from overpowering more specific, sensitive categories.
  const gender = scoreInlineTerms(fullIndex, [
    { term: "γυναικοκτον", weight: 22, mode: "prefix" },
    { term: "ενδοοικογενειακ", weight: 18, mode: "prefix" },
    { term: "εμφυλη βια", weight: 18, mode: "phrase" },
    { term: "συζυγ", weight: 9, mode: "prefix" },
    { term: "συντροφο", weight: 9, mode: "prefix" },
    { term: "βιασμ", weight: 18, mode: "prefix" },
  ]);
  if (gender.score >= 18) return forcedClassificationResult("gender_domestic_violence", gender.matches, 60 + gender.score);

  const bankingConsumer = scoreInlineTerms(fullIndex, [
    { term: "τραπεζ", weight: 10, mode: "prefix" },
    { term: "προστασια καταναλωτων", weight: 18, mode: "phrase" },
    { term: "νομοσχεδιο προστασιας καταναλωτων", weight: 20, mode: "phrase" },
    { term: "τραπεζικος τομεας", weight: 15, mode: "phrase" },
    { term: "τραπεζικο τομεα", weight: 15, mode: "phrase" },
  ]);
  if (bankingConsumer.score >= 25) return forcedClassificationResult("banking_consumer_protection", bankingConsumer.matches, 55 + bankingConsumer.score);

  const drugs = scoreInlineTerms(fullIndex, [
    { term: "ναρκωτικ", weight: 15, mode: "prefix" },
    { term: "κυκλωμα", weight: 12, mode: "prefix" },
    { term: "διακινηση ναρκωτικων", weight: 20, mode: "phrase" },
    { term: "βαρονοι ναρκωτικων", weight: 20, mode: "phrase" },
    { term: "εγκληματικο δικτυο", weight: 15, mode: "phrase" },
  ]);
  if (drugs.score >= 15) return forcedClassificationResult("organized_crime_drugs", drugs.matches, 45 + drugs.score);

  const accident = scoreInlineTerms(fullIndex, [
    { term: "λουνα παρκ", weight: 18, mode: "phrase" },
    { term: "δυστυχημ", weight: 14, mode: "prefix" },
    { term: "δημαρχ", weight: 8, mode: "prefix" },
    { term: "αργια", weight: 8, mode: "exact" },
  ]);
  if (accident.score >= 22 && parentIndex.tokens.some((token) => token.startsWith("πολιτικ") || token.startsWith("προστασια"))) {
    return forcedClassificationResult("public_safety_accidents", accident.matches, 45 + accident.score);
  }

  const maritimeMission = scoreInlineTerms(coreIndex, [
    { term: "στενα του ορμουζ", weight: 22, mode: "phrase" },
    { term: "ορμουζ", weight: 18, mode: "exact" },
    { term: "διεθνη αποστολη", weight: 18, mode: "phrase" },
    { term: "διεθνης αποστολη", weight: 18, mode: "phrase" },
  ]);
  if (maritimeMission.score >= 18) return forcedClassificationResult("international_missions_maritime_security", maritimeMission.matches, 55 + maritimeMission.score);

  const defenseReorg = scoreInlineTerms(coreIndex, [
    { term: "ανασυγκροτηση ελληνικης αμυνας", weight: 22, mode: "phrase" },
    { term: "ελληνικη αμυνα", weight: 15, mode: "phrase" },
    { term: "ενοπλων δυναμεων", weight: 18, mode: "phrase" },
    { term: "ενοπλες δυναμεις", weight: 16, mode: "phrase" },
    { term: "αμυντικη πολιτικη", weight: 16, mode: "phrase" },
  ]);
  if (defenseReorg.score >= 16) return forcedClassificationResult("defense_reorganization_forces", defenseReorg.matches, 55 + defenseReorg.score);

  const heating = scoreInlineTerms(coreIndex, [
    { term: "επιδομα θερμανσης", weight: 18, mode: "phrase" },
    { term: "θερμανση", weight: 11, mode: "prefix" },
    { term: "λογαριασμοι ρευματος", weight: 14, mode: "phrase" },
  ]);
  if (heating.score >= 18) return forcedClassificationResult("energy_heating_support", heating.matches, 45 + heating.score);

  const electricityTheft = scoreInlineTerms(fullIndex, [
    { term: "ρευματοκλοπ", weight: 22, mode: "prefix" },
    { term: "κλοπη ρευματος", weight: 20, mode: "phrase" },
    { term: "παρανομες συνδεσεις", weight: 16, mode: "phrase" },
    { term: "δεδδηε", weight: 12, mode: "exact" },
  ]);
  if (electricityTheft.score >= 18) return forcedClassificationResult("electricity_theft_energy_grid", electricityTheft.matches, 50 + electricityTheft.score);

  const socialBenefits = scoreInlineTerms(coreIndex, [
    { term: "επιδομα", weight: 13, mode: "prefix" },
    { term: "κοινωνικα επιδοματα", weight: 16, mode: "phrase" },
    { term: "κοινωνικη στηριξη", weight: 15, mode: "phrase" },
    { term: "κοινωνικα προγραμματα", weight: 15, mode: "phrase" },
  ]);
  if (socialBenefits.score >= 16) return forcedClassificationResult("social_benefits_support", socialBenefits.matches, 45 + socialBenefits.score);

  const housingRenovation = scoreInlineTerms(coreIndex, [
    { term: "ανακαινιζω", weight: 18, mode: "exact" },
    { term: "ανακαινισ", weight: 14, mode: "prefix" },
    { term: "ανακαινιση κατοικιας", weight: 18, mode: "phrase" },
  ]);
  if (housingRenovation.score >= 14) return forcedClassificationResult("housing_renovation_programs", housingRenovation.matches, 50 + housingRenovation.score);

  const consumerTools = scoreInlineTerms(fullIndex, [
    { term: "posokanei", weight: 18, mode: "exact" },
    { term: "ποσο κανει", weight: 18, mode: "phrase" },
    { term: "συγκριση τιμων", weight: 16, mode: "phrase" },
  ]);
  if (consumerTools.score >= 16) return forcedClassificationResult("consumer_price_tools", consumerTools.matches, 50 + consumerTools.score);


  const unseizable = scoreInlineTerms(fullIndex, [
    { term: "ακατασχετο", weight: 18, mode: "exact" },
    { term: "ακατασχετου", weight: 18, mode: "exact" },
    { term: "ακατασχετο οριο", weight: 20, mode: "phrase" },
  ]);
  if (unseizable.score >= 18) return forcedClassificationResult("income_protection_unseizable", unseizable.matches, 45 + unseizable.score);

  const professionalInsurance = scoreInlineTerms(fullIndex, [
    { term: "επαγγελματικη ασφαλιση", weight: 20, mode: "phrase" },
    { term: "επαγγελματικης ασφαλισης", weight: 20, mode: "phrase" },
  ]);
  if (professionalInsurance.score >= 20) return forcedClassificationResult("professional_insurance_pensions", professionalInsurance.matches, 45 + professionalInsurance.score);

  const drone = scoreInlineTerms(fullIndex, [
    { term: "drone", weight: 18, mode: "exact" },
    { term: "ουκρανικο drone", weight: 20, mode: "phrase" },
  ]);
  if (drone.score >= 18) return forcedClassificationResult("defense_drones_technology", drone.matches, 45 + drone.score);

  return null;
}

function stableFallbackSignature(event: any): string {
  const index = makeTextIndex(eventText(event));
  const meaningful = index.tokens
    .filter((token) => token.length >= 5)
    .filter((token) => !STOPWORDS.has(token))
    .slice(0, 5);

  if (meaningful.length >= 2) return meaningful.sort().join("_");
  const title = makeTextIndex(event?.title || event?.topic || "unknown").tokens.slice(0, 4).join("_");
  return title || "unclassified";
}

function classifyMicroAgenda(event: any): ClassificationResult {
  const parentTopic = String(event?.topic || "Μη ταξινομημένο");
  const parentIndex = makeTextIndex(parentTopic);
  const coreIndex = makeTextIndex(eventCoreText(event));
  const evidenceIndex = makeTextIndex(eventEvidenceText(event));
  const fullIndex = makeTextIndex(eventText(event));

  const forced = forcedClassification(event, parentIndex, coreIndex, fullIndex);
  if (forced) return forced;

  let best: { rule: PreparedRule; score: number; matches: string[] } | null = null;

  for (const rule of PREPARED_RULES) {
    const parentOk = parentMatches(rule, parentIndex);
    if (!parentOk) continue;

    const coreResult = scoreKeywords(rule.keywords, coreIndex);
    const evidenceResult = scoreKeywords(rule.keywords, evidenceIndex);
    const evidenceScore = coreResult.score > 0 ? Math.round(evidenceResult.score * 0.35) : Math.round(evidenceResult.score * 0.2);
    const keywordResult = {
      score: coreResult.score + evidenceScore,
      matches: Array.from(new Set([...coreResult.matches, ...evidenceResult.matches])).slice(0, 12),
    };
    if (keywordResult.score <= 0) continue;

    const parentBonus = rule.parentHints.length ? 12 : 0;
    const priorityBonus = rule.priority || 0;
    const totalScore = keywordResult.score + parentBonus + priorityBonus;

    if (
      !best ||
      totalScore > best.score ||
      (totalScore === best.score && (rule.priority || 0) > (best.rule.priority || 0))
    ) {
      best = { rule, score: totalScore, matches: keywordResult.matches };
    }
  }

  if (best && best.score >= CONFIG.minimumRuleScore) {
    const confidence = clampScore(best.score * 3 + Math.min(20, best.matches.length * 4));
    return {
      micro_agenda_id: best.rule.id,
      micro_agenda: best.rule.label,
      confidence,
      matches: best.matches,
      mode: "rule_based_micro_agenda",
      rule_score: best.score,
    };
  }

  const signature = stableFallbackSignature(event);
  return {
    micro_agenda_id: `fallback_${signature}`,
    micro_agenda: `Νέα / μη ταξινομημένη υπο-ατζέντα: ${signature.replace(/_/g, " ")}`,
    confidence: CONFIG.fallbackConfidence,
    matches: [],
    mode: "fallback_low_confidence",
    rule_score: 0,
  };
}

function classifySensitivity(events: any[], microAgenda: string): SensitivityResult {
  const text = [microAgenda, ...events.map(eventText)].join(" ");
  const index = makeTextIndex(text);
  const result = scoreKeywords(PREPARED_SENSITIVE_KEYWORDS, index);

  if (result.score >= 18) {
    return {
      level: "high",
      requires_human_review: true,
      ranking_policy: "do_not_optimize_for_engagement",
      reasons: result.matches,
    };
  }

  if (result.score >= 10) {
    return {
      level: "medium",
      requires_human_review: true,
      ranking_policy: "careful_context",
      reasons: result.matches,
    };
  }

  return {
    level: "normal",
    requires_human_review: false,
    ranking_policy: "standard",
    reasons: [],
  };
}

function sensitivityUiPolicy(sensitivity: SensitivityResult) {
  if (sensitivity.level === "high") {
    return {
      show_in_strategy_room: "review_required",
      public_recommendation_allowed: false,
      language_policy: "non_instrumental",
    };
  }

  if (sensitivity.level === "medium") {
    return {
      show_in_strategy_room: "careful_review",
      public_recommendation_allowed: false,
      language_policy: "contextual_careful",
    };
  }

  return {
    show_in_strategy_room: "standard",
    public_recommendation_allowed: true,
    language_policy: "standard",
  };
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toTime(value: unknown): number {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function hoursOld(value: unknown): number | null {
  const time = toTime(value);
  if (!time) return null;
  return (Date.now() - time) / 36e5;
}

function freshnessScore(value: unknown): number {
  const hours = hoursOld(value);
  if (hours === null) return 20;
  if (hours <= 24) return 100;
  if (hours <= 48) return 85;
  if (hours <= 72) return 70;
  if (hours <= 168) return 45;
  return 20;
}

function documentationScore(value: unknown): number {
  const normalized = normalizeText(value);
  if (normalized.includes("strong") || normalized.includes("high") || normalized.includes("ισχυρ")) return 100;
  if (normalized.includes("medium") || normalized.includes("μεσαι")) return 65;
  if (normalized.includes("initial") || normalized.includes("low") || normalized.includes("αρχικ")) return 35;
  return 40;
}

function evidenceArticles(row: any): any[] {
  return Array.isArray(row?.evidence_articles) ? row.evidence_articles : [];
}

function evidenceKey(article: any, fallback: string): string {
  return String(article?.article_id || article?.url || `${article?.source || "source"}-${article?.title || fallback}`);
}

function newestArticleAt(events: any[]): string | null {
  let newest = 0;

  for (const event of events) {
    newest = Math.max(newest, toTime(event?.last_article_at), toTime(event?.first_article_at), toTime(event?.first_seen_at));
    for (const article of evidenceArticles(event)) {
      newest = Math.max(newest, toTime(article?.published_at));
    }
  }

  return newest ? new Date(newest).toISOString() : null;
}

function topEvidence(events: any[], limit: number): any[] {
  const articles = new Map<string, any>();

  for (const event of events) {
    for (const article of evidenceArticles(event)) {
      const key = evidenceKey(article, `${event?.id || "event"}-${articles.size}`);
      const existing = articles.get(key);
      if (!existing || toNumber(article?.score) > toNumber(existing?.score)) {
        articles.set(key, article);
      }
    }
  }

  return Array.from(articles.values())
    .sort((a, b) => {
      const scoreDiff = toNumber(b?.score) - toNumber(a?.score);
      if (scoreDiff !== 0) return scoreDiff;
      return toTime(b?.published_at) - toTime(a?.published_at);
    })
    .slice(0, limit);
}

function isHighSeveritySingleEvent(event: any): boolean {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);
  const doc = documentationScore(event?.documentation_level);

  return (
    score >= CONFIG.highSeverityScore ||
    (score >= 80 && sourceCount >= 3) ||
    (score >= 78 && articleCount >= 6) ||
    (score >= 75 && sourceCount >= 3 && doc >= 65)
  );
}

function classifyEvent(event: any, sensitivity: SensitivityResult): string {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);

  if (sensitivity.level === "high" && articleCount <= 1 && sourceCount <= 1) return "sensitive_monitoring_event";
  if (isHighSeveritySingleEvent(event)) return "high_severity_single_event";
  if (score >= 70 && (articleCount >= 2 || sourceCount >= 2)) return "emerging_event";
  return "monitoring_event";
}

function trendForTopic(topic: string, trends: any[]) {
  const topicNorm = normalizeText(topic);
  return trends.find((trend) => normalizeText(trend?.topic) === topicNorm) || null;
}

function canonicalParentTopicForMicroAgenda(microAgendaId: string, fallbackParent: string): string {
  const canonical: Record<string, string> = {
    gender_domestic_violence: "Ασφάλεια / εγκληματικότητα",
    organized_crime_drugs: "Ασφάλεια / εγκληματικότητα",
    public_safety_accidents: "Πολιτική προστασία",
    disasters_loss_of_life: "Πολιτική προστασία",
    housing_renovation_programs: "Στέγαση",
    housing_rents: "Στέγαση",
    short_term_rentals_airbnb: "Στέγαση",
    energy_heating_support: "Ακρίβεια / κόστος ζωής",
    social_benefits_support: "Ακρίβεια / κόστος ζωής",
    consumer_price_tools: "Ακρίβεια / κόστος ζωής",
    defense_drones_technology: "Άμυνα",
    international_missions_maritime_security: "Άμυνα",
    defense_reorganization_forces: "Άμυνα",
  };

  return canonical[microAgendaId] || fallbackParent;
}

function groupEvents(events: any[]) {
  const grouped = new Map<string, { parentTopic: string; parentTopics: Set<string>; classification: ClassificationResult; events: any[] }>();

  for (const event of events) {
    const parentTopic = String(event?.topic || "Μη ταξινομημένο").trim();
    const classification = classifyMicroAgenda(event);
    const key = classification.micro_agenda_id;

    if (!grouped.has(key)) {
      grouped.set(key, {
        parentTopic: canonicalParentTopicForMicroAgenda(classification.micro_agenda_id, parentTopic),
        parentTopics: new Set<string>(),
        classification,
        events: [],
      });
    }

    const group = grouped.get(key)!;
    group.parentTopics.add(parentTopic);
    if (classification.confidence > group.classification.confidence) {
      group.classification = classification;
    }
    group.events.push(event);
  }

  return Array.from(grouped.values());
}

function buildAgendaItem(group: { parentTopic: string; parentTopics: Set<string>; classification: ClassificationResult; events: any[] }, trends: any[], debug: boolean) {
  const sortedEvents = [...group.events].sort((a, b) => toNumber(b?.event_score) - toNumber(a?.event_score));
  const bestEvent = sortedEvents[0];
  const trend = trendForTopic(group.parentTopic, trends);
  const sensitivity = classifySensitivity(group.events, group.classification.micro_agenda);
  const uiPolicy = sensitivityUiPolicy(sensitivity);
  const eventClassifications = new Map<any, ClassificationResult>();
  for (const event of sortedEvents) {
    eventClassifications.set(event, classifyMicroAgenda(event));
  }
  const groupMatches = Array.from(new Set(Array.from(eventClassifications.values())
    .filter((classification) => classification.micro_agenda_id === group.classification.micro_agenda_id)
    .flatMap((classification) => classification.matches))).slice(0, 12);
  const groupConfidence = Math.max(group.classification.confidence, ...Array.from(eventClassifications.values()).map((classification) => classification.confidence));

  const eventCount = group.events.length;
  const articleCount = group.events.reduce((sum, event) => sum + toNumber(event?.article_count), 0);
  const politicalArticleCount = group.events.reduce((sum, event) => sum + toNumber(event?.political_article_count), 0);
  const sourceCount = Math.max(...group.events.map((event) => toNumber(event?.source_count)), 0);
  const topEventScore = Math.max(...group.events.map((event) => toNumber(event?.event_score)), 0);
  const newest = newestArticleAt(group.events);
  const freshness = freshnessScore(newest);
  const doc = Math.max(...group.events.map((event) => documentationScore(event?.documentation_level)), 0);
  const trendScore = toNumber(trend?.search_interest_score, 50);
  const coverageScore = clampScore(eventCount * 12 + articleCount * 6 + sourceCount * 12);

  const hasClusterEvidence = eventCount >= 2 || articleCount >= 3 || sourceCount >= 2;
  const highSeverity = isHighSeveritySingleEvent(bestEvent);

  let type = "monitoring_event";
  if (hasClusterEvidence) type = "agenda_cluster";
  else if (highSeverity) type = "high_severity_single_event";

  const standardRawScore = clampScore(
    0.38 * topEventScore +
      0.22 * coverageScore +
      0.18 * trendScore +
      0.12 * freshness +
      0.1 * doc
  );

  const sensitiveRawScore = clampScore(
    0.48 * topEventScore +
      0.22 * coverageScore +
      0.17 * freshness +
      0.13 * doc
  );

  const rawScore = sensitivity.ranking_policy === "do_not_optimize_for_engagement" ? sensitiveRawScore : standardRawScore;
  const finalScore = type === "monitoring_event" ? Math.min(rawScore, CONFIG.monitoringCap) : rawScore;
  const eventLimit = debug ? CONFIG.topDebugEventsPerAgenda : CONFIG.topBriefEventsPerAgenda;
  const evidenceLimit = debug ? CONFIG.topDebugEvidencePerAgenda : CONFIG.topBriefEvidencePerAgenda;

  return {
    type,
    parent_topic: group.parentTopic,
    parent_topics: Array.from(group.parentTopics),
    topic: group.classification.micro_agenda,
    micro_agenda: group.classification.micro_agenda,
    micro_agenda_id: group.classification.micro_agenda_id,
    title: type === "agenda_cluster" ? group.classification.micro_agenda : bestEvent?.title,
    score: finalScore,
    raw_score_before_cap: rawScore,
    top_event_score: topEventScore,
    event_count: eventCount,
    article_count: articleCount,
    political_article_count: politicalArticleCount,
    source_count: sourceCount,
    freshness_score: freshness,
    documentation_score: doc,
    search_interest_score: sensitivity.ranking_policy === "do_not_optimize_for_engagement" ? null : trendScore,
    search_interest_status: trend?.search_interest_status || "pending_fallback_50",
    newest_article_at: newest,
    classification_mode: group.classification.mode,
    micro_agenda_confidence: groupConfidence,
    micro_agenda_matches: groupMatches.length ? groupMatches : group.classification.matches,
    sensitivity_level: sensitivity.level,
    requires_human_review: sensitivity.requires_human_review,
    ranking_policy: sensitivity.ranking_policy,
    show_in_strategy_room: uiPolicy.show_in_strategy_room,
    public_recommendation_allowed: uiPolicy.public_recommendation_allowed,
    language_policy: uiPolicy.language_policy,
    sensitivity_reasons: sensitivity.reasons,
    diagnosis: [
      hasClusterEvidence ? "multiple_events_or_sources" : "single_event_or_single_source_cap",
      type,
      group.classification.mode,
      ...(sensitivity.requires_human_review ? ["requires_human_review"] : []),
    ],
    strategic_read:
      sensitivity.level === "high"
        ? "Ζήτημα υψηλής κοινωνικής ευαισθησίας. Απαιτεί ανθρώπινο έλεγχο και μη εργαλειοποιητική πολιτική ανάγνωση πριν από δημόσια χρήση."
        : group.classification.mode === "fallback_low_confidence"
          ? "Νέα ή αβέβαιη υπο-ατζέντα. Κρατείται ως χαμηλής εμπιστοσύνης μέχρι να υπάρξουν περισσότερα συγγενή σήματα."
          : type === "monitoring_event"
            ? "Μεμονωμένο φρέσκο γεγονός. Δεν πρέπει να γίνει κεντρική ατζέντα χωρίς περισσότερες πηγές, επανάληψη ή πολιτική κλιμάκωση."
            : "Συστάδα συγγενών σημάτων σε συγκεκριμένη micro-agenda, όχι απλή θεματική κατηγορία.",
    top_events: sortedEvents.slice(0, eventLimit).map((event) => {
      const eventClassification = eventClassifications.get(event) || group.classification;
      return {
        id: event?.id,
        title: event?.title,
        parent_topic: String(event?.topic || group.parentTopic),
        micro_agenda: group.classification.micro_agenda,
        event_micro_agenda_id: eventClassification.micro_agenda_id,
        event_micro_agenda_confidence: eventClassification.confidence,
        event_micro_agenda_matches: eventClassification.matches,
        event_score: toNumber(event?.event_score),
        status: event?.status,
        article_count: toNumber(event?.article_count),
        source_count: toNumber(event?.source_count),
        documentation_level: event?.documentation_level,
        detection_method: event?.detection_method,
        last_article_at: event?.last_article_at,
        event_classification: classifyEvent(event, sensitivity),
      };
    }),
    evidence_articles: topEvidence(group.events, evidenceLimit),
  };
}

function buildLiveAgenda(events: any[], trends: any[], debug: boolean) {
  const items = groupEvents(events).map((group) => buildAgendaItem(group, trends, debug));
  const agendaClusters = items
    .filter((item) => item.type !== "monitoring_event")
    .sort((a, b) => b.score - a.score || b.top_event_score - a.top_event_score);
  const monitoringEvents = items
    .filter((item) => item.type === "monitoring_event")
    .sort((a, b) => b.top_event_score - a.top_event_score)
    .slice(0, debug ? 40 : 12);

  return { agenda_clusters: agendaClusters, monitoring_events: monitoringEvents, all_items: items };
}

function readHours(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("hours") || CONFIG.defaultHours);
  if (!Number.isFinite(raw)) return CONFIG.defaultHours;
  return Math.min(CONFIG.maxHours, Math.max(CONFIG.minHours, raw));
}

function authorize(token: string | null) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return { ok: true, mode: "cron_secret" };

  const devTokenAllowed =
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.ALLOW_DEV_PROBE_TOKEN === "true";

  if (token === "dev" && devTokenAllowed) return { ok: true, mode: "dev_token_allowed" };

  return { ok: false, mode: "unauthorized", devTokenAllowed };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const auth = authorize(searchParams.get("token"));

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Use CRON_SECRET in production. The dev token is disabled unless explicitly allowed for preview/dev.",
        auth_mode: auth.mode,
      },
      { status: 401 }
    );
  }

  const debug = searchParams.get("debug") === "1" || searchParams.get("view") === "debug";
  const view = debug ? "debug" : "brief";
  const hours = readHours(searchParams);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const eventsQuery = supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .gte("last_article_at", since)
    .order("last_article_at", { ascending: false, nullsFirst: false })
    .limit(CONFIG.maxEvents);

  const trendsQuery = supabase
    .from("topic_trend_signals")
    .select("topic,search_interest_score,search_interest_status,queries,fetched_at")
    .eq("region", "GR")
    .eq("timeframe", "now 7-d");

  const legacyQuery = supabase
    .from("v_situation_engine_live")
    .select("id,title,topic,priority_score,last_seen_at,last_computed_at,evidence_article_count")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(31);

  const [eventsResult, trendsResult, legacyResult] = await Promise.all([eventsQuery, trendsQuery, legacyQuery]);

  if (eventsResult.error) {
    return NextResponse.json(
      {
        success: false,
        stage: "read_v_political_events_live",
        error: eventsResult.error.message,
      },
      { status: 500 }
    );
  }

  const events = Array.isArray(eventsResult.data) ? eventsResult.data : [];
  const trends = Array.isArray(trendsResult.data) ? trendsResult.data : [];
  const legacySituations = Array.isArray(legacyResult.data) ? legacyResult.data : [];

  const newestLegacySeenAt = legacySituations.length
    ? legacySituations
        .map((s: any) => s?.last_seen_at)
        .filter(Boolean)
        .sort((a, b) => toTime(b) - toTime(a))[0]
    : null;
  const legacyHoursOld = newestLegacySeenAt ? hoursOld(newestLegacySeenAt) : null;
  const result = buildLiveAgenda(events, trends, debug);

  const diagnostics = {
    read_only: true,
    writes_to_database: false,
    auth_mode: auth.mode,
    dev_token_allowed_in_this_environment: (auth as any).devTokenAllowed ?? null,
    source_events: "v_political_events_live",
    source_trends: "topic_trend_signals",
    legacy_situations_source: "v_situation_engine_live",
    event_rows_considered: events.length,
    event_rows_total_matching_window: eventsResult.count,
    formula_version: CONFIG.formulaVersion,
    classifier_features: [
      "safe_token_matching",
      "weighted_keywords",
      "parent_aware_rules",
      "sensitivity_flags",
      "sensitivity_ui_policy",
      "conflict_priority_tiebreakers",
      "canonical_micro_agenda_merge",
      "core_text_weighted_above_evidence",
      "brief_debug_modes",
      "no_raw_substring_matching",
    ],
    newest_legacy_situation_seen_at: newestLegacySeenAt,
    newest_legacy_situation_hours_old:
      legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? Math.round(legacyHoursOld) : null,
    legacy_situations_are_stale_for_today:
      legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? legacyHoursOld > 48 : null,
    trends_error: trendsResult.error?.message ?? null,
    legacy_error: legacyResult.error?.message ?? null,
  };

  const basePayload = {
    success: true,
    mode: "read_only_hardened_sensitive_micro_agenda_probe_v4",
    grouping: "canonical_micro_agenda_to_parent_topics_to_events",
    view,
    generated_at: new Date().toISOString(),
    params: { hours, since },
    diagnostics,
  };

  if (!debug) {
    return NextResponse.json({
      ...basePayload,
      agenda_clusters: result.agenda_clusters.slice(0, CONFIG.topBriefMicroAgendas),
      monitoring_events: result.monitoring_events,
      totals: {
        agenda_clusters_total: result.agenda_clusters.length,
        monitoring_events_returned: result.monitoring_events.length,
        all_micro_agendas_total: result.all_items.length,
      },
    });
  }

  return NextResponse.json({
    ...basePayload,
    agenda_clusters: result.agenda_clusters,
    monitoring_events: result.monitoring_events,
    all_micro_agendas: result.all_items,
  });
}
