import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MicroAgendaRule = {
  id: string;
  label: string;
  parentHints: string[];
  keywords: string[];
};

type MicroAgendaMatch = {
  id: string;
  label: string;
  confidence: number;
  matched_keywords: string[];
  fallback: boolean;
};

const MICRO_AGENDA_RULES: MicroAgendaRule[] = [
  {
    id: "water_scarcity",
    label: "Λειψυδρία / διαχείριση νερού",
    parentHints: ["περιβαλλον", "κλιμα", "υποδομ", "τοπικ"],
    keywords: ["λειψυδρ", "νερο", "νερου", "υδρευση", "υδρευ", "υδατ", "ξηρασια", "αφαλατ", "πισιν", "εξοικονομηση", "σπαταλ", "υδροδοτηση", "water", "drought"],
  },
  {
    id: "heat_extreme_weather",
    label: "Καύσωνες / ακραία καιρικά φαινόμενα",
    parentHints: ["περιβαλλον", "κλιμα", "πολιτικη προστασια"],
    keywords: ["καυσω", "θερμικ", "θερμοκρασι", "κακοκαιρι", "καιρικ", "πλημμυρ", "θυελλ", "χιονοπτω", "extreme", "heat"],
  },
  {
    id: "wildfire_civil_protection",
    label: "Πυροπροστασία / πολιτική προστασία",
    parentHints: ["περιβαλλον", "κλιμα", "πολιτικη προστασια", "ασφαλ"],
    keywords: ["πυρκαγι", "φωτι", "δασικ", "αντιπυρ", "πυροπροστα", "καθαρισμ", "οικοπεδ", "112", "πολιτικη προστασια", "civil protection"],
  },
  {
    id: "pollution_waste",
    label: "Ρύπανση / απόβλητα / χωματερές",
    parentHints: ["περιβαλλον", "τοπικ", "υγει"],
    keywords: ["ρυπαν", "αποβλη", "χωματερ", "σκουπιδ", "λυματ", "ανακυκλ", "τοξικ", "πλαστικ", "pollution", "waste"],
  },
  {
    id: "climate_transition_policy",
    label: "Κλιματική πολιτική / πράσινη μετάβαση",
    parentHints: ["περιβαλλον", "κλιμα", "ενεργ"],
    keywords: ["κλιματικ", "πρασινη μεταβαση", "εκπομπ", "διοξειδιο", "ανθρακ", "βιωσιμ", "net zero", "climate"],
  },
  {
    id: "energy_prices_grid",
    label: "Ενέργεια / τιμές / δίκτυα",
    parentHints: ["ενεργ", "οικονομ", "περιβαλλον"],
    keywords: ["ενεργ", "ρευμα", "ηλεκτρ", "τιμολογ", "λογαριασμ", "φυσικο αεριο", "απε", "ανεμογεν", "φωτοβολτα", "δεδδηε", "αδμηε", "energy"],
  },
  {
    id: "cost_of_living_inflation",
    label: "Ακρίβεια / κόστος ζωής",
    parentHints: ["οικονομ", "κοινων", "καταναλω"],
    keywords: ["ακριβ", "πληθωρισ", "τιμε", "τιμων", "καλαθι", "σουπερ", "τροφ", "καταναλωτ", "κοστος ζωης", "αισχροκερδ", "inflation"],
  },
  {
    id: "taxes_public_revenue",
    label: "Φορολογία / δημόσια έσοδα",
    parentHints: ["οικονομ", "φορολογ"],
    keywords: ["φορο", "εφορια", "τεκμηρι", "φπα", "ενφια", "ααδε", "δηλωσ", "εισοδημ", "tax"],
  },
  {
    id: "public_debt_budget",
    label: "Δημόσια οικονομικά / χρέος / προϋπολογισμός",
    parentHints: ["οικονομ", "δημοσιονομ"],
    keywords: ["χρεος", "προυπολογισ", "δημοσιονομ", "ελλειμμα", "πλεονασμα", "δαπαν", "εσοδα", "οικος αξιολογησης", "debt", "budget"],
  },
  {
    id: "banks_loans_private_debt",
    label: "Τράπεζες / δάνεια / ιδιωτικό χρέος",
    parentHints: ["οικονομ", "στεγασ", "κοινων"],
    keywords: ["τραπεζ", "δανει", "κοκκινα", "fund", "servicer", "πλειστηριασ", "οφειλ", "ιδιωτικο χρεος", "loans"],
  },
  {
    id: "development_investment_business",
    label: "Ανάπτυξη / επενδύσεις / επιχειρήσεις",
    parentHints: ["οικονομ", "αναπτυξ", "επιχειρ"],
    keywords: ["αναπτυξ", "επενδυ", "επιχειρ", "βιομηχαν", "εξαγωγ", "αγορα", "ανταγωνισ", "startup", "investment"],
  },
  {
    id: "public_procurement_corruption",
    label: "Δημόσιες συμβάσεις / διαφάνεια / σκάνδαλα",
    parentHints: ["θεσμ", "δικαιοσυν", "οικονομ", "διαφθορα"],
    keywords: ["συμβασ", "αναθεσ", "διαγωνισμ", "προμηθει", "σκανδαλ", "διαφθο", "μίζ", "οπεκεπε", "ελεγκτικ", "procurement"],
  },
  {
    id: "housing_rents",
    label: "Στέγαση / ενοίκια",
    parentHints: ["στεγασ", "κοινων", "οικονομ"],
    keywords: ["στεγασ", "ενοικ", "ενοίκ", "κατοικ", "airbnb", "βραχυχρον", "σπιτι", "ακινητ", "πρωτη κατοικια", "housing", "rent"],
  },
  {
    id: "social_housing_youth_family",
    label: "Κοινωνική κατοικία / νέοι / οικογένεια",
    parentHints: ["στεγασ", "κοινων", "νεολαι"],
    keywords: ["κοινωνικη κατοικ", "σπιτι μου", "νεοι", "νεα ζευγαρια", "οικογεν", "επιδότηση ενοικ", "επιδότηση στεγ"],
  },
  {
    id: "wages_working_conditions",
    label: "Μισθοί / εργασιακές συνθήκες",
    parentHints: ["εργασ", "κοινων", "οικονομ"],
    keywords: ["μισθ", "κατώτατ", "συμβασ", "εργασιακ", "ωραρι", "υπερωρ", "τηλεργασ", "burnout", "bullying", "εργοδοτ", "salary", "wage"],
  },
  {
    id: "unemployment_precarity",
    label: "Ανεργία / επισφάλεια / αγορά εργασίας",
    parentHints: ["εργασ", "οικονομ", "νεολαι"],
    keywords: ["ανεργ", "επισφαλ", "οαεδ", "δυπα", "απασχολ", "αγορα εργασιας", "job", "employment"],
  },
  {
    id: "pensions_social_security",
    label: "Συντάξεις / ασφαλιστικό",
    parentHints: ["εργασ", "κοινων", "οικονομ"],
    keywords: ["συνταξ", "εφκα", "ασφαλιστικ", "εισφορ", "αναδρομ", "επικουρ", "pension"],
  },
  {
    id: "hospitals_nhs",
    label: "Νοσοκομεία / ΕΣΥ",
    parentHints: ["υγει", "κοινων"],
    keywords: ["νοσοκομ", "εσυ", "ιατρ", "γιατρ", "νοσηλευ", "εφημερι", "χειρουργ", "κλιν", "ραντζ", "hospital", "nhs"],
  },
  {
    id: "medicine_access_pharma",
    label: "Φάρμακα / πρόσβαση / φαρμακευτική πολιτική",
    parentHints: ["υγει", "κοινων"],
    keywords: ["φαρμακ", "ελλειψ", "συνταγογραφ", "φαρμακοποι", "εοφ", "τιμη φαρμακ", "medicine", "pharma"],
  },
  {
    id: "public_health_mortality",
    label: "Δημόσια υγεία / επιδημίες / θνησιμότητα",
    parentHints: ["υγει", "κοινων"],
    keywords: ["δημοσια υγεια", "επιδημ", "covid", "γριπ", "θνησιμ", "καρκιν", "προληψ", "εμβολ", "public health"],
  },
  {
    id: "mental_health_addiction",
    label: "Ψυχική υγεία / εξαρτήσεις",
    parentHints: ["υγει", "κοινων", "νεολαι"],
    keywords: ["ψυχικ", "καταθλιψ", "αυτοκτον", "εξαρτη", "ναρκωτικ", "οκανα", "mental", "addiction"],
  },
  {
    id: "schools_teachers_exams",
    label: "Σχολεία / εκπαιδευτικοί / εξετάσεις",
    parentHints: ["παιδει", "εκπαιδευ"],
    keywords: ["σχολ", "μαθητ", "εκπαιδευτικ", "πανελλην", "εξετασ", "νηπιαγωγ", "λυκει", "γυμνασ", "school"],
  },
  {
    id: "universities_students",
    label: "Πανεπιστήμια / φοιτητές",
    parentHints: ["παιδει", "εκπαιδευ", "νεολαι"],
    keywords: ["πανεπιστημ", "φοιτη", "αει", "ιδιωτικα πανεπιστημ", "καταληψ", "ερευν", "university"],
  },
  {
    id: "minors_youth_violence",
    label: "Ανήλικοι / νεανική βία",
    parentHints: ["ασφαλ", "κοινων", "παιδει"],
    keywords: ["ανηλικ", "νεανικ", "σχολικη βια", "bullying", "συμμορι", "ξυλοδαρ", "μαθητ", "juvenile"],
  },
  {
    id: "gender_violence_domestic",
    label: "Έμφυλη / ενδοοικογενειακή βία",
    parentHints: ["ασφαλ", "κοινων", "δικαιοσυν"],
    keywords: ["γυναικοκτον", "ενδοοικογενειακ", "εμφυλ", "κακοποι", "βιασμ", "παρενοχλ", "domestic violence"],
  },
  {
    id: "organized_crime_drugs",
    label: "Οργανωμένο έγκλημα / ναρκωτικά",
    parentHints: ["ασφαλ", "δικαιοσυν"],
    keywords: ["οργανωμενο εγκλημα", "μαφια", "κυκλωμ", "ναρκωτικ", "οπλ", "εκβιασ", "δολοφον", "crime", "drugs"],
  },
  {
    id: "policing_public_order",
    label: "Αστυνόμευση / δημόσια τάξη",
    parentHints: ["ασφαλ", "θεσμ"],
    keywords: ["αστυνομ", "ελας", "καταδιωξ", "επεισοδ", "δημοσια ταξη", "διαδηλω", "police"],
  },
  {
    id: "migration_asylum_borders",
    label: "Μεταναστευτικό / άσυλο / σύνορα",
    parentHints: ["μεταναστ", "ασφαλ", "εξωτερ"],
    keywords: ["μεταναστ", "προσφυγ", "ασυλο", "συνορ", "εβρος", "δομ", "διασωσ", "παρατυπ", "migration", "asylum"],
  },
  {
    id: "courts_rule_of_law",
    label: "Δικαιοσύνη / κράτος δικαίου",
    parentHints: ["δικαιοσυν", "θεσμ"],
    keywords: ["δικαιοσυν", "δικαστ", "εισαγγελ", "αρειος παγος", "συμβουλιο επικρατειας", "κρατος δικαιου", "rule of law"],
  },
  {
    id: "parliament_government_institutions",
    label: "Κυβέρνηση / Βουλή / θεσμοί",
    parentHints: ["θεσμ", "πολιτικ", "κυβερν"],
    keywords: ["κυβερν", "βουλη", "υπουργ", "νομοσχεδ", "τροπολογ", "θεσμ", "παραιτησ", "ανασχηματισ", "parliament"],
  },
  {
    id: "elections_polls_parties",
    label: "Εκλογές / δημοσκοπήσεις / κόμματα",
    parentHints: ["πολιτικ", "κομμα", "εκλογ"],
    keywords: ["εκλογ", "δημοσκοπ", "κομμα", "ψηφοφορ", "καλπη", "ευρωεκλογ", "ποσοστ", "poll", "election"],
  },
  {
    id: "local_government_municipal",
    label: "Αυτοδιοίκηση / δήμοι / περιφέρειες",
    parentHints: ["τοπικ", "αυτοδιοικ", "περιφερ"],
    keywords: ["δημαρχ", "δημοτικ", "δημος", "περιφερ", "αυτοδιοικ", "κοινοτητα", "municipal"],
  },
  {
    id: "greece_turkey_foreign_policy",
    label: "Ελληνοτουρκικά / εξωτερική πολιτική",
    parentHints: ["εξωτερ", "αμυν", "διεθν"],
    keywords: ["τουρκ", "αιγαιο", "κυπρ", "υφαλοκρηπ", "αοζ", "ελληνοτουρκ", "διπλωματ", "foreign policy"],
  },
  {
    id: "defense_security_armed_forces",
    label: "Άμυνα / εξοπλισμοί / ένοπλες δυνάμεις",
    parentHints: ["αμυν", "ασφαλ", "εξωτερ"],
    keywords: ["αμυν", "στρατ", "ενοπλες", "εξοπλισ", "φρεγατ", "rafale", "f35", "νατο", "defense"],
  },
  {
    id: "eu_international_geopolitics",
    label: "ΕΕ / διεθνείς εξελίξεις / γεωπολιτική",
    parentHints: ["εξωτερ", "ευρωπ", "διεθν"],
    keywords: ["ευρωπαϊκ", "ευρωπη", "κομισιον", "ουκραν", "ρωσι", "μεσανατολ", "ισραηλ", "γεωπολιτ", "eu", "nato"],
  },
  {
    id: "farmers_agriculture_food_production",
    label: "Αγροτικό / παραγωγή τροφίμων",
    parentHints: ["αγρο", "οικονομ", "περιφερ"],
    keywords: ["αγροτ", "κτηνοτροφ", "καλλιεργ", "σοδει", "οπεκεπε", "επιδοτ", "γαλα", "ελαιολαδο", "σιτηρ", "farmers", "agriculture"],
  },
  {
    id: "transport_rail_roads",
    label: "Μεταφορές / σιδηρόδρομος / οδικά δίκτυα",
    parentHints: ["υποδομ", "μεταφορ", "ασφαλ"],
    keywords: ["σιδηροδρομ", "τρενο", "οσε", "τεμπη", "δρομο", "οδικ", "λεωφορει", "μετρο", "λιμαν", "transport", "rail"],
  },
  {
    id: "public_infrastructure_projects",
    label: "Υποδομές / δημόσια έργα",
    parentHints: ["υποδομ", "αναπτυξ", "τοπικ"],
    keywords: ["υποδομ", "εργο", "εργολαβ", "κατασκευ", "γεφυρ", "φραγμα", "δικτυ", "αναπλασ", "infrastructure"],
  },
  {
    id: "digital_ai_cybersecurity",
    label: "Ψηφιακό κράτος / AI / κυβερνοασφάλεια",
    parentHints: ["ψηφιακ", "τεχνολογ", "θεσμ"],
    keywords: ["ψηφιακ", "gov.gr", "τεχνητη νοημοσυνη", "ai", "κυβερνο", "δεδομεν", "προσωπικα δεδομενα", "privacy", "cyber"],
  },
  {
    id: "tourism_culture_sports",
    label: "Τουρισμός / πολιτισμός / αθλητισμός",
    parentHints: ["τουρισ", "πολιτισ", "αθλητισ"],
    keywords: ["τουρισ", "ξενοδοχ", "επισκεπτ", "πολιτισ", "μουσει", "αθλητ", "ποδοσφαιρ", "ολυμπιακ", "tourism", "culture"],
  },
  {
    id: "poverty_welfare_vulnerable_groups",
    label: "Φτώχεια / κοινωνικό κράτος / ευάλωτες ομάδες",
    parentHints: ["κοινων", "προνοια", "οικονομ"],
    keywords: ["φτωχ", "επιδομ", "κοινωνικο κρατος", "ευαλωτ", "αναπηρ", "αμεα", "αστεγ", "παιδικη φτωχεια", "welfare", "poverty"],
  },
  {
    id: "demographics_family_children",
    label: "Δημογραφικό / οικογένεια / παιδιά",
    parentHints: ["κοινων", "δημογραφ", "οικογεν"],
    keywords: ["δημογραφ", "γεννησ", "οικογεν", "παιδι", "τριτεκν", "πολυτεκν", "γονει", "υπογεννητικ", "demographic"],
  },
];

