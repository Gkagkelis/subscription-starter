import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/agenda/generate/route.ts        (ΒΗΜΑ 6)
 *
 * POST /api/agenda/generate?token=dev
 * body: { organization_id?: string, focus?: string }
 *
 * Κάνει το κουμπί «Δημιούργησε εσύ την ατζέντα» λειτουργικό:
 *  - διαβάζει τα τρέχοντα agenda briefs (τι ΗΔΗ καλύπτεται)
 *  - ζητά από το μοντέλο: gaps, narratives, slogans, initiatives, proposed_situation
 *  - αποθηκεύει ως record στο agenda_proposals (status: candidate)
 *
 * Evidence-gated: το μοντέλο δουλεύει πάνω στα ΥΠΑΡΧΟΝΤΑ θέματα, δεν εφευρίσκει
 * γεγονότα. Graceful errors, καμία raw provider λεπτομέρεια στον χρήστη.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const focus = String(body?.focus || "").trim();
  const orgId = body?.organization_id ?? null;

  // 1) Τι ΗΔΗ καλύπτεται (context, όχι εφεύρεση).
  let briefs: any[] = [];
  try {
    const { data } = await supabase
      .from("v_advisor_agenda_briefs_recent")
      .select("topic, agenda_score, political_risk_level, framing_summary, documentation_level")
      .order("agenda_score", { ascending: false })
      .limit(15);
    briefs = data || [];
  } catch (err: any) {
    console.error("agenda context load failed:", err?.message || err);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, message: "Η δημιουργία ατζέντας δεν είναι διαθέσιμη αυτή τη στιγμή." },
      { status: 503 }
    );
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system = [
    "Είσαι ο στρατηγικός σχεδιαστής ατζέντας της Noraya.",
    "Δουλεύεις πάνω στα ΥΠΑΡΧΟΝΤΑ θέματα ατζέντας που σου δίνονται.",
    "Στόχος: εντόπισε κενά (gaps) που ΔΕΝ καλύπτονται, και πρότεινε νέα αφηγήματα.",
    "ΜΗΝ εφεύρεις γεγονότα, δηλώσεις ή αριθμούς. Πρότεινε στρατηγικές κατευθύνσεις, όχι ψευδείς ισχυρισμούς.",
    "Γράψε στα ελληνικά. Απάντησε ΑΥΣΤΗΡΑ με έγκυρο JSON, χωρίς markdown.",
    'Σχήμα: {"gaps":[string], "narratives":[{"title":string,"angle":string}], "slogans":[string], "initiatives":[{"title":string,"description":string}], "proposed_situation":{"title":string,"topic":string,"why":string}}.',
  ].join("\n");

  const userContext = JSON.stringify({
    focus: focus || "γενική ενίσχυση ατζέντας",
    already_covered: briefs.map((b) => ({ topic: b.topic, score: b.agenda_score, risk: b.political_risk_level })),
  });

  let parsed: any;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: `Τρέχουσα ατζέντα (JSON):\n${userContext}` }],
      }),
    });

    if (!response.ok) {
      console.error("agenda provider error:", response.status, (await response.text()).slice(0, 400));
      return NextResponse.json(
        { ok: false, message: "Η δημιουργία ατζέντας δεν ολοκληρώθηκε. Δοκιμάστε ξανά." },
        { status: 502 }
      );
    }

    const data = await response.json();
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
      parsed = { gaps: [], narratives: [], slogans: [], initiatives: [], proposed_situation: {}, note: "Μη δομημένη απάντηση." };
    }
  } catch (err: any) {
    console.error("agenda fetch failed:", err?.message || err);
    return NextResponse.json(
      { ok: false, message: "Η μηχανή ατζέντας δεν αποκρίθηκε. Δοκιμάστε ξανά." },
      { status: 502 }
    );
  }

  // 2) Αποθήκευσε ως πρόταση.
  let saved: any = null;
  try {
    const { data, error } = await supabase
      .from("agenda_proposals")
      .insert({
        organization_id: orgId,
        source: "agenda_builder",
        status: "candidate",
        gaps: parsed?.gaps ?? [],
        narratives: parsed?.narratives ?? [],
        slogans: parsed?.slogans ?? [],
        initiatives: parsed?.initiatives ?? [],
        proposed_situation: parsed?.proposed_situation ?? {},
        evidence_basis: briefs.map((b) => ({ topic: b.topic })),
      })
      .select("*")
      .single();
    if (error) throw error;
    saved = data;
  } catch (err: any) {
    console.error("agenda persist failed:", err?.message || err);
    // Επιστρέφουμε το αποτέλεσμα ακόμη κι αν δεν αποθηκεύτηκε.
    return NextResponse.json({ ok: true, saved: false, proposal: parsed });
  }

  return NextResponse.json({ ok: true, saved: true, proposal: saved });
}
