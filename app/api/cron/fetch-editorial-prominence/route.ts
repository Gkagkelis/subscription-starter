import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FrontpageCategory = "political" | "economic";

type FrontpageSource = {
  key: string;
  name: string;
  aliases: string[];
  category: FrontpageCategory;
  baseScore: number;
  priority: number;
};

type FrontpageItem = {
  sourceKey: string;
  sourceName: string;
  category: FrontpageCategory;
  sourceUrl: string;
  surface: "frontpage";
  section: FrontpageCategory;
  frontpageUrl: string;
  imageUrl: string | null;
  rawLabel: string;
  articleTitle: string;
  position: number;
  positionLabel: string;
  sourceBaseScore: number;
};

type ClassifiedFrontpageItem = FrontpageItem & {
  parentTopic: string | null;
  microAgenda: string | null;
  microAgendaId: string | null;
  classifierConfidence: number;
  matchedKeywords: string[];
  classifierScore: number;
  prominenceScore: number;
};

type MicroAgendaRule = {
  id: string;
  label: string;
  parent: string;
  keywords: string[];
  priority?: number;
};

type FrontpagesFetchResult = {
  body: string;
  format: "html" | "text";
  method: "direct_browser_headers" | "reader_fallback";
  attempts: Array<{ method: string; ok: boolean; status?: number; error?: string }>;
};

const MODE = "fetch_editorial_prominence_frontpages_v2_2";
const TARGET_TABLE = "editorial_prominence_signals";
const SOURCE_URL = "https://www.frontpages.gr/";
const READER_FALLBACK_URL = "https://r.jina.ai/http://r.jina.ai/http://https://www.frontpages.gr/";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 80;
const FETCH_TIMEOUT_MS = 15000;

const ALLOWED_FRONTPAGE_SOURCES: FrontpageSource[] = [
  { key: "kathimerini", name: "Η Καθημερινή", aliases: ["η καθημερινη", "καθημερινη"], category: "political", baseScore: 96, priority: 100 },
  { key: "tanea", name: "Τα Νέα", aliases: ["τα νεα"], category: "political", baseScore: 94, priority: 98 },
  { key: "apogevmatini", name: "Απογευματινή", aliases: ["απογευματινη"], category: "political", baseScore: 91, priority: 92 },
  { key: "efsyn", name: "Η Εφημερίδα των Συντακτών", aliases: ["η εφημεριδα των συντακτων", "εφημεριδα των συντακτων", "εφ συν", "εφ.συν"], category: "political", baseScore: 90, priority: 90 },
  { key: "rizospastis", name: "Ριζοσπάστης", aliases: ["ριζοσπαστης"], category: "political", baseScore: 88, priority: 86 },
  { key: "eleftheros_typos", name: "Ελεύθερος Τύπος", aliases: ["ελευθερος τυπος"], category: "political", baseScore: 88, priority: 86 },
  { key: "kontra_news", name: "Kontra News", aliases: ["kontra news"], category: "political", baseScore: 84, priority: 76 },
  { key: "estia", name: "Εστία", aliases: ["εστια"], category: "political", baseScore: 84, priority: 76 },
  { key: "parapolitika", name: "Παραπολιτικά", aliases: ["παραπολιτικα"], category: "political", baseScore: 83, priority: 74 },
  { key: "political", name: "Political", aliases: ["political"], category: "political", baseScore: 82, priority: 72 },
  { key: "dimokratia", name: "Δημοκρατία", aliases: ["δημοκρατια"], category: "political", baseScore: 82, priority: 72 },
  { key: "dromos_aristeras", name: "Δρόμος της Αριστεράς", aliases: ["δρομος της αριστερας"], category: "political", baseScore: 80, priority: 68 },
  { key: "prin", name: "Πριν", aliases: ["πριν"], category: "political", baseScore: 78, priority: 64 },
  { key: "epoxi", name: "Η Εποχή", aliases: ["η εποχη", "εποχη"], category: "political", baseScore: 78, priority: 64 },
  { key: "karfi", name: "Στο Καρφί", aliases: ["στο καρφι"], category: "political", baseScore: 76, priority: 60 },
  { key: "logos", name: "Ο Λόγος", aliases: ["ο λογος"], category: "political", baseScore: 74, priority: 58 },
  { key: "apopsi", name: "Άποψη", aliases: ["αποψη"], category: "political", baseScore: 74, priority: 56 },
  { key: "naftemporiki", name: "Η Ναυτεμπορική", aliases: ["η ναυτεμπορικη", "ναυτεμπορικη"], category: "economic", baseScore: 92, priority: 95 },
  { key: "kefalaio", name: "Κεφάλαιο", aliases: ["κεφαλαιο"], category: "economic", baseScore: 84, priority: 72 },
  { key: "axia", name: "Η Αξία", aliases: ["η αξια", "αξια"], category: "economic", baseScore: 82, priority: 70 },
  { key: "agrenda", name: "Agrenda", aliases: ["agrenda"], category: "economic", baseScore: 80, priority: 68 },
];

