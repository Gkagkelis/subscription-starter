import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

type RawExternalArticle = {
  source: "gdelt";
  url: string;
  canonical_url: string;
  title: string | null;
  domain: string | null;
  language: string | null;
  source_country: string | null;
  published_at: string | null;
  seen_at: string | null;
  classification_status: "classified" | "noise";
  topics: string[];
  primary_topic: string | null;
  raw_payload: Record<string, unknown>;
};

type RawArticleForAggregation = {
  topics?: string[] | null;
  primary_topic?: string | null;
  domain?: string | null;
  seen_at?: string | null;
};

const TOPIC_KEYWORDS: Array<{ topic: string; keywords: string[] }> = [
  {
    topic: "Οικονομία",
    keywords: ["οικονομ", "χρέος", "ανάπτυξη", "αεπ", "αγορά", "τραπεζ", "επενδύ"],
  },
  {
    topic: "Ακρίβεια / κόστος ζωής",
    keywords: ["ακρίβ", "τιμές", "πληθωρισ", "κόστος ζωής", "καλάθι", "σούπερ μάρκετ"],
  },
  {
    topic: "Φορολογία",
    keywords: ["φορο", "φόρος", "τεκμήρια", "ααδε", "εισόδημα", "φορολογ"],
  },
  {
    topic: "Στέγαση",
    keywords: ["στέγ", "κατοικ", "ενοίκ", "στεγασ", "ακίνητ", "airbnb"],
  },
  {
    topic: "Ασφάλεια / εγκληματικότητα",
    keywords: ["εγκλημα", "αστυνομ", "βία", "δολοφον", "ληστε", "σύλληψ", "παραβατ"],
  },
  {
    topic: "Δικαιοσύνη",
    keywords: ["δικαιοσ", "δικαστ", "εισαγγελ", "υπόθεση", "δίκη", "απόφαση"],
  },
  {
    topic: "Υγεία",
    keywords: ["υγεία", "νοσοκομ", "γιατρ", "φαρμακ", "εοπυυ", "εσυ", "ασθεν"],
  },
  {
    topic: "Παιδεία",
    keywords: ["παιδεία", "σχολ", "πανεπιστ", "φοιτη", "εκπαιδευ", "εξετάσ"],
  },
  {
    topic: "Εργασία",
    keywords: ["εργασ", "ανεργ", "μισθ", "συνδικ", "απεργ", "υπάλληλ"],
  },
  {
    topic: "Ασφαλιστικό / συντάξεις",
    keywords: ["σύνταξ", "συνταξ", "ασφαλιστ", "εφκα"],
  },
  {
    topic: "Ενέργεια",
    keywords: ["ενέργ", "ρεύμα", "ηλεκτρ", "φυσικό αέριο", "καύσιμα", "πετρέλ"],
  },
  {
    topic: "Περιβάλλον / κλιματική κρίση",
    keywords: ["κλιμα", "περιβάλλον", "πυρκαγ", "πλημμύρ", "καύσω", "δάσος"],
  },
  {
    topic: "Πολιτική προστασία",
    keywords: ["πολιτική προστασία", "112", "πυροσβεστ", "σεισμ", "κακοκαιρ", "εκκένω"],
  },
  {
    topic: "Υποδομές / μεταφορές",
    keywords: ["υποδομ", "μεταφορ", "τρέν", "σιδηρόδρομ", "μετρό", "λεωφορεί", "λιμάνι"],
  },
  {
    topic: "Άμυνα",
    keywords: ["άμυνα", "στρατ", "εξοπλισ", "φρεγάτ", "rafale", "ένοπλες δυνάμεις"],
  },
  {
    topic: "Εξωτερική πολιτική",
    keywords: ["εξωτερική πολιτική", "τουρκ", "κυπρ", "ευρωπ", "νατο", "διπλωματ"],
  },
  {
    topic: "Μεταναστευτικό",
    keywords: ["μεταναστ", "προσφυγ", "άσυλο", "σύνορα", "δομή φιλοξενίας"],
  },
  {
    topic: "Ψηφιακή πολιτική / τεχνολογία",
    keywords: ["τεχνολογ", "ψηφιακ", "τεχνητή νοημοσύνη", "κυβερνο", "data", "ai"],
  },
  {
    topic: "Αυτοδιοίκηση",
    keywords: ["δήμος", "δήμαρχ", "περιφέρεια", "αυτοδιοίκ", "δημοτικ"],
  },
  {
    topic: "Κοινωνία",
    keywords: ["κοινων", "οικογέν", "νέοι", "δημογραφ", "ισότητα", "πολίτες"],
  },
];

