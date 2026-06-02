import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/* ---------------------------------------------------------------------------
 * app/api/brain/analyze/route.ts   (ΒΗΜΑ 4 — DEBUG-ENABLED έκδοση)
 *
 * ΑΛΛΑΓΗ vs προηγούμενο: όταν καλείς με ?token=dev, η απάντηση σε σφάλμα
 * περιλαμβάνει πεδίο "debug" με τον ΠΡΑΓΜΑΤΙΚΟ κωδικό/μήνυμα του Anthropic.
 * Σε κανονική χρήση (χωρίς dev) ο χρήστης βλέπει ΜΟΝΟ καθαρό ελληνικό μήνυμα.
 *
 * Επίσης: αν το μοντέλο γυρίσει 404 (λάθος όνομα), δοκιμάζει ΜΙΑ φορά ένα
 * known-good fallback μοντέλο, ώστε να μη σε μπλοκάρει ένα λάθος ANTHROPIC_MODEL.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KINDS = new Set([
  "strategic_read",
  "options",
  "red_team",
  "intensity",
  "escalation",
  "comms",
  "full",
]);

const KIND_INSTRUCTIONS: Record<string, string> = {
  strategic_read:
    'Γύρνα JSON: {"strategic_read": string, "why_this_exists": string, "public_pulse": string}.',
  options:
    'Γύρνα JSON: {"decision_options": [{"label":"Α","title":string,"rationale":string,"risk":string},{"label":"Β",...},{"label":"Γ",...}]}.',
  red_team:
    'Γύρνα JSON: {"red_team": [{"attack": string, "likelihood": "low|medium|high", "defense": string}]}.',
  intensity:
    'Γύρνα JSON: {"intensity": {"public_attention": 0-100, "political_risk": 0-100, "opportunity": 0-100, "note": string}}.',
  escalation:
    'Γύρνα JSON: {"escalation": {"level":"watch|prepare|act","time_window": string, "recommendation": string}}.',
  comms:
    'Γύρνα JSON: {"communication_material": {"key_message": string, "talking_points": [string], "sample_post": string, "risk_note": string}}.',
  full:
    'Γύρνα JSON με ΟΛΑ τα κλειδιά: strategic_read, why_this_exists, drivers_and_sources, public_pulse, how_to_win, decision_options, communication_material, red_team, escalation, evidence_note.',
};

// Known-good fallback αν το ANTHROPIC_MODEL είναι λάθος (404).
const FALLBACK_MODELS = ["claude-sonnet-4-6", "claude-sonnet-4-6-20260218"];

function logUsage(row: Record<string, unknown>) {
  supabase.from("ai_usage_logs").insert(row).then(
    () => {},
    () => {}
  );
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.userContent }],
    }),
  });
  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, bodyText };
}

export async function POST(req: Request) {
  const started = Date.now();
  const token = new URL(req.url).searchParams.get("token");
  const isDev = token === "dev";
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }

  const situationId = String(body?.situation_id || "").trim();
  const kind = String(body?.kind || "strategic_read").trim();
  if (!situationId) return NextResponse.json({ ok: false, message: "Λείπει το situation_id." }, { status: 400 });
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, message: "Μη έγκυρος τύπος ανάλυσης." }, { status: 400 });

  // 1) Φόρτωση κατάστασης + evidence.
  let situation: any;
  try {
    const { data, error } = await supabase
      .from("v_situation_engine_live")
      .select("*")
      .eq("id", situationId)
      .maybeSingle();
    if (error) throw error;
    situation = data;
    if (!situation) {
      const fb = await supabase.from("political_situations").select("*").eq("id", situationId).maybeSingle();
      situation = fb.data;
    }
  } catch (err: any) {
    console.error("brain load failed:", err?.message || err);
    return NextResponse.json(
      { ok: false, message: "Δεν ήταν δυνατή η φόρτωση της κατάστασης.", ...(isDev ? { debug: { stage: "load", error: String(err?.message || err) } } : {}) },
      { status: 500 }
    );
  }
  if (!situation) return NextResponse.json({ ok: false, message: "Δεν βρέθηκε η κατάσταση." }, { status: 404 });

  const evidence = Array.isArray(situation.evidence_articles) ? situation.evidence_articles : [];
  const articleCount: number = situation.evidence_article_count ?? evidence.length ?? 0;
  const sourceCount = new Set(evidence.map((e: any) => e?.source).filter(Boolean)).size;
  const lowBase = articleCount <= 1 || sourceCount <= 1;

  // 2) Cache.
  const inputSnapshot = JSON.stringify({
    kind,
    title: situation.title,
    topic: situation.topic,
    framing: situation.framing_summary,
    docLevel: situation.documentation_level,
    articleCount,
    sourceCount,
    evidence: evidence.map((e: any) => ({ t: e?.title, s: e?.source })),
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  });
  const inputHash = crypto.createHash("sha256").update(inputSnapshot).digest("hex").slice(0, 32);

  try {
    const cached = await supabase
      .from("analysis_cache")
      .select("result, model_used")
      .eq("situation_id", situationId)
      .eq("analysis_kind", kind)
      .eq("input_hash", inputHash)
      .maybeSingle();
    if (cached.data?.result) {
      logUsage({ route: "brain/analyze", situation_id: situationId, analysis_kind: kind, status: "cache_hit", model_used: cached.data.model_used, latency_ms: Date.now() - started });
      return NextResponse.json({
        ok: true,
        cached: true,
        kind,
        evidence_basis: { article_count: articleCount, source_count: sourceCount, low_base: lowBase },
        result: cached.data.result,
      });
    }
  } catch {
    // αγνόησε cache miss/σφάλμα, συνέχισε live.
  }

  // 3) Config guard.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, message: "Η μηχανή ανάλυσης δεν είναι διαθέσιμη αυτή τη στιγμή.", ...(isDev ? { debug: { stage: "config", error: "Λείπει το ANTHROPIC_API_KEY στο Vercel." } } : {}) },
      { status: 503 }
    );
  }

  // 4) Evidence-gated prompt.
  const primaryModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system = [
    "Είσαι ο αναλυτικός πυρήνας της Noraya, πλατφόρμας πολιτικής στρατηγικής νοημοσύνης.",
    "Κανόνες τεκμηρίωσης (αυστηροί):",
    "1. Στηρίξου ΜΟΝΟ στα δοθέντα στοιχεία (τίτλος, framing, άρθρα/πηγές).",
    "2. ΜΗΝ εφεύρεις πολιτικά γεγονότα, δηλώσεις, αριθμούς, δημοσκοπήσεις ή ονόματα που δεν δίνονται.",
    lowBase
      ? "3. Η βάση τεκμηρίωσης είναι ΧΑΜΗΛΗ (≤1 άρθρο/πηγή). Δήλωσέ το ρητά και κράτα χαμηλό βαθμό βεβαιότητας."
      : "3. Σημείωσε τον βαθμό βεβαιότητας με βάση το πλήθος/ποιότητα των πηγών.",
    "4. Γράψε στα ελληνικά, καθαρά, επιχειρησιακά.",
    "5. Απάντησε ΑΥΣΤΗΡΑ με έγκυρο JSON και τίποτα άλλο — χωρίς markdown.",
    KIND_INSTRUCTIONS[kind],
  ].join("\n");

  const userContent = `Δεδομένα κατάστασης (JSON):\n${JSON.stringify({
    title: situation.title,
    topic: situation.topic,
    status: situation.status,
    documentation_level: situation.documentation_level,
    framing_summary: situation.framing_summary,
    article_count: articleCount,
    source_count: sourceCount,
    evidence_articles: evidence.slice(0, 12).map((e: any) => ({ title: e?.title, source: e?.source, published_at: e?.published_at })),
  })}`;

  // 5) Κλήση με fallback μοντέλων.
  const tried: Array<{ model: string; status: number }> = [];
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];
  let success: { model: string; bodyText: string } | null = null;
  let lastStatus = 0;
  let lastBody = "";

  for (const model of modelsToTry) {
    try {
      const r = await callAnthropic({ apiKey: anthropicKey, model, system, userContent });
      tried.push({ model, status: r.status });
      if (r.ok) {
        success = { model, bodyText: r.bodyText };
        break;
      }
      lastStatus = r.status;
      lastBody = r.bodyText;
      // Μόνο αν είναι 404 (λάθος μοντέλο) δοκιμάζουμε επόμενο. Αλλιώς σταμάτα.
      if (r.status !== 404) break;
    } catch (err: any) {
      tried.push({ model, status: -1 });
      lastStatus = -1;
      lastBody = String(err?.message || err);
      break;
    }
  }

  if (!success) {
    console.error("brain provider error:", lastStatus, lastBody.slice(0, 400));
    logUsage({ route: "brain/analyze", situation_id: situationId, analysis_kind: kind, model_used: primaryModel, status: "provider_error", error_code: `http_${lastStatus}`, latency_ms: Date.now() - started });

    const hint =
      lastStatus === 401 ? "Το ANTHROPIC_API_KEY φαίνεται λάθος ή ληγμένο."
      : lastStatus === 404 ? "Το όνομα μοντέλου (ANTHROPIC_MODEL) δεν αναγνωρίζεται. Δοκίμασε να ΜΗΝ ορίσεις ANTHROPIC_MODEL, ώστε να πέσει στο default."
      : lastStatus === 429 ? "Rate limit ή εξαντλημένα credits στον λογαριασμό Anthropic."
      : lastStatus === 400 ? "Κακοδιατυπωμένο αίτημα προς το Anthropic."
      : "Άγνωστο σφάλμα από τον πάροχο.";

    return NextResponse.json(
      {
        ok: false,
        message: "Η ανάλυση δεν ολοκληρώθηκε. Δοκιμάστε ξανά σε λίγο.",
        ...(isDev ? { debug: { provider_status: lastStatus, hint, models_tried: tried, provider_body: lastBody.slice(0, 800) } } : {}),
      },
      { status: 502 }
    );
  }

  // 6) Parse.
  let parsed: any;
  let usage: any = {};
  try {
    const data = JSON.parse(success.bodyText);
    usage = data?.usage || {};
    const text = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { note: "Η ανάλυση επεστράφη σε μη δομημένη μορφή.", raw_text: text.slice(0, 2000) };
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: "Η απάντηση της ανάλυσης δεν ήταν αναγνώσιμη.", ...(isDev ? { debug: { stage: "parse", error: String(err?.message || err) } } : {}) },
      { status: 502 }
    );
  }

  const evidenceBasis = evidence.slice(0, 12).map((e: any) => ({ title: e?.title, source: e?.source }));

  // 7) Persist (σφάλματα εδώ ΔΕΝ χαλάνε την απάντηση).
  try {
    await supabase.from("analysis_cache").upsert(
      {
        situation_id: situationId,
        organization_id: situation.organization_id ?? null,
        analysis_kind: kind,
        input_hash: inputHash,
        model_used: success.model,
        result: parsed,
        evidence_basis: evidenceBasis,
      },
      { onConflict: "situation_id,analysis_kind,input_hash" }
    );
    const detailMerge = kind === "full" ? parsed : { [kind]: parsed };
    const current = situation.situation_detail && typeof situation.situation_detail === "object" ? situation.situation_detail : {};
    await supabase
      .from("political_situations")
      .update({ situation_detail: { ...current, ...detailMerge }, updated_at: new Date().toISOString() })
      .eq("id", situationId);
  } catch (err: any) {
    console.error("brain persist failed:", err?.message || err);
  }

  logUsage({
    route: "brain/analyze",
    situation_id: situationId,
    organization_id: situation.organization_id ?? null,
    analysis_kind: kind,
    model_used: success.model,
    status: "ok",
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    latency_ms: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    cached: false,
    kind,
    model_used: success.model,
    evidence_basis: { article_count: articleCount, source_count: sourceCount, low_base: lowBase },
    result: parsed,
  });
}
