import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs"; 
export const maxDuration = 60;


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

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    const response = await client.responses.create({
  model,
  max_output_tokens: 700,

instructions:
        "You are Axiprova, an impact measurement & evaluation consultant for culture and creative industries. " +
        "Write professionally like a consultant. Be practical. Do not invent numbers. " +
        "Always include: assumptions, risks, bias considerations, missing data. " +
        "Return JSON only with keys: version, report_markdown, data.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Create an Axiprova impact outline (v0.1) for this project input:\n\n" +
                JSON.stringify(input, null, 2) +
                "\n\nPillars and weights:\n- experience 25\n- access 20\n- inclusivity 20\n- transparency 15\n- community 20\n\n" +
                "Return:\n" +
                "version: '0.1'\n" +
                "report_markdown: A consultant-style report with sections: Executive Summary, Impact Logic, Measurement Plan, Pilot Plan, Scenario Levers, Next 7 Days\n" +
                "data: A structured object with: project_summary, pillars, pilot_design, scenario_levers, prediction_scaffold.\n",
            },
          ],
        },
      ],
    });

    const text = (response as any).output_text as string;
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: "impact-outline failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
