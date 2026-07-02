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
  return "noraya_read_v3__" + (topicKey || norm(topicLabel));
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
    input_hash: "v3",
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

// Καλεί τον Claude. useWeb=true -> ενεργοποιεί το εργαλείο web search (server-side).
async function callClaude(prompt: string, useWeb = false): Promise<string> {
  const bodyObj: any = {
    model: MODEL,
    max_tokens: useWeb ? 5000 : 1800,
    messages: [{ role: "user", content: prompt }],
  };
  if (useWeb) {
    bodyObj.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
  }
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(bodyObj),
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
  return trend.map((p) => p[0] + ":" + Math.round(p[1]) + "%").join("  ");
}

function fallback(d: any, topicLabel: string, reason = ""): any {
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
    web_findings: "—",
    left_right: "—",
    sources: [],
    _fallback: true,
    _debug: reason,
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
    : `ΔΕΝ υπάρχουν σκληρά δεδομένα έρευνας γι' αυτό το θέμα (το Ευρωβαρόμετρο δεν το ρωτά ως «πρόβλημα της χώρας»). Βασίσου σε ζωντανή αναζήτηση και στην πολιτική σου γνώση για την Ελλάδα.`;

  return `Είσαι κορυφαίος πολιτικός σύμβουλος επιτελείου για το κόμμα ${partyName} (προοδευτικός, αριστερός χώρος). Γράφεις μια ΒΑΘΙΑ, πανέξυπνη ανάγνωση για ΕΝΑ θέμα, που θα διαβάσει σύμβουλος για να καταλάβει ποιον αφορά και πώς κερδίζεται.

ΘΕΜΑ: ${topicLabel}
${eventTitle ? "ΣΥΝΔΕΔΕΜΕΝΟ ΓΕΓΟΝΟΣ: " + eventTitle : ""}

${ctx}

ΕΧΕΙΣ ΕΡΓΑΛΕΙΟ WEB SEARCH — ΧΡΗΣΙΜΟΠΟΙΗΣΕ ΤΟ:
- Ψάξε ζωντανά ΕΓΚΥΡΕΣ ελληνικές πηγές για: (α) την ΑΡΙΣΤΕΡΑ–ΔΕΞΙΑ τοποθέτηση πάνω στο θέμα (δημοσκόποι όπως MRB, Metron Analysis, Marc, Pulse, Kapa Research, Prorata, Alco, GPO, ή σοβαρά δημοσιεύματα)· (β) αν ΔΕΝ υπάρχουν σκληρά δεδομένα παραπάνω, συμπληρωματικά ευρήματα/νούμερα για το θέμα ή το γεγονός.
- ΑΥΣΤΗΡΟΣ ΚΑΝΟΝΑΣ ΤΙΜΙΟΤΗΤΑΣ: ΜΗΝ επινοείς κανένα νούμερο ή ισχυρισμό. Κάθε νούμερο/ισχυρισμός που γράφεις ΠΡΕΠΕΙ να προέρχεται από πηγή που όντως βρήκες τώρα, και να μπει στο "sources" με ΠΡΑΓΜΑΤΙΚΟ URL. Αν δεν βρεις αξιόπιστα στοιχεία, γράψε ρητά «δεν βρέθηκαν αξιόπιστα στοιχεία» — ΜΗΝ μαντεύεις.

ΚΑΝΟΝΕΣ ΓΡΑΦΗΣ:
- ΓΡΑΨΕ ΣΥΝΤΟΜΑ ΚΑΙ ΠΥΚΝΑ. Κάθε πεδίο 1-2 προτάσεις (deep_read και web_findings μέχρι 3). Καμία φλυαρία.
- ΟΧΙ γενικότητες — αναφέρσου στα ΣΥΓΚΕΚΡΙΜΕΝΑ νούμερα/ομάδες όταν υπάρχουν. Πλέξε την εμπιστοσύνη (ψηλή ανησυχία + χαμηλή εμπιστοσύνη = άνοιγμα).
- Ελληνικά, αποφασιστικά, σαν εμπιστευτικό brief. Χωρίς markdown.

ΚΡΙΣΙΜΟ: Η ΑΠΑΝΤΗΣΗ ΣΟΥ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΜΟΝΟ ΤΟ JSON — να ξεκινάει με { και να τελειώνει με }. ΜΗΝ γράψεις ΤΙΠΟΤΑ άλλο (ούτε περιγραφή της αναζήτησης, ούτε σχόλια). Μορφή:
{
  "headline": "ΜΙΑ δυνατή πρόταση.",
  "deep_read": "1-3 προτάσεις: τι κρίνεται πολιτικά εδώ, με βάση τα νούμερα.",
  "who_to_mobilize": "ποιες ομάδες και γιατί (με ποσοστά). Σύντομα.",
  "trust_angle": "η εμπιστοσύνη ως ευκαιρία/κίνδυνος. 1-2 προτάσεις.",
  "opening": "το άνοιγμα για το κόμμα. 1 πρόταση.",
  "risk": "η παγίδα προς αποφυγή. 1 πρόταση.",
  "adjacent": "1-2 γειτονικά θέματα. Σύντομα.",
  "next_move": "ΜΙΑ εκτελέσιμη κίνηση. 1 πρόταση.",
  "web_findings": "1-3 προτάσεις με ό,τι βρήκες ζωντανά, με αναφορά στην πηγή· ή «δεν βρέθηκαν αξιόπιστα στοιχεία».",
  "left_right": "η αριστερά–δεξιά τοποθέτηση, από πηγές, σύντομα· ή «δεν βρέθηκαν αξιόπιστα στοιχεία».",
  "sources": [{ "title": "όνομα πηγής", "url": "https://..." }]
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
      // 1) Με ζωντανή αναζήτηση
      const raw = await callClaude(buildPrompt(d, topicLabel, kind, eventTitle, partyName), true);
      const parsed = parseAiJson(raw);
      if (parsed && parsed.headline) analysis = parsed;
      else throw new Error("web_parse_failed");
    } catch (errWeb: any) {
      try {
        // 2) Fallback: κανονική ανάλυση χωρίς αναζήτηση (δεν σπάει τίποτα)
        const raw = await callClaude(buildPrompt(d, topicLabel, kind, eventTitle, partyName), false);
        const parsed = parseAiJson(raw);
        analysis = parsed && parsed.headline
          ? parsed
          : fallback(d, topicLabel, "parse_failed_noweb");
      } catch (err: any) {
        analysis = fallback(d, topicLabel, "call_failed:" + String(err?.message || err));
      }
    }

    // Ντετερμινιστική τιμιότητα (ΠΑΝΤΑ ακριβές, όχι από AI):
    analysis.has_internal_data = kind === "survey";
    analysis.data_note = kind === "survey"
      ? `Οι μπάρες πιο πάνω είναι από το κοντινότερο θέμα με σκληρά δεδομένα Ευρωβαρομέτρου: «${topicLabel}». Για ειδικές πτυχές του γεγονότος και για αριστερά–δεξιά, η ανάγνωση παρακάτω βγαίνει από ζωντανή αναζήτηση — με πηγές.`
      : `Ο εγκέφαλος του Noraya δεν έχει σκληρά δεδομένα Ευρωβαρομέτρου για «${topicLabel}». Η ανάγνωση παρακάτω βγαίνει από ζωντανή αναζήτηση σε έγκυρες πηγές — με links.`;
    if (!Array.isArray(analysis.sources)) analysis.sources = [];

    if (!analysis._fallback) {
      await writeCache(supabase, key, analysis);
    }

    return json({ ok: true, analysis, source: "generated" });
  } catch (e: any) {
    return json({ ok: false, error: "server_error", detail: String(e?.message || e) }, 500);
  }
}
