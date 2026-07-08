import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — «Επιθεσεις στον οργανισμο» ανα κομμα
// Επιθεσεις αντιπαλων κομματων + προσωπο-σε-προσωπο + ετοιμες απαντησεις.
// Διαβαζει το προφιλ του κομματος απο τη βαση (issue_lens, θεσεις, κοκκινες γραμμες).
// ============================================================

const MODEL = "claude-sonnet-4-6";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function json(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

async function callClaude(system: string, user: string, maxTokens = 2200): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error("Claude API " + resp.status);
  const data = await resp.json();
  return (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

function parseJsonLoose(raw: string): any | null {
  const s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function risk(v: unknown): "high" | "medium" | "low" {
  const t = String(v || "").toLowerCase();
  if (t.includes("high") || t.includes("υψη")) return "high";
  if (t.includes("low") || t.includes("χαμη")) return "low";
  return "medium";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const partyKey = String(body?.party || "").trim();
    const partyLabel = String(body?.partyLabel || partyKey || "το κομμα").trim();
    const focus = String(body?.focus || "").slice(0, 300).trim();
    if (!partyKey) return json({ ok: false, error: "no_party" }, 400);

    // Προφιλ κομματος απο τη βαση
    let profileBlock = "";
    try {
      const { data } = await svc()
        .from("political_party_profiles")
        .select("party_name, short_name, strategic_positioning, advisor_instructions, issue_lens, known_positions, red_lines, key_officials")
        .eq("party_key", partyKey)
        .limit(1);
      const p: any = Array.isArray(data) ? data[0] : null;
      if (p) {
        const pos = (p.strategic_positioning || "").toString().trim();
        const lens = p.issue_lens ? JSON.stringify(p.issue_lens) : "";
        const kp = Array.isArray(p.known_positions) ? p.known_positions.join(" · ") : "";
        const rl = Array.isArray(p.red_lines) ? p.red_lines.join(" · ") : "";
        profileBlock =
          (pos ? "ΘΕΣΜΙΚΗ ΘΕΣΗ: " + pos + "\n" : "") +
          (kp ? "ΘΕΣΕΙΣ: " + kp + "\n" : "") +
          (rl ? "ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ: " + rl + "\n" : "") +
          (lens ? "ΤΑΥΤΟΤΗΤΑ & ΦΑΚΟΣ (JSON): " + lens + "\n" : "");
      }
    } catch {
      /* συνεχιζουμε χωρις */
    }

    // Στελεχη ολων των κομματων: δικα σου = ΣΤΟΧΟΙ, αντιπαλων = ΕΠΙΤΙΘΕΜΕΝΟΙ (ονομαστικα)
    let ownOfficials = "";
    let rivalOfficials = "";
    try {
      const { data: allRows } = await svc()
        .from("political_party_profiles")
        .select("party_key, short_name, party_name, key_officials");
      const rows: any[] = Array.isArray(allRows) ? allRows : [];
      const fmt = (o: any) => `${o?.name || ""}${o?.role ? " (" + o.role + ")" : ""}`;
      for (const r of rows) {
        const offs = Array.isArray(r?.key_officials) ? r.key_officials : [];
        if (!offs.length) continue;
        const label = r.short_name || r.party_name || r.party_key;
        const line = offs.map(fmt).filter(Boolean).join(", ");
        if (r.party_key === partyKey) ownOfficials = line;
        else rivalOfficials += `${label}: ${line}\n`;
      }
    } catch {
      /* συνεχιζουμε χωρις */
    }

    const officialsBlock =
      (ownOfficials ? "ΔΙΚΑ ΣΟΥ ΣΤΕΛΕΧΗ (πιθανοι ΣΤΟΧΟΙ επιθεσεων): " + ownOfficials + "\n" : "") +
      (rivalOfficials ? "ΣΤΕΛΕΧΗ ΑΝΤΙΠΑΛΩΝ (πιθανοι ΕΠΙΤΙΘΕΜΕΝΟΙ — χρησιμοποιησε ΑΥΤΑ τα ονοματα):\n" + rivalOfficials : "");

    const system = `Εισαι ο Noraya, κορυφαιος συμβουλος αμυνας & αντεπιθεσης για το κομμα "${partyLabel}".
Δουλεια σου: να προβλεψεις τις ΕΠΙΘΕΣΕΙΣ που θα δεχτει το κομμα (απο αντιπαλα κομματα ΚΑΙ απο συγκεκριμενα προσωπα), και να δωσεις ΕΤΟΙΜΕΣ, αιχμηρες απαντησεις στη ΦΩΝΗ και τη ΓΡΑΜΜΗ του κομματος.

${profileBlock ? "ΠΡΟΦΙΛ ΚΟΜΜΑΤΟΣ (σεβασου το απολυτα):\n" + profileBlock + "\n" : ""}${officialsBlock ? officialsBlock + "\n" : ""}ΚΑΝΟΝΕΣ:
- Καθε επιθεση = ΣΥΓΚΕΚΡΙΜΕΝΟΣ επιτιθεμενος. Χρησιμοποιησε ΠΡΑΓΜΑΤΙΚΑ ονοματα απο τις λιστες στελεχων παραπανω (μη τα εφευρισκεις). Ατακα αυτολεξει (<25 λεξεις).
- Καθε απαντηση: ετοιμη, στη φωνη του κομματος, <30 λεξεις, χρησιμοποιησιμη αμεσα.
- Σεβασου τη ΘΕΣΜΙΚΗ ΘΕΣΗ (αν εκτος Βουλης, οχι κοινοβουλευτικες αναφορες) και τις ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ.
- ΟΡΙΟ: αποτυπωσε τη σκληροτητα της αντιπαραθεσης, αλλα ΜΗΝ παραγεις ρατσιστικο/μισαλλοδοξο/υβριστικο περιεχομενο η προσωπικες προσβολες — πολιτικα επιχειρηματα, οχι λασπη.
- Ελληνικα, χωρις markdown μεσα στα strings.`;

    const user = `${focus ? "ΕΣΤΙΑΣΗ (δωσε προτεραιοτητα σε αυτο): " + focus + "\n\n" : ""}Δωσε:
1) 4 επιθεσεις απο ΑΝΤΙΠΑΛΑ ΚΟΜΜΑΤΑ (καθε μια απο διαφορετικο κομμα οπου γινεται).
2) 3 επιθεσεις ΠΡΟΣΩΠΟ-ΣΕ-ΠΡΟΣΩΠΟ: αντιπαλο προσωπο (απο τα ΣΤΕΛΕΧΗ ΑΝΤΙΠΑΛΩΝ) επιτιθεται σε ΔΙΚΟ ΣΟΥ στελεχος (απο τα ΔΙΚΑ ΣΟΥ ΣΤΕΛΕΧΗ). Ονομαστικα και στις δυο πλευρες.

Επεστρεψε ΜΟΝΟ εγκυρο JSON:
{
 "partyAttacks": [ { "attacker": "κομμα", "attack": "ατακα", "response": "απαντηση", "risk_level": "high|medium|low" } ],
 "personAttacks": [ { "attacker": "προσωπο (κομμα)", "target": "προσωπο-στοχος", "attack": "ατακα", "response": "απαντηση", "risk_level": "high|medium|low" } ]
}`;

    const text = await callClaude(system, user, 2200);
    const parsed = parseJsonLoose(text);
    if (!parsed) return json({ ok: false, error: "parse", raw: text.slice(0, 400) });

    const partyAttacks = (Array.isArray(parsed.partyAttacks) ? parsed.partyAttacks : []).slice(0, 6).map((a: any) => ({
      attacker: String(a?.attacker || "").trim(),
      attack: String(a?.attack || "").trim(),
      response: String(a?.response || "").trim(),
      risk_level: risk(a?.risk_level),
    })).filter((a: any) => a.attacker && a.attack);

    const personAttacks = (Array.isArray(parsed.personAttacks) ? parsed.personAttacks : []).slice(0, 5).map((a: any) => ({
      attacker: String(a?.attacker || "").trim(),
      target: String(a?.target || "").trim(),
      attack: String(a?.attack || "").trim(),
      response: String(a?.response || "").trim(),
      risk_level: risk(a?.risk_level),
    })).filter((a: any) => a.attacker && a.attack);

    return json({ ok: true, partyAttacks, personAttacks });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
