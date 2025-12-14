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
  meta: z
    .object({
      language: z.enum(["auto", "el", "en"]).default("auto"),
    })
    .optional(),
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

// Structured Outputs: όλα required -> nullable όπου χρειάζεται
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
      top_next_actions: z.array(z.string()),
    }),
  }),
});

function detectLanguage(metaLang: "auto" | "el" | "en" | undefined, req: Request) {
  if (metaLang && metaLang !== "auto") return metaLang;
  const al = (req.headers.get("accept-language") || "").toLowerCase();
  if (al.startsWith("el") || al.includes("el")) return "el";
  return "en";
}

function t(lang: "el" | "en") {
  const dict = {
    el: {
      title: "Axiprova — Αναφορά Impact (Framework)",
      subtitle: "Σύμβουλος αξιολόγησης impact για πολιτισμό & δημιουργικές βιομηχανίες",
      projectBrief: "Σύνοψη έργου",
      whatMeasures: "Τι μετρά το Axiprova",
      exec: "Γρήγορη διάγνωση",
      strengths: "Δυνατά σημεία",
      risks: "Κύρια ρίσκα",
      missing: "Τι λείπει (δεδομένα/τεκμήρια)",
      next: "Επόμενα βήματα (πρακτικά)",
      notes: "Σημειώσεις μεθοδολογίας",
      langLine: "Γλώσσα αναφοράς",
      confLegend:
        "Βεβαιότητα: green=έχει τεκμήρια, amber=μερικά τεκμήρια, grey=λείπουν τεκμήρια/υπόθεση",
    },
    en: {
      title: "Axiprova — Impact Report (Framework)",
      subtitle: "Impact evaluation consultant for culture & creative industries",
      projectBrief: "Project brief",
      whatMeasures: "What Axiprova measures",
      exec: "Quick diagnosis",
      strengths: "Strengths",
      risks: "Key risks",
      missing: "Top missing evidence/data",
      next: "Next steps (practical)",
      notes: "Method notes",
      langLine: "Report language",
      confLegend:
        "Confidence: green=evidence present, amber=partial evidence, grey=missing/assumed",
    },
  };
  return dict[lang];
}

// Σύντομο report (ΟΧΙ σεντόνι). Το checklist θα το δείχνει το UI ξεχωριστά.
function buildShortReportMarkdown(input: any, framework: any, assessment: any, lang: "el" | "en") {
  const L = t(lang);
  const p = input.project || {};
  const e = input.evidence || {};
  const s = assessment?.summary || {};

  const md: string[] = [];
  md.push(`# ${L.title}`);
  md.push(`_${L.subtitle}_`);
  md.push(``);
  md.push(`**${L.langLine}:** ${lang === "el" ? "Ελληνικά" : "English"}`);
  md.push(``);

  md.push(`## ${L.projectBrief}`);
  md.push(`- **${lang === "el" ? "Τίτλος" : "Title"}:** ${p.title ?? "—"}`);
  md.push(`- **${lang === "el" ? "Τύπος" : "Type"}:** ${p.type ?? "—"}`);
  md.push(`- **${lang === "el" ? "Τοποθεσία" : "Location"}:** ${p.location ?? "—"}`);
  md.push(`- **${lang === "el" ? "Διάρκεια (ημέρες)" : "Duration (days)"}:** ${p.duration_days ?? "—"}`);
  md.push(``);

  md.push(`## ${L.whatMeasures}`);
  md.push(
    lang === "el"
      ? `Χρησιμοποιούμε σταθερό framework με πυλώνες & δείκτες. Δεν “μαντεύουμε” νούμερα: αν λείπουν τεκμήρια, το λέμε καθαρά και σου δίνουμε checklist για το τι να μαζέψεις.`
      : `We use a fixed framework (pillars & indicators). We do not invent numbers: if evidence is missing, we flag it and give you a clear checklist of what to collect.`
  );
  md.push(``);
  md.push(`## ${L.exec}`);

  md.push(`**${L.strengths}:**`);
  md.push((s.what_is_strong?.length ? s.what_is_strong : [lang === "el" ? "Δεν υπάρχουν ακόμη αρκετά τεκμήρια." : "Not enough evidence yet."]).map((x: string) => `- ${x}`).join("\n"));
  md.push(``);

  md.push(`**${L.risks}:**`);
  md.push((s.what_is_risky?.length ? s.what_is_risky : [lang === "el" ? "—" : "—"]).map((x: string) => `- ${x}`).join("\n"));
  md.push(``);

  md.push(`**${L.missing}:**`);
  md.push((s.top_missing_data?.length ? s.top_missing_data : [lang === "el" ? "—" : "—"]).map((x: string) => `- ${x}`).join("\n"));
  md.push(``);

  md.push(`**${L.next}:**`);
  md.push((s.top_next_actions?.length ? s.top_next_actions : [lang === "el" ? "—" : "—"]).map((x: string) => `- ${x}`).join("\n"));
  md.push(``);

  // evidence snapshot
  md.push(`---`);
  md.push(`**${lang === "el" ? "Τεκμήρια που δηλώθηκαν" : "Declared evidence"}:**`);
  md.push(`- ${lang === "el" ? "Public sources" : "Public sources"}: ${(e.public_sources || []).length}`);
  md.push(`- ${lang === "el" ? "Internal evidence" : "Internal evidence"}: ${(e.internal_sources || []).length}`);
  if (e.notes) md.push(`- ${lang === "el" ? "Σημειώσεις" : "Notes"}: ${e.notes}`);
  md.push(``);
  md.push(`## ${L.notes}`);
  md.push(`- ${L.confLegend}`);
  md.push(`- ${framework.rules.missing_data_rule}`);

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
    const lang = detectLanguage(input.meta?.language, req);

    const model = "gpt-4o-mini";

    const response = await client.responses.parse({
      model,
      max_output_tokens: 1200,
      instructions:
        (lang === "el"
          ? "Είσαι η Axiprova: φιλικός/ή αλλά επαγγελματικός/ή σύμβουλος impact για πολιτισμό. Γράψε καθαρά, πρακτικά, ενδυναμωτικά. Μην εφευρίσκεις νούμερα."
          : "You are Axiprova: a friendly but professional impact consultant for culture. Be clear, practical, empowering. Do not invent numbers.") +
        " Use the provided indicator library. Return ALL text in ONE language only (no bilingual). " +
        "For each indicator: applicable, score_0_to_1=null unless evidence is explicit, confidence grey/amber/green, missing_data, recommended_next_actions, short notes. " +
        "Also return summary fields (strengths/risks/missing/next). Output must match schema exactly.",
      input:
        "PROJECT INPUT:\n" +
        JSON.stringify(input, null, 2) +
        "\n\nINDICATOR LIBRARY:\n" +
        JSON.stringify(framework, null, 2),
      text: { format: zodTextFormat(OutputSchema, "impact_outline") },
    });

    const parsed = (response as any).output_parsed;
    if (!parsed) {
      return NextResponse.json({ error: "impact-outline failed", details: "No structured output returned." }, { status: 502 });
    }

    const report_markdown = buildShortReportMarkdown(input, framework, parsed.assessment, lang);

    return NextResponse.json({
      version: framework.version,
      framework,
      report_markdown,
      data: parsed.assessment, // checklist data (θα το δείχνει το UI ξεχωριστά)
    });
  } catch (err: any) {
    return NextResponse.json({ error: "impact-outline failed", details: err?.message ?? String(err) }, { status: 400 });
  }
}
