import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOPICS = [
  "Ακρίβεια / κόστος ζωής", "Οικονομία", "Φορολογία", "Στέγαση", "Εργασία",
  "Ασφαλιστικό / συντάξεις", "Υγεία", "Παιδεία", "Πανεπιστήμια", "Νεολαία",
  "Μεταναστευτικό", "Ασφάλεια / εγκληματικότητα", "Δικαιοσύνη", "Θεσμοί / διαφάνεια",
  "Άμυνα", "Γεωπολιτική", "Εξωτερική πολιτική", "Ενέργεια", "Περιβάλλον / κλιματική κρίση",
  "Αγροτικά", "Υποδομές / μεταφορές", "Ψηφιακή πολιτική / τεχνολογία", "Πολιτισμός",
  "Αθλητισμός", "Τοπική αυτοδιοίκηση", "Ευρωπαϊκή πολιτική", "Ανθρώπινα δικαιώματα",
  "Ισότητα / συμπερίληψη", "Πολιτική προστασία",
];

function clampNumber(value: any, min = 0, max = 10): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

const classifierModel =
  process.env.ANTHROPIC_CLASSIFIER_MODEL || "claude-haiku-4-5-20251001";

// Ταξινομεί ΕΝΑ batch. Επιστρέφει πόσα ταξινόμησε (0 = τέλος ή σφάλμα).
async function classifyBatch(limit: number): Promise<{ done: number; total: number; error?: string }> {
  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("id, title, description, category, source_name, published_at")
    .is("classified_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (fetchError) return { done: 0, total: 0, error: fetchError.message };
  if (!articles || articles.length === 0) return { done: 0, total: 0 };

  const articlesList = articles
    .map(
      (a: any, i: number) =>
        `[${i}]\nΤΙΤΛΟΣ: ${a.title}\nΠΕΡΙΓΡΑΦΗ: ${(a.description || "").substring(0, 350)}\nΠΗΓΗ: ${a.source_name || "—"}\nΚΑΤΗΓΟΡΙΑ RSS: ${a.category || "—"}\nΔΗΜΟΣΙΕΥΣΗ: ${a.published_at || "—"}`
    )
    .join("\n\n");

  const prompt = `Είσαι ο classifier του Noraya, ενός public affairs / political intelligence radar για την Ελλάδα.

ΔΕΝ ταξινομείς μόνο στενή κομματική πολιτική.
Θέλουμε να πιάνεις τη δημόσια πραγματικότητα που μπορεί να επηρεάσει πολιτική ατζέντα, κοινωνική ένταση, κράτος, θεσμούς, εμπιστοσύνη, στρατηγική επικοινωνία ή κυβερνητική/αντιπολιτευτική ευθύνη.

Relevant αν αφορά: κόμματα, κυβέρνηση, αντιπολίτευση, Βουλή, υπουργεία, κράτος, δημόσια διοίκηση, ΕΛ.ΑΣ, δικαιοσύνη, θεσμούς, διαφάνεια, σκάνδαλα, οικονομία, ακρίβεια, φόρους, εργασία, μισθούς, συντάξεις, υγεία, παιδεία, κοινωνικό κράτος, υποδομές, μεταφορές, ενέργεια, περιβάλλον, διαμαρτυρίες, απεργίες, μεταναστευτικό, δικαιώματα, ισότητα, γεωπολιτική, Τουρκία, ΕΕ, άμυνα, φυσικές καταστροφές, πολιτική προστασία, αστοχίες κράτους.

Noise αν είναι καθαρά: αθλητικά χωρίς θεσμική προέκταση, lifestyle, celebrities, ψυχαγωγία, συνταγές, ζώδια, άσχετα διεθνή.

Για κάθε άρθρο δώσε:
- topic: ΕΝΑ από: ${TOPICS.join(", ")}
- sentiment: "θετικό"/"αρνητικό"/"ουδέτερο"
- relevance: 1-10
- is_political: true/false
- public_relevance: true/false
- relevance_domain: σύντομη κατηγορία
- situation_potential: 1-10
- agenda_potential: 1-10
- urgency: 1-10
- affected_groups: array 1-5
- why_it_matters: μία πρόταση
- is_noise: true/false
- noise_reason: reason ή null

ΑΠΑΝΤΗΣΕ ΜΟΝΟ ΣΕ JSON ARRAY, χωρίς markdown:
[{"index":0,"topic":"...","sentiment":"...","relevance":N,"is_political":true,"public_relevance":true,"relevance_domain":"...","situation_potential":N,"agenda_potential":N,"urgency":N,"affected_groups":["..."],"why_it_matters":"...","is_noise":false,"noise_reason":null}]

ΑΡΘΡΑ:
${articlesList}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: classifierModel,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) return { done: 0, total: articles.length, error: "AI error" };

  const data = await response.json();
  const text =
    data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "[]";

  let classifications: any[];
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    classifications = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    return { done: 0, total: articles.length, error: "parse_ai_json" };
  }

  let updated = 0;
  for (const c of classifications) {
    const article = articles[c.index];
    if (!article) continue;
    const isNoise = c.is_noise === true;
    const publicRelevance = c.public_relevance === true && !isNoise;
    const isPolitical = c.is_political === true || publicRelevance;

    const { error: updateError } = await supabase
      .from("articles")
      .update({
        topic: c.topic || null,
        sentiment: c.sentiment || null,
        relevance: clampNumber(c.relevance),
        is_political: isPolitical,
        public_relevance: publicRelevance,
        relevance_domain: c.relevance_domain || null,
        situation_potential: clampNumber(c.situation_potential),
        agenda_potential: clampNumber(c.agenda_potential),
        urgency: clampNumber(c.urgency),
        affected_groups: Array.isArray(c.affected_groups) ? c.affected_groups.slice(0, 5) : [],
        why_it_matters: c.why_it_matters || null,
        is_noise: isNoise,
        noise_reason: c.noise_reason || null,
        classification_status: "classified",
        classifier_version: "noraya_public_reality_radar_v2_compact",
        classified_at: new Date().toISOString(),
        model_used: classifierModel,
      })
      .eq("id", article.id);

    if (!updateError) updated++;
  }

  return { done: updated, total: articles.length };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batchSize = 25;
  const startedAt = Date.now();
  const BUDGET_MS = 270000; // 4.5 λεπτά (κάτω από maxDuration 300)

  let totalClassified = 0;
  let batches = 0;
  let lastError: string | undefined;

  while (Date.now() - startedAt < BUDGET_MS) {
    const r = await classifyBatch(batchSize);
    if (r.error) { lastError = r.error; if (r.done === 0) break; }
    if (r.total === 0) break; // τέλος — δεν υπάρχουν άλλα άρθρα
    totalClassified += r.done;
    batches += 1;
  }

  // Πόσα έμειναν;
  const { count: remaining } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .is("classified_at", null);

  return NextResponse.json({
    success: true,
    mode: "bulk_loop",
    batches,
    total_classified: totalClassified,
    remaining_unclassified: remaining ?? null,
    last_error: lastError || null,
    note: remaining && remaining > 0
      ? "Έμειναν άρθρα — ξαναπάτα το ίδιο link για να συνεχίσει."
      : "Όλα τα άρθρα ταξινομήθηκαν.",
  });
}
