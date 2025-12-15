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

    let snippetsContext = "";
    
    if (user) {
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
USER'S DATA (use this to personalize your advice):

REVIEWS (${reviews.length} total):
${reviews.map(r => `- [${r.source}, Rating: ${r.rating || "N/A"}] "${r.content}"`).join("\n")}

TRENDS (${trends.length} total):
${trends.map(t => `- [${t.source}] "${t.content}"`).join("\n")}

COMPETITOR INSIGHTS (${competitors.length} total):
${competitors.map(c => `- [
