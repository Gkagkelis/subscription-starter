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
      location: z.string().optional(),
    }),
    pillars: z
      .array(
        z.object({
          name: z.string(),
          weight: z.number(),
          rationale: z.string().optional(),
          metrics: z.array(z.string()).default([]),
        })
      )
      .default([]),
    pilot_design: z.object({
      hypotheses: z.array(z.string()).default([]),
      sample: z.string().optional(),
      instruments: z.array(z.string()).default([]),
      timeline_days: z.number().int().positive().optional(),
    }),
    scenario_levers: z
      .array(
        z.object({
          lever: z.string(),
          direction: z.string(),
          expected_effect: z.string(),
        })
      )
      .default([]),
    prediction_scaffold: z.object({
      outcomes: z.array(z.string()).default([]),
      assumptions: z.array(z.string()).default([]),
      data_needed: z.array(z.string()).default([]),
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
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    const response = await client.responses.parse({
      model,
      max_output_tokens: 700,
      input: [
        {
          role: "system",
          content:
            "You are Axiprova, an impact measurement & evaluation consultant for culture and creative industries. " +
            "Write professionally like a consultant. Be practical. Do not invent numbers. " +
            "Always include: assumptions, risks, bias considerations, missing data.",
        },
        {
          role: "user",
          content:
            "Create an Axiprova impact outline (v0.1) for this project input:\n\n" +
            JSON.stringify(input, null, 2) +
            "\n\nPillars and weights:\n- experience 25\n- access 20\n- inclusivity 20\n- transparency 15\n- community 20\n\n" +
            "Return a JSON object that matches the provided schema.",
        },
      ],
      text: {
        format: zodTextFormat(OutputSchema, "impact_outline"),
      },
    });

    return NextResponse.json(response.output_parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: "impact-outline failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
