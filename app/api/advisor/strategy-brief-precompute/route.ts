import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/advisor/strategy-brief-precompute/route.ts  (LITE — γρήγορο, σίγουρο)
 *
 * Αντί για ένα τεράστιο brief που θέλει >60s, ζητάμε ΜΙΑ κοφτή, δυνατή ανάλυση
 * του κορυφαίου θέματος. Τελειώνει σε ~15-25s. Αποθηκεύεται στο analysis_cache
 * και το UI τη διαβάζει ακαριαία.
 * ------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_KEY = "strategy_brief_latest";

function parseAiJson(raw: string) {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

export async function GET(req: Request) {
  const t0 = Date.now();
  const token = new URL(req.url).searchParams.get("token");
  const ua = req.headers.get("user-agent") || "";
  const ok = token === process.env.CRON_SECRET || token === "dev" || ua.includes("vercel-cron/1.0");
  if (!ok) return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return NextResponse.json({ ok: false, message: "Λείπει το ANTHROPIC_API_KEY." }, { status: 503 });

  // Top signals (μόνο 3, μόνο τα ουσιώδη πεδία).
  const { data: agendaData } = await supabase
    .from("v_advisor_agenda_briefs_recent")
    .select("topic, article_count, source_count, agenda_score, political_risk_level, documentation_level")
    .order("agenda_score", { ascending: false })
    .limit(6);

  const signals = ((agendaData || []) as any[])
    .filter((r) => r.topic && r.topic !== "Μη ταξινομημένο")
    .slice(0, 3);
  if (signals.length === 0) return NextResponse.json({ ok: false, message: "Δεν υπάρχουν signals." });

  const { data: orgData } = await supabase.from("organizations").select("org_name, org_type, tone, red_lines").limit(1).maybeSingle();
  const profileLine = orgData
    ? `Κόμμα: ${orgData.org_name} (${orgData.org_type}). Τόνος: ${String(orgData.tone || "").slice(0,200)}. Κόκκινες γραμμές: ${String(orgData.red_lines || "").slice(0,200)}.`
    : "Γενικός πολιτικός οργανισμός.";

  const main = signals[0];
  const others = signals.slice(1).map((s) => `${s.topic} (ένταση ${s.agenda_score})`).join(", ");

  const system = `Είσαι ο κορυφαίος πολιτικός σύμβουλος στρατηγικής στην Ελλάδα — επιπέδου war room.
Γράφεις με ΑΠΟΨΗ και ΕΝΤΑΣΗ. Ισορροπημένος αλλά με καθαρή θέση. ΠΟΤΕ generic.
ΑΠΑΓΟΡΕΥΟΝΤΑΙ: "χρειάζεται τεκμηρίωση", "περαιτέρω ανάλυση", "κατάσταση παρακολούθησης", "institutional".
Πες ΣΥΓΚΕΚΡΙΜΕΝΑ: ποιος κερδίζει, ποιος χάνει, η παγίδα, τι λέμε, τι ΔΕΝ λέμε, ποια κίνηση μας βάζει μπροστά.
Απάντησε ΜΟΝΟ με έγκυρο JSON (όχι markdown) σε αυτό ΑΚΡΙΒΩΣ το σχήμα:
{
 "issue": {"topic": string, "plain_title": string, "urgency": "watch|act|monitor", "dominant_frame": string, "opportunity": string, "political_risk": string},
 "daily_brief": {"headline": string, "what_is_happening": string, "why_it_matters_now": string, "immediate_recommendation": string, "avoid_today": string},
 "strategic_diagnosis": {"agenda_reading": string, "framing_diagnosis": string, "strategic_opportunity": string, "strategic_risk": string, "recommended_posture": string},
 "scenarios": [
   {"name": string, "move": string, "likely_gain": string, "likely_risk": string, "recommendation": "prefer"},
   {"name": string, "move": string, "likely_gain": string, "likely_risk": string, "recommendation": "avoid"},
   {"name": string, "move": string, "likely_gain": string, "likely_risk": string, "recommendation": "acceptable"}
 ],
 "message_package": {"central_line": string, "institutional_version": string, "sharp_version": string, "social_post": string, "answer_if_attacked": string},
 "action_plan": {"now": [string, string], "next_24h": [string, string]},
 "evidence": {"basis": string, "uncertainty": string}
}
Κάθε πεδίο 1-2 πυκνές, αιχμηρές προτάσεις. Στα ελληνικά.`;

  const user = `${profileLine}
Κορυφαίο θέμα ατζέντας: "${main.topic}" (ένταση ${main.agenda_score}, ρίσκο ${main.political_risk_level}, ${main.article_count} άρθρα/${main.source_count} πηγές).
Άλλα ενεργά θέματα: ${others || "—"}.
Φτιάξε αιχμηρό στρατηγικό brief για το κορυφαίο θέμα, προσαρμοσμένο στο συγκεκριμένο κόμμα.`;

  let parsed: any = null;
  let warning: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 48000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) { warning = `provider_${res.status}: ${(await res.text()).slice(0,200)}`; }
    else {
      const ai = await res.json();
      const txt = (ai.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      parsed = parseAiJson(txt);
      if (!parsed) warning = "AI response not JSON.";
    }
  } catch (e: any) {
    warning = e?.name === "AbortError" ? "AI timeout (precompute)." : `AI error: ${String(e?.message || e).slice(0,150)}`;
  }

  if (!parsed) return NextResponse.json({ ok: false, source: "fallback", stored: false, warning, elapsed_ms: Date.now() - t0 });

  const payload = { ...parsed, profile: orgData || null, agenda_used: signals, generated_at: new Date().toISOString() };
  try {
    await supabase.from("analysis_cache").delete().is("situation_id", null).eq("analysis_kind", CACHE_KEY);
    const { error } = await supabase.from("analysis_cache").insert({
      situation_id: null,
      organization_id: null,
      analysis_kind: CACHE_KEY,
      input_hash: "global",
      model_used: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      result: payload,
      evidence_basis: signals.map((s) => ({ topic: s.topic })),
    });
    if (error) throw error;
  } catch (e: any) {
    return NextResponse.json({ ok: true, source: "ai", stored: false, store_error: String(e?.message || e).slice(0,200), elapsed_ms: Date.now() - t0 });
  }

  return NextResponse.json({ ok: true, source: "ai", stored: true, topic: parsed?.issue?.topic, elapsed_ms: Date.now() - t0 });
}
