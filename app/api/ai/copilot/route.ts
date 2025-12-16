import { openai } from "@ai-sdk/openai";
import { streamObject, embed } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

type Mode = "chat" | "projects" | "grants" | "impact" | "trends";

/**
 * ACTIONS
 * Τα actions εμφανίζονται ως κουμπιά στο UI.
 * Το UI σου χρησιμοποιεί action.label για να ξαναστείλει prompt στο chat.
 * Άρα εδώ κρατάμε schema-based actions ώστε να περνάει το streamObject validation.
 */
const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_project_outline"),
    label: z.string(),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("create_grant_checklist"),
    label: z.string(),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("create_kpi_plan"),
    label: z.string(),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("run_trend_scan"),
    label: z.string(),
    payload: z.object({}),
  }),

  // κρατάμε και τα δικά σου existing action types
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
function needsWebSearch(message: string, mode: Mode): boolean {
  // grants/trends -> πιο συχνά web search
  if (mode === "grants" || mode === "trends") return true;

  const searchTriggers = [
    // Greek triggers
    "επιχορήγηση",
    "επιχορηγήσεις",
    "χρηματοδότηση",
    "προκήρυξη",
    "προκηρύξεις",
    "deadline",
    "προθεσμία",
    "προθεσμίες",
    "τρέχουσες",
    "τρέχοντα",
    "νέες",
    "νέα",
    "ανοιχτές",
    "ανοιχτά",
    "2024",
    "2025",
    "τώρα",
    "σήμερα",
    "φέτος",
    "creative europe",
    "ελλάδα",
    "υπουργείο πολιτισμού",
    "εσπα",
    // English triggers
    "grant",
    "grants",
    "funding",
    "deadline",
    "current",
    "open call",
    "open calls",
    "apply",
    "application",
    "opportunity",
    "opportunities",
    "latest",
    "recent",
    "new",
    "available",
    "announcement",
    "call for",
  ];

  const lowerMessage = message.toLowerCase();
  return searchTriggers.some((trigger) => lowerMessage.includes(trigger));
}

// Search web using Tavily
async function searchWeb(query: string): Promise<string> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query + " cultural grants funding Greece Europe",
        search_depth: "basic",
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

function modeInstructions(mode: Mode) {
  switch (mode) {
    case "projects":
      return `
CURRENT MODE: PROJECTS
You are a senior cultural project planner.
Always output:
1) Project snapshot (goal, audience, format)
2) Plan (timeline milestones, partners, resources/budget notes)
3) Deliverables (texts/docs needed)
4) Next best action (1 step)
Ask at most 2 clarifying questions.`;
    case "grants":
      return `
CURRENT MODE: GRANTS
You are a grant consultant (EU/Greece/cultural funding).
Always output:
- Eligibility questions (max 3)
- Shortlist or next steps
- Application checklist (sections + documents)
- Draft-ready text blocks (concise)
If web search exists, include 2–5 opportunities with markdown links.`;
    case "impact":
      return `
CURRENT MODE: IMPACT
You are an impact & evaluation specialist for cultural projects.
Always output:
- Short Theory of Change
- KPIs (outputs/outcomes/impact)
- Measurement plan (how/when/what data)
- Next best action (1 step)`;
    case "trends":
      return `
CURRENT MODE: TRENDS
You are a trend analyst for culture & creative industries.
Always output:
- 5 relevant trends (1 line each)
- 3 project ideas derived from trends
- Why each idea improves relevance/fundability
- Next best action (1 step)`;
    default:
      return `
CURRENT MODE: CHAT
You are Axiprova Advisor: friendly, professional, practical.
Ask at most 2 clarifying questions. Provide actionable bullets + next step.`;
  }
}

