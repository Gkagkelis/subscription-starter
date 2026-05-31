import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type JsonObject = Record<string, any>;

function safeInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = url.searchParams;
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encodedToken = encodeURIComponent(token || "");
  const origin = url.origin;

  // Safe production defaults.
  // Each classify call handles up to 20 articles.
  // Radar loops multiple safe batches instead of one fragile huge AI response.
  const batchSize = safeInt(searchParams.get("batchSize"), 20, 1, 25);
  const maxBatches = safeInt(searchParams.get("maxBatches"), 5, 1, 10);

  const shouldIngest = searchParams.get("ingest") !== "0";
  const shouldRefreshSituations = searchParams.get("refresh") !== "0";

  const startedAt = new Date().toISOString();

  let ingestResult: JsonObject | null = null;
  const classifyRuns: JsonObject[] = [];

  let totalClassified = 0;
  let totalPublicRelevant = 0;
  let totalNoise = 0;

  if (shouldIngest) {
    const ingestUrl = `${origin}/api/ingest?token=${encodedToken}`;
    const ingest = await fetchJson(ingestUrl);

    if (!ingest.ok || !ingest.json?.success) {
      return NextResponse.json(
        {
          success: false,
          stage: "ingest",
          status: ingest.status,
          error: ingest.json?.error || ingest.text || "Ingest failed",
          ingest: ingest.json,
        },
        { status: 500 }
      );
    }

    ingestResult = ingest.json;
  }

  for (let i = 0; i < maxBatches; i++) {
    const classifyUrl = `${origin}/api/classify?token=${encodedToken}&limit=${batchSize}`;
    const classify = await fetchJson(classifyUrl);

    const run = {
      batch: i + 1,
      status: classify.status,
      success: classify.json?.success === true,
      total: classify.json?.total ?? 0,
      classified: classify.json?.classified ?? 0,
      public_relevant: classify.json?.public_relevant ?? 0,
      noise: classify.json?.noise ?? 0,
      stage: classify.json?.stage ?? null,
      error: classify.json?.error ?? null,
      message: classify.json?.message ?? null,
    };

    classifyRuns.push(run);

    if (!classify.ok || classify.json?.success !== true) {
      return NextResponse.json(
        {
          success: false,
          stage: "classify",
          failed_batch: i + 1,
          error: classify.json?.error || classify.text || "Classify failed",
          ingest: ingestResult,
          classify_runs: classifyRuns,
        },
        { status: 500 }
      );
    }

    totalClassified += Number(run.classified || 0);
    totalPublicRelevant += Number(run.public_relevant || 0);
    totalNoise += Number(run.noise || 0);

    // No more pending articles.
    if (Number(run.classified || 0) === 0 || Number(run.total || 0) === 0) {
      break;
    }
  }

  let situationEngineResult: JsonObject | null = null;

  if (shouldRefreshSituations) {
    const situationUrl = `${origin}/api/situation-engine?token=${encodedToken}&refresh=1`;
    const situation = await fetchJson(situationUrl);

    if (!situation.ok || situation.json?.success !== true) {
      return NextResponse.json(
        {
          success: false,
          stage: "situation-engine",
          status: situation.status,
          error: situation.json?.error || situation.text || "Situation engine refresh failed",
          ingest: ingestResult,
          classify_runs: classifyRuns,
          totals: {
            classified: totalClassified,
            public_relevant: totalPublicRelevant,
            noise: totalNoise,
          },
          situation_engine: situation.json,
        },
        { status: 500 }
      );
    }

    situationEngineResult = situation.json;
  }

  return NextResponse.json({
    success: true,
    radar_version: "noraya_radar_v1",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    settings: {
      batch_size: batchSize,
      max_batches: maxBatches,
      ingest: shouldIngest,
      refresh_situations: shouldRefreshSituations,
    },
    ingest: ingestResult
      ? {
          total_fetched: ingestResult.summary?.totalFetched ?? null,
          total_inserted: ingestResult.summary?.totalInserted ?? null,
          sources: ingestResult.summary?.sources ?? null,
        }
      : null,
    classify: {
      runs: classifyRuns,
      totals: {
        classified: totalClassified,
        public_relevant: totalPublicRelevant,
        noise: totalNoise,
      },
    },
    situation_engine: situationEngineResult
      ? {
          refreshed: situationEngineResult.refreshed ?? null,
          refresh_result: situationEngineResult.refresh_result ?? null,
          count: situationEngineResult.count ?? null,
        }
      : null,
  });
}
