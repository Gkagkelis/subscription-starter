import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildNorayaStrategicSystemPrompt } from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Scenario Engine
// Foresight ("πού πάει το θέμα") + Simulation ("αν κάνω X")
// ενωμένα σε έναν συλλογισμό, πάνω σε ΠΡΑΓΜΑΤΙΚΟ γεγονός + προφίλ κόμματος.
// On-demand (μόνο με user action, ένα γεγονός τη φορά).
// ============================================================

const ANALYSIS_MODEL = "claude-sonnet-4-6";

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(s);
  if (!parsed) {
    const match = s.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParse(match[0]);
  }
  if (!parsed) {
    const start = s.indexOf("{");
    if (start >= 0) {
      let body = s.slice(start);
      let depthCurly = 0;
      let depthSquare = 0;
      let inStr = false;
      let esc = false;
      for (const ch of body) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") depthCurly++;
        else if (ch === "}") depthCurly--;
        else if (ch === "[") depthSquare++;
        else if (ch === "]") depthSquare--;
      }
      if (inStr) body += '"';
      body = body.replace(/,\s*$/, "");
      while (depthSquare-- > 0) body += "]";
      while (depthCurly-- > 0) body += "}";
      parsed = tryParse(body);
    }
  }
  return parsed || null;
}