const STOPWORDS = [
  "στη", "στο", "στην", "στον", "στις", "στους", "και", "για", "απο", "των", "της", "τον", "την", "στο", "με", "σε", "που", "ενα", "μια", "εως", "κατα", "μετα", "προς", "χωρις", "ειναι", "αυτο", "αυτη", "αυτοσ", "νεα", "νέο", "νέος", "ελλαδα", "ελλην", "πολιτικ", "κοινων", "δημοτικ", "κυβερνητικ"
];

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
  if (normalized.includes("strong") || normalized.includes("high") || normalized.includes("ισχυ")) return 100;
  if (normalized.includes("medium") || normalized.includes("μεσα")) return 65;
  if (normalized.includes("initial") || normalized.includes("low") || normalized.includes("αρχ")) return 35;
  return 40;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ΆΑ]/g, "α")
    .replace(/[ΈΕ]/g, "ε")
    .replace(/[ΉΗ]/g, "η")
    .replace(/[ΊΙΪ]/g, "ι")
    .replace(/[ΌΟ]/g, "ο")
    .replace(/[ΎΥΫ]/g, "υ")
    .replace(/[ΏΩ]/g, "ω")
    .toLowerCase();
}

function stringifyTerms(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "");
}

function evidenceArticles(row: any): any[] {
  return Array.isArray(row?.evidence_articles) ? row.evidence_articles : [];
}

