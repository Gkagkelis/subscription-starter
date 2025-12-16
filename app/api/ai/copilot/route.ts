import { NextResponse } from "next/server";

import { openai } from "@ai-sdk/openai";
import { generateObject, embed } from "ai";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs" as const;
export const dynamic = "force-dynamic" as const;

type Mode = "chat" | "projects" | "grants" | "impact" | "trends";

/** ✅ Actions schema (includes Smart Assist chips: set_context) */
const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_project_outline"), label: z.string(), payload: z.object({}).default({}) }),
  z.object({ type: z.literal("create_grant_checklist"), label: z.string(), payload: z.object({}).default({}) }),
  z.object({ type: z.literal("create_kpi_plan"), label: z.string(), payload: z.object({}).default({}) }),
  z.object({ type: z.literal("run_trend_scan"), label: z.string(), payload: z.object({}).default({}) }),

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
    payload: z.object({ topic: z.string().optional() }).default({}),
  }),
  z.object({
    type: z.literal("analyze_audience"),
    label: z.string(),
    payload: z.object({ focus: z.string().optional() }).default({}),
  }),
  z.object({
    type: z.literal("funding_help"),
    label: z.string(),
    payload: z.object({ section: z.string().optional() }).default({}),
  }),
  z.object({
    type: z.literal("analyze_reviews"),
    label: z.string(),
    payload: z.object({ focus: z.string().optional() }).default({}),
  }),
  z.object({
    type: z.literal("search_web"),
    label: z.string(),
    payload: z.object({ query: z.string().optional() }).default({}),
  }),

  // ✅ Smart Assist chips (writes to sessionContext in UI)
  z.object({
    type: z.literal("set_context"),
    label: z.string(),
    payload: z.record(z.any()),
  }),
]);

type CopilotAction = z.infer<typeof ActionSchema>;

/** ✅ Model output schema */
const CopilotOutputSchema = z.object({
  reply: z.string(),
  insights: z.array(z.string()).optional(),
  actions: z.array(ActionSchema).default([]),
  language_detected: z.enum(["el", "en"]),
});

function needsWebSearch(message: string, mode: Mode): boolean {
  if (mode === "grants" || mode === "trends") return true;

  const triggers = [
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
    "grant",
    "grants",
    "funding",
    "current",
    "open call",
    "open calls",
    "apply",
    "application",
    "opportunity",
    "latest",
    "recent",
    "new",
    "available",
  ];
  const lower = (message || "").toLowerCase();
  return triggers.some((t) => lower.includes(t));
}

function isCountryKnown(message: string, profileLocation?: string): boolean {
  const loc = (profileLocation || "").trim().toLowerCase();
  if (loc && loc !== "not set" && loc !== "unknown" && loc !== "n/a") return true;

  const m = (message || "").toLowerCase();
  const hints = [
    "greece","ελλάδα","athens","αθήνα","thessaloniki","θεσσαλονίκη","cyprus","κύπρος","europe","eu","e.u.",
    "united kingdom","uk","england","scotland","wales","ireland","france","paris","germany","berlin","italy","rome",
    "spain","madrid","portugal","lisbon","netherlands","amsterdam","belgium","brussels","sweden","stockholm","norway",
    "oslo","denmark","copenhagen","finland","helsinki","poland","warsaw","romania","bucharest","bulgaria","sofia",
    "austria","vienna","switzerland","zurich","usa","united states","america","new york","california","canada","toronto",
    "vancouver","mexico","brazil","argentina","australia","sydney","melbourne","new zealand","india","singapore",
    "japan","tokyo","south korea","seoul",
  ];
  return hints.some((h) => m.includes(h));
}

async function searchWeb(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "";

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query + " culture creative industries",
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
    });

    const data = await response.json();

    if (data.results?.length) {
      let ctx = "LIVE WEB SEARCH RESULTS:\n";
      if (data.answer) ctx += `Summary: ${data.answer}\n\n`;
      ctx += "Sources:\n";
      data.results.forEach((r: any, i: number) => {
        ctx += `${i + 1}. ${r.title}\n   ${r.content}\n   URL: ${r.url}\n\n`;
      });
      return ctx;
    }
    return "";
  } catch (e) {
    console.error("Web search error:", e);
    return "";
  }
}

