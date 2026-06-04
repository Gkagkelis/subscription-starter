import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Μετατρέπει μια γραμμή ΓΕΓΟΝΟΤΟΣ (v_political_events_live) στο σχήμα που
// περιμένει η οθόνη για "situation", ώστε η λίστα LIVE SITUATIONS να δείχνει
// πραγματικά γεγονότα (π.χ. "Τραυματισμός στη Χειμάρρα") αντί για σκέτες
// θεματικές ("Άμυνα/Εθνικά").
function eventToSituationRow(ev: any) {
  return {
    id: ev.id,
    title: ev.title,                 // ο πραγματικός τίτλος του γεγονότος
    topic: ev.topic,                 // η θεματική στην οποία ανήκει
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

    // Η πλήρης ανάλυση συμβούλου (v1) αυτού του γεγονότος — το cockpit τη χρησιμοποιεί.
    advisor_brief: ev.advisor_brief ?? null,
  };
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

  // 0) ΝΕΟ: Προτίμησε τα ΓΕΓΟΝΟΤΑ (event layer).
  const {
    data: eventRows,
    error: eventError,
    count: eventCount,
  } = await supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .order("event_score", { ascending: false })
    .limit(25);

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
      situations,
    });
  }

  // 1) Fallback A: παλιό live view (topic-situations)
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

  // 2) Fallback B: απευθείας από political_situations
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
    situations,
  });
}
