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

function eventToSituationRow(ev: any) {
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

function buildAgendaOverview(agendaRows: any[] = [], eventRows: any[] = []) {
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

    return {
      id: row?.id ?? topic,
      topic,
      category: row?.category ?? null,
      agenda_score: score,
      signal_label: signalLabel(score),
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

  const safeEventRows = !eventError && Array.isArray(eventRows) ? eventRows : [];
  const agendaOverview = !agendaError && Array.isArray(agendaRows)
    ? buildAgendaOverview(agendaRows, safeEventRows)
    : [];

  if (!eventError && eventRows && eventRows.length > 0) {
    const situations = eventRows.map(eventToSituationRow);
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
    situations,
  });
}
