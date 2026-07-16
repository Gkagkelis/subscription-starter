import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — DEMO: AI αφηγημα πανω στο ψυχομετρικο προφιλ
// Παιρνει τα σκορ (απο lib/noraya/psychometrics) και βγαζει:
// narrative + messageFit (ανα θεμα) + redTeam.
// ============================================================

const MODEL = "claude-sonnet-4-6";

function json(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function lvl(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 2.5) return "χαμηλο";
  if (n <= 3.5) return "μετριο";
  return "υψηλο";
}

function summarize(profile: any, issues: string[]): string {
  const bf = profile?.bigFive || {};
  const cap = bf.caprara || {};
  const tr = bf.traits || {};
  const comp = profile?.compass || {};
  const mfq = profile?.mfq || {};
  const sw = profile?.schwartz?.higher || {};
  const st = profile?.style || null;

  const econ = comp.economic;
  const soc = comp.social;
  const econSide = econ == null ? "—" : econ < -2 ? "αριστερα" : econ > 2 ? "δεξια" : "κεντρο";
  const socSide = soc == null ? "—" : soc < -2 ? "φιλελευθερος/προοδευτικος" : soc > 2 ? "συντηρητικος/αυταρχικος" : "κεντρο";
  const moral =
    (mfq.binding ?? 0) > (mfq.individualizing ?? 0)
      ? "BINDING (ταξη, κοινοτητα, πιστη, παραδοση, ιεροτητα)"
      : "INDIVIDUALIZING (φροντιδα, δικαιοσυνη, ανθρωπια)";

  const lines = [
    `ΠΡΟΣΩΠΙΚΟΤΗΤΑ-BRAND (Caprara): Ενεργεια/Καινοτομια=${cap.energyInnovation ?? "—"}/5 · Εντιμοτητα/Αξιοπιστια=${cap.honestyTrust ?? "—"}/5`,
    `Big Five: εξωστρεφεια=${lvl(tr.extraversion)} · προσηνεια=${lvl(tr.agreeableness)} · ευσυνειδησια=${lvl(tr.conscientiousness)} · συναισθ. σταθεροτητα=${lvl(tr.emotionalStability)} · δεκτικοτητα=${lvl(tr.openness)}`,
    `ΠΟΛΙΤΙΚΗ ΠΥΞΙΔΑ: Οικονομικα=${econ ?? "—"} (${econSide}) · Κοινωνικα=${soc ?? "—"} (${socSide})  [ευρος -10..+10]`,
    `ΗΘΙΚΑ ΘΕΜΕΛΙΑ: Individualizing=${mfq.individualizing ?? "—"}/6 · Binding=${mfq.binding ?? "—"}/6 → κυριαρχο ηθικο λεξιλογιο: ${moral}`,
    `ΑΞΙΕΣ (Schwartz higher-order): ανοιχτοτητα-στην-αλλαγη=${sw.opennessToChange ?? "—"} · διατηρηση=${sw.conservation ?? "—"} · αυθυπερβαση=${sw.selfTranscendence ?? "—"} · αυτο-ενισχυση=${sw.selfEnhancement ?? "—"}`,
  ];
  if (st) {
    lines.push(`ΥΦΟΣ: χαρισματικες τακτικες=${st.clt ?? "—"}/5 · πολυπλοκοτητα λογου=${st.complexity ?? "—"}/5 · λαϊκος τονος=${st.populism ?? "—"}/5`);
  }
  if (issues?.length) {
    lines.push(`ΑΤΖΕΝΤΑ ΤΑΥΤΟΤΗΤΑΣ (top): ${issues.slice(0, 6).join(" > ")}`);
  }
  return lines.join("\n");
}

