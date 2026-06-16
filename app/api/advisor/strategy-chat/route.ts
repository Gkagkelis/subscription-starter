import { NextResponse } from "next/server";
import { getMemoryBlock, getAudienceMemoryBlock } from "@/lib/noraya/political-memory";
import { buildCompetitiveContext } from "@/lib/noraya/competitive-memory";
import { fetchPollsSnapshot, formatPollsForPrompt } from "@/lib/noraya/live-polls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeJson(value: unknown, maxLength = 18000) {
  try {
    return JSON.stringify(value ?? null, null, 2).slice(0, maxLength);
  } catch {
    return "null";
  }
}

function shouldUseLiveResearch(question: string) {
  const q = question.toLowerCase();
  return [
    "τώρα",
    "σήμερα",
    "χθες",
    "μόλις",
    "τρέχον",
    "επικαιρότητα",
    "τι παίζει",
    "δήλωσε",
    "ανακοίνωσε",
    "δημοσκόπηση",
    "γκάλοπ",
    "ποσοστά",
    "νέα",
    "ειδήσεις",
    "ανεβαίνει",
    "πέφτει",
    "ανταγωνιστ",
    "αντίπαλ",
    "δυναμικ",
  ].some((signal) => q.includes(signal));
}

function unavailableAnswer() {
  return `Δεν μπόρεσα να συνδεθώ αξιόπιστα με τον AI σύμβουλο αυτή τη στιγμή.

Δεν θα δώσω ψεύτικη πολιτική εκτίμηση. Δοκίμασε ξανά σε λίγο ή έλεγξε το ANTHROPIC_API_KEY / model στα Vercel logs.`;
}

function extractAnswerAndSources(ai: any) {
  const textParts: string[] = [];
  const sources = new Map<string, { title: string; url: string }>();

  for (const block of ai?.content || []) {
    if (block?.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);

      if (Array.isArray(block.citations)) {
        for (const citation of block.citations) {
          if (citation?.url) {
            sources.set(citation.url, {
              title: citation.title || citation.url,
              url: citation.url,
            });
          }
        }
      }
    }
  }

  let answer = textParts.join("\n").trim();
  const sourceList = Array.from(sources.values()).slice(0, 8);

  if (sourceList.length) {
    answer += `\n\nΠηγές που χρησιμοποίησα:\n`;
    answer += sourceList.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join("\n");
  }

  return { answer, sources: sourceList };
}

function evidenceLines(activeSituation: any) {
  const articles = Array.isArray(activeSituation?.evidence_articles) ? activeSituation.evidence_articles : [];
  return articles
    .slice(0, 10)
    .map((a: any, index: number) => {
      return `${index + 1}. ${a.source || "—"} — ${a.title || "—"}\n   Score: ${a.score ?? "—"} · Role: ${a.role || "—"} · Date: ${a.published_at || "—"}\n   URL: ${a.url || "—"}`;
    })
    .join("\n\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // DEBUG: τεστ web_search — δείχνει αν δουλεύει η αναζήτηση & την πραγματική αιτία αποτυχίας
  if (url.searchParams.get("debug_search") === "1") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ ok: false, reason: "NO_API_KEY" });
    const useWhitelist = url.searchParams.get("nowhitelist") !== "1";
    const tool: any = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
    if (useWhitelist) tool.allowed_domains = ["dimoskopiseis.gr", "amna.gr"];
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [{ role: "user", content: "Ψάξε στο web: δημοσκοπήσεις Ελλάδα 2026 και πες μου μία πηγή." }],
          tools: [tool],
        }),
      });
      const status = r.status;
      const bodyText = await r.text();
      let contentTypes: string[] = [];
      try {
        const j = JSON.parse(bodyText);
        contentTypes = (j?.content || []).map((b: any) => b?.type);
      } catch {}
      return NextResponse.json({
        ok: r.ok,
        whitelist_used: useWhitelist,
        status,
        content_types: contentTypes,
        body_sample: bodyText.slice(0, 1200),
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, reason: "FETCH_THREW", message: e?.message || String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    debug: "GET ?debug_search=1 (πρόσθεσε &nowhitelist=1 για τεστ χωρίς whitelist)",
  });
}

