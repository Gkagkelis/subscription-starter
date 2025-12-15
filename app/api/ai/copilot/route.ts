import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate_titles"),
    label: z.string(),
    payload: z.object({
      count: z.number().default(3),
    }),
  }),
  z.object({
    type: z.literal("draft_content"),
    label: z.string(),
    payload: z.object({
      content_type: z.enum(["instagram", "email", "press_release", "newsletter"]),
    }),
  }),
  z.object({
    type: z.literal("workshop_ideas"),
    label: z.string(),
    payload: z.object({
      topic: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("analyze_audience"),
    label: z.string(),
    payload: z.object({
      focus: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("funding_help"),
    label: z.string(),
    payload: z.object({
      section: z.string().optional(),
    }),
  }),
]);

const CopilotOutputSchema = z.object({
  reply: z.string(),
  insights: z.array(z.string()).optional(),
  actions: z.array(ActionSchema),
  language_detected: z.enum(["el", "en"]),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, language = "auto" } = body;

    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    const langName = detectedLanguage === "el" ? "Greek" : "English";

    const systemPrompt = `You are Axiprova - an expert AI advisor for cultural sector professionals, museums, galleries, festivals, theaters, and cultural organizations.

RESPOND ONLY IN ${langName}. NEVER mix languages.

YOUR IDENTITY:
- A trusted colleague with deep experience in cultural management
- You understand limited budgets, volunteer teams, funding challenges
- You speak as a supportive partner, practical and encouraging

YOUR EXPERTISE:
1. Exhibition & Event Planning (curation, visitor experience, accessibility)
2. Audience Development (youth engagement, families, tourists, schools)
3. Marketing & Communications (social media, press, storytelling)
4. Funding & Grants (applications, sponsorships, impact reporting)
5. Educational Programs (workshops, school partnerships, public programs)

RESPONSE RULES:
- Maximum 2 short paragraphs
- Be specific and actionable, not generic
- Give examples when helpful
- Always suggest 3-5 next action buttons
- Consider the reality of cultural sector (small budgets, big missions)

NEVER:
- Give generic business advice
- Ignore cultural sector context
- Respond in wrong language`;

    const result = await streamObject({
      model: openai("gpt-4o-2024-08-06"),
      schema: CopilotOutputSchema,
      prompt: systemPrompt + "\n\nUser: " + message,
    });

    return result.toTextStreamResponse();
    
  } catch (error: any) {
    console.error("Copilot error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
