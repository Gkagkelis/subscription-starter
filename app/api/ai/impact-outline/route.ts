import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const InputSchema = z.object({
  project: z.object({
    title: z.string().min(1),
    type: z.string().min(1),
    location: z.string().optional(),
    duration_days: z.number().int().positive().optional(),
    audience_target: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([]),
    activities: z.array(z.string()).default([]),
  }),
  constraints: z
    .object({
      budget_eur: z.number().nonnegative().optional(),
      team_size: z.number().int().positive().optional(),
      data_available: z.array(z.string()).default([]),
    })
    .optional(),
});

const OutputSchema = z.object({
  version: z.string(),
  report_markdown: z.string(),
  data: z.object({
    project_summary: z.object({
      title: z.string(),
      type: z.string(),
      location: z.string().nullable(),
    }),
    pillars: z.array(
      z.object({
        name: z.string(),
        weight: z.number(),
        rationale: z.string().nullable(),
        metrics: z.array(z.string()),
      })
    ),
    pilot_design: z.object({
      hypotheses: z.array(z.string()),
      sample: z.string().nullable(),
      instruments: z.array(z.string()),
      timeline_days: z.number().int().positive().nullable(),
    }),
    scenario_levers: z.array(
      z.object({
        lever: z.string(),
        direction: z.string(),
        expected_effect: z.string(),
      })
    ),
    prediction_scaffold: z.object({
      outcomes: z.array(z.string()),
      assumptions: z.array(z.string()),
      data_needed: z.array(z.string()),
    }),
  }),
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    const model = "gpt-4o-mini";

    const response = await client.responses.parse({
      model,
      max_output_tokens: 4096,  // ← ΑΥΞΗΜΕΝΟ!
      instructions:
        "You are Axiprova, an impact measurement & evaluation consultant for culture and creative industries. " +
        "Write professionally like a consultant. Be practical. Do not invent numbers. " +
        "Always include: assumptions, risks, bias considerations, missing data. " +
        "Output must match the provided JSON schema exactly.",
      input:
        "Create an Axiprova impact outline (v0.1) for this project input:\n\n" +
        JSON.stringify(input, null, 2) +
        "\n\nPillars and weights:\n- experience 25\n- access 20\n- inclusivity 20\n- transparency 15\n- community 20\n",
      text: {
        format: zodTextFormat(OutputSchema, "impact_outline"),
      },
    });

    const parsed = (response as any).output_parsed;

    if (!parsed) {
      return NextResponse.json(
        {
          error: "impact-outline failed",
          details: "No structured output returned by the model.",
          output_text: (response as any).output_text ?? null,
          output: (response as any).output ?? null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: "impact-outline failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
