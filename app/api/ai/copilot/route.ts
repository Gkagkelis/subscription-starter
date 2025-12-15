import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";

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
  reply: z.string().describe("Conversational reply in user's language"),
  insights: z.array(z.string()).describe("2-3 actionable insights").optional(),
  actions: z.array(ActionSchema).describe("3-5 suggested action buttons"),
  language_detected: z.enum(["el", "en"]).describe("Auto-detected language"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, language = "auto" } = body;

    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    const languageName = detectedLanguage === "el" ? "Greek" : "English";

    const systemPrompt = `You are a cultural sector advisor AI assistant.

RULES:
- Respond ONLY in ${languageName}. Never mix languages.
- Be conversational and practical (colleague, not robot)
- Keep reply to 1-2 short paragraphs
- Give 2-3 actionable insights as bullet points
- Suggest 3-5 specific next action buttons

OUTPUT STRUCTURE:
1. Reply: Address their message (1-2 paragraphs)
2. Insights: 2-3 bullets with suggestions
3. Actions: 3-5 action buttons with clear labels`;

    const result = await streamObject({
      model: openai("gpt-4o-2024-08-06"),
      schema: CopilotOutputSchema,
      prompt: systemPrompt + "\n\nUser message: " + message,
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
