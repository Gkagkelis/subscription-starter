import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TopicRow = {
  name?: string | null;
  topic?: string | null;
  agenda_score?: number | null;
  public_attention_signal?: number | null;
  updated_at?: string | null;
};

type TrendWrite = {
  topic: string;
  region: string;
  timeframe: string;
  queries: string[];
  search_interest_score: number;
  search_interest_status: string;
  rising_queries: unknown[];
  raw_payload: Record<string, unknown>;
  fetched_at: string;
};

type TrendCandidate = {
  topic: string;
  queries: string[];
  source: "manual" | "agenda_probe_micro_agenda" | "parent_topic_fallback";
  micro_agenda_id?: string | null;
  parent_topic?: string | null;
  score?: number | null;
};

type ProbeCluster = {
  title?: string | null;
  topic?: string | null;
  micro_agenda?: string | null;
  micro_agenda_id?: string | null;
  parent_topic?: string | null;
  score?: number | null;
};

const REGION = "GR";
const TIMEFRAME = "now 7-d";
const DEFAULT_LIMIT = 12;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeActorId(actor: string): string {
  return actor.trim().replace("/", "~");
}

function isAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const auth = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-vercel-cron") || "";
  const devAllowed = process.env.ALLOW_DEV_PROBE_TOKEN === "true" && token === "dev";
  const cronSecret = process.env.CRON_SECRET || process.env.TRENDS_CRON_SECRET || "";
  const bearerAllowed = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const vercelCronAllowed = process.env.ALLOW_VERCEL_CRON_HEADER === "true" && cronHeader === "1";
  return devAllowed || bearerAllowed || vercelCronAllowed;
}

function dedupe<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const MICRO_AGENDA_QUERY_MAP: Record<string, string[]> = {
  housing_rents: ["ενοίκια", "στεγαστικό", "τιμές κατοικιών"],
  housing_renovation_programs: ["Ανακαινίζω", "ανακαίνιση κατοικίας", "επιδότηση ανακαίνισης"],
  airbnb_short_term_rentals: ["Airbnb", "βραχυχρόνια μίσθωση", "τουριστική μίσθωση"],
  migration_asylum: ["μεταναστευτικό", "άσυλο", "μετανάστες"],
  taxation_public_revenue: ["φορολογικές δηλώσεις", "ΑΑΔΕ", "φορολογία"],
  debt_settlement_installments: ["ρύθμιση οφειλών", "72 δόσεις", "χρέη εφορία"],
  farmers_rural_production: ["αγρότες", "αγροτικές επιδοτήσεις", "ΕΛΓΑ"],
  wildfire_prevention: ["καθαρισμός οικοπέδων", "πυροπροστασία", "πρόστιμα οικόπεδα"],
  public_infrastructure_projects: ["δημόσια έργα", "υποδομές", "Αττική Οδός"],
  social_benefits_support: ["επίδομα", "κοινωνικά επιδόματα", "επίδομα θέρμανσης"],
  consumer_price_tools: ["posokanei", "ακρίβεια", "σύγκριση τιμών"],
  banks_consumer_protection: ["τράπεζες", "τραπεζικές χρεώσεις", "καταναλωτική προστασία"],
  defense_technology_drones: ["drones", "αμυντική τεχνολογία", "μη επανδρωμένα"],
  hormuz_geopolitical_risk: ["Ορμούζ", "Ιράν", "πετρέλαιο"],
};

function makeQueriesForCandidate(topic: string, microAgendaId?: string | null): string[] {
  const mapped = microAgendaId ? MICRO_AGENDA_QUERY_MAP[microAgendaId] : undefined;
  if (mapped?.length) return mapped.slice(0, 4);
  return makeQueries(topic);
}

function makeQueries(topic: string): string[] {
  const clean = topic.replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
  const parts = topic.split("/").map((p) => p.trim()).filter(Boolean);
  return dedupe([clean, ...parts].filter((q) => q.length >= 3), (q) => q.toLocaleLowerCase("el-GR")).slice(0, 4);
}

