import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getMemoryBlock, getAudienceMemoryBlock } from "@/lib/noraya/political-memory";
import { fetchPollsSnapshot, formatPollsForPrompt } from "@/lib/noraya/live-polls";
import {
  buildNorayaStrategicSystemPrompt,
  buildNorayaStrategicJsonInstruction,
} from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Per-Event Advisor Brief (political-advisor upgrade)
//
// - Δεν αλλάζει scoring / βάση / cron.
// - Γράφει advisor_brief πάνω στο ΣΥΓΚΕΚΡΙΜΕΝΟ γεγονός.
// - Χρησιμοποιεί τις πηγές του γεγονότος (evidence_articles) στο prompt.
// - Υποστηρίζει ?force=1 για regeneration χωρίς SQL.
// ============================================================

const ANALYSIS_MODEL = "claude-sonnet-4-6";
const MAX_EVENTS_PER_RUN = 8;
const BUDGET_MS = 220000;

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

  // Σωσίβιο: αν το JSON κόπηκε (truncated), κλείσε ό,τι έμεινε ανοιχτό
  // ώστε να σωθούν τα πρώτα (και σημαντικότερα) τμήματα της ανάλυσης.
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

function articleScore(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function roleLabel(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("primary")) return "Κύριο άρθρο";
  if (normalized.includes("support")) return "Υποστηρικτικό άρθρο";
  if (normalized.includes("fallback")) return "Συμπληρωματικό άρθρο";
  return "Άρθρο τεκμηρίωσης";
}

function buildEvidenceLines(ev: any) {
  const articles = Array.isArray(ev.evidence_articles) ? ev.evidence_articles : [];
  return articles
    .slice(0, 12)
    .map((a: any, index: number) => {
      const score = articleScore(a.score);
      return `${index + 1}. Πηγή: ${a.source || "—"}\n   Τίτλος: ${a.title || "—"}\n   Score άρθρου: ${score ?? "—"}\n   Ρόλος: ${roleLabel(a.role)}\n   Ημερομηνία: ${a.published_at || "—"}\n   URL: ${a.url || "—"}`;
    })
    .join("\n\n");
}

