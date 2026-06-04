import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — AI Event Detection (ΜΙΑ θεματική ανά κλήση)
//
// ΤΙ ΚΑΝΕΙ:
// Παίρνει ΜΙΑ θεματική, διαβάζει τα πρόσφατα άρθρα της, και ζητά από το AI
// να τα χωρίσει σε διακριτά ΓΕΓΟΝΟΤΑ (π.χ. "Χειμάρρα" ≠ "NAVTEX"), που
// γράφονται στη βάση μέσω upsert_political_event().
//
// ΓΙΑΤΙ ΜΙΑ ΤΗ ΦΟΡΑ:
// Έτσι κάθε κλήση τελειώνει γρήγορα και ΔΕΝ σκάει σε 504 timeout.
// Ένα cron (βλ. vercel.json) χτυπάει αυτό το endpoint τακτικά. Κάθε χτύπημα:
//   - GET χωρίς παράμετρο  -> διαλέγει αυτόματα την ΕΠΟΜΕΝΗ θεματική που εκκρεμεί
//   - αν δεν εκκρεμεί καμία -> δεν κάνει AI κλήση (μηδέν κόστος)
// Έτσι σε λίγα λεπτά καλύπτονται όλες οι θεματικές, αυτόματα, σε rotation.
//
// ΧΕΙΡΟΚΙΝΗΤΑ (προαιρετικό):
//   GET/POST  /api/situation-engine/detect-events?topic=Οικονομία
//   -> δουλεύει μόνο αυτή τη θεματική τώρα.
// ============================================================

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
};

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
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

function buildSystemPrompt() {
  return `
Είσαι ο μηχανισμός ανίχνευσης γεγονότων του Noraya.

Σου δίνεται μια ΘΕΜΑΤΙΚΗ (π.χ. "Άμυνα/Εθνικά") και μια λίστα πρόσφατων άρθρων
(τίτλος + πηγή + id) που έχουν ταξινομηθεί σε αυτή τη θεματική.

ΔΟΥΛΕΙΑ ΣΟΥ:
Χώρισε τα άρθρα σε ΔΙΑΚΡΙΤΑ ΓΕΓΟΝΟΤΑ. Ένα γεγονός = ένα συγκεκριμένο συμβάν/
εξέλιξη με δικό του πυρήνα (π.χ. "ο τραυματισμός ομογενή στη Χειμάρρα" είναι
ΑΛΛΟ γεγονός από "η τουρκική NAVTEX"), ακόμη κι αν ανήκουν στην ίδια θεματική.

ΚΑΝΟΝΕΣ:
- Μη συγχωνεύεις άσχετα συμβάντα επειδή μοιράζονται θεματική.
- Μη σπας το ίδιο συμβάν σε πολλά γεγονότα.
- Άρθρα που δεν ανήκουν σε κανένα σαφές γεγονός: άφησέ τα εκτός.
- Ο τίτλος κάθε γεγονότος: κοφτός, συγκεκριμένος, σαν τίτλος ενημερωτικού briefing.
  ΟΧΙ το όνομα της θεματικής. ΟΧΙ γενικότητες.
- Η σύνοψη: ΜΙΑ πρόταση, τι ακριβώς συνέβη, με βάση ΜΟΝΟ τους τίτλους που σου δόθηκαν.
- Μην εφευρίσκεις γεγονότα ή λεπτομέρειες που δεν στηρίζονται στους τίτλους.
`;
}

function buildUserPrompt(topic: string, articles: ArticleRow[]) {
  const lines = articles
    .map((a) => `- [id:${a.id}] (${a.source_name || "—"}) ${a.title}`)
    .join("\n");

  return `
ΘΕΜΑΤΙΚΗ: ${topic}

ΑΡΘΡΑ:
${lines}

Επίστρεψε ΜΟΝΟ έγκυρο JSON, χωρίς markdown, ακριβώς αυτή τη δομή:

{
  "events": [
    {
      "title": "κοφτός τίτλος του γεγονότος",
      "summary": "μία πρόταση για το τι συνέβη",
      "article_ids": ["id1", "id2"]
    }
  ]
}
`;
}

async function callAnthropic(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }]
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return text || null;
}

function stableEventKey(topic: string, title: string) {
  const norm = (title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  return `evt:ai:${topic.toLowerCase()}|${norm}`;
}

// Επεξεργάζεται ΜΙΑ θεματική. Επιστρέφει πόσα γεγονότα γράφτηκαν + τη μέθοδο.
async function processTopic(
  supabase: ReturnType<typeof svc>,
  topic: string
): Promise<{ topic: string; events: number; method: string }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: articles } = await supabase
    .from("articles")
    .select("id,title,source_name,topic,published_at,ingested_at")
    .eq("topic", topic)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(60);

  const list = (articles || []) as ArticleRow[];
  if (list.length < 2) {
    return { topic, events: 0, method: "skipped_too_few" };
  }

  const validIds = new Set(list.map((a) => a.id));
  const raw = await callAnthropic(buildSystemPrompt(), buildUserPrompt(topic, list));
  const parsed = raw ? parseAiJson(raw) : null;

  if (!parsed) {
    // Fallback: αν αποτύχει το AI, το baseline SQL detection καλύπτει.
    await supabase.rpc("detect_political_events_baseline");
    return { topic, events: 0, method: "baseline_fallback" };
  }

  let count = 0;
  for (const ev of parsed.events) {
    const ids = (ev.article_ids || []).filter((id) => validIds.has(id));
    if (ids.length === 0) continue;
    const title = (ev.title || "").trim();
    if (!title) continue;

    const { error: rpcErr } = await supabase.rpc("upsert_political_event", {
      p_organization_id: null,
      p_topic: topic,
      p_event_key: stableEventKey(topic, title),
      p_title: title,
      p_summary: (ev.summary || "").trim() || null,
      p_article_ids: ids,
      p_detection_method: "ai",
      p_detection_terms: []
    });
    if (!rpcErr) count += 1;
  }

  return { topic, events: count, method: "ai" };
}

// Κοινός handler για GET (cron) και POST (χειροκίνητο).
async function handle(request: Request) {
  try {
    const supabase = svc();
    const url = new URL(request.url);
    const requestedTopic = url.searchParams.get("topic");

    // 1) Διάλεξε θεματική: είτε αυτή που ζητήθηκε, είτε η επόμενη που εκκρεμεί.
    let topic = requestedTopic;
    if (!topic) {
      const { data: next } = await supabase.rpc("pick_next_topic_for_detection");
      topic = (next as string) || null;
    }

    // 2) Αν δεν εκκρεμεί καμία -> idle, μηδέν κόστος.
    if (!topic) {
      return NextResponse.json({
        ok: true,
        processed: null,
        message: "Δεν εκκρεμεί καμία θεματική για ανίχνευση γεγονότων.",
        live_first: true
      });
    }

    // 3) Επεξεργάσου τη μία θεματική.
    const result = await processTopic(supabase, topic);

    // 4) Σφράγισέ την ως ανιχνευμένη (ώστε να μη ξαναπιαστεί χωρίς νέα άρθρα).
    await supabase.rpc("mark_topic_detected", { p_topic: topic });

    // 5) Δες αν εκκρεμεί κι άλλη (μόνο για ενημέρωση, δεν την τρέχει τώρα).
    const { data: more } = await supabase.rpc("pick_next_topic_for_detection");

    return NextResponse.json({
      ok: true,
      processed: result,
      remaining_topic: (more as string) || null,
      live_first: true,
      demo_data: false
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
