import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { AXIPROVA_CULTURAL_IMPACT_V01 } from "@/lib/axiprova/indicatorLibrary";

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
  evidence: z
    .object({
      public_sources: z.array(z.string()).default([]),
      internal_sources: z.array(z.string()).default([]),
      notes: z.string().optional(),
    })
    .optional(),
});

// Structured Outputs: όλα required => nullable()
const OutputSchema = z.object({
  version: z.string(),
  assessment: z.object({
    indicator_assessments: z.array(
      z.object({
        indicator_id: z.string(),
        applicable: z.boolean(),
        score_0_to_1: z.number().min(0).max(1).nullable(),
        confidence: z.enum(["grey", "amber", "green"]),
        missing_data: z.array(z.string()),
        recommended_next_actions: z.array(z.string()),
        notes: z.string().nullable(),
      })
    ),
    summary: z.object({
      what_is_strong: z.array(z.string()),
      what_is_risky: z.array(z.string()),
      top_missing_data: z.array(z.string()),
    }),
  }),
});

function buildConsultantReportMarkdown(input: any, framework: any, parsed: any) {
  const proj = input.project || {};
  const a = parsed.assessment || {};
  const list = a.indicator_assessments || [];

  const byPillar: Record<string, any[]> = {};
  for (const ia of list) {
    const ind = framework.pillars.flatMap((p: any) => p.indicators).find((x: any) => x.id === ia.indicator_id);
    const pillarId = ind?.pillar_id || "OTHER";
    byPillar[pillarId] = byPillar[pillarId] || [];
    byPillar[pillarId].push({ ia, ind });
  }

  const md: string[] = [];
  md.push(`# Axiprova Impact Framework Report (v${framework.version})`);
  md.push(``);
  md.push(`## Project brief`);
  md.push(`- **Title:** ${proj.title ?? "—"}`);
  md.push(`- **Type:** ${proj.type ?? "—"}`);
  md.push(`- **Location:** ${proj.location ?? "—"}`);
  md.push(`- **Duration (days):** ${proj.duration_days ?? "—"}`);
  md.push(`- **Audience target:** ${(proj.audience_target ?? []).join(", ") || "—"}`);
  md.push(`- **Goals:** ${(proj.goals ?? []).join("; ") || "—"}`);
  md.push(`- **Activities:** ${(proj.activities ?? []).join("; ") || "—"}`);

  md.push(``);
  md.push(`## What Axiprova measures (pillar → indicators → evidence)`);
  md.push(`This report uses a fixed indicator library with weights and transparent rubrics. Missing evidence is flagged and confidence is shown.`);

  md.push(``);
  md.push(`## Executive synthesis`);
  md.push(`**Strengths (early signals):**`);
  md.push((a.summary?.what_is_strong ?? []).map((x: string) => `- ${x}`).join("\n") || `- (not enough evidence yet)`);
  md.push(``);
  md.push(`**Risks:**`);
  md.push((a.summary?.what_is_risky ?? []).map((x: string) => `- ${x}`).join("\n") || `- (not enough evidence yet)`);
  md.push(``);
  md.push(`**Top missing data to collect next:**`);
  md.push((a.summary?.top_missing_data ?? []).map((x: string) => `- ${x}`).join("\n") || `- (none)`);

  md.push(``);
  md.push(`## Pillar breakdown (with confidence + next actions)`);
  for (const p of framework.pillars) {
    md.push(``);
    md.push(`### ${p.name} (${p.weight_points} pts)`);
    md.push(`${p.description}`);

    const rows = byPillar[p.id] || [];
    if (!rows.length) {
      md.push(`- (No applicable indicators returned)`);
      continue;
    }

    for (const { ia, ind } of rows) {
      md.push(``);
      md.push(`**${ind.id} — ${ind.name}** (${ind.weight_points} pts)`);
      md.push(`- Definition: ${ind.definition}`);
      md.push(`- Confidence: **${ia.confidence}**`);
      md.push(`- Missing data: ${(ia.missing_data ?? []).length ? (ia.missing_data ?? []).map((x: string) => `  - ${x}`).join("\n") : "  - (none)"}`);
      md.push(`- Next actions: ${(ia.recommended_next_actions ?? []).length ? (ia.recommended_next_actions ?? []).map((x: string) => `  - ${x}`).join("\n") : "  - (none)"}`);
    }
  }

  md.push(``);
  md.push(`## Method notes`);
  md.push(`- Missing data rule: ${framework.rules.missing_data_rule}`);
  md.push(`- Confidence flags: green=audit, amber=submitted, grey=estimated/missing.`);
  md.push(`- Ratings (0–100) are part of the next step once evidence is provided for scoring.`);

  return md.join("\n");
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    const framework = AXIPROVA_CULTURAL_IMPACT_V01;

    const model = "gpt-4o-mini";

    const response = await client.responses.parse({
      model,
      max_output_tokens: 900,
      instructions:
        "You are Axiprova, a cultural impact measurement consultant. " +
        "You MUST use the provided indicator library. " +
        "For each indicator: decide if applicable, set score_0_to_1=null unless strong evidence exists in input, " +
        "set confidence to grey/amber/green, list missing data, and give next actions. " +
        "Keep outputs short and practical. No invented numbers.",
      input:
        "INPUT PROJECT:\n" +
        JSON.stringify(input, null, 2) +
        "\n\nINDICATOR LIBRARY (fixed):\n" +
        JSON.stringify(framework, null, 2) +
        "\n\nReturn JSON that matches the schema exactly.",
      text: { format: zodTextFormat(OutputSchema, "impact_outline") },
    });

    const parsed = (response as any).output_parsed;
    if (!parsed) {
      return NextResponse.json({ error: "impact-outline failed", details: "No structured output returned." }, { status: 502 });
    }

    const report_markdown = buildConsultantReportMarkdown(input, framework, parsed);

    return NextResponse.json({
      version: framework.version,
      framework,
      report_markdown,
      data: parsed.assessment,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "impact-outline failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
