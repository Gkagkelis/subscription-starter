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
      temperature: 0.85, // Slightly more creative
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

function getFormatInstructions(format: string, lang: "el" | "en") {
  const isGreek = lang === "el";

  switch (format) {
    case "Social Post":
      return isGreek
        ? `SOCIAL POST (Instagram/Facebook):
- 1 hook που τραβάει την προσοχή (emoji optional)
- 3-6 γραμμές που εξηγούν το project με φυσικό τρόπο
- Κλείσιμο με call-to-action ή ερώτηση
- 3-5 hashtags στο τέλος (όχι spam)
- Tone: φιλικό, approachable, σαν να μιλάς σε φίλο
- Max 150 λέξεις`
        : `SOCIAL POST (Instagram/Facebook):
- 1 attention-grabbing hook (optional emoji)
- 3-6 lines explaining the project naturally
- End with call-to-action or question
- 3-5 hashtags at the end (no spam)
- Tone: friendly, approachable, like talking to a friend
- Max 150 words`;

    case "Website Blurb":
      return isGreek
        ? `WEBSITE BLURB:
- Intro που εξηγεί το "τι" και "γιατί" του project
- 2-3 παράγραφοι με flow
- Include: τι κάνει το project ξεχωριστό, για ποιο κοινό, impact
- Tone: professional αλλά human (όχι corporate)
- 80-150 λέξεις`
        : `WEBSITE BLURB:
- Intro explaining "what" and "why" of the project
- 2-3 paragraphs with flow
- Include: what makes it unique, target audience, impact
- Tone: professional but human (not corporate)
- 80-150 words`;

    case "Email Pitch":
      return isGreek
        ? `EMAIL PITCH:
- Subject line που ανοίγει (10-50 χαρακτήρες)
- Σώμα email:
  * Warm intro (1-2 γραμμές)
  * Γιατί επικοινωνείς (το project σε 3-4 γραμμές)
  * Τι ζητάς/προτείνεις (σαφές ask)
  * Friendly closing
- Tone: warm, respectful, specific
- Total 100-200 λέξεις`
        : `EMAIL PITCH:
- Subject line that opens (10-50 chars)
- Email body:
  * Warm intro (1-2 lines)
  * Why you're reaching out (project in 3-4 lines)
  * What you're asking/proposing (clear ask)
  * Friendly closing
- Tone: warm, respectful, specific
- Total 100-200 words`;

    case "Application Version":
      return isGreek
        ? `APPLICATION VERSION (για grants/calls):
- Πιο επίσημο και structured
- Include:
  * Στόχος του project (clear statement)
  * Μεθοδολογία / δράσεις
  * Αναμενόμενο impact / outcomes
  * Κοινό / beneficiaries
  * Accessibility / inclusion (αν relevant)
- Tone: professional, evidence-based, αλλά readable
- 150-250 λέξεις`
        : `APPLICATION VERSION (for grants/calls):
- More formal and structured
- Include:
  * Project objective (clear statement)
  * Methodology / activities
  * Expected impact / outcomes
  * Target audience / beneficiaries
  * Accessibility / inclusion (if relevant)
- Tone: professional, evidence-based, but readable
- 150-250 words`;

    case "Press Snippet":
      return isGreek
        ? `PRESS SNIPPET (για δελτίο τύπου):
- Newsworthy angle πρώτα
- Who, what, when, where, why σε 40-80 λέξεις
- Ένα quote-ready statement (optional)
- Tone: journalistic, factual, με hook
- Παίξε με: dates, numbers, unique aspects`
        : `PRESS SNIPPET (for press release):
- Newsworthy angle first
- Who, what, when, where, why in 40-80 words
- One quote-ready statement (optional)
- Tone: journalistic, factual, with hook
- Play with: dates, numbers, unique aspects`;

    case "Short Bio":
      return isGreek
        ? `SHORT BIO:
- 40-90 λέξεις
- Ποιος είσαι / τι κάνεις (πρώτο πρόσωπο αν είναι artist/solo)
- Key projects / achievements (1-2)
- Current focus / vision
- Tone: personal, authentic, confident
- Avoid clichés ("passionate about", "innovative")`
        : `SHORT BIO:
- 40-90 words
- Who you are / what you do (first person if artist/solo)
- Key projects / achievements (1-2)
- Current focus / vision
- Tone: personal, authentic, confident
- Avoid clichés ("passionate about", "innovative")`;

    default:
      return isGreek
        ? `GENERAL FORMAT:
- Διάβασε το DNA
- Κάνε repurpose στο format που ζητάει ο χρήστης
- Κράτα την ουσία, άλλαξε το packaging`
        : `GENERAL FORMAT:
- Read the DNA
- Repurpose to the requested format
- Keep the essence, change the packaging`;
  }
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

    const formatInstructions = getFormatInstructions(format, lang);

    const system = `You are Axiprova — a creative writing co-pilot for cultural & creative industries.

CRITICAL: RESPOND ONLY IN ${langName}. Never mix languages.

YOUR PERSONALITY:
- Warm, human, never robotic
- You're helping a friend craft their message
- You understand creative work and cultural projects
- You write with clarity and personality

TONE GUIDANCE (tone setting: ${tone}):
- neutral: Professional but human, approachable
- formal: More structured, grant-ready, evidence-based
- casual: Friendly, conversational, relaxed
- inspiring: Uplifting, visionary, motivational

OUTPUT RULE:
- Return STRICT JSON only: {"content":"..."}
- NO markdown fences, NO explanation text, ONLY the JSON object
- Make the content READY TO USE (no placeholders like [Your Name])`;

    const user = `Transform the following Project DNA into the requested format.

FORMAT: ${format}
TONE: ${tone}

${formatInstructions}

IMPORTANT:
- Use specific details from the DNA
- Make it sound natural and human
- If the DNA mentions specific dates/places/people, use them
- Avoid generic phrases like "innovative", "cutting-edge", "passionate"
- Write like a real person, not an AI

Project DNA:
---
${dna}
---

Return JSON only: {"content":"your output here"}`;

    const out = await callOpenAIJSON(system, user);

    if (typeof out?.content !== "string") {
      return NextResponse.json({ error: "Invalid model output" }, { status: 500 });
    }

    return NextResponse.json({ content: out.content });
  } catch (e: any) {
    console.error("Derivative generation error:", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
