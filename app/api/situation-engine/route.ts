import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { data: situations, error: situationsError } = await supabase
    .from("v_situation_engine_live")
    .select("*")
    .limit(25);

  if (situationsError) {
    return NextResponse.json(
      {
        success: false,
        stage: "read_v_situation_engine_live",
        error: situationsError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    refreshed: refresh === "1" || refresh === "true",
    refresh_result: refreshResult,
    count: situations?.length || 0,
    situations: situations || [],
  });
}
