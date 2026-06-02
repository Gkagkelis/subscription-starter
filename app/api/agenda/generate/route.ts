import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/agenda/generate/route.ts   (ΒΗΜΑ 6 — ROBUST + DEBUG έκδοση)
 *
 * Αλλαγές vs προηγούμενο:
 *  - Ανθεκτικό parsing: εξάγει το JSON ακόμη κι αν το μοντέλο το τυλίξει σε
 *    κείμενο/markdown (πιάνει το πρώτο {...} block).
 *  - Με ?token=dev επιστρέφει "debug" με το ΑΚΡΙΒΕΣ κείμενο του μοντέλου.
 *  - Πλουσιότερο prompt + περισσότερο context (scores) ώστε να μη γυρνά άδειο.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Εξάγει JSON object από οποιοδήποτε κείμενο (markdown, prefix κ.λπ.). */
function extractJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    // πιάσε το πρώτο balanced {...}
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = t.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const isDev = token === "dev";
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

  // 1) Context: τι ΗΔΗ καλύπτεται, με scores.
  let briefs: any[] = [];
  try {
    const { data } = await supabase
      .from("v_advisor_agenda_briefs_recent")
      .select("topic, article_count, source_count, agenda_score")
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
    "Είσαι ο στρατηγικός σχεδιαστής ατζέντας της Noraya, για ελληνικό πολιτικό φορέα.",
    "Σου δίνονται τα θέματα που ΗΔΗ καλύπτονται (με σκορ). Δουλειά σου:",
    "- gaps: 3-5 θέματα/γωνίες που ΥΠΟ-καλύπτονται ή λείπουν.",
    "- narratives: 3 νέα αφηγήματα (title + angle).",
    "- slogans: 4-6 σύντομα μηνύματα/συνθήματα.",
    "- initiatives: 3 ιδέες πρωτοβουλιών (title + description).",
    "- proposed_situation: 1 πρόταση νέας κατάστασης (title, topic, why).",
    "ΜΗΝ εφεύρεις γεγονότα/αριθμούς/δηλώσεις. Πρότεινε στρατηγικές κατευθύνσεις.",
    "Γράψε ΣΤΑ ΕΛΛΗΝΙΚΑ.",
    "ΕΠΕΣΤΡΕΨΕ ΜΟΝΟ έγκυρο JSON, χωρίς markdown, χωρίς επεξηγήσεις πριν/μετά.",
    'Σχήμα ΑΚΡΙΒΩΣ: {"gaps":["..."],"narratives":[{"title":"...","angle":"..."}],"slogans":["..."],"initiatives":[{"title":"...","description":"..."}],"proposed_situation":{"title":"...","topic":"...","why":"..."}}',
  ].join("\n");

  const userContent = `Focus: ${focus || "γενική ενίσχυση ατζέντας"}\n\nΘέματα που ΗΔΗ καλύπτονται (JSON):\n${JSON.stringify(
    briefs.map((b) => ({ topic: b.topic, score: b.agenda_score, articles: b.article_count, sources: b.source_count }))
  )}`;

  let rawText = "";
  let providerStatus = 0;
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
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    providerStatus = response.status;
    const responseText = await response.text();

    if (!response.ok) {
      console.error("agenda provider error:", response.status, responseText.slice(0, 400));
      return NextResponse.json(
        {
          ok: false,
          message: "Η δημιουργία ατζέντας δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
          ...(isDev ? { debug: { provider_status: providerStatus, provider_body: responseText.slice(0, 800) } } : {}),
        },
        { status: 502 }
      );
    }

    const data = JSON.parse(responseText);
    rawText = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n");
  } catch (err: any) {
    console.error("agenda fetch failed:", err?.message || err);
    return NextResponse.json(
      {
        ok: false,
        message: "Η μηχανή ατζέντας δεν αποκρίθηκε. Δοκιμάστε ξανά.",
        ...(isDev ? { debug: { stage: "fetch", error: String(err?.message || err) } } : {}),
      },
      { status: 502 }
    );
  }

  const parsed = extractJson(rawText) || {};
  const proposalData = {
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    narratives: Array.isArray(parsed.narratives) ? parsed.narratives : [],
    slogans: Array.isArray(parsed.slogans) ? parsed.slogans : [],
    initiatives: Array.isArray(parsed.initiatives) ? parsed.initiatives : [],
    proposed_situation: parsed.proposed_situation && typeof parsed.proposed_situation === "object" ? parsed.proposed_situation : {},
  };

  // 2) Αποθήκευση.
  let saved: any = null;
  try {
    const { data, error } = await supabase
      .from("agenda_proposals")
      .insert({
        organization_id: orgId,
        source: "agenda_builder",
        status: "candidate",
        ...proposalData,
        evidence_basis: briefs.map((b) => ({ topic: b.topic })),
      })
      .select("*")
      .single();
    if (error) throw error;
    saved = data;
  } catch (err: any) {
    console.error("agenda persist failed:", err?.message || err);
    return NextResponse.json({
      ok: true,
      saved: false,
      proposal: proposalData,
      ...(isDev ? { debug: { model_raw: rawText.slice(0, 1200) } } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    proposal: saved,
    ...(isDev ? { debug: { parsed_ok: Object.keys(parsed).length > 0, model_raw: rawText.slice(0, 1200) } } : {}),
  });
}
