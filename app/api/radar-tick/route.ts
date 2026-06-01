import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type JsonObject = Record<string, any>;

async function fetchJson(url: string): Promise<{
  ok: boolean;
  status: number;
  json: JsonObject | null;
  text: string;
}> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const text = await res.text();

  let json: JsonObject | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    json,
    text,
  };
}

function getScheduledStep(now: Date) {
  // Cron will run every 15 minutes.
  // We treat every 6-hour window as one radar cycle:
  // slot 0  = ingest
  // slot 1-22 = classify 10 articles per tick
  // slot 23 = refresh situations
  const hourInSixHourCycle = now.getUTCHours() % 6;
  const quarterHour = Math.floor(now.getUTCMinutes() / 15);
  const slot = hourInSixHourCycle * 4 + quarterHour;

  let step: "ingest" | "classify" | "refresh";
  if (slot === 0) {
    step = "ingest";
  } else if (slot === 23) {
    step = "refresh";
  } else {
    step = "classify";
  }

  const cycleStartHour = now.getUTCHours() - hourInSixHourCycle;
  const cycleStart = new Date(now);
  cycleStart.setUTCHours(cycleStartHour, 0, 0, 0);

  return {
    step,
    slot,
    cycle_start_utc: cycleStart.toISOString(),
    utc_hour: now.getUTCHours(),
    utc_minute: now.getUTCMinutes(),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const userAgent = req.headers.get("user-agent") || "";

  const isManualDev = token === "dev";
  const hasCronSecret = Boolean(process.env.CRON_SECRET);
  const isTokenAuthorized = hasCronSecret && token === process.env.CRON_SECRET;
  const isVercelCron = userAgent.includes("vercel-cron/1.0");

  if (!isManualDev && !isTokenAuthorized && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceStep = url.searchParams.get("forceStep");
  const now = new Date();
  const schedule = getScheduledStep(now);

  const selectedStep =
    forceStep === "ingest" ||
    forceStep === "classify" ||
    forceStep === "refresh" ||
    forceStep === "status"
      ? forceStep
      : schedule.step;

  // Internal call to the already-tested step endpoint.
  // Cron itself does not need a query token; this route calls radar-step with CRON_SECRET.
  const internalToken = encodeURIComponent(process.env.CRON_SECRET || "dev");
  const origin = url.origin;

  let stepUrl = `${origin}/api/radar-step?token=${internalToken}&step=${selectedStep}`;

  if (selectedStep === "classify") {
    stepUrl += "&limit=10";
  }

  const result = await fetchJson(stepUrl);

  if (!result.ok || result.json?.success !== true) {
    return NextResponse.json(
      {
        success: false,
        radar_tick_version: "noraya_radar_tick_v1",
        selected_step: selectedStep,
        schedule,
        status: result.status,
        error: result.json?.error || result.text || "Radar tick failed",
        result: result.json,
      },
      { status: result.status >= 400 ? result.status : 500 }
    );
  }

  return NextResponse.json({
    success: true,
    radar_tick_version: "noraya_radar_tick_v1",
    selected_step: selectedStep,
    schedule,
    result: result.json,
  });
}
