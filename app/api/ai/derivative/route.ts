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
    const { dna, format, tone = "neutral" } = body as { dna: string; format: string; tone?: string };

    if (!dna || !format) {
      return NextResponse.json({ error: "Missing dna or format" }, { status: 400 });
    }

    const lang = detectLang(dna);
    const langName = lang === "el" ? "Greek" : "English";

    const system = `You are Axiprova — a warm, modern writing co-pilot for creatives.
RESPOND ONLY IN ${langName}. Never mix languages.
Be friendly, specific, and ready-to-use (not robotic).
Return STRICT JSON only: {"content":"..."} (no markdown fences).`;

    const user = `Repurpose the following Project DNA into the requested format.

FORMAT: ${format}
TONE: ${tone}

Project DNA:
${dna}

Format rules:
- Social Post: 1 hook + 3–6 lines + optional hashtags
- Website Blurb: 60–120 words
- Email Pitch: Subject + short email
- Application Version: more formal + include impact/accessibility if present
- Press Snippet: 40–80 words
- Short Bio: 40–90 words (first person if possible)

Return JSON only.`;

    const out = await callOpenAIJSON(system, user);

    if (typeof out?.content !== "string") {
      return NextResponse.json({ error: "Invalid model output" }, { status: 500 });
    }

    return NextResponse.json({ content: out.content });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
