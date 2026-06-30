import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — Analyze Link ("Καταγραφή νέου συμβάντος" από URL)
//
// (Β) ΠΡΟΣΩΠΙΚΟ ΓΕΓΟΝΟΣ — δεν αγγίζει τον κορμό (detection/scoring
// του Χάρτη ατζέντας). Παίρνει ΕΝΑ link άρθρου, το διαβάζει, και με AI
// φτιάχνει ένα "προσωρινό γεγονός" με ΤΑ ΙΔΙΑ πεδία που περιμένει η
// μηχανή ανάλυσης (strategic-image + strategic-play). Η σελίδα μετά
// καλεί τα ίδια routes → ίδια ανάλυση, ίδιο layout.
// ============================================================

const MODEL = "claude-sonnet-4-6";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

// Καθάρισμα HTML → απλό κείμενο (χωρίς scripts/styles/tags).
function htmlToText(html: string): { title: string; text: string } {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = titleMatch[1].replace(/\s+/g, " ").trim();

  // og:title είναι συχνά καθαρότερος
  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch && ogMatch[1].trim()) title = ogMatch[1].replace(/\s+/g, " ").trim();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function fetchArticle(url: string): Promise<{ title: string; text: string; source: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const html = await resp.text();
    const { title, text } = htmlToText(html);
    if (text.length < 120) return null; // πολύ λίγο για ανάλυση
    return { title, text: text.slice(0, 6000), source: hostnameOf(url) };
  } catch {
    return null;
  }
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => { try { return JSON.parse(str); } catch { return null; } };
  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  return parsed || null;
}

async function callClaude(prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API error " + resp.status);
  const data = await resp.json();
  return (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

function cleanStr(v: unknown, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length ? t : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = cleanStr(body?.url, "");
    const partyName = cleanStr(body?.party_name, "ΕΛΑΣ");
    const partyKey = cleanStr(body?.party_key, "elas");

    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ ok: false, error: "missing_or_invalid_url" }, 400);
    }

    const article = await fetchArticle(url);
    if (!article) {
      return json({ ok: false, error: "could_not_read_article" }, 200);
    }

    const prompt = `Είσαι αναλυτής πολιτικής ατζέντας. Διάβασε το παρακάτω άρθρο και βγάλε δομημένα στοιχεία, ώστε να αναλυθεί σαν πολιτικό γεγονός για το κόμμα "${partyName}".

ΤΙΤΛΟΣ ΑΡΘΡΟΥ: ${article.title || "—"}
ΠΗΓΗ: ${article.source}

ΚΕΙΜΕΝΟ (απόσπασμα):
${article.text.slice(0, 4500)}

ΖΗΤΟΥΜΕΝΟ — βγάλε:
- event_title: σύντομος, καθαρός τίτλος του ΓΕΓΟΝΟΤΟΣ (όχι ο τίτλος του άρθρου αυτούσιος — η ΟΥΣΙΑ του τι συμβαίνει), στα ελληνικά, < 14 λέξεις.
- theme: το κεντρικό ΘΕΜΑ/κατηγορία (π.χ. Οικονομία, Στέγαση, Υγεία, Ασφάλεια, Παιδεία, Εξωτερική πολιτική, Δικαιοσύνη, Ενέργεια, Εργασία — ή άλλο αν ταιριάζει).
- summary: 1-2 προτάσεις τι ακριβώς συμβαίνει στο γεγονός (ουδέτερα, factual).

ΕΠΕΣΤΡΕΨΕ ΜΟΝΟ έγκυρο JSON, χωρίς markdown:
{ "event_title": "...", "theme": "...", "summary": "..." }`;

    let aiData: any = null;
    try {
      const raw = await callClaude(prompt);
      aiData = parseAiJson(raw);
    } catch {
      aiData = null;
    }

    const eventTitle = cleanStr(aiData?.event_title, article.title || "Νέο συμβάν");
    const theme = cleanStr(aiData?.theme, "Πολιτική ατζέντα");
    const summary = cleanStr(aiData?.summary, "");

    // Σταθερό id για το προσωπικό γεγονός (ώστε το cache να δουλεύει σωστά).
    const microAgendaId =
      "personal_" +
      Buffer.from(url).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);

    // Το "προσωπικό γεγονός": ΑΚΡΙΒΩΣ τα πεδία που θέλει το strategic-play / strategic-image.
    const personalEvent = {
      micro_agenda_id: microAgendaId,
      micro_agenda: eventTitle,
      theme,
      active_event_id: microAgendaId,
      active_event_title: eventTitle,
      active_event_summary: summary,
      event_titles: [eventTitle],
      article_titles: [article.title || eventTitle],
      sources: article.source ? [article.source] : [],
      source_url: url,
      score: 60, // ουδέτερο σκορ — δεν περνά από το scoring του Χάρτη
      real_news_coverage_score: null,
      real_trend_score: null,
    };

    return json({ ok: true, event: personalEvent });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
