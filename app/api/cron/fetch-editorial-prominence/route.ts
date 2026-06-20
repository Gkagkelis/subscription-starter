import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EditorialSource = {
  key: string;
  name: string;
  homepageUrl: string;
  host: string;
  defaultSurface: string;
};

type ExtractedArticle = {
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  surface: string;
  section: string | null;
  articleUrl: string;
  articleTitle: string;
  position: number;
  positionLabel: string;
};

type ClassifiedArticle = ExtractedArticle & {
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

const MODE = "fetch_editorial_prominence_homepage_v1";
const TARGET_TABLE = "editorial_prominence_signals";
const DEFAULT_SOURCE_LIMIT = 4;
const DEFAULT_ARTICLE_LIMIT = 40;
const MAX_SOURCE_LIMIT = 8;
const MAX_ARTICLE_LIMIT = 120;
const FETCH_TIMEOUT_MS = 12000;

const SOURCES: EditorialSource[] = [
  {
    key: "tanea",
    name: "Τα Νέα",
    homepageUrl: "https://www.tanea.gr/",
    host: "tanea.gr",
    defaultSurface: "homepage",
  },
  {
    key: "tovima",
    name: "Το Βήμα",
    homepageUrl: "https://www.tovima.gr/",
    host: "tovima.gr",
    defaultSurface: "homepage",
  },
  {
    key: "kathimerini",
    name: "Καθημερινή",
    homepageUrl: "https://www.kathimerini.gr/",
    host: "kathimerini.gr",
    defaultSurface: "homepage",
  },
  {
    key: "efsyn",
    name: "Εφ.Συν.",
    homepageUrl: "https://www.efsyn.gr/",
    host: "efsyn.gr",
    defaultSurface: "homepage",
  },
  {
    key: "newsbeast",
    name: "Newsbeast",
    homepageUrl: "https://www.newsbeast.gr/",
    host: "newsbeast.gr",
    defaultSurface: "homepage",
  },
  {
    key: "avgi",
    name: "Αυγή",
    homepageUrl: "https://www.avgi.gr/",
    host: "avgi.gr",
    defaultSurface: "homepage",
  },
];

const MICRO_AGENDA_RULES: MicroAgendaRule[] = [
  {
    id: "housing_rents",
    label: "Στέγαση / ενοίκια",
    parent: "Στέγαση",
    keywords: ["στεγασ", "ενοικ", "ενοικια", "κατοικια", "ακινητα", "πρωτη κατοικια"],
    priority: 20,
  },
  {
    id: "housing_renovation_programs",
    label: "Προγράμματα κατοικίας / ανακαινίσεις",
    parent: "Στέγαση",
    keywords: ["ανακαινιζω", "ανακαινισ", "προγραμμα κατοικιας", "επιδότηση ανακαίνισης", "επιδοτηση ανακαινισης"],
    priority: 45,
  },
  {
    id: "taxation_public_revenue",
    label: "Φορολογία / δημόσια έσοδα",
    parent: "Φορολογία",
    keywords: ["φορο", "φορολογ", "ααδε", "ενφια", "φπα", "τεκμηρι", "δηλωσεις"],
    priority: 20,
  },
  {
    id: "debt_settlement_installments",
    label: "Ρύθμιση οφειλών / δόσεις",
    parent: "Φορολογία",
    keywords: ["ρυθμιση οφειλων", "οφειλετ", "72 δοσεις", "72 δοσεισ", "χρεη", "εφορια", "δοσεις", "δοσεισ"],
    priority: 45,
  },
  {
    id: "energy_prices_grid",
    label: "Ενέργεια / τιμές ρεύματος",
    parent: "Ενέργεια",
    keywords: ["ενεργεια", "ρευμα", "τιμες ρευματος", "λογαριασμοι", "ηλεκτρικο", "πετρελαιο", "φυσικο αεριο"],
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
    keywords: ["αγροτ", "αγροτες", "καλλιεργ", "ελγα", "οπεκεπε", "επιδοτησεις", "πρωτογενης τομεας"],
    priority: 25,
  },
  {
    id: "wildfire_prevention",
    label: "Πυροπροστασία / καθαρισμοί οικοπέδων",
    parent: "Πολιτική προστασία",
    keywords: ["πυροπροστασ", "καθαρισμ", "οικοπεδ", "πυρκαγ", "φωτια", "πολιτικη προστασια", "προστίμα οικοπέδων", "προστιμα οικοπεδων"],
    priority: 40,
  },
  {
    id: "consumer_price_tools",
    label: "Ακρίβεια / σύγκριση τιμών / εργαλεία καταναλωτή",
    parent: "Ακρίβεια / κόστος ζωής",
    keywords: ["ακριβεια", "posokanei", "ποσο κανει", "συγκριση τιμων", "καλαθι", "τιμες"],
    priority: 35,
  },
  {
    id: "social_benefits_support",
    label: "Επιδόματα / κοινωνική στήριξη",
    parent: "Ακρίβεια / κόστος ζωής",
    keywords: ["επιδομα", "επιδοματα", "κοινωνικα", "δικαιουχ", "θερμανσης", "στήριξη", "στηριξη"],
    priority: 30,
  },
  {
    id: "defense_technology_drones",
    label: "Άμυνα / drones / τεχνολογία",
    parent: "Άμυνα",
    keywords: ["αμυνα", "αμυντικ", "drones", "drone", "οπλικ", "ενοπλες δυναμεις", "εξοπλισ"],
    priority: 35,
  },
  {
    id: "hormuz_geopolitical_risk",
    label: "Ορμούζ / γεωπολιτικό ρίσκο",
    parent: "Διεθνή / γεωπολιτική",
    keywords: ["ορμουζ", "ιραν", "ισραηλ", "περσικος", "γεωπολιτικ", "πετρελαιο", "κυρωσεις"],
    priority: 45,
  },
  {
    id: "demographic_crisis",
    label: "Δημογραφικό / γήρανση πληθυσμού",
    parent: "Νεολαία",
    keywords: ["δημογραφ", "γεννησεις", "γεννησ", "γηρανση", "πληθυσμ", "συρρικνωση"],
    priority: 30,
  },
  {
    id: "schools_education",
    label: "Σχολεία / εκπαίδευση",
    parent: "Παιδεία",
    keywords: ["σχολ", "εκπαιδευ", "μαθητ", "πανελλην", "παιδεια", "πανεπιστημ", "φοιτητ"],
    priority: 20,
  },
  {
    id: "nhs_hospitals",
    label: "Νοσοκομεία / ΕΣΥ",
    parent: "Υγεία",
    keywords: ["νοσοκομ", "εσυ", "υγεια", "γιατρο", "ασθεν", "φαρμακ", "κλινικ"],
    priority: 20,
  },
  {
    id: "wages_labor_rights",
    label: "Μισθοί / εργασιακά δικαιώματα",
    parent: "Εργασία",
    keywords: ["μισθ", "εργασια", "εργασιακ", "κατωτατος", "συλλογικες συμβασεις", "απεργ"],
    priority: 20,
  },
];

const SECTION_HINTS = [
  "politics",
  "economy",
  "finance",
  "greece",
  "world",
  "diplomatia",
  "society",
  "politiki",
  "oikonomia",
  "kosmos",
  "ellada",
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
    .replace(/[^a-z0-9α-ω\s/-]/gi, " ")
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

function sourceSelection(searchParams: URLSearchParams): EditorialSource[] {
  const requested = String(searchParams.get("sources") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length) {
    const byKey = new Map(SOURCES.map((source) => [source.key, source]));
    return requested.map((key) => byKey.get(key)).filter(Boolean).slice(0, MAX_SOURCE_LIMIT) as EditorialSource[];
  }

  const sourceLimit = parseIntParam(searchParams.get("source_limit"), DEFAULT_SOURCE_LIMIT, 1, MAX_SOURCE_LIMIT);
  return SOURCES.slice(0, sourceLimit);
}

function isLikelyArticleUrl(url: URL): boolean {
  const path = url.pathname.toLocaleLowerCase("el-GR");
  if (!path || path === "/") return false;
  if (path.includes("/tag/") || path.includes("/author/") || path.includes("/category/")) return false;
  if (path.includes("/wp-content/") || path.includes("/cdn-cgi/")) return false;
  if (path.endsWith(".jpg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".svg")) return false;

  const hasDatePath = /\/20\d{2}\//.test(path);
  const hasArticleWords = ["arthro", "article", "eidiseis", "politics", "economy", "finance", "greece", "world", "politiki", "oikonomia", "kosmos", "ellada"].some((part) => path.includes(part));
  const longSlug = path.split("/").filter(Boolean).some((part) => part.length >= 18 && part.includes("-"));
  return hasDatePath || hasArticleWords || longSlug;
}

function canonicalizeUrl(rawHref: string, baseUrl: string): string | null {
  try {
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("javascript:")) return null;
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

function sectionFromUrl(articleUrl: string): string | null {
  try {
    const parts = new URL(articleUrl).pathname.split("/").filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeText(part);
      if (SECTION_HINTS.includes(normalized)) return part;
    }
    return parts[0] || null;
  } catch {
    return null;
  }
}

function extractArticlesFromHtml(source: EditorialSource, html: string, perSourceLimit: number): ExtractedArticle[] {
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const articles: ExtractedArticle[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) && articles.length < perSourceLimit * 4) {
    const href = match[1];
    const inner = match[2] || "";
    const articleUrl = canonicalizeUrl(href, source.homepageUrl);
    if (!articleUrl) continue;

    let parsed: URL;
    try {
      parsed = new URL(articleUrl);
    } catch {
      continue;
    }

    if (!parsed.hostname.includes(source.host)) continue;
    if (!isLikelyArticleUrl(parsed)) continue;

    const title = stripTags(inner);
    const normalizedTitle = normalizeText(title);
    if (title.length < 20 || normalizedTitle.length < 15) continue;
    if (/^(menu|search|login|συνδεση|διαφημιση|newsletter)$/i.test(normalizedTitle)) continue;

    const key = articleUrl;
    if (seen.has(key)) continue;
    seen.add(key);

    const position = articles.length + 1;
    articles.push({
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.homepageUrl,
      surface: source.defaultSurface,
      section: sectionFromUrl(articleUrl),
      articleUrl,
      articleTitle: title,
      position,
      positionLabel: `${source.defaultSurface}_${position}`,
    });
  }

  return articles.slice(0, perSourceLimit);
}

function keywordMatchScore(text: string, keyword: string): number {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return 0;
  if (text === normalizedKeyword) return 10;
  if (text.includes(normalizedKeyword)) {
    const words = normalizedKeyword.split(" ").length;
    return words > 1 ? 8 + words : 5;
  }
  return 0;
}

function classifyArticle(article: ExtractedArticle): ClassifiedArticle {
  const text = normalizeText(`${article.articleTitle} ${article.articleUrl}`);
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

  const baseProminence = clamp(88 - (article.position - 1) * 5, 20, 88);

  if (!best) {
    return {
      ...article,
      parentTopic: null,
      microAgenda: null,
      microAgendaId: null,
      classifierConfidence: 0,
      matchedKeywords: [],
      classifierScore: 0,
      prominenceScore: baseProminence,
    };
  }

  const classifierConfidence = clamp(best.score * 4, 35, 100);
  const prominenceScore = clamp(baseProminence + Math.min(12, Math.floor(classifierConfidence / 12)), 0, 100);

  return {
    ...article,
    parentTopic: best.rule.parent,
    microAgenda: best.rule.label,
    microAgendaId: best.rule.id,
    classifierConfidence,
    matchedKeywords: best.matches.slice(0, 8),
    classifierScore: best.score,
    prominenceScore,
  };
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "NorayaEditorialProminenceBot/1.0 (+https://noraya.vercel.app)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSourceArticles(source: EditorialSource, perSourceLimit: number): Promise<{ source: EditorialSource; articles: ExtractedArticle[]; error: string | null }> {
  try {
    const html = await fetchWithTimeout(source.homepageUrl);
    return { source, articles: extractArticlesFromHtml(source, html, perSourceLimit), error: null };
  } catch (error: any) {
    return { source, articles: [], error: `${source.key}: ${error?.message || String(error)}` };
  }
}

function toInsertRow(article: ClassifiedArticle, observedAt: string) {
  return {
    observed_at: observedAt,
    source_name: article.sourceName,
    source_url: article.sourceUrl,
    surface: article.surface,
    section: article.section,
    article_url: article.articleUrl,
    article_title: article.articleTitle,
    article_excerpt: null,
    article_published_at: null,
    article_source: article.sourceName,
    position: article.position,
    position_label: article.positionLabel,
    prominence_score: article.prominenceScore,
    parent_topic: article.parentTopic,
    micro_agenda: article.microAgenda,
    micro_agenda_id: article.microAgendaId,
    classifier_confidence: article.classifierConfidence,
    matched_keywords: article.matchedKeywords,
    raw_payload: {
      mode: MODE,
      source_key: article.sourceKey,
      homepage_url: article.sourceUrl,
      extracted_position: article.position,
      classifier_score: article.classifierScore,
      classifier_confidence: article.classifierConfidence,
      is_homepage_scrape_v1: true,
      observed_at: observedAt,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dry") || "").toLowerCase());
  const articleLimit = parseIntParam(url.searchParams.get("limit"), DEFAULT_ARTICLE_LIMIT, 1, MAX_ARTICLE_LIMIT);
  const perSourceLimit = parseIntParam(url.searchParams.get("per_source_limit"), 12, 1, 30);
  const sources = sourceSelection(url.searchParams);

  if (!isAuthorized(request)) {
    return json({ success: false, mode: MODE, error: "unauthorized" }, 401);
  }

  const observedAt = new Date().toISOString();
  const sourceResults = await Promise.all(sources.map((source) => fetchSourceArticles(source, perSourceLimit)));
  const fetchErrors = sourceResults.map((result) => result.error).filter(Boolean) as string[];

  const extracted = sourceResults.flatMap((result) => result.articles);
  const classified = extracted
    .map(classifyArticle)
    .sort((a, b) => b.prominenceScore - a.prominenceScore || a.position - b.position)
    .slice(0, articleLimit);

  const rows = classified.map((article) => toInsertRow(article, observedAt));
  const classifiedCount = classified.filter((article) => article.microAgendaId).length;

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

  const errors = [...fetchErrors];
  if (writeError) errors.push(writeError);

  return json({
    success: !writeError,
    mode: MODE,
    generated_at: observedAt,
    diagnostics: {
      read_only: dryRun,
      writes_to_database: !dryRun && !writeError,
      target_table: TARGET_TABLE,
      source_mode: "homepage_scrape_v1",
      sources_requested: sources.length,
      sources: sources.map((source) => ({ key: source.key, name: source.name, homepage_url: source.homepageUrl })),
      article_limit: articleLimit,
      per_source_limit: perSourceLimit,
      classifier: "local_micro_agenda_keyword_rules_v1",
    },
    sources_with_errors: fetchErrors.length,
    articles_extracted: extracted.length,
    articles_considered: classified.length,
    classified_articles: classifiedCount,
    dry_run: dryRun,
    writes: written,
    writes_preview: rows.slice(0, 12).map((row) => ({
      source_name: row.source_name,
      surface: row.surface,
      position: row.position,
      prominence_score: row.prominence_score,
      article_title: row.article_title,
      parent_topic: row.parent_topic,
      micro_agenda: row.micro_agenda,
      micro_agenda_id: row.micro_agenda_id,
      classifier_confidence: row.classifier_confidence,
      article_url: row.article_url,
    })),
    errors,
  });
}