const ALL_TOPICS = TOPIC_KEYWORDS.map((item) => item.topic);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  const gdelt = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (gdelt) {
    const [, y, mo, d, h, mi, s] = gdelt;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function classifyTitle(title: string) {
  const normalized = title.toLocaleLowerCase("el-GR");
  const scored = TOPIC_KEYWORDS.map(({ topic, keywords }) => {
    const score = keywords.reduce((sum, keyword) => {
      return normalized.includes(keyword.toLocaleLowerCase("el-GR")) ? sum + 1 : sum;
    }, 0);
    return { topic, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((item) => item.topic);
}

function candidateFromArticle(article: GdeltArticle): RawExternalArticle | null {
  const rawUrl = cleanText(article.url || article.url_mobile);
  if (!rawUrl) return null;

  const title = cleanText(article.title);
  const normalizedUrl = canonicalUrl(rawUrl);
  const seenAt = parseGdeltDate(article.seendate || article.seenDate);
  const domain = cleanText(article.domain) || domainFromUrl(normalizedUrl);
  const language = cleanText(article.language) || "Greek";
  const sourceCountry = cleanText(article.sourceCountry || article.sourcecountry) || "GR";
  const topics = title ? classifyTitle(title) : [];

  return {
    source: "gdelt",
    url: normalizedUrl,
    canonical_url: normalizedUrl,
    title: title || null,
    domain,
    language,
    source_country: sourceCountry,
    published_at: seenAt,
    seen_at: seenAt || new Date().toISOString(),
    classification_status: topics.length ? "classified" : "noise",
    topics,
    primary_topic: topics[0] || null,
    raw_payload: article,
  };
}

async function fetchGdeltFeed(timespan: string, maxRecords: number) {
  const query = "sourcecountry:GR sourcelang:Greek";
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("maxrecords", String(maxRecords));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Noraya/1.0 gdelt-feed-collector",
      },
      cache: "no-store",
    });

    const body = await response.text();

    if (!response.ok) {
      return {
        query,
        gdelt_url: url.toString(),
        rate_limited: response.status === 429,
        error:
          response.status === 429
            ? "GDELT 429 rate limit"
            : body
              ? `GDELT ${response.status}: ${body.slice(0, 180)}`
              : `GDELT ${response.status}`,
        articles: [] as GdeltArticle[],
      };
    }

    try {
      const json = JSON.parse(body) as { articles?: GdeltArticle[] };
      return {
        query,
        gdelt_url: url.toString(),
        rate_limited: false,
        error: null as string | null,
        articles: Array.isArray(json.articles) ? json.articles : [],
      };
    } catch {
      return {
        query,
        gdelt_url: url.toString(),
        rate_limited: false,
        error: body
          ? `GDELT non-json response: ${body.slice(0, 180)}`
          : "GDELT non-json response",
        articles: [] as GdeltArticle[],
      };
    }
  } catch (error) {
    return {
      query,
      gdelt_url: url.toString(),
      rate_limited: false,
      error: error instanceof Error ? error.message : "GDELT fetch failed",
      articles: [] as GdeltArticle[],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertTopicSignals(windowHours: number, rateLimited = false) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("external_articles_raw")
    .select("topics,primary_topic,domain,seen_at")
    .eq("source", "gdelt")
    .gte("seen_at", since)
    .limit(2000);

  if (error) {
    return { error: error.message, updated: 0 };
  }

  const rows = Array.isArray(data) ? (data as RawArticleForAggregation[]) : [];
  const metrics = new Map<string, { mentions: number; domains: Set<string> }>();

  for (const topic of ALL_TOPICS) {
    metrics.set(topic, { mentions: 0, domains: new Set<string>() });
  }

  for (const row of rows) {
    const rowTopics = Array.isArray(row.topics) ? row.topics : [];
    for (const topic of rowTopics) {
      if (!metrics.has(topic)) metrics.set(topic, { mentions: 0, domains: new Set<string>() });
      const metric = metrics.get(topic)!;
      metric.mentions += 1;
      if (row.domain) metric.domains.add(row.domain);
    }
  }

  const weighted = Array.from(metrics.entries()).map(([topic, metric]) => ({
    topic,
    mention_count: metric.mentions,
    unique_domain_count: metric.domains.size,
    weight: metric.mentions + metric.domains.size * 0.75,
  }));

  const maxWeight = Math.max(...weighted.map((item) => item.weight), 0);
  const now = new Date().toISOString();

  const signalRows = weighted.map((item) => {
    const coverageScore = maxWeight > 0 ? Math.round((item.weight / maxWeight) * 100) : 0;
    return {
      source: "gdelt",
      topic: item.topic,
      window_hours: windowHours,
      mention_count: item.mention_count,
      candidate_count: item.mention_count,
      unique_domain_count: item.unique_domain_count,
      coverage_score: coverageScore,
      sample_status: rateLimited
        ? "rate_limited"
        : item.mention_count > 0
          ? "active"
          : "insufficient",
      last_checked_at: now,
      raw_metrics: {
        window_hours: windowHours,
        max_weight: maxWeight,
        topic_weight: item.weight,
      },
    };
  });

  const { error: upsertError } = await supabase
    .from("external_topic_signals")
    .upsert(signalRows, { onConflict: "source,topic,window_hours" });

  if (upsertError) {
    return { error: upsertError.message, updated: 0 };
  }

  return { error: null, updated: signalRows.length };
}

async function upsertCandidateRows(rows: RawExternalArticle[]) {
  const candidates = rows
    .filter((row) => row.primary_topic)
    .map((row) => ({
      source: "gdelt",
      topic: row.primary_topic!,
      query: "gdelt-feed",
      title: row.title,
      url: row.url,
      canonical_url: row.canonical_url,
      domain: row.domain,
      language: row.language,
      source_country: row.source_country,
      published_at: row.published_at,
      seen_at: row.seen_at,
      status: "pending",
      raw_payload: row.raw_payload,
    }));

  if (!candidates.length) return { inserted: 0, error: null as string | null };

  const { data, error } = await supabase
    .from("external_article_candidates")
    .upsert(candidates, { onConflict: "source,url", ignoreDuplicates: true })
    .select("id");

  if (error) return { inserted: 0, error: error.message };
  return { inserted: Array.isArray(data) ? data.length : 0, error: null };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = searchParams.get("dry_run") === "1" || searchParams.get("dry_run") === "true";
  const timespan = cleanText(searchParams.get("timespan")) || "6h";
  const maxRecords = Math.min(Math.max(numberValue(searchParams.get("maxrecords"), 50), 1), 100);
  const windowHours = Math.min(Math.max(numberValue(searchParams.get("window_hours"), 72), 6), 168);

  const feed = await fetchGdeltFeed(timespan, maxRecords);
  const rows = feed.articles
    .map(candidateFromArticle)
    .filter((row): row is RawExternalArticle => Boolean(row));

  if (dryRun) {
    return NextResponse.json({
      success: true,
      mode: "dry_run",
      source: "gdelt",
      query: feed.query,
      gdelt_url: feed.gdelt_url,
      rate_limited: feed.rate_limited,
      error: feed.error,
      articles_found: feed.articles.length,
      rows_ready: rows.length,
      classified_count: rows.filter((row) => row.topics.length > 0).length,
      noise_count: rows.filter((row) => row.topics.length === 0).length,
      preview: rows.slice(0, 20),
    });
  }

  if (feed.rate_limited) {
    const signals = await upsertTopicSignals(windowHours, true);
    return NextResponse.json({
      success: true,
      mode: "feed",
      source: "gdelt",
      rate_limited: true,
      error: feed.error,
      raw_inserted: 0,
      candidates_inserted: 0,
      signals_updated: signals.updated,
    });
  }

  if (feed.error) {
    return NextResponse.json({
      success: false,
      mode: "feed",
      source: "gdelt",
      error: feed.error,
      raw_inserted: 0,
      candidates_inserted: 0,
    });
  }

  let rawInserted = 0;

  if (rows.length) {
    const { data, error } = await supabase
      .from("external_articles_raw")
      .upsert(rows, { onConflict: "source,url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      return NextResponse.json(
        {
          success: false,
          mode: "feed",
          stage: "upsert_external_articles_raw",
          error: error.message,
        },
        { status: 500 }
      );
    }

    rawInserted = Array.isArray(data) ? data.length : 0;
  }

  const candidateResult = await upsertCandidateRows(rows);
  if (candidateResult.error) {
    return NextResponse.json(
      {
        success: false,
        mode: "feed",
        stage: "upsert_external_article_candidates",
        error: candidateResult.error,
      },
      { status: 500 }
    );
  }

  const signals = await upsertTopicSignals(windowHours, false);
  if (signals.error) {
    return NextResponse.json(
      {
        success: false,
        mode: "feed",
        stage: "upsert_external_topic_signals",
        error: signals.error,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    mode: "feed",
    source: "gdelt",
    query: feed.query,
    gdelt_url: feed.gdelt_url,
    timespan,
    window_hours: windowHours,
    articles_found: feed.articles.length,
    raw_rows_ready: rows.length,
    raw_inserted: rawInserted,
    classified_count: rows.filter((row) => row.topics.length > 0).length,
    noise_count: rows.filter((row) => row.topics.length === 0).length,
    candidates_inserted: candidateResult.inserted,
    signals_updated: signals.updated,
  });
}