async function loadParentTopicCandidates(limit: number): Promise<TrendCandidate[]> {
  const [agendaTopics, advisorBriefs] = await Promise.all([
    supabase
      .from("agenda_topics")
      .select("name, agenda_score, public_attention_signal, updated_at")
      .order("agenda_score", { ascending: false })
      .limit(limit * 2),
    supabase
      .from("v_advisor_agenda_briefs_recent")
      .select("topic, agenda_score, latest_seen_at")
      .order("agenda_score", { ascending: false })
      .limit(limit * 2),
  ]);

  const rows: TopicRow[] = [];
  if (!agendaTopics.error && Array.isArray(agendaTopics.data)) rows.push(...agendaTopics.data);
  if (!advisorBriefs.error && Array.isArray(advisorBriefs.data)) rows.push(...(advisorBriefs.data as TopicRow[]));

  const candidates: TrendCandidate[] = [];
  for (const row of rows) {
    const topic = textValue(row.name || row.topic);
    if (topic.length < 3) continue;
    candidates.push({
      topic,
      queries: makeQueries(topic),
      source: "parent_topic_fallback",
      score: row.agenda_score ?? row.public_attention_signal ?? null,
    });
  }

  return dedupe(candidates, (item) => item.topic.toLocaleLowerCase("el-GR")).slice(0, limit);
}

async function loadMicroAgendaCandidates(request: Request, limit: number): Promise<TrendCandidate[]> {
  const currentUrl = new URL(request.url);
  const token = currentUrl.searchParams.get("token") || "dev";
  const probeUrl = new URL("/api/situation-engine/agenda-probe", currentUrl.origin);
  probeUrl.searchParams.set("token", token);
  probeUrl.searchParams.set("view", "brief");

  const res = await fetch(probeUrl.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`agenda-probe ${res.status}`);
  const payload = await res.json();
  const clusters = Array.isArray(payload?.agenda_clusters) ? (payload.agenda_clusters as ProbeCluster[]) : [];

  const candidates: TrendCandidate[] = [];
  for (const cluster of clusters) {
    const topic = textValue(cluster.title || cluster.micro_agenda || cluster.topic);
    if (topic.length < 3) continue;
    const microAgendaId = textValue(cluster.micro_agenda_id) || null;
    candidates.push({
      topic,
      queries: makeQueriesForCandidate(topic, microAgendaId),
      source: "agenda_probe_micro_agenda",
      micro_agenda_id: microAgendaId,
      parent_topic: textValue(cluster.parent_topic) || null,
      score: typeof cluster.score === "number" ? cluster.score : null,
    });
  }

  return dedupe(candidates, (item) => `${item.micro_agenda_id || ""}|${item.topic.toLocaleLowerCase("el-GR")}`).slice(0, limit);
}

async function loadTrendCandidates(request: Request, limit: number, sourceMode: string): Promise<TrendCandidate[]> {
  if (sourceMode === "parents") return loadParentTopicCandidates(limit);
  try {
    const micro = await loadMicroAgendaCandidates(request, limit);
    if (micro.length) return micro;
  } catch {
    // Fallback keeps the endpoint usable if agenda-probe is unavailable during deploys.
  }
  return loadParentTopicCandidates(limit);
}

function collectNumericValues(value: unknown, out: number[] = []): number[] {
  if (out.length > 500) return out;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 100) out.push(value);
    return out;
  }
  if (typeof value === "string") {
    const n = numberValue(value, NaN);
    if (Number.isFinite(n) && n >= 0 && n <= 100) out.push(n);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumericValues(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      // Skip actual timestamps/dates and config fields, but DO NOT skip "interestOverTime".
      if (
        k === "date" ||
        k === "timestamp" ||
        k === "scrapedat" ||
        k === "timerange" ||
        k === "timeframe" ||
        k === "geo" ||
        k === "property"
      ) continue;
      collectNumericValues(val, out);
    }
  }
  return out;
}

type SeriesStats = {
  values: number[];
  average: number;
  peak: number;
  recent_average: number;
  last_value: number;
  non_zero_rate: number;
};

function extractSeriesValuesFromEntry(entry: unknown): number[] {
  if (!entry || typeof entry !== "object") return [];
  const obj = entry as Record<string, unknown>;
  const raw = obj.value ?? obj.values ?? obj.formattedValue;
  if (Array.isArray(raw)) {
    return raw
      .map((v) => numberValue(v, NaN))
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= 100);
  }
  const n = numberValue(raw, NaN);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? [n] : [];
}

function findInterestSeries(value: unknown, out: number[] = []): number[] {
  if (out.length > 1000 || !value) return out;

  if (Array.isArray(value)) {
    const looksLikeSeries = value.some((item) => {
      if (!item || typeof item !== "object") return false;
      const obj = item as Record<string, unknown>;
      return obj.value != null && (obj.date != null || obj.timestamp != null || obj.isPartial != null);
    });

    if (looksLikeSeries) {
      for (const item of value) {
        out.push(...extractSeriesValuesFromEntry(item));
        if (out.length > 1000) break;
      }
      return out;
    }

    for (const item of value) findInterestSeries(item, out);
    return out;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      if (
        k === "interestovertime" ||
        k === "interest_over_time" ||
        k === "timelinedata" ||
        k === "timeline_data" ||
        k === "timeline"
      ) {
        findInterestSeries(val, out);
        continue;
      }
      if (typeof val === "object") findInterestSeries(val, out);
    }
  }

  return out;
}

