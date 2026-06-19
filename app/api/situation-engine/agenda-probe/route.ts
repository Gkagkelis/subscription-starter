import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("strong") || normalized.includes("high")) return 100;
  if (normalized.includes("medium")) return 65;
  if (normalized.includes("initial") || normalized.includes("low")) return 35;
  return 40;
}

function evidenceArticles(row: any): any[] {
  return Array.isArray(row?.evidence_articles) ? row.evidence_articles : [];
}

function evidenceKey(article: any, fallback: string): string {
  return String(
    article?.article_id ||
      article?.url ||
      `${article?.source || "source"}-${article?.title || fallback}`
  );
}

function newestArticleAt(events: any[]): string | null {
  let newest = 0;

  for (const event of events) {
    newest = Math.max(
      newest,
      toTime(event?.last_article_at),
      toTime(event?.first_article_at),
      toTime(event?.first_seen_at)
    );

    for (const article of evidenceArticles(event)) {
      newest = Math.max(newest, toTime(article?.published_at));
    }
  }

  return newest ? new Date(newest).toISOString() : null;
}

function topEvidence(events: any[]): any[] {
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
    .slice(0, 8);
}

function isHighSeveritySingleEvent(event: any): boolean {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);
  const doc = documentationScore(event?.documentation_level);

  return (
    score >= 88 ||
    (score >= 80 && sourceCount >= 3) ||
    (score >= 78 && articleCount >= 6) ||
    (score >= 75 && sourceCount >= 3 && doc >= 65)
  );
}

function classifyEvent(event: any): string {
  const score = toNumber(event?.event_score);
  const articleCount = toNumber(event?.article_count);
  const sourceCount = toNumber(event?.source_count);

  if (isHighSeveritySingleEvent(event)) return "high_severity_single_event";
  if (score >= 70 && (articleCount >= 2 || sourceCount >= 2)) return "emerging_event";
  return "monitoring_event";
}

function groupEventsByTopic(events: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();

  for (const event of events) {
    const topic = String(event?.topic || "Μη ταξινομημένο").trim();
    if (!grouped.has(topic)) grouped.set(topic, []);
    grouped.get(topic)!.push(event);
  }

  return grouped;
}

function buildLiveAgenda(events: any[], trends: any[]) {
  const trendMap = new Map<string, any>();

  for (const trend of trends) {
    const topic = String(trend?.topic || "").trim();
    if (topic) trendMap.set(topic, trend);
  }

  const agendaClusters: any[] = [];
  const monitoringEvents: any[] = [];
  const grouped = groupEventsByTopic(events);

  for (const [topic, topicEvents] of grouped.entries()) {
    const sortedEvents = [...topicEvents].sort(
      (a, b) => toNumber(b?.event_score) - toNumber(a?.event_score)
    );
    const bestEvent = sortedEvents[0];

    const eventCount = topicEvents.length;
    const articleCount = topicEvents.reduce((sum, event) => sum + toNumber(event?.article_count), 0);
    const politicalArticleCount = topicEvents.reduce(
      (sum, event) => sum + toNumber(event?.political_article_count),
      0
    );
    const sourceCount = Math.max(...topicEvents.map((event) => toNumber(event?.source_count)), 0);
    const topEventScore = Math.max(...topicEvents.map((event) => toNumber(event?.event_score)), 0);

    const newest = newestArticleAt(topicEvents);
    const freshness = freshnessScore(newest);
    const doc = Math.max(
      ...topicEvents.map((event) => documentationScore(event?.documentation_level)),
      0
    );

    const trend = trendMap.get(topic);
    const trendScore = toNumber(trend?.search_interest_score, 50);

    const hasClusterEvidence = eventCount >= 2 || articleCount >= 3 || sourceCount >= 2;
    const highSeverity = isHighSeveritySingleEvent(bestEvent);

    let type = "monitoring_event";
    if (hasClusterEvidence) type = "agenda_cluster";
    else if (highSeverity) type = "high_severity_single_event";

    const coverageScore = clampScore(eventCount * 12 + articleCount * 6 + sourceCount * 12);
    const rawScore = clampScore(
      0.38 * topEventScore +
        0.22 * coverageScore +
        0.18 * trendScore +
        0.12 * freshness +
        0.1 * doc
    );
    const finalScore = type === "monitoring_event" ? Math.min(rawScore, 59) : rawScore;

    const item = {
      type,
      topic,
      title: type === "agenda_cluster" ? topic : bestEvent?.title,
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
      diagnosis:
        type === "monitoring_event"
          ? ["single_event_or_single_source_cap", "keep_under_monitoring"]
          : type === "high_severity_single_event"
            ? ["high_severity_override"]
            : ["multiple_events_or_sources", "agenda_cluster"],
      strategic_read:
        type === "monitoring_event"
          ? "Μεμονωμένο φρέσκο γεγονός. Δεν πρέπει να γίνει κεντρική ατζέντα χωρίς περισσότερες πηγές, επανάληψη ή πολιτική κλιμάκωση."
          : type === "high_severity_single_event"
            ? "Μεμονωμένο γεγονός με αρκετή ένταση για ξεχωριστή προσοχή."
            : "Συστάδα σημάτων με αρκετή κάλυψη για live agenda αξιολόγηση.",
      top_events: sortedEvents.slice(0, 6).map((event) => ({
        id: event?.id,
        title: event?.title,
        topic: event?.topic,
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

    if (type === "monitoring_event") monitoringEvents.push(item);
    else agendaClusters.push(item);
  }

  return {
    agenda_clusters: agendaClusters.sort((a, b) => b.score - a.score),
    monitoring_events: monitoringEvents
      .sort((a, b) => b.top_event_score - a.top_event_score)
      .slice(0, 20),
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

  const {
    data: events,
    error: eventsError,
    count: eventCount,
  } = await supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .gte("last_article_at", since)
    .order("last_article_at", { ascending: false, nullsFirst: false })
    .limit(300);

  if (eventsError) {
    return NextResponse.json(
      {
        success: false,
        stage: "read_v_political_events_live",
        error: eventsError.message,
      },
      { status: 500 }
    );
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
      ? legacySituations
          .map((s: any) => s?.last_seen_at)
          .filter(Boolean)
          .sort((a, b) => toTime(b) - toTime(a))[0]
      : null;

  const legacyHoursOld = newestLegacySeenAt ? hoursOld(newestLegacySeenAt) : null;
  const result = buildLiveAgenda(
    Array.isArray(events) ? events : [],
    Array.isArray(trends) ? trends : []
  );

  return NextResponse.json({
    success: true,
    mode: "read_only_live_agenda_probe",
    generated_at: new Date().toISOString(),
    params: {
      hours,
      since,
    },
    diagnostics: {
      read_only: true,
      writes_to_database: false,
      source_events: "v_political_events_live",
      source_trends: "topic_trend_signals",
      legacy_situations_source: "v_situation_engine_live",
      event_rows_considered: Array.isArray(events) ? events.length : 0,
      event_rows_total_matching_window: eventCount,
      newest_legacy_situation_seen_at: newestLegacySeenAt,
      newest_legacy_situation_hours_old:
        legacyHoursOld !== null && Number.isFinite(legacyHoursOld)
          ? Math.round(legacyHoursOld)
          : null,
      legacy_situations_are_stale_for_today:
        legacyHoursOld !== null && Number.isFinite(legacyHoursOld)
          ? legacyHoursOld > 48
          : null,
      trends_error: trendsError?.message ?? null,
      legacy_error: legacyError?.message ?? null,
    },
    agenda_clusters: result.agenda_clusters,
    monitoring_events: result.monitoring_events,
  });
}
