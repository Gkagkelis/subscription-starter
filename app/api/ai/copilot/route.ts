import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const InputSchema = z.object({
  org_id: z.string().min(1),
  message: z.string().min(1),

  // Προαιρετικά meta από UI
  meta: z.object({
    language: z.enum(["auto", "el", "en"]),
  }),

  // Προαιρετικά: αν πατήσεις κουμπί από actions
  action: z.object({
    id: z.string(),
    payload: z.record(z.any()),
  }),
});

const OutputSchema = z.object({
  language: z.enum(["el", "en"]),
  assistant_message: z.string(),

  // 3-6 προτεινόμενες επόμενες ερωτήσεις (για να καθοδηγγεί τον χρήστη)
  next_questions: z.array(z.string()),

  // Κουμπιά δράσης (π.χ. “Δώσε 3 τίτλους”, “Φτιάξε IG caption”, “Pilot study plan”)
  actions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      hint: z.string(),
      payload: z.record(z.any()),
    })
  ),

  // Τι υποθέτουμε / τι λείπει (σαν σύμβουλος)
  assumptions: z.array(z.string()),
  missing_data: z.array(z.string()),
  risks: z.array(z.string()),
});

function detectLanguageAuto(text: string): "el" | "en" {
  // Αν έχει ελληνικούς χαρακτήρες, θεωρούμε EL
  const hasGreek = /[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώ]/.test(text);
  return hasGreek ? "el" : "en";
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    const lang: "el" | "en" =
      input.meta.language === "auto" ? detectLanguageAuto(input.message) : input.meta.language;

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const systemEL =
      "Είσαι το Axiprova — καθημερινός co-pilot για επαγγελματίες πολιτισμού & δημιουργικών βιομηχανιών. " +
      "Μιλάς φιλικά, καθαρά, πρακτικά, σαν έμπειρος σύμβουλος. " +
      "Δεν πετάς άσχετες θεωρίες. Δεν εφευρίσκεις νούμερα. " +
      "Δίνεις: (1) άμεση βοήθεια στο σχέδιο, (2) 2-3 insights/ευκαιρίες, (3) συγκεκριμένα επόμενα βήματα. " +
      "Αν λείπουν στοιχεία, ρωτάς 2-4 σωστές διευκρινιστικές ερωτήσεις. " +
      "ΜΗΝ γράφεις markdown. ΜΟΝΟ valid JSON που ταιριάζει 100% στο schema.";

    const systemEN =
      "You are Axiprova — a daily co-pilot for cultural and creative industry professionals. " +
      "You speak friendly, clear, practical, like an experienced consultant. " +
      "No generic theory. Do not invent numbers. " +
      "Provide: (1) immediate help improving the plan, (2) 2-3 insights/opportunities, (3) concrete next steps. " +
      "If key details are missing, ask 2-4 smart clarifying questions. " +
      "NO markdown. Output ONLY valid JSON matching the schema exactly.";

    const userPrompt =
      (lang === "el"
        ? "Μήνυμα χρήστη:\n"
        : "User message:\n") +
      input.message +
      "\n\n" +
      (input.action?.id
        ? (lang === "el"
            ? `Ενέργεια που πάτησε ο χρήστης: ${input.action.id}\nPayload: ${JSON.stringify(
                input.action.payload
              )}\n`
            : `Action clicked: ${input.action.id}\nPayload: ${JSON.stringify(input.action.payload)}\n`)
        : "") +
      "\n" +
      (lang === "el"
        ? "Στόχος: φτιάξε απάντηση τύπου co-pilot + προτεινόμενα κουμπιά δράσης."
        : "Goal: produce a co-pilot response + suggested action buttons.");

    const response = await client.responses.parse({
      model,
      max_output_tokens: 1200,
      instructions: lang === "el" ? systemEL : systemEN,
      input: userPrompt,
      text: {
        format: zodTextFormat(OutputSchema, "copilot_response"),
      },
    });

    const parsed = (response as any).output_parsed;

    if (!parsed) {
      return NextResponse.json(
        {
          error: "copilot failed",
          details: "No structured output returned by the model.",
          output_text: (response as any).output_text ?? null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: "copilot failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
