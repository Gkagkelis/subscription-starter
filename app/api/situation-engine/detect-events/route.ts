import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Event Detection (φιλτράρισμα = ΦΘΗΝΟ μοντέλο)
//
// Ένα τρέξιμο ΑΔΕΙΑΖΕΙ όλες τις εκκρεμείς θεματικές (loop με time-budget),
// ώστε να καλείται ΛΙΓΕΣ φορές τη μέρα (βλ. vercel.json), όχι συνεχώς.
//
// Χρησιμοποιεί ΦΘΗΝΟ μοντέλο (Haiku) για το φιλτράρισμα/clustering.
// Αν το φθηνό μοντέλο δεν είναι διαθέσιμο, κάνει ΑΣΦΑΛΕΣ fallback σε Sonnet.
//
// Κρατά ΜΟΝΟ πολιτικά σημαντικά γεγονότα που δένουν με τις θεματικές του προφίλ.
//
// ΟΡΑΤΟΤΗΤΑ: αν το AI αποτύχει (credit/rate-limit/glitch), ΔΕΝ σταματάει τη ροή
// — απλώς καταγράφει το σφάλμα στο πεδίο ai_failures της απάντησης, ώστε να
// ξεχωρίζεις "0 events επειδή δεν υπήρχε υλικό" από "0 events επειδή έσπασε το AI".
// ============================================================

const FILTER_MODEL = process.env.ANTHROPIC_FILTER_MODEL || "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";

type ArticleRow = {
  id: string;
  title: string;
  source_name: string | null;
  topic: string | null;
  published_at: string | null;
  ingested_at: string | null;
};

type DetectedEvent = {
  title: string;
  summary: string;
  article_ids: string[];
  matched_theme?: string;
};

// Αποτέλεσμα ανά θεματική: events που φτιάχτηκαν + προαιρετικό σφάλμα AI.
type TopicResult = {
  topic: string;
  events: number;
  ai_error?: string | null;
  articles_seen?: number;
};

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function loadActiveThemes(supabase: ReturnType<typeof svc>): Promise<string[]> {
  const { data } = await supabase
    .from("organizations")
    .select("themes, issues, updated_at, onboarding_completed")
    .order("updated_at", { ascending: false })
    .limit(5);

  const rows = (data || []) as any[];
  const org = rows.find((r) => r?.onboarding_completed) || rows[0];

  const themes: string[] = [];

  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach((x) => typeof x === "string" && themes.push(x));
    }
  };

  push(org?.themes);
  push(org?.issues);

  return Array.from(new Set(themes));
}

function parseAiJson(raw: string): { events: DetectedEvent[] } | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(raw);

  if (!parsed) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParse(match[0]);
  }

  if (!parsed || !Array.isArray(parsed.events)) return null;

  return parsed as { events: DetectedEvent[] };
}

function buildSystemPrompt(themes: string[]) {
  const themesText = themes.length
    ? themes.map((t) => `- ${t}`).join("\n")
    : "- (δεν έχουν οριστεί θεματικές — κράτα μόνο ό,τι έχει σαφή πολιτική σημασία)";

  return `Είσαι ο μηχανισμός ανίχνευσης γεγονότων του Noraya, για ΠΟΛΙΤΙΚΟ ΚΟΜΜΑ.

Σου δίνεται μια ΘΕΜΑΤΙΚΗ και πρόσφατα άρθρα. Χώρισέ τα σε διακριτά ΓΕΓΟΝΟΤΑ.

ΘΕΜΑΤΙΚΕΣ ΠΟΥ ΕΝΔΙΑΦΕΡΟΥΝ ΤΟΝ ΦΟΡΕΑ:
${themesText}

ΚΡΑΤΑ ΜΟΝΟ γεγονότα με ΠΟΛΙΤΙΚΗ ΣΗΜΑΣΙΑ για κόμμα (κυβέρνηση/κόμματα/θεσμοί/
πολιτική ευθύνη/ζητήματα πολιτών/δημόσια ατζέντα) που συνδέονται με τις θεματικές.

ΚΟΨΕ τελείως: μεμονωμένες συλλήψεις/αστυνομικό δελτίο/τροχαία/εγκλήματα χωρίς
πολιτική διάσταση, showbiz/lifestyle/celebrities/πορνογραφία/κουτσομπολιό,
αθλητικά, διεθνή ψιλά χωρίς ελληνικό/πολιτικό αντίκτυπο, εμπορικά/διαφημιστικά.
Αν είναι οριακό, ΚΟΨΕ το. Λίγα και σημαντικά.

Τίτλος: κοφτός, συγκεκριμένος, σαν briefing — ΟΧΙ το όνομα της θεματικής.
Σύνοψη: ΜΙΑ πρόταση με βάση ΜΟΝΟ τους τίτλους. Μην εφευρίσκεις.`;
}