function eventSearchText(event: any): string {
  const articleText = evidenceArticles(event)
    .map((article) => `${article?.title || ""} ${article?.source || ""}`)
    .join(" ");

  return normalizeText([
    event?.title,
    event?.summary,
    event?.topic,
    stringifyTerms(event?.detection_terms),
    articleText,
  ].join(" "));
}

function titleSignature(event: any): string {
  const raw = normalizeText(`${event?.title || ""} ${event?.summary || ""}`);
  const tokens = raw
    .split(/[^a-z0-9α-ω]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 5 && STOPWORDS.indexOf(token) === -1)
    .slice(0, 3);

  if (tokens.length > 0) return tokens.join("_");
  return String(event?.id || event?.event_key || "unknown").slice(0, 24);
}

function classifyMicroAgenda(event: any): MicroAgendaMatch {
  const text = eventSearchText(event);
  const parent = normalizeText(event?.topic);
  let bestRule: MicroAgendaRule | null = null;
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (let i = 0; i < MICRO_AGENDA_RULES.length; i += 1) {
    const rule = MICRO_AGENDA_RULES[i];
    const matches: string[] = [];

    for (let j = 0; j < rule.keywords.length; j += 1) {
      const keyword = normalizeText(rule.keywords[j]);
      if (keyword && text.includes(keyword)) matches.push(rule.keywords[j]);
    }

    if (matches.length === 0) continue;

    let score = matches.length * 10;
    for (let j = 0; j < rule.parentHints.length; j += 1) {
      const hint = normalizeText(rule.parentHints[j]);
      if (hint && parent.includes(hint)) score += 4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
      bestMatches = matches.slice(0, 8);
    }
  }

  if (bestRule) {
    return {
      id: bestRule.id,
      label: bestRule.label,
      confidence: Math.min(100, 45 + bestScore),
      matched_keywords: bestMatches,
      fallback: false,
    };
  }

  const parentLabel = String(event?.topic || "Μη ταξινομημένο").trim() || "Μη ταξινομημένο";
  return {
    id: `fallback_${titleSignature(event)}`,
    label: `${parentLabel} / ειδική υπόθεση`,
    confidence: 25,
    matched_keywords: [],
    fallback: true,
  };
}

