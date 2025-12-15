// app/api/ai/copilot/route.ts
import { z } from "zod";

// ========================================
// ΒΗΜΑ 1: Ορίζουμε τα action types (typed payloads)
// ========================================

const GenerateTitlesPayload = z.object({
  count: z.number().default(3),
  tone: z.enum(["academic", "playful", "press"]).optional(),
});

const DraftContentPayload = z.object({
  content_type: z.enum(["instagram", "email", "press_release"]),
  target_audience: z.string().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
});

const WorkshopIdeasPayload = z.object({
  age_group: z.string().optional(),
  topic: z.string().optional(),
  count: z.number().default(5),
});

const AnalyzeCompetitorsPayload = z.object({
  competitors: z.array(z.string()).optional(),
  focus: z.string().optional(),
});

// Union όλων των actions (discriminated union)
const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate_titles"),
    label: z.string(),
    payload: GenerateTitlesPayload,
  }),
  z.object({
    type: z.literal("draft_content"),
    label: z.string(),
    payload: DraftContentPayload,
  }),
  z.object({
    type: z.literal("workshop_ideas"),
    label: z.string(),
    payload: WorkshopIdeasPayload,
  }),
  z.object({
    type: z.literal("analyze_competitors"),
    label: z.string(),
    payload: AnalyzeCompetitorsPayload,
  }),
  z.object({
    type: z.literal("draft_funding_section"),
    label: z.string(),
    payload: z.object({
      section: z.string(),
    }),
  }),
]);

// ========================================
// ΒΗΜΑ 2: Το τελικό Output Schema
// ========================================

const CopilotOutputSchema = z.object({
  reply: z.string().describe("Conversational reply in user's language (1-2 paragraphs max)"),
  insights: z.array(z.string()).describe("2-3 bullet points with actionable insights").optional(),
  actions: z.array(ActionSchema).describe("3-5 suggested action buttons"),
  language_detected: z.enum(["el", "en"]).describe("Auto-detected language"),
});

// ========================================
// ΒΗΜΑ 3: Το route handler
// ========================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, context, language = "auto" } = body;

    // Language detection
    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    // System prompt (conversational advisor, not report generator)
    const systemPrompt = `You are a cultural sector advisor AI assistant.

TONE: Conversational, practical, encouraging. You're a colleague, not a robot.
LANGUAGE: Respond ONLY in ${detectedLanguage === "el" ? "Greek" : "English"}. Never mix languages.

STRUCTURE:
1. Reply: 1-2 short paragraphs addressing their message directly
2. Insights: 2-3 bullet points with actionable suggestions (if relevant)
3. Actions: 3-5 specific action buttons they can click next

RULES:
- Don't dump frameworks unless asked
- Ask max 1 clarifying question if needed
- Be specific, not generic
- Always end with concrete next steps (actions)

Examples of good responses:
User: "Σχεδιάζω έκθεση για κεραμική"
You: "Ωραία! Η κεραμική μπορεί να είναι challenging για νέο κοινό. Βάσει trends, θα δούλευε καλύτερα αν τη συνδέσεις με σύγχρονο design ή sustainability. Έχεις κάποιο συγκεκριμένο angle που σκέφτεσαι;

Insights:
- Το κοινό 18-35 ενδιαφέρεται για 'πώς φτιάχνεται' stories
- Τα interactive workshops έχουν +40% engagement vs passive εκθέσεις

Actions: [3 buttons like: 'Δώσε τίτλους για την έκθεση', 'Ιδέες για workshop', 'Ανάλυσε ανταγωνισμό']"`;

    // Call OpenAI with structured output
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "copilot_response",
          strict: true,
          schema: zodToJsonSchema(CopilotOutputSchema),
        },
      },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    return Response.json(result);

  } catch (error: any) {
    console.error("Copilot error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
