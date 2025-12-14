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

// Structured Outputs: όλα required => nullable όπου χρειάζεται
const OutputSchema = z.object({
  version: z.string(),
  assessment: z.object({
    indicator_assessments: z.array(
      z.object({
        indicator_id: z.string(),
        applicable: z.boolean(),
        score_0_to_1: z.number().min(0).max(1).nullable(),
        confidence: z.enum(["grey", "amber", "green"]),
        // IMPORTANT: Strings will be bilingual "EL: ... | EN: ..."
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

function elPillarName(id: string, fallback: string) {
  const map: Record<string, string> = {
    EXPERIENCE: "Εμπειρία / Δέσμευση",
    ACCESS: "Πρόσβαση",
    INCLUSIVITY: "Συμπερίληψη / Ισότητα & Διαφορετικότητα",
    TRANSPARENCY: "Διαφάνεια",
    COMMUNITY: "Κοινότητα / Συμμετοχή",
  };
  return map[id] || fallback;
}

function buildConsultantReportMarkdown(input: any, framework: any, parsed: any) {
  const proj = input.project || {};
  const a = parsed.assessment || {};
  const list = a.indicator_assessments || [];

  const byPillar: Record<string, any[]> = {};
  for (const ia of list) {
    const ind = framework.pillars
      .flatMap((p: any) => p.indicators)
      .find((x: any) => x.id === ia.indicator_id);
    const pillarId = ind?.pillar_id || "OTHER";
    byPillar[pillarId] = byPillar[pillarId] || [];
    byPillar[pillarId].push({ ia, ind });
  }

  const md: string[] = [];

  md.push(`# Axiprova Impact Framework Report (v${framework.version})`);
  md.push(`# Αναφορά Πλαισίου Impact Axiprova (v${framework.version})`);
  md.push(``);

  md.push(`## Project brief / Σύνοψη έργου`);
  md.push(`- **Title / Τίτλος:** ${proj.title ?? "—"}`);
  md.push(`- **Type / Τύπος:** ${proj.type ?? "—"}`);
  md.push(`- **Location / Τοποθεσία:** ${proj.location ?? "—"}`);
  md.push(`- **Duration (days) / Διάρκεια (ημέρες):** ${proj.duration_days ?? "—"}`);
  md.push(`- **Audience target / Κοινό-στόχος:** ${(proj.audience_target ?? []).join(", ") || "—"}`);
  md.push(`- **Goals / Στόχοι:** ${(proj.goals ?? []).join("; ") || "—"}`);
  md.push(`- **Activities / Δραστηριότητες:** ${(proj.activities ?? []).join("; ") || "—"}`);

  md.push(``);
  md.push(`## What Axiprova measures / Τι μετρά το Axiprova`);
  md.push(
    `This report uses a fixed indicator library with weights and transparent rubrics. ` +
      `Missing evidence is flagged and confidence is shown. ` +
      `\n\nΧρησιμοποιούμε σταθερή βιβλιοθήκη δεικτών (με βάρη και ρουμπρίκες). ` +
      `Ό,τι λείπει σημαίνεται (missing data) και εμφανίζεται επίπεδο βεβαιότητας (confidence).`
  );

  md.push(``);
  md.push(`## Executive synthesis / Εκτελεστική σύνοψη`);

  md.push(`**Strengths / Δυνατά σημεία:**`);
  md.push(
    (a.summary?.what_is_strong ?? []).length
      ? (a.summary?.what_is_strong ?? []).map((x: string) => `- ${x}`).join("\n")
      : `- (EL: Δεν υπάρχουν ακόμη επαρκή τεκμήρια. | EN: Not enough evidence yet.)`
  );

  md.push(``);
  md.push(`**Risks / Ρίσκα:**`);
  md.push(
    (a.summary?.what_is_risky ?? []).length
      ? (a.summary?.what_is_risky ?? []).map((x: string) => `- ${x}`).join("\n")
      : `- (EL: Δεν υπάρχουν ακόμη επαρκή τεκμήρια. | EN: Not enough evidence yet.)`
  );

  md.push(``);
  md.push(`**Top missing data / Κορυφαία “κενά” δεδομένων:**`);
  md.push(
    (a.summary?.top_missing_data ?? []).length
      ? (a.summary?.top_missing_data ?? []).map((x: string) => `- ${x}`).join("\n")
      : `- (EL: Κανένα. | EN: None.)`
  );

  md.push(``);
  md.push(`## Pillar breakdown / Ανάλυση ανά πυλώνα`);
  md.push(`Each item includes confidence + missing data + next actions. / Περιλαμβάνει βεβαιότητα + τι λείπει + επόμενα βήματα.`);

  for (const p of framework.pillars) {
    const elName = elPillarName(p.id, p.name);

    md.push(``);
    md.push(`### ${p.name} (${p.weight_points} pts)`);
    md.push(`### ${elName} (${p.weight_points} μονάδες)`);
    md.push(`${p.description}`);

    const rows = byPillar[p.id] || [];
    if (!rows.length) {
      md.push(`- (EL: Δεν επιστράφηκαν εφαρμόσιμοι δείκτες. | EN: No applicable indicators returned.)`);
      continue;
    }

    for (const { ia, ind } of rows) {
      md.push(``);
      md.push(`**${ind.id} — ${ind.name}** (${ind.weight_points} pts)`);
      md.push(`- Definition / Ορισμός: ${ind.definition}`);
      md.push(`- Confidence / Βεβαιότητα: **${ia.confidence}**`);
      md.push(
        `- Missing data / Τι λείπει:\n` +
          ((ia.missing_data ?? []).length
            ? (ia.missing_data ?? []).map((x: string) => `  - ${x}`).join("\n")
            : `  - (EL: Τίποτα. | EN: None.)`)
      );
      md.push(
        `- Next actions / Επόμενα βήματα:\n` +
          ((ia.recommended_next_actions ?? []).length
            ? (ia.recommended_next_actions ?? []).map((x: string) => `  - ${x}`).join("\n")
            : `  - (EL: Κανένα. | EN: None.)`)
      );
      if (ia.notes) md.push(`- Notes / Σημειώσεις: ${ia.notes}`);
    }
  }

  md.push(``);
  md.push(`## Method notes / Μεθοδολογικές σημειώσεις`);
  md.push(`- Missing data rule: ${framework.rules.missing_data_rule}`);
  md.push(`- Confidence flags: green=audit, amber=submitted, grey=estimated/missing.`);
  md.push(`- Το score 0–100 θα ενεργοποιηθεί στο επόμενο βήμα με deterministic κανόνες (όχι “γνώμη” του AI).`);

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

    // model που υποστηρίζει structured outputs καλά
    const model = "gpt-4o-mini";

    const response = await client.responses.parse({
      model,
      max_output_tokens: 1100,
      instructions:
        "You are Axiprova, a cultural impact measurement consultant. " +
        "You MUST use the provided indicator library. " +
        "Return ALL user-facing strings as bilingual in one string: 'EL: ... | EN: ...'. " +
        "For each indicator: decide if applicable, set score_0_to_1=null unless strong evidence exists in input, " +
        "set confidence to grey/amber/green, list missing data, and give next actions. " +
        "Keep outputs short, practical, and do not invent numbers. " +
        "Return JSON that matches the schema exactly.",
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
      return NextResponse.json(
        { error: "impact-outline failed", details: "No structured output returned." },
        { status: 502 }
      );
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
