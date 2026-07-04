import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — DEMO endpoint (ΑΣΥΝΔΕΤΟ) · ΥΠΟΨΗΦΙΟΣ ΒΟΥΛΕΥΤΗΣ ΠΑΣΟΚ, Β' Θεσσαλονικης
// Πραγματικες κλησεις Claude + ΠΡΑΓΜΑΤΙΚΑ τοπικα (Google News RSS).
// Δεν πειραζει τιποτα απο την υπολοιπη app.
// ============================================================

const MODEL = "claude-sonnet-4-6";

const CANDIDATE = `ΤΑΥΤΟΤΗΤΑ ΧΡΗΣΤΗ (DEMO):
- Ρολος: ΥΠΟΨΗΦΙΟΣ/Α ΒΟΥΛΕΥΤΗΣ (ΔΕΝ εχει εδρα — δεν ειναι εν ενεργεια βουλευτης).
- Κομμα: ΠΑΣΟΚ – Κινημα Αλλαγης (σοσιαλδημοκρατια, φιλοευρωπαικη, θεσμικη).
- Εκλογικη περιφερεια: Β' Θεσσαλονικης (πολυεδρικη — εντονη ΣΤΑΥΡΟΔΟΣΙΑ· ανταγωνισμος ΚΑΙ με συνυποψηφιους του ΙΔΙΟΥ κομματος).
- Στοχος: να κερδισει ΣΤΑΥΡΟΥΣ και εδρα — αναγνωρισιμοτητα, τοπικη παρουσια, διαφοροποιηση.

ΓΡΑΜΜΗ ΠΑΣΟΚ ΑΝΑ ΘΕΜΑ:
- Ακριβεια: στοχευμενη στηριξη + ελεγχος αγορας, με ρεαλισμο.
- Στεγαση/νεοι: κοινωνικη κατοικια, στηριξη φοιτητων & νεων.
- Υγεια/παιδεια: ενισχυση δημοσιου ΕΣΥ & παιδειας.
- Εργασια: αξιοπρεπης εργασια, κοινωνικος διαλογος.
- Θεσμοι/διαφθορα: διαφανεια & λογοδοσια (Τεμπη, υποκλοπες).
- Μεταναστευση: ευρωπαικη, ελεγχομενη αλλα ανθρωπιστικη.
- Τονος: θεσμικος, σοβαρος, αξιοπιστος — «σοβαρη εναλλακτικη».

ΚΑΝΟΝΕΣ (ΚΡΙΣΙΜΟ):
- ΕΠΙΤΡΕΠΟΝΤΑΙ ΜΟΝΟ κινησεις υποψηφιου/καμπανιας: περιοδειες & πορτα-πορτα στη Β' Θεσσαλονικης, τοπικα ΜΜΕ, social/reels, εκδηλωσεις, τοπικα ζητηματα, προσωπικο αφηγημα, διαφοροποιηση απο συνυποψηφιους.
- ΑΠΑΓΟΡΕΥΟΝΤΑΙ ΑΥΣΤΗΡΑ κοινοβουλευτικες ενεργειες (ερωτησεις/επερωτησεις/τροπολογιες/καταθεση στη Βουλη) — ΔΕΝ ειναι βουλευτης.
- ΟΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟΥ: αποτυπωσε τη γραμμη/υφος, αλλα ΜΗΝ παραγεις ρατσιστικο/μισαλλοδοξο/υβριστικο περιεχομενο.
- Παντα ΤΟΠΙΚΑ & ΣΥΓΚΕΚΡΙΜΕΝΑ για τη Β' Θεσσαλονικης.`;

// Τοπικες αναζητησεις (Θεσσαλονικη + θεμα)
const LOCAL_QUERIES: [string, string][] = [
  ["Ακριβεια / κοστος ζωης", "Θεσσαλονικη ακριβεια τιμες"],
  ["Στεγαση & νεοι", "Θεσσαλονικη στεγαση φοιτητες ενοικια"],
  ["Μεταφορες / Μετρο", "Θεσσαλονικη μετρο μεταφορες κυκλοφοριακο"],
  ["Ασφαλεια", "Θεσσαλονικη εγκληματικοτητα ασφαλεια"],
  ["Υγεια", "Θεσσαλονικη νοσοκομειο υγεια"],
  ["Πανεπιστημιο / ΑΠΘ", "Θεσσαλονικη ΑΠΘ πανεπιστημιο φοιτητες"],
];

