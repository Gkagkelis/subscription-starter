import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ACTOR = "steadyfetch~google-trends-scraper";
const STATE_KEY = "trends_probe_state";

async function saveState(obj: Record<string, unknown>) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: STATE_KEY,
    input_hash: "global",
    model_used: "apify_trends",
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

  // ---------- START: ξεκινάει το run, επιστρέφει αμέσως ----------
  if (mode === "start") {
    const q = (url.searchParams.get("q") || "Στέγαση").replace(/\s*\/\s*/g, " ").trim();
    const input = {
      searchTerms: [q],
      geo: "GR",
      timeRange: url.searchParams.get("range") || "today 1-m",
      compare: false,
      includeTrendingNow: false,
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
        run_id: runId,
        dataset_id: datasetId,
        query: q,
        next: "Περίμενε ~2 λεπτά και χτύπα το ίδιο link με ?mode=collect",
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  // ---------- COLLECT: διαβάζει το αποτέλεσμα όταν είναι έτοιμο ----------
  if (mode === "collect") {
    const st = await loadState();
    if (!st?.run_id) {
      return NextResponse.json({ ok: false, mode, error: "no_run", hint: "Τρέξε πρώτα ?mode=start" });
    }
    try {
      const rr = await fetch(`https://api.apify.com/v2/actor-runs/${st.run_id}`, { headers: auth, cache: "no-store" });
      const jj: any = await rr.json();
      const status = jj?.data?.status ?? "UNKNOWN";
      if (status !== "SUCCEEDED") {
        return NextResponse.json({
          ok: true,
          mode: "collect",
          status,
          query: st.query,
          hint:
            status === "RUNNING" || status === "READY"
              ? "Ακόμα τρέχει — περίμενε λίγο ακόμα και ξαναχτύπα collect."
              : "Το run δεν πέτυχε. Ξανατρέξε start.",
        });
      }
      const datasetId = st.dataset_id || jj?.data?.defaultDatasetId;
      const dr = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`,
        { headers: auth, cache: "no-store" },
      );
      const items: any = await dr.json();
      const arr = Array.isArray(items) ? items : [];
      const iot = arr.find((x: any) => x?.surface === "interestOverTime");
      const rel = arr.find((x: any) => x?.surface === "relatedQueries");
      const points: any[] = Array.isArray(iot?.data?.points) ? iot.data.points : [];
      const latest = points.length ? points[points.length - 1]?.value ?? null : null;
      const avg = points.length
        ? Math.round(points.reduce((s, p) => s + (Number(p?.value) || 0), 0) / points.length)
        : null;
      const rising = (Array.isArray(rel?.data?.rising) ? rel.data.rising : [])
        .slice(0, 6)
        .map((x: any) => ({ query: x?.query, growth: x?.formattedValue ?? x?.value }));

      return NextResponse.json({
        ok: true,
        mode: "collect",
        status,
        query: st.query,
        item_count: arr.length,
        surfaces: arr.map((x: any) => x?.surface),
        interest_points: points.length,
        latest_interest: latest,
        avg_interest: avg,
        rising_queries: rising,
        raw_sample: arr.slice(0, 2),
      });
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json({ ok: false, mode, error: String(e?.message || err) });
    }
  }

  return NextResponse.json({ ok: false, error: "bad_mode", hint: "mode=start ή mode=collect" });
}
