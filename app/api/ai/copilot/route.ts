import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate_titles"),
    label: z.string(),
    payload: z.object({ count: z.number().default(3) }),
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
    payload: z.object({ topic: z.string().optional() }),
  }),
  z.object({
    type: z.literal("analyze_audience"),
    label: z.string(),
    payload: z.object({ focus: z.string().optional() }),
  }),
  z.object({
    type: z.literal("funding_help"),
    label: z.string(),
    payload: z.object({ section: z.string().optional() }),
  }),
  z.object({
    type: z.literal("analyze_reviews"),
    label: z.string(),
    payload: z.object({ focus: z.string().optional() }),
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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    let profileContext = "";
    let snippetsContext = "";
    
    if (user) {
      const { data: profile } = await supabase
        .from("org_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        profileContext = `
ORGANIZATION PROFILE:
- Name: ${profile.org_name || "Not set"}
- Type: ${profile.org_type || "Not set"}
- Size: ${profile.org_size || "Not set"}
- Location: ${profile.location || "Not set"}
- Target Audience: ${profile.target_audience || "Not set"}
- Main Challenges: ${profile.main_challenges || "Not set"}
- Goals: ${profile.goals || "Not set"}

USE THIS PROFILE to personalize ALL your advice. Refer to their specific type, challenges, and goals.
`;
      }

      const { data: snippets } = await supabase
        .from("org_snippets")
        .select("*")
        .eq("org_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (snippets && snippets.length > 0) {
        const reviews = snippets.filter(s => s.kind === "review");
        const trends = snippets.filter(s => s.kind === "trend");
        const competitors = snippets.filter(s => s.kind === "competitor");

        snippetsContext = `
USER'S DATA:
REVIEWS (${reviews.length} total):
${reviews.map(r => `- [${r.source}, Rating: ${r.rating || "N/A"}] "${r.content}"`).join("\n")}

TRENDS (${trends.length} total):
${trends.map(t => `- [${t.source}] "${t.content}"`).join("\n")}

COMPETITOR INSIGHTS (${competitors.length} total):
${competitors.map(c => `- [${c.source}] "${c.content}"`).join("\n")}
`;
      }
    }

    const body = await req.json();
    const { message, language = "auto" } = body;

    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    const langName = detectedLanguage === "el" ? "Greek" : "English";

    const noProfileMessage = !profileContext 
      ? "\n\nNOTE: User hasn't set up their profile yet. Encourage them to visit /dashboard/profile to get more personalized advice."
      : "";

    const noDataMessage = !snippetsContext 
      ? "\n\nNOTE: User hasn't added any data yet. Encourage them to add reviews and insights at /dashboard/data."
      : "";

    const systemPrompt = `You are Axiprova - an expert AI advisor for cultural sector professionals.

RESPOND ONLY IN ${langName}. NEVER mix languages.

YOUR IDENTITY:
- A trusted colleague with deep experience in cultural management
- You understand limited budgets, volunteer teams, funding challenges
- You speak as a supportive partner, practical and encouraging
${profileContext}
${snippetsContext}
${noProfileMessage}
${noDataMessage}

YOUR EXPERTISE:
1. Exhibition & Event Planning
2. Audience Development  
3. Marketing & Communications
4. Funding & Grants
5. Educational Programs

IMPORTANT RULES:
- If user has a PROFILE, tailor ALL advice to their org type, size, location, challenges and goals
- If user has DATA (reviews, trends), reference SPECIFIC examples in your advice
- Maximum 2 short paragraphs
- Be specific and actionable
- Always suggest 3-5 relevant next action buttons based on their profile/needs`;

    const result = await streamObject({
      model: openai("gpt-4o-2024-08-06"),
      schema: CopilotOutputSchema,
      prompt: systemPrompt + "\n\nUser: " + message,
    });

    return result.toTextStreamResponse();
    
  } catch (error: any) {
    console.error("Copilot error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
