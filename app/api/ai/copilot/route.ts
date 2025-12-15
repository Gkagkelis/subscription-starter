import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

// ========================================
// ΣΩΣΤΟ SCHEMA - Typed Actions (χωρίς additionalProperties)
// ========================================

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate_titles"),
    label: z.string(),
    payload: z.object({
      count: z.number().default(3),
      tone: z.enum(["academic", "playful", "press"]).optional(),
    }),
  }),
  z.object({
    type: z.literal("draft_content"),
    label: z.string(),
    payload: z.object({
      content_type: z.enum(["instagram", "email", "press_release"]),
      target_audience: z.string().optional(),
      length: z.enum(["short", "medium", "long"]).optional(),
    }),
  }),
  z.object({
    type: z.literal("workshop_ideas"),
    label: z.string(),
    payload: z.object({
      age_group: z.string().optional(),
      topic: z.string().optional(),
      count: z.number().default(5),
    }),
  }),
  z.object({
    type: z.literal("analyze_competitors"),
    label: z.string(),
    payload: z.object({
      competitors: z.array(z.string()).optional(),
      focus: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("draft_funding_section"),
    label: z.string(),
    payload: z.object({
      section: z.string(),
    }),
  }),
]);

const CopilotOutputSchema = z.object({
  reply: z.string().describe("Conversational reply in user's language (1-2 paragraphs max)"),
  insights: z.array(z.string()).describe("2-3 bullet points with actionable insights").optional(),
  actions: z.array(ActionSchema).describe("3-5 suggested action buttons"),
  language_detected: z.enum(["el", "en"]).describe("Auto-detected language"),
});

// ========================================
// ROUTE HANDLER
// ========================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, language = "auto" } = body;

    // Auto-detect language
    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    const languageName = detectedLanguage === "el" ? "Greek" : "English";

    // System prompt
    const systemPrompt = `You are a cultural sector advisor AI assistant.

CRITICAL RULES:
- Respond ONLY in ${languageName}. Never mix languages.
- Be conversational, practical, encouraging (colleague, not robot)
- Keep reply to 1-2 short paragraphs max
- Give 2-3 actionable insights (bullet points)
- Always suggest 3-5 specific next action buttons

STRUCTURE:
1. Reply: Address their message directly (1-2 paragraphs)
2. Insights: 2-3 bullets with actionable suggestions
3. Actions: 3-5 specific action buttons

EXAMPLES:

User: "Σχεδιάζω έκθεση για κεραμική"
Reply: "Ωραία! Η κεραμική μπορεί να είναι challenging για νέο κοινό. Βάσει trends, θα δούλευε καλύτερα αν τη συνδέσεις με σύγχρονο design ή sustainability. Έχεις κάποιο συγκεκριμένο angle;

Ποιο κοινό θέλεις να προσελκύσεις;"

Insights:
- Το κοινό 18-35 ενδιαφέρεται για 'behind-the-scenes' stories
- Interactive workshops έχουν +40% engagement vs passive εκθέσεις
- Σύνδεση με local artists δημιουργεί community buzz

Actions:
1. "Δώσε μου 3 τίτλους για την έκθεση"
2. "Ιδέες για interactive workshop"
3. "Ανάλυσε τι κάνουν άλλα μουσεία"

User: "I need help with social media for the festival"
Reply: "Got it! Social media for festivals needs a content calendar + real-time engagement strategy. Are you looking for pre-event buzz, during-event coverage, or post-event highlights?

What platforms are you prioritizing?"

Insights:
- Instagram Reels get 3x more reach than static posts
- User-generated content drives authenticity
- Behind-the-scenes content performs best 2 weeks before event

Actions:
1. "Create content calendar template"
2. "Draft 5 Instagram captions"
3. "Hashtag strategy for maximum reach"`;

    const result = await streamText({
      model: openai("gpt-4o-2024-08-06"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      output: "object",
      schema: CopilotOutputSchema,
    });

    return result.toTextStreamResponse();
    
  } catch (error: any) {
    console.error("Copilot error:", error);
    return Response.json(
      { 
        error: error.message || "Internal server error",
        details: error.response?.data || null 
      },
      { status: 500 }
    );
  }
}