function summarizeSeries(values: number[]): SeriesStats | null {
  const clean = values.filter((v) => Number.isFinite(v) && v >= 0 && v <= 100);
  if (!clean.length) return null;
  const average = clean.reduce((a, b) => a + b, 0) / clean.length;
  const peak = Math.max(...clean);
  const recent = clean.slice(-24);
  const recent_average = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : average;
  const last_value = clean[clean.length - 1] ?? 0;
  const non_zero_rate = clean.filter((v) => v > 0).length / clean.length;
  return { values: clean, average, peak, recent_average, last_value, non_zero_rate };
}

function extractRisingQueries(payload: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (value: unknown) => {
    if (out.length >= 25) return;
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    const maybeQuery = obj.query || obj.keyword || obj.title || obj.term || obj.name;
    const maybeValue = obj.value || obj.score || obj.formattedValue || obj.growth || obj.rising;
    if (typeof maybeQuery === "string" && maybeQuery.trim().length >= 2) {
      out.push({ query: maybeQuery.trim(), value: maybeValue ?? null });
    }
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      if (k.includes("rising") || k.includes("related") || k.includes("query") || k.includes("queries")) {
        walk(val);
      }
    }
  };
  walk(payload);
  return out.slice(0, 25);
}

function extractTrendScore(items: unknown[]): {
  score: number | null;
  confidence: "parsed" | "weak" | "none";
  numeric_sample: number[];
  series_stats?: Omit<SeriesStats, "values"> & { points: number };
  scoring_method: "interest_over_time" | "generic_numeric_fallback" | "none";
} {
  const seriesValues: number[] = [];
  for (const item of items) findInterestSeries(item, seriesValues);
  const stats = summarizeSeries(seriesValues);

  if (stats) {
    // Google Trends values are relative within the query. We use average/recent momentum
    // more than isolated peak, so one random spike doesn't become a false "public pulse".
    const score = clamp(Math.round(
      stats.average * 0.50 +
      stats.recent_average * 0.25 +
      stats.peak * 0.15 +
      stats.non_zero_rate * 10
    ));

    return {
      score,
      confidence: stats.values.length >= 24 ? "parsed" : "weak",
      numeric_sample: stats.values.slice(0, 12),
      series_stats: {
        average: Math.round(stats.average * 10) / 10,
        peak: stats.peak,
        recent_average: Math.round(stats.recent_average * 10) / 10,
        last_value: stats.last_value,
        non_zero_rate: Math.round(stats.non_zero_rate * 1000) / 1000,
        points: stats.values.length,
      },
      scoring_method: "interest_over_time",
    };
  }

  const values: number[] = [];
  for (const item of items) collectNumericValues(item, values);
  const filtered = values.filter((v) => Number.isFinite(v) && v >= 0 && v <= 100);
  if (!filtered.length) {
    return { score: null, confidence: "none", numeric_sample: [], scoring_method: "none" };
  }

  const topValues = filtered.slice(-40);
  const max = Math.max(...topValues);
  const avg = topValues.reduce((a, b) => a + b, 0) / topValues.length;
  const score = clamp(Math.round(max * 0.45 + avg * 0.55));
  return {
    score,
    confidence: filtered.length >= 8 ? "parsed" : "weak",
    numeric_sample: filtered.slice(0, 12),
    scoring_method: "generic_numeric_fallback",
  };
}


