import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EvidenceArticle = {
  article_id?: string | null;
  title?: string | null;
  source?: string | null;
  url?: string | null;
  published_at?: string | null;
  score?: number | string | null;
  role?: string | null;
};

type TrendSignal = {
  topic?: string | null;
  search_interest_score?: number | string | null;
  search_interest_status?: string | null;
  queries?: string[] | null;
  fetched_at?: string | null;
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signalLabel(score: number) {
  if (score >= 70) return "Ισχυρό σήμα";
  if (score >= 55) return "Ανερχόμενο σήμα";
  if (score >= 35) return "Υπό παρακολούθηση";
  return "Χαμηλό σήμα";
}

function clampScore(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeLevelScore(value: unknown, kind: "doc" | "risk") {
  const normalized = String(value || "").toLowerCase();
  if (kind === "doc") {
    if (normalized.includes("strong") || normalized.includes("high") || normalized.includes("ισχυ")) return 100;
    if (normalized.includes("medium") || normalized.includes("μεσα")) return 65;
    if (normalized.includes("initial") || normalized.includes("low") || normalized.includes("αρχ")) return 35;
    if (normalized.includes("weak") || normalized.includes("insufficient") || normalized.includes("ανεπαρκ")) return 15;
    return 40;
  }

  if (normalized.includes("critical") || normalized.includes("high") || normalized.includes("υψη") || normalized.includes("active")) return 100;
  if (normalized.includes("medium") || normalized.includes("μεσα") || normalized.includes("monitoring")) return 65;
  if (normalized.includes("low") || normalized.includes("χαμη") || normalized.includes("quiet")) return 35;
  return 40;
}

function freshnessScore(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return 35;
  const hoursOld = (Date.now() - date.getTime()) / 36e5;
  if (hoursOld <= 24) return 100;
  if (hoursOld <= 48) return 75;
  if (hoursOld <= 7 * 24) return 45;
  return 20;
}

function coverageComponent(articleCount: unknown, sourceCount: unknown) {
  const a = Math.max(0, numberValue(articleCount, 0));
  const s = Math.max(0, numberValue(sourceCount, 0));
  return clampScore(a * 8 + s * 12);
}

function strategicBoostScore(input: {
  article_count?: unknown;
  source_count?: unknown;
  documentation_level?: unknown;
  political_risk_level?: unknown;
  urgency?: unknown;
  status?: unknown;
  last_article_at?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
}) {
  const coverage = coverageComponent(input.article_count, input.source_count);
  const doc = normalizeLevelScore(input.documentation_level, "doc");
  const risk = normalizeLevelScore(input.political_risk_level || input.urgency || input.status, "risk");
  const fresh = freshnessScore(input.last_article_at || input.updated_at || input.created_at);

  return clampScore(0.35 * coverage + 0.25 * doc + 0.25 * risk + 0.15 * fresh, 50);
}

function strategicIndexScore(rawSignal: unknown, searchInterest: unknown, boost: unknown, opportunityBonus = 0) {
  const raw = clampScore(numberValue(rawSignal, 0));
  const search = clampScore(numberValue(searchInterest, 50), 50);
  const strategicBoost = clampScore(numberValue(boost, 50), 50);
  return clampScore(0.55 * raw + 0.25 * search + 0.20 * strategicBoost + opportunityBonus);
}

function trendForTopic(trendMap: Map<string, TrendSignal>, topic?: string | null): TrendSignal {
  const key = String(topic || "").trim();
  return trendMap.get(key) || {
    topic: key,
    search_interest_score: 50,
    search_interest_status: "pending_fallback_50",
    queries: key ? [key] : [],
    fetched_at: null,
  };
}

function trendPayload(trend: TrendSignal) {
  return {
    search_interest_score: clampScore(numberValue(trend.search_interest_score, 50), 50),
    search_interest_status: trend.search_interest_status || "pending_fallback_50",
    search_interest_queries: trend.queries || [],
    search_interest_fetched_at: trend.fetched_at || null,
  };
}

function opportunityLabel(score: number, coverageLevel?: string | null) {
  const coverage = String(coverageLevel || "").toLowerCase();

  if (score >= 60 && coverage === "low") return "Ευκαιρία ανάδειξης";
  if (score >= 60 && coverage === "medium") return "Χώρος για πλαισίωση";
  if (score >= 60 && coverage === "high") return "Ήδη στο κέντρο";
  return "Παρακολούθηση";
}

function articleKey(article: EvidenceArticle, fallback: string) {
  return String(article.article_id || article.url || `${article.source || "source"}-${article.title || fallback}`);
}

function eventToSituationRow(ev: any, trendMap = new Map<string, TrendSignal>()) {
  const trend = trendForTopic(trendMap, ev.topic);
  const trendInfo = trendPayload(trend);
  const rawSignal = numberValue(ev.event_score, 0);
  const boost = strategicBoostScore(ev);
  const strategicIndex = strategicIndexScore(rawSignal, trendInfo.search_interest_score, boost);

  return {
    id: ev.id,
    title: ev.title,
    topic: ev.topic,
    situation_key: ev.event_key,
    status: ev.status,
    situation_type: "event",
    is_event: true,

    priority_score: ev.event_score,
    public_attention_score: ev.event_score,
    raw_signal_score: rawSignal,
    search_interest_score: trendInfo.search_interest_score,
    search_interest_status: trendInfo.search_interest_status,
    search_interest_queries: trendInfo.search_interest_queries,
    search_interest_fetched_at: trendInfo.search_interest_fetched_at,
    strategic_boost_score: boost,
    strategic_index_score: strategicIndex,
    strategic_index_label: signalLabel(strategicIndex),
    documentation_level: ev.documentation_level,

    framing_summary: ev.framing_summary ?? ev.summary ?? null,
    recommended_action: ev.recommended_action ?? null,
    avoid_action: ev.avoid_action ?? null,
    red_team_warning: ev.red_team_warning ?? null,

    evidence_summary: ev.summary ?? null,
    evidence_article_count: ev.article_count ?? 0,
    article_count: ev.article_count ?? 0,
    source_count: ev.source_count ?? 0,
    evidence_articles: ev.evidence_articles ?? [],

    detection_method: ev.detection_method ?? null,
    first_seen_at: ev.first_seen_at ?? null,
    last_seen_at: ev.last_article_at ?? null,
    created_at: ev.first_seen_at ?? null,
    updated_at: ev.last_computed_at ?? null,

    advisor_brief: ev.advisor_brief ?? null,
  };
}

function buildAgendaOverview(agendaRows: any[] = [], eventRows: any[] = [], trendMap = new Map<string, TrendSignal>()) {
  const eventsByTopic = new Map<string, any[]>();

  for (const ev of eventRows || []) {
    const topic = String(ev?.topic || "").trim();
    if (!topic) continue;
    if (!eventsByTopic.has(topic)) eventsByTopic.set(topic, []);
    eventsByTopic.get(topic)!.push(ev);
  }

  return (agendaRows || []).map((row) => {
    const topic = String(row?.name || row?.topic || "").trim();
    const relatedEventsRaw = eventsByTopic.get(topic) || [];
    const articleMap = new Map<string, EvidenceArticle>();

    for (const ev of relatedEventsRaw) {
      const articles = Array.isArray(ev?.evidence_articles) ? ev.evidence_articles : [];
      for (const article of articles) {
        if (!article || typeof article !== "object") continue;
        const key = articleKey(article as EvidenceArticle, `${topic}-${articleMap.size}`);
        const existing = articleMap.get(key);
        const currentScore = numberValue((article as EvidenceArticle).score, 0);
        const existingScore = existing ? numberValue(existing.score, 0) : -1;
        if (!existing || currentScore > existingScore) {
          articleMap.set(key, article as EvidenceArticle);
        }
      }
    }

    const evidenceArticles = Array.from(articleMap.values())
      .sort((a, b) => {
        const scoreDiff = numberValue(b.score, 0) - numberValue(a.score, 0);
        if (scoreDiff !== 0) return scoreDiff;
        const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
        const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);

    const score = numberValue(row?.agenda_score, 0);
    const trend = trendForTopic(trendMap, topic);
    const trendInfo = trendPayload(trend);
    const relatedArticleCount = relatedEventsRaw.reduce((sum, ev) => sum + numberValue(ev?.article_count, 0), 0);
    const relatedSourceCount = Math.max(numberValue(row?.source_diversity, 0), ...relatedEventsRaw.map((ev) => numberValue(ev?.source_count, 0)), 0);
    const newestRelatedEvent = relatedEventsRaw
      .map((ev) => ev?.last_article_at || ev?.updated_at || ev?.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] || row?.updated_at;
    const boost = strategicBoostScore({
      article_count: relatedArticleCount || row?.article_count,
      source_count: relatedSourceCount,
      documentation_level: row?.documentation_level,
      political_risk_level: row?.political_risk_level,
      last_article_at: newestRelatedEvent,
      updated_at: row?.updated_at,
    });
    const opportunityBonus = trendInfo.search_interest_score >= 65 && String(row?.coverage_level || "").toLowerCase() === "low" ? 5 : 0;
    const strategicIndex = strategicIndexScore(score, trendInfo.search_interest_score, boost, opportunityBonus);

    return {
      id: row?.id ?? topic,
      topic,
      category: row?.category ?? null,
      agenda_score: score,
      raw_signal_score: score,
      signal_label: signalLabel(score),
      search_interest_score: trendInfo.search_interest_score,
      search_interest_status: trendInfo.search_interest_status,
      search_interest_queries: trendInfo.search_interest_queries,
      search_interest_fetched_at: trendInfo.search_interest_fetched_at,
      strategic_boost_score: boost,
      strategic_index_score: strategicIndex,
      strategic_index_label: signalLabel(strategicIndex),
      strategic_index_components: {
        raw_signal: score,
        search_interest: trendInfo.search_interest_score,
        strategic_boost: boost,
        opportunity_bonus: opportunityBonus,
        formula: "0.55*raw + 0.25*search + 0.20*boost + opportunity_bonus",
      },
      coverage_level: row?.coverage_level ?? null,
      source_diversity: row?.source_diversity ?? 0,
      documentation_level: row?.documentation_level ?? null,
      political_risk_level: row?.political_risk_level ?? null,
      opportunity_label: opportunityLabel(score, row?.coverage_level),
      events_detected_at: row?.events_detected_at ?? null,
      updated_at: row?.updated_at ?? null,
      related_events: relatedEventsRaw.slice(0, 8).map((ev) => ({
        id: ev.id,
        title: ev.title,
        topic: ev.topic,
        event_score: ev.event_score,
        status: ev.status,
        article_count: ev.article_count ?? 0,
        source_count: ev.source_count ?? 0,
        last_article_at: ev.last_article_at ?? null,
      })),
      evidence_articles: evidenceArticles,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const refresh = searchParams.get("refresh");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let refreshResult: unknown = null;

  if (refresh === "1" || refresh === "true") {
    const { data, error } = await supabase.rpc("refresh_situation_engine_all");
    if (error) {
      return NextResponse.json(
        { success: false, stage: "refresh_situation_engine_all", error: error.message },
        { status: 500 }
      );
    }
    refreshResult = data;
  }

  const {
    data: eventRows,
    error: eventError,
    count: eventCount,
  } = await supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .order("event_score", { ascending: false })
    .limit(25);

  const {
    data: agendaRows,
    error: agendaError,
  } = await supabase
    .from("agenda_topics")
    .select("id,name,category,agenda_score,coverage_level,source_diversity,documentation_level,political_risk_level,events_detected_at,updated_at")
    .is("organization_id", null)
    .neq("name", "Μη ταξινομημένο")
    .order("agenda_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false });

  const { data: trendRows, error: trendError } = await supabase
    .from("topic_trend_signals")
    .select("topic,search_interest_score,search_interest_status,queries,fetched_at")
    .eq("region", "GR")
    .eq("timeframe", "now 7-d");

  const trendMap = new Map<string, TrendSignal>();
  if (!trendError && Array.isArray(trendRows)) {
    for (const row of trendRows as TrendSignal[]) {
      const topic = String(row?.topic || "").trim();
      if (topic) trendMap.set(topic, row);
    }
  }

  const safeEventRows = !eventError && Array.isArray(eventRows) ? eventRows : [];
  const agendaOverview = !agendaError && Array.isArray(agendaRows)
    ? buildAgendaOverview(agendaRows, safeEventRows, trendMap)
    : [];

  // Δρόμος Β: ανάλυση ΑΝΑ ΚΟΜΜΑ — φέρε το brief του ενεργού κόμματος και μπόλιασέ το στα γεγονότα.
  const party = searchParams.get("party") || "elas";
  if (safeEventRows.length) {
    const eventIds = safeEventRows.map((e: any) => e.id).filter(Boolean);
    if (eventIds.length) {
      const { data: pbRows } = await supabase
        .from("event_party_briefs")
        .select("event_id,advisor_brief,framing_summary,recommended_action,avoid_action,red_team_warning,summary,brief_generated_at")
        .eq("party_key", party)
        .in("event_id", eventIds);
      if (Array.isArray(pbRows)) {
        const pbMap = new Map<string, any>();
        for (const r of pbRows) pbMap.set(String((r as any).event_id), r);
        for (const ev of safeEventRows as any[]) {
          const pb = pbMap.get(String(ev.id));
          if (pb) {
            ev.advisor_brief = pb.advisor_brief ?? ev.advisor_brief;
            ev.framing_summary = pb.framing_summary ?? ev.framing_summary;
            ev.recommended_action = pb.recommended_action ?? ev.recommended_action;
            ev.avoid_action = pb.avoid_action ?? ev.avoid_action;
            ev.red_team_warning = pb.red_team_warning ?? ev.red_team_warning;
            ev.summary = pb.summary ?? ev.summary;
            ev.brief_generated_at = pb.brief_generated_at ?? ev.brief_generated_at;
          }
        }
      }
    }
  }

  if (!eventError && eventRows && eventRows.length > 0) {
    const situations = eventRows.map((ev) => eventToSituationRow(ev, trendMap));
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      refreshed: refresh === "1" || refresh === "true",
      refresh_result: refreshResult,
      count: eventCount ?? situations.length,
      returned_count: situations.length,
      source: "v_political_events_live",
      fallback_used: false,
      agenda_overview: agendaOverview,
      agenda_overview_error: agendaError?.message ?? null,
      trends_error: trendError?.message ?? null,
      situations,
    });
  }

  const {
    data: liveSituations,
    error: liveError,
    count: liveCount,
  } = await supabase
    .from("v_situation_engine_live")
    .select("*", { count: "exact" })
    .limit(25);

  if (liveError) {
    return NextResponse.json(
      { success: false, stage: "read_v_situation_engine_live", error: liveError.message },
      { status: 500 }
    );
  }

  let source = "v_situation_engine_live";
  let fallbackUsed = false;
  let situations = liveSituations || [];
  let totalCount = liveCount ?? situations.length;

  if (situations.length === 0) {
    const {
      data: fallbackSituations,
      error: fallbackError,
      count: fallbackCount,
    } = await supabase
      .from("political_situations")
      .select("*", { count: "exact" })
      .limit(25);

    if (fallbackError) {
      return NextResponse.json(
        { success: false, stage: "fallback_read_political_situations", error: fallbackError.message },
        { status: 500 }
      );
    }

    source = "political_situations";
    fallbackUsed = true;
    situations = fallbackSituations || [];
    totalCount = fallbackCount ?? situations.length;
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    refreshed: refresh === "1" || refresh === "true",
    refresh_result: refreshResult,
    count: totalCount,
    returned_count: situations.length,
    source,
    fallback_used: fallbackUsed,
    agenda_overview: agendaOverview,
    agenda_overview_error: agendaError?.message ?? null,
    trends_error: trendError?.message ?? null,
    situations,
  });
}
