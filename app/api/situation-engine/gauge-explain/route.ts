import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}
function norm(x: unknown): string {
  return String(x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-zα-ω]+/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

async function readCache(supabase: ReturnType<typeof svc>, key: string): Promise<any | null> {
  try {
    const { data } = await supabase
      .from("analysis_cache")
      .select("result")
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .limit(1);
    if (!Array.isArray(data) || !data[0]) return null;
    const result = (data[0] as any).result;
    const t = result?.generated_at ? new Date(result.generated_at).getTime() : 0;
    if (t && Date.now() - t > TTL_MS) return null;
    return result?.body || null;
  } catch {
    return null;
  }
}
async function writeCache(supabase: ReturnType<typeof svc>, key: string, body: any) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: key,
    input_hash: "v1",
    model_used: MODEL,
    result: { body, generated_at: new Date().toISOString() },
  };
  try {
    const { data: upd } = await supabase
      .from("analysis_cache")
      .update(row)
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .select("analysis_kind");
    if (!upd || upd.length === 0) await supabase.from("analysis_cache").insert(row);
  } catch {
    // best-effort
  }
}

async function callClaude(prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API error " + resp.status);
  const data = await resp.json();
  return (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const metricLabel = String(b?.metric_label || "μετρική");
    const metricValue = Number(b?.metric_value) || 0;
    const eventTitle = String(b?.event_title || "");
    const theme = String(b?.theme || "");
    const allGauges = Array.isArray(b?.all_gauges) ? b.all_gauges : [];
    const eventId = String(b?.event_id || norm(eventTitle));

    const key = "gauge_explain_v1__" + eventId + "__" + norm(metricLabel);
    const supabase = svc();

    const cached = await readCache(supabase, key);
    if (cached?.explanation) return json({ ok: true, explanation: cached.explanation, source: "cache" });

    const ctx = allGauges.length
      ? allGauges.map((g: any) => `${g.label}: ${Math.round(Number(g.value) || 0)}`).join(", ")
      : "";

    const prompt = `Είσαι αναλυτής πολιτικής επικοινωνίας. Εξήγησε ΣΥΝΤΟΜΑ και ΚΑΘΑΡΑ τι σημαίνει η μετρική «${metricLabel}» με τιμή ${metricValue}/100 για το συγκεκριμένο γεγονός. Περιγραφικά — ΟΧΙ στρατηγική/κινήσεις.

ΓΕΓΟΝΟΣ: ${eventTitle}${theme ? ` (θέμα: ${theme})` : ""}
${ctx ? "ΟΛΕΣ ΟΙ ΜΕΤΡΙΚΕΣ (συμφραζόμενα): " + ctx : ""}

Γράψε 2-3 προτάσεις: τι μετράει αυτή η μετρική, τι σημαίνει η τιμή ${metricValue} εδώ (υψηλή/μεσαία/χαμηλή και γιατί), και τι δείχνει για τη δυναμική του γεγονότος. Ελληνικά, πυκνά, χωρίς markdown. Επέστρεψε ΜΟΝΟ το κείμενο της εξήγησης, τίποτα άλλο.`;

    let explanation = "";
    try {
      explanation = (await callClaude(prompt)).replace(/^```.*$/gm, "").trim();
    } catch {
      explanation = "";
    }
    if (!explanation) {
      explanation = `Η μετρική «${metricLabel}» βρίσκεται στο ${metricValue}/100 για αυτό το γεγονός.`;
    } else {
      await writeCache(supabase, key, { explanation });
    }

    return json({ ok: true, explanation, source: "generated" });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
