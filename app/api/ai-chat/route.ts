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
    systemPrompt = `Είσαι ο AI Σύμβουλος Στρατηγικής του Noraya — πλατφόρμα πολιτικής πληροφόρησης.

Ο χρήστης σου ζητάει ΑΝΑΛΥΣΗ ΣΕΝΑΡΙΟΥ (Θεωρία Παιγνίων).

Για κάθε σενάριο πρέπει να δώσεις:
1. Πιθανές αντιδράσεις — Τι θα κάνουν αντίπαλοι, ΜΜΕ, κοινή γνώμη
2. Κόστος / Όφελος — Τι κερδίζει και τι χάνει ο οργανισμός
3. Επίδραση ανά κοινό — Νέοι, συνταξιούχοι, αγρότες, εργαζόμενοι κλπ
4. Πιθανότητες — Εκτίμηση σε ποσοστά
5. Σύσταση — Τι προτείνεις και γιατί

Βάσισε την ανάλυση στα πραγματικά δεδομένα που έχεις.
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
