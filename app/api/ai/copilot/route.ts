import { openai } from "@ai-sdk/openai";
import { streamObject, embed } from "ai";
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
  z.object({
    type: z.literal("search_web"),
    label: z.string(),
    payload: z.object({ query: z.string().optional() }),
  }),
]);

const CopilotOutputSchema = z.object({
  reply: z.string(),
  insights: z.array(z.string()).optional(),
  actions: z.array(ActionSchema),
  language_detected: z.enum(["el", "en"]),
});

// Check if query needs web search
function needsWebSearch(message: string): boolean {
  const searchTriggers = [
    // Greek triggers
    'επιχορήγηση', 'επιχορηγήσεις', 'χρηματοδότηση', 'προκήρυξη', 'προκηρύξεις',
    'deadline', 'προθεσμία', 'προθεσμίες', 'τρέχουσες', 'τρέχοντα', 'νέες', 'νέα',
    'ανοιχτές', 'ανοιχτά', '2024', '2025', 'τώρα', 'σήμερα', 'φέτος',
    'creative europe', 'ελλάδα', 'υπουργείο πολιτισμού', 'εσπα',
    // English triggers
    'grant', 'grants', 'funding', 'deadline', 'current', 'open call', 'open calls',
    'apply', 'application', 'opportunity', 'opportunities', 'latest', 'recent',
    'new', 'available', 'announcement', 'call for'
  ];
  
  const lowerMessage = message.toLowerCase();
  return searchTriggers.some(trigger => lowerMessage.includes(trigger));
}

// Search web using Tavily
async function searchWeb(query: string): Promise<string> {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query + ' cultural grants funding Greece Europe',
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      let searchContext = "LIVE WEB SEARCH RESULTS:\n";
      if (data.answer) {
        searchContext += `Summary: ${data.answer}\n\n`;
      }
      searchContext += "Sources:\n";
      data.results.forEach((r: any, i: number) => {
        searchContext += `${i + 1}. ${r.title}\n   ${r.content}\n   URL: ${r.url}\n\n`;
      });
      return searchContext;
    }
    return "";
  } catch (e) {
    console.error("Web search error:", e);
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    let profileContext = "";
    let snippetsContext = "";
    let knowledgeContext = "";
    let webSearchContext = "";
    
    if (user) {
      // Get user profile
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

USE THIS PROFILE to personalize ALL your advice.
`;
      }

      // Get user snippets/data
      const { data: snippets } = await supabase
        .from("org_snippets")
        .select("*")
        .eq("org_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (snippets && snippets.length > 0) {
        const reviews = snippets.filter(s => s.kind === "review");
        snippetsContext = `
USER'S DATA:
REVIEWS (${reviews.length} total):
${reviews.map(r => `- [${r.source}, Rating: ${r.rating || "N/A"}] "${r.content}"`).join("\n")}
`;
      }
    }

    const body = await req.json();
    const { message, language = "auto" } = body;

    // Search knowledge base for relevant info
    try {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: message,
      });

      const { data: knowledgeResults } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: 3,
      });

      if (knowledgeResults && knowledgeResults.length > 0) {
        knowledgeContext = `
EXPERT KNOWLEDGE (use this to give specific, professional advice):
${knowledgeResults.map((k: any) => `[${k.category}] ${k.content}`).join("\n\n")}
`;
      }
    } catch (e) {
      console.log("Knowledge search skipped:", e);
    }

    // Web search if needed
    if (needsWebSearch(message)) {
      webSearchContext = await searchWeb(message);
    }

    const detectedLanguage = language === "auto" 
      ? (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(message) ? "el" : "en")
      : language;

    const langName = detectedLanguage === "el" ? "Greek" : "English";

    const noProfileMessage = !profileContext 
      ? "\n\nNOTE: User hasn't set up their profile yet. Encourage them to visit /dashboard/profile."
      : "";

    const webSearchInstructions = webSearchContext 
      ? `\n\nWEB SEARCH INSTRUCTIONS: 
- You have live search results below with ACTUAL URLs
- ALWAYS include the full clickable URLs in your response using markdown format: [Name](https://url.com)
- Example: "Δείτε το πρόγραμμα [Art-Works](https://art-works.gr) για χρηματοδότηση"
- NEVER just mention a website name without the link
- List at least 2-3 specific opportunities with their direct links`
      : "";

    const systemPrompt = `You are Axiprova - an expert AI advisor for cultural sector professionals.

RESPOND ONLY IN ${langName}. NEVER mix languages.

YOUR IDENTITY:
- A trusted colleague with deep experience in cultural management
- You understand limited budgets, volunteer teams, funding challenges
- You speak as a supportive partner, practical and encouraging
${profileContext}
${snippetsContext}
${knowledgeContext}
${webSearchContext}
${noProfileMessage}
${webSearchInstructions}

YOUR EXPERTISE:
1. Exhibition & Event Planning
2. Audience Development  
3. Marketing & Communications
4. Funding & Grants
5. Educational Programs
6. Museum Management
7. Cultural Policy

IMPORTANT RULES:
- If you have WEB SEARCH RESULTS, prioritize that information for current/timely queries
- If you have KNOWLEDGE CONTEXT, use it for expert advice
- If user has a PROFILE, tailor advice to their org type, size, and challenges
- Maximum 2-3 paragraphs
- Be specific and actionable
- Always suggest 3-5 relevant next action buttons`;

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
