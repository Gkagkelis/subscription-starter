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

// Cache key περιέχει και το event_id — κάθε γεγονός παίρνει τη δική του ανάλυση.
// v2: άλλαξα έκδοση ώστε να φρεσκάρει αμέσως (να μη σερβίρει τα παλιά «Μήλο» για 6 ώρες).
function priorityTier(score: unknown): string {
  const s = Number(score) || 0;
  if (s >= 60) return "t1";
  if (s >= 35) return "t2";
  return "t3";
}
function cacheKey(microAgendaId: string, partyKey: string, eventId?: string | null, tier = "") {
  const base = "strategic_image_v2__" + microAgendaId + "__" + partyKey + (tier ? "__" + tier : "");
  return eventId ? base + "__" + eventId : base;
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
    const updatedAt = new Date((data[0] as any).updated_at || 0).getTime();
    if (Date.now() - updatedAt > 7 * 24 * 60 * 60 * 1000) return null;
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
    input_hash: "v2",
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
      max_tokens: 1300,
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

// Μετατρέπει raw memory lines σε αναγνώσιμο κείμενο (χωρίς τεχνικές ετικέτες).
function formatMemoryLines(lines: string[]): string {
  if (!lines || lines.length === 0) {
    return "Δεν υπάρχουν διαθέσιμα ιστορικά δεδομένα.";
  }

  const cleaned = lines
    .slice(0, 8)
    .map((line: string) => {
      return line
        .replace(/\bfemale\b/gi, "γυναίκες")
        .replace(/\bmale\b/gi, "άνδρες")
        .replace(/\b(\d{4})\s+Q([1-4])\b/g, (_, year, quarter) => {
          const quarterMap: Record<string, string> = { "1": "Α' τρίμηνο", "2": "Β' τρίμηνο", "3": "Γ' τρίμηνο", "4": "Δ' τρίμηνο" };
          return `${quarterMap[quarter] || "τρίμηνο"} ${year}`;
        })
        .replace(/:\s*(\d+)\/100/g, ": $1%")
        .trim();
    })
    .filter(Boolean);

  return cleaned.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      micro_agenda_id,
      micro_agenda,
      // Κεντρικό θέμα (parent topic) — για να διαβάζεται το γεγονός ΜΕΣΑ στο θέμα.
      theme = "" as string,
      // Το γεγονός που πάτησε ο χρήστης — εστιακό σημείο της ανάλυσης.
      active_event_id = null as string | null,
      active_event_title = null as string | null,
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
      memory_lines = [] as string[],
    } = body;

    if (!micro_agenda_id || !micro_agenda) {
      return json({ error: "micro_agenda_id + micro_agenda required" }, 400);
    }

    const supabase = svc();
    const key = cacheKey(micro_agenda_id, party_key, active_event_id, priorityTier(score));

    // 1. Έλεγχος cache
    const cached = await readCache(supabase, key);
    if (cached) {
      return json({ ok: true, body: cached, source: "cache" });
    }

    // 2. Φτιάχνω το context
    const centralTheme = String(theme || micro_agenda || "").trim();

    const activeEventLine = active_event_title
      ? `ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ (αυτό αναλύεις, ΕΠΙΚΕΝΤΡΟ): ${active_event_title}`
      : "";

    // Τα υπόλοιπα γεγονότα ως πλαίσιο (όχι επίκεντρο).
    const otherEvents = event_titles
      .filter((t: string) => t !== active_event_title)
      .slice(0, 4)
      .join(" · ");
    const contextEventsLine = otherEvents
      ? `Συναφή γεγονότα (μόνο για πλαίσιο, ΟΧΙ επίκεντρο): ${otherEvents}`
      : "";

    const articleContext = article_titles.slice(0, 6).join("\n- ") || "—";
    const sourceContext = sources.slice(0, 5).join(", ") || "—";
    const redLinesText = red_lines.length ? red_lines.join(", ") : "—";
    const positionsText = known_positions.length ? known_positions.join(", ") : "—";
    const memoryText = formatMemoryLines(memory_lines);

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

    const prompt = `Είσαι κορυφαίος πολιτικός σύμβουλος με βαθύ αναλυτικό υπόβαθρο. Γράφεις τη «Στρατηγική ανάγνωση» για ένα συγκεκριμένο πολιτικό γεγονός.

ΚΟΜΜΑ: ${party_name} (${party_key})
ΤΟΝΟΣ: ${tone}
ΘΕΣΕΙΣ: ${positionsText}
ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ (ΑΠΑΓΟΡΕΥΕΤΑΙ να πλησιάσεις): ${redLinesText}

ΚΕΝΤΡΙΚΟ ΘΕΜΑ: ${centralTheme}
ΘΕΜΑΤΙΚΗ / ΜΙΚΡΟΑΤΖΕΝΤΑ: ${micro_agenda}
${activeEventLine}
${contextEventsLine}

ΑΡΘΡΑ ΠΟΥ ΣΤΗΡΙΖΟΥΝ ΤΟ ΓΕΓΟΝΟΣ:
- ${articleContext}

ΠΗΓΕΣ: ${sourceContext}
ΚΑΛΥΨΗ ΜΕΣΩΝ: ${coverageLabel} (score: ${real_news_coverage_score ?? "—"})
ΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ: ${trendsLabel} (score: ${real_trend_score ?? "—"})
NORAYA PRIORITY: ${score}

ΙΣΤΟΡΙΚΑ ΔΕΔΟΜΕΝΑ (Eurobarometer / κοινή γνώμη):
${memoryText}

ΟΔΗΓΙΕΣ:
- ΞΕΚΙΝΑ με ΜΙΑ μόνο πρόταση-ρεζουμέ (το «so what»): καθαρά ελληνικά, χωρίς εισαγωγικά, κάτω από 25 λέξεις, που λέει αμέσως τι σημαίνει πολιτικά αυτό το γεγονός για το κόμμα. Μετά άφησε ΜΙΑ ΚΕΝΗ ΓΡΑΜΜΗ.
- Μετά γράψε 3-4 συμπαγείς παραγράφους με επίκεντρο το «ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ», διαβασμένο ΜΕΣΑ στο ΚΕΝΤΡΙΚΟ ΘΕΜΑ: (α) τι πραγματικά κινείται πολιτικά σε αυτό το συγκεκριμένο γεγονός, (β) πώς δένει με την ευρύτερη θεματική «${centralTheme}» και ποιο πλαίσιο επιβάλλεται, (γ) ποιο ρίσκο/ευκαιρία υπάρχει ΓΙΑ ΑΥΤΟ ΤΟ ΚΟΜΜΑ συγκεκριμένα.
- Χώρισε τις παραγράφους με κενή γραμμή μεταξύ τους.
- ΜΗ μεταφέρεις την ανάλυση σε άλλο γεγονός του κλάστερ· το επίκεντρο μένει στο ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ. Τα συναφή γεγονότα τα χρησιμοποιείς μόνο ως πλαίσιο.
- Αν υπάρχουν ιστορικά δεδομένα: ενσωμάτωσέ τα σε νόημα (π.χ. «Ιστορικά, το κοινό αντιδρά...», «Σύμφωνα με Eurobarometer...»). ΜΗΝ αντιγράψεις ποτέ τεχνικούς όρους ή ονόματα πεδίων.
- Δώσε οξεία, εσωτερική πολιτική εκτίμηση — όχι δημόσια ανακοίνωση, όχι γενικολογίες.
- Ποτέ ΜΗΝ επαναλάβεις κόκκινες γραμμές ή θέσεις αυτολεξεί.
- Γλώσσα: ελληνικά, πυκνά, σαν εμπιστευτικό brief επιτελείου.
- ΜΟΝΟ κείμενο: χωρίς headers, χωρίς bullets, χωρίς markdown, χωρίς αριθμημένες λίστες.`;

    const generated = await callClaude(prompt);

    // 3. Αποθήκευση cache
    await writeCache(supabase, key, generated);

    return json({ ok: true, body: generated, source: "generated" });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
