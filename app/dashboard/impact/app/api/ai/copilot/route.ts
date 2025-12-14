import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const InputSchema = z.object({
  org_id: z.string().min(8).optional(), // demo αν λείπει
  mode: z.enum(["plan", "insights", "content", "funding"]).default("plan"),
  language: z.enum(["auto", "el", "en"]).default("auto"),
  message: z.string().min(1),
});

const OutputSchema = z.object({
  assistant_message: z.string(),
  followup_questions: z.array(z.string()),
  suggested_actions: z.array(
    z.object({
      label: z.string(),
      payload: z.string(),
      kind: z.enum(["ask", "draft", "analyze", "plan"]),
    })
  ),
  evidence_used: z.array(z.string()),
  meta: z.object({
    language: z.enum(["el", "en"]),
    mode: z.enum(["plan", "insights", "content", "funding"]),
  }),
});

function detectLanguage(requested: "auto" | "el" | "en", message: string): "el" | "en" {
  if (requested !== "auto") return requested;
  // αν έχει ελληνικούς χαρακτήρες -> el
  if (/[α-ωάέήίόύώϊϋΐΰ]/i.test(message)) return "el";
  return "en";
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function loadOrgContext(org_id?: string) {
  if (!org_id) {
    return {
      org: { org_name: "Demo org", default_language: "auto", brand_voice: {} },
      snippets: [],
    };
  }

  const sb = supabaseAdmin();

  const orgRes = await sb
    .from("org_profiles")
    .select("org_id, org_name, default_language, brand_voice")
    .eq("org_id", org_id)
    .maybeSingle();

  const org = orgRes.data || { org_name: "Unknown org", default_language: "auto", brand_voice: {} };

  const snipRes = await sb
    .from("org_snippets")
    .select("kind, source, title, content, rating, created_at")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false })
    .limit(24);

  return {
    org,
    snippets: snipRes.data || [],
  };
}

function formatContextForModel(org: any, snippets: any[], lang: "el" | "en") {
  const header =
    lang === "el"
      ? `Οργανισμός: ${org.org_name}\nBrand voice: ${JSON.stringify(org.brand_voice || {}, null, 2)}`
      : `Org: ${org.org_name}\nBrand voice: ${JSON.stringify(org.brand_voice || {}, null, 2)}`;

  const compact = (snippets || []).map((s, i) => {
    const bits = [
      `#${i + 1}`,
      `kind=${s.kind}`,
      s.source ? `source=${s.source}` : null,
      s.rating != null ? `rating=${s.rating}` : null,
      s.title ? `title=${s.title}` : null,
      `content=${(s.content || "").slice(0, 500)}`,
    ].filter(Boolean);
    return bits.join(" | ");
  });

  return `${header}\n\nSNIPPETS (most recent first):\n${compact.join("\n")}`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    const lang = detectLanguage(input.language, input.message);
    const { org, snippets } = await loadOrgContext(input.org_id);

    const contextText = formatContextForModel(org, snippets, lang);

    const system =
      lang === "el"
        ? `Είσαι το Axiprova Copilot: φιλικός αλλά επαγγελματικός σύμβουλος για πολιτιστικούς οργανισμούς.
Στόχος: να βοηθάς σε καθημερινό σχεδιασμό, insights, συν-γραφή, και (δευτερευόντως) funding.
Κανόνες:
- Μίλα ΜΟΝΟ ελληνικά.
- Μην δίνεις θεωρία. Δίνε προτάσεις με επόμενα βήματα.
- Χρησιμοποίησε ΤΑ ΔΕΔΟΜΕΝΑ που δίνονται στο context (snippets). Αν δεν υπάρχουν, πες "δεν έχω αρκετά δεδομένα ακόμη" και ζήτησε 2-3 πράγματα.
- Πάντα να δίνεις: (1) σύντομη απάντηση, (2) 2-4 actionable suggestions, (3) 1-3 έξυπνες ερωτήσεις, (4) 3 κουμπιά actions.`
        : `You are Axiprova Copilot: a friendly but professional consultant for cultural organizations.
Rules:
- English only.
- No generic theory; give concrete next steps.
- Use the provided context/snippets; if insufficient, say so and ask for 2-3 specific inputs.
- Always return: short answer, 2-4 actionable suggestions, 1-3 smart follow-up questions, and 3 action buttons.`;

    const modeHint =
      lang === "el"
        ? {
            plan: "Mode=PLAN: Ιδέες/σενάρια/what-if για project design.",
            insights: "Mode=INSIGHTS: Βρες κρυφά μοτίβα/alerts από snippets (reviews, trends, competitor).",
            content: "Mode=CONTENT: Γράψε/μετέτρεψε κείμενα σε IG/press/email. Δώσε 3 εκδοχές.",
            funding: "Mode=FUNDING: Μετέτρεψε έργο/impact σε bullets για αίτηση, KPIs, outputs.",
          }[input.mode]
        : {
            plan: "Mode=PLAN: ideas/scenarios/what-if for project design.",
            insights: "Mode=INSIGHTS: detect patterns/alerts from snippets (reviews, trends, competitor).",
            content: "Mode=CONTENT: co-write IG/press/email. Provide 3 variants.",
            funding: "Mode=FUNDING: translate work/impact into grant-ready bullets, KPIs, outputs.",
          }[input.mode];

    const response = await client.responses.parse({
      model: "gpt-4o-mini",
      max_output_tokens: 900,
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            `${modeHint}\n\n` +
            `USER MESSAGE:\n${input.message}\n\n` +
            `CONTEXT:\n${contextText}\n\n` +
            `Return structured JSON exactly matching the schema.`,
        },
      ],
      text: { format: zodTextFormat(OutputSchema, "copilot_response") },
    });

    const parsed = (response as any).output_parsed;
    if (!parsed) {
      return NextResponse.json(
        { error: "copilot failed", details: "No structured output returned." },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: "copilot failed", details: err?.message ?? String(err) },
      { status: 400 }
    );
  }
}
