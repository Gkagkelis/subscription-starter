import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOPICS = [
  "Ακρίβεια / κόστος ζωής", "Οικονομία", "Φορολογία", "Στέγαση",
  "Εργασία", "Ασφαλιστικό / συντάξεις", "Υγεία", "Παιδεία",
  "Πανεπιστήμια", "Νεολαία", "Μεταναστευτικό",
  "Ασφάλεια / εγκληματικότητα", "Δικαιοσύνη", "Θεσμοί / διαφάνεια",
  "Άμυνα", "Γεωπολιτική", "Εξωτερική πολιτική", "Ενέργεια",
  "Περιβάλλον / κλιματική κρίση", "Αγροτικά", "Υποδομές / μεταφορές",
  "Ψηφιακή πολιτική / τεχνολογία", "Πολιτισμός", "Αθλητισμός",
  "Τοπική αυτοδιοίκηση", "Ευρωπαϊκή πολιτική",
  "Ανθρώπινα δικαιώματα", "Ισότητα / συμπερίληψη", "Πολιτική προστασία"
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get unclassified articles (batch of 10)
  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("id, title, description, category, source_name")
    .is("classified_at", null)
    .order("published_at", { ascending: false })
    .limit(10);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ message: "Δεν υπάρχουν unclassified άρθρα", classified: 0 });
  }

  // Build the prompt
  const articlesList = articles
    .map(
      (a, i) =>
        `[${i}] ΤΙΤΛΟΣ: ${a.title}\nΠΕΡΙΓΡΑΦΗ: ${(a.description || "").substring(0, 150)}\nΠΗΓΗ: ${a.source_name}\nΚΑΤΗΓΟΡΙΑ: ${a.category || "—"}`
    )
    .join("\n\n");

  const prompt = `Ταξινόμησε αυτά τα ${articles.length} άρθρα. Για κάθε ένα δώσε:
- topic: ΕΝΑ από αυτά: ${TOPICS.join(", ")}
- sentiment: "θετικό", "αρνητικό", ή "ουδέτερο"
- relevance: 1-10 (πόσο σχετικό είναι με την ελληνική πολιτική)
- is_political: true αν αφορά πολιτική/κοινωνία/οικονομία, false αν είναι αθλητικά/lifestyle/celebrities/ψυχαγωγία

ΑΠΑΝΤΗΣΕ ΜΟΝΟ ΣΕ JSON ARRAY, χωρίς markdown, χωρίς backticks, χωρίς εξηγήσεις:
[{"index":0,"topic":"...","sentiment":"...","relevance":N,"is_political":true/false},...]

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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json({ error: err.error?.message || "AI error" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("") || "[]";

    // Parse JSON response
    let classifications: any[];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      classifications = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "AI response not valid JSON", raw: text }, { status: 500 });
    }

    // Update each article
    let updated = 0;
    for (const c of classifications) {
      const article = articles[c.index];
      if (!article) continue;

      const { error: updateError } = await supabase
        .from("articles")
        .update({
          topic: c.topic || null,
          sentiment: c.sentiment || null,
          relevance: c.relevance || null,
          is_political: c.is_political !== false,
          classified_at: new Date().toISOString(),
        })
        .eq("id", article.id);

      if (!updateError) updated++;
    }

    return NextResponse.json({
      success: true,
      total: articles.length,
      classified: updated,
      results: classifications,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
