import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

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
function today() {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd
}
function cacheKey(party: string) {
  return `agenda_synopsis_v1__${party}__${today()}`;
}

async function readCache(sb: ReturnType<typeof svc>, key: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from("analysis_cache")
      .select("result")
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .limit(1);
    const body = (Array.isArray(data) ? data[0] : null) as any;
    const s = body?.result?.body?.synopsis;
    return typeof s === "string" && s.trim() ? s : null;
  } catch {
    return null;
  }
}
async function writeCache(sb: ReturnType<typeof svc>, key: string, synopsis: string) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: key,
    input_hash: "v1",
    model_used: MODEL,
    result: { body: { synopsis }, generated_at: new Date().toISOString() },
  };
  try {
    const { data: upd } = await sb
      .from("analysis_cache")
      .update(row)
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .select("analysis_kind");
    if (!upd || upd.length === 0) await sb.from("analysis_cache").insert(row);
  } catch {
    /* best-effort */
  }
}

interface ThemeLite { topic: string; score: number; events?: number; rising?: boolean }

function themesText(themes: ThemeLite[]): string {
  return themes
    .slice(0, 40)
    .map(
      (t) =>
        `- ${t.topic} · σκορ ${Math.round(Number(t.score) || 0)}` +
        (t.events ? ` · ${t.events} γεγονότα` : "") +
        (t.rising ? " · ανερχόμενο" : ""),
    )
    .join("\n");
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
      max_tokens: 700,
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

function buildPrompt(partyName: string, profile: unknown, themes: ThemeLite[]): string {
  const profileStr = profile ? JSON.stringify(profile).slice(0, 1500) : "—";
  return `Είσαι ανώτερος αναλυτής πολιτικής ατζέντας. Σου δίνω την ΠΛΗΡΗ σημερινή κατάταξη θεμάτων (όχι μόνο τα κορυφαία) ενός ελληνικού πολιτικού πεδίου, με σκορ, αριθμό γεγονότων και ένδειξη αν κάτι ανεβαίνει.

ΚΟΜΜΑ ΓΙΑ ΤΟ ΟΠΟΙΟ ΓΡΑΦΕΙΣ: ${partyName}
ΠΡΟΦΙΛ ΚΟΜΜΑΤΟΣ (ό,τι υπάρχει): ${profileStr}

ΠΛΗΡΗΣ ΚΑΤΑΤΑΞΗ ΘΕΜΑΤΩΝ ΤΗΣ ΗΜΕΡΑΣ:
${themesText(themes)}

Γράψε μια ΣΥΝΟΛΙΚΗ ΑΝΑΓΝΩΣΗ της ημέρας, ΣΥΝΤΟΜΗ αλλά ΜΕ ΒΑΘΟΣ (4-6 προτάσεις, μία παράγραφος, χωρίς markdown, χωρίς λίστες). Πρέπει να:
1) Λες τι κυριαρχεί σήμερα και ποιος είναι ο κεντρικός άξονας του πεδίου.
2) Επισημαίνεις τι ανεβαίνει ή τι μπορεί να μπει σύντομα στο κάδρο.
3) ΚΡΙΣΙΜΟ: εξηγείς τι σημαίνει αυτή η εικόνα ΕΙΔΙΚΑ ΓΙΑ ΤΟ «${partyName}» — πού έχει έδαφος/ευκαιρία, πού είναι εκτεθειμένο ή αμυντικό, με βάση το προφίλ του. Συγκεκριμένα, όχι γενικόλογα.

Μόνο η παράγραφος, στα ελληνικά. Χωρίς τίτλο, χωρίς εισαγωγή τύπου «Ορίστε».`;
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const party = String(b?.party || "elas").trim();
    const partyName = String(b?.party_name || "το κόμμα").trim();
    const profile = b?.profile ?? null;
    const themes: ThemeLite[] = Array.isArray(b?.themes) ? b.themes : [];

    if (!themes.length) return json({ ok: false, error: "no_themes" }, 400);

    const sb = svc();
    const key = cacheKey(party);

    const cached = await readCache(sb, key);
    if (cached) return json({ ok: true, synopsis: cached, source: "cache" });

    let synopsis = "";
    try {
      synopsis = await callClaude(buildPrompt(partyName, profile, themes));
    } catch {
      synopsis = "";
    }

    if (!synopsis) {
      const top = themes
        .slice()
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
        .slice(0, 3)
        .map((t) => t.topic)
        .join(", ");
      return json({
        ok: true,
        synopsis: `Σήμερα το πεδίο συγκεντρώνεται γύρω από: ${top}. Δες την πλήρη κατάταξη πιο κάτω.`,
        source: "fallback",
      });
    }

    await writeCache(sb, key, synopsis);
    return json({ ok: true, synopsis, source: "generated" });
  } catch (e: any) {
    return json({ ok: false, error: "server_error", detail: String(e?.message || e) }, 500);
  }
}
