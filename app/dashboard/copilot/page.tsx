import { openai } from "@ai-sdk/openai";
import { streamObject, embed } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

type Mode = "chat" | "projects" | "grants" | "impact" | "trends";

/**
 * ACTIONS
 * Τα actions εμφανίζονται ως κουμπιά στο UI (το UI σου χρησιμοποιεί action.label σαν prompt).
 */
const ActionSchema = z.discriminatedUnion("type", [
  // New, mode-focused actions (safe + simple)
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

  // Your existing action types
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

/**
 * Decide if we should web search
 * - grants/trends: almost always helpful, so we do it aggressively
 * - otherwise: trigger-based
 */
function needsWebSearch(message: string, mode: Mode): boolean {
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

/**
 * Search web using Tavily
 */
async function searchWeb(query: string): Promise<string> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query + " cultural creative industries Greece Europe",
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

/**
 * Friendly, human, non-robotic instructions per mode
 * - Avoid formal report style
 * - Keep it practical and specific
 * - Funding talk only in grants mode (unless user asks explicitly)
 */
function modeInstructions(mode: Mode) {
  const sharedStyle = `
STYLE (very important):
- Sound like a helpful colleague/friend (warm, human, not robotic).
- Avoid formal report headings (no big titles like "Τάσεις στον Τομέα").
- Use short paragraphs + bullets. No long enumerations.
- Be concrete (examples, materials, sizes, quick experiments).
- Ask at most 1–2 clarifying questions, only if needed.
- Do NOT mention funding unless the user asks about funding/grants.`;

  switch (mode) {
    case "projects":
      return `
CURRENT MODE: PROJECTS
You are a senior cultural project planner.
Give a friendly opener, then:
- 5–8 bullets with a clear plan (timeline milestones, partners, resources/budget notes)
- A simple next step (one action)
${sharedStyle}`;

    case "grants":
      return `
CURRENT MODE: GRANTS
You are a grant consultant (EU/Greece/cultural funding).
Give:
- 2–3 eligibility questions
- A short checklist (sections + documents)
- 1–2 draft-ready text blocks (short)
If web search exists, include 2–5 opportunities with markdown links.
${sharedStyle}
NOTE: Funding is allowed here.`;

    case "impact":
      return `
CURRENT MODE: IMPACT
You are an impact & evaluation specialist for cultural projects.
Give:
- A short Theory of Change
- KPIs (outputs/outcomes/impact) in bullets
- A measurement plan (how/when/what data)
- One next step
${sharedStyle}`;

    case "trends":
      return `
CURRENT MODE: TRENDS
You are a trend analyst for culture & creative industries,
but respond like a creative partner, not a report.
For product/market questions (e.g., ceramics), focus on competitiveness:
- 4–6 relevant market/product trends (short, specific)
- 3 concrete product directions (with examples: shapes, glazes, price tiers)
- 1 quick experiment to validate demand this week
- Ask 1 clarifying question at the end
${sharedStyle}`;

    default:
      return `
CURRENT MODE: CHAT
You are Axiprova Advisor: warm, practical, human.
Give actionable bullets + one next step.
${sharedStyle}`;
  }
}

/**
 * Actions per mode (buttons)
 * Keep them "human" and useful — not corporate.
 */
function actionsByMode(mode: Mode) {
  switch (mode) {
    case "projects":
      return [
        { type: "create_project_outline", label: "Make a project outline", payload: {} },
        { type: "draft_content", label: "Draft a partner email", payload: { content_type: "email" } },
        { type: "draft_content", label: "Draft a press release", payload: { content_type: "press_release" } },
        { type: "analyze_audience", label: "Who is my audience?", payload: {} },
      ] as const;

    case "grants":
      return [
        { type: "create_grant_checklist", label: "Build an application checklist", payload: {} },
        { type: "funding_help", label: "Draft Objectives & Activities", payload: { section: "Objectives & Activities" } },
        { type: "search_web", label: "Search web for open calls", payload: {} },
        { type: "funding_help", label: "Fix weak points & risks", payload: { section: "Risks & Weak Points" } },
      ] as const;

    case "impact":
      return [
        { type: "create_kpi_plan", label: "Generate KPIs (simple)", payload: {} },
        { type: "funding_help", label: "Draft a Theory of Change", payload: { section: "Theory of Change" } },
        { type: "funding_help", label: "Draft an evaluation plan", payload: { section: "Evaluation Plan" } },
        { type: "analyze_audience", label: "Impact by audience segment", payload: {} },
      ] as const;

    case "trends":
      return [
        { type: "run_trend_scan", label: "Give me 5 trends + 3 ideas", payload: {} },
        { type: "workshop_ideas", label: "Give me 3 concrete product directions", payload: {} },
        { type: "analyze_audience", label: "Who would buy this?", payload: {} },
        { type: "search_web", label: "Search web for trend sources", payload: {} },
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

    // ---------------------------
    // 1) Load profile + snippets
    // ---------------------------
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

Use this profile to personalize advice (only when relevant).
`;
      }

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

    // ---------------------------
    // 2) Read request
    // ---------------------------
    const body = await req.json();
    const { message, language = "auto", mode = "chat" } = body as {
      message: string;
      language?: "auto" | "el" | "en";
      mode?: Mode;
    };

    // ---------------------------
    // 3) Knowledge base search
    // ---------------------------
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
EXPERT KNOWLEDGE (use when relevant):
${knowledgeResults.map((k: any) => `[${k.category}] ${k.content}`).join("\n\n")}
`;
      }
    } catch (e) {
      console.log("Knowledge search skipped:", e);
    }

    // ---------------------------
    // 4) Web search (when needed)
    // ---------------------------
    if (needsWebSearch(message, mode)) {
      webSearchContext = await searchWeb(message);
    }

    // ---------------------------
    // 5) Language detect
    // ---------------------------
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
- Use web results only when they truly help the user's question.`
      : "";

    // ---------------------------
    // 6) System prompt (friendly)
    // ---------------------------
    const systemPrompt = `You are Axiprova — an expert AI advisor for culture & the creative industries.

RESPOND ONLY IN ${langName}. NEVER mix languages.

CORE BEHAVIOR:
- Sound like a real helpful colleague/friend (warm, human).
- Avoid robotic templates and corporate report tone.
- Be specific, practical, and short.
- Ask at most 1–2 clarifying questions when needed.
- Do NOT mention funding unless the user asks, except in GRANTS mode.

${modeInstructions(mode)}

${profileContext}
${snippetsContext}
${knowledgeContext}
${webSearchContext}
${noProfileMessage}
${webSearchInstructions}

OUTPUT RULES:
- Write naturally (like a helpful colleague), not like a formal report.
- Prefer short paragraphs + bullets (max ~10 bullets total).
- Avoid generic phrases and avoid repetitive templates.
- Provide 2–5 action button ideas (the system will show buttons).`;

    // ---------------------------
    // 7) Call model (structured)
    // ---------------------------
    const result = await streamObject({
      model: openai("gpt-4o-2024-08-06"),
      schema: CopilotOutputSchema,
      prompt:
        systemPrompt +
        `

Return actions that match the current mode.
Mode actions available: ${JSON.stringify(actionsByMode(mode))}

User: ${message}`,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("Copilot error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
