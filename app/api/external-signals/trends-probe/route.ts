import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// PROBE (Στρώση Γ): δοκιμή του Apify Google Trends actor (steadyfetch) για ΕΝΑ θέμα.
// Δεν γράφει τίποτα. Σκοπός: να δούμε ότι δουλεύει + το πραγματικό format για Ελλάδα.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { ok: false, error: "APIFY_API_TOKEN_missing", hint: "Το APIFY_API_TOKEN δεν φάνηκε — κάνε redeploy μετά το deploy." },
      { status: 500 },
    );
  }

  const q = (url.searchParams.get("q") || "Στέγαση").replace(/\s*\/\s*/g, " ").trim();
  const timeRange = url.searchParams.get("range") || "today 1-m";

  const input = {
    searchTerms: [q],
    geo: "GR",
    timeRange,
    compare: false,
    includeTrendingNow: false,
  };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000); // sync guard

  try {
    const r = await fetch(
      "https://api.apify.com/v2/acts/steadyfetch~google-trends-scraper/run-sync-get-dataset-items",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apifyToken}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timer);

    const status = r.status;
    const text = await r.text();
    let items: unknown = null;
    try {
      items = JSON.parse(text);
    } catch {
      items = null;
    }

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        query: q,
        http_status: status,
        snippet: text.slice(0, 400),
        fetch_ms: Date.now() - started,
      });
    }

    const arr = Array.isArray(items) ? (items as any[]) : [];
    const iot = arr.find((x) => x?.surface === "interestOverTime");
    const rel = arr.find((x) => x?.surface === "relatedQueries");
    const points: any[] = Array.isArray(iot?.data?.points) ? iot.data.points : [];
    const latest = points.length ? points[points.length - 1]?.value ?? null : null;
    const avg =
      points.length
        ? Math.round(points.reduce((s, p) => s + (Number(p?.value) || 0), 0) / points.length)
        : null;
    const rising = (Array.isArray(rel?.data?.rising) ? rel.data.rising : [])
      .slice(0, 6)
      .map((x: any) => ({ query: x?.query, growth: x?.formattedValue ?? x?.value }));

    return NextResponse.json({
      ok: true,
      query: q,
      time_range: timeRange,
      item_count: arr.length,
      surfaces: arr.map((x) => x?.surface),
      interest_points: points.length,
      latest_interest: latest,
      avg_interest: avg,
      rising_queries: rising,
      fetch_ms: Date.now() - started,
      raw_sample: arr.slice(0, 2),
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as { name?: string; message?: string };
    return NextResponse.json({
      ok: false,
      query: q,
      error: e?.name === "AbortError" ? "timeout_55s" : String(e?.message || err),
      fetch_ms: Date.now() - started,
    });
  }
}
