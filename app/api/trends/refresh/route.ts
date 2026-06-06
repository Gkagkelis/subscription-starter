import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Public Attention Signal (Wikipedia pageviews)
//
// ΑΝΤΙΚΑΘΙΣΤΑ το απευθείας scraping του Google Trends (που έδινε 429).
// Πηγή: επίσημο Wikimedia Pageviews API (δωρεάν, χωρίς key, χωρίς 429).
// Μετράει ΠΟΣΟΙ διαβάζουν το άρθρο ενός θέματος -> σήμα δημόσιας προσοχής.
//
// ΣΗΜΑ = momentum: μέσος όρος τελευταίων 7 ημερών vs baseline 30 ημερών.
//   ratio 1.0 -> 50 (σταθερό), 1.5 -> 75, 2.0 -> 100, 0.5 -> 25 κ.ο.κ.
// Έτσι δείχνει αν η προσοχή ΑΝΕΒΑΙΝΕΙ, όχι απλώς απόλυτο όγκο.
//
// Γράφει στον ΙΔΙΟ πίνακα/κλειδιά (region=GR, timeframe="now 7-d") ώστε το
// situation-engine να το διαβάζει χωρίς καμία αλλαγή.
//
// ΕΤΟΙΜΟ ΓΙΑ SerpApi (Google Trends) ΑΡΓΟΤΕΡΑ: αρκεί να προστεθεί
// fetchSerpApiTrendScore() και να αλλάξει το TREND_PROVIDER. Τίποτα άλλο.
// ============================================================

const REGION = "GR";
const TIMEFRAME = "now 7-d"; // κλειδί συμβατότητας με το situation-engine
const WIKI_PROJECT = "el.wikipedia";
const NEUTRAL = 50;
const MAX_TOPICS_PER_RUN = 35;
const WINDOW_DAYS = 30;
const TREND_PROVIDER = process.env.TREND_PROVIDER || "wikipedia"; // μελλοντικά: "serpapi"

