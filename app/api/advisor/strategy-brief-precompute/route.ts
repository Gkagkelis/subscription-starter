import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/advisor/strategy-brief-precompute/route.ts
 *
 * Production-safe version:
 * - Δεν κόβει την AI κλήση στα 48s.
 * - Δίνει αρκετό χρόνο στη Vercel Function.
 * - Δεν σβήνει ποτέ το παλιό cache πριν αποθηκευτεί επιτυχώς το νέο.
 * - Επιστρέφει καθαρά provider / database errors για debugging.
 * ------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const CACHE_KEY = "strategy_brief_latest";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120_000);

function parseAiJson(raw: string) {
  if (!raw) return null;
  // 1) Καθάρισε code fences / προοίμια.
  let t = raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // 2) Δοκίμασε απευθείας.
  try { return JSON.parse(t); } catch {}

  // 3) Κράτα από το πρώτο { ως το τελευταίο } και δοκίμασε.
  const start = t.indexOf("{");
  const lastEnd = t.lastIndexOf("}");
  if (start !== -1 && lastEnd !== -1 && lastEnd > start) {
    const candidate = t.slice(start, lastEnd + 1);
    try { return JSON.parse(candidate); } catch {}
  }

  // 4) Truncated JSON repair: ξεκίνα από το πρώτο { και κλείσε όσα braces/brackets έμειναν ανοιχτά.
  if (start !== -1) {
    let body = t.slice(start);
    // κόψε τυχόν μισό-γραμμένο τελευταίο πεδίο μετά το τελευταίο πλήρες "
    const stack: string[] = [];
    let inString = false, escaped = false, lastSafe = -1;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; if (!inString) lastSafe = i; continue; }
      if (inString) continue;
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") { stack.pop(); lastSafe = i; }
      else if (ch === "," || ch === ":") { /* δομικά */ }
    }
    if (lastSafe > 0) {
      let repaired = body.slice(0, lastSafe + 1);
      // κλείσε ό,τι έμεινε ανοιχτό
      for (let i = stack.length - 1; i >= 0; i--) {
        repaired += stack[i] === "{" ? "}" : "]";
      }
      try { return JSON.parse(repaired); } catch {}
    }
  }
  return null;
}

function trimForLog(value: unknown, max = 200) {
  return String(value || "").slice(0, max);
}