function buildEventContext(ev: any) {
  const evidence = buildEvidenceLines(ev);

  return `ΠΟΛΙΤΙΚΟ ΓΕΓΟΝΟΣ ΠΡΟΣ ΑΝΑΛΥΣΗ

Θεματική: ${ev.topic || "—"}
Γεγονός: ${ev.title || "—"}
Σύνοψη: ${ev.summary || "—"}
Κατάσταση: ${ev.status || "—"}
Raw event score: ${ev.event_score ?? "—"}
Βαθμός τεκμηρίωσης: ${ev.documentation_level || "initial"}
Άρθρα: ${ev.article_count ?? 0} από ${ev.source_count ?? 0} πηγές

ΠΗΓΕΣ / ΑΡΘΡΑ ΠΟΥ ΣΤΗΡΙΖΟΥΝ ΤΟ ΓΕΓΟΝΟΣ:
${evidence || "—"}

ΑΝΑΛΥΣΕ ΑΥΤΟ ΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ ΓΕΓΟΝΟΣ.
Μην απαντήσεις γενικά για τη θεματική.
Μη γράψεις generic φράσεις τύπου "κρατάμε θεσμική γραμμή" αν δεν εξηγείς πρακτικά τι σημαίνει.
Χρησιμοποίησε μόνο τα παραπάνω στοιχεία. Μην εφευρίσκεις γεγονότα, ποσοστά ή δημοσκοπήσεις.

ΦΩΝΗ — ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
Μίλα σαν έμπειρος, ζεστός πολιτικός σύμβουλος που κάθεται δίπλα στον πελάτη.
Ανθρώπινα, καθαρά, με σιγουριά και ενσυναίσθηση — σαν να μιλάς σε άνθρωπο, όχι σε μηχανή.
ΟΧΙ ρομποτικές/τυποποιημένες φράσεις. ΟΧΙ γενικότητες. ΟΧΙ ξύλινη γλώσσα.
Χρησιμοποίησε συγκεκριμένα ονόματα, πρόσωπα και γεγονότα από τα στοιχεία.
Να είσαι αποφασιστικός στη σύσταση: πες ξεκάθαρα τι θα έκανες, σαν σύμβουλος που παίρνει θέση.

ΥΠΟΧΡΕΩΤΙΚΑ ΝΑ ΠΑΡΑΓΕΙΣ ΠΟΛΙΤΙΚΗ ΣΥΜΒΟΥΛΗ ΜΕ:
- ποια πρόσωπα/actors εμπλέκονται και ο ρόλος τους (εντόπισέ τα από τα άρθρα)
- ποιο κοινό επηρεάζεται
- ποια είναι η παγίδα
- ποιος κερδίζει / ποιος χάνει
- τι λέει ο δικός μας φορέας που δεν λένε οι άλλοι
- πώς διαφοροποιούμαστε από ανταγωνιστές
- τι κάνουμε σήμερα
- τι δεν λέμε
- τι αποφεύγουμε
- πότε κλιμακώνουμε
- ποια δημόσια γραμμή βγαίνει τώρα

Αν δεν υπάρχει επαρκές δημοσκοπικό ή actor context, πες το καθαρά μέσα στο evidence/uncertainty, αλλά ΜΗΝ γίνεις generic.

ΣΗΜΑΝΤΙΚΟ ΓΙΑ ΤΗ ΜΟΡΦΗ:
- Επίστρεψε ΜΟΝΟ έγκυρο JSON.
- ΧΩΡΙΣ markdown.
- ΧΩΡΙΣ \`\`\` code fences.
- Κράτα κάθε πεδίο κειμένου ζεστό αλλά ΣΥΝΤΟΜΟ: 1-3 προτάσεις, χωρίς φλυαρία.`;
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

function buildPartySystem(base: string, partyProfile: any, partyKey: string) {
  if (!partyProfile) return base;
  return `${base}

ΓΙΑ ΠΟΙΟΝ ΔΟΥΛΕΥΕΙΣ — ΚΡΙΣΙΜΟ:
Είσαι ο ΠΡΟΣΩΠΙΚΟΣ σύμβουλος του κόμματος με key "${partyKey}". ΟΛΕΣ οι συμβουλές δίνονται ΑΠΟ ΤΗ ΔΙΚΗ ΤΟΥ ΣΚΟΠΙΑ: τι κάνει, τι λέει, πώς τοποθετείται ΑΥΤΟ το κόμμα — ΟΧΙ "τι πρέπει να κάνει η κυβέρνηση" (εκτός αν αυτό το κόμμα ΕΙΝΑΙ η κυβέρνηση). Σέβεσαι απόλυτα τη θέση, τον τόνο, τις κόκκινες γραμμές και τις advisor_instructions του προφίλ. Αν το γεγονός αφορά αντίπαλο ή την κυβέρνηση, η σύστασή σου είναι πώς το εκμεταλλεύεται ή απαντά ΑΥΤΟ το κόμμα.

ΠΡΟΦΙΛ ΚΟΜΜΑΤΟΣ (JSON):
${JSON.stringify(partyProfile)}`;
}

function buildSystem() {
  return `${buildNorayaStrategicSystemPrompt()}

ΕΠΙΠΛΕΟΝ ΚΑΝΟΝΕΣ ΓΙΑ PER-EVENT ADVISOR:
Είσαι πολιτικός σύμβουλος επιτελείου. Δεν είσαι dashboard και δεν είσαι ουδέτερος αναλυτής.
Ο χρήστης χρειάζεται απόφαση και γραμμή, όχι γενική παρατήρηση.
Κάθε brief πρέπει να είναι δεμένο με το συγκεκριμένο γεγονός και τις πηγές του.

Απαγορεύονται ως τελική απάντηση χωρίς εξήγηση:
- "παρακολουθούμε την ένταση"
- "κρατάμε θεσμική γραμμή"
- "χρειάζεται περισσότερη τεκμηρίωση"

Αν χρειάζεται προσοχή, εξήγησε ακριβώς:
- ποια λέξη αποφεύγουμε
- ποιο timing κρατάμε
- ποια φράση λέμε δημόσια
- ποια κίνηση κάνουμε εσωτερικά

${buildNorayaStrategicJsonInstruction()}`;
}

async function callAnthropic(
  system: string,
  user: string
): Promise<{ text: string | null; status: number | null; error: string | null }> {
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
    } catch {}
    return { text: null, status: res.status, error: (body || "").slice(0, 600) };
  }

  const data = await res.json();
  const text = (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return { text: text || null, status: res.status, error: text ? null : "EMPTY_AI_TEXT" };
}

