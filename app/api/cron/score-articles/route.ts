import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const batch = Math.max(1, Math.min(500, Number(url.searchParams.get("batch")) || 200));
  const maxLoops = Math.max(1, Math.min(20, Number(url.searchParams.get("loops")) || 10));

  const startedAt = new Date().toISOString();
  let totalScored = 0;
  let loops = 0;

  try {
    // Drain fresh unscored articles in safe batches so a single call never times out.
    while (loops < maxLoops) {
      const { data, error } = await supabase.rpc("score_fresh_unscored_articles", { p_limit: batch });
      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: "score_refresh_failed",
            details: error.message,
            scored_so_far: totalScored,
            loops,
            started_at: startedAt,
          },
          { status: 500 }
        );
      }
      const scored = typeof data === "number" ? data : Number(data) || 0;
      totalScored += scored;
      loops += 1;
      if (scored < batch) break; // queue drained
    }

    return NextResponse.json({
      success: true,
      mode: "score_fresh_unscored_articles_batched",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      articles_scored: totalScored,
      loops,
      batch_size: batch,
      drained: loops < maxLoops,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: String(e?.message || e), scored_so_far: totalScored, started_at: startedAt },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