function evidenceKey(article: any, fallback: string): string {
  return String(article?.article_id || article?.url || `${article?.source || "source"}-${article?.title || fallback}`);
}

function newestArticleAt(events: any[]): string | null {
  let newest = 0;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    newest = Math.max(newest, toTime(event?.last_article_at), toTime(event?.first_article_at), toTime(event?.first_seen_at));
    const articles = evidenceArticles(event);
    for (let j = 0; j < articles.length; j += 1) newest = Math.max(newest, toTime(articles[j]?.published_at));
  }
  return newest ? new Date(newest).toISOString() : null;
}

function topEvidence(events: any[]): any[] {
  const articles = new Map<string, any>();
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const evArticles = evidenceArticles(event);
    for (let j = 0; j < evArticles.length; j += 1) {
      const article = evArticles[j];
      const key = evidenceKey(article, `${event?.id || "event"}-${articles.size}`);
      const existing = articles.get(key);
      if (!existing || toNumber(article?.score) > toNumber(existing?.score)) articles.set(key, article);
    }
  }

  return Array.from(articles.values()).sort((a, b) => {
    const scoreDiff = toNumber(b?.score) - toNumber(a?.score);
    if (scoreDiff !== 0) return scoreDiff;
    return toTime(b?.published_at) - toTime(a?.published_at);
  }).slice(0, 8);
}

