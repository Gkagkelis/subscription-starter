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

async function createRun(step: string, settings: JsonObject) {
  const { data, error } = await supabase
    .from("radar_runs")
    .insert({
      status: "running",
      trigger_source: `radar-step:${step}`,
      settings,
      summary: {
        step,
        started_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Could not create radar step run");
  }

  return data.id as string;
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

async function getStatus() {
  const [
    totalArticles,
    classifiedArticles,
    unclassifiedArticles,
    publicRelevantArticles,
    noiseArticles,
    situations,
    latestRuns,
  ] = await Promise.all([
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .not("classified_at", "is", null),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .is("classified_at", null),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("public_relevance", true),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("is_noise", true),
    supabase
      .from("political_situations")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("radar_runs")
      .select("id, status, trigger_source, started_at, heartbeat_at, finished_at, error, summary")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  const errors = [
    totalArticles.error,
    classifiedArticles.error,
    unclassifiedArticles.error,
    publicRelevantArticles.error,
    noiseArticles.error,
    situations.error,
    latestRuns.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors.map((e: any) => e.message).join("; "));
  }

  return {
    articles: {
      total: totalArticles.count ?? 0,
      classified: classifiedArticles.count ?? 0,
      unclassified: unclassifiedArticles.count ?? 0,
      public_relevant: publicRelevantArticles.count ?? 0,
      noise: noiseArticles.count ?? 0,
    },
    situations: {
      total: situations.count ?? 0,
    },
    latest_runs: latestRuns.data ?? [],
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const token = searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const step = searchParams.get("step") || "status";
  const origin = url.origin;
  const encodedToken = encodeURIComponent(token || "");

  try {
    if (step === "status") {
      const status = await getStatus();

      return NextResponse.json({
        success: true,
        radar_step_version: "noraya_radar_step_v2_compact",
        step,
        status,
      });
    }

    if (step === "reset-stale") {
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("radar_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: "Auto reset stale running radar step",
        })
        .eq("status", "running")
        .lt("heartbeat_at", staleBefore)
        .select("id, status, trigger_source, started_at, heartbeat_at, finished_at");

      if (error) {
        return NextResponse.json(
          {
            success: false,
            step,
            error: error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        radar_step_version: "noraya_radar_step_v2_compact",
        step,
        reset_count: data?.length ?? 0,
        reset_runs: data ?? [],
      });
    }

    if (!["ingest", "classify", "refresh"].includes(step)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown step "${step}". Use status, ingest, classify, refresh, or reset-stale.`,
        },
        { status: 400 }
      );
    }

    // Each classify step is intentionally small and reliable.
    // Product throughput comes from many step calls per radar cycle.
    const limit = safeInt(searchParams.get("limit"), 10, 1, 10);

    const settings = {
      step,
      limit,
      source: searchParams.get("source") || "manual",
    };

    const runId = await createRun(step, settings);

    try {
      if (step === "ingest") {
        const ingestUrl = `${origin}/api/ingest?token=${encodedToken}`;
        const ingest = await fetchJson(ingestUrl);

        if (!ingest.ok || ingest.json?.success !== true) {
          const error = ingest.json?.error || ingest.text || "Ingest failed";
          const summary = {
            step,
            status: ingest.status,
            ingest: ingest.json,
          };

          await finishRun(runId, "failed", summary, error);

          return NextResponse.json(
            {
              success: false,
              run_id: runId,
              step,
              error,
              ingest: ingest.json,
            },
            { status: 500 }
          );
        }

        const summary = {
          step,
          ingest: {
            total_fetched: ingest.json.summary?.totalFetched ?? null,
            total_inserted: ingest.json.summary?.totalInserted ?? null,
            sources: ingest.json.summary?.sources ?? null,
          },
        };

        await finishRun(runId, "completed", summary);

        return NextResponse.json({
          success: true,
          radar_step_version: "noraya_radar_step_v2_compact",
          run_id: runId,
          ...summary,
        });
      }

      if (step === "classify") {
        const classifyUrl = `${origin}/api/classify?token=${encodedToken}&limit=${limit}`;
        const classify = await fetchJson(classifyUrl);

        if (!classify.ok || classify.json?.success !== true) {
          const error = classify.json?.error || classify.text || "Classify failed";
          const summary = {
            step,
            status: classify.status,
            classify: classify.json,
          };

          await finishRun(runId, "failed", summary, error);

          return NextResponse.json(
            {
              success: false,
              run_id: runId,
              step,
              error,
              classify: classify.json,
            },
            { status: 500 }
          );
        }

        const summary = {
          step,
          classify: {
            total: classify.json.total ?? 0,
            classified: classify.json.classified ?? 0,
            public_relevant: classify.json.public_relevant ?? 0,
            noise: classify.json.noise ?? 0,
            classifier_version: classify.json.classifier_version ?? null,
          },
        };

        await finishRun(runId, "completed", summary);

        return NextResponse.json({
          success: true,
          radar_step_version: "noraya_radar_step_v2_compact",
          run_id: runId,
          ...summary,
        });
      }

      if (step === "refresh") {
        const { data, error } = await supabase.rpc("refresh_situation_engine_all");

        if (error) {
          const summary = {
            step,
            stage: "refresh_situation_engine_all",
          };

          await finishRun(runId, "failed", summary, error.message);

          return NextResponse.json(
            {
              success: false,
              run_id: runId,
              step,
              error: error.message,
            },
            { status: 500 }
          );
        }

        const situations = await supabase
          .from("political_situations")
          .select("id", { count: "exact", head: true });

        const summary = {
          step,
          refresh_result: data,
          situations_count: situations.count ?? null,
        };

        await finishRun(runId, "completed", summary);

        return NextResponse.json({
          success: true,
          radar_step_version: "noraya_radar_step_v2_compact",
          run_id: runId,
          ...summary,
        });
      }

      return NextResponse.json(
        {
          success: false,
          run_id: runId,
          step,
          error: "Unhandled step",
        },
        { status: 500 }
      );
    } catch (err: any) {
      const error = err?.message || "Radar step exception";

      await finishRun(
        runId,
        "failed",
        {
          step,
          error,
        },
        error
      );

      return NextResponse.json(
        {
          success: false,
          run_id: runId,
          step,
          error,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        step,
        error: err?.message || "Radar step failed",
      },
      { status: 500 }
    );
  }
}
