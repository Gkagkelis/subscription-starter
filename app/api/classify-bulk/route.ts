import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronBudgetOk, isCronOrAdmin, logPilotError, recordCronCall } from "@/lib/noraya/pilot";

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

const ROUTE = "/api/classify-bulk";

// Pilot — ΠΡΟΦΙΛΤΡΟ: άρθρα που η RSS κατηγορία τους είναι ΞΕΚΑΘΑΡΑ εκτός πεδίου
// (ζώδια, lifestyle/celebrities, συνταγές, μόδα/ομορφιά, ψυχαγωγία) τα σημειώνουμε
// noise ΧΩΡΙΣ κλήση AI. Είναι ακριβώς οι κατηγορίες που ο classifier χαρακτηρίζει
// ήδη «Noise» (βλ. prompt), άρα το αποτέλεσμα είναι το ίδιο — χωρίς κόστος.
// Κοιτάμε ΜΟΝΟ την κατηγορία της πηγής, όχι τον τίτλο. NORAYA_PREFILTER=off το απενεργοποιεί.
const PREFILTER_CATEGORY =
  /ζώδι|ζωδι|horoscop|αστρολογ|lifestyle|life style|celebrit|showbiz|gossip|κουτσομπολ|συνταγ|recipe|γαστρονομ|μαγειρ|ψυχαγωγ|entertainment|μόδα|fashion|beauty|ομορφι/i;

function prefilterReason(a: any): string | null {
  if ((process.env.NORAYA_PREFILTER || "on").toLowerCase() === "off") return null;
  const cat = String(a?.category || "");
  const m = cat.match(PREFILTER_CATEGORY);
  return m ? "prefilter_category:" + m[0].toLowerCase() : null;
}

// Διαβάζει ένα-ένα τα αντικείμενα {...} μιας (χαλασμένης) λίστας JSON.
function salvageObjects(text: string): any[] {
  const out: any[] = [];
  const re = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const o = JSON.parse(m[0]);
      if (o && typeof o === "object" && Number.isInteger(Number(o.index))) out.push(o);
    } catch {
      /* αυτό το αντικείμενο χάλασε — τα υπόλοιπα συνεχίζουν */
    }
  }
  return out;
}

// Άρθρα που απέτυχαν στην ταξινόμηση: 1η αποτυχία -> "retry1", 2η -> "failed"
// (δεν ξαναδοκιμάζονται). Χωρίς αυτό, ένα «δύσκολο» batch ξανατρέχει κάθε 2 λεπτά
// για 72 ώρες και χρεώνεται κάθε φορά.
async function markFailed(ids: string[], rows: any[]) {
  if (!ids.length) return;
  const byId = new Map<string, any>(rows.map((a: any) => [a.id, a]));
  const toFailed = ids.filter((id) => byId.get(id)?.classification_status === "retry1");
  const toRetry = ids.filter((id) => byId.get(id)?.classification_status !== "retry1");
  if (toFailed.length) {
    await supabase.from("articles").update({ classification_status: "failed" }).in("id", toFailed);
  }
  if (toRetry.length) {
    await supabase.from("articles").update({ classification_status: "retry1" }).in("id", toRetry);
  }
}