function uniqueSourceCount(events: any[]): number {
  const sources = new Set<string>();
  let declaredMax = 0;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    declaredMax = Math.max(declaredMax, toNumber(event?.source_count));
    const articles = evidenceArticles(event);
    for (let j = 0; j < articles.length; j += 1) {
      const source = String(articles[j]?.source || "").trim();
      if (source) sources.add(source);
    }
  }

  return Math.max(declaredMax, sources.size);
}

function isHighSeveritySingleEvent(event: any): boolean {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);
  const doc = documentationScore(event?.documentation_level);
  return score >= 88 || (score >= 80 && sourceCount >= 3) || (score >= 78 && articleCount >= 6) || (score >= 75 && sourceCount >= 3 && doc >= 65);
}

function classifyEvent(event: any): string {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);
  if (isHighSeveritySingleEvent(event)) return "high_severity_single_event";
  if (score >= 70 && (articleCount >= 2 || sourceCount >= 2)) return "emerging_event";
  return "monitoring_event";
}

function groupEventsByMicroAgenda(events: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const parentTopic = String(event?.topic || "Μη ταξινομημένο").trim();
    const micro = classifyMicroAgenda(event);
    const key = `${parentTopic}::${micro.id}`;
    const enriched = {
      ...event,
      parent_topic: parentTopic,
      micro_agenda_id: micro.id,
      micro_agenda: micro.label,
      micro_agenda_confidence: micro.confidence,
      micro_agenda_matches: micro.matched_keywords,
      micro_agenda_fallback: micro.fallback,
    };

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(enriched);
  }

  return grouped;
}

