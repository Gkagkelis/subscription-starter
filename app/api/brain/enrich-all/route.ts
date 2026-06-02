import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/brain/enrich-all/route.ts
 *
 * ΣΚΟΠΟΣ: Γεμίζει τις active καταστάσεις με ΠΡΑΓΜΑΤΙΚΗ ανάλυση, ΓΡΑΦΟΝΤΑΣ
 * στα πεδία που το Strategy Room UI ΗΔΗ διαβάζει:
 *   - framing_summary      -> Strategic Read / "Γιατί υπάρχει"
 *   - strategic_question   -> διάγνωση
 *   - recommended_action   -> "Πώς κερδίζεται" / κίνηση
 *   - avoid_action         -> η παγίδα
 *   - red_team_warning     -> red team
 *   - situation_detail      -> πλήρες object (για μελλοντική χρήση)
 *
 * Έτσι ΔΕΝ χρειάζεται καμία αλλαγή στο page.tsx — το UI απλώς σταματά να
 * δείχνει τα fallback κείμενα και δείχνει την πραγματική ανάλυση.
 *
 * ΧΡΗΣΗ (μία φορά, ή όποτε θες ανανέωση):
 *   GET /api/brain/enrich-all?token=dev            -> όλες οι active
 *   GET /api/brain/enrich-all?token=dev&limit=3    -> μόνο 3 (για δοκιμή)
 *   GET /api/brain/enrich-all?token=dev&min_docs=2 -> μόνο όσες έχουν >=2 πηγές
 *
 * EVIDENCE GATING: καταστάσεις με χαμηλή τεκμηρίωση (1 άρθρο/πηγή) ΔΕΝ
 * παίρνουν "σίγουρη" ανάλυση — παίρνουν προσεκτική, με ρητή επιφύλαξη.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeOne(situation: any) {
  const evidence = Array.isArray(situation.evidence_articles) ? situation.evidence_articles : [];
  const articleCount: number = situation.evidence_article_count ?? evidence.length ?? 0;
  const sourceCount = new Set(evidence.map((e: any) => e?.source).filter(Boolean)).size;
  const lowBase = articleCount <= 1 || sourceCount <= 1;

  const anthropicKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const system = [
    "Είσαι ο αναλυτικός πυρήνας της Noraya, πλατφόρμας πολιτικής στρατηγικής για ελληνικό πολιτικό φορέα.",
    "Αναλύεις ΜΙΑ πολιτική κατάσταση και επιστρέφεις δομημένη στρατηγική ανάγνωση.",
    "Κανόνες: στηρίξου ΜΟΝΟ στα δοθέντα άρθρα/πηγές. ΜΗΝ εφεύρεις γεγονότα/αριθμούς/δηλώσεις.",
    lowBase
      ? "ΠΡΟΣΟΧΗ: χαμηλή τεκμηρίωση (≤1 άρθρο/πηγή). Κράτα επιφυλακτικό τόνο και πες ότι χρειάζεται περισσότερη τεκμηρίωση."
      : "Η τεκμηρίωση είναι επαρκής· δώσε σαφή, επιχειρησιακή ανάλυση.",
    "Γράψε ΣΤΑ ΕΛΛΗΝΙΚΑ, καθαρά και πρακτικά.",
    "Επέστρεψε ΜΟΝΟ έγκυρο JSON, χωρίς markdown, με ΑΚΡΙΒΩΣ αυτά τα κλειδιά:",
    '{"strategic_read":"2-4 προτάσεις: τι σημαίνει στρατηγικά αυτή η κατάσταση",',
    '"why_this_exists":"γιατί υπάρχει / τι την τροφοδοτεί",',
    '"strategic_question":"το βασικό στρατηγικό ερώτημα",',
    '"the_trap":"η παγίδα / το ρίσκο μιας λάθος αντίδρασης",',
    '"opportunity":"η ευνοϊκή διάσταση / ευκαιρία",',
    '"recommended_move":"η συνιστώμενη κίνηση",',
    '"red_team":"η πιο πιθανή αντεπίθεση + πώς αντιμετωπίζεται",',
    '"central_message":"μία κεντρική γραμμή επικοινωνίας"}',
  ].join("\n");

  const userContent = `Κατάσταση (JSON):\n${JSON.stringify({
    title: situation.title,
    topic: situation.topic,
    documentation_level: situation.documentation_level,
    framing_summary: situation.framing_summary,
    article_count: articleCount,
    source_count: sourceCount,
    evidence_articles: evidence.slice(0, 12).map((e: any) => ({ title: e?.title, source: e?.source })),
  })}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 1200, system, messages: [{ role: "user", content: userContent }] }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`provider_${response.status}: ${body}`);
  }

  const data = await response.json();
  let textOut = (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(textOut);
  } catch {
    const s = textOut.indexOf("{");
    const e = textOut.lastIndexOf("}");
    parsed = s !== -1 && e > s ? JSON.parse(textOut.slice(s, e + 1)) : {};
  }

  return { parsed, articleCount, sourceCount, lowBase };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, message: "Λείπει το ANTHROPIC_API_KEY." }, { status: 503 });
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 30);
  const minDocs = parseInt(url.searchParams.get("min_docs") || "0", 10);

  // Φόρτωσε active καταστάσεις από το live view (έχει evidence).
  let situations: any[] = [];
  try {
    const { data, error } = await supabase
      .from("v_situation_engine_live")
      .select("*")
      .eq("status", "active")
      .limit(limit);
    if (error) throw error;
    situations = data || [];
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: "Αποτυχία φόρτωσης καταστάσεων.", detail: String(err?.message || err) }, { status: 500 });
  }

  const results: any[] = [];
  for (const s of situations) {
    const ac = s.evidence_article_count ?? (Array.isArray(s.evidence_articles) ? s.evidence_articles.length : 0);
    if (minDocs && ac < minDocs) {
      results.push({ id: s.id, title: s.title, skipped: true, reason: `low_docs(${ac})` });
      continue;
    }
    try {
      const { parsed, articleCount, sourceCount, lowBase } = await analyzeOne(s);

      // Γράψε στα πεδία που διαβάζει το UI.
      const update: Record<string, unknown> = {
        framing_summary: parsed.strategic_read || parsed.why_this_exists || s.framing_summary,
        strategic_question: parsed.strategic_question || s.strategic_question,
        recommended_action: parsed.recommended_move || s.recommended_action,
        avoid_action: parsed.the_trap || s.avoid_action,
        red_team_warning: parsed.red_team || s.red_team_warning,
        evidence_summary: parsed.why_this_exists || s.evidence_summary,
        situation_detail: {
          strategic_read: parsed.strategic_read,
          why_this_exists: parsed.why_this_exists,
          strategic_question: parsed.strategic_question,
          the_trap: parsed.the_trap,
          opportunity: parsed.opportunity,
          recommended_move: parsed.recommended_move,
          red_team: parsed.red_team,
          central_message: parsed.central_message,
          _evidence: { article_count: articleCount, source_count: sourceCount, low_base: lowBase },
        },
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("political_situations").update(update).eq("id", s.id);
      if (upErr) throw upErr;

      results.push({ id: s.id, title: s.title, ok: true, low_base: lowBase, article_count: articleCount });
    } catch (err: any) {
      console.error("enrich failed for", s.id, err?.message || err);
      results.push({ id: s.id, title: s.title, ok: false, error: String(err?.message || err).slice(0, 200) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    total: situations.length,
    enriched: okCount,
    failed: results.filter((r) => r.ok === false).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  });
}
