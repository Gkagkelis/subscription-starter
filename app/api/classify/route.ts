import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOPICS = [
  "Ακρίβεια / κόστος ζωής",
  "Οικονομία",
  "Φορολογία",
  "Στέγαση",
  "Εργασία",
  "Ασφαλιστικό / συντάξεις",
  "Υγεία",
  "Παιδεία",
  "Πανεπιστήμια",
  "Νεολαία",
  "Μεταναστευτικό",
  "Ασφάλεια / εγκληματικότητα",
  "Δικαιοσύνη",
  "Θεσμοί / διαφάνεια",
  "Άμυνα",
  "Γεωπολιτική",
  "Εξωτερική πολιτική",
  "Ενέργεια",
  "Περιβάλλον / κλιματική κρίση",
  "Αγροτικά",
  "Υποδομές / μεταφορές",
  "Ψηφιακή πολιτική / τεχνολογία",
  "Πολιτισμός",
  "Αθλητισμός",
  "Τοπική αυτοδιοίκηση",
  "Ευρωπαϊκή πολιτική",
  "Ανθρώπινα δικαιώματα",
  "Ισότητα / συμπερίληψη",
  "Πολιτική προστασία",
];

function clampNumber(value: any, min = 0, max = 10): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keep each AI batch small and reliable.
  // The radar endpoint will call this repeatedly.
  const requestedLimit = Number(searchParams.get("limit") || "20");
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 20, 1),
    25
  );

  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("id, title, description, category, source_name, published_at")
    .is("classified_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Δεν υπάρχουν unclassified άρθρα",
      classified: 0,
    });
  }

  const articlesList = articles
    .map(
      (a, i) =>
        `[${i}]
ΤΙΤΛΟΣ: ${a.title}
ΠΕΡΙΓΡΑΦΗ: ${(a.description || "").substring(0, 500)}
ΠΗΓΗ: ${a.source_name || "—"}
ΚΑΤΗΓΟΡΙΑ RSS: ${a.category || "—"}
ΔΗΜΟΣΙΕΥΣΗ: ${a.published_at || "—"}`
    )
    .join("\n\n");

  const prompt = `Είσαι ο classifier του Noraya, ενός public affairs / political intelligence radar για την Ελλάδα.

ΔΕΝ ταξινομείς μόνο στενή κομματική πολιτική.
Θέλουμε να πιάνεις τη δημόσια πραγματικότητα που μπορεί να επηρεάσει πολιτική ατζέντα, κοινωνική ένταση, κράτος, θεσμούς, εμπιστοσύνη, στρατηγική επικοινωνία ή κυβερνητική/αντιπολιτευτική ευθύνη.

Θεώρησε relevant αν αφορά ένα από τα παρακάτω:
- κόμματα, κυβέρνηση, αντιπολίτευση, Βουλή, υπουργεία
- κράτος, δημόσια διοίκηση, ΕΛ.ΑΣ, δημόσια ασφάλεια
- δικαιοσύνη, θεσμοί, διαφάνεια, σκάνδαλα, λογοδοσία
- οικονομία, ακρίβεια, φόροι, εργασία, μισθοί, συντάξεις
- υγεία, παιδεία, κοινωνικό κράτος
- υποδομές, μεταφορές, ενέργεια, περιβάλλον
- τοπικές κρίσεις με δημόσια/πολιτική προέκταση
- διαμαρτυρίες, απεργίες, κοινωνική ένταση
- μεταναστευτικό, δικαιώματα, ισότητα, κοινωνικές συγκρούσεις
- γεωπολιτική, Τουρκία, ΕΕ, άμυνα
- φυσικές καταστροφές, πολιτική προστασία
- failures του κράτους, ατυχήματα, αστοχίες υπηρεσιών

Θεώρησε noise αν είναι καθαρά:
- αθλητικά χωρίς δημόσια/θεσμική προέκταση
- lifestyle, celebrities, τηλεόραση, ψυχαγωγία
- συνταγές, ζώδια, κουτσομπολιό
- άσχετα διεθνή χωρίς σύνδεση με Ελλάδα/ΕΕ/γεωπολιτική/δημόσια πολιτική

Για κάθε άρθρο δώσε:
- topic: ΕΝΑ από αυτά: ${TOPICS.join(", ")}
- sentiment: "θετικό", "αρνητικό", ή "ουδέτερο"
- relevance: 1-10, γενική δημόσια/πολιτική σημασία
- is_political: true αν αφορά δημόσια πολιτική/κοινωνία/θεσμούς/κράτος/οικονομία, όχι μόνο κόμματα
- public_relevance: true/false
- relevance_domain: σύντομη κατηγορία, π.χ. "Κράτος / ασφάλεια", "Οικονομία / ακρίβεια", "Θεσμοί / δικαιοσύνη"
- situation_potential: 1-10, πιθανότητα να γίνει situation στο Noraya
- agenda_potential: 1-10, πιθανότητα να επηρεάσει δημόσια/πολιτική ατζέντα
- urgency: 1-10, πόσο άμεσο/επείγον είναι
- affected_groups: array με 1-5 ομάδες/θεσμούς που επηρεάζονται
- why_it_matters: μία σύντομη πρόταση στα ελληνικά
- is_noise: true/false
- noise_reason: σύντομο reason ή null

ΑΠΑΝΤΗΣΕ ΜΟΝΟ ΣΕ JSON ARRAY, χωρίς markdown, χωρίς backticks:
[
  {
    "index":0,
    "topic":"...",
    "sentiment":"...",
    "relevance":N,
    "is_political":true,
    "public_relevance":true,
    "relevance_domain":"...",
    "situation_potential":N,
    "agenda_potential":N,
    "urgency":N,
    "affected_groups":["..."],
    "why_it_matters":"...",
    "is_noise":false,
    "noise_reason":null
  }
]

ΑΡΘΡΑ:
${articlesList}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();

      return NextResponse.json(
        {
          success: false,
          stage: "anthropic_classification",
          error: err.error?.message || "AI error",
        },
        { status: 500 }
      );
    }

    const data = await response.json();

    const text =
      data.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("") || "[]";

    let classifications: any[];

    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      classifications = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return NextResponse.json(
        {
          success: false,
          stage: "parse_ai_json",
          error: "AI response not valid JSON",
          raw: text,
        },
        { status: 500 }
      );
    }

    let updated = 0;
    let publicRelevant = 0;
    let noise = 0;

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
          affected_groups: Array.isArray(c.affected_groups)
            ? c.affected_groups.slice(0, 5)
            : [],
          why_it_matters: c.why_it_matters || null,
          is_noise: isNoise,
          noise_reason: c.noise_reason || null,
          classification_status: "classified",
          classifier_version: "noraya_public_reality_radar_v1",
          classified_at: new Date().toISOString(),
          model_used: "claude-sonnet-4-6",
        })
        .eq("id", article.id);

      if (!updateError) {
        updated++;
        if (publicRelevance) publicRelevant++;
        if (isNoise) noise++;
      }
    }

    const { data: baselineRefreshed, error: baselineScoreError } =
      await supabase.rpc("refresh_article_scores_baseline");

    if (baselineScoreError) {
      return NextResponse.json(
        {
          success: false,
          error: baselineScoreError.message,
          stage: "refresh_article_scores_baseline",
        },
        { status: 500 }
      );
    }

    const { data: classifiedRefreshed, error: classifiedScoreError } =
      await supabase.rpc("refresh_article_scores_classified");

    if (classifiedScoreError) {
      return NextResponse.json(
        {
          success: false,
          error: classifiedScoreError.message,
          stage: "refresh_article_scores_classified",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      classifier_version: "noraya_public_reality_radar_v1",
      requested_limit: requestedLimit,
      effective_limit: limit,
      total: articles.length,
      classified: updated,
      public_relevant: publicRelevant,
      noise,
      scores: {
        baseline_refreshed: baselineRefreshed,
        classified_refreshed: classifiedRefreshed,
      },
      results: classifications,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        stage: "classify_exception",
        error: err.message,
      },
      { status: 500 }
    );
  }
}