function actionsByMode(mode: Mode) {
  // αυτά θα εμφανιστούν ως κουμπιά κάτω από την απάντηση
  switch (mode) {
    case "projects":
      return [
        { type: "create_project_outline", label: "Create a project outline", payload: {} },
        { type: "draft_content", label: "Draft a press release", payload: { content_type: "press_release" } },
        { type: "draft_content", label: "Draft a partner outreach email", payload: { content_type: "email" } },
        { type: "analyze_audience", label: "Analyze target audiences", payload: {} },
      ] as const;
    case "grants":
      return [
        { type: "create_grant_checklist", label: "Build an application checklist", payload: {} },
        { type: "funding_help", label: "Draft Objectives & Activities section", payload: { section: "Objectives & Activities" } },
        { type: "search_web", label: "Search web for grants", payload: {} },
        { type: "funding_help", label: "Strengthen weaknesses & risks", payload: { section: "Risks & Weak Points" } },
      ] as const;
    case "impact":
      return [
        { type: "create_kpi_plan", label: "Generate KPIs & measurement plan", payload: {} },
        { type: "funding_help", label: "Draft an evaluation plan (grant-ready)", payload: { section: "Evaluation Plan" } },
        { type: "analyze_audience", label: "Impact by audience segment", payload: {} },
        { type: "funding_help", label: "Draft Theory of Change", payload: { section: "Theory of Change" } },
      ] as const;
    case "trends":
      return [
        { type: "run_trend_scan", label: "Run a trend scan", payload: {} },
        { type: "workshop_ideas", label: "Generate 3 project ideas from trends", payload: {} },
        { type: "search_web", label: "Search web for trend sources", payload: {} },
        { type: "analyze_audience", label: "Audience fit for trends", payload: {} },
      ] as const;
    default:
      return [
        { type: "draft_content", label: "Draft an email", payload: { content_type: "email" } },
        { type: "generate_titles", label: "Generate titles", payload: { count: 3 } },
        { type: "analyze_audience", label: "Analyze audience", payload: {} },
        { type: "analyze_reviews", label: "Analyze reviews", payload: {} },
      ] as const;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
        const reviews = snippets.filter((s) => s.kind === "review");
        snippetsContext = `
USER'S DATA:
REVIEWS (${reviews.length} total):
${reviews
  .map((r) => `- [${r.source}, Rating: ${r.rating || "N/A"}] "${r.content}"`)
  .join("\n")}
`;
      }
    }

    const body = await req.json();
    const { message, language = "auto", mode = "chat" } = body as {
      message: string;
      language?: "auto" | "el" | "en";
      mode?: Mode;
    };

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

    // Web search if needed (or forced by mode)
    if (needsWebSearch(message, mode)) {
      webSearchContext = await searchWeb(message);
    }

    const detectedLanguage =
      language === "auto"
        ? /[\u0370-\u03FF\u1F00-\u1FFF]/.test(message)
          ? "el"
          : "en"
        : language;

    const langName = detectedLanguage === "el" ? "Greek" : "English";

    const noProfileMessage = !profileContext
      ? "\n\nNOTE: User hasn't set up their profile yet. Encourage them to visit /dashboard/profile."
      : "";

    const webSearchInstructions = webSearchContext
      ? `\n\nWEB SEARCH INSTRUCTIONS:
- You have live search results below with ACTUAL URLs.
- ALWAYS include clickable links in markdown: [Name](https://url.com)
- List at least 2–5 specific opportunities/sources with direct links (when relevant).`
      : "";

    const systemPrompt = `You are Axiprova — an expert AI advisor for cultural sector professionals.

RESPOND ONLY IN ${langName}. NEVER mix languages.

TONE:
- Friendly, calm, professional
- Practical, not generic
- If user is unclear, ask at most 2 clarifying questions

${modeInstructions(mode)}

${profileContext}
${snippetsContext}
${knowledgeContext}
${webSearchContext}
${noProfileMessage}
${webSearchInstructions}

OUTPUT RULES:
- Keep it crisp: max 2–3 short paragraphs OR structured bullets.
- Be specific and actionable.
- Provide 2–5 action buttons ideas (the system will show buttons).`;

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
