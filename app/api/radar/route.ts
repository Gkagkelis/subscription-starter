import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type JsonObject = Record<string, any>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function finishRun(
  runId: string,
  status: "completed" | "failed",
  summary: JsonObject,
  error?: string
) {
  await supabase
    .from("radar_runs")
    .update({
      status,
      heartbeat_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      summary,
      error: error || null,
    })
    .eq("id", runId);
}

async function heartbeat(runId: string, summary: JsonObject = {}) {
  await supabase
    .from("radar_runs")
    .update({
      heartbeat_at: new Date().toISOString(),
      summary,
    })
    .eq("id", runId);
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

  // Stable defaults:
  // - batchSize 20 is proven stable.
  // - maxBatches 1 avoids browser/serverless timeout.
  // For controlled catch-up you can call maxBatches=2 or 3 manually.
  const batchSize = safeInt(searchParams.get("batchSize"), 20, 1, 25);
  const maxBatches = safeInt(searchParams.get("maxBatches"), 1, 1, 3);

  const shouldIngest = searchParams.get("ingest") !== "0";
  const shouldRefreshSituations = searchParams.get("refresh") !== "0";
  const triggerSource = searchParams.get("source") || "manual";

  const settings = {
    batch_size: batchSize,
    max_batches: maxBatches,
    ingest: shouldIngest,
    refresh_situations: shouldRefreshSituations,
    trigger_source: triggerSource,
  };

  // Prevent accidental double-clicks / overlapping cron runs.
  // Running jobs older than 10 minutes are treated as stale.
  const { data: runningRuns, error: runningError } = await supabase
    .from("radar_runs")
    .select("id, started_at, heartbeat_at, status")
    .eq("status", "running")
    .gte("heartbeat_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1);

  if (runningError) {
    return NextResponse.json(
      {
        success: false,
        stage: "check_running_radar",
        error: runningError.message,
      },
      { status: 500 }
    );
  }

  if (runningRuns && runningRuns.length > 0) {
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        stage: "radar_already_running",
        message: "A recent radar run is already running. Wait a few minutes and try again.",
        running_run: runningRuns[0],
      },
      { status: 409 }
    );
  }

  const { data: runRow, error: insertRunError } = await supabase
    .from("radar_runs")
    .insert({
      status: "running",
      trigger_source: triggerSource,
      settings,
      summary: {
        started_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (insertRunError || !runRow?.id) {
    return NextResponse.json(
      {
        success: false,
        stage: "create_radar_run",
        error: insertRunError?.message || "Could not create radar run",
      },
      { status: 500 }
    );
  }

  const runId = runRow.id;
  const startedAt = new Date().toISOString();

  let ingestResult: JsonObject | null = null;
  const classifyRuns: JsonObject[] = [];

  let totalClassified = 0;
  let totalPublicRelevant = 0;
  let totalNoise = 0;

  try {
    if (shouldIngest) {
      await heartbeat(runId, {
        stage: "ingest_started",
        settings,
      });

      const ingestUrl = `${origin}/api/ingest?token=${encodedToken}`;
      const ingest = await fetchJson(ingestUrl);

      if (!ingest.ok || !ingest.json?.success) {
        const error = ingest.json?.error || ingest.text || "Ingest failed";
        const summary = {
          stage: "ingest_failed",
          status: ingest.status,
          ingest: ingest.json,
          settings,
        };

        await finishRun(runId, "failed", summary, error);

        return NextResponse.json(
          {
            success: false,
            run_id: runId,
            stage: "ingest",
            status: ingest.status,
            error,
            ingest: ingest.json,
          },
          { status: 500 }
        );
      }

      ingestResult = ingest.json;

      await heartbeat(runId, {
        stage: "ingest_completed",
        settings,
        ingest: {
          total_fetched: ingestResult.summary?.totalFetched ?? null,
          total_inserted: ingestResult.summary?.totalInserted ?? null,
          sources: ingestResult.summary?.sources ?? null,
        },
      });
    }

    for (let i = 0; i < maxBatches; i++) {
      await heartbeat(runId, {
        stage: "classify_started",
        current_batch: i + 1,
        settings,
        totals: {
          classified: totalClassified,
          public_relevant: totalPublicRelevant,
          noise: totalNoise,
        },
      });

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
        const error = classify.json?.error || classify.text || "Classify failed";
        const summary = {
          stage: "classify_failed",
          failed_batch: i + 1,
          settings,
          ingest: ingestResult
            ? {
                total_fetched: ingestResult.summary?.totalFetched ?? null,
                total_inserted: ingestResult.summary?.totalInserted ?? null,
                sources: ingestResult.summary?.sources ?? null,
              }
            : null,
          classify_runs: classifyRuns,
          totals: {
            classified: totalClassified,
            public_relevant: totalPublicRelevant,
            noise: totalNoise,
          },
        };

        await finishRun(runId, "failed", summary, error);

        return NextResponse.json(
          {
            success: false,
            run_id: runId,
            stage: "classify",
            failed_batch: i + 1,
            error,
            ingest: ingestResult,
            classify_runs: classifyRuns,
          },
          { status: 500 }
        );
      }

      totalClassified += Number(run.classified || 0);
      totalPublicRelevant += Number(run.public_relevant || 0);
      totalNoise += Number(run.noise || 0);

      await heartbeat(runId, {
        stage: "classify_batch_completed",
        completed_batch: i + 1,
        settings,
        classify_runs: classifyRuns,
        totals: {
          classified: totalClassified,
          public_relevant: totalPublicRelevant,
          noise: totalNoise,
        },
      });

      // No more pending articles.
      if (Number(run.classified || 0) === 0 || Number(run.total || 0) === 0) {
        break;
      }
    }

    let situationEngineResult: JsonObject | null = null;

    if (shouldRefreshSituations) {
      await heartbeat(runId, {
        stage: "situation_refresh_started",
        settings,
        classify_runs: classifyRuns,
        totals: {
          classified: totalClassified,
          public_relevant: totalPublicRelevant,
          noise: totalNoise,
        },
      });

      const situationUrl = `${origin}/api/situation-engine?token=${encodedToken}&refresh=1`;
      const situation = await fetchJson(situationUrl);

      if (!situation.ok || situation.json?.success !== true) {
        const error =
          situation.json?.error || situation.text || "Situation engine refresh failed";

        const summary = {
          stage: "situation_engine_failed",
          settings,
          status: situation.status,
          ingest: ingestResult
            ? {
                total_fetched: ingestResult.summary?.totalFetched ?? null,
                total_inserted: ingestResult.summary?.totalInserted ?? null,
                sources: ingestResult.summary?.sources ?? null,
              }
            : null,
          classify_runs: classifyRuns,
          totals: {
            classified: totalClassified,
            public_relevant: totalPublicRelevant,
            noise: totalNoise,
          },
          situation_engine: situation.json,
        };

        await finishRun(runId, "failed", summary, error);

        return NextResponse.json(
          {
            success: false,
            run_id: runId,
            stage: "situation-engine",
            status: situation.status,
            error,
            situation_engine: situation.json,
          },
          { status: 500 }
        );
      }

      situationEngineResult = situation.json;
    }

    const finalSummary = {
      radar_version: "noraya_radar_v2_safe",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      settings,
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
    };

    await finishRun(runId, "completed", finalSummary);

    return NextResponse.json({
      success: true,
      run_id: runId,
      ...finalSummary,
    });
  } catch (err: any) {
    const error = err?.message || "Unknown radar exception";
    const summary = {
      radar_version: "noraya_radar_v2_safe",
      stage: "radar_exception",
      started_at: startedAt,
      failed_at: new Date().toISOString(),
      settings,
      ingest: ingestResult
        ? {
            total_fetched: ingestResult.summary?.totalFetched ?? null,
            total_inserted: ingestResult.summary?.totalInserted ?? null,
            sources: ingestResult.summary?.sources ?? null,
          }
        : null,
      classify_runs: classifyRuns,
      totals: {
        classified: totalClassified,
        public_relevant: totalPublicRelevant,
        noise: totalNoise,
      },
      error,
    };

    await finishRun(runId, "failed", summary, error);

    return NextResponse.json(
      {
        success: false,
        run_id: runId,
        stage: "radar_exception",
        error,
      },
      { status: 500 }
    );
  }
}