const BLOCKED_SOURCE_ALIASES = [
  "espresso",
  "star press",
  "on time",
  "sport day",
  "πρωταθλητης",
  "φως",
  "η ωρα των σπορ",
  "live sport",
  "forza",
  "metrosport",
  "δικεφαλος",
  "karfitsa",
  "θεσσαλονικη",
  "τυπος θεσσαλονικης",
  "ελευθερη ωρα",
  "εφημερις δημοπρασιων",
  "ηχω των δημοπρασιων",
  "γενικη δημοπρασιων",
];

const LOCAL_OR_REGIONAL_NOISE_TERMS = [
  "αμαρυσια",
  "μαρουσι",
  "πελλας",
  "πελλα",
  "του νοτου",
  "νοτου",
  "τοπικη",
  "τοπικα",
  "θεσσαλια",
  "κρητη",
  "πατρα",
  "λαρισα",
  "ηπειρος",
  "μακεδονια",
  "θρακη",
  "κυκλαδες",
  "δωδεκανησα",
];

const IMPORTANT_UNCLASSIFIED_SOURCE_KEYS = new Set([
  "kathimerini",
  "tanea",
  "apogevmatini",
  "efsyn",
  "rizospastis",
  "eleftheros_typos",
  "kontra_news",
  "estia",
  "parapolitika",
  "political",
  "dimokratia",
  "naftemporiki",
]);

