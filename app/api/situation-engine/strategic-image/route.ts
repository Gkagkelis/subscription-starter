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

// FIX: Cache key περιέχει και το event_id — κάθε γεγονός παίρνει τη δική του ανάλυση
function cacheKey(microAgendaId: string, partyKey: string, eventId?: string | null) {
  const base = "strategic_image_v1__" + microAgendaId + "__" + partyKey;
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
      max_tokens: 700,
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

// FIX: Μετατρέπει raw memory lines σε αναγνώσιμο αναλυτικό κείμενο
// Αποφεύγει τεχνικές ετικέτες όπως "female:", "Q4", "2022 Q4" κλπ
function formatMemoryLines(lines: string[]): string {
  if (!lines || lines.length === 0) {
    return "Δεν υπάρχουν διαθέσιμα ιστορικά δεδομένα.";
  }

  const cleaned = lines
    .slice(0, 8)
    .map((line: string) => {
      // Αφαίρεση τεχνικών ετικετών που εμφανίζονται raw
      return line
        // Π.χ. "female: 61/100 (2022 Q4)" → αντικατάσταση με ανθρώπινο κείμενο
        .replace(/\bfemale\b/gi, "γυναίκες")
        .replace(/\bmale\b/gi, "άνδρες")
        .replace(/\b(\d{4})\s+Q([1-4])\b/g, (_, year, quarter) => {
          const quarterMap: Record<string, string> = { "1": "Α' τρίμηνο", "2": "Β' τρίμηνο", "3": "Γ' τρίμηνο", "4": "Δ' τρίμηνο" };
          return `${quarterMap[quarter] || "τρίμηνο"} ${year}`;
        })
        // Αφαίρεση μορφής "LABEL: NUMBER/100" → κράτα μόνο το νόημα
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
      // FIX: Δέχεται και το active_event_id + active_event_title για εστιακό prompt
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
    // FIX: Χρησιμοποιεί το active_event_id στο cache key
    const key = cacheKey(micro_agenda_id, party_key, active_event_id);

    // 1. Έλεγχος cache
    const cached = await readCache(supabase, key);
    if (cached) {
      return json({ ok: true, body: cached, source: "cache" });
    }

    // 2. Φτιάχνω το context

    // FIX: Το ενεργό γεγονός μπαίνει πρώτο και ξεχωριστά
    const activeEventLine = active_event_title
      ? `ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ (αυτό αναλύεις): ${active_event_title}`
      : "";

    // Τα υπόλοιπα γεγονότα ως πλαίσιο (όχι focal point)
    const otherEvents = event_titles
      .filter((t: string) => t !== active_event_title)
      .slice(0, 4)
      .join(" · ");
    const contextEventsLine = otherEvents
      ? `Συναφή γεγονότα (για πλαίσιο): ${otherEvents}`
      : "";

    const articleContext = article_titles.slice(0, 6).join("\n- ") || "—";
    const sourceContext = sources.slice(0, 5).join(", ") || "—";
    const redLinesText = red_lines.length ? red_lines.join(", ") : "—";
    const positionsText = known_positions.length ? known_positions.join(", ") : "—";

    // FIX: Καθαρισμός raw memory lines πριν μπουν στο prompt
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

ΘΕΜΑΤΙΚΗ ΚΛΑΣΤΕΡ: ${micro_agenda}
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
- Εστίασε αποκλειστικά στο «ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ» — όχι στη γενική θεματική
- Γράψε 3-4 συμπαγείς παραγράφους: (α) τι πραγματικά κινείται πολιτικά, (β) ποιο πλαίσιο επιβάλλεται, (γ) ποιο ρίσκο/ευκαιρία υπάρχει ΓΙΑ ΑΥΤΟ ΤΟ ΚΟΜΜΑ συγκεκριμένα
- Αν υπάρχουν ιστορικά δεδομένα: ενσωμάτωσέ τα αναλυτικά (π.χ. «Ιστορικά, το κοινό αντιδρά σε αυτό το θέμα με...», «Σύμφωνα με Eurobarometer...»). ΜΗΝ αντιγράψεις ποτέ τεχνικούς όρους ή ονόματα πεδίων — μεταφρασέ τα σε νόημα
- Δώσε μια οξεία, εσωτερική πολιτική εκτίμηση — όχι δημόσια ανακοίνωση, όχι γενικολογίες
- Ποτέ ΜΗΝ επαναλάβεις κόκκινες γραμμές ή θέσεις word-for-word
- Γλώσσα: ελληνικά, πυκνή, σαν εμπιστευτικό brief επιτελείου
- ΜΟΝΟ κείμενο: χωρίς headers, χωρίς bullets, χωρίς markdown, χωρίς αριθμημένες λίστες`;

    const generated = await callClaude(prompt);

    // 3. Αποθήκευση cache
    await writeCache(supabase, key, generated);

    return json({ ok: true, body: generated, source: "generated" });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
