import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  buildNorayaStrategicSystemPrompt,
  buildNorayaStrategicJsonInstruction,
} from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Per-Event Advisor Brief (η ΤΕΛΙΚΗ ανάλυση = SONNET)
//
// Ένα τρέξιμο αναλύει ΜΕΧΡΙ 8 ΣΗΜΑΝΤΙΚΑ γεγονότα (loop + time-budget),
// ώστε να καλείται ΛΙΓΕΣ φορές τη μέρα (βλ. vercel.json).
//
// PROMPT CACHING: το μεγάλο system prompt γίνεται cache -> δραστική μείωση
// input-token κόστους στις επαναλήψεις.
//
// Αν πέσει το AI (π.χ. χωρίς credits) ΔΕΝ αποθηκεύει placeholder — σταματά,
// ώστε όταν επανέλθει το AI να γράψει κανονική ανάλυση.
// ============================================================

const ANALYSIS_MODEL = "claude-sonnet-4-6";
const MAX_EVENTS_PER_RUN = 8;
const BUDGET_MS = 220000;

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  // Ξετύλιγμα markdown code fences: ```json ... ``` ή ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(s);
  if (!parsed) {
    const match = s.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParse(match[0]);
  }
  return parsed || null;
}

function buildEventContext(ev: any) {
  const articles = Array.isArray(ev.evidence_articles) ? ev.evidence_articles : [];
  const lines = articles
    .slice(0, 12)
    .map((a: any) => `- (${a.source || "—"}) ${a.title || ""}`)
    .join("\n");
  return `ΠΟΛΙΤΙΚΟ ΓΕΓΟΝΟΣ ΠΡΟΣ ΑΝΑΛΥΣΗ

Θεματική: ${ev.topic || "—"}
Γεγονός: ${ev.title || "—"}
Σύνοψη: ${ev.summary || "—"}
Κατάσταση: ${ev.status || "—"}
Βαθμός τεκμηρίωσης: ${ev.documentation_level || "initial"}
Άρθρα: ${ev.article_count ?? 0} από ${ev.source_count ?? 0} πηγές

ΣΤΟΙΧΕΙΑ (τίτλοι):
${lines || "—"}

Ανάλυσε ΑΥΤΟ το συγκεκριμένο γεγονός (όχι γενικά τη θεματική).
Χρησιμοποίησε ΜΟΝΟ τα παραπάνω στοιχεία. Μην εφευρίσκεις γεγονότα ή ποσοστά.

ΣΗΜΑΝΤΙΚΟ ΓΙΑ ΤΗ ΜΟΡΦΗ:
- Επίστρεψε ΣΥΜΠΑΓΕΣ JSON, ΧΩΡΙΣ markdown, ΧΩΡΙΣ \`\`\` code fences, ΧΩΡΙΣ σχόλια.
- Κράτα κάθε πεδίο κειμένου ΣΥΝΤΟΜΟ (1-2 προτάσεις) ώστε να ολοκληρώνεται η απάντηση.`;
}

// Sonnet + prompt caching στο σταθερό system prompt.
async function callAnthropic(
  system: string,
  user: string
): Promise<{ text: string | null; status: number | null; error: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, status: null, error: "MISSING ANTHROPIC_API_KEY" };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: 6000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (e: any) {
    return { text: null, status: null, error: "FETCH_THREW: " + String(e?.message || e) };
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    return { text: null, status: res.status, error: (body || "").slice(0, 300) };
  }

  const data = await res.json();
  const text = (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return { text: text || null, status: res.status, error: text ? null : "EMPTY_AI_TEXT" };
}

// Επιστρέφει: 'ai' (γράφτηκε), 'none' (δεν εκκρεμεί), 'ai_down' (πέσε το AI)
async function processOneEvent(
  supabase: ReturnType<typeof svc>,
  system: string,
  eventId: string
): Promise<{ status: "ai" | "ai_down"; title?: string; ai_error?: string | null }> {
  const { data: ev } = await supabase
    .from("v_political_events_live")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!ev) return { status: "ai_down", ai_error: "event_not_found" };

  const ai = await callAnthropic(system, buildEventContext(ev));
  const parsed = ai.text ? parseAiJson(ai.text) : null;

  // Αν δεν βγήκε κανονικό brief -> ΜΗΝ αποθηκεύσεις placeholder. Σταμάτα.
  if (!(parsed && parsed.issue)) {
    const diag =
      ai.error ||
      (ai.text ? "UNPARSEABLE_AI_TEXT: " + ai.text.slice(0, 220) : "NO_AI_TEXT");
    return { status: "ai_down", title: ev.title, ai_error: diag };
  }

  const brief = parsed;
  const framing =
    brief?.strategic_diagnosis?.framing_diagnosis || brief?.issue?.dominant_frame || ev.summary || null;
  const recommended =
    brief?.daily_brief?.immediate_recommendation ||
    brief?.strategic_diagnosis?.recommended_posture_explanation ||
    null;
  const avoid = brief?.daily_brief?.avoid_today || null;
  const redTeam = brief?.strategic_diagnosis?.strategic_risk || brief?.issue?.political_risk || null;
  const summary = brief?.daily_brief?.what_is_happening || ev.summary || null;

  await supabase
    .from("political_events")
    .update({
      advisor_brief: brief,
      framing_summary: framing,
      recommended_action: recommended,
      avoid_action: avoid,
      red_team_warning: redTeam,
      summary,
      brief_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  await supabase.rpc("mark_event_briefed", { p_event_id: eventId });
  return { status: "ai", title: ev.title };
}

async function handle(request: Request) {
  try {
    const supabase = svc();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("event_id");

    const system =
      buildNorayaStrategicSystemPrompt() + "\n" + buildNorayaStrategicJsonInstruction();

    // Χειροκίνητο: ένα συγκεκριμένο γεγονός
    if (requestedId) {
      const r = await processOneEvent(supabase, system, requestedId);
      return NextResponse.json({ ok: true, mode: "single", processed: r });
    }

    // Αυτόματο: ανάλυσε μέχρι MAX_EVENTS_PER_RUN σημαντικά γεγονότα
    const startedAt = Date.now();
    const done: Array<{ title?: string }> = [];
    let aiError: string | null = null;
    let count = 0;

    while (count < MAX_EVENTS_PER_RUN && Date.now() - startedAt < BUDGET_MS) {
      const { data: nextId } = await supabase.rpc("pick_next_event_for_brief");
      const eventId = (nextId as string) || null;
      if (!eventId) break;

      const r = await processOneEvent(supabase, system, eventId);
      if (r.status === "ai_down") {
        // Το AI δεν δουλεύει (π.χ. χωρίς credits) -> σταμάτα, μην κάψεις/μην γράψεις placeholder
        aiError = r.ai_error || "ai_down";
        break;
      }
      done.push({ title: r.title });
      count += 1;
    }

    const { data: more } = await supabase.rpc("pick_next_event_for_brief");

    return NextResponse.json({
      ok: true,
      mode: "batch",
      analyzed: done.length,
      ai_error: aiError,
      remaining_event: (more as string) || null,
      detail: done,
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
