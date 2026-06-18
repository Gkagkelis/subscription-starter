import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeEntities(m[1]) : "";
}

// Σύνθετα labels -> καθαρό query: "Ακρίβεια / κόστος ζωής" -> "Ακρίβεια κόστος ζωής"
function cleanQuery(topic: string): string {
  return String(topic || "").replace(/\s*\/\s*/g, " ").trim();
}

const FETCH_TIMEOUT_MS = 6000; // fail-fast ανά θέμα
const DELAY_MS = 200; // ευγένεια προς Google
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TopicCoverage = {
  topic: string;
  status: string;
  articles_48h: number;
  sources_48h: number;
  articles_7d: number;
  coverage_level: number; // 0-100 ("τώρα")
  momentum: number; // 0-100 (50=σταθερό, >50 ανεβαίνει)
};

async function fetchTopicCoverage(topic: string): Promise<TopicCoverage> {
  const q = cleanQuery(topic);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=el&gl=GR&ceid=GR:el`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const empty = (status: string): TopicCoverage => ({
    topic,
    status,
    articles_48h: 0,
    sources_48h: 0,
    articles_7d: 0,
    coverage_level: 0,
    momentum: 50,
  });

  try {
    const r = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0; +https://noraya.vercel.app)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!r.ok) return empty(r.status === 429 ? "rate_limited" : "error");

    const xml = await r.text();
    const blocks = xml.split("<item>").slice(1).map((c) => c.split("</item>")[0]);

    const now = Date.now();
    let a48 = 0;
    let a7d = 0;
    const src48 = new Set<string>();
    const src7d = new Set<string>();

    for (const b of blocks) {
      const pub = pick(b, "pubDate");
      const src = pick(b, "source");
      const t = pub ? new Date(pub).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      const ageH = (now - t) / 3_600_000;
      if (ageH <= 168) {
        a7d += 1;
        if (src) src7d.add(src);
      }
      if (ageH <= 48) {
        a48 += 1;
        if (src) src48.add(src);
      }
    }

    // Επίπεδο "τώρα" (48h): όγκος + ποικιλία πηγών
    const volComp = Math.min(100, (a48 / 30) * 100); // ~30 άρθρα/48h = κορεσμός
    const divComp = Math.min(100, (src48.size / 15) * 100); // ~15 πηγές = κορεσμός
    const coverageLevel = Math.round(0.6 * volComp + 0.4 * divComp);

    // Ορμή: ρυθμός 48h vs προηγούμενες 5 ημέρες
    const recentPerDay = a48 / 2;
    const priorPerDay = Math.max(0, a7d - a48) / 5;
    const ratio =
      priorPerDay > 0 ? recentPerDay / priorPerDay : recentPerDay > 0 ? 2 : 1;
    const momentum = Math.round(Math.min(100, Math.max(0, 50 * Math.min(2, ratio))));

    return {
      topic,
      status: a48 > 0 ? "active" : "insufficient",
      articles_48h: a48,
      sources_48h: src48.size,
      articles_7d: a7d,
      coverage_level: coverageLevel,
      momentum,
    };
  } catch (err) {
    clearTimeout(timer);
    const e = err as { name?: string };
    return empty(e?.name === "AbortError" ? "timeout" : "error");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = url.searchParams.get("dry_run") === "1";
  const maxTopics = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("max_topics") || "40")),
  );

  // 1) Ενεργά θέματα ατζέντας από τη βάση
  const { data: events, error: evErr } = await supabase
    .from("v_political_events_live")
    .select("topic")
    .limit(500);

  if (evErr) {
    return NextResponse.json({ ok: false, stage: "read_topics", error: evErr.message }, { status: 500 });
  }

  const topics = Array.from(
    new Set(
      (Array.isArray(events) ? events : [])
        .map((e: any) => String(e?.topic || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maxTopics);

  if (topics.length === 0) {
    return NextResponse.json({ ok: true, topics_checked: 0, results: [], note: "no active topics" });
  }

  // 2) Google News ανά θέμα (σειριακά, ευγενικά, fail-fast)
  const results: TopicCoverage[] = [];
  for (const t of topics) {
    results.push(await fetchTopicCoverage(t));
    await sleep(DELAY_MS);
  }

  results.sort((a, b) => b.coverage_level - a.coverage_level);

  // 3) Αποθήκευση στο external_topic_signals (source=google_news), εκτός dry_run
  let stored = 0;
  let storeError: string | null = null;
  if (!dryRun) {
    const now = new Date().toISOString();
    const signalRows = results.map((rr) => ({
      source: "google_news",
      topic: rr.topic,
      window_hours: 48,
      mention_count: rr.articles_48h,
      candidate_count: rr.articles_7d,
      unique_domain_count: rr.sources_48h,
      coverage_score: rr.coverage_level,
      sample_status: rr.status,
      last_checked_at: now,
      raw_metrics: {
        articles_48h: rr.articles_48h,
        articles_7d: rr.articles_7d,
        sources_48h: rr.sources_48h,
        momentum: rr.momentum,
        coverage_level: rr.coverage_level,
      },
    }));
    const { error: upErr } = await supabase
      .from("external_topic_signals")
      .upsert(signalRows, { onConflict: "source,topic,window_hours" });
    if (upErr) storeError = upErr.message;
    else stored = signalRows.length;
  }

  const rateLimited = results.filter((r) => r.status === "rate_limited").length;

  return NextResponse.json({
    ok: true,
    source: "google_news",
    dry_run: dryRun,
    topics_checked: results.length,
    rate_limited_topics: rateLimited,
    stored,
    store_error: storeError,
    results,
  });
}