function buildUserPrompt(topic: string, articles: ArticleRow[]) {
  const lines = articles
    .map((a) => `- [id:${a.id}] (${a.source_name || "—"}) ${a.title}`)
    .join("\n");

  return `ΘΕΜΑΤΙΚΗ: ${topic}

ΑΡΘΡΑ:
${lines}

Επίστρεψε ΜΟΝΟ έγκυρο JSON, χωρίς markdown:
{ "events": [ { "title": "...", "summary": "...", "matched_theme": "...", "article_ids": ["id1"] } ] }

Αν ΚΑΝΕΝΑ άρθρο δεν είναι πολιτικά σημαντικό: { "events": [] }`;
}

// Καλεί το AI με ΦΘΗΝΟ μοντέλο + prompt caching· αν το μοντέλο δεν υπάρχει,
// επαναλαμβάνει ΜΙΑ φορά με το σίγουρο Sonnet.
//
// Επιστρέφει { text } σε επιτυχία, ή { error } σε αποτυχία — ΠΟΤΕ δεν πετάει,
// ώστε η ροή να συνεχίζει στις υπόλοιπες θεματικές.
async function callAnthropic(
  system: string,
  user: string
): Promise<{ text: string | null; error: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, error: "ANTHROPIC_API_KEY missing" };

  const doCall = async (model: string) => {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: user }],
      }),
    });
  };

  try {
    let res = await doCall(FILTER_MODEL);
    let usedModel = FILTER_MODEL;

    if (!res.ok && (res.status === 404 || res.status === 400)) {
      // πιθανό λάθος όνομα φθηνού μοντέλου -> ασφαλές fallback
      res = await doCall(FALLBACK_MODEL);
      usedModel = FALLBACK_MODEL;
    }

    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return { text: null, error: `model=${usedModel} status=${res.status} ${body}` };
    }

    const data = await res.json();
    const text = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    if (!text) return { text: null, error: `model=${usedModel} empty_response` };

    return { text, error: null };
  } catch (e: any) {
    return { text: null, error: `exception: ${String(e?.message || e).slice(0, 200)}` };
  }
}

function stableEventKey(topic: string, articleIds: string[]) {
  // Το κλειδί βασίζεται στο "άγκυρα" άρθρο (το μικρότερο id αλφαβητικά),
  // ΟΧΙ στον τίτλο. Έτσι το ίδιο πραγματικό γεγονός παράγει ΙΔΙΟ κλειδί
  // ακόμα κι αν το AI του δώσει διαφορετικό τίτλο σε άλλο τρέξιμο,
  // και ακόμα κι αν προστεθούν νέα άρθρα αργότερα (η άγκυρα μένει σταθερή).
  const anchor = [...articleIds].sort()[0] || "none";
  return `evt:ai:${topic.toLowerCase()}|anchor:${anchor}`;
}

