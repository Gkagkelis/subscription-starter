import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const DerivativeFormat = z.enum([
  "social_post",
  "website_blurb",
  "email_pitch",
  "application_version",
]);

const InputSchema = z.object({
  raw_description: z.string(),
  field: z.string().optional(),
  format: z.string().optional(),
  audience: z.array(z.string()).default([]),
  contexts: z.array(z.string()).default([]),
  tone: z.enum(["neutral","poetic","professional","accessible","funder_ready"]).default("neutral"),
  intention: z.array(z.string()).default([]),
  impact_signals: z.array(z.string()).default([]),
  accessibility_notes: z.string().optional(),
  evidence: z.string().optional(),
});

const OutputSchema = z.object({
  title: z.string(),
  dna: z.string(),
  derivatives: z.array(z.object({
    format: DerivativeFormat,
    content: z.string(),
  })),
});

function toneGuide(tone: string) {
  switch (tone) {
    case "poetic": return "Poetic but still clear. Avoid vague fluff.";
    case "professional": return "Professional, direct, confident. No hype.";
    case "accessible": return "Plain language, inclusive, easy to understand.";
    case "funder_ready": return "Funder-ready: structured, outcomes-aware, credible, not corporate.";
    default: return "Neutral, clear, human.";
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Bad input" }, { status: 400 });

  const a = parsed.data;

  const prompt = `
You are Axiprova. Respond ONLY in English.

Goal: Create "Project DNA" (150–220 words) that can be reused everywhere.
Embed methodology subtly:
- clear what it is
- audience + context
- intent (feel/understand/do)
- impact signals (cultural/social/educational/economic/environmental)
- accessibility consideration (human, simple)

Tone: ${toneGuide(a.tone)}

Inputs:
Raw: ${a.raw_description}
Field: ${a.field ?? "N/A"}
Format: ${a.format ?? "N/A"}
Audience: ${a.audience.join(", ") || "N/A"}
Contexts: ${a.contexts.join(", ") || "N/A"}
Intention: ${a.intention.join(", ") || "N/A"}
Impact: ${a.impact_signals.join(", ") || "N/A"}
Accessibility: ${a.accessibility_notes ?? "N/A"}
Evidence: ${a.evidence ?? "N/A"}

Also produce 4 derivatives from the DNA:
- social_post
- website_blurb
- email_pitch
- application_version

Derivative rules:
- social_post: hook + 2–4 short lines + optional CTA (no hashtags)
- website_blurb: 80–120 words
- email_pitch: subject line + short email (<=180 words)
- application_version: structured paragraph with (what/why/audience/outcomes/accessibility)
`;

  const result = await generateObject({
    model: openai("gpt-4o-2024-08-06"),
    schema: OutputSchema,
    prompt,
  });

  return Response.json(result.object);
}