function json(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function googleNews(q: string): Promise<string[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=el&gl=GR&ceid=GR:el`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = xml.split("<item>").slice(1, 7);
    const titles: string[] = [];
    for (const it of items) {
      const m = it.match(/<title>([\s\S]*?)<\/title>/);
      if (m) {
        let t = decode(m[1]);
        // Google News: "Τιτλος - Πηγη" -> κρατα τον τιτλο
        const dash = t.lastIndexOf(" - ");
        if (dash > 20) t = t.slice(0, dash);
        if (t) titles.push(t);
      }
    }
    return titles;
  } catch {
    return [];
  }
}

async function fetchLocal() {
  const results = await Promise.all(
    LOCAL_QUERIES.map(async ([label, q]) => {
      const headlines = await googleNews(q);
      return { label, count: headlines.length, headlines: headlines.slice(0, 3) };
    })
  );
  results.sort((a, b) => b.count - a.count);
  return results;
}

async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API " + resp.status);
  const data = await resp.json();
  return (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

function parseJsonLoose(raw: string): any | null {
  const s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

function localToText(local: any[]): string {
  if (!Array.isArray(local) || !local.length) return "";
  return local
    .map((l: any) => `${l.label}: ${(l.headlines || []).join(" | ")}`)
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "daily");
    const themes: string[] = Array.isArray(body?.themes) ? body.themes.slice(0, 8) : [];
    const themesText = themes.length ? themes.join(" · ") : "—";
    const localText = localToText(body?.local);

    if (mode === "local") {
      const local = await fetchLocal();
      return json({ ok: true, local });
    }

    if (mode === "chat") {
      const question = String(body?.question || "").slice(0, 2000);
      if (!question) return json({ ok: false, error: "no_question" }, 400);
      const history: { role: string; content: string }[] = Array.isArray(body?.history)
        ? body.history.slice(-6)
        : [];
      const histText = history
        .map((h) => (h.role === "user" ? "Χρηστης: " : "Noraya: ") + String(h.content || "").slice(0, 600))
        .join("\n");
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${CANDIDATE}\n\nΣημερα «καινε»: ${themesText}.${localText ? "\n\nΤΟΠΙΚΑ ΠΡΩΤΟΣΕΛΙΔΑ (Θεσσαλονικη):\n" + localText : ""}`;
      const user = `${histText ? "Ιστορικο:\n" + histText + "\n\n" : ""}Ερωτηση υποψηφιου: ${question}\n\nΑπαντησε συντομα, αποφασιστικα, με συγκεκριμενες κινησεις καμπανιας για τη Β' Θεσσαλονικης. Χωρις markdown.`;
      const text = await callClaude(system, user, 900);
      return json({ ok: true, text });
    }

    if (mode === "week") {
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${CANDIDATE}`;
      const user = `Με βαση ο,τι «καιει» σημερα (${themesText})${localText ? " και τα τοπικα:\n" + localText : ""}, δωσε ΣΧΕΔΙΟ ΕΒΔΟΜΑΔΑΣ.
Επεστρεψε ΜΟΝΟ εγκυρο JSON:
{"days":[{"day":"Δευτερα","move":"συγκεκριμενη κινηση καμπανιας στη Β' Θεσσαλονικης","why":"γιατι κερδιζει σταυρους"}, ... 5-6 μερες]}`;
      const text = await callClaude(system, user, 1500);
      let days = parseJsonLoose(text)?.days;
      if (!Array.isArray(days) || days.length === 0) {
        // Σωσε ο,τι μερες προλαβε ακομα κι αν κοπηκε το JSON
        days = [];
        const re = /"day"\s*:\s*"([^"]+)"\s*,\s*"move"\s*:\s*"([^"]+)"\s*,\s*"why"\s*:\s*"([^"]*)"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          days.push({ day: m[1], move: m[2], why: m[3] });
        }
      }
      return json({ ok: true, plan: Array.isArray(days) ? days : [] });
    }

    if (mode === "redteam") {
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${CANDIDATE}`;
      const user = `Με βαση τα τοπικα:\n${localText || "(εθνικα: " + themesText + ")"}\nΔωσε 3 ΣΥΓΚΕΚΡΙΜΕΝΕΣ επιθεσεις που θα δεχτει ο υποψηφιος στη Β' Θεσσαλονικης.
Ο 1ος επιτιθεμενος = ΣΥΝΥΠΟΨΗΦΙΟΣ ΠΑΣΟΚ (ιδια λιστα, ανταγωνισμος για σταυρους). Ο 2ος = υποψηφιος ΝΔ. Ο 3ος = υποψηφιος ΣΥΡΙΖΑ η ΕΛΑΣ.
Καθε επιθεση αυτολεξει (<20 λεξεις) και ετοιμη απαντηση στη φωνη ΠΑΣΟΚ (<20 λεξεις). Οχι μισος.
Επεστρεψε ΜΟΝΟ JSON: {"red_team":[{"attacker":"...","attack":"...","response":"...","risk_level":"high|medium|low"}, x3]}`;
      const text = await callClaude(system, user, 900);
      const parsed = parseJsonLoose(text);
      return json({ ok: true, red_team: Array.isArray(parsed?.red_team) ? parsed.red_team.slice(0, 3) : [] });
    }

    if (mode === "deliverable") {
      const topic = String(body?.topic || "").slice(0, 200);
      const kind = String(body?.kind || "statement");
      const heads = Array.isArray(body?.headlines) ? body.headlines.join(" | ") : "";
      if (!topic) return json({ ok: false, error: "no_topic" }, 400);
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας. Γραφεις στη ΦΩΝΗ του υποψηφιου.\n\n${CANDIDATE}`;
      const user =
        kind === "post"
          ? `Γραψε ενα SOCIAL POST (40-70 λεξεις) του υποψηφιου για το τοπικο θεμα «${topic}» στη Θεσσαλονικη, με βαση: ${heads || "—"}. Ζωντανο, τοπικο, στη γραμμη ΠΑΣΟΚ, με μια συγκεκριμενη θεση/λυση, και 2-3 hashtags στο τελος. Χωρις μισος, χωρις markdown (μονο τα hashtags).`
          : `Γραψε συντομη ΔΗΛΩΣΗ (60-90 λεξεις) του υποψηφιου για το τοπικο θεμα «${topic}» στη Θεσσαλονικη, με βαση: ${heads || "—"}. Στη γραμμη/υφος ΠΑΣΟΚ, τοπικα συγκεκριμενη, με μια προταση-λυση. Σοβαρος, αξιοπιστος τονος. Χωρις markdown.`;
      const text = await callClaude(system, user, 500);
      return json({ ok: true, text });
    }

    // daily — αν δεν ηρθαν τοπικα, τραβα τα εδω
    const local = localText ? null : await fetchLocal();
    const effLocal = localText || localToText(local || []);
    const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${CANDIDATE}`;
    const user = `Εθνικη ατζεντα σημερα: ${themesText}.
${effLocal ? "ΠΡΑΓΜΑΤΙΚΑ ΤΟΠΙΚΑ ΠΡΩΤΟΣΕΛΙΔΑ (Θεσσαλονικη) — χρησιμοποιησε τα:\n" + effLocal + "\n" : ""}
Γραψε τη ΣΗΜΕΡΙΝΗ ΑΝΑΓΝΩΣΗ για τον υποψηφιο ΠΑΣΟΚ στη Β' Θεσσαλονικης: ποιο ΤΟΠΙΚΟ θεμα ειναι η μεγαλυτερη ΕΥΚΑΙΡΙΑ, ποια η παγιδα, ποια η πρωτη κινηση καμπανιας. Ανεφερε συγκεκριμενα τοπικα στοιχεια. ΑΚΡΙΒΩΣ 4-5 προτασεις, πυκνα — ΟΛΟΚΛΗΡΩΣΕ τη σκεψη, μη σταματας στη μεση. Χωρις markdown.`;
    const text = await callClaude(system, user, 1100);
    return json({ ok: true, text, local: local || undefined });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