export async function POST(req: Request) {
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = cleanText(body.question, 2500);
  const conversationId = body.conversation_id || null;
  const activeSituation = body.active_situation || null;
  const profile = body.profile || null;
  const party = cleanText(body.party || profile?.party_name || profile?.party_profile_snapshot?.party_name || "", 200);

  // Αν υπάρχει επιλεγμένο γεγονός με δικό του advisor_brief, αυτό γίνεται το primary brief.
  const strategicBrief =
    activeSituation?.advisor_brief ||
    body.strategic_brief ||
    body.strategicBrief ||
    null;

  const politicalEnvironment = body.political_environment || null;
  const agendaUsed = Array.isArray(body.agenda_used) ? body.agenda_used.slice(0, 8) : [];
  const agendaBlock = agendaUsed.length
    ? "ΑΤΖΕΝΤΑ (τρέχουσες προτεραιότητες θεμάτων — από το σύστημα ατζέντας):\n" +
      agendaUsed
        .map((a: any) => {
          const bits = [`  • ${a.topic || "—"}`];
          if (a.agenda_score != null) bits.push(`προτεραιότητα ${a.agenda_score}`);
          if (a.political_risk_level) bits.push(`ρίσκο ${a.political_risk_level}`);
          let line = bits.join(" · ");
          if (a.framing_summary) line += `\n    πλαισίωση: ${String(a.framing_summary).slice(0, 300)}`;
          if (a.recommended_action) line += `\n    σύσταση: ${String(a.recommended_action).slice(0, 200)}`;
          if (a.avoid_action) line += `\n    απόφυγε: ${String(a.avoid_action).slice(0, 160)}`;
          return line;
        })
        .join("\n")
    : "";
  const frontendArticles = Array.isArray(body.articles) ? body.articles.slice(0, 8) : [];
  const hasActiveSituation = Boolean(activeSituation?.id || activeSituation?.title || activeSituation?.topic);

  // ΦΩΝΗ ΤΟΥ ΚΟΣΜΟΥ (Πρόσωπα) — πραγματικές φωνές πολιτών για ΑΥΤΟ το γεγονός
  const voicesPulse: any =
    (activeSituation && activeSituation.advisor_brief && activeSituation.advisor_brief.voices_pulse) ||
    (strategicBrief && (strategicBrief as any).voices_pulse) ||
    null;
  let voicesBlock = "";
  if (voicesPulse && typeof voicesPulse === "object") {
    const parts: string[] = [];
    const emo = voicesPulse.dominant_emotion_label || voicesPulse.dominant_emotion;
    if (emo) parts.push(`κυρίαρχο συναίσθημα: ${emo}`);
    if (typeof voicesPulse.social_mood_score === "number") parts.push(`δείκτης κοινωνικής διάθεσης: ${voicesPulse.social_mood_score}/100`);
    if (voicesPulse.dominant_public_frame) parts.push(`κυρίαρχο αφήγημα κοινού: ${voicesPulse.dominant_public_frame}`);
    if (voicesPulse.social_spread) parts.push(`διάχυση/ένταση: ${voicesPulse.social_spread}`);
    if (parts.length) {
      voicesBlock =
        "ΦΩΝΗ ΤΟΥ ΚΟΣΜΟΥ (από «Πρόσωπα» — πραγματικές φωνές πολιτών για ΑΥΤΟ το γεγονός):\n  • " +
        parts.join("\n  • ") +
        "\nΧΡΗΣΗ: Είναι το ΣΥΝΑΙΣΘΗΜΑΤΙΚΟ σήμα του κοινού ΤΩΡΑ για το γεγονός — καθόρισε τον τόνο και το framing με βάση αυτό (όχι ως ξερή στατιστική).";
    }
  }

  // ΣΕΝΑΡΙΑ / ΠΡΟΒΛΕΨΗ (από το «Σενάρια») για ΑΥΤΟ το γεγονός
  const scenariosData: any =
    (activeSituation && activeSituation.advisor_brief && activeSituation.advisor_brief.scenarios) ||
    (strategicBrief && (strategicBrief as any).scenarios) ||
    null;
  let scenariosBlock = "";
  if (scenariosData && typeof scenariosData === "object") {
    const sParts: string[] = [];
    if (scenariosData.headline) sParts.push(`Κατάσταση: ${scenariosData.headline}`);
    if (Array.isArray(scenariosData.foresight) && scenariosData.foresight.length) {
      sParts.push(
        "Πιθανές εξελίξεις: " +
          scenariosData.foresight
            .map((f: any) => `${f.label} (${f.probability != null ? f.probability + "%" : "—"}${f.window ? ", " + f.window : ""})`)
            .join(" · ")
      );
    }
    if (scenariosData.recommendation && scenariosData.recommendation.move_label) {
      sParts.push(
        `Προτεινόμενη κίνηση: ${scenariosData.recommendation.move_label}${scenariosData.recommendation.because ? " — " + scenariosData.recommendation.because : ""}`
      );
    }
    if (sParts.length) {
      scenariosBlock =
        "ΣΕΝΑΡΙΑ / ΠΡΟΒΛΕΨΗ (από το «Σενάρια» για αυτό το γεγονός):\n  • " +
        sParts.join("\n  • ") +
        "\nΧΡΗΣΗ: αν ο χρήστης θέλει να εμβαθύνει σε εξελίξεις/κινήσεις, στηρίξου σε αυτά (είναι δική μας ανάλυση foresight, όχι σημερινό γεγονός).";
    }
  }

  if (!question) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { answer: unavailableAnswer(), conversation_id: conversationId, source: "configuration_error" },
      { status: 500 }
    );
  }

  const athensNow = new Date().toLocaleString("el-GR", {
    timeZone: "Europe/Athens",
    dateStyle: "full",
    timeStyle: "short",
  });

  const liveResearchRequired = shouldUseLiveResearch(question);

  // --- ΜΟΝΙΜΗ ΠΟΛΙΤΙΚΗ ΜΝΗΜΗ (Βήμα 1) ---
  const memOrigin = (() => {
    const h = req.headers;
    const proto = h.get("x-forwarded-proto") || "https";
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    return `${proto}://${host}`;
  })();
  const memTopic = cleanText(activeSituation?.topic || activeSituation?.title || body.topic || question || "", 200);
  const memoryBlock = memTopic ? await getMemoryBlock(memOrigin, memTopic) : "";

  // ΙΣΤΟΡΙΚΟ ΣΥΝΟΜΙΛΙΑΣ (ο σύμβουλος να ΘΥΜΑΤΑΙ τα προηγούμενα)
  const rawHistory = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.history)
    ? body.history
    : [];
  const chatHistory = rawHistory
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: cleanText(m.content, 4000) }));
  while (chatHistory.length && chatHistory[chatHistory.length - 1].role === "user" && chatHistory[chatHistory.length - 1].content === question) {
    chatHistory.pop();
  }

  // ΔΟΜΙΚΟ ΠΛΑΙΣΙΟ ΑΝΤΑΓΩΝΙΣΜΟΥ (διαρθρωτικό, για το επιλεγμένο κόμμα + αντιπάλους)
  const competitiveContext = buildCompetitiveContext(party);

  // ΙΣΤΟΡΙΚΟ ΜΟΤΙΒΟ ΚΟΙΝΩΝ/ΑΡΧΗΓΟΥ (CSV #2 vote intention + #3 leader traits)
  let audienceBlock = "";
  try {
    audienceBlock = await getAudienceMemoryBlock(memOrigin, party);
  } catch {
    audienceBlock = "";
  }

  // ΖΩΝΤΑΝΕΣ ΔΗΜΟΣΚΟΠΗΣΕΙΣ — ακριβή δεδομένα από dimoskopiseis.gr (μόνο σε ερωτήσεις επικαιρότητας)
  let livePollsBlock = "";
  if (liveResearchRequired) {
    try {
      const snap = await fetchPollsSnapshot();
      livePollsBlock = formatPollsForPrompt(snap);
    } catch {
      livePollsBlock = "";
    }
  }

  const systemPrompt = `Είσαι ο Noraya, AI Political Strategy Advisor.

Μιλάς σαν εξαιρετικός πολιτικός σύμβουλος μέσα σε επιτελείο. Δεν είσαι news dashboard και δεν είσαι generic chatbot.

Ημερομηνία/ώρα Ελλάδας τώρα: ${athensNow}
Κόμμα / οργανισμός χρήστη: ${party || "Δεν έχει οριστεί"}

ΚΡΙΣΙΜΟ — ACTIVE LIVE SITUATION:
${hasActiveSituation ? "ΥΠΑΡΧΕΙ επιλεγμένο Live Situation. Αυτό είναι το κύριο context." : "Δεν υπάρχει επιλεγμένο Live Situation."}

Αν υπάρχει ACTIVE SITUATION:
- Απαντάς ΠΑΝΤΑ πάνω στο επιλεγμένο γεγονός.
- Δεν γυρνάς σε γενική θεματική τύπου "Κοινωνία".
- Δεν λες "να εντοπίσω περιστατικό;" γιατί το περιστατικό έχει ήδη δοθεί.
- Αν ο χρήστης ρωτήσει "τι κάνουμε τις επόμενες 24 ώρες;", εννοεί για το επιλεγμένο γεγονός.
- Χρησιμοποιείς το advisor_brief του γεγονότος, τις πηγές του και το political environment.

ΑΠΑΓΟΡΕΥΜΕΝΑ GENERIC:
Μην απαντάς μόνο με:
- "κρατάμε θεσμική γραμμή"
- "παρακολουθούμε την ένταση"
- "χρειάζεται τεκμηρίωση"
Αν χρειάζεται τέτοια στάση, γράψε ακριβώς τι λέμε, τι δεν λέμε, ποιος μιλά, πότε και γιατί.

ΜΗΚΟΣ ΑΠΑΝΤΗΣΗΣ — ΣΑΝ ΑΛΗΘΙΝΟΣ ΣΥΜΒΟΥΛΟΣ (πολύ σημαντικό):
Προσάρμοσε ΠΑΝΤΑ το μήκος στην ερώτηση. ΜΗΝ απαντάς αυτόματα με μεγάλο δομημένο δοκίμιο.
- Απλή/καθημερινή ερώτηση (π.χ. «τι γίνεται;», «τι λες γι' αυτό;», «πώς πάμε;») → ΣΥΝΤΟΜΗ, ανθρώπινη απάντηση 1-4 προτάσεων. ΚΑΜΙΑ αρίθμηση, καμία ενότητα.
- Μεσαία ερώτηση → μία σύντομη παράγραφος με την ουσία.
- ΜΟΝΟ όταν ζητείται πραγματικά πλήρης στρατηγική (ή το θέμα είναι κρίσιμο) → εκτενής ανάλυση που καλύπτει όπου ταιριάζει: σύσταση, ποιο κοινό, παγίδα, ποιος κερδίζει/χάνει, διαφοροποίηση, τι κάνουμε 24ω, τι δεν λέμε, πότε κλιμακώνουμε, δημόσια γραμμή.
Σκέψου σαν έμπειρος σύμβουλος δίπλα στον αρχηγό: λέει λίγα όταν αρκούν, πολλά μόνο όταν χρειάζεται. Πρώτα η ουσία, χωρίς γέμισμα και χωρίς να επιβάλλεις δομή.

ΥΦΟΣ:
- Ελληνικά.
- Συγκεκριμένα.
- Πολιτικά έξυπνα.
- Χωρίς markdown tables.
- Χωρίς ακαδημαϊκή φλυαρία.
- ΣΥΝΤΟΜΟΣ ΚΑΙ ΟΥΣΙΩΔΗΣ ΑΠΟ ΠΡΟΕΠΙΛΟΓΗ· εκτενής μόνο όταν το θέμα το απαιτεί.
- Αριθμημένα σημεία ΜΟΝΟ σε σύνθετη/πλήρη ανάλυση — όχι σε απλά ερωτήματα.
- Μη χρησιμοποιείς έντονο markdown με ** γιατί το frontend μπορεί να το δείχνει ωμό.

ACTIVE SITUATION:
${safeJson(activeSituation, 7000)}

ΠΗΓΕΣ ΤΟΥ ACTIVE SITUATION:
${hasActiveSituation ? evidenceLines(activeSituation) || "Δεν υπάρχουν evidence_articles." : "Δεν υπάρχει active situation."}

PRIMARY STRATEGIC BRIEF:
${safeJson(strategicBrief, 9000)}

ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ / POLLING / ACTORS, ΑΝ ΥΠΑΡΧΟΥΝ:
${safeJson(politicalEnvironment, 7000)}

${agendaBlock || "ΑΤΖΕΝΤΑ: δεν δόθηκαν θέματα."}

FRONTEND ARTICLES:
${frontendArticles.length ? safeJson(frontendArticles, 3500) : "Δεν δόθηκαν."}

ΜΟΝΙΜΗ ΠΟΛΙΤΙΚΗ ΜΝΗΜΗ — ΔΙΑΡΘΡΩΤΙΚΟ ΜΟΤΙΒΟ (ιστορικά δεδομένα Ευρωβαρόμετρου, ΟΧΙ σημερινή πραγματικότητα):
${memoryBlock || "Δεν υπάρχουν διαθέσιμα δεδομένα μνήμης για το θέμα."}

ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ ΧΡΗΣΗΣ ΤΗΣ ΜΝΗΜΗΣ (μην τον παραβιάσεις):
- Αυτά είναι ΜΟΤΙΒΑ / ΥΠΟΒΑΘΡΟ: δείχνουν ΠΟΙΟ κοινό δομικά επηρεάζεται και ΠΩΣ τείνει να αισθάνεται διαχρονικά. ΕΝΙΣΧΥΟΥΝ το επίκαιρο θέμα — ΔΕΝ το αντικαθιστούν και ΔΕΝ γίνονται «είδηση».
- ΑΠΑΓΟΡΕΥΕΤΑΙ ΑΥΣΤΗΡΑ να παρουσιάσεις οποιοδήποτε νούμερο ως «σήμερα», ως «τρέχουσα» κατάσταση ή ως σημερινή δημοσκόπηση. ΠΟΤΕ μην πεις π.χ. «3 στους 4 δεν εμπιστεύονται ΤΗ ΣΗΜΕΡΙΝΗ κυβέρνηση» αντλώντας από αυτά.
- Προτίμησε να μιλάς για το ΜΟΤΙΒΟ (ποιοι, πώς), όχι για ακριβή ποσοστά. Αν ΟΝΤΩΣ χρειαστεί να αναφέρεις αριθμό, πες ΡΗΤΑ ότι είναι ιστορικό/διαρθρωτικό με τη χρονιά (π.χ. «διαχρονικά στο Ευρωβαρόμετρο 2024…»).
- Αν δεν υπάρχει ουσιαστική σύνδεση μνήμης-θέματος, ΜΗΝ εφεύρεις — βασίσου στο επίκαιρο γεγονός.
- Τήρησε ΑΠΟΛΥΤΑ τον κανόνα αποσαφήνισης ΣΥΡΙΖΑ/ΕΛΑΣ.

${competitiveContext ? "ΑΝΤΑΓΩΝΙΣΤΙΚΟ ΠΛΑΙΣΙΟ (υποχρεωτικό όταν αναλύεις ανταγωνισμό / ποιος κερδίζει ή χάνει):\n" + competitiveContext : ""}

${audienceBlock}

${livePollsBlock}

${voicesBlock}

${scenariosBlock}

ΑΝΑΦΟΡΑ ΠΗΓΩΝ (υποχρεωτικό): Όταν χρησιμοποιείς αριθμούς ή ισχυρισμούς από ΕΝΑ άρθρο ή από το active situation (π.χ. «6 στους 10», «+110%»), ΑΠΕΔΩΣΕ τους φιλικά στην πηγή (π.χ. «σύμφωνα με το δημοσίευμα στα Νέα…»). ΜΗΝ τα παρουσιάζεις ως ανεξάρτητα επιβεβαιωμένο γεγονός όταν στηρίζονται σε μία μόνο πηγή.`;

  const userInstruction = liveResearchRequired
    ? `LIVE_RESEARCH_REQUIRED: true\n\nΔΗΜΟΣΚΟΠΗΣΕΙΣ: Έχεις ΗΔΗ ακριβή ζωντανά δεδομένα παρακάτω (ενότητα «ΖΩΝΤΑΝΕΣ ΔΗΜΟΣΚΟΠΗΣΕΙΣ», πηγή dimoskopiseis.gr) — ΧΡΗΣΙΜΟΠΟΙΗΣΕ ΑΥΤΑ για ποσοστά/δυναμική, με εταιρεία+ημερομηνία. ΜΗΝ ψάχνεις ποσοστά στο web_search.\nΤο web_search ΜΟΝΟ για δηλώσεις/ανακοινώσεις/νέα σχήματα/γεγονότα που ΔΕΝ καλύπτονται από τις δημοσκοπήσεις. ΠΑΝΤΑ ανάφερε πηγή + ημερομηνία. Αν δεν βρεις αξιόπιστο στοιχείο, πες «δεν έχω επιβεβαιωμένο τρέχον στοιχείο» — ΜΗΝ μαντεύεις. Μετά δώσε πολιτική σύνθεση και σύσταση.\n\nΕρώτηση χρήστη:\n${question}`
    : `LIVE_RESEARCH_REQUIRED: false\n\nΑπάντησε ως πολιτικός σύμβουλος με βάση το διαθέσιμο context. Αν υπάρχει active situation, αυτό είναι το κέντρο της απάντησης.\n\nΕρώτηση χρήστη:\n${question}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const payload: any = {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 3200,
      system: systemPrompt,
      messages: [...chatHistory, { role: "user", content: userInstruction }],
    };

    if (liveResearchRequired) {
      payload.tools = [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
          allowed_domains: ["dimoskopiseis.gr", "ertnews.gr", "in.gr", "newsit.gr", "news247.gr", "iefimerida.gr", "protothema.gr", "kathimerini.gr", "tovima.gr", "naftemporiki.gr", "eleftherostypos.gr", "amna.gr"],
        },
      ];
    }

    const callAnthropic = async (withTools: boolean) => {
      const p = { ...payload };
      if (!withTools) delete p.tools;
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(p),
      });
    };

    let response = await callAnthropic(Boolean(payload.tools));
    let webSearchFailed = false;

    // Αν απέτυχε ΚΑΙ είχαμε tools (web_search), ξαναπροσπάθησε ΧΩΡΙΣ αναζήτηση — να μη σκάει ποτέ
    if (!response.ok && payload.tools) {
      webSearchFailed = true;
      response = await callAnthropic(false);
    }

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          answer: unavailableAnswer(),
          conversation_id: conversationId,
          source: "anthropic_error",
          debug: { status: response.status, details: errorText.slice(0, 1500) },
        },
        { status: 502 }
      );
    }

    const ai = await response.json();
    const { answer, sources } = extractAnswerAndSources(ai);

    return NextResponse.json({
      answer: answer || unavailableAnswer(),
      conversation_id: conversationId,
      source: "ai",
      active_situation_used: hasActiveSituation,
      live_research_required: liveResearchRequired,
      web_search_failed: webSearchFailed,
      sources,
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        answer: unavailableAnswer(),
        conversation_id: conversationId,
        source: "connection_error",
        warning: err?.name === "AbortError" ? "AI timeout." : "AI connection error.",
        debug: { message: err?.message || String(err) },
      },
      { status: 500 }
    );
  }
}