async function processTopic(
  supabase: ReturnType<typeof svc>,
  topic: string,
  themes: string[]
): Promise<TopicResult> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: articles } = await supabase
    .from("articles")
    .select("id,title,source_name,topic,published_at,ingested_at")
    .eq("topic", topic)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(60);

  const list = (articles || []) as ArticleRow[];

  if (list.length < 2) return { topic, events: 0, ai_error: null, articles_seen: list.length };

  const validIds = new Set(list.map((a) => a.id));

  const { text: raw, error: aiError } = await callAnthropic(
    buildSystemPrompt(themes),
    buildUserPrompt(topic, list)
  );

  // Αν το AI απέτυχε, ΔΕΝ σταματάμε — επιστρέφουμε 0 events ΜΕ το σφάλμα ορατό.
  if (aiError) return { topic, events: 0, ai_error: aiError, articles_seen: list.length };

  const parsed = raw ? parseAiJson(raw) : null;

  if (!parsed) return { topic, events: 0, ai_error: "ai_returned_unparseable_json", articles_seen: list.length, raw_preview: (raw || "").slice(0, 400) } as any;

  let count = 0;

  for (const ev of parsed.events) {
    const ids = (ev.article_ids || []).filter((id) => validIds.has(id));

    if (ids.length === 0) continue;

    const title = (ev.title || "").trim();

    if (!title) continue;

    const { error: rpcErr } = await supabase.rpc("upsert_political_event", {
      p_organization_id: null,
      p_topic: topic,
      p_event_key: stableEventKey(topic, ids),
      p_title: title,
      p_summary: (ev.summary || "").trim() || null,
      p_article_ids: ids,
      p_detection_method: "ai",
      p_detection_terms: ev.matched_theme ? [ev.matched_theme] : [],
    });

    if (!rpcErr) count += 1;
  }

  return { topic, events: count, ai_error: null, articles_seen: list.length };
}

async function handle(request: Request) {
  try {
    const supabase = svc();

    const url = new URL(request.url);
    const requestedTopic = url.searchParams.get("topic");

    const themes = await loadActiveThemes(supabase);

    // Χειροκίνητο: μία συγκεκριμένη θεματική
    if (requestedTopic) {
      const r = await processTopic(supabase, requestedTopic, themes);

      await supabase.rpc("mark_topic_detected", {
        p_topic: requestedTopic,
      });

      return NextResponse.json({
        ok: true,
        mode: "single",
        processed: [r],
        themes_loaded: themes.length,
        ai_failures: r.ai_error ? [{ topic: r.topic, error: r.ai_error }] : [],
      });
    }

    // Αυτόματο: ΑΔΕΙΑΣΕ όλες τις εκκρεμείς θεματικές σε αυτό το τρέξιμο
    const startedAt = Date.now();
    const BUDGET_MS = 120000; // 2 λεπτά ασφάλεια κάτω από το maxDuration 300

    const results: TopicResult[] = [];

    while (Date.now() - startedAt < BUDGET_MS) {
      const { data: next } = await supabase.rpc("pick_next_topic_for_detection");

      const topic = (next as string) || null;

      if (!topic) break;

      const r = await processTopic(supabase, topic, themes);

      await supabase.rpc("mark_topic_detected", {
        p_topic: topic,
      });

      results.push(r);
    }

    const { data: more } = await supabase.rpc("pick_next_topic_for_detection");

    // Μάζεψε τυχόν AI σφάλματα ώστε να είναι ΟΡΑΤΑ στην απάντηση.
    const aiFailures = results
      .filter((r) => r.ai_error)
      .map((r) => ({ topic: r.topic, error: r.ai_error }));

    return NextResponse.json({
      ok: true,
      mode: "drain",
      topics_processed: results.length,
      events_created: results.reduce((s, r) => s + r.events, 0),
      themes_loaded: themes.length,
      remaining_topic: (more as string) || null,
      ai_failures: aiFailures,
      ai_ok: aiFailures.length === 0,
      detail: results,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