async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
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
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error("Claude API " + resp.status + " " + errText.slice(0, 200));
  }
  const data = await resp.json();
  return (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

function parseJsonLoose(raw: string): any | null {
  let s = (raw || "").trim();
  // 1) αφαιρεσε markdown fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // 2) καθαρη δοκιμη
  try { return JSON.parse(s); } catch {}
  // 3) βρες το ΠΡΩΤΟ { μεχρι το ΤΕΛΕΥΤΑΙΟ } (greedy)
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    let cand = s.slice(first, last + 1);
    try { return JSON.parse(cand); } catch {}
    // 4) διορθωσε συνηθη σφαλματα: control chars, trailing commas, "smart" εισαγωγικα
    try {
      cand = cand
        .replace(/[\u0000-\u001F]+/g, " ")        // control chars μεσα σε strings
        .replace(/,\s*([}\]])/g, "$1")             // trailing commas
        .replace(/[\u201C\u201D]/g, '"')          // curly double quotes
        .replace(/[\u2018\u2019]/g, "'");         // curly single quotes
      return JSON.parse(cand);
    } catch {}
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = body?.profile;
    if (!profile) return json({ ok: false, error: "no_profile" }, 400);
    const issues: string[] = Array.isArray(body?.issues) ? body.issues : [];
    const party = String(body?.party || "").slice(0, 80);

    const summary = summarize(profile, issues);

    const system = `Εισαι ο Noraya, κορυφαιος συμβουλος πολιτικου προφιλ & στρατηγικης. Παιρνεις ΜΕΤΡΗΣΕΙΣ ενος επιστημονικου ψυχομετρικου προφιλ (Big Five, Schwartz, Moral Foundations, Political Compass, υφος) και βγαζεις πρακτικη, αιχμηρη αναλυση για πολιτικο.
ΚΑΝΟΝΑΣ: αποτυπωσε τη γραμμη & το υφος, αλλα ΜΗΝ παραγεις ρατσιστικο/μισαλλοδοξο/υβριστικο περιεχομενο. Ελληνικα, χωρις markdown μεσα στα strings.
ΠΡΟΣΩΠΟ: Μιλας ΚΑΤΕΥΘΕΙΑΝ στον πολιτικο, σε ΔΕΥΤΕΡΟ προσωπο ("εσυ"). Οχι σε τριτο προσωπο.
- narrative: γραψε "Εισαι ενας πολιτικος που...", "Το brand σου...", "Το κρυφο σου ρισκο...". ΟΧΙ "ειναι/του".
- messageFit frame/avoid: γραψε προστακτικη προς εσενα: "Να συνδεεις...", "Αποφυγε...". ΟΧΙ "να συνδεει/να αποφευγει".
- redTeam response: η ετοιμη απαντηση ειναι ΔΙΚΗ ΣΟΥ, σε πρωτο προσωπο ("Εγω...", "Αυτα υπερασπιζομαι...").`;

    const user = `${party ? "Κομμα-πλαισιο: " + party + "\n" : ""}ΠΡΟΦΙΛ (μετρησεις):
${summary}

Με βαση ΑΥΤΕΣ τις μετρησεις, επεστρεψε ΜΟΝΟ εγκυρο JSON:
{
 "narrative": "150-200 λεξεις σε ΔΕΥΤΕΡΟ προσωπο (εσυ): ποιος εισαι πολιτικα, το brand σου (πως σε βλεπει το κοινο βασει Caprara), τα δυνατα σου σημεια και το κρυφο σου ρισκο. Κλεισε με ΜΙΑ συγκεκριμενη κινηση που πρεπει να κανεις. Συγκεκριμενα, οχι γενικοτητες.",
 "messageFit": [
   {"issue":"<ενα απο τα top θεματα>", "frame":"προστακτικη προς εσενα: πως ΝΑ το πλαισιωνεις βασει του ηθικου σου λεξιλογιου (π.χ. Να συνδεεις...)", "avoid":"προστακτικη: τι να ΑΠΟΦΥΓΕΙΣ (π.χ. Αποφυγε...)"}
 ],
 "redTeam": [
   {"vulnerability":"η πιο ευαλωτη σου πλευρα", "attack":"πως θα σου επιτεθει αντιπαλος (<20 λεξεις, αυτολεξει)", "response":"η ΔΙΚΗ ΣΟΥ ετοιμη απαντηση σε πρωτο προσωπο (<25 λεξεις)"}
 ]
}

ΑΥΣΤΗΡΟΙ ΚΑΝΟΝΕΣ ΕΞΟΔΟΥ:
- Επεστρεψε ΜΟΝΟ το JSON object. ΤΙΠΟΤΑ αλλο πριν ή μετα (ουτε προλογο, ουτε code fences).
- ΑΠΑΓΟΡΕΥΟΝΤΑΙ σχολια (//) μεσα στο JSON.
- Στο messageFit βαλε 3-4 στοιχεια. Στο redTeam ΑΚΡΙΒΩΣ 3.
- ΟΛΑ τα strings σε μια γραμμη, χωρις αλλαγες γραμμης μεσα τους.`;

    const text = await callClaude(system, user, 2000);
    const parsed = parseJsonLoose(text);
    if (!parsed) return json({ ok: false, error: "parse", raw: text });
    return json({
      ok: true,
      narrative: String(parsed.narrative || ""),
      messageFit: Array.isArray(parsed.messageFit) ? parsed.messageFit.slice(0, 5) : [],
      redTeam: Array.isArray(parsed.redTeam) ? parsed.redTeam.slice(0, 3) : [],
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
