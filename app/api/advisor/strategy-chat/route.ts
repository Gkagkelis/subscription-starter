import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeJson(value: unknown, maxLength = 18000) {
  try {
    return JSON.stringify(value ?? null, null, 2).slice(0, maxLength);
  } catch {
    return "null";
  }
}

function fallbackAnswer(question: string) {
  return `
Η ασφαλής στρατηγική απάντηση αυτή τη στιγμή είναι να κινηθείτε θεσμικά, με καθαρό μήνυμα και χωρίς υπερβολική βεβαιότητα.

Για την ερώτηση: «${question || "—"}»

Προτείνεται:
1. Κρατήστε χαμηλό αλλά καθαρό τόνο.
2. Μη μετατρέψετε το θέμα σε προσωπική επίθεση.
3. Συνδέστε τη θέση σας με αρχές: τεκμηρίωση, διαφάνεια, ευθύνη.
4. Αφήστε χώρο για κλιμάκωση αν το θέμα ανέβει περισσότερο.

Ασφαλής δημόσια γραμμή:
«Χρειάζονται καθαρές απαντήσεις, θεσμική σοβαρότητα και τεκμηρίωση. Οι πολίτες δεν χρειάζονται θόρυβο, χρειάζονται ευθύνη.»

Σημείωση: Αυτή είναι fallback απάντηση επειδή ο AI advisor δεν μπόρεσε να ολοκληρώσει πλήρη απάντηση.
`.trim();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    expects: {
      question: "string",
      strategic_brief: "object",
      profile: "object | null",
    },
  });
}

export async function POST(req: Request) {
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const question = cleanText(body.question, 2000);
  const strategicBrief = body.strategic_brief || body.strategicBrief || null;
  const profile = body.profile || null;

  if (!question) {
    return NextResponse.json(
      { error: "Missing question." },
      { status: 400 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json({
      answer: fallbackAnswer(question),
      source: "fallback",
      warning: "Missing ANTHROPIC_API_KEY.",
    });
  }

  const systemPrompt = `
Είσαι ο Noraya, AI Political Strategy Advisor.

Δεν είσαι γενικό chatbot.
Δεν είσαι news dashboard.
Δεν απαντάς με raw metrics.
Δεν λες τεχνικά σφάλματα στον τελικό χρήστη.

Απαντάς σαν έμπειρος πολιτικός σύμβουλος στρατηγικής.

Χρησιμοποιείς το διαθέσιμο Strategy Brief ως context.
Απαντάς με βάση:
- το θέμα,
- τη διάγνωση,
- τα σενάρια,
- το message package,
- το action plan,
- το προφίλ του χρήστη.

Κανόνες:
- Μην εφευρίσκεις γεγονότα.
- Μην εφευρίσκεις δημοσκοπήσεις.
- Μην παρουσιάζεις βεβαιότητα όταν δεν υπάρχει.
- Δώσε πρακτική πολιτική συμβουλή.
- Αν ζητηθεί μήνυμα, γράψε μήνυμα.
- Αν ζητηθεί σενάριο, σύγκρινε σενάρια.
- Αν ζητηθεί πλάνο, δώσε πλάνο δράσης.
- Αν υπάρχει ρίσκο, πες το καθαρά.
- Πάντα να καταλήγεις σε σύσταση.

Γλώσσα:
- Ελληνικά.
- Καθαρά.
- Σοβαρά.
- Χωρίς ακαδημαϊκή φλυαρία.
- Σαν σύμβουλος μέσα σε πολιτικό επιτελείο.
`;

  const userPrompt = `
ΠΡΟΦΙΛ ΧΡΗΣΤΗ
${safeJson(profile, 8000)}

STRATEGY BRIEF
${safeJson(strategicBrief, 18000)}

ΕΡΩΤΗΣΗ ΧΡΗΣΤΗ
${question}

Απάντησε ως Noraya Political Strategy Advisor.
Μην αναφέρεις JSON, fallback, API, model ή τεχνικές λεπτομέρειες.
Δώσε χρήσιμη πολιτική απάντηση.
`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        answer: fallbackAnswer(question),
        source: "fallback",
        warning: "AI advisor returned non-OK response.",
      });
    }

    const ai = await response.json();

    const answer =
      ai.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n")
        .trim() || fallbackAnswer(question);

    return NextResponse.json({
      answer,
      source: "ai",
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      answer: fallbackAnswer(question),
      source: "fallback",
      warning:
        err?.name === "AbortError"
          ? "AI timeout."
          : "AI connection error.",
    });
  }
}