function buildLiveAgenda(events: any[], trends: any[]) {
  const trendMap = new Map<string, any>();
  for (let i = 0; i < trends.length; i += 1) {
    const topic = String(trends[i]?.topic || "").trim();
    if (topic) trendMap.set(topic, trends[i]);
  }

  const grouped = groupEventsByMicroAgenda(events);
  const agendaClusters: any[] = [];
  const monitoringEvents: any[] = [];
  const allMicroAgendas: any[] = [];
  const groupedKeys = Array.from(grouped.keys());

  for (let i = 0; i < groupedKeys.length; i += 1) {
    const key = groupedKeys[i];
    const topicEvents = grouped.get(key) || [];
    const sortedEvents = topicEvents.slice().sort((a, b) => toNumber(b?.event_score) - toNumber(a?.event_score));
    const bestEvent = sortedEvents[0] || {};
    const parentTopic = String(bestEvent?.parent_topic || bestEvent?.topic || "Μη ταξινομημένο").trim();
    const microAgenda = String(bestEvent?.micro_agenda || parentTopic).trim();
    const microAgendaId = String(bestEvent?.micro_agenda_id || key).trim();
    const eventCount = topicEvents.length;
    const articleCount = topicEvents.reduce((sum, event) => sum + toNumber(event?.article_count), 0);
    const politicalArticleCount = topicEvents.reduce((sum, event) => sum + toNumber(event?.political_article_count), 0);
    const sourceCount = uniqueSourceCount(topicEvents);
    const topEventScore = Math.max(...topicEvents.map((event) => toNumber(event?.event_score)), 0);
    const newest = newestArticleAt(topicEvents);
    const freshness = freshnessScore(newest);
    const doc = Math.max(...topicEvents.map((event) => documentationScore(event?.documentation_level)), 0);
    const trend = trendMap.get(parentTopic) || trendMap.get(microAgenda);
    const trendScore = toNumber(trend?.search_interest_score, 50);
    const hasClusterEvidence = eventCount >= 2 || articleCount >= 3 || sourceCount >= 2;
    const highSeverity = isHighSeveritySingleEvent(bestEvent);

    let type = "monitoring_event";
    if (hasClusterEvidence) type = "agenda_cluster";
    else if (highSeverity) type = "high_severity_single_event";

    const coverageScore = clampScore(eventCount * 12 + articleCount * 6 + sourceCount * 12);
    const rawScore = clampScore(0.38 * topEventScore + 0.22 * coverageScore + 0.18 * trendScore + 0.12 * freshness + 0.1 * doc);
    const finalScore = type === "monitoring_event" ? Math.min(rawScore, 59) : rawScore;
    const classificationMode = bestEvent?.micro_agenda_fallback ? "fallback_micro_agenda" : "rule_based_micro_agenda";

    const item = {
      type,
      parent_topic: parentTopic,
      topic: microAgenda,
      micro_agenda: microAgenda,
      micro_agenda_id: microAgendaId,
      title: type === "agenda_cluster" ? microAgenda : bestEvent?.title,
      score: finalScore,
      raw_score_before_cap: rawScore,
      top_event_score: topEventScore,
      event_count: eventCount,
      article_count: articleCount,
      political_article_count: politicalArticleCount,
      source_count: sourceCount,
      freshness_score: freshness,
      documentation_score: doc,
      search_interest_score: trendScore,
      search_interest_status: trend?.search_interest_status || "pending_fallback_50",
      newest_article_at: newest,
      classification_mode: classificationMode,
      micro_agenda_confidence: bestEvent?.micro_agenda_confidence ?? 25,
      micro_agenda_matches: bestEvent?.micro_agenda_matches || [],
      diagnosis:
        type === "monitoring_event"
          ? ["single_event_or_single_source_cap", "keep_under_monitoring", classificationMode]
          : type === "high_severity_single_event"
            ? ["high_severity_override", classificationMode]
            : ["multiple_events_or_sources", "agenda_cluster", classificationMode],
      strategic_read:
        type === "monitoring_event"
          ? "Μεμονωμένο φρέσκο γεγονός. Δεν γίνεται κεντρική ατζέντα χωρίς επιπλέον πηγές, επανάληψη ή πολιτική κλιμάκωση."
          : type === "high_severity_single_event"
            ? "Μεμονωμένο γεγονός με αρκετή ένταση για ξεχωριστή προσοχή."
            : "Συστάδα συγγενών σημάτων σε συγκεκριμένη micro-agenda, όχι απλή θεματική κατηγορία.",
      top_events: sortedEvents.slice(0, 8).map((event) => ({
        id: event?.id,
        title: event?.title,
        parent_topic: event?.parent_topic,
        micro_agenda: event?.micro_agenda,
        micro_agenda_confidence: event?.micro_agenda_confidence,
        micro_agenda_matches: event?.micro_agenda_matches,
        event_score: toNumber(event?.event_score),
        status: event?.status,
        article_count: toNumber(event?.article_count),
        source_count: toNumber(event?.source_count),
        documentation_level: event?.documentation_level,
        detection_method: event?.detection_method,
        last_article_at: event?.last_article_at,
        event_classification: classifyEvent(event),
      })),
      evidence_articles: topEvidence(topicEvents),
    };

    allMicroAgendas.push(item);
    if (type === "monitoring_event") monitoringEvents.push(item);
    else agendaClusters.push(item);
  }

  return {
    agenda_clusters: agendaClusters.sort((a, b) => b.score - a.score),
    monitoring_events: monitoringEvents.sort((a, b) => b.top_event_score - a.top_event_score).slice(0, 30),
    all_micro_agendas: allMicroAgendas.sort((a, b) => b.score - a.score),
  };
}

