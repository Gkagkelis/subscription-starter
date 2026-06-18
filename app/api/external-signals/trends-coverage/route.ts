import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ACTOR = "signalbench~google-trends-scraper";
const STATE_KEY = "trends_run_state";
const RESULT_KEY = "trends_v1";

function cleanQuery(topic: string): string {
  return String(topic || "").replace(/\s*\/\s*/g, " ").trim();
}

async function saveCache(kind: string, obj: Record<string, unknown>) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: kind,
    input_hash: "global",
    model_used: "apify_trends_signalbench",
    result: obj,
  };
  const { data: upd } = await supabase
    .from("analysis_cache")
    .update(row)
    .is("situation_id", null)
    .eq("analysis_kind", kind)
    .select("analysis_kind");
  if (!upd || upd.length === 0) {
    await supabase.from("analysis_cache").insert(row);
  }
}

async function loadCache(kind: string): Promise<any> {
  const { data } = await supabase
    .from("analysis_cache")
    .select("result")
    .is("situation_id", null)
    .eq("analysis_kind", kind)
    .limit(1);
  return Array.isArray(data) && data[0] ? (data[0] as any).result : null;
}

async function activeTopics(maxTopics: number): Promise<string[]> {
  const { data: events } = await supabase
    .from("v_political_events_live")
    .select("topic")
    .limit(500);
  return Array.from(
    new Set(
      (Array.isArray(events) ? events : [])
        .map((e: any) => String(e?.topic || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maxTopics);
}

// Ορμή 0-100: μέσος όρος τελευταίων ~7 μη-partial ημερών (το "τώρα" vs δική του κορυφή).
function momentumFromInterest(interestOverTime: any[], hasRising: boolean) {
  const pts = (Array.isArray(interestOverTime) ? interestOverTime : []).filter(
    (p) => !p?.isPartial && Number.isFinite(Number(p?.value)),
  );
  if (!pts.length) return { score: null as number | null, recent: 0, month_avg: 0 };
  const vals = pts.map((p) => Number(p.value));
  const monthAvg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const recentVals = vals.slice(-7);
  const recent = Math.round(recentVals.reduce((s, v) => s + v, 0) / recentVals.length);
  const score = Math.min(100, Math.max(0, recent + (hasRising ? 10 : 0)));
  return { score, recent, month_avg: monthAvg };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json({ ok: false, error: "APIFY_API_TOKEN_missing" }, { status: 500 });
  }
  const auth = { Authorization: `Bearer ${apifyToken}` };
  const mode = url.searchParams.get("mode") || "start";
  const maxTopics = Math.min(50, Math.max(1, Number(url.searchParams.get("max_topics") || "40")));

  // ---------- START ----------
  if (mode === "start") {
    const topics = await activeTopics(maxTopics);
    if (!topics.length) return NextResponse.json({ ok: true, mode, note: "no active topics" });
    const searchTerms = topics.map(cleanQuery);
    const input = {
      searchTerms,
      geo: "GR",
      timeRange: url.searchParams.get("range") || "today 1-m",
      includeInterestOverTime: true,
      includeRelatedQueries: true,
    };
    try {
      const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!r.ok) return NextResponse.json({ ok: false, mode, http_status: r.status, snippet: text.slice(0, 400) });
      await saveCache(STATE_KEY, {
        run_id: j?.data?.id ?? null,
        dataset_id: j?.data?.defaultDatasetId ?? null,
        topic_count: topics.length,
        started_at: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true, mode: "start", run_id: j?.data?.id ?? null, topics: topics.length,
        next: "Περίμενε ~2-4 λεπτά και χτύπα ?mode=collect",
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  // ---------- COLLECT ----------
  if (mode === "collect") {
    const st = await loadCache(STATE_KEY);
    if (!st?.run_id) return NextResponse.json({ ok: false, mode, error: "no_run", hint: "Τρέξε πρώτα ?mode=start" });
    try {
      const rr = await fetch(`https://api.apify.com/v2/actor-runs/${st.run_id}`, { headers: auth, cache: "no-store" });
      const jj: any = await rr.json();
      const status = jj?.data?.status ?? "UNKNOWN";
      if (status !== "SUCCEEDED" && status !== "FAILED") {
        return NextResponse.json({ ok: true, mode: "collect", status, hint: "Ακόμα τρέχει — περίμενε και ξαναχτύπα." });
      }
      const datasetId = st.dataset_id || jj?.data?.defaultDatasetId;
      const dr = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`, { headers: auth, cache: "no-store" });
      const items: any = await dr.json();
      const arr = Array.isArray(items) ? items : [];

      const topics = await activeTopics(maxTopics);
      const queryToTopic = new Map<string, string>();
      for (const t of topics) queryToTopic.set(cleanQuery(t), t);

      const topicsMap: Record<string, unknown> = {};
      const summary: any[] = [];
      for (const it of arr) {
        const sterm = String(it?.searchTerm || "").trim();
        const topic = queryToTopic.get(sterm) || sterm;
        const hasRising = Array.isArray(it?.relatedQueries?.rising) && it.relatedQueries.rising.length > 0;
        const m = momentumFromInterest(it?.interestOverTime, hasRising);
        if (m.score === null) continue;
        topicsMap[topic] = {
          trends_score: m.score,
          recent: m.recent,
          month_avg: m.month_avg,
          avg_interest: it?.averageInterest ?? null,
          rising_count: hasRising ? it.relatedQueries.rising.length : 0,
        };
        summary.push({ topic, trends_score: m.score, recent: m.recent, month_avg: m.month_avg });
      }

      await saveCache(RESULT_KEY, {
        generated_at: new Date().toISOString(),
        source: "signalbench_google_trends",
        run_id: st.run_id,
        topics: topicsMap,
      });

      summary.sort((a, b) => b.trends_score - a.trends_score);
      return NextResponse.json({
        ok: true, mode: "collect", status,
        items_returned: arr.length,
        stored_topics: Object.keys(topicsMap).length,
        results: summary,
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  return NextResponse.json({ ok: false, error: "bad_mode", hint: "mode=start ή mode=collect" });
}
