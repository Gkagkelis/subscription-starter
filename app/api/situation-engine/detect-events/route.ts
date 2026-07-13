import { NextResponse } from "next/server";
import { checkCostGuard, guardMessage } from "@/lib/noraya/cost-guard";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Event Detection (φιλτράρισμα = ΦΘΗΝΟ μοντέλο)
//
// Ένα τρέξιμο ΑΔΕΙΑΖΕΙ όλες τις εκκρεμείς θεματικές (loop με time-budget).
// Χρησιμοποιεί ΦΘΗΝΟ μοντέλο (Haiku)· fallback σε Sonnet αν χρειαστεί.
// Κρατά ΜΟΝΟ πολιτικά σημαντικά γεγονότα που δένουν με τις θεματικές.
//
// ΟΡΑΤΟΤΗΤΑ: αν το AI αποτύχει, ΔΕΝ σταματάει τη ροή — καταγράφει το σφάλμα
// στο πεδίο ai_failures της απάντησης.
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

const SENSITIVE_EVENT_RE = /(αν[ηή]λικ|εξαφ[αά]νι|αγνο[οό]?[υύ]μεν|βιασμ|αποπλ[αά]ν|κακοπο[ιί]η|παιδεραστ|αυτοκτον|απαγωγ|πνιγμ|τροχα[ιί]ο)/i;
function isSensitiveEvent(title?: string | null): boolean {
  return SENSITIVE_EVENT_RE.test(String(title || ""));
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

  // Καθάρισε τυχόν markdown code fences (```json ... ```) που βάζει το AI.
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed = tryParse(cleaned);

  if (!parsed) {
    // Πιάσε το JSON object από το πρώτο { μέχρι το τελευταίο }.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParse(match[0]);
  }

  if (!parsed || !Array.isArray(parsed.events)) {
    // Salvage: μαζεψε ολοκληρωμενα event objects ακομα κι αν κοπηκε/χαλασε το JSON
    const evAt = cleaned.indexOf('"events"');
    if (evAt >= 0) {
      const arrAt = cleaned.indexOf("[", evAt);
      if (arrAt >= 0) {
        const objs: any[] = [];
        const re = /\{[^{}]*\}/g;
        const slice = cleaned.slice(arrAt);
        let m: RegExpExecArray | null;
        while ((m = re.exec(slice)) !== null) {
          const o = tryParse(m[0]);
          if (o && (o.title || o.article_ids)) objs.push(o);
        }
        if (objs.length) return { events: objs as DetectedEvent[] };
      }
    }
    return null;
  }

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

ΚΡΑΤΑ ΟΠΩΣΔΗΠΟΤΕ (είναι πολιτικά γεγονότα, ΟΧΙ αστυνομικό δελτίο): αντιτρομοκρατικές
επιχειρήσεις & συλλήψεις για τρομοκρατία, υποθέσεις με δημόσια-πολιτική ιστορία (π.χ. Marfin),
κρατική/αστυνομική βία, επιχειρήσεις με θεσμική ή κυβερνητική διάσταση, ευθύνες υπουργών/κράτους.
ΕΠΙΣΗΣ ΚΡΑΤΑ ΠΑΝΤΑ — ανθρώπινο κόστος με κρατική ευθύνη/αμέλεια (πρώτης γραμμής πολιτικά):
θάνατοι/τραυματισμοί από αστυνομικά πυρά, σιδηροδρομικά/συγκοινωνιακά δυστυχήματα,
ναυάγια με ευθύνη αρχών, πυρκαγιές/πλημμύρες/φυσικές καταστροφές με κρατική ανεπάρκεια,
καταρρεύσεις/υποδομές, εργατικά δυστυχήματα, θάνατοι κρατουμένων, διακοπές ρεύματος/νερού μεγάλης κλίμακας.

ΚΟΨΕ ΑΠΟΛΥΤΩΣ (ΠΟΤΕ ως γεγονός): περιστατικά με ανηλίκους, εξαφανίσεις/αγνοούμενους,
σεξουαλικά/κακοποίηση, αυτοκτονίες, τροχαία/δυστυχήματα, ατομικά εγκλήματα-τραγωδίες.
Επίσης ΚΟΨΕ: μεμονωμένες ατομικές συλλήψεις/αστυνομικό δελτίο ΧΩΡΙΣ πολιτική-θεσμική διάσταση,
showbiz/lifestyle/celebrities/πορνογραφία/κουτσομπολιό,
αθλητικά, ΞΕΝΕΣ ΕΤΑΙΡΕΙΕΣ (Microsoft, Google, Amazon, Tesla κ.λπ.) & ξένη βιομηχανία/οικονομία χωρίς Ελλάδα, εμπορικά/διαφημιστικά (εκπτώσεις, προσφορές, Black Friday).
Επίσης ΚΟΨΕ: εσωτερική πολιτική ΞΕΝΩΝ χωρών (κυβερνήσεις, πρωθυπουργοί, εκλογές, προϋπολογισμοί,
εξοπλισμοί τρίτων χωρών π.χ. Βρετανία, Γαλλία, Γερμανία, ΗΠΑ) — ΕΚΤΟΣ αν: αφορά Τουρκία/ελληνοτουρκικά,
δεσμεύει την Ελλάδα μέσω αποφάσεων ΕΕ/ΝΑΤΟ, ή αναφέρει ρητά την Ελλάδα.
Αν είναι οριακό ΚΑΙ δεν έχει πολιτική διάσταση, ΚΟΨΕ το. Λίγα και σημαντικά.

Τίτλος: κοφτός, συγκεκριμένος, σαν briefing — ΟΧΙ το όνομα της θεματικής.
Σύνοψη: ΜΙΑ πρόταση με βάση ΜΟΝΟ τους τίτλους. Μην εφευρίσκεις.`;
}

type ExistingEvent = { event_key: string; title: string; topic: string };

function buildUserPrompt(topic: string, articles: ArticleRow[], existing: ExistingEvent[] = []) {
  const lines = articles
    .map((a) => `- [id:${a.id}] (${a.source_name || "—"}) ${a.title}`)
    .join("\n");

  const existingBlock = existing.length
    ? `\nΥΠΑΡΧΟΝΤΑ ΕΝΕΡΓΑ ΓΕΓΟΝΟΤΑ (για συγχώνευση):\n${existing
        .map((e, i) => `- [K${i + 1}] ${e.title}`)
        .join("\n")}\n
ΚΑΝΟΝΑΣ ΣΥΓΧΩΝΕΥΣΗΣ: Αν κάποια άρθρα αφορούν την ΙΔΙΑ ιστορία με υπάρχον γεγονός
(ίδιο περιστατικό/υπόθεση, έστω με άλλη διατύπωση ή νέα εξέλιξη), ΜΗΝ δημιουργήσεις
νέο γεγονός — βάλε "existing_ref": "K<αριθμός>" ώστε τα άρθρα να προστεθούν στο υπάρχον.
ΕΝΑ γεγονός ανά ιστορία. Νέο γεγονός ΜΟΝΟ για πραγματικά νέα ιστορία (existing_ref: null).\n`
    : "";

  return `ΘΕΜΑΤΙΚΗ: ${topic}
${existingBlock}
ΑΡΘΡΑ:
${lines}

Επίστρεψε ΜΟΝΟ έγκυρο JSON, χωρίς markdown, χωρίς \`\`\`:
{ "events": [ { "existing_ref": "K1-ή-null", "title": "...", "summary": "...", "matched_theme": "...", "article_ids": ["id1"] } ] }

Αν ΚΑΝΕΝΑ άρθρο δεν είναι πολιτικά σημαντικό: { "events": [] }`;
}