async function loadPartyProfile(supabase: ReturnType<typeof svc>, partyKey: string) {
  if (!partyKey) return null;
  try {
    const { data } = await supabase
      .from("political_party_profiles")
      .select("*")
      .eq("party_key", partyKey)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

function buildEvidenceLines(ev: any) {
  const articles = Array.isArray(ev?.evidence_articles) ? ev.evidence_articles : [];
  return articles
    .slice(0, 10)
    .map((a: any, i: number) => `${i + 1}. ${a.source || "—"} — ${a.title || "—"} (${a.published_at || "—"})`)
    .join("\n");
}

function buildScenarioContext(ev: any, brief: any, partyKey: string) {
  const evidence = buildEvidenceLines(ev);
  const priorFraming = brief?.framing_summary || "—";
  const priorRec = brief?.recommended_action || "—";
  const priorAvoid = brief?.avoid_action || "—";
  const priorRisk = brief?.red_team_warning || "—";

  return `ΠΟΛΙΤΙΚΟ ΓΕΓΟΝΟΣ ΓΙΑ ΑΝΑΛΥΣΗ ΣΕΝΑΡΙΩΝ (κόμμα: "${partyKey}")

Θεματική: ${ev?.topic || "—"}
Γεγονός: ${ev?.title || "—"}
Σύνοψη: ${ev?.summary || "—"}
Κατάσταση: ${ev?.status || "—"}
Event score: ${ev?.event_score ?? "—"}
Τεκμηρίωση: ${ev?.documentation_level || "initial"}
Άρθρα: ${ev?.article_count ?? 0} από ${ev?.source_count ?? 0} πηγές

ΗΔΗ ΓΝΩΣΤΗ ΑΝΑΛΥΣΗ (από προηγούμενο brief, αν υπάρχει):
- Πλαισίωση: ${priorFraming}
- Προτεινόμενη κίνηση: ${priorRec}
- Τι αποφεύγουμε: ${priorAvoid}
- Κίνδυνος: ${priorRisk}

ΠΗΓΕΣ:
${evidence || "—"}

ΖΗΤΟΥΜΕΝΟ:
Παρήγαγε ΣΥΝΔΕΔΕΜΕΝΑ σενάρια για τον σύμβουλο αυτού του κόμματος:
1) FORESIGHT — 2 ή 3 πιθανές εξελίξεις ΤΟΥ ΙΔΙΟΥ ΤΟΥ ΘΕΜΑΤΟΣ (κλιμάκωση / εκτόνωση / στροφή / λίμνασμα), με πιθανότητα, αιτιολογία και σήματα-που-να-προσέχει.
2) MOVES — 3 ή 4 κινήσεις που μπορεί να κάνει ΤΟ ΚΟΜΜΑ (δήλωση τώρα / αναμονή / θεσμική παρέμβαση / επίθεση / σιωπή), η καθεμία δεμένη με ΠΟΙΟ foresight path ταιριάζει, με κέρδος/κόστος, ποιος κερδίζει-χάνει και πώς θα το γυρίσει ο αντίπαλος.
3) CONNECTION — ο συλλογισμός που ΕΝΩΝΕΙ το foresight με την επιλογή κίνησης (γιατί, δεδομένου του πού πάει, αυτή η κίνηση είναι η σωστή).
4) RECOMMENDATION — η τελική, αποφασιστική σύσταση.

ΚΑΝΟΝΕΣ:
- Συγκεκριμένα, με ονόματα/πρόσωπα/γεγονότα από τα στοιχεία. ΟΧΙ generic.
- ΜΗΝ εφευρίσκεις ποσοστά δημοσκοπήσεων ή γεγονότα που δεν υπάρχουν.
- Ζεστή, καθαρή φωνή έμπειρου συμβούλου που παίρνει θέση.
- Οι πιθανότητες των foresight paths να αθροίζουν περίπου 100.

ΜΟΡΦΗ — ΕΠΙΣΤΡΕΨΕ ΜΟΝΟ ΕΓΚΥΡΟ JSON, χωρίς markdown, χωρίς code fences, με ΑΚΡΙΒΩΣ αυτό το σχήμα:
{
  "situation": { "headline": "σύντομος τίτλος κατάστασης", "where_it_stands": "1-2 προτάσεις: πού στέκεται τώρα" },
  "foresight": [
    { "label": "Κλιμάκωση", "path": "escalate", "probability": 55, "rationale": "γιατί", "signals": ["σήμα 1","σήμα 2"], "window": "π.χ. 3-7 ημέρες" }
  ],
  "moves": [
    { "label": "Δήλωση τώρα", "move": "act_now", "best_for_path": "escalate", "upside": "...", "downside": "...", "who_gains": "...", "who_loses": "...", "opponent_counter": "...", "risk": "medium" }
  ],
  "connection": "ο συλλογισμός που ενώνει foresight και κίνηση",
  "recommendation": { "move_label": "Δήλωση τώρα", "because": "γιατί αυτή", "watch": ["τι να παρακολουθείς 1","2"] }
}
Επιτρεπτά path: escalate | deescalate | pivot | stall. Επιτρεπτά move: act_now | wait | institutional | attack | silent. Επιτρεπτό risk: low | medium | high.`;
}

function buildSystem(partyProfile: any, partyKey: string) {
  const base = `${buildNorayaStrategicSystemPrompt()}

ΕΙΣΑΙ Ο ΣΥΜΒΟΥΛΟΣ ΣΕΝΑΡΙΩΝ. Δεν είσαι ουδέτερος αναλυτής. Παράγεις πιθανές εξελίξεις ΚΑΙ συνέπειες κινήσεων, ενωμένες σε έναν καθαρό συλλογισμό που καταλαβαίνει ο σύμβουλος. Κάθε σενάριο δεμένο με το συγκεκριμένο γεγονός και τις πηγές του.`;
  if (!partyProfile) return base;
  return `${base}

ΓΙΑ ΠΟΙΟΝ ΔΟΥΛΕΥΕΙΣ — ΚΡΙΣΙΜΟ:
Είσαι ο ΠΡΟΣΩΠΙΚΟΣ σύμβουλος του κόμματος με key "${partyKey}". ΟΛΑ τα σενάρια και οι κινήσεις είναι ΑΠΟ ΤΗ ΔΙΚΗ ΤΟΥ ΣΚΟΠΙΑ. Σέβεσαι θέση, τόνο και κόκκινες γραμμές του προφίλ.

ΠΡΟΦΙΛ ΚΟΜΜΑΤΟΣ (JSON):
${JSON.stringify(partyProfile)}`;
}

async function callAnthropic(system: string, user: string): Promise<{ text: string | null; status: number | null; error: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, status: null, error: "MISSING ANTHROPIC_API_KEY" };
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: 8000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (e: any) {
    return { text: null, status: null, error: "FETCH_THREW: " + String(e?.message || e) };
  }
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return { text: null, status: res.status, error: (body || "").slice(0, 600) };
  }
  const data = await res.json();
  const text = (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return { text: text || null, status: res.status, error: text ? null : "EMPTY_AI_TEXT" };
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token !== process.env.CRON_SECRET && token !== "dev") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const eventId = url.searchParams.get("event_id");
    const partyKey = url.searchParams.get("party") || "elas";
    if (!eventId) return NextResponse.json({ error: "missing event_id" }, { status: 400 });

    const supabase = svc();

    const { data: ev, error } = await supabase
      .from("v_political_events_live")
      .select("*")
      .eq("id", eventId)
      .single();
    if (error || !ev) {
      return NextResponse.json({ error: "event_not_found", detail: error?.message || null }, { status: 404 });
    }

    let brief: any = null;
    try {
      const { data: pb } = await supabase
        .from("event_party_briefs")
        .select("framing_summary,recommended_action,avoid_action,red_team_warning")
        .eq("event_id", eventId)
        .eq("party_key", partyKey)
        .maybeSingle();
      brief = pb || null;
    } catch {
      brief = null;
    }

    const partyProfile = await loadPartyProfile(supabase, partyKey);
    const system = buildSystem(partyProfile, partyKey);
    const userMsg = buildScenarioContext(ev, brief, partyKey);

    const ai = await callAnthropic(system, userMsg);
    const parsed = ai.text ? parseAiJson(ai.text) : null;

    if (!parsed || !parsed.foresight || !parsed.moves) {
      return NextResponse.json(
        { error: "ai_unavailable", detail: ai.error || "unparseable", raw: ai.text ? ai.text.slice(0, 400) : null },
        { status: 502 }
      );
    }

    // Αποθήκευση σεναρίων στο brief (ώστε να τα ΞΕΡΕΙ ο σύμβουλος-chat) — preserve υπόλοιπο brief
    try {
      const compact = {
        headline: parsed?.situation?.headline || null,
        foresight: Array.isArray(parsed?.foresight)
          ? parsed.foresight.map((f: any) => ({ label: f?.label, path: f?.path, probability: f?.probability, window: f?.window }))
          : [],
        recommendation: parsed?.recommendation || null,
        generated_at: new Date().toISOString(),
      };
      const { data: existingBrief } = await supabase
        .from("event_party_briefs")
        .select("advisor_brief")
        .eq("event_id", eventId)
        .eq("party_key", partyKey)
        .maybeSingle();
      const prevBrief =
        existingBrief?.advisor_brief && typeof existingBrief.advisor_brief === "object" ? existingBrief.advisor_brief : {};
      await supabase.from("event_party_briefs").upsert(
        {
          event_id: eventId,
          party_key: partyKey,
          advisor_brief: { ...prevBrief, scenarios: compact },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,party_key" }
      );
    } catch {
      // μη μπλοκάρεις την απάντηση αν αποτύχει η αποθήκευση
    }

    return NextResponse.json({
      success: true,
      event: { id: ev.id, title: ev.title, topic: ev.topic },
      party: partyKey,
      scenarios: parsed,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