function readHours(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("hours") || 168);
  if (!Number.isFinite(raw)) return 168;
  return Math.min(168, Math.max(24, raw));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hours = readHours(searchParams);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: events, error: eventsError, count: eventCount } = await supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .gte("last_article_at", since)
    .order("last_article_at", { ascending: false, nullsFirst: false })
    .limit(300);

  if (eventsError) {
    return NextResponse.json({ success: false, stage: "read_v_political_events_live", error: eventsError.message }, { status: 500 });
  }

  const { data: trends, error: trendsError } = await supabase
    .from("topic_trend_signals")
    .select("topic,search_interest_score,search_interest_status,queries,fetched_at")
    .eq("region", "GR")
    .eq("timeframe", "now 7-d");

  const { data: legacySituations, error: legacyError } = await supabase
    .from("v_situation_engine_live")
    .select("id,title,topic,priority_score,last_seen_at,last_computed_at,evidence_article_count")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(31);

  const newestLegacySeenAt =
    Array.isArray(legacySituations) && legacySituations.length > 0
      ? legacySituations.map((s: any) => s?.last_seen_at).filter(Boolean).sort((a, b) => toTime(b) - toTime(a))[0]
      : null;
  const legacyHoursOld = newestLegacySeenAt ? hoursOld(newestLegacySeenAt) : null;
  const result = buildLiveAgenda(Array.isArray(events) ? events : [], Array.isArray(trends) ? trends : []);

  return NextResponse.json({
    success: true,
    mode: "read_only_live_micro_agenda_probe",
    generated_at: new Date().toISOString(),
    params: { hours, since },
    diagnostics: {
      read_only: true,
      writes_to_database: false,
      grouping: "parent_topic_to_micro_agenda_to_events",
      source_events: "v_political_events_live",
      source_trends: "topic_trend_signals",
      legacy_situations_source: "v_situation_engine_live",
      event_rows_considered: Array.isArray(events) ? events.length : 0,
      event_rows_total_matching_window: eventCount,
      micro_agenda_rules_count: MICRO_AGENDA_RULES.length,
      newest_legacy_situation_seen_at: newestLegacySeenAt,
      newest_legacy_situation_hours_old: legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? Math.round(legacyHoursOld) : null,
      legacy_situations_are_stale_for_today: legacyHoursOld !== null && Number.isFinite(legacyHoursOld) ? legacyHoursOld > 48 : null,
      trends_error: trendsError?.message ?? null,
      legacy_error: legacyError?.message ?? null,
    },
    agenda_clusters: result.agenda_clusters,
    monitoring_events: result.monitoring_events,
    all_micro_agendas: result.all_micro_agendas,
  });
}
