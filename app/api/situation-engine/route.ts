import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
        {
          success: false,
          stage: "refresh_situation_engine_all",
          error: error.message,
        },
        { status: 500 }
      );
    }

    refreshResult = data;
  }

  // 1) Preferred live view
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
      {
        success: false,
        stage: "read_v_situation_engine_live",
        error: liveError.message,
      },
      { status: 500 }
    );
  }

  let source = "v_situation_engine_live";
  let fallbackUsed = false;
  let situations = liveSituations || [];
  let totalCount = liveCount ?? situations.length;

  // 2) Safe fallback: if the view is empty, read directly from political_situations
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
        {
          success: false,
          stage: "fallback_read_political_situations",
          error: fallbackError.message,
        },
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

    // total rows available in the selected source
    count: totalCount,

    // rows actually returned in this response, capped by limit(25)
    returned_count: situations.length,

    source,
    fallback_used: fallbackUsed,
    situations,
  });
}