// Ταξινομεί ΕΝΑ batch. Επιστρέφει πόσα ταξινόμησε (0 = τέλος ή σφάλμα).
async function classifyBatch(limit: number, excludeIds: string[]): Promise<{ done: number; total: number; error?: string; writeErrors?: number; lastWriteError?: string; processedIds: string[]; budget?: boolean }> {
  const freshCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("articles")
    .select("id, title, description, category, source_name, published_at, classification_status")
    .is("classified_at", null)
    .gte("published_at", freshCutoff)
    .or("classification_status.is.null,classification_status.neq.failed");
  if (excludeIds.length > 0) {
    query = query.not("id", "in", "(" + excludeIds.join(",") + ")");
  }
  const { data: articles, error: fetchError } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (fetchError) return { done: 0, total: 0, error: fetchError.message, processedIds: [] };
  if (!articles || articles.length === 0) return { done: 0, total: 0, processedIds: [] };

  // Προφίλτρο: καθαρά εκτός πεδίου -> noise χωρίς AI.
  let prefiltered = 0;
  const toClassify: any[] = [];
  for (const a of articles as any[]) {
    const reason = prefilterReason(a);
    if (!reason) {
      toClassify.push(a);
      continue;
    }
    const { error: pfErr } = await supabase
      .from("articles")
      .update({
        is_political: false,
        public_relevance: false,
        is_noise: true,
        noise_reason: reason,
        classification_status: "classified",
        classifier_version: "noraya_prefilter_v1",
        classified_at: new Date().toISOString(),
        model_used: "prefilter",
      })
      .eq("id", a.id);
    if (!pfErr) prefiltered++;
  }
  const allIds: string[] = (articles as any[]).map((a: any) => a.id);
  if (toClassify.length === 0) {
    return { done: prefiltered, total: articles.length, processedIds: allIds };
  }
  // Ημερήσιο όριο κόστους των crons: σταματάμε εδώ, συνεχίζουμε αύριο.
  if (!(await cronBudgetOk(ROUTE, "classify"))) {
    return { done: prefiltered, total: articles.length, error: "cron_budget_reached", processedIds: allIds, budget: true };
  }
  return classifyWithAi(toClassify, prefiltered, allIds);
}

