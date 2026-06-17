import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TopicRow = {
  name?: string | null;
  topic?: string | null;
  agenda_score?: number | string | null;
  event_score?: number | string | null;
};

type GdeltArticle = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  seenDate?: string;
  domain?: string;
  sourceCountry?: string;
  sourcecountry?: string;
  language?: string;
  socialimage?: string;
  [key: string]: unknown;
};

type CandidateRow = {
  source: "gdelt";
  topic: string;
  query: string;
  title: string | null;
  url: string;
  canonical_url: string;
  domain: string | null;
  language: string | null;
  source_country: string | null;
  published_at: string | null;
  seen_at: string | null;
  status: "pending";
  raw_payload: Record<string, unknown>;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseGdeltDate(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  // GDELT often returns YYYYMMDDHHMMSS, but keep ISO-compatible values too.
  const gdelt = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (gdelt) {
    const [, y, mo, d, h, mi, s] = gdelt;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function topicVariants(topic: string) {
  const normalized = topic.trim();
  const variants = [normalized];

  const expansions: Record<string, string[]> = {
    "Ακρίβεια / κόστος ζωής": ["Ακρίβεια", "κόστος ζωής", "πληθωρισμός"],
    "Ασφάλεια / εγκληματικότητα": ["εγκληματικότητα", "ασφάλεια", "βία"],
    "Περιβάλλον / κλιματική κρίση": ["κλιματική κρίση", "περιβάλλον", "πυρκαγιές"],
    "Υποδομές / μεταφορές": ["υποδομές", "μεταφορές", "σιδηρόδρομος"],
    "Ασφαλιστικό / συντάξεις": ["συντάξεις", "ασφαλιστικό"],
    "Ψηφιακή πολιτική / τεχνολογία": ["τεχνητή νοημοσύνη", "τεχνολογία", "ψηφιακή πολιτική"],
  };

  for (const extra of expansions[normalized] || []) variants.push(extra);
  return unique(variants.filter(Boolean)).slice(0, 4);
}

function buildGdeltQuery(topic: string) {
  const variants = topicVariants(topic)
    .map((term) => `"${term.replace(/"/g, "")}"`)
    .join(" OR ");

  // Greece-focused shadow discovery. We keep it strict enough to avoid global noise.
  return `(${variants}) sourcelang:Greek sourcecountry:GR`;
}

async function fetchGdeltArticles(topic: string, timespan: string, maxRecords: number) {
  const query = buildGdeltQuery(topic);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("maxrecords", String(maxRecords));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Noraya/1.0 external-signal-shadow",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        topic,
        query,
        error: `GDELT ${response.status}`,
        articles: [] as GdeltArticle[],
      };
    }

    const json = (await response.json()) as { articles?: GdeltArticle[] };
    return {
      topic,
      query,
      error: null as string | null,
      articles: Array.isArray(json.articles) ? json.articles : [],
    };
  } catch (error) {
    return {
      topic,
      query,
      error: error instanceof Error ? error.message : "GDELT fetch failed",
      articles: [] as GdeltArticle[],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function candidateFromArticle(topic: string, query: string, article: GdeltArticle): CandidateRow | null {
  const rawUrl = cleanText(article.url || article.url_mobile);
  if (!rawUrl) return null;

  const normalizedUrl = canonicalUrl(rawUrl);
  const title = cleanText(article.title) || null;
  const seenAt = parseGdeltDate(article.seendate || article.seenDate);
  const domain = cleanText(article.domain) || domainFromUrl(normalizedUrl);
  const language = cleanText(article.language) || "Greek";
  const sourceCountry = cleanText(article.sourceCountry || article.sourcecountry) || "GR";

  return {
    source: "gdelt",
    topic,
    query,
    title,
    url: normalizedUrl,
    canonical_url: normalizedUrl,
    domain,
    language,
    source_country: sourceCountry,
    published_at: seenAt,
    seen_at: seenAt || new Date().toISOString(),
    status: "pending",
    raw_payload: article,
  };
}

async function loadTopics(limit: number, explicitTopics: string[]) {
  if (explicitTopics.length) return explicitTopics.slice(0, limit);

  const { data: eventRows } = await supabase
    .from("v_political_events_live")
    .select("topic,event_score")
    .order("event_score", { ascending: false })
    .limit(limit * 2);

  const eventTopics = Array.isArray(eventRows)
    ? eventRows
        .map((row: TopicRow) => cleanText(row.topic))
        .filter(Boolean)
    : [];

  if (eventTopics.length) return unique(eventTopics).slice(0, limit);

  const { data: agendaRows } = await supabase
    .from("agenda_topics")
    .select("name,agenda_score")
    .neq("name", "Μη ταξινομημένο")
    .order("agenda_score", { ascending: false })
    .limit(limit);

  return Array.isArray(agendaRows)
    ? unique(
        agendaRows
          .map((row: TopicRow) => cleanText(row.name))
          .filter(Boolean)
      ).slice(0, limit)
    : [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = searchParams.get("dry_run") === "1" || searchParams.get("dry_run") === "true";
  const topicParam = searchParams.get("topic") || searchParams.get("topics") || "";
  const explicitTopics = topicParam
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const topicLimit = Math.min(Math.max(numberValue(searchParams.get("limit"), 8), 1), 12);
  const maxRecords = Math.min(Math.max(numberValue(searchParams.get("maxrecords"), 12), 1), 50);
  const timespan = cleanText(searchParams.get("timespan")) || "48h";

  const topics = await loadTopics(topicLimit, explicitTopics);

  if (!topics.length) {
    return NextResponse.json({
      success: false,
      error: "No topics found for GDELT discovery.",
      candidates_found: 0,
      candidates_inserted: 0,
    });
  }

  const responses = [];
  const candidateMap = new Map<string, CandidateRow>();

  for (const topic of topics) {
    const result = await fetchGdeltArticles(topic, timespan, maxRecords);
    responses.push({
      topic,
      query: result.query,
      error: result.error,
      article_count: result.articles.length,
    });

    for (const article of result.articles) {
      const candidate = candidateFromArticle(topic, result.query, article);
      if (!candidate) continue;
      if (!candidateMap.has(candidate.url)) {
        candidateMap.set(candidate.url, candidate);
      }
    }
  }

  const candidates = Array.from(candidateMap.values());

  if (dryRun) {
    return NextResponse.json({
      success: true,
      mode: "dry_run",
      topics,
      responses,
      candidates_found: candidates.length,
      candidates_preview: candidates.slice(0, 20),
    });
  }

  let existingCount = 0;
  let insertedCount = 0;
  let inserted: Array<{ id?: string; url?: string; topic?: string }> = [];

  if (candidates.length) {
    const urls = candidates.map((candidate) => candidate.url);
    const { data: existingRows, error: existingError } = await supabase
      .from("external_article_candidates")
      .select("url")
      .eq("source", "gdelt")
      .in("url", urls);

    if (existingError) {
      return NextResponse.json(
        {
          success: false,
          stage: "read_existing_candidates",
          error: existingError.message,
        },
        { status: 500 }
      );
    }

    const existingUrls = new Set(
      Array.isArray(existingRows)
        ? existingRows.map((row: { url?: string | null }) => row.url).filter(Boolean)
        : []
    );

    existingCount = existingUrls.size;
    const newRows = candidates.filter((candidate) => !existingUrls.has(candidate.url));

    if (newRows.length) {
      const { data, error } = await supabase
        .from("external_article_candidates")
        .upsert(newRows, { onConflict: "source,url", ignoreDuplicates: true })
        .select("id,url,topic");

      if (error) {
        return NextResponse.json(
          {
            success: false,
            stage: "upsert_external_article_candidates",
            error: error.message,
          },
          { status: 500 }
        );
      }

      inserted = Array.isArray(data) ? data : [];
      insertedCount = inserted.length;
    }
  }

  return NextResponse.json({
    success: true,
    mode: "shadow",
    source: "gdelt",
    scope: "GR",
    topics,
    responses,
    candidates_found: candidates.length,
    candidates_existing: existingCount,
    candidates_inserted: insertedCount,
    inserted_preview: inserted.slice(0, 20),
  });
}
