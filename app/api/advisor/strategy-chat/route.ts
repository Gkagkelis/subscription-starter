import { NextResponse } from "next/server";
import { getMemoryBlock } from "@/lib/noraya/political-memory";
import { buildCompetitiveContext } from "@/lib/noraya/competitive-memory";

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    expects: {
      question: "string",
      conversation_id: "string | null",
      active_situation: "object | null",
      strategic_brief: "object | null",
      profile: "object | null",
      political_environment: "object | null",
    },
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
  const frontendArticles = Array.isArray(body.articles) ? body.articles.slice(0, 8) : [];
  const hasActiveSituation = Boolean(activeSituation?.id || activeSituation?.title || activeSituation?.topic);

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

AGENDA SIGNALS:
${agendaUsed.length ? safeJson(agendaUsed, 5000) : "Δεν δόθηκαν."}

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

ΑΝΑΦΟΡΑ ΠΗΓΩΝ (υποχρεωτικό): Όταν χρησιμοποιείς αριθμούς ή ισχυρισμούς από ΕΝΑ άρθρο ή από το active situation (π.χ. «6 στους 10», «+110%»), ΑΠΕΔΩΣΕ τους φιλικά στην πηγή (π.χ. «σύμφωνα με το δημοσίευμα στα Νέα…»). ΜΗΝ τα παρουσιάζεις ως ανεξάρτητα επιβεβαιωμένο γεγονός όταν στηρίζονται σε μία μόνο πηγή.`;

  const userInstruction = liveResearchRequired
    ? `LIVE_RESEARCH_REQUIRED: true\n\nΠριν απαντήσεις, χρησιμοποίησε web_search για την ΤΡΕΧΟΥΣΑ εικόνα (δημοσκοπήσεις, δυναμική, ανταγωνισμός, νέα σχήματα).\nΠΗΓΕΣ — εμπιστεύσου ΜΟΝΟ: dimoskopiseis.gr (δημοσκοπήσεις/ποσοστά/δυναμική) και πρακτορεία (ΑΠΕ-ΜΠΕ/amna.gr, Reuters).\nΠΑΝΤΑ ανάφερε πηγή + ημερομηνία. Αν δεν βρεις αξιόπιστο τρέχον στοιχείο, πες «δεν έχω επιβεβαιωμένο τρέχον στοιχείο» — ΜΗΝ μαντεύεις και ΜΗΝ δίνεις ποσοστά/δυναμική από μνήμη. Μετά δώσε πολιτική σύνθεση και σύσταση.\n\nΕρώτηση χρήστη:\n${question}`
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
          allowed_domains: ["dimoskopiseis.gr", "amna.gr", "reuters.com"],
        },
      ];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

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
