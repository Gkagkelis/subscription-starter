import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — "Πώς κερδίζεται" + "Επιλογές δράσης" ανά ΓΕΓΟΝΟΣ (AI, premium)
//
// Αντικαθιστά τα generic family-templates με ανάλυση εστιασμένη
// στο ΣΥΓΚΕΚΡΙΜΕΝΟ γεγονός, διαβασμένο μέσα στο κεντρικό θέμα.
// Cache 6 ώρες ανά γεγονός (όπως το strategic-image).
// ============================================================

const MODEL = "claude-sonnet-4-6";

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

function cacheKey(microAgendaId: string, partyKey: string, eventId?: string | null) {
  const base = "strategic_play_v1__" + microAgendaId + "__" + partyKey;
  return eventId ? base + "__" + eventId : base;
}

async function readCache(supabase: ReturnType<typeof svc>, key: string): Promise<any | null> {
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

// Truncation-safe JSON parser (κρατά ό,τι πρόλαβε αν κόπηκε το JSON).
function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => { try { return JSON.parse(str); } catch { return null; } };
  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed) {
    const start = s.indexOf("{");
    if (start >= 0) {
      let body = s.slice(start);
      let dCurly = 0, dSquare = 0, inStr = false, esc = false;
      for (const ch of body) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") dCurly++;
        else if (ch === "}") dCurly--;
        else if (ch === "[") dSquare++;
        else if (ch === "]") dSquare--;
      }
      if (inStr) body += '"';
      body = body.replace(/,\s*$/, "");
      while (dSquare-- > 0) body += "]";
      while (dCurly-- > 0) body += "}";
      parsed = tryParse(body);
    }
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
      max_tokens: 1600,
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

function clampPct(v: unknown, fallback: number): number {
  const num = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(5, Math.min(95, Math.round(num)));
}

