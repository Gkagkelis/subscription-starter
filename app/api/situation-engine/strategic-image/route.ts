import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

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

// Cache key per micro_agenda_id + party_key (αλλάζει μόνο αν αλλάξει το cluster)
function cacheKey(microAgendaId: string, partyKey: string) {
  return "strategic_image_v1__" + microAgendaId + "__" + partyKey;
}

async function readCache(supabase: ReturnType<typeof svc>, key: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("analysis_cache")
      .select("result, updated_at")
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .limit(1);
    if (!Array.isArray(data) || !data[0]) return null;
    const result = (data[0] as any).result;
    // Invalidate αν > 6 ώρες (το cluster μπορεί να αλλάξει)
    const updatedAt = new Date((data[0] as any).updated_at || 0).getTime();
    if (Date.now() - updatedAt > 6 * 60 * 60 * 1000) return null;
    return typeof result?.body === "string" ? result.body : null;
  } catch {
    return null;
  }
}

async function writeCache(supabase: ReturnType<typeof svc>, key: string, body: string) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: key,
    input_hash: "v1",
    model_used: "claude-sonnet-4-6",
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

async function callClaude(prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API error " + resp.status);
  const data = await resp.json();
  const text = (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      micro_agenda_id,
      micro_agenda,
      party_key = "elas",
      party_name = "ΕΛΑΣ",
      red_lines = [] as string[],
      tone = "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός",
      known_positions = [] as string[],
      event_titles = [] as string[],
      article_titles = [] as string[],
      sources = [] as string[],
      real_news_coverage_score = null as number | null,
      real_trend_score = null as number | null,
      score = 0,
      // Ιστορικά δεδομένα από political-memory (περνιούνται από το page)
      memory_lines = [] as string[],
    } = body;

    if (!micro_agenda_id || !micro_agenda) {
      return json({ error: "micro_agenda_id + micro_agenda required" }, 400);
    }

    const supabase = svc();
    const key = cacheKey(micro_agenda_id, party_key);

    // 1. Έλεγχος cache
    const cached = await readCache(supabase, key);
    if (cached) {
      return json({ ok: true, body: cached, source: "cache" });
    }

    // 2. Φτιάχνω το prompt
    const eventContext = event_titles.slice(0, 5).join(" · ") || micro_agenda;
    const articleContext = article_titles.slice(0, 6).join("\n- ") || "—";
    const sourceContext = sources.slice(0, 5).join(", ") || "—";
    const redLinesText = red_lines.length ? red_lines.join(", ") : "—";
    const positionsText = known_positions.length ? known_positions.join(", ") : "—";
    const memoryText = memory_lines.length
      ? memory_lines.slice(0, 8).join("\n") 
      : "Δεν υπάρχουν διαθέσιμα ιστορικά δεδομένα.";

    const coverageLabel =
      real_news_coverage_score === null ? "άγνωστη"
      : real_news_coverage_score >= 70 ? "υψηλή"
      : real_news_coverage_score >= 40 ? "μεσαία"
      : "χαμηλή";
    const trendsLabel =
      real_trend_score === null ? "άγνωστο"
      : real_trend_score >= 60 ? "ανερχόμενο"
      : real_trend_score >= 30 ? "σταθερό"
      : "χαμηλό";

    const prompt = `Είσαι κορυφαίος πολιτικός σύμβουλος με βαθύ αναλυτικό υπόβαθρο. Γράφεις τη «Στρατηγική ανάγνωση» για το παρακάτω πολιτικό γεγονός.

ΚΟΜΜΑ: ${party_name} (${party_key})
ΤΟΝΟΣ: ${tone}
ΘΕΣΕΙΣ: ${positionsText}
ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ (ΑΠΑΓΟΡΕΥΕΤΑΙ να πλησιάσεις): ${redLinesText}

ΓΕΓΟΝΟΣ / ΜΙΚΡΟΑΤΖΕΝΤΑ: ${micro_agenda}
ΣΥΓΚΕΚΡΙΜΕΝΑ ΓΕΓΟΝΟΤΑ ΠΟΥ ΚΑΛΥΠΤΕΙ:
${eventContext}

ΑΡΘΡΑ ΠΟΥ ΤΟ ΣΤΗΡΙΖΟΥΝ:
- ${articleContext}

ΠΗΓΕΣ: ${sourceContext}
ΚΑΛΥΨΗ ΜΕΣΩΝ: ${coverageLabel} (score: ${real_news_coverage_score ?? "—"})
ΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ: ${trendsLabel} (score: ${real_trend_score ?? "—"})
NORAYA PRIORITY: ${score}

ΙΣΤΟΡΙΚΑ ΔΕΔΟΜΕΝΑ (Eurobarometer / κοινή γνώμη / αρχηγοί):
${memoryText}

ΟΔΗΓΙΕΣ:
- Γράψε 3-4 παραγράφους αυστηρά για ΑΥΤΟ το γεγονός — ΟΧΙ γενικά για τη θεματική
- Δέσε το γεγονός με τα ιστορικά δεδομένα όπου υπάρχουν (π.χ. «σύμφωνα με το Eurobarometer...», «ιστορικά το κοινό αντιδρά...»)
- Ανάλυσε: (α) τι πραγματικά συμβαίνει πολιτικά, (β) ποιο πλαίσιο επιβάλλεται, (γ) ποιο ρίσκο υπάρχει ΓΙΑ ΑΥΤΟ ΤΟ ΚΟΜΜΑ
- Δώσε μια μοναδική, οξεία πολιτική εκτίμηση — όχι γενικολογίες
- Ποτέ ΜΗΝ αντιγράψεις τις κόκκινες γραμμές ή τις θέσεις word-for-word μέσα στο κείμενο
- Γλώσσα: ελληνικά, πυκνή, συνθετική, σαν εσωτερικό πολιτικό brief
- ΜΟΝΟ κείμενο, χωρίς headers, χωρίς bullets, χωρίς markdown`;

    const generated = await callClaude(prompt);

    // 3. Αποθήκευση cache
    await writeCache(supabase, key, generated);

    return json({ ok: true, body: generated, source: "generated" });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
