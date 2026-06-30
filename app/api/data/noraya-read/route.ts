import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const TTL_MS = 6 * 60 * 60 * 1000;

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}
function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ς/g, "σ").replace(/\s+/g, "_").trim();
}
function cacheKey(topicKey: string | null, topicLabel: string): string {
  return "noraya_read_v1__" + (topicKey || norm(topicLabel));
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
    const genIso = result?.generated_at || result?.body?.generated_at || null;
    const updatedAt = genIso ? new Date(genIso).getTime() : 0;
    if (updatedAt && Date.now() - updatedAt > TTL_MS) return null;
    return result?.body && typeof result.body === "object" ? result.body : null;
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
    if (!upd || upd.length === 0) {
      await supabase.from("analysis_cache").insert(row);
    }
  } catch {
    // best-effort
  }
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => { try { return JSON.parse(str); } catch { return null; } };
  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  return parsed || null;
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
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API error " + resp.status);
  const data = await resp.json();
  return (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

interface LR { label: string; recent: number }
function fmtGroups(rows: LR[] | undefined): string {
  if (!Array.isArray(rows) || !rows.length) return "—";
  return rows.map((r) => r.label + " " + Math.round(r.recent) + "%").join(", ");
}
function fmtTrend(trend: [number, number][] | undefined): string {
  if (!Array.isArray(trend) || !trend.length) return "—";
  return trend.filter((p) => p[0] >= 2016).map((p) => p[0] + ":" + Math.round(p[1]) + "%").join("  ");
}

function fallback(d: any, topicLabel: string): any {
  const occ: LR[] = d?.occupation || [];
  const top = occ.slice(0, 2).map((r) => r.label).join(" και ") || "βασικές ομάδες";
  return {
    headline: "Το θέμα «" + topicLabel + "» αγγίζει " + top + " — εκεί κρίνεται.",
    deep_read:
      "Διάβασε τα νούμερα παραπάνω και στόχευσε εκεί που η ανησυχία είναι ψηλή και η εμπιστοσύνη στην κυβέρνηση χαμηλή.",
    who_to_mobilize: top,
    trust_angle: "Όπου ανησυχία ψηλή + εμπιστοσύνη χαμηλή, υπάρχει άνοιγμα.",
    opening: "Μίλα ευθέως στις ομάδες που το ζουν.",
    risk: "Μην το χάσεις σε γενικότητες.",
    adjacent: "—",
    next_move: "Στόχευσε την πιο επηρεασμένη ομάδα με συγκεκριμένο μήνυμα.",
    _fallback: true,
  };
}

function buildPrompt(d: any, topicLabel: string, kind: string, eventTitle: string, partyName: string): string {
  const hasData = kind === "survey";
  const ctx = hasData
    ? `ΠΡΑΓΜΑΤΙΚΑ ΔΕΔΟΜΕΝΑ ΕΡΕΥΝΑΣ (Ευρωβαρόμετρο, μ.ο. ${d?.recent_window?.[0] || "2022"}–${d?.recent_window?.[1] || "2024"}):
- Συνολική ανησυχία (% που το βάζουν στα κορυφαία προβλήματα): ${d?.overall_recent ?? "—"}%
- Ανά επάγγελμα: ${fmtGroups(d?.occupation)}
- Ανά ηλικία: ${fmtGroups(d?.age)}
- Ανά κοινωνική τάξη: ${fmtGroups(d?.social_class)}
- Εμπιστοσύνη ΣΤΗΝ ΚΥΒΕΡΝΗΣΗ αυτών των επαγγελμάτων: ${fmtGroups(d?.trust_occupation)}
- Ιστορική τάση: ${fmtTrend(d?.trend)}`
    : `ΔΕΝ υπάρχουν σκληρά δεδομένα έρευνας γι' αυτό το θέμα (το Ευρωβαρόμετρο δεν το ρωτά ως «πρόβλημα της χώρας»). Βασίσου στην πολιτική σου γνώση για την Ελλάδα και σε συναφή δεδομένα.`;

  return `Είσαι κορυφαίος πολιτικός σύμβουλος επιτελείου για το κόμμα ${partyName} (προοδευτικός, αριστερός χώρος). Γράφεις μια ΒΑΘΙΑ, πανέξυπνη ανάγνωση για ΕΝΑ θέμα, που θα διαβάσει σύμβουλος για να καταλάβει ποιον αφορά και πώς κερδίζεται.

ΘΕΜΑ: ${topicLabel}
${eventTitle ? "ΣΥΝΔΕΔΕΜΕΝΟ ΓΕΓΟΝΟΣ: " + eventTitle : ""}

${ctx}

ΚΑΝΟΝΕΣ:
- Πήγαινε ΒΑΘΙΑ, σαν άριστος αναλυτής. ΟΧΙ γενικότητες — αναφέρσου στα ΣΥΓΚΕΚΡΙΜΕΝΑ νούμερα/ομάδες όταν υπάρχουν.
- ΠΛΕΞΕ την εμπιστοσύνη στην κυβέρνηση μέσα στη σκέψη: όπου ανησυχία ψηλή + εμπιστοσύνη χαμηλή = άνοιγμα· όπου εμπιστοσύνη καλή = δυσκολία.
- Διάβασε το ΙΣΤΟΡΙΚΟ μοτίβο (αν ανέβηκε/έπεσε και πότε) και τι σημαίνει.
- Σύνδεσε με 1-2 ΓΕΙΤΟΝΙΚΑ θέματα όπου έχει νόημα.
- Ελληνικά, πυκνά, αποφασιστικά, σαν εμπιστευτικό brief. Χωρίς markdown.

ΕΠΕΣΤΡΕΨΕ ΜΟΝΟ έγκυρο JSON, ακριβώς αυτή τη μορφή:
{
  "headline": "ΜΙΑ δυνατή πρόταση: η στρατηγική ουσία αυτού του θέματος.",
  "deep_read": "2-4 προτάσεις: τι ΠΡΑΓΜΑΤΙΚΑ κρίνεται πολιτικά εδώ, βαθιά, με βάση τα νούμερα.",
  "who_to_mobilize": "ποιες ομάδες και ΓΙΑΤΙ (με αναφορά στα ποσοστά).",
  "trust_angle": "η εμπιστοσύνη στην κυβέρνηση ως ευκαιρία ή κίνδυνος, συγκεκριμένα.",
  "opening": "το καθαρό άνοιγμα για το κόμμα.",
  "risk": "η παγίδα/ο κίνδυνος προς αποφυγή.",
  "adjacent": "σύνδεση με 1-2 γειτονικά θέματα.",
  "next_move": "ΜΙΑ συγκεκριμένη, εκτελέσιμη επόμενη κίνηση."
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const topicKey: string | null = body?.topic_key ?? null;
    const topicLabel: string = body?.topic_label || "θέμα";
    const kind: string = body?.kind || "survey";
    const eventTitle: string = body?.event_title || "";
    const partyName: string = body?.party_name || "ΕΛΑΣ";
    const d = body?.data || {};

    const supabase = svc();
    const key = cacheKey(topicKey, topicLabel);

    const cached = await readCache(supabase, key);
    if (cached) return json({ ok: true, analysis: cached, source: "cache" });

    let analysis: any;
    try {
      const raw = await callClaude(buildPrompt(d, topicLabel, kind, eventTitle, partyName));
      const parsed = parseAiJson(raw);
      analysis = parsed && parsed.headline ? parsed : fallback(d, topicLabel);
    } catch {
      analysis = fallback(d, topicLabel);
    }

    if (!analysis._fallback) {
      await writeCache(supabase, key, analysis);
    }

    return json({ ok: true, analysis, source: "generated" });
  } catch (e: any) {
    return json({ ok: false, error: "server_error", detail: String(e?.message || e) }, 500);
  }
}