async function processOneEvent(
  supabase: ReturnType<typeof svc>,
  system: string,
  eventId: string,
  partyKey: string,
  origin: string
): Promise<{ status: "ai" | "ai_down"; title?: string; ai_error?: string | null }> {
  const { data: ev, error } = await supabase
    .from("v_political_events_live")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error || !ev) return { status: "ai_down", ai_error: error?.message || "event_not_found" };

  // ΔΕΔΟΜΕΝΑ ΜΝΗΜΗΣ: τροφοδότηση του brief από CSV #1/#2/#3 + ζωντανές δημοσκοπήσεις
  let dataContext = "";
  try {
    const [mem, aud] = await Promise.all([
      getMemoryBlock(origin, ev?.topic || ev?.title || ""),
      getAudienceMemoryBlock(origin, partyKey),
    ]);
    let pollsTxt = "";
    try {
      pollsTxt = formatPollsForPrompt(await fetchPollsSnapshot());
    } catch {
      pollsTxt = "";
    }
    dataContext = [mem, aud, pollsTxt].filter(Boolean).join("\n\n");
  } catch {
    dataContext = "";
  }
  const eventContextFull = dataContext
    ? `${buildEventContext(ev)}\n\n=== ΔΕΔΟΜΕΝΑ ΜΝΗΜΗΣ (στήριξε το brief· διαρθρωτικά/ιστορικά = ΟΧΙ σημερινά, δημοσκοπήσεις = τρέχουσες με ημερομηνία· μην εφευρίσκεις ποσοστά) ===\n${dataContext}`
    : buildEventContext(ev);

  const ai = await callAnthropic(system, eventContextFull);
  const parsed = ai.text ? parseAiJson(ai.text) : null;

  if (!(parsed && parsed.issue)) {
    const diag = ai.error || (ai.text ? "UNPARSEABLE_AI_TEXT: " + ai.text.slice(0, 400) : "NO_AI_TEXT");
    return { status: "ai_down", title: ev.title, ai_error: diag };
  }

  const brief = parsed;
  const framing =
    brief?.strategic_diagnosis?.framing_diagnosis || brief?.issue?.dominant_frame || ev.summary || null;
  const recommended =
    brief?.daily_brief?.immediate_recommendation ||
    brief?.strategic_diagnosis?.recommended_posture_explanation ||
    null;
  const avoid = brief?.daily_brief?.avoid_today || null;
  const redTeam = brief?.strategic_diagnosis?.strategic_risk || brief?.issue?.political_risk || null;
  const summary = brief?.daily_brief?.what_is_happening || ev.summary || null;

  // Διατήρησε τυχόν voices_pulse (από τα Πρόσωπα) ώστε να μη χαθεί όταν ξαναγράφεται το brief.
  let mergedBrief: any = brief;
  try {
    const { data: existingRow } = await supabase
      .from("event_party_briefs")
      .select("advisor_brief")
      .eq("event_id", eventId)
      .eq("party_key", partyKey)
      .maybeSingle();
    const prevPulse = (existingRow?.advisor_brief as any)?.voices_pulse;
    if (prevPulse) mergedBrief = { ...brief, voices_pulse: prevPulse };
  } catch {
    /* αν αποτύχει, γράφουμε το brief κανονικά */
  }

  await supabase
    .from("event_party_briefs")
    .upsert(
      {
        event_id: eventId,
        party_key: partyKey,
        advisor_brief: mergedBrief,
        framing_summary: framing,
        recommended_action: recommended,
        avoid_action: avoid,
        red_team_warning: redTeam,
        summary,
        brief_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,party_key" }
    );

  return { status: "ai", title: ev.title };
}

async function pickForceEventIds(supabase: ReturnType<typeof svc>, requestedId: string | null, limit: number) {
  if (requestedId) return [requestedId];

  const { data } = await supabase
    .from("v_political_events_live")
    .select("id")
    .order("event_score", { ascending: false })
    .order("last_article_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  return Array.isArray(data) ? data.map((row: any) => row.id).filter(Boolean) : [];
}

async function handle(request: Request) {
  try {
    const supabase = svc();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("event_id");
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    const partyKey = url.searchParams.get("party") || "elas";
    const partyProfile = await loadPartyProfile(supabase, partyKey);
    const system = buildPartySystem(buildSystem(), partyProfile, partyKey);

    if (force) {
      // Λίγα τη φορά + όριο χρόνου, ώστε να μην ξεπερνά τον χρόνο του Vercel (504).
      const forceLimit = requestedId
        ? 1
        : Math.max(1, Math.min(MAX_EVENTS_PER_RUN, Number(url.searchParams.get("limit")) || 2));
      const ids = await pickForceEventIds(supabase, requestedId, forceLimit);
      const done: Array<{ title?: string }> = [];
      let aiError: string | null = null;
      const startedAt = Date.now();

      for (const id of ids) {
        if (Date.now() - startedAt > BUDGET_MS) break;
        const r = await processOneEvent(supabase, system, id, partyKey, url.origin);
        if (r.status === "ai_down") {
          aiError = r.ai_error || "ai_down";
          break;
        }
        done.push({ title: r.title });
      }

      return NextResponse.json({
        ok: true,
        mode: requestedId ? "single_force" : "force_batch",
        analyzed: done.length,
        ai_error: aiError,
        detail: done,
      });
    }

    if (requestedId) {
      const r = await processOneEvent(supabase, system, requestedId, partyKey, url.origin);
      return NextResponse.json({ ok: true, mode: "single", analyzed: r.status === "ai" ? 1 : 0, ai_error: r.ai_error || null, processed: r });
    }

    const startedAt = Date.now();
    const done: Array<{ title?: string }> = [];
    let aiError: string | null = null;
    let count = 0;

    while (count < MAX_EVENTS_PER_RUN && Date.now() - startedAt < BUDGET_MS) {
      const { data: nextId } = await supabase.rpc("pick_next_event_for_party_brief", { p_party_key: partyKey });
      const eventId = (nextId as string) || null;
      if (!eventId) break;

      const r = await processOneEvent(supabase, system, eventId, partyKey, url.origin);
      if (r.status === "ai_down") {
        aiError = r.ai_error || "ai_down";
        break;
      }
      done.push({ title: r.title });
      count += 1;
    }

    const { data: more } = await supabase.rpc("pick_next_event_for_party_brief", { p_party_key: partyKey });

    return NextResponse.json({
      ok: true,
      mode: "batch",
      analyzed: done.length,
      ai_error: aiError,
      remaining_event: (more as string) || null,
      detail: done,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