function cleanStr(v: unknown, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length ? t : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      micro_agenda_id,
      micro_agenda,
      theme = "" as string,
      active_event_id = null as string | null,
      active_event_title = null as string | null,
      active_event_summary = "" as string,
      party_key = "elas",
      party_name = "ΕΛΑΣ",
      red_lines = [] as string[],
      known_positions = [] as string[],
      tone = "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός",
      event_titles = [] as string[],
      article_titles = [] as string[],
      sources = [] as string[],
      real_news_coverage_score = null as number | null,
      real_trend_score = null as number | null,
      score = 0,
    } = body;

    if (!micro_agenda_id || !micro_agenda) {
      return json({ error: "micro_agenda_id + micro_agenda required" }, 400);
    }

    const supabase = svc();
    const key = cacheKey(micro_agenda_id, party_key, active_event_id);

    const cached = await readCache(supabase, key);
    if (cached) {
      return json({ ok: true, body: cached, source: "cache" });
    }

    const centralTheme = cleanStr(theme, micro_agenda);
    const activeTitle = cleanStr(active_event_title, micro_agenda);
    const otherEvents = (event_titles || [])
      .filter((t: string) => t !== active_event_title)
      .slice(0, 4)
      .join(" · ");
    const articleContext = (article_titles || []).slice(0, 6).join("\n- ") || "—";
    const sourceContext = (sources || []).slice(0, 5).join(", ") || "—";
    const redLinesText = (red_lines || []).length ? red_lines.join(", ") : "—";
    const positionsText = (known_positions || []).length ? known_positions.join(", ") : "—";

    const prompt = `Είσαι κορυφαίος πολιτικός σύμβουλος επιτελείου. Γράφεις το αγωνιστικό σχέδιο («Πώς κερδίζεται» + 3 επιλογές δράσης) για ΕΝΑ συγκεκριμένο πολιτικό γεγονός.

ΚΟΜΜΑ: ${party_name} (${party_key})
ΤΟΝΟΣ: ${tone}
ΘΕΣΕΙΣ: ${positionsText}
ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ (ΑΠΑΓΟΡΕΥΕΤΑΙ να πλησιάσεις): ${redLinesText}

ΚΕΝΤΡΙΚΟ ΘΕΜΑ: ${centralTheme}
ΘΕΜΑΤΙΚΗ / ΜΙΚΡΟΑΤΖΕΝΤΑ: ${micro_agenda}
ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ (ΕΠΙΚΕΝΤΡΟ — γι' αυτό γράφεις): ${activeTitle}
${active_event_summary ? "Σύνοψη γεγονότος: " + active_event_summary : ""}
${otherEvents ? "Συναφή γεγονότα (μόνο πλαίσιο, ΟΧΙ επίκεντρο): " + otherEvents : ""}

ΑΡΘΡΑ ΠΟΥ ΣΤΗΡΙΖΟΥΝ ΤΟ ΓΕΓΟΝΟΣ:
- ${articleContext}
ΠΗΓΕΣ: ${sourceContext}
ΚΑΛΥΨΗ ΜΕΣΩΝ score: ${real_news_coverage_score ?? "—"} | ΤΑΣΕΙΣ score: ${real_trend_score ?? "—"} | NORAYA PRIORITY: ${score}

ΣΤΟΧΟΣ:
Δώσε αγωνιστικό σχέδιο ΓΙΑ ΑΥΤΟ ΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ ΓΕΓΟΝΟΣ. Πρέπει να αναφέρεσαι ρητά στο γεγονός «${activeTitle}» και στα πραγματικά του στοιχεία — ΟΧΙ γενικές φράσεις που ταιριάζουν σε οποιοδήποτε θέμα.

ΑΥΣΤΗΡΟΙ ΚΑΝΟΝΕΣ:
- ΑΠΑΓΟΡΕΥΟΝΤΑΙ generic μπαλώματα: «κανόνες στην αγορά», «σοβαρή εναλλακτική διακυβέρνηση», «καθαρό πώς», «κοινωνική πίεση» χωρίς συγκεκριμένο περιεχόμενο. Αν τα χρησιμοποιήσεις, πρέπει να τα γεμίσεις με στοιχεία ΑΥΤΟΥ του γεγονότος.
- ΜΗ μεταφέρεις την ανάλυση σε άλλο γεγονός του κλάστερ.
- Κάθε επιλογή να είναι ΔΙΑΦΟΡΕΤΙΚΗ απόφαση (όχι παραλλαγή της ίδιας).
- Αποφασιστικός τόνος: πες ξεκάθαρα τι θα έκανες.
- Ελληνικά, πυκνά, σαν εμπιστευτικό brief. Χωρίς markdown.

ΕΠΕΣΤΡΕΨΕ ΜΟΝΟ έγκυρο JSON με ΑΚΡΙΒΩΣ αυτή τη μορφή (χωρίς code fences, χωρίς σχόλια):
{
  "win_lead": "ΜΙΑ πρόταση (<22 λέξεις): η μετατόπιση που κερδίζει σε αυτό το γεγονός.",
  "win_body": "2-3 προτάσεις: το νικηφόρο πλαίσιο, η προϋπόθεση αξιοπιστίας και το timing — δεμένα με το συγκεκριμένο γεγονός.",
  "options": {
    "A": { "title": "σύντομος τίτλος κίνησης", "body": "1-2 προτάσεις τι κάνουμε ακριβώς", "gain": "τι κερδίζουμε", "risk": "ο κίνδυνος/η προϋπόθεση", "success": 70 },
    "B": { "title": "σύντομος τίτλος", "body": "1-2 προτάσεις", "gain": "τι κερδίζουμε", "risk": "ο κίνδυνος", "success": 52 },
    "C": { "title": "σύντομος τίτλος (κίνηση προς αποφυγή)", "body": "1-2 προτάσεις", "gain": "τι θα μπορούσε να δώσει", "risk": "γιατί είναι επικίνδυνη", "success": 28 }
  }
}
Η A είναι η προτεινόμενη (υψηλότερο success), η C είναι προς αποφυγή (χαμηλότερο success).`;

    const rawText = await callClaude(prompt);
    const parsed = parseAiJson(rawText);

    if (!parsed || !parsed.options || !parsed.options.A) {
      return json({ ok: false, error: "unparseable_ai", raw: rawText.slice(0, 400) }, 200);
    }

    const o = parsed.options;
    const mk = (
      src: any,
      keyLabel: "A" | "B" | "Γ",
      badge: string,
      fallbackSuccess: number,
      recommended: boolean,
      avoid: boolean
    ) => ({
      key: keyLabel,
      title: cleanStr(src?.title, keyLabel === "A" ? "Κίνηση αναδιάταξης" : keyLabel === "B" ? "Ελεγχόμενη αναμονή" : "Κίνηση υψηλού ρίσκου"),
      badge,
      body: cleanStr(src?.body, "—"),
      gain: cleanStr(src?.gain, "—"),
      risk: cleanStr(src?.risk, "—"),
      success: clampPct(src?.success, fallbackSuccess),
      recommended,
      avoid,
    });

    const result = {
      win_lead: cleanStr(parsed.win_lead, ""),
      win_body: cleanStr(parsed.win_body, ""),
      options: [
        mk(o.A, "A", "Προτεινόμενη", 70, true, false),
        mk(o.B, "B", "Αποδεκτή", 52, false, false),
        mk(o.C, "Γ", "Προς αποφυγή", 28, false, true),
      ],
    };

    await writeCache(supabase, key, result);
    return json({ ok: true, body: result, source: "generated" });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