function modeChipGuidance(mode: Mode) {
  switch (mode) {
    case "trends":
      return `
CHIPS GUIDANCE (TRENDS):
When info is missing, prefer set_context chips for:
- market: instagram / retail / wholesale
- price_tier: low / mid / premium
- style: minimal / colorful / experimental`;
    case "grants":
      return `
CHIPS GUIDANCE (GRANTS):
When info is missing, prefer set_context chips for:
- organization_type: ngo / artist / venue / festival
- project_scale: small / medium / large
- timeline: 1–3 months / 3–6 / 6–12`;
    case "projects":
      return `
CHIPS GUIDANCE (PROJECTS):
When info is missing, prefer set_context chips for:
- format: exhibition / festival / workshops
- team_size: solo / small team / org
- deadline: soon / this quarter / this year`;
    default:
      return "";
  }
}

function modeInstructions(mode: Mode) {
  const sharedStyle = `
STYLE (very important):
- Sound like a helpful colleague/friend (warm, human, not robotic).
- Avoid formal report headings.
- Use short paragraphs + bullets.
- Be concrete (examples, quick experiments).
- Ask at most ONE clarifying question.
- Do NOT mention funding unless the user asks about funding/grants.`;

  switch (mode) {
    case "projects":
      return `
CURRENT MODE: PROJECTS
Give a friendly opener, then:
- 5–8 bullets with a clear plan (timeline, partners, resources)
- One simple next step
${sharedStyle}`;

    case "grants":
      return `
CURRENT MODE: GRANTS
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
Give:
- A short Theory of Change
- KPIs (outputs/outcomes/impact)
- Measurement plan
- One next step
${sharedStyle}`;

    case "trends":
      return `
CURRENT MODE: TRENDS
Respond like a creative partner, not a report.
For product/market questions, focus on competitiveness:
- 4–6 market/product trends
- 3 concrete product directions (examples: shapes, glazes, price tiers)
- 1 quick experiment to validate demand this week
- Ask 1 clarifying question
${sharedStyle}`;

    default:
      return `
CURRENT MODE: CHAT
Warm, practical, human.
Bullets + one next step.
${sharedStyle}`;
  }
}

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

/**
 * ✅ Enforces “magic consistency”:
 * Always add missing set_context chips per mode (3–5 classic dimensions),
 * regardless of whether the model returned them.
 */
