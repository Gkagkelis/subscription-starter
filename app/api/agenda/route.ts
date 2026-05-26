import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/agenda
 *
 * Returns recent Noraya agenda briefs from the intelligence layer.
 *
 * Optional query params:
 *   ?limit=10
 *   ?topic=Υγεία
 *   ?risk=high
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
  const topic = searchParams.get("topic");
  const risk = searchParams.get("risk");

  let query = supabase
    .from("v_advisor_agenda_briefs_recent")
    .select(`
      topic,
      article_count,
      source_count,
      political_articles,
      negative_articles,
      positive_articles,
      neutral_articles,
      avg_article_score,
      max_article_score,
      avg_outlet_influence,
      avg_political_relevance,
      avg_frame_intensity,
      avg_audience_relevance,
      agenda_score,
      documentation_level,
      political_risk_level,
      framing_summary,
      recommended_action,
      avoid_action,
      top_sources,
      top_evidence_articles,
      evidence_summary,
      first_seen_at,
      last_seen_at
    `)
    .order("agenda_score", { ascending: false })
    .limit(limit);

  if (topic) {
    query = query.eq("topic", topic);
  }

  if (risk) {
    query = query.eq("political_risk_level", risk);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        source: "v_advisor_agenda_briefs_recent",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    count: data?.length || 0,
    agenda: data || [],
  });
}