const MICRO_AGENDA_RULES: MicroAgendaRule[] = [
  {
    id: "housing_rents",
    label: "Στέγαση / ενοίκια",
    parent: "Στέγαση",
    keywords: ["στεγασ", "στεγαστικ", "ενοικ", "ενοικια", "πλαφον", "κατοικια", "ακινητα", "τραπεζες", "δανεια", "φθηνα στεγαστικα"],
    priority: 30,
  },
  {
    id: "housing_renovation_programs",
    label: "Προγράμματα κατοικίας / ανακαινίσεις",
    parent: "Στέγαση",
    keywords: ["ανακαινιζω", "ανακαινισ", "προγραμμα κατοικιας", "επιδότηση ανακαίνισης", "επιδοτηση ανακαινισης"],
    priority: 35,
  },
  {
    id: "taxation_public_revenue",
    label: "Φορολογία / δημόσια έσοδα",
    parent: "Φορολογία",
    keywords: ["φορο", "φορολογ", "ααδε", "ενφια", "φπα", "τεκμηρι", "δηλωσεις", "εσοδα", "τελων", "παρατασ"],
    priority: 25,
  },
  {
    id: "debt_settlement_installments",
    label: "Ρύθμιση οφειλών / δόσεις",
    parent: "Φορολογία",
    keywords: ["ρυθμιση οφειλων", "οφειλετ", "72 δοσεις", "χρεη", "εφορια", "δοσεις", "κοκκινα δανεια", "πλειστηριασ", "ρυθμιση", "δανειοληπτ", "αναδρομικ", "ατοκα", "μηδενιζονται οι τοκοι", "επιστρεφονται χρηματα", "χρεοκοπ"],
    priority: 35,
  },
  {
    id: "energy_prices_grid",
    label: "Ενέργεια / τιμές ρεύματος",
    parent: "Ενέργεια",
    keywords: ["ενεργεια", "ρευμα", "τιμες ρευματος", "λογαριασμοι", "ηλεκτρικο", "πετρελαιο", "φυσικο αεριο", "καυσιμ"],
    priority: 25,
  },
  {
    id: "migration_asylum",
    label: "Μεταναστευτικό / άσυλο",
    parent: "Μεταναστευτικό",
    keywords: ["μεταναστ", "ασυλο", "προσφυγ", "λιβυη", "επιστροφες", "κεντρα επιστροφων"],
    priority: 25,
  },
  {
    id: "farmers_rural_production",
    label: "Αγροτικά / παραγωγή / επιδοτήσεις",
    parent: "Αγροτικά",
    keywords: ["αγροτ", "αγροτες", "καλλιεργ", "ελγα", "οπεκεπε", "επιδοτησεις", "πρωτογενης τομεας", "παραγωγ"],
    priority: 25,
  },
  {
    id: "wildfire_prevention",
    label: "Πυροπροστασία / καθαρισμοί οικοπέδων",
    parent: "Πολιτική προστασία",
    keywords: ["πυροπροστασ", "καθαρισμ", "οικοπεδ", "πυρκαγ", "φωτια", "πυρινο", "112", "εκκενωση", "πολιτικη προστασια"],
    priority: 35,
  },
  {
    id: "security_political_violence",
    label: "Πολιτική βία / τρομοκρατία / ασφάλεια",
    parent: "Ασφάλεια / εγκληματικότητα",
    keywords: ["εμπρηστ", "εμπρησμ", "γκαζακ", "βομβιστ", "τρομοκρατ", "επιθεση", "δολοφον", "αντιποινα", "αντιεξουσιαστ", "πυρηνας", "ανθρωποκυνηγητο", "δραστ", "συλληψη", "εγκλημ", "αστυνομ", "ελ.ασ", "βιασμ", "ναρκωτικ", "διαρρηξ"],
    priority: 60,
  },
  {
    id: "consumer_price_tools",
    label: "Ακρίβεια / σύγκριση τιμών / εργαλεία καταναλωτή",
    parent: "Ακρίβεια / κόστος ζωής",
    keywords: ["ακριβεια", "posokanei", "ποσο κανει", "συγκριση τιμων", "καλαθι", "τιμες", "σουπερ μαρκετ", "τροφίμων", "τροφίμα"],
    priority: 25,
  },
  {
    id: "social_benefits_support",
    label: "Επιδόματα / κοινωνική στήριξη",
    parent: "Ακρίβεια / κόστος ζωής",
    keywords: ["επιδομα", "επιδοματα", "κοινωνικα", "δικαιουχ", "θερμανσης", "στήριξη", "στηριξη", "συνταξ", "συνταξεις"],
    priority: 25,
  },
  {
    id: "defense_technology_drones",
    label: "Άμυνα / drones / τεχνολογία",
    parent: "Άμυνα",
    keywords: ["αμυνα", "αμυντικ", "drones", "drone", "οπλικ", "ενοπλες δυναμεις", "εξοπλισ", "στρατο"],
    priority: 25,
  },
  {
    id: "hormuz_geopolitical_risk",
    label: "Ορμούζ / γεωπολιτικό ρίσκο",
    parent: "Διεθνή / γεωπολιτική",
    keywords: ["ορμουζ", "ιραν", "ισραηλ", "περσικος", "γεωπολιτικ", "πετρελαιο", "κυρωσεις", "ηπα", "λιβανο", "χεζμπολαχ", ],
    priority: 35,
  },
  {
    id: "elections_political_timing",
    label: "Εκλογές / πολιτικός χρόνος",
    parent: "Πολιτικό σύστημα",
    keywords: [
      "εκλογ", "καλπη", "υποψηφ", "κομμα", "κυβερνηση", "αντιπολιτευση", "δημοσκοπ", "μεταρρυθμ",
      "βουλη", "πρωθυπουργ", "μαξιμου", "κοινοβουλ", "πολιτικ σκηνικ", "κυβερνητικ", "προεκλογικ",
      "νεα δημοκρατια", "ν.δ.", " νδ ", "μητσοτακ",
      "πασοκ", "ανδρουλακ", "κιναλ",
      "συριζα", "κουλογλ", "τσιπρα",
      "κκε", "κουτσουμπ",
      "ελληνικη λυση", "βελοπουλ",
      "νατσιο",
      "πλευση ελευθεριας", "κωνσταντοπουλ",
      "μερα25", "μερα 25", "βαρουφακ",
      "νεα αριστερα", "ζαχαριαδ",
      "λατινοπουλ", "σπαρτιατ", "σαμαρα", "καρυστιανου",
      "δενδια", "δουκα", "μπακογιανν", "καιριδ",
      "αχτσιογλ", "πολακη", "φαμελλ", "αβραμοπουλ",
      "γεωργιαδ", "θεοδωρικακ", "χατζηδακ", "κεραμεω", "βοριδ", "πιερρακακ", "σκερτσ"
    ],
    priority: 25,
  },
  {
    id: "demographic_crisis",
    label: "Δημογραφικό / γήρανση πληθυσμού",
    parent: "Νεολαία",
    keywords: ["δημογραφ", "γεννησεις", "γεννησ", "γηρανση", "πληθυσμ", "συρρικνωση"],
    priority: 25,
  },
  {
    id: "schools_education",
    label: "Σχολεία / εκπαίδευση",
    parent: "Παιδεία",
    keywords: ["σχολ", "εκπαιδευ", "μαθητ", "πανελλην", "παιδεια", "πανεπιστημ", "φοιτητ", "αει"],
    priority: 25,
  },
  {
    id: "nhs_hospitals",
    label: "Νοσοκομεία / ΕΣΥ",
    parent: "Υγεία",
    keywords: ["νοσοκομ", "εσυ", "υγεια", "γιατρο", "ασθεν", "φαρμακ", "κλινικ"],
    priority: 25,
  },
  {
    id: "wages_labor_rights",
    label: "Μισθοί / εργασιακά δικαιώματα",
    parent: "Εργασία",
    keywords: ["μισθ", "εργασια", "εργασιακ", "κατωτατος", "συλλογικες συμβασεις", "απεργ", "λεφτα", "κερδη", "θυσια", "θεσεις στο δημοσιο", "ασεπ", "προσληψ", "αιτησεις"],
    priority: 45,
  },
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς/g, "σ")
    .replace(/[^a-z0-9α-ω\s./:_-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8211;/gi, "–")
    .replace(/&#8212;/gi, "—")
    .replace(/&#8220;/gi, "“")
    .replace(/&#8221;/gi, "”")
    .replace(/&#8230;/gi, "…")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : " ";
    });
}

function stripTags(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttr(attrs: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = attrs.match(regex);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function isAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const auth = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-vercel-cron") || "";

  const devAllowed = process.env.ALLOW_DEV_PROBE_TOKEN === "true" && token === "dev";
  const cronSecret = process.env.CRON_SECRET || process.env.EDITORIAL_PROMINENCE_CRON_SECRET || "";
  const bearerAllowed = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const vercelCronAllowed = process.env.ALLOW_VERCEL_CRON_HEADER === "true" && cronHeader === "1";

  return devAllowed || bearerAllowed || vercelCronAllowed;
}

function canonicalizeUrl(rawHref: string | null, baseUrl: string): string | null {
  try {
    if (!rawHref) return null;
    if (rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("javascript:")) return null;
    const url = new URL(rawHref, baseUrl);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") url.searchParams.delete(key);
    }
    const path = url.pathname.replace(/\/$/, "") || "/";
    return `${url.origin}${path}${url.search}`;
  } catch {
    return null;
  }
}

function isBlockedLabel(label: string): boolean {
  const normalized = normalizeText(label);
  return BLOCKED_SOURCE_ALIASES.some((blocked) => normalized.includes(normalizeText(blocked)));
}

function isLocalOrRegionalNoiseLabel(label: string): boolean {
  const normalized = normalizeText(label);
  return LOCAL_OR_REGIONAL_NOISE_TERMS.some((term) => normalized.includes(normalizeText(term)));
}

function isGenericFrontpageOnly(headline: string, source: FrontpageSource): boolean {
  const normalized = normalizeText(headline);
  const sourceName = normalizeText(source.name);
  if (!normalized) return true;
  if (normalized === sourceName) return true;
  if (normalized === normalizeText(`Πρωτοσέλιδο: ${source.name}`)) return true;
  if (normalized.startsWith("πρωτοσελιδο") && source.aliases.some((alias) => normalized.includes(normalizeText(alias)))) return true;
  return false;
}

function isMeaningfulFrontpageHeadline(headline: string, source: FrontpageSource): boolean {
  const normalized = normalizeText(headline);
  if (isGenericFrontpageOnly(headline, source)) return false;
  if (normalized.length < 10) return false;
  if (isLocalOrRegionalNoiseLabel(headline)) return false;
  return true;
}

function shouldKeepClassifiedItem(item: ClassifiedFrontpageItem): boolean {
  if (item.microAgendaId) return true;
  if (!IMPORTANT_UNCLASSIFIED_SOURCE_KEYS.has(item.sourceKey)) return false;
  if (normalizeText(item.articleTitle).length < 14) return false;
  return true;
}

function stripFrontpagePrefix(label: string): string {
  return decodeHtml(label)
    .replace(/^image:\s*/i, "")
    .replace(/^πρωτοσέλιδο\s+εφημερίδας\s+/i, "")
    .replace(/^πρωτοσελιδο\s+εφημεριδας\s+/i, "")
    .replace(/^πρωτοσέλιδο\s+/i, "")
    .replace(/^πρωτοσελιδο\s+/i, "")
    .replace(/\s+-\s+protoselida\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceForLabel(label: string): FrontpageSource | null {
  if (isBlockedLabel(label)) return null;
  if (isLocalOrRegionalNoiseLabel(label)) return null;

  const cleaned = normalizeText(stripFrontpagePrefix(label));
  const sortedSources = [...ALLOWED_FRONTPAGE_SOURCES].sort((a, b) => b.priority - a.priority);

  for (const source of sortedSources) {
    for (const alias of source.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;

      if (
        cleaned === normalizedAlias ||
        cleaned.startsWith(`${normalizedAlias}:`) ||
        cleaned.startsWith(`${normalizedAlias} `) ||
        cleaned.includes(` ${normalizedAlias}:`)
      ) {
        return source;
      }
    }
  }

  return null;
}

function headlineForLabel(label: string, source: FrontpageSource): string {
  const cleaned = stripFrontpagePrefix(label);
  const colonIndex = cleaned.indexOf(":");

  if (colonIndex > -1) {
    const left = normalizeText(cleaned.slice(0, colonIndex));
    const sourceMatchesLeft = source.aliases.some((alias) => left.includes(normalizeText(alias)));
    if (sourceMatchesLeft) {
      const headline = cleaned.slice(colonIndex + 1).trim();
      if (headline.length >= 4) return headline;
    }
  }

  const withoutSource = source.aliases.reduce((acc, alias) => {
    const pattern = new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*`, "i");
    return acc.replace(pattern, "");
  }, cleaned);

  const fallback = withoutSource.replace(/\s+-\s+protoselida\s*$/i, "").trim();
  if (fallback && normalizeText(fallback) !== normalizeText(source.name)) return fallback;

  return `Πρωτοσέλιδο: ${source.name}`;
}

function keywordMatchScore(text: string, keyword: string): number {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return 0;
  if (text === normalizedKeyword) return 12;
  if (text.includes(normalizedKeyword)) {
    const words = normalizedKeyword.split(" ").filter(Boolean).length;
    return words > 1 ? 9 + words : 6;
  }
  return 0;
}

function classifyFrontpageItem(item: FrontpageItem): ClassifiedFrontpageItem {
  const text = normalizeText(`${item.sourceName} ${item.articleTitle} ${item.rawLabel} ${item.frontpageUrl}`);

  let best: { rule: MicroAgendaRule; score: number; matches: string[] } | null = null;

  for (const rule of MICRO_AGENDA_RULES) {
    let score = rule.priority || 0;
    const matches: string[] = [];

    for (const keyword of rule.keywords) {
      const matchScore = keywordMatchScore(text, keyword);
      if (matchScore > 0) {
        score += matchScore;
        matches.push(keyword);
      }
    }

    if (!matches.length) continue;
    if (!best || score > best.score) best = { rule, score, matches };
  }

  const sourcePositionScore = item.sourceBaseScore - Math.max(0, item.position - 1) * 2;

  if (!best) {
    return {
      ...item,
      parentTopic: null,
      microAgenda: null,
      microAgendaId: null,
      classifierConfidence: 0,
      matchedKeywords: [],
      classifierScore: 0,
      prominenceScore: clamp(sourcePositionScore, 35, 100),
    };
  }

  const classifierConfidence = clamp(best.score * 4, 35, 100);
  const categoryBonus = item.category === "economic" ? 3 : 0;
  const classifiedBonus = Math.min(8, Math.floor(classifierConfidence / 14));
  const prominenceScore = clamp(sourcePositionScore + categoryBonus + classifiedBonus, 0, 100);

  return {
    ...item,
    parentTopic: best.rule.parent,
    microAgenda: best.rule.label,
    microAgendaId: best.rule.id,
    classifierConfidence,
    matchedKeywords: best.matches.slice(0, 8),
    classifierScore: best.score,
    prominenceScore,
  };
}

function extractImageLabel(anchorInner: string): { label: string | null; imageUrl: string | null } {
  const imgMatch = anchorInner.match(/<img\b([^>]*)>/i);
  if (!imgMatch?.[1]) return { label: null, imageUrl: null };

  const attrs = imgMatch[1];
  const label = getAttr(attrs, "alt") || getAttr(attrs, "title");
  const imageUrl = canonicalizeUrl(getAttr(attrs, "src") || getAttr(attrs, "data-src") || getAttr(attrs, "data-lazy-src"), SOURCE_URL);

  return {
    label: label ? stripTags(label) : null,
    imageUrl,
  };
}

function extractTextLabel(anchorInner: string): string | null {
  const text = stripTags(anchorInner);
  if (text.length < 3) return null;
  return text;
}

function positionForCategory(items: FrontpageItem[], category: FrontpageCategory): number {
  return items.filter((item) => item.category === category).length + 1;
}

function makeFrontpageItemFromLabel(label: string, href: string | null, imageUrl: string | null, items: FrontpageItem[]): FrontpageItem | null {
  const source = sourceForLabel(label);
  if (!source) return null;

  const headline = headlineForLabel(label, source);
  if (!isMeaningfulFrontpageHeadline(headline, source)) return null;

  const frontpageUrl = href || imageUrl || `${SOURCE_URL}#${source.key}-${normalizeText(headline).replace(/\s+/g, "-").slice(0, 80)}`;
  const position = positionForCategory(items, source.category);

  return {
    sourceKey: source.key,
    sourceName: source.name,
    category: source.category,
    sourceUrl: SOURCE_URL,
    surface: "frontpage",
    section: source.category,
    frontpageUrl,
    imageUrl,
    rawLabel: label,
    articleTitle: headline,
    position,
    positionLabel: `frontpage_${source.category}_${position}`,
    sourceBaseScore: source.baseScore,
  };
}

function extractFrontpageItemsFromHtml(html: string, limit: number): FrontpageItem[] {
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const items: FrontpageItem[] = [];

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";

    const href = canonicalizeUrl(getAttr(attrs, "href"), SOURCE_URL);
    const image = extractImageLabel(inner);
    const textLabel = extractTextLabel(inner);
    const rawLabel = image.label || textLabel;

    if (!rawLabel) continue;

    const item = makeFrontpageItemFromLabel(rawLabel, href, image.imageUrl, items);
    if (!item) continue;

    const uniqueKey = `${item.sourceKey}::${item.frontpageUrl}::${normalizeText(item.articleTitle)}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    items.push(item);
    if (items.length >= limit * 2) break;
  }

  return sortAndLimitItems(items, limit);
}

function extractUrlFromMarkdownLine(line: string): string | null {
  const markdownUrl = line.match(/\((https?:\/\/[^)]+)\)/i)?.[1];
  const rawUrl = line.match(/https?:\/\/\S+/i)?.[0]?.replace(/[)\].,]+$/, "");
  return canonicalizeUrl(markdownUrl || rawUrl || null, SOURCE_URL);
}

function stripMarkdown(line: string): string {
  return decodeHtml(line)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/g, "")
    .replace(/^[*-]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFrontpageItemsFromText(text: string, limit: number): FrontpageItem[] {
  const seen = new Set<string>();
  const items: FrontpageItem[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line))
    .map((line) => line.replace(/^L\d+:\s*/i, "").trim())
    .filter((line) => line.length >= 3);

  for (const line of lines) {
    const source = sourceForLabel(line);
    if (!source) continue;

    const url = extractUrlFromMarkdownLine(line);
    const item = makeFrontpageItemFromLabel(line, url, null, items);
    if (!item) continue;

    const uniqueKey = `${item.sourceKey}::${normalizeText(item.articleTitle)}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    items.push(item);
    if (items.length >= limit * 2) break;
  }

  return sortAndLimitItems(items, limit);
}

function sortAndLimitItems(items: FrontpageItem[], limit: number): FrontpageItem[] {
  return items
    .sort((a, b) => {
      if (a.category !== b.category) return a.category === "political" ? -1 : 1;
      return a.position - b.position;
    })
    .slice(0, limit);
}

async function fetchTextWithTimeout(
  url: string,
  method: FrontpagesFetchResult["method"],
  headers: Record<string, string>
): Promise<{ body: string; attempt: { method: string; ok: boolean; status?: number; error?: string } }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        body: "",
        attempt: { method, ok: false, status: response.status, error: `HTTP ${response.status}` },
      };
    }

    return {
      body: await response.text(),
      attempt: { method, ok: true, status: response.status },
    };
  } catch (error: any) {
    return {
      body: "",
      attempt: { method, ok: false, error: error?.message || String(error) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFrontpages(): Promise<FrontpagesFetchResult> {
  const attempts: FrontpagesFetchResult["attempts"] = [];

  const direct = await fetchTextWithTimeout(SOURCE_URL, "direct_browser_headers", {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: "https://www.google.com/",
    "upgrade-insecure-requests": "1",
  });
  attempts.push(direct.attempt);

  if (direct.attempt.ok && direct.body) {
    return { body: direct.body, format: "html", method: "direct_browser_headers", attempts };
  }

  const reader = await fetchTextWithTimeout(READER_FALLBACK_URL, "reader_fallback", {
    "user-agent": "Mozilla/5.0 (compatible; NorayaFrontpageSignalBot/2.1; +https://noraya.vercel.app)",
    accept: "text/plain,text/markdown,*/*;q=0.8",
    "accept-language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
  });
  attempts.push(reader.attempt);

  if (reader.attempt.ok && reader.body) {
    return { body: reader.body, format: "text", method: "reader_fallback", attempts };
  }

  const last = attempts[attempts.length - 1];
  throw new Error(last?.error || "frontpages_fetch_failed");
}

function toInsertRow(item: ClassifiedFrontpageItem, observedAt: string) {
  return {
    observed_at: observedAt,
    source_name: item.sourceName,
    source_url: item.sourceUrl,
    surface: item.surface,
    section: item.section,
    article_url: item.frontpageUrl,
    article_title: item.articleTitle,
    article_excerpt: null,
    article_published_at: null,
    article_source: item.sourceName,
    position: item.position,
    position_label: item.positionLabel,
    prominence_score: item.prominenceScore,
    parent_topic: item.parentTopic,
    micro_agenda: item.microAgenda,
    micro_agenda_id: item.microAgendaId,
    classifier_confidence: item.classifierConfidence,
    matched_keywords: item.matchedKeywords,
    raw_payload: {
      mode: MODE,
      source_key: item.sourceKey,
      source_category: item.category,
      frontpage_url: item.frontpageUrl,
      image_url: item.imageUrl,
      raw_label: item.rawLabel,
      classifier_score: item.classifierScore,
      classifier_confidence: item.classifierConfidence,
      is_frontpages_gr_v2_2: true,
      observed_at: observedAt,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dry") || "").toLowerCase());
  const limit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

  if (!isAuthorized(request)) {
    return json({ success: false, mode: MODE, error: "unauthorized" }, 401);
  }

  const observedAt = new Date().toISOString();

  let fetched: FrontpagesFetchResult;
  try {
    fetched = await fetchFrontpages();
  } catch (error: any) {
    return json({
      success: false,
      mode: MODE,
      generated_at: observedAt,
      error: `frontpages_fetch_failed: ${error?.message || String(error)}`,
      diagnostics: {
        source_mode: "frontpages_gr_political_economic",
        source_url: SOURCE_URL,
        read_only: dryRun,
        target_table: TARGET_TABLE,
        fallback_enabled: true,
      },
    }, 502);
  }

  const extracted = fetched.format === "html"
    ? extractFrontpageItemsFromHtml(fetched.body, limit)
    : extractFrontpageItemsFromText(fetched.body, limit);

  const classifiedRaw = extracted.map(classifyFrontpageItem);
  const classified = classifiedRaw
    .filter(shouldKeepClassifiedItem)
    .sort((a, b) => b.prominenceScore - a.prominenceScore || a.position - b.position)
    .slice(0, limit);

  const rows = classified.map((item) => toInsertRow(item, observedAt));
  const classifiedCount = classified.filter((item) => item.microAgendaId).length;
  const droppedAfterClassification = classifiedRaw.length - classified.length;

  let writeError: string | null = null;
  let written = 0;

  if (!dryRun && rows.length) {
    const result = await supabase
      .from(TARGET_TABLE)
      .upsert(rows, {
        onConflict: "observed_date,source_name,surface,article_url_hash",
      });

    if (result.error) {
      writeError = result.error.message;
    } else {
      written = rows.length;
    }
  }

  return json({
    success: !writeError,
    mode: MODE,
    generated_at: observedAt,
    diagnostics: {
      read_only: dryRun,
      writes_to_database: !dryRun && !writeError,
      target_table: TARGET_TABLE,
      source_mode: "frontpages_gr_political_economic",
      source_url: SOURCE_URL,
      surface: "frontpage",
      categories_allowed: ["political", "economic"],
      blocked_categories: ["sports", "lifestyle", "magazines", "local"],
      allowed_sources: ALLOWED_FRONTPAGE_SOURCES.map((source) => ({
        key: source.key,
        name: source.name,
        category: source.category,
      })),
      classifier: "local_frontpage_micro_agenda_keyword_rules_v2_2",
      fetch_method: fetched.method,
      fetch_attempts: fetched.attempts,
      parsed_format: fetched.format,
      fallback_enabled: true,
      limit,
    },
    frontpages_extracted: extracted.length,
    frontpages_after_cleanup: classified.length,
    frontpages_dropped_after_classification: droppedAfterClassification,
    frontpages_considered: classified.length,
    classified_frontpages: classifiedCount,
    dry_run: dryRun,
    writes: written,
    writes_preview: rows.slice(0, 20).map((row) => ({
      source_name: row.source_name,
      surface: row.surface,
      section: row.section,
      position: row.position,
      prominence_score: row.prominence_score,
      article_title: row.article_title,
      parent_topic: row.parent_topic,
      micro_agenda: row.micro_agenda,
      micro_agenda_id: row.micro_agenda_id,
      classifier_confidence: row.classifier_confidence,
      article_url: row.article_url,
    })),
    errors: writeError ? [writeError] : [],
  });
}
