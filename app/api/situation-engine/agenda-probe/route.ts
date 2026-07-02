import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildAgendaResearchContext, RESEARCH_CONTEXT_VERSION, type PoliticalPartyProfile } from "../../../../lib/noraya/research-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  maxHours: 48,
  minHours: 24,
  defaultHours: 48,
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
  formulaVersion: "micro_agenda_frontpage_fusion_v5_7_party_profile_narrative_intelligence",
};


function sanitizePartyProfile(profile: PoliticalPartyProfile | null): PoliticalPartyProfile | null {
  if (!profile || typeof profile !== "object") return null;
  if (
    profile.party_key === "el_as" ||
    profile.party_key === "elas" ||
    String(profile.party_name || "").includes("Σώματα Ασφαλείας")
  ) {
    return {
      ...profile,
      party_key: "elas",
      party_name: "ΕΛΑΣ",
      short_name: "ΕΛΑΣ",
      profile_type: "political_party",
      ideological_family: "κεντροαριστερά / προοδευτικός χώρος",
      strategic_positioning:
        "Πολιτικό κόμμα / project του Αλέξη Τσίπρα με στόχο την προοδευτική ανασύνθεση, την κυβερνητική εναλλακτική και την κοινωνική πλειοψηφία.",
      default_tone: "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός",
      core_themes: ["Προοδευτική διακυβέρνηση", "Θεσμοί", "Κοινωνικό κράτος", "Οικονομία", "Ακρίβεια", "Δικαιοσύνη", "Δημοκρατική ανασύνθεση"],
      core_audiences: ["προοδευτικοί ψηφοφόροι", "κεντροαριστερά", "απογοητευμένοι ψηφοφόροι", "μεσαία τάξη", "νέοι", "εργαζόμενοι"],
      known_positions: ["Προοδευτική ανασύνθεση", "Κοινωνική δικαιοσύνη", "Θεσμική αξιοπιστία", "Πολιτική αλλαγή", "Κυβερνητική εναλλακτική"],
      red_lines: ["Εικόνα επιστροφής στο παρελθόν", "Προσωποκεντρικότητα χωρίς νέο σχέδιο", "Ασάφεια κυβερνησιμότητας", "Καταγγελτική γλώσσα χωρίς πρόταση"],
      opportunity_frame: "Να εμφανίζεται ως σοβαρή προοδευτική κυβερνητική εναλλακτική.",
      risk_frame: "Κίνδυνος να παρουσιαστεί ως ανακύκλωση παλιού πολιτικού κύκλου.",
      competitor_frame: "Οι αντίπαλοι θα το πλαισιώνουν ως επιστροφή Τσίπρα ή διάσπαση του προοδευτικού χώρου.",
      advisor_instructions:
        "Να δίνεις συμβουλές με θεσμικό, κυβερνητικό και ενωτικό τόνο. Κάθε μήνυμα πρέπει να δείχνει αλλαγή, αξιοπιστία και συγκεκριμένο σχέδιο.",
    };
  }
  return profile;
}

function profileMatchesParty(profile: PoliticalPartyProfile, partyKey: string): boolean {
  const target = normalizeText(partyKey).replace(/\s+/g, "_");
  if (!target) return false;
  const candidates = [profile.party_key, profile.short_name, profile.party_name]
    .map((value) => normalizeText(value).replace(/\s+/g, "_"))
    .filter(Boolean);
  if (target === "el_as" || target === "ελασ") return candidates.includes("elas") || candidates.includes("ελασ");
  return candidates.some((candidate) => candidate === target || candidate.includes(target) || target.includes(candidate));
}

function selectPartyProfile(partyKey: string | null, profiles: PoliticalPartyProfile[]): PoliticalPartyProfile | null {
  if (!partyKey) return null;
  const sanitized = profiles.map((profile) => sanitizePartyProfile(profile)).filter(Boolean) as PoliticalPartyProfile[];
  return sanitized.find((profile) => profileMatchesParty(profile, partyKey)) || null;
}

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

function eventUrlText(event: any): string {
  return Array.isArray(event?.evidence_articles)
    ? event.evidence_articles.map((a: any) => `${a?.url || ""} ${a?.source || ""}`).join(" ")
    : "";
}

