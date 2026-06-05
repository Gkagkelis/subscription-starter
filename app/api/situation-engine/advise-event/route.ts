import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  buildNorayaStrategicSystemPrompt,
  buildNorayaStrategicJsonInstruction,
  createFallbackStrategicBrief,
} from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro: μέχρι 5 λεπτά. Η πλήρης ανάλυση 7 σταδίων θέλει χρόνο.

// ============================================================
// NORAYA — Per-Event Advisor Brief (ΜΙΑ ανάλυση ανά κλήση)
//
// Παίρνει ΕΝΑ γεγονός, διαβάζει τα άρθρα-στοιχεία του, και παράγει την ΠΛΗΡΗ
// ανάλυση συμβούλου (v1: 7 στάδια) με τον εγκέφαλο του Noraya.
// Την αποθηκεύει στο political_events.advisor_brief (+ flat πεδία).
//
// ΜΙΑ τη φορά -> ποτέ timeout. Ένα cron το χτυπάει τακτικά (βλ. vercel.json):
//   GET χωρίς παράμετρο  -> επόμενο γεγονός που χρειάζεται ανάλυση
//   αν δεν εκκρεμεί κανένα -> δεν καλεί AI (μηδέν κόστος)
//   ?event_id=...        -> ανάλυση συγκεκριμένου γεγονότος (χειροκίνητο)
// ============================================================

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function parseAiJson(raw: string): any | null {
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
  return parsed || null;
}

function buildEventContext(ev: any) {
  const articles = Array.isArray(ev.evidence_articles) ? ev.evidence_articles : [];
  const lines = articles
    .slice(0, 12)
    .map((a: any) => `- (${a.source || "—"}) ${a.title || ""}`)
    .join("\n");

  return `
ΠΟΛΙΤΙΚΟ ΓΕΓΟΝΟΣ ΠΡΟΣ ΑΝΑΛΥΣΗ

Θεματική: ${ev.topic || "—"}
Γεγονός: ${ev.title || "—"}
Σύνοψη: ${ev.summary || "—"}
Κατάσταση: ${ev.status || "—"}
Βαθμός τεκμηρίωσης: ${ev.documentation_level || "initial"}
Αριθμός άρθρων: ${ev.article_count ?? 0} από ${ev.source_count ?? 0} πηγές

ΣΤΟΙΧΕΙΑ (τίτλοι άρθρων):
${lines || "—"}

Ανάλυσε ΑΥΤΟ το συγκεκριμένο γεγονός (όχι γενικά τη θεματική).
Χρησιμοποίησε ΜΟΝΟ τα παραπάνω στοιχεία. Μην εφευρίσκεις γεγονότα ή ποσοστά.
`;
}

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
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system,
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

async function handle(request: Request) {
  try {
    const supabase = svc();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("event_id");

    // 1) Διάλεξε γεγονός
    let eventId = requestedId;
    if (!eventId) {
      const { data: next } = await supabase.rpc("pick_next_event_for_brief");
      eventId = (next as string) || null;
    }

    if (!eventId) {
      return NextResponse.json({
        ok: true,
        processed: null,
        message: "Δεν εκκρεμεί κανένα γεγονός για ανάλυση.",
      });
    }

    // 2) Φόρτωσε το γεγονός + τα άρθρα-στοιχεία του
    const { data: ev, error: evErr } = await supabase
      .from("v_political_events_live")
      .select("*")
      .eq("id", eventId)
      .single();

    if (evErr || !ev) {
      return NextResponse.json(
        { ok: false, error: evErr?.message || "Event not found" },
        { status: 404 }
      );
    }

    // 3) Παρήγαγε το brief (AI -> v1 schema, με fallback)
    const system = buildNorayaStrategicSystemPrompt() + "\n" + buildNorayaStrategicJsonInstruction();
    const userPrompt = buildEventContext(ev);
    const ai = await callAnthropic(system, userPrompt);
    const parsed = ai.text ? parseAiJson(ai.text) : null;

    const brief =
      parsed && parsed.issue
        ? parsed
        : createFallbackStrategicBrief({
            profile: null,
            topic: ev.title || ev.topic || "Πολιτικό γεγονός",
          });

    const usedFallback = !(parsed && parsed.issue);

    // 4) Flat πεδία (για inspector/λίστα) από το v1
    const framing =
      brief?.strategic_diagnosis?.framing_diagnosis ||
      brief?.issue?.dominant_frame ||
      ev.summary ||
      null;
    const recommended =
      brief?.daily_brief?.immediate_recommendation ||
      brief?.strategic_diagnosis?.recommended_posture_explanation ||
      null;
    const avoid = brief?.daily_brief?.avoid_today || null;
    const redTeam =
      brief?.strategic_diagnosis?.strategic_risk ||
      brief?.issue?.political_risk ||
      null;
    const summary = brief?.daily_brief?.what_is_happening || ev.summary || null;

    // 5) Γράψε στο γεγονός
    const { error: upErr } = await supabase
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

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    await supabase.rpc("mark_event_briefed", { p_event_id: eventId });

    const { data: more } = await supabase.rpc("pick_next_event_for_brief");

    return NextResponse.json({
      ok: true,
      processed: {
        event_id: eventId,
        title: ev.title,
        topic: ev.topic,
        method: usedFallback ? "fallback" : "ai",
      },
      ai_status: ai.status,
      ai_error: ai.error,
      parsed_ok: !!(parsed && parsed.issue),
      remaining_event: (more as string) || null,
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
