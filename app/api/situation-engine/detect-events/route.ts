import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — AI Event Detection
//
// ΣΚΟΠΟΣ:
// Παίρνει τα πρόσφατα άρθρα κάθε ΘΕΜΑΤΙΚΗΣ και τα χωρίζει σε διακριτά
// ΓΕΓΟΝΟΤΑ με πραγματική κατανόηση (όχι keyword matching).
// Για κάθε γεγονός γράφει: κοφτό τίτλο, μία σύνοψη, και τα άρθρα-στοιχεία του,
// καλώντας τη συνάρτηση upsert_political_event() της βάσης.
//
// ΑΥΤΟ αντικαθιστά το "1 situation = όλη η θεματική" με
// "πολλά συγκεκριμένα γεγονότα ανά θεματική".
//
// Καλείται scheduled (π.χ. μετά το ingestion/classify), ΟΧΙ live ανά user question.
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
  // απλό σταθερό κλειδί ανά (topic|title) — η βάση κάνει upsert πάνω σε αυτό
  const norm = (title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  return `evt:ai:${topic.toLowerCase()}|${norm}`;
}

export async function POST() {
  try {
    const supabase = svc();

    // 1) Πάρε πρόσφατα ταξινομημένα άρθρα (7 ημέρες), ανά θεματική.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: articles, error } = await supabase
      .from("articles")
      .select("id,title,source_name,topic,published_at,ingested_at")
      .gte("published_at", since)
      .not("topic", "is", null)
      .order("published_at", { ascending: false })
      .limit(400);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // 2) Ομαδοποίησε ανά θεματική.
    const byTopic = new Map<string, ArticleRow[]>();
    for (const a of (articles || []) as ArticleRow[]) {
      const t = (a.topic || "").trim();
      if (!t || t === "Μη ταξινομημένο") continue;
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(a);
    }

    const system = buildSystemPrompt();
    const summary: Array<{ topic: string; events: number; method: string }> = [];

    // 3) Για κάθε θεματική με αρκετά άρθρα, ζήτα από το AI να βρει τα γεγονότα.
    for (const [topic, list] of byTopic.entries()) {
      if (list.length < 2) continue; // 1 άρθρο = δεν είναι ακόμη "γεγονός" προς ομαδοποίηση

      const validIds = new Set(list.map((a) => a.id));
      const raw = await callAnthropic(system, buildUserPrompt(topic, list));
      const parsed = raw ? parseAiJson(raw) : null;

      if (!parsed) {
        // Fallback: αν αποτύχει το AI, αφήνουμε το baseline SQL detection
        // (detect_political_events_baseline) να καλύψει αυτή τη θεματική.
        await supabase.rpc("detect_political_events_baseline");
        summary.push({ topic, events: 0, method: "baseline_fallback" });
        continue;
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

      summary.push({ topic, events: count, method: "ai" });
    }

    return NextResponse.json({
      ok: true,
      topics_processed: summary.length,
      detail: summary,
      live_first: true,
      demo_data: false
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