// Καλεί το AI με ΦΘΗΝΟ μοντέλο· fallback σε Sonnet αν χρειαστεί.
// Επιστρέφει { text } σε επιτυχία, ή { error } σε αποτυχία — ΠΟΤΕ δεν πετάει.
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
        max_tokens: 4000,
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
  // ΟΧΙ στον τίτλο. Έτσι το ίδιο γεγονός παράγει ΙΔΙΟ κλειδί ακόμα κι αν
  // το AI του δώσει διαφορετικό τίτλο, και ακόμα κι αν προστεθούν νέα άρθρα.
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

  // ΣΥΓΧΩΝΕΥΣΗ: φερε τα υπαρχοντα ενεργα γεγονοτα (7 ημερων, ΟΛΩΝ των θεματων —
  // η ιδια ιστορια συχνα μοιραζεται σε 2 θεματα, π.χ. Δικαιοσυνη & Ασφαλεια).
  // Fail-safe: αν αποτυχει το query, existing=[] και η συμπεριφορα μενει ως εχει.
  let existing: ExistingEvent[] = [];
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: exRows } = await supabase
      .from("political_events")
      .select("event_key,title,topic,last_article_at")
      .gte("last_article_at", since7d)
      .order("last_article_at", { ascending: false })
      .limit(40);
    existing = (Array.isArray(exRows) ? exRows : [])
      .filter((r: any) => r?.event_key && r?.title)
      .map((r: any) => ({ event_key: String(r.event_key), title: String(r.title), topic: String(r.topic || topic) }));
  } catch {
    existing = [];
  }

  const { text: raw, error: aiError } = await callAnthropic(
    buildSystemPrompt(themes),
    buildUserPrompt(topic, list, existing)
  );

  if (aiError) return { topic, events: 0, ai_error: aiError, articles_seen: list.length };

  let parsed = raw ? parseAiJson(raw) : null;

  if (!parsed) {
    // Retry μια φορα, ζητωντας αυστηρα ολοκληρωμενο JSON
    const retry = await callAnthropic(
      buildSystemPrompt(themes),
      buildUserPrompt(topic, list, existing) + "\n\nΠΡΟΣΟΧΗ: επεστρεψε ΜΟΝΟ εγκυρο, ΟΛΟΚΛΗΡΩΜΕΝΟ JSON. Χωρις κειμενο πριν/μετα."
    );
    parsed = retry.text ? parseAiJson(retry.text) : null;
  }

  if (!parsed) return { topic, events: 0, ai_error: "ai_returned_unparseable_json", articles_seen: list.length };

  let count = 0;

  for (const ev of parsed.events) {
    const ids = (ev.article_ids || []).filter((id) => validIds.has(id));

    if (ids.length === 0) continue;

    const title = (ev.title || "").trim();

    if (!title) continue;
    if (isSensitiveEvent(title)) continue; // μη-πολιτικα/ευαισθητα: εξαιρουνται

    // Συγχωνευση σε υπαρχον γεγονος: ιδιο event_key/τιτλος/θεμα ωστε το upsert
    // να ΠΡΟΣΘΕΣΕΙ τα αρθρα στο υπαρχον αντι να δημιουργησει παραλλαγη.
    let target: ExistingEvent | null = null;
    const refRaw = String((ev as any).existing_ref || "").trim().toUpperCase();
    const refIdx = /^K(\d+)$/.exec(refRaw);
    if (refIdx) {
      const i = Number(refIdx[1]) - 1;
      if (i >= 0 && i < existing.length) target = existing[i];
    }

    const { error: rpcErr } = await supabase.rpc("upsert_political_event", {
      p_organization_id: null,
      p_topic: target ? target.topic : topic,
      p_event_key: target ? target.event_key : stableEventKey(topic, ids),
      p_title: target ? target.title : title,
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

    // ΦΡΕΝΟ ΚΟΣΤΟΥΣ: καθε χειροκινητη κληση διαβαζει ~60 αρθρα με AI.
    // Επιτρεπεται 1 φορα / 15 λεπτα ανα θεμα. Τα crons (χωρις ?topic=) δεν επηρεαζονται.
    if (requestedTopic && url.searchParams.get("force") !== "1") {
      const g = await checkCostGuard("detect__" + requestedTopic, 15);
      if (!g.allowed) {
        return NextResponse.json(guardMessage("Ανίχνευση γεγονότων: " + requestedTopic, g), { status: 429 });
      }
    }

    const themes = await loadActiveThemes(supabase);

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
        ai_ok: !r.ai_error,
      });
    }

    const startedAt = Date.now();
    const BUDGET_MS = 120000;

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
