import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// API-based actor (no browser) — πιο αξιόπιστος στα 429.
const ACTOR = "signalbench~google-trends-scraper";
const STATE_KEY = "trends_probe_state";

async function saveState(obj: Record<string, unknown>) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: STATE_KEY,
    input_hash: "global",
    model_used: "apify_trends_signalbench",
    result: obj,
  };
  const { data: upd } = await supabase
    .from("analysis_cache")
    .update(row)
    .is("situation_id", null)
    .eq("analysis_kind", STATE_KEY)
    .select("analysis_kind");
  if (!upd || upd.length === 0) {
    await supabase.from("analysis_cache").insert(row);
  }
}

async function loadState(): Promise<any> {
  const { data } = await supabase
    .from("analysis_cache")
    .select("result")
    .is("situation_id", null)
    .eq("analysis_kind", STATE_KEY)
    .limit(1);
  return Array.isArray(data) && data[0] ? (data[0] as any).result : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { ok: false, error: "APIFY_API_TOKEN_missing", hint: "Κάνε redeploy αφού υπάρχει το APIFY_API_TOKEN." },
      { status: 500 },
    );
  }
  const auth = { Authorization: `Bearer ${apifyToken}` };
  const mode = url.searchParams.get("mode") || "start";

  // ---------- START ----------
  if (mode === "start") {
    const q = (url.searchParams.get("q") || "Στέγαση").replace(/\s*\/\s*/g, " ").trim();
    const input = {
      searchTerms: [q],
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
      if (!r.ok) {
        return NextResponse.json({ ok: false, mode, http_status: r.status, snippet: text.slice(0, 400) });
      }
      const runId = j?.data?.id ?? null;
      const datasetId = j?.data?.defaultDatasetId ?? null;
      await saveState({ run_id: runId, dataset_id: datasetId, query: q, started_at: new Date().toISOString() });
      return NextResponse.json({
        ok: true,
        mode: "start",
        actor: ACTOR,
        run_id: runId,
        dataset_id: datasetId,
        query: q,
        next: "Περίμενε ~1-2 λεπτά και χτύπα το ίδιο link με ?mode=collect",
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  // ---------- COLLECT ----------
  if (mode === "collect") {
    const st = await loadState();
    if (!st?.run_id) {
      return NextResponse.json({ ok: false, mode, error: "no_run", hint: "Τρέξε πρώτα ?mode=start" });
    }
    try {
      const rr = await fetch(`https://api.apify.com/v2/actor-runs/${st.run_id}`, { headers: auth, cache: "no-store" });
      const jj: any = await rr.json();
      const status = jj?.data?.status ?? "UNKNOWN";
      if (status !== "SUCCEEDED" && status !== "FAILED") {
        return NextResponse.json({
          ok: true, mode: "collect", status, query: st.query,
          hint: "Ακόμα τρέχει — περίμενε λίγο ακόμα και ξαναχτύπα collect.",
        });
      }

      const datasetId = st.dataset_id || jj?.data?.defaultDatasetId;
      const dr = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`,
        { headers: auth, cache: "no-store" },
      );
      const items: any = await dr.json();
      const arr = Array.isArray(items) ? items : [];

      if (arr.length === 0) {
        // Διαγνωστικό (δωρεάν) αν άδειο/απέτυχε
        const runData = jj?.data || {};
        let logTail: string | null = null;
        try {
          const lr = await fetch(`https://api.apify.com/v2/actor-runs/${st.run_id}/log`, { headers: auth, cache: "no-store" });
          if (lr.ok) logTail = (await lr.text()).slice(-1500);
        } catch { logTail = "log_fetch_failed"; }
        return NextResponse.json({
          ok: true, mode: "collect", status, query: st.query, item_count: 0,
          diagnostic: { run_stats: runData?.stats ?? null, exit_code: runData?.exitCode ?? null, log_tail: logTail },
          note: "Άδειο — δες diagnostic.log_tail (πιθανόν 429 σε ώρα αιχμής).",
        });
      }

      const it = arr[0] || {};
      const iot: any[] = Array.isArray(it?.interestOverTime) ? it.interestOverTime : [];
      const latest = iot.length ? iot[iot.length - 1]?.value ?? null : null;
      const avg = it?.averageInterest ?? null;
      const rising = (Array.isArray(it?.relatedQueries?.rising) ? it.relatedQueries.rising : [])
        .slice(0, 6)
        .map((x: any) => ({ query: x?.label ?? x?.query, growth: x?.formattedValue ?? x?.value }));

      return NextResponse.json({
        ok: true,
        mode: "collect",
        status,
        query: st.query,
        item_count: arr.length,
        latest_interest: latest,
        avg_interest: avg,
        peak_date: it?.peakDate ?? null,
        interest_points: iot.length,
        rising_queries: rising,
        raw_sample: arr.slice(0, 1),
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  return NextResponse.json({ ok: false, error: "bad_mode", hint: "mode=start ή mode=collect" });
}
