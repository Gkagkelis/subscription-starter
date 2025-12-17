import { NextResponse } from "next/server";

function detectLang(text: string): "el" | "en" {
  return /[\u0370-\u03FF\u1F00-\u1FFF]/.test(text) ? "el" : "en";
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callOpenAIJSON(system: string, user: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in Vercel env vars");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI error (${res.status}): ${JSON.stringify(data)}`);
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  const obj = extractJson(content);
  if (!obj) throw new Error(`Could not parse JSON from model output: ${content}`);
  return obj;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      raw_description,
      field,
      format,
      audience = [],
      contexts = [],
      tone = "neutral",
      intention = [],
      impact_signals = [],
      accessibility_notes = "",
      evidence = "",
    } = body as {
      raw_description: string;
      field?: string;
      format?: string;
      audience?: string[];
      contexts?: string[];
      tone?: string;
      intention?: string[];
      impact_signals?: string[];
      accessibility_notes?: string;
      evidence?: string;
    };

    if (!raw_description || typeof raw_description !== "string") {
      return NextResponse.json({ error: "Missing raw_description" }, { status: 400 });
    }

    const lang = detectLang(raw_description);
    const langName = lang === "el" ? "Greek" : "English";

    const system = `You are Axiprova — a warm, modern co-pilot for creatives.
RESPOND ONLY IN ${langName}. Never mix languages.
Be friendly, human, and practical (not robotic). Write like a great collaborator.

Return STRICT JSON only (no markdown fences).
Schema:
{
  "title": "short title",
  "dna": "Project DNA text",
  "derivatives": [
    {"format":"Social Post","content":"..."},
    {"format":"Website Blurb","content":"..."},
    {"format":"Email Pitch","content":"..."}
  ]
}`;

    const user = `Create a strong "Project DNA" from the inputs below. It must feel like a real human wrote it.
It should be usable as the single source of truth to generate other formats.

INPUTS
Raw description:
${raw_description}

Field: ${field || ""}
Format: ${format || ""}
Audience: ${Array.isArray(audience) ? audience.join(", ") : ""}
Contexts: ${Array.isArray(contexts) ? contexts.join(", ") : ""}
Intention: ${Array.isArray(intention) ? intention.join(", ") : ""}
Tone: ${tone}
Impact signals: ${Array.isArray(impact_signals) ? impact_signals.join(", ") : ""}
Accessibility notes: ${accessibility_notes || ""}
Evidence/links/notes:
${evidence || ""}

OUTPUT RULES
- "dna" should be ~160–260 words (or 120–220 if Greek) and not corporate.
- Include 1–2 vivid specifics (without inventing fake facts).
- Include impact + accessibility if provided (as normal human sentences).
- Make it feel confident, not inflated.

Also produce 3 "wow" derivatives:
1) Social Post (hook + 3–6 lines + optional hashtags)
2) Website Blurb (60–120 words)
3) Email Pitch (subject + short email)

Return JSON only.`;

    const out = await callOpenAIJSON(system, user);

    if (typeof out?.dna !== "string") {
      return NextResponse.json({ error: "Invalid model output: missing dna" }, { status: 500 });
    }

    const title = typeof out?.title === "string" ? out.title : "Project";
    const derivatives = Array.isArray(out?.derivatives) ? out.derivatives : [];

    return NextResponse.json({ title, dna: out.dna, derivatives });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