function isSportsNoiseEvent(event: any): boolean {
  const text = normalizeText([eventText(event), eventUrlText(event), event?.topic].filter(Boolean).join(" "));
  if (!text) return false;

  const sportsSignals = [
    "sports", "football", "super league", "rebuilding", "ποδοσφαιρ", "μπασκετ", "αθλητικ",
    "αρησ", "αρης", "παοκ", "αεκ", "ολυμπιακ", "παναθηναικ", "ομαδα", "παικτη", "προπονητ",
  ];
  const hardDefenseSignals = [
    "νατο", "nato", "ενόπλων δυναμεων", "ενοπλων δυναμεων", "ενοπλεσ δυναμεισ", "στρατιωτικ",
    "υπουργειο αμυνασ", "υπουργειο αμυνας", "πενταγων", "φρεγατ", "κορβετ", "drones", "drone",
    "ορμουζ", "θαλασσια ασφαλεια", "γεεθα", "γεν", "πολεμικο ναυτικο", "αμυντικη τεχνολογια",
  ];

  const hasSportsSignal = sportsSignals.some((signal) => text.includes(normalizeText(signal)));
  if (!hasSportsSignal) return false;

  const hasHardDefenseSignal = hardDefenseSignals.some((signal) => text.includes(normalizeText(signal)));
  return !hasHardDefenseSignal;
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

  const paidLeave = scoreInlineTerms(coreIndex, [
    { term: "καλοκαιρινη αδεια", weight: 20, mode: "phrase" },
    { term: "αδεια", weight: 13, mode: "exact" },
    { term: "αδειας", weight: 13, mode: "exact" },
    { term: "ιδιωτικο τομεα", weight: 14, mode: "phrase" },
    { term: "εργαζομεν", weight: 8, mode: "prefix" },
  ]);
  if (paidLeave.score >= 22) return forcedClassificationResult("wages_labor_rights", paidLeave.matches, 45 + paidLeave.score);

  const housingRenovation = scoreInlineTerms(coreIndex, [
    { term: "ανακαινιζω", weight: 18, mode: "exact" },
    { term: "ανακαινισ", weight: 14, mode: "prefix" },
    { term: "ανακαινιση κατοικιας", weight: 18, mode: "phrase" },
  ]);
  if (housingRenovation.score >= 14) return forcedClassificationResult("housing_renovation_programs", housingRenovation.matches, 50 + housingRenovation.score);

  const socialBenefits = scoreInlineTerms(coreIndex, [
    { term: "επιδομα", weight: 13, mode: "prefix" },
    { term: "κοινωνικα επιδοματα", weight: 16, mode: "phrase" },
    { term: "κοινωνικη στηριξη", weight: 15, mode: "phrase" },
    { term: "κοινωνικα προγραμματα", weight: 15, mode: "phrase" },
  ]);
  const socialBenefitsBlocked = coreIndex.normalized.includes("ανακαιν") || coreIndex.normalized.includes("αδεια") || coreIndex.normalized.includes("αδειασ");
  if (socialBenefits.score >= 16 && !socialBenefitsBlocked) return forcedClassificationResult("social_benefits_support", socialBenefits.matches, 45 + socialBenefits.score);

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
  // Ομαδοποιούμε τα αταξινόμητα events με βάση το ΓΟΝΙΚΟ ΘΕΜΑ (π.χ. Γεωπολιτική),
  // ώστε άρθρα του ίδιου θέματος να ΜΗΝ σπάνε σε δεκάδες ξεχωριστά clusters.
  const parent = String(event?.topic || event?.parent_topic || "").trim();
  if (parent && parent !== "Μη ταξινομημένο") {
    return makeTextIndex(parent).tokens.slice(0, 3).join("_") || "unclassified";
  }
  const title = makeTextIndex(event?.title || "unknown").tokens.slice(0, 4).join("_");
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
  const parentLabel = String(event?.topic || event?.parent_topic || "").trim();
  const niceLabel =
    parentLabel && parentLabel !== "Μη ταξινομημένο"
      ? parentLabel
      : `Νέα υπο-ατζέντα: ${signature.replace(/_/g, " ")}`;
  return {
    micro_agenda_id: `fallback_${signature}`,
    micro_agenda: niceLabel,
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

  // ΠΟΛΙΤΙΚΑ ΚΡΙΣΙΜΟ: επίθεση/τρομοκρατία εναντίον κόμματος, πολιτικού, θεσμού.
  // Αυτά ΠΡΕΠΕΙ να φαίνονται ψηλά στην ατζέντα (είναι κορυφαία πολιτικά γεγονότα),
  // αλλά με προσεκτικό χειρισμό — ΟΧΙ engagement-optimization πάνω σε θύματα.
  const politicalTargetTokens = [
    "νεα δημοκρατια", "συριζα", "πασοκ", "κομμα", "κομματος", "βουλευτ",
    "υπουργ", "στελεχ", "γραφεια", "πολιτικου", "κυβερνησ", "αντιπολιτευσ",
    "ονεδ", "οννεδ", "νεολαια κομματος",
  ];
  const terrorTokens = [
    "τρομοκρατ", "εμπρηστ", "εμπρησμ", "γκαζακ", "βομβιστ", "επιθεση",
    "αντιποινα", "αντιεξουσιαστ", "πυρηνας",
  ];
  const hasPoliticalTarget = politicalTargetTokens.some((t) => text.toLowerCase().indexOf(t) !== -1);
  const hasTerror = terrorTokens.some((t) => text.toLowerCase().indexOf(t) !== -1);
  const isPoliticallyCritical = hasPoliticalTarget && hasTerror;

  if (result.score >= 18) {
    // Αν είναι πολιτικά κρίσιμο (επίθεση σε κόμμα), κρατάμε careful_context
    // ώστε να ΜΗΝ κόβεται το σκορ στο 49 — παραμένει ορατό ψηλά.
    if (isPoliticallyCritical) {
      return {
        level: "medium",
        requires_human_review: true,
        ranking_policy: "careful_context",
        reasons: result.matches.concat(["political_attack_stays_visible"]),
      };
    }
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

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = tokenizeNormalized(normalizeText(a)).filter((token) => token.length >= 4);
  const bTokens = tokenizeNormalized(normalizeText(b)).filter((token) => token.length >= 4);
  if (!aTokens.length || !bTokens.length) return 0;

  const bSet = new Set(bTokens);
  const hits = aTokens.filter((token) => bSet.has(token)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

function bestRowMatch<T extends Record<string, any>>(topicCandidates: string[], rows: T[], getTopic: (row: T) => string | null | undefined): T | null {
  let best: { row: T; score: number } | null = null;

  for (const row of rows) {
    const rowTopic = String(getTopic(row) || "").trim();
    if (!rowTopic) continue;
    const rowNorm = normalizeText(rowTopic);

    for (const candidate of topicCandidates) {
      const candidateNorm = normalizeText(candidate);
      if (!candidateNorm) continue;

      let score = 0;
      if (rowNorm === candidateNorm) score = 1;
      else if (rowNorm.includes(candidateNorm) || candidateNorm.includes(rowNorm)) score = 0.82;
      else score = tokenOverlapScore(rowTopic, candidate);

      if (!best || score > best.score) best = { row, score };
    }
  }

  return best && best.score >= 0.28 ? best.row : null;
}

function isApifyGoogleTrend(row: any): boolean {
  return String(row?.search_interest_status || "").startsWith("apify_google_trends");
}

function fetchedAtMs(row: any): number {
  const t = Date.parse(String(row?.fetched_at || ""));
  return Number.isFinite(t) ? t : 0;
}

function compareTrendRows(a: any, b: any): number {
  const apifyDelta = Number(isApifyGoogleTrend(b)) - Number(isApifyGoogleTrend(a));
  if (apifyDelta) return apifyDelta;
  const scoreDelta = toNumber(b?.search_interest_score, 0) - toNumber(a?.search_interest_score, 0);
  if (scoreDelta) return scoreDelta;
  return fetchedAtMs(b) - fetchedAtMs(a);
}

function trendForAgenda(topicCandidates: string[], trends: any[], microAgenda?: string, parentTopic?: string) {
  const micro = String(microAgenda || topicCandidates[0] || "").trim();
  const parent = String(parentTopic || topicCandidates[1] || "").trim();
  const microNorm = normalizeText(micro);

  if (microNorm) {
    const exactMicro = trends
      .filter((trend) => normalizeText(trend?.topic) === microNorm)
      .sort(compareTrendRows);
    if (exactMicro.length) return exactMicro[0];

    const strongMicro = trends
      .filter((trend) => {
        const topic = String(trend?.topic || "").trim();
        if (!topic) return false;
        if (isParentOnlyRealSignal(topic, micro, parent)) return false;
        const topicNorm = normalizeText(topic);
        return topicNorm.includes(microNorm) || microNorm.includes(topicNorm) || tokenOverlapScore(topic, micro) >= 0.5;
      })
      .sort(compareTrendRows);
    if (strongMicro.length) return strongMicro[0];
  }

  return bestRowMatch(topicCandidates, trends, (trend) => trend?.topic);
}

function agendaTopicForAgenda(topicCandidates: string[], agendaTopics: any[]) {
  return bestRowMatch(topicCandidates, agendaTopics, (topic) => topic?.name);
}

function advisorBriefForAgenda(topicCandidates: string[], advisorBriefs: any[]) {
  return bestRowMatch(topicCandidates, advisorBriefs, (brief) => brief?.topic);
}

function isParentOnlyRealSignal(rowTopic: unknown, microAgenda: string, parentTopic: string): boolean {
  const topic = String(rowTopic || "").trim();
  if (!topic) return false;
  const microOverlap = tokenOverlapScore(topic, microAgenda);
  const parentOverlap = tokenOverlapScore(topic, parentTopic);
  const topicNorm = normalizeText(topic);
  const parentNorm = normalizeText(parentTopic);
  const microNorm = normalizeText(microAgenda);

  if (topicNorm === microNorm) return false;
  if (topicNorm.includes(microNorm) || microNorm.includes(topicNorm)) return false;
  return parentOverlap >= 0.5 || topicNorm === parentNorm || parentNorm.includes(topicNorm) || topicNorm.includes(parentNorm);
}

function calibratedCoverageScore(rawCoverage: number, fallbackCoverageScore: number, parentOnlySignal: boolean): number {
  if (!parentOnlySignal) return clampScore(rawCoverage);
  // Broad parent signals such as "Άμυνα" or "Στέγαση" should support a micro-agenda,
  // but they must not make every child micro-agenda look equally front-page-important.
  return Math.min(clampScore(rawCoverage), clampScore(fallbackCoverageScore + 22));
}

function calibratedAgendaSignalScore(rawAgendaScore: number, topEventScore: number, parentOnlySignal: boolean): number {
  if (!parentOnlySignal) return clampScore(rawAgendaScore);
  // Keep broad agenda-topic support visible, but let micro-level event evidence decide the ranking spread.
  return Math.min(clampScore(rawAgendaScore), Math.max(52, Math.min(72, topEventScore + 4)));
}

function clusterBreadthBonus(eventCount: number, sourceCount: number, articleCount: number): number {
  return Math.min(8, Math.max(0, Math.min(4, eventCount - 1) + Math.min(3, sourceCount - 1) + Math.min(3, Math.floor(articleCount / 4))));
}

function coverageLevelScore(value: unknown): number {
  const normalized = normalizeText(value);
  if (normalized.includes("high") || normalized.includes("υψη")) return 82;
  if (normalized.includes("medium") || normalized.includes("μεσα")) return 58;
  if (normalized.includes("low") || normalized.includes("χαμη")) return 34;
  return 0;
}

function realNewsCoverageScore(agendaTopic: any, advisorBrief: any, fallbackCoverageScore: number): number {
  const coverageFromLevel = coverageLevelScore(agendaTopic?.coverage_level);
  const sourceDiversityScore = clampScore(toNumber(agendaTopic?.source_diversity) * 16);
  const advisorArticleScore = clampScore(toNumber(advisorBrief?.article_count) * 8 + toNumber(advisorBrief?.source_count) * 14);
  const advisorScore = toNumber(advisorBrief?.agenda_score);

  return Math.max(coverageFromLevel, sourceDiversityScore, advisorArticleScore, advisorScore, fallbackCoverageScore);
}

function realTrendScore(trend: any, agendaTopic: any): number {
  if (isApifyGoogleTrend(trend)) return clampScore(toNumber(trend?.search_interest_score, 0));
  return Math.max(
    toNumber(trend?.search_interest_score, 0),
    toNumber(agendaTopic?.public_attention_signal, 0)
  );
}

function realAgendaScore(agendaTopic: any, advisorBrief: any): number {
  return Math.max(
    toNumber(agendaTopic?.agenda_score, 0),
    toNumber(advisorBrief?.agenda_score, 0),
    toNumber(agendaTopic?.internal_relevance, 0)
  );
}


function compareEditorialProminenceRows(a: any, b: any): number {
  const scoreDiff = toNumber(b?.editorial_prominence_score, 0) - toNumber(a?.editorial_prominence_score, 0);
  if (scoreDiff !== 0) return scoreDiff;

  const sourceDiff = toNumber(b?.source_count, 0) - toNumber(a?.source_count, 0);
  if (sourceDiff !== 0) return sourceDiff;

  const signalDiff = toNumber(b?.signal_count, 0) - toNumber(a?.signal_count, 0);
  if (signalDiff !== 0) return signalDiff;

  return toTime(b?.newest_observed_at) - toTime(a?.newest_observed_at);
}

function bestEditorialProminenceRow(rows: any[]): any | null {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [...rows].sort(compareEditorialProminenceRows)[0] || null;
}

function editorialProminenceForAgenda(
  topicCandidates: string[],
  editorialProminenceRows: any[],
  microAgendaId: string,
  microAgenda: string,
  parentTopic: string
): any | null {
  if (!Array.isArray(editorialProminenceRows) || !editorialProminenceRows.length) return null;

  const microNorm = normalizeText(microAgenda);
  const parentNorm = normalizeText(parentTopic);
  const candidateNorms = topicCandidates.map((candidate) => normalizeText(candidate)).filter(Boolean);

  const exactMicroIdRows = editorialProminenceRows.filter((row) => String(row?.micro_agenda_id || "") === microAgendaId);
  const exactMicroId = bestEditorialProminenceRow(exactMicroIdRows);
  if (exactMicroId) return exactMicroId;

  const exactMicroTopicRows = editorialProminenceRows.filter((row) => normalizeText(row?.topic) === microNorm);
  const exactMicroTopic = bestEditorialProminenceRow(exactMicroTopicRows);
  if (exactMicroTopic) return exactMicroTopic;

  const strongMicroRows = editorialProminenceRows.filter((row) => {
    const rowTopic = normalizeText(row?.topic);
    if (!rowTopic) return false;
    if (isParentOnlyRealSignal(row?.topic, microAgenda, parentTopic)) return false;
    return rowTopic === microNorm || rowTopic.includes(microNorm) || microNorm.includes(rowTopic);
  });
  const strongMicro = bestEditorialProminenceRow(strongMicroRows);
  if (strongMicro) return strongMicro;

  const parentFallbackRows = editorialProminenceRows.filter((row) => {
    const rowTopic = normalizeText(row?.topic);
    const rowParent = normalizeText(row?.parent_topic);
    return rowTopic === parentNorm || rowParent === parentNorm || candidateNorms.includes(rowTopic);
  });

  return bestEditorialProminenceRow(parentFallbackRows);
}

function realFrontpageProminenceScore(editorialProminence: any, parentOnlyEditorialProminence = false): number {
  const rawScore = clampScore(toNumber(editorialProminence?.editorial_prominence_score, 0));
  // v5.4: exact micro-agenda frontpage signal can fully boost an agenda.
  // Parent-only editorial fallback is useful context, but must not let adjacent micro-agendas
  // inherit the full frontpage power of another micro-agenda under the same parent.
  if (parentOnlyEditorialProminence) return Math.min(rawScore, 42);
  return rawScore;
}

function rawFrontpageProminenceScore(editorialProminence: any): number {
  return clampScore(toNumber(editorialProminence?.editorial_prominence_score, 0));
}

function editorialTopItems(editorialProminence: any): any[] {
  const raw = editorialProminence?.top_items;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.slice(0, 5);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function editorialRelevanceScore(agendaTopic: any, advisorBrief: any, group: { parentTopic: string; classification: ClassificationResult; events: any[] }): number {
  const internal = toNumber(agendaTopic?.internal_relevance, 0);
  const politicalRisk = normalizeText(agendaTopic?.political_risk_level || advisorBrief?.political_risk_level);
  const hasAdvisorBrief = advisorBrief ? 18 : 0;
  const importantParent = ["οικονομια", "στεγαση", "αμυνα", "γεωπολιτικ", "πολιτικη", "τραπεζ", "μεταναστευτικ"].some((term) => normalizeText(group.parentTopic).includes(term));
  const riskBonus = politicalRisk.includes("high") || politicalRisk.includes("υψη") ? 20 : politicalRisk.includes("medium") || politicalRisk.includes("μεσα") ? 10 : 0;

  return clampScore(Math.max(internal, hasAdvisorBrief) + riskBonus + (importantParent ? 10 : 0));
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

function buildAgendaItem(
  group: { parentTopic: string; parentTopics: Set<string>; classification: ClassificationResult; events: any[] },
  trends: any[],
  agendaTopics: any[],
  advisorBriefs: any[],
  editorialProminenceRows: any[],
  debug: boolean,
  partyKey: string | null = null,
  partyProfile: PoliticalPartyProfile | null = null
) {
  // Ιεράρχηση γεγονότων ΜΕΣΑ στο cluster: όχι μόνο event_score (που δίνει άδικα
  // 71 σε μονό άρθρο), αλλά συνδυασμός με ΠΡΑΓΜΑΤΙΚΗ κάλυψη (άρθρα + πηγές) και
  // φρεσκάδα. Έτσι η πολυκαλυμμένη είδηση της ημέρας (π.χ. τρομοκρατική επίθεση με
  // 11 άρθρα / 5 πηγές) ανεβαίνει πάνω από ένα μονό-άρθρο event.
  const eventRankScore = (e: any): number => {
    const base = toNumber(e?.event_score);
    const articles = toNumber(e?.article_count);
    const sources = toNumber(e?.source_count);
    const hoursAgo = hoursOld(e?.last_article_at ?? e?.newest_article_at);
    const freshBonus = hoursAgo === null ? 0 : hoursAgo <= 24 ? 12 : hoursAgo <= 48 ? 6 : 0;
    const coverageBonus = Math.min(30, articles * 2 + sources * 3);
    return base + coverageBonus + freshBonus;
  };
  const sortedEvents = [...group.events].sort((a, b) => eventRankScore(b) - eventRankScore(a));
  const bestEvent = sortedEvents[0];
  const topicCandidates = [group.classification.micro_agenda, group.parentTopic, ...Array.from(group.parentTopics)];
  const trend = trendForAgenda(topicCandidates, trends, group.classification.micro_agenda, group.parentTopic);
  const matchedAgendaTopic = agendaTopicForAgenda(topicCandidates, agendaTopics);
  const matchedAdvisorBrief = advisorBriefForAgenda(topicCandidates, advisorBriefs);
  const matchedEditorialProminence = editorialProminenceForAgenda(
    topicCandidates,
    editorialProminenceRows,
    group.classification.micro_agenda_id,
    group.classification.micro_agenda,
    group.parentTopic
  );
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
  const fallbackCoverageScore = clampScore(eventCount * 12 + articleCount * 6 + sourceCount * 12);
  const parentOnlyAgendaTopic = isParentOnlyRealSignal(matchedAgendaTopic?.name, group.classification.micro_agenda, group.parentTopic);
  const parentOnlyAdvisorBrief = isParentOnlyRealSignal(matchedAdvisorBrief?.topic, group.classification.micro_agenda, group.parentTopic);
  const parentOnlyTrend = isParentOnlyRealSignal(trend?.topic, group.classification.micro_agenda, group.parentTopic);
  const parentOnlyEditorialProminence = isParentOnlyRealSignal(matchedEditorialProminence?.topic, group.classification.micro_agenda, group.parentTopic);
  const parentOnlySignal = Boolean(
    (matchedAgendaTopic && parentOnlyAgendaTopic) ||
    (matchedAdvisorBrief && parentOnlyAdvisorBrief) ||
    (trend && parentOnlyTrend) ||
    (matchedEditorialProminence && parentOnlyEditorialProminence)
  );
  const rawCoverageScore = realNewsCoverageScore(matchedAgendaTopic, matchedAdvisorBrief, fallbackCoverageScore);
  const coverageScore = calibratedCoverageScore(rawCoverageScore, fallbackCoverageScore, parentOnlySignal);
  const trendScore = realTrendScore(trend, matchedAgendaTopic);
  const rawAgendaSignalScore = realAgendaScore(matchedAgendaTopic, matchedAdvisorBrief);
  const agendaSignalScore = calibratedAgendaSignalScore(rawAgendaSignalScore, topEventScore, parentOnlySignal);
  const rawFrontpageProminenceScoreValue = rawFrontpageProminenceScore(matchedEditorialProminence);
  const frontpageProminenceScore = realFrontpageProminenceScore(matchedEditorialProminence, parentOnlyEditorialProminence);
  const editorialScore = editorialRelevanceScore(matchedAgendaTopic, matchedAdvisorBrief, group);
  const hasRealSignalBridge = Boolean(matchedAgendaTopic || matchedAdvisorBrief || trend || matchedEditorialProminence);
  const breadthBonus = clusterBreadthBonus(eventCount, sourceCount, articleCount);

  const hasClusterEvidence = eventCount >= 2 || articleCount >= 3 || sourceCount >= 2;
  const highSeverity = isHighSeveritySingleEvent(bestEvent);

  let type = "monitoring_event";
  if (hasClusterEvidence) type = "agenda_cluster";
  else if (highSeverity) type = "high_severity_single_event";

  const standardRawScore = clampScore(
    0.36 * topEventScore +
      0.14 * agendaSignalScore +
      0.16 * coverageScore +
      0.12 * trendScore +
      0.12 * frontpageProminenceScore +
      0.07 * freshness +
      0.03 * doc +
      breadthBonus
  );

  // ΕΝΑ σκορ για όλα τα γεγονότα, με βάση τα πραγματικά σήματα (εξώφυλλα + κάλυψη +
  // αναζητήσεις). Τα ευαίσθητα ΔΕΝ έχουν πλέον ξεχωριστή, υποβαθμισμένη φόρμουλα:
  // αν παίζουν στα πρωτοσέλιδα, παίρνουν το ίδιο frontpage bonus με όλα τα άλλα.
  const rawScore = standardRawScore;
  let finalScore = type === "monitoring_event" ? Math.min(rawScore, CONFIG.monitoringCap) : rawScore;
  // ΑΡΧΗ: η κατάταξη ορίζεται από τα ΠΡΑΓΜΑΤΙΚΑ σήματα (εξώφυλλα, κάλυψη, αναζητήσεις).
  // ΔΕΝ επιβάλλουμε τεχνητό κόφτη σε βίαια/ευαίσθητα γεγονότα: αν κάτι παίζει στα
  // πρωτοσέλιδα, ανεβαίνει — είτε είναι τρομοκρατική επίθεση, είτε γυναικοκτονία, είτε
  // μολότοφ. Η ευαισθησία (requires_human_review / ranking_policy / show_in_strategy_room)
  // επηρεάζει ΜΟΝΟ τον ΤΟΝΟ και τον χειρισμό του περιεχομένου, όχι το αν/πόσο ψηλά φαίνεται.
  const eventLimit = debug ? CONFIG.topDebugEventsPerAgenda : CONFIG.topBriefEventsPerAgenda;
  const evidenceLimit = debug ? CONFIG.topDebugEvidencePerAgenda : CONFIG.topBriefEvidencePerAgenda;
  const researchContext = buildAgendaResearchContext({
    microAgendaId: group.classification.micro_agenda_id,
    microAgenda: group.classification.micro_agenda,
    parentTopic: group.parentTopic,
    eventTitle: bestEvent?.title || group.classification.micro_agenda,
    eventText: sortedEvents.map((event) => `${event?.title || ""} ${event?.summary || ""}`).join(" ").slice(0, 4000),
    partyKey,
    partyProfile,
  });


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
    real_agenda_score: agendaSignalScore,
    real_news_coverage_score: coverageScore,
    real_trend_score: trendScore,
    real_frontpage_prominence_score: frontpageProminenceScore,
    raw_frontpage_prominence_score: rawFrontpageProminenceScoreValue,
    editorial_relevance_score: editorialScore,
    signal_bridge: {
      matched_agenda_topic: matchedAgendaTopic?.name || null,
      matched_advisor_topic: matchedAdvisorBrief?.topic || null,
      matched_trend_topic: trend?.topic || null,
      matched_editorial_topic: matchedEditorialProminence?.topic || null,
      uses_agenda_topics: Boolean(matchedAgendaTopic),
      uses_advisor_agenda_briefs: Boolean(matchedAdvisorBrief),
      uses_topic_trend_signals: Boolean(trend),
      uses_editorial_prominence_signals: Boolean(matchedEditorialProminence),
      has_real_signal_bridge: hasRealSignalBridge,
      parent_only_signal: parentOnlySignal,
      parent_only_agenda_topic: parentOnlyAgendaTopic,
      parent_only_advisor_brief: parentOnlyAdvisorBrief,
      parent_only_trend: parentOnlyTrend,
      parent_only_editorial_prominence: parentOnlyEditorialProminence,
      frontpage_layer_present: Array.isArray(editorialProminenceRows) && editorialProminenceRows.length > 0,
      frontpage_signal_present: Boolean(matchedEditorialProminence),
      editorial_prominence_score: frontpageProminenceScore,
      raw_editorial_prominence_score: rawFrontpageProminenceScoreValue,
      editorial_parent_fallback_cap_applied: Boolean(parentOnlyEditorialProminence && rawFrontpageProminenceScoreValue > frontpageProminenceScore),
      editorial_signal_count: toNumber(matchedEditorialProminence?.signal_count, 0),
      editorial_source_count: toNumber(matchedEditorialProminence?.source_count, 0),
      editorial_top_items: editorialTopItems(matchedEditorialProminence),
    },
    score_components: {
      event_or_agenda_signal: Math.max(topEventScore, agendaSignalScore),
      raw_agenda_signal: rawAgendaSignalScore,
      news_coverage: coverageScore,
      raw_news_coverage: rawCoverageScore,
      trends_public_pulse: trendScore,
      frontpage_editorial_prominence: frontpageProminenceScore,
      raw_frontpage_editorial_prominence: rawFrontpageProminenceScoreValue,
      frontpage_parent_fallback_cap_applied: Boolean(parentOnlyEditorialProminence && rawFrontpageProminenceScoreValue > frontpageProminenceScore),
      editorial_relevance: editorialScore,
      freshness,
      documentation: doc,
      cluster_breadth_bonus: breadthBonus,
      parent_only_signal: parentOnlySignal,
      formula: sensitivity.ranking_policy === "do_not_optimize_for_engagement"
        ? "sensitive capped: event + coverage + freshness + documentation"
        : "v5.7: 36% event + 14% agenda + 16% calibrated coverage + 12% micro-agenda-preferred trends + 12% frontpage editorial prominence with parent-fallback cap + 7% freshness + 3% documentation + breadth bonus, enriched with party-profile narrative intelligence and premium research context",
    },
    search_interest_score: sensitivity.ranking_policy === "do_not_optimize_for_engagement" ? null : trendScore,
    search_interest_status: trend?.search_interest_status || matchedAgendaTopic?.public_attention_signal ? "real_signal_bridge" : "no_trend_signal",
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
    research_context: researchContext,
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

function buildLiveAgenda(events: any[], trends: any[], agendaTopics: any[], advisorBriefs: any[], editorialProminenceRows: any[], debug: boolean, partyKey: string | null = null, partyProfile: PoliticalPartyProfile | null = null) {
  const filteredEvents = events.filter((event) => !isSportsNoiseEvent(event));
  const sportsNoiseEventsFiltered = events.length - filteredEvents.length;
  const items = groupEvents(filteredEvents).map((group) => buildAgendaItem(group, trends, agendaTopics, advisorBriefs, editorialProminenceRows, debug, partyKey, partyProfile));
  const agendaClusters = items
    .filter((item) => item.type !== "monitoring_event")
    .sort((a, b) => b.score - a.score || b.top_event_score - a.top_event_score || b.event_count - a.event_count);
  const monitoringEvents = items
    .filter((item) => item.type === "monitoring_event")
    .sort((a, b) => b.top_event_score - a.top_event_score)
    .slice(0, debug ? 40 : 12);

  return { agenda_clusters: agendaClusters, monitoring_events: monitoringEvents, all_items: items, sports_noise_events_filtered: sportsNoiseEventsFiltered };
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

  const agendaTopicsQuery = supabase
    .from("agenda_topics")
    .select("name,category,agenda_score,coverage_level,source_diversity,documentation_level,public_attention_signal,internal_relevance,political_risk_level,last_computed_at,events_detected_at")
    .order("last_computed_at", { ascending: false, nullsFirst: false })
    .limit(250);

  const advisorBriefsQuery = supabase
    .from("v_advisor_agenda_briefs_recent")
    .select("topic,article_count,source_count,political_articles,agenda_score,documentation_level,political_risk_level,latest_seen_at")
    .order("latest_seen_at", { ascending: false, nullsFirst: false })
    .limit(250);

  const editorialProminenceQuery = supabase
    .from("v_editorial_prominence_recent")
    .select("micro_agenda_id,topic,parent_topic,editorial_prominence_score,signal_count,source_count,newest_observed_at,top_items")
    .order("editorial_prominence_score", { ascending: false, nullsFirst: false })
    .limit(250);

  const legacyQuery = supabase
    .from("v_situation_engine_live")
    .select("id,title,topic,priority_score,last_seen_at,last_computed_at,evidence_article_count")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(31);

  const partyProfilesQuery = supabase
    .from("political_party_profiles")
    .select("*")
    .limit(250);

  const [eventsResult, trendsResult, agendaTopicsResult, advisorBriefsResult, editorialProminenceResult, legacyResult, partyProfilesResult] = await Promise.all([
    eventsQuery,
    trendsQuery,
    agendaTopicsQuery,
    advisorBriefsQuery,
    editorialProminenceQuery,
    legacyQuery,
    partyProfilesQuery,
  ]);

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
  const agendaTopics = Array.isArray(agendaTopicsResult.data) ? agendaTopicsResult.data : [];
  const advisorBriefs = Array.isArray(advisorBriefsResult.data) ? advisorBriefsResult.data : [];
  const editorialProminenceRows = Array.isArray(editorialProminenceResult.data) ? editorialProminenceResult.data : [];
  const legacySituations = Array.isArray(legacyResult.data) ? legacyResult.data : [];
  const partyProfiles = Array.isArray(partyProfilesResult.data) ? (partyProfilesResult.data as PoliticalPartyProfile[]) : [];

  const newestLegacySeenAt = legacySituations.length
    ? legacySituations
        .map((s: any) => s?.last_seen_at)
        .filter(Boolean)
        .sort((a, b) => toTime(b) - toTime(a))[0]
    : null;
  const legacyHoursOld = newestLegacySeenAt ? hoursOld(newestLegacySeenAt) : null;
  const partyKey = searchParams.get("party") || null;
  const partyProfile = selectPartyProfile(partyKey, partyProfiles);
  const result = buildLiveAgenda(events, trends, agendaTopics, advisorBriefs, editorialProminenceRows, debug, partyKey, partyProfile);

  const diagnostics = {
    read_only: true,
    writes_to_database: false,
    auth_mode: auth.mode,
    dev_token_allowed_in_this_environment: (auth as any).devTokenAllowed ?? null,
    source_events: "v_political_events_live",
    source_trends: "topic_trend_signals",
    source_agenda_topics: "agenda_topics",
    source_advisor_agenda_briefs: "v_advisor_agenda_briefs_recent",
    source_editorial_prominence: "v_editorial_prominence_recent",
    source_research_context: "public/noraya-data/public_opinion.csv + leader_traits.csv + vote_intention.csv + political_party_profiles",
    source_party_profiles: "political_party_profiles",
    party_key: partyKey,
    party_profile_found: Boolean(partyProfile),
    party_profile_name: partyProfile?.party_name || partyProfile?.short_name || null,
    party_profiles_error: partyProfilesResult.error?.message ?? null,
    research_context_version: RESEARCH_CONTEXT_VERSION,
    frontpage_layer_present: editorialProminenceRows.length > 0,
    frontpage_layer_note: "v5.7 fuses frontpage editorial prominence with research context and the real political_party_profiles source of truth, including red lines and advisor instructions.",
    legacy_situations_source: "v_situation_engine_live",
    event_rows_considered: events.length,
    event_rows_total_matching_window: eventsResult.count,
    trend_rows_considered: trends.length,
    agenda_topic_rows_considered: agendaTopics.length,
    advisor_agenda_brief_rows_considered: advisorBriefs.length,
    editorial_prominence_rows_considered: editorialProminenceRows.length,
    formula_version: CONFIG.formulaVersion,
    sports_noise_events_filtered: result.sports_noise_events_filtered,
    calibration_note: "v5.7 keeps micro-agenda trend preference, caps parent-only frontpage fallback, fixes mappings, and feeds narrative intelligence from public opinion, leader traits, vote intention, and political_party_profiles red lines.",
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
      "real_signal_parent_only_calibration",
      "sports_noise_exclusion",
      "score_spread_calibration",
      "micro_agenda_trend_preference",
      "apify_google_trends_preferred_over_parent_fallback",
      "frontpage_editorial_prominence_fusion",
      "political_economic_frontpages_only",
      "frontpage_parent_fallback_cap",
      "research_context_from_public_opinion_leader_traits_vote_intention",
      "party_profile_source_of_truth",
      "party_red_lines_in_narrative",
      "advisor_instructions_in_narrative",
      "tax_social_support_mapping_corrections",
      "paid_leave_disambiguation",
    ],
    newest_legacy_situation_seen_at: newestLegacySeenAt,
    newest_legacy_situation_hours_old:
      legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? Math.round(legacyHoursOld) : null,
    legacy_situations_are_stale_for_today:
      legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? legacyHoursOld > 48 : null,
    trends_error: trendsResult.error?.message ?? null,
    editorial_prominence_error: editorialProminenceResult.error?.message ?? null,
    legacy_error: legacyResult.error?.message ?? null,
  };

  const basePayload = {
    success: true,
    mode: "read_only_real_signal_bridge_frontpage_fusion_v5_7_party_profile_narrative_intelligence",
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
        sports_noise_events_filtered: result.sports_noise_events_filtered,
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