async function classifyWithAi(
  articles: any[],
  prefiltered: number,
  allIds: string[]
): Promise<{ done: number; total: number; error?: string; writeErrors?: number; lastWriteError?: string; processedIds: string[]; budget?: boolean }> {

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

ΚΑΝΟΝΑΣ ΤΟΥ ΠΥΡΗΝΑ (για άρθρα που αγγίζουν 2+ θέματα): διάλεξε το θέμα του ΠΥΡΗΝΑ
του συμβάντος, όχι του πλαισίου/συνέπειας. Συγκεκριμένα:
- Εργατικό δυστύχημα/θάνατος εργαζομένου → Εργασία (ακόμη κι αν υπάρχει φωτιά, έρευνα ή ευθύνες).
- Δικαιοσύνη ΜΟΝΟ όταν ο πυρήνας είναι δικαστικός: δίκη, απόφαση, εισαγγελική παρέμβαση,
  ποινική δίωξη — ΟΧΙ επειδή «θα αποδοθούν ευθύνες» σε άλλο συμβάν.
- Πολιτική προστασία όταν ο πυρήνας είναι καταστροφή/αντιμετώπιση (δασικές πυρκαγιές,
  πλημμύρες, σεισμοί, εκκενώσεις) — ΟΧΙ όταν η φωτιά/καταστροφή είναι το μέσο άλλου συμβάντος.
- Αστυνομική βία/επιχειρήσεις/εγκληματικότητα → Ασφάλεια / εγκληματικότητα.
- Απεργίες/κινητοποιήσεις για μισθούς-συνθήκες → Εργασία. Για συντάξεις → Ασφαλιστικό / συντάξεις.
- Τιμές/πληθωρισμός/ρεύμα-καύσιμα ως κόστος νοικοκυριού → Ακρίβεια / κόστος ζωής.
ΣΥΝΕΠΕΙΑ: όλα τα άρθρα που περιγράφουν το ΙΔΙΟ συμβάν πρέπει να πάρουν το ΙΔΙΟ θέμα.
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
[{"index":0,"topic":"...","sentiment":"...","relevance":N,"is_political":true,"public_relevance":true,"relevance_domain":"...","situation_potential":N,"agenda_potential":N,"urgency":N,"affected_groups":["..."],"why_it_matters":"...","is_noise":false,"noise_reason":null}]`;

  // Το μεταβλητο μερος (τα αρθρα του batch) παει στο user message —
  // ωστε το σταθερο (οδηγιες+θεματα+schema) να κασαρεται (prompt caching, -90% στις επαναληψεις).
  const userPrompt = `ΑΡΘΡΑ:
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
      max_tokens: 10000,
      system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { done: prefiltered, total: allIds.length, error: "AI " + response.status + ": " + errText.slice(0, 200), processedIds: [] };
  }

  const data = await response.json();
  await recordCronCall(ROUTE, classifierModel, data?.usage, "classify");
  const text =
    data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "[]";

  let classifications: any[];
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    classifications = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    if (!Array.isArray(classifications)) throw new Error("not_array");
  } catch {
    // Pilot: ένα χαλασμένο σημείο στο JSON δεν πρέπει να χάνει όλο το batch.
    // Σώζουμε όσα αντικείμενα διαβάζονται ένα-ένα· μόνο τα υπόλοιπα σημειώνονται.
    classifications = salvageObjects(text);
    if (classifications.length === 0) {
      await markFailed(articles.map((a: any) => a.id), articles);
      return { done: prefiltered, total: allIds.length, error: "parse_ai_json", processedIds: allIds };
    }
  }

  let updated = prefiltered;
  let writeErrors = 0;
  let lastWriteError: string | undefined;
  const processedIds: string[] = allIds;
  const answered = new Set<number>();
  for (const c of classifications) {
    const article = articles[c.index];
    if (!article) continue;
    answered.add(Number(c.index));
    const isNoise = c.is_noise === true;
    const publicRelevance = c.public_relevance === true && !isNoise;
    const isPolitical = c.is_political === true || publicRelevance;

    const { data: updRows, error: updateError } = await supabase
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
      .eq("id", article.id)
      .select("id");

    if (!updateError && Array.isArray(updRows) && updRows.length > 0) {
      updated++;
    } else {
      writeErrors++;
      lastWriteError = updateError?.message || "no rows written (RLS/commit)";
    }
  }

  // Άρθρα που το μοντέλο παρέλειψε: σημειώνονται για να μην ξανατρέχουν για πάντα.
  const skipped = articles.filter((_: any, i: number) => !answered.has(i)).map((a: any) => a.id);
  await markFailed(skipped, articles);

  return { done: updated, total: allIds.length, writeErrors, lastWriteError, processedIds };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!(await isCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batchSize = 30;
  const MAX_BATCHES = 8; // 20 x 25 = 500 άρθρα ανά τρέξιμο (σταθερά writes, χωρίς disconnect)
  const startedAt = Date.now();
  const BUDGET_MS = 90000; // 4 λεπτά ασφάλεια

  let totalClassified = 0;
  let totalWriteErrors = 0;
  let lastWriteErrorMsg: string | undefined;
  let batches = 0;
  let lastError: string | undefined;

  const seenIds: string[] = [];
  while (batches < MAX_BATCHES && Date.now() - startedAt < BUDGET_MS) {
    const r = await classifyBatch(batchSize, seenIds);
    for (const pid of r.processedIds) seenIds.push(pid);
    if (r.budget) { lastError = r.error; break; }
    if (r.error) { lastError = r.error; if (r.done === 0 && r.processedIds.length === 0) break; }
    if (r.total === 0) break; // τέλος — δεν υπάρχουν άλλα άρθρα
    totalClassified += r.done;
    totalWriteErrors += r.writeErrors || 0;
    if (r.lastWriteError) lastWriteErrorMsg = r.lastWriteError;
    batches += 1;
    // Μικρή παύση ώστε να γίνει commit το write πριν το επόμενο select (αποφυγή race condition)
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Pilot: καταγραφή λάθους AI (όχι το ημερήσιο όριο — αυτό έχει δικό του email).
  if (lastError && lastError !== "cron_budget_reached") {
    await logPilotError(ROUTE, lastError, { batches, totalClassified });
  }

  // Πόσα έμειναν;
  const freshCutoff2 = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { count: remaining } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .is("classified_at", null)
    .gte("published_at", freshCutoff2)
    .or("classification_status.is.null,classification_status.neq.failed");

  return NextResponse.json({
    success: true,
    mode: "bulk_loop",
    batches,
    total_classified: totalClassified,
    total_write_errors: totalWriteErrors,
    last_write_error: lastWriteErrorMsg || null,
    remaining_unclassified: remaining ?? null,
    last_error: lastError || null,
    note: remaining && remaining > 0
      ? "Έμειναν άρθρα — ξαναπάτα το ίδιο link για να συνεχίσει."
      : "Όλα τα άρθρα ταξινομήθηκαν.",
  });
}