// Θέμα -> υποψήφια άρθρα ελληνικής Wikipedia (όποιο δεν υπάρχει, αγνοείται)
const TOPIC_WIKI: Record<string, string[]> = {
  "Κοινωνία": ["Κοινωνία"],
  "Πολιτική": ["Πολιτική"],
  "Στέγαση": ["Στέγαση", "Κατοικία"],
  "Ακρίβεια / κόστος ζωής": ["Πληθωρισμός", "Ακρίβεια"],
  "Οικονομία": ["Οικονομία της Ελλάδας", "Οικονομία"],
  "Δικαιοσύνη": ["Δικαιοσύνη"],
  "Θεσμοί / διαφάνεια": ["Διαφθορά", "Διαφάνεια"],
  "Άμυνα": ["Ελληνοτουρκικές σχέσεις", "Ένοπλες Δυνάμεις"],
  "Άμυνα / Εθνικά": ["Ελληνοτουρκικές σχέσεις", "Ένοπλες Δυνάμεις"],
  "Εξωτερική πολιτική": ["Εξωτερική πολιτική της Ελλάδας", "Διπλωματία"],
  "Γεωπολιτική": ["Γεωπολιτική", "Ρωσοουκρανικός πόλεμος"],
  "Υγεία": ["Εθνικό Σύστημα Υγείας", "Σύστημα υγείας"],
  "Παιδεία": ["Εκπαίδευση στην Ελλάδα", "Εκπαίδευση"],
  "Πανεπιστήμια": ["Πανεπιστήμιο"],
  "Εργασία": ["Ανεργία", "Εργασία"],
  "Αγροτικά": ["Γεωργία", "Αγρότης"],
  "Ενέργεια": ["Ηλεκτρική ενέργεια", "Ενέργεια"],
  "Μεταναστευτικό": ["Μετανάστευση", "Προσφυγική κρίση"],
  "Ασφάλεια / εγκληματικότητα": ["Εγκληματικότητα", "Έγκλημα"],
  "Περιβάλλον / κλιματική κρίση": ["Κλιματική αλλαγή", "Περιβάλλον"],
  "Πολιτική προστασία": ["Πολιτική προστασία", "Δασική πυρκαγιά"],
  "Υποδομές / μεταφορές": ["Μεταφορά", "Υποδομή"],
  "Ψηφιακή πολιτική / τεχνολογία": ["Τεχνητή νοημοσύνη", "Τεχνολογία"],
  "Φορολογία": ["Φόρος", "Φορολογία"],
  "Ασφαλιστικό / συντάξεις": ["Σύνταξη", "Κοινωνική ασφάλιση"],
  "Νεολαία": ["Νεολαία"],
  "Ισότητα / συμπερίληψη": ["Ισότητα των φύλων", "ΛΟΑΤ"],
  "Τοπική αυτοδιοίκηση": ["Τοπική αυτοδιοίκηση"],
  "Πολιτισμός": ["Πολιτισμός"],
  "Αθλητισμός": ["Αθλητισμός", "Ποδόσφαιρο"],
};

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return NEUTRAL;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function ratioToScore(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return NEUTRAL;
  if (ratio >= 1) return clamp(50 + Math.min(50, (ratio - 1) * 50));
  return clamp(Math.max(0, 50 * ratio));
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function titlesFor(topic: string): string[] {
  const mapped = TOPIC_WIKI[topic] || [topic];
  return Array.from(new Set(mapped.map((t) => t.trim()).filter(Boolean))).slice(0, 3);
}

// Καθημερινές προβολές ενός άρθρου τις τελευταίες WINDOW_DAYS μέρες.
async function fetchArticleDailyViews(title: string): Promise<number[]> {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS);

  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `${WIKI_PROJECT}/all-access/all-agents/${encoded}/daily/${fmtDate(start)}/${fmtDate(end)}`;

  const res = await fetch(url, {
    headers: {
      "user-agent": "Noraya/1.0 (political-intelligence; https://noraya.vercel.app)",
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return []; // 404 = δεν υπάρχει άρθρο -> αγνόησέ το
  const data = await res.json().catch(() => null);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((it: any) => Number(it?.views) || 0);
}

async function fetchWikipediaAttentionScore(topic: string): Promise<{
  score: number;
  status: string;
  queries: string[];
  rawPayload: any;
  error?: string;
}> {
  const titles = titlesFor(topic);

  // Άθροισε καθημερινές προβολές σε όλα τα άρθρα του θέματος (ευθυγραμμισμένα στο τέλος)
  const seriesList = await Promise.all(titles.map((t) => fetchArticleDailyViews(t)));
  const usable = seriesList.filter((s) => s.length > 0);

  if (!usable.length) {
    return {
      score: NEUTRAL,
      status: "wikipedia_pending_no_article",
      queries: titles,
      rawPayload: { topic, project: WIKI_PROJECT, note: "Δεν βρέθηκαν άρθρα/δεδομένα." },
    };
  }

  const len = Math.max(...usable.map((s) => s.length));
  const totalByDay: number[] = [];
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const s of usable) {
      const v = s[s.length - len + i];
      if (Number.isFinite(v)) sum += v;
    }
    totalByDay.push(sum);
  }

  const recent = totalByDay.slice(-7);
  const baseline = totalByDay.length > 7 ? totalByDay.slice(0, -7) : totalByDay;
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const recentAvg = avg(recent);
  const baselineAvg = avg(baseline);

  const totalViews = totalByDay.reduce((a, b) => a + b, 0);
  if (totalViews < 30) {
    // πολύ λίγα δεδομένα -> ειλικρινές pending, όχι ψεύτικη μέτρηση
    return {
      score: NEUTRAL,
      status: "wikipedia_pending_low_data",
      queries: titles,
      rawPayload: { topic, totalViews, recentAvg, baselineAvg },
    };
  }

  const ratio = baselineAvg > 0 ? recentAvg / baselineAvg : 1;
  return {
    score: ratioToScore(ratio),
    status: "wikipedia_attention",
    queries: titles,
    rawPayload: {
      topic,
      project: WIKI_PROJECT,
      note: "Σήμα δημόσιας προσοχής: αναγνώσεις Wikipedia, 7 μέρες vs baseline 30 ημερών.",
      recentAvg: Math.round(recentAvg),
      baselineAvg: Math.round(baselineAvg),
      ratio: Number(ratio.toFixed(2)),
      titlesUsed: titles,
    },
  };
}

async function fetchAttentionScore(topic: string) {
  // Σημείο επέκτασης: αν TREND_PROVIDER === "serpapi" -> fetchSerpApiTrendScore(topic)
  // Προς το παρόν, μόνο Wikipedia (δωρεάν, αξιόπιστο).
  if (TREND_PROVIDER === "serpapi") {
    // Μελλοντικά: εδώ μπαίνει η κλήση SerpApi με process.env.SERPAPI_KEY.
    // Μέχρι να υλοποιηθεί, πέφτουμε με ασφάλεια στο Wikipedia.
  }
  return fetchWikipediaAttentionScore(topic);
}

async function upsertTrendSignal(
  supabase: ReturnType<typeof svc>,
  topic: string,
  result: Awaited<ReturnType<typeof fetchAttentionScore>>
) {
  const { error } = await supabase.from("topic_trend_signals").upsert(
    {
      topic,
      region: REGION,
      timeframe: TIMEFRAME,
      queries: result.queries,
      search_interest_score: result.score,
      search_interest_status: result.status,
      rising_queries: [],
      raw_payload: result.error ? { ...result.rawPayload, error: result.error } : result.rawPayload,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "topic,region,timeframe" }
  );
  if (error) throw new Error(error.message);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const topicParam = url.searchParams.get("topic");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = svc();

  const topics = topicParam
    ? [topicParam]
    : ((await supabase
        .from("agenda_topics")
        .select("name")
        .is("organization_id", null)
        .neq("name", "Μη ταξινομημένο")
        .order("agenda_score", { ascending: false })
        .limit(MAX_TOPICS_PER_RUN)).data || [])
        .map((row: any) => String(row?.name || "").trim())
        .filter(Boolean);

  const done: Array<{ topic: string; score: number; status: string; error?: string }> = [];

  for (const topic of topics) {
    try {
      const result = await fetchAttentionScore(topic);
      await upsertTrendSignal(supabase, topic, result);
      done.push({ topic, score: result.score, status: result.status, error: result.error });
    } catch (e: any) {
      const fallback = {
        score: NEUTRAL,
        status: "error_fallback_50",
        queries: titlesFor(topic),
        rawPayload: {},
        error: String(e?.message || e),
      };
      try {
        await upsertTrendSignal(supabase, topic, fallback);
      } catch {}
      done.push({ topic, score: fallback.score, status: fallback.status, error: fallback.error });
    }
  }

  return NextResponse.json({
    ok: true,
    provider: TREND_PROVIDER,
    region: REGION,
    timeframe: TIMEFRAME,
    processed: done.length,
    note: "Σήμα δημόσιας προσοχής από Wikipedia pageviews (momentum 7d vs 30d). Δεν είναι Google Trends.",
    results: done,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
