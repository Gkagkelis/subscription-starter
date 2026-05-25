import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const question = body.question?.trim();
  const mode = body.mode || "analysis";

  if (!question) {
    return NextResponse.json({ error: "Χρειάζεται ερώτηση" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const { data: articles } = await supabase
    .from("articles")
    .select("title, description, source_name, category, published_at, link")
    .order("published_at", { ascending: false })
    .limit(30);

  const articlesContext = (articles || [])
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title} (${a.source_name}, ${a.category || "γενικά"})\n${(a.description || "").substring(0, 200)}`
    )
    .join("\n\n");

  let orgContext = "";
  if (org) {
    orgContext = `
ΟΡΓΑΝΙΣΜΟΣ: ${org.org_name} (${org.org_type})
ΘΕΜΑΤΙΚΕΣ: ${(org.themes || []).join(", ")}
ΖΗΤΗΜΑΤΑ: ${(org.issues || []).join(", ")}
ΑΠΟΣΤΟΛΗ: ${org.mission || "Δεν έχει οριστεί"}
ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ: ${org.red_lines || "Δεν έχουν οριστεί"}
ΤΟΝΟΣ: ${org.tone || "Δεν έχει οριστεί"}`;
  }

  let systemPrompt = "";

  if (mode === "scenario") {
    systemPrompt = `Είσαι ο AI Σύμβουλος Στρατηγικής του Noraya. Κάνεις ΑΝΑΛΥΣΗ ΣΕΝΑΡΙΩΝ με αυστηρή μεθοδολογία Θεωρίας Παιγνίων — αλλά γράφεις ΑΠΛΑ και ΚΑΤΑΝΟΗΤΑ, σαν να εξηγείς σε πολιτικό σύμβουλο, όχι σε ακαδημαϊκό.

ΚΑΝΟΝΕΣ:
- Κάθε αριθμός πρέπει να δικαιολογείται από τα δεδομένα (άρθρα, τάσεις, ιστορικά παραδείγματα)
- Μην γενικολογείς. Αντί "πιθανόν αρνητική αντίδραση" γράψε "65% πιθανότητα αρνητικής αντίδρασης βάσει X"
- Γράψε σε γλώσσα που καταλαβαίνει ο καθένας — χωρίς ακαδημαϊκή ορολογία χωρίς εξήγηση

ΔΟΜΗ ΑΝΑΛΥΣΗΣ:

## 1. ΠΑΙΚΤΕΣ & ΚΙΝΗΣΕΙΣ
Ποιοι εμπλέκονται, τι μπορεί να κάνει ο καθένας (2-3 πιθανές κινήσεις ανά παίκτη).

## 2. ΠΙΝΑΚΑΣ ΑΠΟΤΕΛΕΣΜΑΤΩΝ (Payoff Matrix)
Πίνακας: αν ΕΜΕΙΣ κάνουμε Α και ο ΑΝΤΙΠΑΛΟΣ κάνει Β, το αποτέλεσμα είναι:
- Βαθμολογία -10 έως +10 για κάθε πλευρά
- Εξήγηση κάθε σεναρίου σε 1 πρόταση

## 3. ΠΙΘΑΝΟΤΗΤΕΣ (Bayesian)
Για κάθε κίνηση αντιπάλου, δώσε πιθανότητα σε % και ΓΙΑΤΙ (βάσει ποιου δεδομένου).

## 4. ΔΕΝΤΡΟ ΑΠΟΦΑΣΕΩΝ
Βήμα-βήμα:
→ Αν κάνουμε Χ (πιθανότητα αντίδρασης Υ: 60%)
  → Αν αντιδράσουν Υ: αποτέλεσμα Ζ (expected value: +3)
  → Αν δεν αντιδράσουν: αποτέλεσμα Ω (expected value: +7)
→ Expected Value συνολικά: +4.6

## 5. ΒΕΛΤΙΣΤΗ ΣΤΡΑΤΗΓΙΚΗ (Nash Equilibrium)
Ποια κίνηση είναι η καλύτερη ΑΝ υποθέσουμε ότι ο αντίπαλος παίζει ορθολογικά;
Απλή εξήγηση σε 3 προτάσεις.

## 6. RISK SCORE
Αριθμητικό σκορ 1-100, με ανάλυση:
- Πιθανότητα αρνητικής έκβασης: X%
- Μέγεθος ζημιάς αν πάει στραβά: Y/10
- Risk Score = X × Y

## 7. ΣΥΣΤΑΣΗ
2-3 προτάσεις: τι πρέπει να κάνετε, πότε, και με ποια σειρά.

ΣΗΜΑΝΤΙΚΟ: Χρησιμοποίησε τα πραγματικά άρθρα και δεδομένα. Αναφέρου σε συγκεκριμένα γεγονότα, δηλώσεις, τάσεις. Μην φτιάχνεις σενάρια στον αέρα.

${orgContext}

ΠΡΟΣΦΑΤΑ ΑΡΘΡΑ:
${articlesContext}`;
  } else if (mode === "stance") {
    systemPrompt = `Είσαι ο AI Σύμβουλος Συνέπειας Θέσεων του Noraya.

Ο χρήστης σου δίνει μια δήλωση ή θέση και θέλει να μάθει:
1. Συνάδει με τις δημόσιες θέσεις του οργανισμού;
2. Αντιφάσεις — Υπάρχουν αντιφατικές θέσεις;
3. Ρίσκο — Μπορεί να εκτεθεί ο οργανισμός;
4. Πρόταση — Πώς να αναδιατυπωθεί αν χρειάζεται

${orgContext}

ΠΡΟΣΦΑΤΑ ΑΡΘΡΑ:
${articlesContext}`;
  } else {
    systemPrompt = `Είσαι ο AI Σύμβουλος Ανάλυσης του Noraya — πλατφόρμα πολιτικής πληροφόρησης.

Απαντάς σε ελληνικά, με βάση πραγματικά δεδομένα από ελληνικά ΜΜΕ.

Για κάθε ερώτηση δίνεις:
1. Τι γίνεται — Σύνοψη της κατάστασης
2. Τι σημαίνει — Ανάλυση για τον οργανισμό
3. Κίνδυνοι — Τι πρέπει να προσέξει
4. Ευκαιρίες — Τι μπορεί να αξιοποιήσει
5. Πηγές — Αναφορά στα άρθρα που χρησιμοποίησες

Να είσαι σύντομος, ουσιαστικός, και να αναφέρεις τις πηγές σου.
${orgContext}

ΠΡΟΣΦΑΤΑ ΑΡΘΡΑ:
${articlesContext}`;
  }

  const model =
    mode === "scenario"
      ? "claude-opus-4-6"
      : "claude-sonnet-4-6";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json(
        { error: err.error?.message || "AI error" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const aiResponse =
      data.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n") || "Δεν ήρθε απάντηση.";

    return NextResponse.json({
      response: aiResponse,
      model,
      mode,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Σφάλμα σύνδεσης με AI: " + err.message },
      { status: 500 }
    );
  }
}