async function runApifyTrendActor(topic: string, queries: string[]) {
  const token = process.env.APIFY_API_TOKEN;
  const actorRaw = process.env.APIFY_GOOGLE_TRENDS_ACTOR;
  if (!token) throw new Error("Missing APIFY_API_TOKEN");
  if (!actorRaw) throw new Error("Missing APIFY_GOOGLE_TRENDS_ACTOR");

  const actor = normalizeActorId(actorRaw);
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  const input = {
    query: queries[0],
    queries,
    searchTerms: queries,
    terms: queries,
    keywords: queries,
    geo: REGION,
    countryCode: REGION,
    region: REGION,
    timeframe: TIMEFRAME,
    timeRange: TIMEFRAME,
    date: TIMEFRAME,
    maxItems: 50,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Apify ${res.status}: ${text.slice(0, 500)}`);
    }
    let items: unknown[] = [];
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error(`Apify returned non-json payload: ${text.slice(0, 200)}`);
    }
    const scoreResult = extractTrendScore(items);
    const rising = extractRisingQueries(items);
    return {
      topic,
      queries,
      actor: actorRaw,
      input,
      raw_count: items.length,
      score_result: scoreResult,
      rising_queries: rising,
      items_sample: items.slice(0, 3),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const requestedLimit = numberValue(url.searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = clamp(requestedLimit, 1, 25);
  const topicParam = textValue(url.searchParams.get("topic"));
  const sourceMode = textValue(url.searchParams.get("source") || "micro_agendas");

  if (!isAuthorized(request)) {
    return json({ success: false, error: "unauthorized" }, 401);
  }

  const actor = process.env.APIFY_GOOGLE_TRENDS_ACTOR || null;
  const diagnostics = {
    read_only: dryRun,
    writes_to_database: !dryRun,
    write_operation: "upsert",
    token_present: !!process.env.APIFY_API_TOKEN,
    actor_present: !!actor,
    actor,
    source_topics:
      sourceMode === "parents"
        ? ["agenda_topics", "v_advisor_agenda_briefs_recent"]
        : ["agenda-probe agenda_clusters", "agenda_topics fallback", "v_advisor_agenda_briefs_recent fallback"],
    source_mode: sourceMode,
    target_table: "topic_trend_signals",
    status_written: "apify_google_trends",
    region: REGION,
    timeframe: TIMEFRAME,
  };

  if (!process.env.APIFY_API_TOKEN || !actor) {
    return json({ success: false, error: "missing_apify_google_trends_config", diagnostics }, 400);
  }

  const candidates: TrendCandidate[] = topicParam
    ? [{ topic: topicParam, queries: makeQueries(topicParam), source: "manual" }]
    : await loadTrendCandidates(request, limit, sourceMode);
  const results: unknown[] = [];
  const writes: TrendWrite[] = [];
  const errors: unknown[] = [];
  const fetchedAt = new Date().toISOString();

  for (const candidate of candidates) {
    const { topic, queries } = candidate;
    try {
      const result = await runApifyTrendActor(topic, queries);
      results.push(result);
      const score = result.score_result.score;
      if (typeof score === "number") {
        writes.push({
          topic,
          region: REGION,
          timeframe: TIMEFRAME,
          queries,
          search_interest_score: score,
          search_interest_status: result.score_result.confidence === "parsed" ? "apify_google_trends" : "apify_google_trends_weak_parse",
          rising_queries: result.rising_queries,
          raw_payload: {
            provider: "apify",
            actor,
            fetched_at: fetchedAt,
            parser_confidence: result.score_result.confidence,
            raw_count: result.raw_count,
            numeric_sample: result.score_result.numeric_sample,
            scoring_method: result.score_result.scoring_method,
            series_stats: result.score_result.series_stats ?? null,
            items_sample: result.items_sample,
            candidate_source: candidate.source,
            micro_agenda_id: candidate.micro_agenda_id ?? null,
            parent_topic: candidate.parent_topic ?? null,
            source_score: candidate.score ?? null,
          },
          fetched_at: fetchedAt,
        });
      } else {
        errors.push({ topic, error: "no_parseable_0_100_trend_score", actor, raw_count: result.raw_count, sample: result.items_sample });
      }
    } catch (error) {
      errors.push({ topic, error: String((error as Error)?.message || error) });
    }
  }

  if (!dryRun && writes.length) {
    const upserted = await supabase
      .from("topic_trend_signals")
      .upsert(writes, { onConflict: "topic,region,timeframe" });
    if (upserted.error) {
      return json({
        success: false,
        error: "supabase_upsert_failed",
        details: upserted.error.message,
        diagnostics,
        attempted_writes: writes,
        results,
        errors,
      }, 500);
    }
  }

  return json({
    success: true,
    mode: "fetch_topic_trends_apify_google_trends_v3_3_micro_agendas_upsert",
    generated_at: fetchedAt,
    diagnostics,
    topics_requested: candidates.length,
    candidates: dryRun ? candidates : candidates.map((c) => ({ topic: c.topic, source: c.source, micro_agenda_id: c.micro_agenda_id ?? null })),
    parseable_writes: writes.length,
    dry_run: dryRun,
    writes_preview: dryRun ? writes : writes.map((w) => ({ topic: w.topic, score: w.search_interest_score, status: w.search_interest_status })),
    errors,
    results: dryRun ? results : undefined,
  });
}
