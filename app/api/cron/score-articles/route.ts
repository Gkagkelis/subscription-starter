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

  const startedAt = new Date().toISOString();
  try {
    const { data, error } = await supabase.rpc("refresh_article_scores_baseline");
    if (error) {
      return NextResponse.json(
        { success: false, error: "score_refresh_failed", details: error.message, started_at: startedAt },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      mode: "score_articles_baseline_refresh",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      articles_scored: typeof data === "number" ? data : data ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: String(e?.message || e), started_at: startedAt },
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
