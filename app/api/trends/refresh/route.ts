import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REGION = "GR";
const TIMEFRAME = "now 7-d";
const NEUTRAL_SEARCH_INTEREST = 50;
const MAX_TOPICS_PER_RUN = 35;

const TOPIC_QUERIES: Record<string, string[]> = {
  "Κοινωνία": ["κοινωνία", "κοινωνικά θέματα", "εγκληματικότητα", "κοινωνική βία"],
  "Πολιτική": ["πολιτική", "κυβέρνηση", "κόμματα", "βουλή"],
  "Στέγαση": ["ενοίκια", "στεγαστικό", "πρώτη κατοικία", "σπίτι ενοίκιο"],
  "Ακρίβεια / κόστος ζωής": ["ακρίβεια", "κόστος ζωής", "τιμές σούπερ μάρκετ", "ρεύμα"],
  "Οικονομία": ["οικονομία", "φόροι", "ανάπτυξη", "πληθωρισμός"],
  "Δικαιοσύνη": ["δικαιοσύνη", "δικαστήρια", "ποινικός κώδικας", "αποφυλάκιση"],
  "Θεσμοί / διαφάνεια": ["θεσμοί", "διαφάνεια", "σκάνδαλο", "ανεξάρτητες αρχές"],
  "Άμυνα": ["άμυνα", "ελληνοτουρκικά", "navtex", "ένοπλες δυνάμεις"],
  "Άμυνα / Εθνικά": ["άμυνα", "ελληνοτουρκικά", "navtex", "ένοπλες δυνάμεις"],
  "Εξωτερική πολιτική": ["εξωτερική πολιτική", "ελλάδα τουρκία", "ευρωπαϊκή ένωση", "state department"],
  "Γεωπολιτική": ["γεωπολιτική", "ουκρανία", "μέση ανατολή", "τουρκία"],
  "Υγεία": ["υγεία", "νοσοκομεία", "ΕΣΥ", "γιατροί"],
  "Παιδεία": ["παιδεία", "σχολεία", "εκπαίδευση", "πανελλήνιες"],
  "Πανεπιστήμια": ["πανεπιστήμια", "φοιτητές", "ιδιωτικά πανεπιστήμια", "πανεπιστημιακή αστυνομία"],
  "Εργασία": ["εργασία", "μισθοί", "ανεργία", "εργασιακά"],
  "Αγροτικά": ["αγρότες", "αγροτικά", "ΟΠΕΚΕΠΕ", "επιδοτήσεις"],
  "Ενέργεια": ["ρεύμα", "τιμή ρεύματος", "ενέργεια", "λογαριασμοί ρεύματος"],
  "Μεταναστευτικό": ["μεταναστευτικό", "μετανάστες", "άσυλο", "προσφυγικό"],
  "Ασφάλεια / εγκληματικότητα": ["εγκληματικότητα", "ασφάλεια", "αστυνομία", "ΕΛΑΣ"],
  "Περιβάλλον / κλιματική κρίση": ["κλιματική κρίση", "περιβάλλον", "πυρκαγιές", "πλημμύρες"],
  "Πολιτική προστασία": ["πολιτική προστασία", "πυρκαγιές", "112", "κακοκαιρία"],
  "Υποδομές / μεταφορές": ["μετρό", "τρένα", "συγκοινωνίες", "υποδομές"],
  "Ψηφιακή πολιτική / τεχνολογία": ["τεχνολογία", "ψηφιακή πολιτική", "AI", "κυβερνοασφάλεια"],
  "Φορολογία": ["φόροι", "φορολογία", "τεκμήρια", "εφορία"],
  "Ασφαλιστικό / συντάξεις": ["συντάξεις", "ασφαλιστικό", "ΕΦΚΑ", "συνταξιούχοι"],
  "Νεολαία": ["νέοι", "νεολαία", "φοιτητές", "εργασία νέων"],
  "Ισότητα / συμπερίληψη": ["ισότητα", "δικαιώματα", "ΛΟΑΤΚΙ", "συμπερίληψη"],
  "Τοπική αυτοδιοίκηση": ["δήμος", "περιφέρεια", "αυτοδιοίκηση", "δήμαρχος"],
  "Πολιτισμός": ["πολιτισμός", "υπουργείο πολιτισμού", "μουσεία", "καλλιτέχνες"],
  "Αθλητισμός": ["αθλητισμός", "ποδόσφαιρο", "μπάσκετ", "οπαδική βία"],
};

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function stripGooglePrefix(raw: string) {
  return raw.replace(/^\)\]\}',?\s*/, "").trim();
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(stripGooglePrefix(raw));
  } catch {
    return null;
  }
}

function clampScore(value: number, fallback = NEUTRAL_SEARCH_INTEREST) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeQueries(topic: string) {
  const mapped = TOPIC_QUERIES[topic] || [topic];
  return Array.from(new Set(mapped.map((q) => q.trim()).filter(Boolean))).slice(0, 5);
}