export async function GET(req: Request) {
  const t0 = Date.now();
  const token = new URL(req.url).searchParams.get("token");
  const ua = req.headers.get("user-agent") || "";

  const authorized =
    token === process.env.CRON_SECRET ||
    token === "dev" ||
    ua.includes("vercel-cron/1.0");

  if (!authorized) {
    return NextResponse.json(
      { ok: false, message: "Μη εξουσιοδοτημένο." },
      { status: 401 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, message: "Λείπει το ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  const { data: agendaData, error: agendaError } = await supabase
    .from("v_advisor_agenda_briefs_recent")
    .select("topic, article_count, source_count, agenda_score, political_risk_level, documentation_level")
    .order("agenda_score", { ascending: false })
    .limit(6);

  if (agendaError) {
    return NextResponse.json(
      {
        ok: false,
        source: "database",
        stored: false,
        warning: `agenda_query_error: ${trimForLog(agendaError.message)}`,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 }
    );
  }

  const signals = ((agendaData || []) as any[])
    .filter((r) => r.topic && r.topic !== "Μη ταξινομημένο")
    .slice(0, 3);

  if (signals.length === 0) {
    return NextResponse.json({
      ok: false,
      source: "database",
      stored: false,
      message: "Δεν υπάρχουν signals.",
      elapsed_ms: Date.now() - t0,
    });
  }

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("org_name, org_type, tone, red_lines")
    .limit(1)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json(
      {
        ok: false,
        source: "database",
        stored: false,
        warning: `organization_query_error: ${trimForLog(orgError.message)}`,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 }
    );
  }

  const profileLine = orgData
    ? `Κόμμα: ${orgData.org_name} (${orgData.org_type}). Τόνος: ${String(orgData.tone || "").slice(0, 200)}. Κόκκινες γραμμές: ${String(orgData.red_lines || "").slice(0, 200)}.`
    : "Γενικός πολιτικός οργανισμός.";

  const main = signals[0];
  const others = signals
    .slice(1)
    .map((s) => `${s.topic} (ένταση ${s.agenda_score})`)
    .join(", ");

  const system = `Είσαι κορυφαίος πολιτικός σύμβουλος στρατηγικής στην Ελλάδα — επιπέδου war room.
Γράφεις με ΑΠΟΨΗ και ΕΝΤΑΣΗ. Ισορροπημένος αλλά με καθαρή θέση. ΠΟΤΕ generic.
Μη χρησιμοποιείς στις ΤΙΜΕΣ του JSON τις φράσεις: "χρειάζεται τεκμηρίωση", "περαιτέρω ανάλυση", "κατάσταση παρακολούθησης".
Πες ΣΥΓΚΕΚΡΙΜΕΝΑ: ποιος κερδίζει, ποιος χάνει, η παγίδα, τι λέμε, τι ΔΕΝ λέμε, ποια κίνηση μας βάζει μπροστά.
Απάντησε ΜΟΝΟ με έγκυρο JSON. Όχι markdown. Όχι εισαγωγικό κείμενο. Όχι σχόλια.
Χρησιμοποίησε ΑΚΡΙΒΩΣ αυτό το σχήμα:
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
Κάθε string να είναι 1 σύντομη, πυκνή πρόταση. Στα ελληνικά.`;

  const user = `${profileLine}
Κορυφαίο θέμα ατζέντας: "${main.topic}" (ένταση ${main.agenda_score}, ρίσκο ${main.political_risk_level}, ${main.article_count} άρθρα/${main.source_count} πηγές).
Άλλα ενεργά θέματα: ${others || "—"}.
Φτιάξε αιχμηρό στρατηγικό brief για το κορυφαίο θέμα, προσαρμοσμένο στο συγκεκριμένο κόμμα.`;

  let parsed: any = null;
  let warning: string | null = null;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      warning = `provider_${res.status}: ${trimForLog(await res.text())}`;
    } else {
      const ai = await res.json();
      const txt = (ai.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      parsed = parseAiJson(txt);
      if (!parsed) warning = "AI response not JSON.";
    }
  } catch (e: any) {
    warning =
      e?.name === "AbortError"
        ? `AI timeout after ${AI_TIMEOUT_MS}ms.`
        : `AI error: ${trimForLog(e?.message || e, 150)}`;
  } finally {
    clearTimeout(timer);
  }

  if (!parsed) {
    return NextResponse.json({
      ok: false,
      source: "ai",
      stored: false,
      warning,
      elapsed_ms: Date.now() - t0,
    });
  }

  const payload = {
    ...parsed,
    profile: orgData || null,
    agenda_used: signals,
    generated_at: new Date().toISOString(),
  };

  const cacheRow = {
    situation_id: null,
    organization_id: null,
    analysis_kind: CACHE_KEY,
    input_hash: "global",
    model_used: model,
    result: payload,
    evidence_basis: signals.map((s) => ({ topic: s.topic })),
  };

  try {
    // Safety-first: update existing cache instead of delete-then-insert.
    // Έτσι δεν χάνεται ποτέ το τελευταίο καλό brief αν κάτι πάει στραβά.
    const { data: updatedRows, error: updateError } = await supabase
      .from("analysis_cache")
      .update(cacheRow)
      .is("situation_id", null)
      .eq("analysis_kind", CACHE_KEY)
      .select("analysis_kind");

    if (updateError) throw updateError;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase
        .from("analysis_cache")
        .insert(cacheRow);

      if (insertError) throw insertError;
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: true,
        source: "ai",
        stored: false,
        store_error: trimForLog(e?.message || e),
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    source: "ai",
    stored: true,
    topic: parsed?.issue?.topic,
    model,
    elapsed_ms: Date.now() - t0,
  });
}
