import { NextRequest, NextResponse } from "next/server";
import { createClient as naServer } from "@/utils/supabase/server";
import { createClient as naAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA PS — COCKPIT (δυναμικο): ο,τι κανει το demo-candidate, ΑΛΛΑ για τον
// πραγματικο συνδεδεμενο χρηστη (ονομα/κομμα/περιφερεια/ψυχογραφημα/προφιλ τοπου).
// Modes: daily · week · redteam · deliverable · chat.
// Τα τοπικα ερχονται απο /api/ps/local-news (φιλτραρισμενα, δυναμικα).
// ============================================================

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function svc() {
  return naAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function json(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function lvl(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 2.5) return "χαμηλο";
  if (n <= 3.5) return "μετριο";
  return "υψηλο";
}

// -------- Δυναμικο CANDIDATE απο το προφιλ του συνδεδεμενου --------
type Ctx = {
  candidate: string;   // το system context (σαν το CANDIDATE του demo, αλλα δυναμικο)
  name: string;
  party: string;
  district: string;
  phase: string;
};

async function loadCtx(): Promise<Ctx> {
  let name = "", party = "", district = "", phase = "";
  const lines: string[] = [];
  try {
    const supaU = naServer();
    const { data: { user } } = await supaU.auth.getUser();
    if (user?.id) {
      const { data: org } = await svc()
        .from("organizations")
        .select("party_key, district, representative_name, phase, party_profile_snapshot")
        .eq("user_id", user.id)
        .maybeSingle();
      const o: any = org || {};
      party = String(o.party_key || "");
      district = String(o.district || "");
      name = String(o.representative_name || "");
      phase = String(o.phase || "");

      const snap: any = o.party_profile_snapshot || {};
      const partyLine = snap?.strategic_positioning || snap?.short_name || party || "";
      const redLines = Array.isArray(snap?.red_lines) ? snap.red_lines.join(" · ") : "";
      const knownPos = snap?.known_positions || null;

      // ταυτοτητα + φαση
      const isCampaign = /campaign|προεκλογ|υποψηφ/i.test(phase) || /υποψηφ/i.test(String(o.org_type || ""));
      lines.push(`ΤΑΥΤΟΤΗΤΑ ΧΡΗΣΤΗ:`);
      lines.push(`- Ονομα: ${name || "—"}`);
      lines.push(`- Ρολος: ${isCampaign ? "ΥΠΟΨΗΦΙΟΣ/Α ΒΟΥΛΕΥΤΗΣ (ΔΕΝ εχει εδρα)" : "ΒΟΥΛΕΥΤΗΣ / στελεχος"}.`);
      if (party) lines.push(`- Κομμα: ${party}.`);
      if (district) lines.push(`- Εκλογικη περιφερεια: ${district} (εντονη ΣΤΑΥΡΟΔΟΣΙΑ — ανταγωνισμος ΚΑΙ με συνυποψηφιους ΙΔΙΟΥ κομματος).`);
      lines.push(`- Στοχος: να κερδισει ΣΤΑΥΡΟΥΣ & εδρα — αναγνωρισιμοτητα, τοπικη παρουσια, διαφοροποιηση.`);
      if (partyLine) lines.push(`\nΓΡΑΜΜΗ ΚΟΜΜΑΤΟΣ: ${String(partyLine).slice(0, 400)}`);
      if (knownPos && typeof knownPos === "object") {
        const kp = Object.entries(knownPos).slice(0, 8).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`);
        if (kp.length) lines.push(`ΘΕΣΕΙΣ ΑΝΑ ΘΕΜΑ:\n- ${kp.join("\n- ")}`);
      }
      if (redLines) lines.push(`ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ (μην τις παραβιασεις): ${redLines.slice(0, 200)}`);

      // ψυχογραφημα (υφος)
      const { data: pRows } = await svc()
        .from("psychometric_profiles")
        .select("scores")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const sc: any = (Array.isArray(pRows) ? pRows[0] : null)?.scores || null;
      if (sc) {
        const st = sc.style || {};
        lines.push(
          `\nΨΥΧΟΓΡΑΦΗΜΑ (υφος/φωνη):` +
          ` χαρισμα=${st.clt ?? "—"}/5 · πολυπλοκοτητα=${st.complexity ?? "—"}/5 · λαικος τονος=${st.populism ?? "—"}/5.` +
          ` Γραψε ΣΤΟ ΥΦΟΣ ΤΟΥ.`
        );
      }

      // προφιλ περιφερειας (βαθια γνωση τοπου)
      if (district) {
        const norm = district.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
        const { data: rp } = await svc()
          .from("analysis_cache")
          .select("result")
          .eq("analysis_kind", "region_profile_v1")
          .eq("input_hash", `region_profile_v1__${norm}`)
          .maybeSingle();
        const reg: any = rp?.result || null;
        if (reg) {
          const probs = Array.isArray(reg.coreProblems) ? reg.coreProblems.map((p: any) => p.title).join(" · ") : "";
          lines.push(
            `\nΒΑΘΙΑ ΓΝΩΣΗ ΤΟΠΟΥ (${district}):` +
            (reg.snapshot ? ` ${reg.snapshot}` : "") +
            (probs ? ` Διαχρονικα προβληματα: ${probs}.` : "") +
            (reg.electoral?.lean ? ` Εκλογικα: ${reg.electoral.lean}.` : "") +
            ` Μιλα σαν ντοπιος.`
          );
        }
      }
    }
  } catch { /* αγνοειται */ }

  // ΚΑΝΟΝΕΣ (ιδιοι με το demo)
  lines.push(
    `\nΚΑΝΟΝΕΣ (ΚΡΙΣΙΜΟ):` +
    `\n- Καμπανια: περιοδειες/πορτα-πορτα στην ${district || "περιφερεια"}, τοπικα ΜΜΕ, social/reels, εκδηλωσεις, τοπικα ζητηματα, προσωπικο αφηγημα, διαφοροποιηση απο συνυποψηφιους.` +
    `\n- ΠΟΤΕ ρατσιστικο/μισαλλοδοξο/υβριστικο. Παντα ΤΟΠΙΚΑ & ΣΥΓΚΕΚΡΙΜΕΝΑ για την ${district || "περιφερεια"}.`
  );

  return { candidate: lines.filter(Boolean).join("\n"), name, party, district, phase };
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
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
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

function localToText(local: any[]): string {
  if (!Array.isArray(local) || !local.length) return "";
  return local.map((l: any) => `${l.label}: ${(l.headlines || []).join(" | ")}`).join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "daily");
    const ctx = await loadCtx();
    const C = ctx.candidate;
    const D = ctx.district || "την περιφερεια σου";
    const P = ctx.party || "το κομμα σου";
    const localText = localToText(body?.local);
    const themes: string[] = Array.isArray(body?.themes) ? body.themes.slice(0, 8) : [];
    const themesText = themes.length ? themes.join(" · ") : "—";

    if (mode === "chat") {
      const question = String(body?.question || "").slice(0, 2000);
      if (!question) return json({ ok: false, error: "no_question" }, 400);
      const history: { role: string; content: string }[] = Array.isArray(body?.history) ? body.history.slice(-6) : [];
      const histText = history.map((h) => (h.role === "user" ? "Χρηστης: " : "Noraya: ") + String(h.content || "").slice(0, 600)).join("\n");
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${C}\n\nΣημερα «καινε»: ${themesText}.${localText ? "\n\nΤΟΠΙΚΑ:\n" + localText : ""}`;
      const user = `${histText ? "Ιστορικο:\n" + histText + "\n\n" : ""}Ερωτηση: ${question}\n\nΑπαντησε συντομα, αποφασιστικα, με συγκεκριμενες κινησεις καμπανιας για ${D}. Χωρις markdown.`;
      const text = await callClaude(system, user, 900);
      return json({ ok: true, text });
    }

    if (mode === "week") {
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${C}`;
      const user = `Με βαση ο,τι «καιει» σημερα (${themesText})${localText ? " και τα τοπικα:\n" + localText : ""}, δωσε ΣΧΕΔΙΟ ΕΒΔΟΜΑΔΑΣ.\nΕπεστρεψε ΜΟΝΟ εγκυρο JSON:\n{"days":[{"day":"Δευτερα","move":"συγκεκριμενη κινηση καμπανιας στην ${D}","why":"γιατι κερδιζει σταυρους"}, ... 5-6 μερες]}`;
      const text = await callClaude(system, user, 1500);
      let days = parseJsonLoose(text)?.days;
      if (!Array.isArray(days) || days.length === 0) {
        days = [];
        const re = /"day"\s*:\s*"([^"]+)"\s*,\s*"move"\s*:\s*"([^"]+)"\s*,\s*"why"\s*:\s*"([^"]*)"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) days.push({ day: m[1], move: m[2], why: m[3] });
      }
      return json({ ok: true, plan: Array.isArray(days) ? days : [] });
    }

    if (mode === "redteam") {
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${C}`;
      const user = `Με βαση τα τοπικα:\n${localText || "(εθνικα: " + themesText + ")"}\nΔωσε 3 ΣΥΓΚΕΚΡΙΜΕΝΕΣ επιθεσεις που θα δεχτει στην ${D}.\nΟ 1ος επιτιθεμενος = ΣΥΝΥΠΟΨΗΦΙΟΣ ${P} (ανταγωνισμος για σταυρους). Ο 2ος & 3ος = υποψηφιοι αλλων κομματων.\nΚαθε επιθεση αυτολεξει (<20 λεξεις) + ετοιμη απαντηση στη φωνη ${P} (<20 λεξεις). Οχι μισος.\nΕπεστρεψε ΜΟΝΟ JSON: {"red_team":[{"attacker":"...","attack":"...","response":"...","risk_level":"high|medium|low"}, x3]}`;
      const text = await callClaude(system, user, 900);
      const parsed = parseJsonLoose(text);
      return json({ ok: true, red_team: Array.isArray(parsed?.red_team) ? parsed.red_team.slice(0, 3) : [] });
    }

    if (mode === "deliverable") {
      const topic = String(body?.topic || "").slice(0, 200);
      const kind = String(body?.kind || "statement");
      const heads = Array.isArray(body?.headlines) ? body.headlines.join(" | ") : "";
      if (!topic) return json({ ok: false, error: "no_topic" }, 400);
      const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας. Γραφεις στη ΦΩΝΗ του υποψηφιου.\n\n${C}`;
      const user =
        kind === "post"
          ? `Γραψε ενα SOCIAL POST (40-70 λεξεις) για το τοπικο θεμα «${topic}» στην ${D}, με βαση: ${heads || "—"}. Ζωντανο, τοπικο, στη γραμμη ${P}, με μια συγκεκριμενη θεση/λυση, + 2-3 hashtags. Χωρις μισος, χωρις markdown (μονο τα hashtags).`
          : `Γραψε συντομη ΔΗΛΩΣΗ (60-90 λεξεις) για το τοπικο θεμα «${topic}» στην ${D}, με βαση: ${heads || "—"}. Στη γραμμη/υφος ${P}, τοπικα συγκεκριμενη, με μια προταση-λυση. Σοβαρος τονος. Χωρις markdown.`;
      const text = await callClaude(system, user, 500);
      return json({ ok: true, text });
    }

    // daily (default)
    const system = `Εισαι ο Noraya, AI συμβουλος εκλογικης εκστρατειας.\n\n${C}`;
    const user = `Εθνικη ατζεντα σημερα: ${themesText}.\n${localText ? `ΠΡΑΓΜΑΤΙΚΑ ΤΟΠΙΚΑ ΠΡΩΤΟΣΕΛΙΔΑ (${D}) — χρησιμοποιησε τα:\n` + localText + "\n" : ""}\nΓραψε τη ΣΗΜΕΡΙΝΗ ΑΝΑΓΝΩΣΗ για ${ctx.name || "τον υποψηφιο"} στην ${D}: ποιο ΤΟΠΙΚΟ θεμα ειναι η μεγαλυτερη ΕΥΚΑΙΡΙΑ, ποια η παγιδα, ποια η πρωτη κινηση καμπανιας. Ανεφερε συγκεκριμενα τοπικα στοιχεια. ΑΚΡΙΒΩΣ 4-5 προτασεις, πυκνα — ΟΛΟΚΛΗΡΩΣΕ τη σκεψη. Χωρις markdown.`;
    const text = await callClaude(system, user, 1100);
    return json({ ok: true, text });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
