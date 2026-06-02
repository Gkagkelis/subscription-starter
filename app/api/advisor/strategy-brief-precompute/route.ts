import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildNorayaStrategicSystemPrompt,
  buildNorayaStrategicJsonInstruction,
} from "@/lib/noraya/strategic-reasoning";

/* ---------------------------------------------------------------------------
 * app/api/advisor/strategy-brief-precompute/route.ts
 *
 * ΛΥΣΗ ΣΤΟ TIMEOUT:
 * Το live strategy-brief σκάει στο Vercel timeout. Αυτό το endpoint τρέχει το
 * AI με token=dev (ΧΩΡΙΣ auth, με maxDuration 60) και ΑΠΟΘΗΚΕΥΕΙ το έτοιμο brief
 * στο analysis_cache. Μετά, η σελίδα διαβάζει το αποθηκευμένο ΑΚΑΡΙΑΙΑ.
 *
 * ΧΡΗΣΗ:
 *   GET /api/advisor/strategy-brief-precompute?token=dev
 *   -> τρέχει AI, αποθηκεύει, επιστρέφει {ok, source:'ai'|'fallback', stored}
 *
 * Το ξανατρέχεις όποτε θες φρέσκια ανάλυση (π.χ. μετά από νέο ingest).
 * ------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_KEY = "strategy_brief_latest"; // analysis_kind για το global brief

function cleanText(value: unknown, maxLength = 1000) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function safeJson(value: unknown, maxLength = 1200) {
  try { return JSON.stringify(value ?? null).slice(0, maxLength); } catch { return "null"; }
}
function parseAiJson(raw: string) {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

export async function GET(req: Request) {
  const _t0 = Date.now();
  const token = new URL(req.url).searchParams.get("token");
  const userAgent = req.headers.get("user-agent") || "";
  const isVercelCron = userAgent.includes("vercel-cron/1.0");
  const authorized = token === process.env.CRON_SECRET || token === "dev" || isVercelCron;
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ ok: false, message: "Λείπει το ANTHROPIC_API_KEY." }, { status: 503 });
  }

  // 1) Φόρτωσε τα top agenda signals.
  const { data: agendaData, error: agendaError } = await supabase
    .from("v_advisor_agenda_briefs_recent")
    .select("topic, article_count, source_count, political_articles, agenda_score, documentation_level, political_risk_level, framing_summary, recommended_action, avoid_action, top_sources, top_evidence_articles, evidence_summary")
    .order("agenda_score", { ascending: false })
    .limit(8);

  if (agendaError) {
    return NextResponse.json({ ok: false, message: "Αποτυχία φόρτωσης ατζέντας.", detail: agendaError.message }, { status: 500 });
  }

  const signals = ((agendaData || []) as any[])
    .filter((r) => r.topic && r.topic !== "Μη ταξινομημένο")
    .slice(0, 3); // λιγότερα signals = ταχύτερο

  if (signals.length === 0) {
    return NextResponse.json({ ok: false, message: "Δεν υπάρχουν ταξινομημένα signals." }, { status: 200 });
  }

  // 2) Πάρε ένα profile (πρώτο διαθέσιμο org) για context.
  const { data: orgData } = await supabase.from("organizations").select("*").limit(1).maybeSingle();
  const profile = orgData || null;

  // 3) Φτιάξε ελαφρύ context.
  const agendaContext = signals.map((row, i) => `
ΣΗΜΑ ${i + 1}
Θέμα: ${row.topic}
Ένταση: ${row.agenda_score ?? "?"} | Ρίσκο: ${row.political_risk_level || "?"} | Τεκμηρίωση: ${row.documentation_level || "?"}
Άρθρα: ${row.article_count || 0} | Πηγές: ${row.source_count || 0}
Framing: ${cleanText(row.framing_summary, 400)}
Άρθρα-στοιχεία: ${safeJson(row.top_evidence_articles, 350)}
`).join("\n---\n");

  const profileContext = profile ? `
ΠΡΟΦΙΛ: ${profile.org_name || "Οργανισμός"} (${profile.org_type || ""})
Τόνος: ${cleanText(profile.tone, 400)}
Κόκκινες γραμμές: ${cleanText(profile.red_lines, 400)}
Θέματα: ${safeJson(profile.themes, 400)}
` : "ΠΡΟΦΙΛ: γενικός πολιτικός οργανισμός.";

  const systemPrompt = `${buildNorayaStrategicSystemPrompt()}

ΥΦΟΣ — ΚΡΙΣΙΜΟ:
Γράψε σαν κορυφαίος πολιτικός σύμβουλος σε war room. Κάθε πρόταση με ΑΠΟΨΗ και ΕΝΤΑΣΗ.
ΑΠΑΓΟΡΕΥΟΝΤΑΙ κλισέ: "χρειάζεται τεκμηρίωση", "χρειάζεται περαιτέρω ανάλυση", "κατάσταση παρακολούθησης", "institutional".
Πες ΣΥΓΚΕΚΡΙΜΕΝΑ: ποιος κερδίζει/χάνει, ποια η παγίδα, τι λέμε, τι ΔΕΝ λέμε, ποια κίνηση μας βάζει μπροστά.
Κάθε πεδίο 1-3 πυκνές, κοφτές προτάσεις. Ισορροπημένος αλλά με καθαρή θέση.

${buildNorayaStrategicJsonInstruction()}`;

  const userPrompt = `${profileContext}

ΤΡΕΧΟΝΤΑ AGENDA SIGNALS
${agendaContext}

ΑΠΟΣΤΟΛΗ
Διάλεξε το σημαντικότερο θέμα ως κύριο issue (ποτέ "Μη ταξινομημένο").
Δώσε πλήρες Noraya Strategic Brief: daily_brief, strategic_diagnosis, scenarios (3), message_package, action_plan, monitoring_plan, evidence.
Κάνε το ΑΙΧΜΗΡΟ και ΣΥΓΚΕΚΡΙΜΕΝΟ για το συγκεκριμένο κόμμα.`;

  // 4) Κάλεσε AI (έχουμε χρόνο εδώ — maxDuration 60).
  let parsed: any = null;
  let aiOk = false;
  let warning: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 2800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      warning = `provider_${response.status}: ${(await response.text()).slice(0, 200)}`;
    } else {
      const ai = await response.json();
      const rawText = (ai.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      parsed = parseAiJson(rawText);
      if (parsed) aiOk = true;
      else warning = "AI response not valid JSON.";
    }
  } catch (err: any) {
    warning = err?.name === "AbortError" ? "AI timeout (precompute)." : `AI error: ${String(err?.message || err).slice(0, 150)}`;
  }

  if (!aiOk) {
    return NextResponse.json({ ok: false, source: "fallback", stored: false, warning, elapsed_ms: Date.now() - _t0 });
  }

  // 5) Αποθήκευσε στο analysis_cache (global, situation_id null).
  const briefPayload = { ...parsed, profile, agenda_used: signals, generated_at: new Date().toISOString() };
  try {
    // Σβήσε παλιό global brief και βάλε νέο.
    await supabase.from("analysis_cache").delete().is("situation_id", null).eq("analysis_kind", CACHE_KEY);
    const { error: insErr } = await supabase.from("analysis_cache").insert({
      situation_id: null,
      organization_id: profile?.id ?? null,
      analysis_kind: CACHE_KEY,
      input_hash: "global",
      model_used: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      result: briefPayload,
      evidence_basis: signals.map((s) => ({ topic: s.topic })),
    });
    if (insErr) throw insErr;
  } catch (err: any) {
    return NextResponse.json({ ok: true, source: "ai", stored: false, store_error: String(err?.message || err).slice(0, 200), preview: parsed?.issue?.topic });
  }

  return NextResponse.json({ ok: true, source: "ai", stored: true, topic: parsed?.issue?.topic || parsed?.daily_brief?.headline, elapsed_ms: Date.now() - _t0 });
}