function recentAverage(values: number[], take = 7) {
  const recent = values.slice(-take).filter((n) => Number.isFinite(n));
  if (!recent.length) return null;
  return recent.reduce((sum, n) => sum + n, 0) / recent.length;
}

async function fetchGoogleTrendsScore(topic: string): Promise<{
  score: number;
  status: string;
  queries: string[];
  rawPayload: any;
  error?: string;
}> {
  const queries = normalizeQueries(topic);

  const comparisonItem = queries.map((keyword) => ({ keyword, geo: REGION, time: TIMEFRAME }));
  const exploreReq = { comparisonItem, category: 0, property: "" };
  const exploreUrl =
    "https://trends.google.com/trends/api/explore?" +
    new URLSearchParams({
      hl: "el-GR",
      tz: "-180",
      req: JSON.stringify(exploreReq),
    }).toString();

  const headers = {
    "user-agent":
      "Mozilla/5.0 (compatible; NorayaTrendRefresh/1.0; +https://noraya.vercel.app)",
    accept: "application/json,text/plain,*/*",
  };

  const exploreRes = await fetch(exploreUrl, { headers, cache: "no-store" });
  const exploreRaw = await exploreRes.text();
  if (!exploreRes.ok) {
    return { score: NEUTRAL_SEARCH_INTEREST, status: `unavailable_${exploreRes.status}`, queries, rawPayload: {}, error: exploreRaw.slice(0, 200) };
  }

  const explore = safeJsonParse(exploreRaw);
  const widget = explore?.widgets?.find((w: any) => w?.id === "TIMESERIES" || w?.type === "fe_line_chart");
  if (!widget?.request || !widget?.token) {
    return { score: NEUTRAL_SEARCH_INTEREST, status: "unavailable_no_widget", queries, rawPayload: { explore }, error: "No TIMESERIES widget" };
  }

  const dataUrl =
    "https://trends.google.com/trends/api/widgetdata/multiline?" +
    new URLSearchParams({
      hl: "el-GR",
      tz: "-180",
      req: JSON.stringify(widget.request),
      token: widget.token,
    }).toString();

  const dataRes = await fetch(dataUrl, { headers, cache: "no-store" });
  const dataRaw = await dataRes.text();
  if (!dataRes.ok) {
    return { score: NEUTRAL_SEARCH_INTEREST, status: `unavailable_${dataRes.status}`, queries, rawPayload: { explore }, error: dataRaw.slice(0, 200) };
  }

  const data = safeJsonParse(dataRaw);
  const timeline = Array.isArray(data?.default?.timelineData) ? data.default.timelineData : [];
  if (!timeline.length) {
    return { score: NEUTRAL_SEARCH_INTEREST, status: "unavailable_no_timeline", queries, rawPayload: { explore, data }, error: "No timeline" };
  }

  const perQueryValues: number[][] = queries.map(() => []);
  for (const point of timeline) {
    const values = Array.isArray(point?.value) ? point.value : [];
    values.forEach((value: any, index: number) => {
      if (perQueryValues[index]) perQueryValues[index].push(Number(value));
    });
  }

  const queryAverages = perQueryValues
    .map((values) => recentAverage(values, 7))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  const average = queryAverages.length
    ? queryAverages.reduce((sum, n) => sum + n, 0) / queryAverages.length
    : NEUTRAL_SEARCH_INTEREST;

  return {
    score: clampScore(average),
    status: "google_trends",
    queries,
    rawPayload: {
      note: "Google Trends returns relative search interest 0-100 for the selected queries, region and timeframe.",
      topic,
      region: REGION,
      timeframe: TIMEFRAME,
      queryAverages,
    },
  };
}

async function upsertTrendSignal(supabase: ReturnType<typeof svc>, topic: string, result: Awaited<ReturnType<typeof fetchGoogleTrendsScore>>) {
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

  const done: Array<{ topic: string; score: number; status: string; queries: string[]; error?: string }> = [];

  for (const topic of topics) {
    try {
      const result = await fetchGoogleTrendsScore(topic);
      await upsertTrendSignal(supabase, topic, result);
      done.push({ topic, score: result.score, status: result.status, queries: result.queries, error: result.error });
    } catch (e: any) {
      const fallback = {
        score: NEUTRAL_SEARCH_INTEREST,
        status: "error_fallback_50",
        queries: normalizeQueries(topic),
        rawPayload: {},
        error: String(e?.message || e),
      };
      try {
        await upsertTrendSignal(supabase, topic, fallback);
      } catch {}
      done.push({ topic, score: fallback.score, status: fallback.status, queries: fallback.queries, error: fallback.error });
    }
  }

  return NextResponse.json({
    ok: true,
    region: REGION,
    timeframe: TIMEFRAME,
    processed: done.length,
    note: "Google Trends is relative search interest, not polling or absolute search volume. Fallback score is 50.",
    results: done,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