function ensureModeContextChips(
  mode: Mode,
  actions: CopilotAction[],
  sessionContext: Record<string, any> | undefined
): CopilotAction[] {
  const ctx = sessionContext ?? {};
  const chips: CopilotAction[] = [];

  const addIfMissing = (key: string, options: Array<{ label: string; payload: Record<string, any> }>) => {
    const current = ctx[key];
    const hasValue = current !== undefined && current !== null && String(current).trim() !== "";
    if (hasValue) return;

    const alreadyHas = (payload: Record<string, any>) =>
      actions.some((a) => a.type === "set_context" && JSON.stringify(a.payload ?? {}) === JSON.stringify(payload));

    for (const opt of options) {
      if (!alreadyHas(opt.payload)) chips.push({ type: "set_context", label: opt.label, payload: opt.payload });
    }
  };

  if (mode === "trends") {
    addIfMissing("market", [
      { label: "Instagram", payload: { market: "instagram" } },
      { label: "Retail", payload: { market: "retail" } },
      { label: "Wholesale", payload: { market: "wholesale" } },
    ]);
    addIfMissing("price_tier", [
      { label: "Low", payload: { price_tier: "low" } },
      { label: "Mid", payload: { price_tier: "mid" } },
      { label: "Premium", payload: { price_tier: "premium" } },
    ]);
    addIfMissing("style", [
      { label: "Minimal", payload: { style: "minimal" } },
      { label: "Colorful", payload: { style: "colorful" } },
      { label: "Experimental", payload: { style: "experimental" } },
    ]);
  }

  if (mode === "grants") {
    addIfMissing("organization_type", [
      { label: "NGO", payload: { organization_type: "ngo" } },
      { label: "Artist", payload: { organization_type: "artist" } },
      { label: "Venue", payload: { organization_type: "venue" } },
      { label: "Festival", payload: { organization_type: "festival" } },
    ]);
    addIfMissing("project_scale", [
      { label: "Small", payload: { project_scale: "small" } },
      { label: "Medium", payload: { project_scale: "medium" } },
      { label: "Large", payload: { project_scale: "large" } },
    ]);
    addIfMissing("timeline", [
      { label: "1–3 months", payload: { timeline: "1-3" } },
      { label: "3–6 months", payload: { timeline: "3-6" } },
      { label: "6–12 months", payload: { timeline: "6-12" } },
    ]);
  }

  if (mode === "projects") {
    addIfMissing("format", [
      { label: "Exhibition", payload: { format: "exhibition" } },
      { label: "Festival", payload: { format: "festival" } },
      { label: "Workshops", payload: { format: "workshops" } },
    ]);
    addIfMissing("team_size", [
      { label: "Solo", payload: { team_size: "solo" } },
      { label: "Small team", payload: { team_size: "small_team" } },
      { label: "Organization", payload: { team_size: "org" } },
    ]);
    addIfMissing("deadline", [
      { label: "Soon", payload: { deadline: "soon" } },
      { label: "This quarter", payload: { deadline: "this_quarter" } },
      { label: "This year", payload: { deadline: "this_year" } },
    ]);
  }

  if (chips.length === 0) return actions;
  return [...chips, ...actions];
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

    let profileLocation: string | undefined;
    let needsCountry = false;

    if (user) {
      const { data: profile } = await supabase.from("org_profiles").select("*").eq("user_id", user.id).single();

      if (profile) {
        profileLocation = profile.location || undefined;

        profileContext = `
ORGANIZATION PROFILE:
- Name: ${profile.org_name || "Not set"}
- Type: ${profile.org_type || "Not set"}
- Size: ${profile.org_size || "Not set"}
- Location: ${profile.location || "Not set"}
- Target Audience: ${profile.target_audience || "Not set"}
- Main Challenges: ${profile.main_challenges || "Not set"}
- Goals: ${profile.goals || "Not set"}
`;
      }

      const { data: snippets } = await supabase
        .from("org_snippets")
        .select("*")
        .eq("org_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (snippets?.length) {
        const reviews = snippets.filter((s) => s.kind === "review");
        snippetsContext = `
USER'S DATA:
REVIEWS (${reviews.length} total):
${reviews.map((r) => `- [${r.source}, Rating: ${r.rating || "N/A"}] "${r.content}"`).join("\n")}
`;
      }
    }

    const body = await req.json();

    const {
      message,
      language = "auto",
      mode = "chat",
      action,
      sessionContext,
      context,
    } = body as {
      message: string;
      language?: "auto" | "el" | "en";
      mode?: Mode;
      action?: { type: string; label: string; payload?: any };
      sessionContext?: Record<string, any>;
      context?: { lastAssistantMessage?: string };
    };

    const ctxBlock =
      sessionContext && Object.keys(sessionContext).length > 0
        ? `\nSESSION CONTEXT:\n${JSON.stringify(sessionContext, null, 2)}\n`
        : "";

    const countryFromSession = sessionContext?.country || sessionContext?.region || sessionContext?.location;

    needsCountry =
      (mode === "grants" || mode === "trends") &&
      !countryFromSession &&
      !isCountryKnown(message, profileLocation);

    const lastAssistant = context?.lastAssistantMessage?.trim() || "";
    const actionContext =
      action && action.type !== "generic"
        ? `
USER CLICKED ACTION:
- type: ${action.type}
- label: ${action.label}
- payload: ${JSON.stringify(action.payload ?? {})}
PREVIOUS ASSISTANT MESSAGE (context):
${lastAssistant ? lastAssistant : "(none)"}
`
        : "";

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

      if (knowledgeResults?.length) {
        knowledgeContext = `
EXPERT KNOWLEDGE (use when relevant):
${knowledgeResults.map((k: any) => `[${k.category}] ${k.content}`).join("\n\n")}
`;
      }
    } catch (e) {
      console.log("Knowledge search skipped:", e);
    }

    if (needsWebSearch(message, mode) && !needsCountry) {
      webSearchContext = await searchWeb(message);
    }

    const detectedLanguage =
      language === "auto"
        ? /[\u0370-\u03FF\u1F00-\u1FFF]/.test(message)
          ? "el"
          : "en"
        : language;

    const langName = detectedLanguage === "el" ? "Greek" : "English";
    const countryQuestion = detectedLanguage === "el" ? "Σε ποια χώρα βρίσκεσαι;" : "Which country are you in?";

    const countryClarificationInstruction = needsCountry
      ? `
LOCATION NEEDED:
- Ask exactly ONE question first: "${countryQuestion}"
- Also return 3–5 set_context chips for location (examples):
  - Greece / Cyprus / EU / UK / USA
  payload examples:
  - { "country": "Greece" }, { "country": "Cyprus" }, { "region": "EU" }, { "country": "UK" }, { "country": "USA" }
- Do NOT list opportunities yet. Keep the reply short.`
      : "";

    const webSearchInstructions = webSearchContext
      ? `\n\nWEB SEARCH:
- Include clickable markdown links: [Name](https://url.com)
- Use web results only when they help the question.`
      : "";

    const systemPrompt = `You are Axiprova — an expert AI advisor for culture & the creative industries.

RESPOND ONLY IN ${langName}. NEVER mix languages.

CORE BEHAVIOR:
- Warm, human, like a real colleague/friend.
- Avoid robotic templates and corporate report tone.
- Be specific and practical.
- Ask at most ONE clarifying question total.
- Do NOT mention funding unless the user asks, except in GRANTS mode.

SMART ASSIST (chips):
When key info is missing:
- Give a helpful partial answer first (do not refuse).
- Ask at most ONE clarifying question.
- Also return 3–9 quick "set_context" actions (chips) with short labels.

${modeChipGuidance(mode)}

${modeInstructions(mode)}

${countryClarificationInstruction}

${profileContext}
${snippetsContext}
${knowledgeContext}
${webSearchContext}
${webSearchInstructions}

OUTPUT RULES:
- Natural voice (not a formal report).
- Short paragraphs + bullets (max ~10 bullets).
- Avoid repetitive templates.
- Return actions that match the schema.
- language_detected must match the detected language.`;

    const finalPrompt = systemPrompt + ctxBlock + "\n" + actionContext + "\nUser: " + message;

    const { object } = await generateObject({
      model: openai("gpt-4o-2024-08-06"),
      schema: CopilotOutputSchema,
      prompt:
        finalPrompt +
        `

ACTIONS:
- You may return any actions that match the Zod schema.
- In addition to the mode actions below, you MAY return "set_context" chips when you need missing info.

Mode actions (optional): ${JSON.stringify(actionsByMode(mode))}`,
    });

    const fallbackActions = actionsByMode(mode) as unknown as CopilotAction[];
    let finalActions: CopilotAction[] =
      Array.isArray(object.actions) && object.actions.length > 0 ? (object.actions as CopilotAction[]) : fallbackActions;

    // ✅ ALWAYS enforce stable mode chips
    finalActions = ensureModeContextChips(mode, finalActions, sessionContext);

    return NextResponse.json({
      ...object,
      actions: finalActions,
    });
  } catch (error: any) {
    console.error("Copilot error:", error);
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
