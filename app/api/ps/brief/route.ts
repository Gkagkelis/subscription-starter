import { NextRequest, NextResponse } from "next/server";
import { createClient as naServer } from "@/utils/supabase/server";
import { createClient as naAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA PS — Η ΚΑΡΔΙΑ: «Συμβαινει κατι -> Ετοιμα ολα»
// Παιρνει ΕΝΑ γεγονος + το προφιλ του βουλευτη (ψυχογραφημα, κομμα, περιφερεια, φαση)
// και βγαζει: ΑΝΑΛΥΣΗ + ΚΙΝΗΣΕΙΣ + ΕΤΟΙΜΑ ΠΟΣΤ (channel-on-demand).
//
// ΟΙΚΟΝΟΜΙΑ:
//  - Η αναλυση (analysis + moves) υπολογιζεται ΜΙΑ φορα ανα γεγονος (cached στη βαση).
//  - Τα ποστ παραγονται ΜΟΝΟ για το καναλι που ζηταει ο χρηστης (channel param).
//  - Prompt caching στο σταθερο context (προφιλ/κομμα) -> -90% στα input tokens.
// ============================================================

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function svc() {
  return naAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function jsonOut(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function lvl(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 2.5) return "χαμηλο";
  if (n <= 3.5) return "μετριο";
  return "υψηλο";
}

// -------- Φορτωση προφιλ βουλευτη (ψυχογραφημα + κομμα + περιφερεια + φαση) --------
async function loadPsContext(): Promise<{
  block: string;
  phase: string;
  party: string;
  district: string;
  name: string;
}> {
  let block = "";
  let phase = "";
  let party = "";
  let district = "";
  let name = "";
  try {
    const supaU = naServer();
    const { data: { user } } = await supaU.auth.getUser();
    if (!user?.id) return { block, phase, party, district, name };

    // organizations: κομμα, περιφερεια, φαση, ονομα
    const { data: org } = await svc()
      .from("organizations")
      .select("party_key, district, representative_name, phase, org_type, party_profile_snapshot")
      .eq("user_id", user.id)
      .maybeSingle();
    const o: any = org || {};
    party = String(o.party_key || "");
    district = String(o.district || "");
    name = String(o.representative_name || "");
    phase = String(o.phase || "");

    // κομματικη γραμμη (απο snapshot)
    const snap: any = o.party_profile_snapshot || {};
    const partyLine =
      snap?.strategic_positioning ||
      snap?.short_name ||
      party ||
      "";
    const redLines = Array.isArray(snap?.red_lines) ? snap.red_lines.join(" · ") : "";

    // ψυχογραφημα
    const { data: pRows } = await svc()
      .from("psychometric_profiles")
      .select("scores, issue_ranking")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const prow: any = Array.isArray(pRows) ? pRows[0] : null;
    const sc: any = prow?.scores || null;

    const lines: string[] = [];
    lines.push(`ΒΟΥΛΕΥΤΗΣ/ΥΠΟΨΗΦΙΟΣ: ${name || "—"} · Περιφερεια: ${district || "—"} · Κομμα: ${party || "—"}`);
    if (partyLine) lines.push(`ΚΟΜΜΑΤΙΚΗ ΓΡΑΜΜΗ: ${String(partyLine).slice(0, 300)}`);
    if (redLines) lines.push(`ΚΟΚΚΙΝΕΣ ΓΡΑΜΜΕΣ ΚΟΜΜΑΤΟΣ (μην τις παραβιασεις): ${redLines.slice(0, 200)}`);

    if (sc) {
      const cap = sc?.bigFive?.caprara || {};
      const tr = sc?.bigFive?.traits || {};
      const comp = sc?.compass || {};
      const mfq = sc?.mfq || {};
      const st = sc?.style || null;
      const moral =
        (mfq.binding ?? 0) > (mfq.individualizing ?? 0)
          ? "BINDING (ταξη, κοινοτητα, πιστη, παραδοση)"
          : "INDIVIDUALIZING (φροντιδα, δικαιοσυνη, ανθρωπια)";
      lines.push(
        `ΨΥΧΟΓΡΑΦΗΜΑ — προσαρμοσε ΥΦΟΣ & επιχειρηματα:`,
        `  Brand: Ενεργεια/Καινοτομια=${cap.energyInnovation ?? "—"}/5 · Εντιμοτητα=${cap.honestyTrust ?? "—"}/5`,
        `  Big Five: εξωστρεφεια=${lvl(tr.extraversion)} · προσηνεια=${lvl(tr.agreeableness)} · δεκτικοτητα=${lvl(tr.openness)}`,
        `  Πυξιδα: Οικονομικα=${comp.economic ?? "—"} · Κοινωνικα=${comp.social ?? "—"} [-10..10]`,
        `  Ηθικο λεξιλογιο: ${moral}`
      );
      if (st) {
        lines.push(`  Υφος: χαρισμα=${st.clt ?? "—"}/5 · πολυπλοκοτητα=${st.complexity ?? "—"}/5 · λαικος τονος=${st.populism ?? "—"}/5`);
      }
    }
    // === ΠΡΟΦΙΛ ΠΕΡΙΦΕΡΕΙΑΣ (βαθια γνωση τοπου) — απο το cache, δωρεαν ===
    if (district) {
      try {
        const norm = district
          .trim().toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_");
        const rkey = `region_profile_v1__${norm}`;
        const { data: rp } = await svc()
          .from("analysis_cache")
          .select("result")
          .eq("analysis_kind", "region_profile_v1")
          .eq("input_hash", rkey)
          .maybeSingle();
        const reg: any = rp?.result || null;
        if (reg) {
          const probs = Array.isArray(reg.coreProblems)
            ? reg.coreProblems.map((p: any) => `${p.title} (${p.severity})`).join(" · ")
            : "";
          const econ = Array.isArray(reg.economy) ? reg.economy.join(", ") : "";
          const elect = reg.electoral ? `${reg.electoral.lean || ""} — ${reg.electoral.note || ""}` : "";
          lines.push(
            "",
            `=== ΒΑΘΙΑ ΓΝΩΣΗ ΤΗΣ ΠΕΡΙΦΕΡΕΙΑΣ ΣΟΥ (${district}) ===`,
            reg.snapshot ? `Χαρακτηρας: ${reg.snapshot}` : "",
            econ ? `Οικονομια: ${econ}` : "",
            probs ? `Διαχρονικα προβληματα: ${probs}` : "",
            reg.demographics ? `Δημογραφικο: ${reg.demographics}` : "",
            elect ? `Εκλογικο προφιλ: ${elect}` : "",
            Array.isArray(reg.sensitivities) && reg.sensitivities.length ? `Τοπικες ευαισθησιες: ${reg.sensitivities.join(" · ")}` : "",
            "ΟΔΗΓΙΑ: ΣΥΝΔΕΣΕ το σημερινο γεγονος με τα διαχρονικα προβληματα & το εκλογικο προφιλ του τοπου. Μιλα σαν ντοπιος που ξερει καθε γωνια."
          );
        }
      } catch { /* αγνοειται */ }
    }

    block = lines.filter(Boolean).join("\n");
  } catch {
    /* προαιρετικο */
  }
  return { block, phase, party, district, name };
}

async function callClaude(system: any[], user: string, maxTokens = 2200): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no_api_key");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,               // array με cache_control για prompt caching
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("Claude API " + resp.status + " " + t.slice(0, 200));
  }
  const data = await resp.json();
  return (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

function parseJsonLoose(raw: string): any | null {
  let s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    let cand = s.slice(first, last + 1);
    try { return JSON.parse(cand); } catch {}
    try {
      cand = cand
        .replace(/[\u0000-\u001F]+/g, " ")
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      return JSON.parse(cand);
    } catch {}
  }
  return null;
}

// ============================================================
// POST — δυο λειτουργιες μεσω body.stage:
//   stage="analysis"  -> Αναλυση + Κινησεις (cached ανα γεγονος)
//   stage="post"      -> Ενα ετοιμο ποστ για συγκεκριμενο channel
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const stage = body?.stage === "post" ? "post" : "analysis";
    const eventTitle = String(body?.eventTitle || "").slice(0, 300);
    const eventSummary = String(body?.eventSummary || "").slice(0, 1200);
    if (!eventTitle) return jsonOut({ ok: false, error: "no_event" }, 400);

    const ctx = await loadPsContext();

    // Σταθερο system (cache-able): ποιος εισαι + το προφιλ. Ιδιο σε αναλυση & ποστ.
    const phaseLabel =
      ctx.phase === "campaign"
        ? "ΚΑΜΠΑΝΙΑ (υποψηφιος — παλευεις και με συνυποψηφιους του ΙΔΙΟΥ κομματος)"
        : ctx.phase === "term"
        ? "ΘΗΤΕΙΑ (εκλεγμενος βουλευτης — εχεις κοινοβουλευτικα εργαλεια)"
        : "ΕΤΟΙΜΑΣΙΑ";

    const systemText =
      `Εισαι ο Noraya PS — ο προσωπικος στρατηγικος συμβουλος επικοινωνιας ενος Ελληνα πολιτικου.\n` +
      `Δουλεια σου: να του δινεις ΕΤΟΙΜΟ, αιχμηρο, εφαρμοσιμο υλικο — οχι θεωρια.\n\n` +
      `ΦΑΣΗ: ${phaseLabel}\n\n` +
      `ΤΟ ΠΡΟΦΙΛ ΤΟΥ (χτισε ΤΑ ΠΑΝΤΑ πανω σε αυτο):\n${ctx.block || "—"}\n\n` +
      `ΑΡΧΕΣ (απο νικηφορες καμπανιες):\n` +
      `- MESSAGE DISCIPLINE (Obama 2008): ΕΝΑ σταθερο αφηγημα, ολα το υπηρετουν.\n` +
      `- PUBLIC NARRATIVE (Ganz): καθε δηλωση/λογος = Story of Self (εσυ/αξιες) + Story of Us (η περιφερεια/κοινοτητα σου) + Story of Now (το επειγον, τι πρεπει τωρα).\n` +
      `- MONROE SEQUENCE στα ποστ: Προσοχη -> Προβλημα -> Λυση(δικη σου) -> Οραμα -> Καλεσμα.\n` +
      `- ΕΛΛΗΝΙΚΗ ΠΡΑΓΜΑΤΙΚΟΤΗΤΑ: μιλα στον κοσμο της περιφερειας, τοπικα, ανθρωπινα, με λαικο τονο ΟΠΟΥ ταιριαζει στο προφιλ. Οχι ξυλινη γλωσσα.\n\n` +
      `ΟΡΙΑ (απαραβατα): ΠΟΤΕ ψευδη γεγονοτα/αριθμοι. ΠΟΤΕ ρατσισμος/μισος. Παντα εντος κομματικης γραμμης & κοκκινων γραμμων.`;

    const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];

    // ---------------- STAGE: ANALYSIS + MOVES ----------------
    if (stage === "analysis") {
      const cacheKey = `ps_brief_v1__${ctx.party || "x"}__${Buffer.from(eventTitle).toString("base64").slice(0, 40)}`;
      // cache lookup
      try {
        const { data: cached } = await svc()
          .from("analysis_cache")
          .select("value")
          .eq("key", cacheKey)
          .maybeSingle();
        if (cached?.value) {
          return jsonOut({ ok: true, cached: true, ...(cached.value as any) });
        }
      } catch { /* αγνοειται */ }

      const user =
        `ΓΕΓΟΝΟΣ: ${eventTitle}\n${eventSummary ? "ΛΕΠΤΟΜΕΡΕΙΕΣ: " + eventSummary + "\n" : ""}\n` +
        `Δωσε ΜΟΝΟ εγκυρο JSON (χωρις σχολια //, χωρις code fences), σε ΔΕΥΤΕΡΟ προσωπο (μιλας σε εσενα τον πολιτικο):\n` +
        `{\n` +
        ` "analysis": {\n` +
        `   "what": "2-3 προτασεις: τι ακριβως συμβαινει (τα γεγονοτα).",\n` +
        `   "whyYou": "γιατι σε αφορα ΕΙΔΙΚΑ εσενα (περιφερεια/προφιλ).",\n` +
        `   "publicPulse": "τι λεει/νιωθει ο κοσμος γι αυτο.",\n` +
        `   "attackRisk": "ΠΟΥ θα σου την πεσουν με βαση το προφιλ σου — ποιος αντιπαλος, τι θα πει (αυτολεξει), και η ετοιμη σου απαντηση."\n` +
        ` },\n` +
        ` "moves": [\n` +
        `   {"title":"συντομος τιτλος κινησης", "detail":"τι κανεις, πρακτικα", "stance":"ενωτικος|διαφοροποιηση", "why":"γιατι αυτη η επιλογη τωρα"}\n` +
        ` ]\n` +
        `}\n` +
        `ΚΑΝΟΝΕΣ: 2-3 moves. Τουλαχιστον ΕΝΑ move να σε ΔΙΑΦΟΡΟΠΟΙΕΙ (ξεχωριζεις, ακομα κι απο συνυποψηφιους του κομματος σου) και ΕΝΑ ΕΝΩΤΙΚΟ (παιζεις ομαδικα με το κομμα). Strings σε μια γραμμη.`;

      const text = await callClaude(system, user, 1800);
      const parsed = parseJsonLoose(text);
      if (!parsed) return jsonOut({ ok: false, error: "parse", raw: text.slice(0, 300) });

      const out = {
        analysis: parsed.analysis || {},
        moves: Array.isArray(parsed.moves) ? parsed.moves.slice(0, 3) : [],
      };
      // cache save (24h μεσω created_at — ο caller μπορει να κανει force)
      try {
        await svc().from("analysis_cache").upsert({ key: cacheKey, value: out }, { onConflict: "key" });
      } catch { /* αγνοειται */ }

      return jsonOut({ ok: true, cached: false, ...out });
    }

    // ---------------- STAGE: POST (channel-on-demand) ----------------
    const channel = String(body?.channel || "").toLowerCase();
    const validChannels: Record<string, string> = {
      statement:
        `Γραψε ΠΛΗΡΗ ΕΠΙΣΗΜΗ ΔΗΛΩΣΗ (120-180 λεξεις) με δομη Story of Self / Us / Now. Σοβαρη, καθαρη, με συγκεκριμενο αιτημα/θεση στο τελος.`,
      facebook:
        `Γραψε ΕΤΟΙΜΟ POST για FACEBOOK (80-140 λεξεις). Ζεστο, προσωπικο, τοπικο. Ξεκινα με hook. Κλεισε με καλεσμα. 2-3 hashtags τοπικα στο τελος.`,
      instagram:
        `Γραψε ΕΤΟΙΜΟ κειμενο για INSTAGRAM (60-100 λεξεις, πιο συναισθηματικο) ΚΑΙ μια συντομη οδηγια «ΕΙΚΟΝΑ:» για το τι φωτογραφια/γραφικο να ανεβασεις. Hashtags στο τελος.`,
      twitter:
        `Γραψε 1 ΑΙΧΜΗΡΟ tweet (<280 χαρακτηρες), κοφτερο, με θεση. Οχι hashtags-σπαμ, το πολυ 1.`,
      tiktok:
        `Γραψε ΣΕΝΑΡΙΟ TikTok (30-45 δευτ): «ΤΙ ΛΕΣ:» (τα λογια, σε καθομιλουμενη, punchy) και «ΠΟΥ/ΠΩΣ:» (που στεκεσαι, τι δειχνεις — π.χ. εξω απ το νοσοκομειο). Αμεσο, αυθεντικο.`,
      speech:
        `Γραψε ΠΟΛΙΤΙΚΟ ΛΟΓΟ (200-320 λεξεις) για εκδηλωση/ομιλια. Αυστηρη δομη Public Narrative: ξεκινα με Story of Self (προσωπικη στιγμη/αξια), περνα σε Story of Us (η κοινοτητα/περιφερεια — «εμεις»), κορυφωσε με Story of Now (το επειγον, το καλεσμα σε δραση). Ρητορικα σχηματα: επαναληψη, τρικολον. Να διαβαζεται δυνατα.`,
      sms:
        `Γραψε ΜΗΝΥΜΑ SMS/VIBER προς ψηφοφορους (2-3 συντομες προτασεις, <320 χαρακτηρες). Αμεσο, προσωπικο, με το ονομα σου στο τελος. Οχι επισημο — σαν να γραφεις σε γειτονα. Χωρις hashtags.`,
      press:
        `Γραψε ΔΕΛΤΙΟ ΤΥΠΟΥ προς ΜΜΕ (140-200 λεξεις). Δομη: τιτλος (κεφαλαια), πρωτη παραγραφος με το «τι-ποιος-που-ποτε», αναπτυξη θεσης, καταληκτικη δηλωση σε εισαγωγικα («...»). Θεσμικο, δημοσιογραφικο υφος, γ' προσωπο για τα γεγονοτα αλλα α' προσωπο στη δηλωση.`,
      radio:
        `Γραψε TALKING POINTS για ΣΥΝΕΝΤΕΥΞΗ σε τοπικο ραδιοφωνο/καναλι: 4-5 κοφτα bullets με τα ΒΑΣΙΚΑ που πρεπει να πεις (το καθενα 1 προταση, ετοιμο να ειπωθει), + 1 «ΑΝ ΣΕ ΠΙΕΣΟΥΝ:» με ετοιμη απαντηση στη δυσκολη ερωτηση. Καθομιλουμενα, οχι ξυλινα.`,
    };
    const instr = validChannels[channel];
    if (!instr) return jsonOut({ ok: false, error: "bad_channel" }, 400);

    // ΚΟΙΝΟ: προσαρμογη τονου/επιχειρηματων αναλογα με ποιους απευθυνεσαι.
    const audience = String(body?.audience || "").slice(0, 80);
    const audienceLine = audience
      ? `ΚΟΙΝΟ: Απευθυνεσαι σε «${audience}». Προσαρμοσε ΤΟΝΟ, παραδειγματα & επιχειρηματα ΕΙΔΙΚΑ σε αυτο το κοινο — τι τους νοιαζει, τι γλωσσα μιλανε.\n`
      : "";
    const user =
      `ΓΕΓΟΝΟΣ: ${eventTitle}\n${eventSummary ? "ΛΕΠΤΟΜΕΡΕΙΕΣ: " + eventSummary + "\n" : ""}\n` +
      `${body?.moveContext ? "ΕΠΙΛΕΓΜΕΝΗ ΓΡΑΜΜΗ: " + String(body.moveContext).slice(0, 300) + "\n" : ""}` +
      `${audienceLine}\n` +
      `${instr}\n\n` +
      `Στο ΥΦΟΣ ΣΟΥ (βασει ψυχογραφηματος), εντος κομματικης γραμμης, ΣΥΝΔΕΔΕΜΕΝΟ με τα τοπικα προβληματα της περιφερειας σου. Ελληνικα. Επεστρεψε ΜΟΝΟ το κειμενο, χωρις εισαγωγη/επεξηγηση.`;

    const text = await callClaude(system, user, 1400);
    return jsonOut({ ok: true, channel, text });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) }, 500);
  }
}
