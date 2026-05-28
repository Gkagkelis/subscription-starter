import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function detectAdvisorTopic(question: string) {
  const q = question.toLowerCase();

  if (q.includes("ακρίβ") || q.includes("κόστος ζωής") || q.includes("καλάθι") || q.includes("ρεύμα") || q.includes("ενοίκ")) {
    return "Ακρίβεια / κόστος ζωής";
  }

  if (q.includes("θεσμ") || q.includes("διαφάν") || q.includes("υποκλοπ") || q.includes("τέμπ") || q.includes("δικαιοσύνη")) {
    return "Θεσμοί / διαφάνεια";
  }

  if (q.includes("ελληνοτουρκ") || q.includes("τουρκ") || q.includes("εξωτερικ") || q.includes("άμυνα")) {
    return "Εξωτερική κρίση / ασφάλεια";
  }

  if (q.includes("υγεία") || q.includes("νοσοκομ") || q.includes("γιατρ") || q.includes("εσυ")) {
    return "Υγεία";
  }

  if (q.includes("παιδεία") || q.includes("σχολ") || q.includes("πανεπιστ")) {
    return "Παιδεία";
  }

  if (q.includes("τσιπρ") || q.includes("συριζ") || q.includes("καρυστιαν") || q.includes("νέο κόμμα") || q.includes("κομμα")) {
    return "Κομματικό σύστημα / αντιπολίτευση";
  }

  return "Γενική στρατηγική καθοδήγηση";
}

function detectAdvisorIntent(question: string) {
  const q = question.toLowerCase();

  if (q.includes("δήλωση") || q.includes("τι να πω") || q.includes("μήνυμα")) {
    return "message_request";
  }

  if (q.includes("τι κάνουμε") || q.includes("τι να κάνω") || q.includes("πλάνο") || q.includes("βήματα")) {
    return "action_plan_request";
  }

  if (q.includes("ρίσκο") || q.includes("κίνδυνος")) {
    return "risk_assessment";
  }

  if (q.includes("τι παίζει") || q.includes("top θέμα") || q.includes("επικαιρότητα") || q.includes("τώρα") || q.includes("σήμερα")) {
    return "live_political_reading";
  }

  return "strategic_advice";
}

function detectUserMood(question: string) {
  const q = question.toLowerCase();

  if (q.includes("χαμένος") || q.includes("πανικό") || q.includes("άγχος") || q.includes("δεν ξέρω")) {
    return "needs_reassurance";
  }

  if (q.includes("επείγον") || q.includes("τώρα") || q.includes("άμεσα") || q.includes("χθες")) {
    return "urgent";
  }

  return "focused";
}

function shouldUseLiveResearch(question: string) {
  const q = question.toLowerCase();

  const liveSignals = [
    "τώρα",
    "σήμερα",
    "χθες",
    "πριν λίγο",
    "μόλις",
    "τρέχον",
    "τρέχουσα",
    "επικαιρότητα",
    "τι παίζει",
    "top θέμα",
    "πρώτο θέμα",
    "νέα",
    "ειδήσεις",
    "ανακοίνωσε",
    "ανακοίνωση",
    "δήλωσε",
    "δήλωση",
    "στάση",
    "νέο κόμμα",
    "κόμμα του τσίπρα",
    "τσιπρ",
    "καρυστιαν",
    "συριζ",
    "πασοκ",
    "νδ",
    "δημοσκόπηση",
    "μέτρηση",
    "ποσοστά",
    "γκάλοπ",
    "media",
    "κανάλια",
    "εφημερίδες",
    "sites",
  ];

  return liveSignals.some((signal) => q.includes(signal));
}

function unavailableAnswer() {
  return `Δεν μπόρεσα να συνδεθώ αξιόπιστα με τον AI σύμβουλο αυτή τη στιγμή.

Δεν θα σου δώσω ψεύτικη πολιτική εκτίμηση.

Δοκίμασε ξανά σε λίγο. Αν το πρόβλημα συνεχιστεί, έλεγξε:
1. ANTHROPIC_API_KEY στο Vercel.
2. Αν το selected model είναι διαθέσιμο στο account.
3. Αν το web search είναι ενεργό στο Anthropic Console.
4. Τα Vercel Function logs για το πραγματικό error.`;
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

  return {
    answer,
    sources: sourceList,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    expects: {
      question: "string",
      conversation_id: "string | null",
      strategic_brief: "object",
      profile: "object | null",
      party: "string | null",
      articles: "array | null",
      political_environment: "object | null",
      political_environment_status: "string | null",
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
  const existingConversationId = body.conversation_id || null;
  const strategicBrief = body.strategic_brief || body.strategicBrief || null;
  const profile = body.profile || null;
  const party = cleanText(body.party || profile?.party_name || "", 200);
  const articles = Array.isArray(body.articles) ? body.articles.slice(0, 8) : [];

  if (!question) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authClient = supabaseUrl && serviceRoleKey ? await createAuthClient() : null;
  const serviceClient = supabaseUrl && serviceRoleKey ? createServiceClient(supabaseUrl, serviceRoleKey) : null;

  const topicDetected = detectAdvisorTopic(question);
  const intentDetected = detectAdvisorIntent(question);
  const userMood = detectUserMood(question);
  const liveResearchRequired = shouldUseLiveResearch(question);

  let registeredProfile = profile;
  let registeredPartyKey = profile?.party_key || "";
  let registeredPartyName = party;
  let registeredOrganizationName = profile?.org_name || "";
  let userId: string | null = null;
  let organizationId: string | null = null;

  let politicalEnvironment: any = body.political_environment || null;
  let politicalEnvironmentStatus = cleanText(body.political_environment_status || "", 500);
  let agendaSignals: any[] = [];

  if (authClient && serviceClient) {
    try {
      const {
        data: { user },
      } = await authClient.auth.getUser();

      userId = user?.id || null;

      if (userId) {
        const { data: orgData } = await serviceClient
          .from("organizations")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (orgData) {
          registeredProfile = orgData;
          organizationId = orgData.id || null;
          registeredPartyKey = orgData.party_key || registeredPartyKey || "";
          registeredOrganizationName = orgData.org_name || orgData.name || registeredOrganizationName || "";
        }
      }

      if (registeredPartyKey) {
        const { data: partyProfile } = await serviceClient
          .from("political_party_profiles")
          .select("*")
          .eq("party_key", registeredPartyKey)
          .maybeSingle();

        if (partyProfile) {
          registeredPartyName = partyProfile.party_name || partyProfile.short_name || registeredPartyKey;
          registeredProfile = {
            ...(registeredProfile || {}),
            party_profile_snapshot: partyProfile,
            party_key: registeredPartyKey,
          };
        }
      }

      if (!politicalEnvironment) {
        const { data: environmentData, error: environmentError } = await serviceClient
          .from("v_advisor_political_environment")
          .select("*")
          .maybeSingle();

        politicalEnvironment = environmentData || null;
        politicalEnvironmentStatus = environmentError
          ? `Error: ${environmentError.message}`
          : environmentData
            ? "Loaded."
            : "No data.";
      }

      const { data: agendaData } = await serviceClient
        .from("v_advisor_agenda_briefs_recent")
        .select(
          "topic, article_count, source_count, political_articles, agenda_score, documentation_level, political_risk_level, framing_summary, recommended_action, avoid_action, top_sources, top_evidence_articles, evidence_summary"
        )
        .ilike("topic", `%${topicDetected.split("/")[0].trim()}%`)
        .order("agenda_score", { ascending: false })
        .limit(5);

      agendaSignals = Array.isArray(agendaData) ? agendaData : [];
    } catch (err) {
      console.error("Supabase context load failed:", err);
    }
  }

  let conversationId = existingConversationId;
  let previousMessages: Array<{ role: string; content: string }> = [];

  if (serviceClient) {
    try {
      if (conversationId) {
        const { data: historyData } = await serviceClient
          .from("advisor_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(30);

        if (Array.isArray(historyData) && historyData.length > 0) {
          previousMessages = historyData
            .filter((m: any) => m.role === "user" || m.role === "assistant")
            .map((m: any) => ({
              role: m.role,
              content: m.role === "user" ? String(m.content || "").slice(0, 2200) : String(m.content || "").slice(0, 3500),
            }));
        }
      } else {
        const { data: conversation } = await serviceClient
          .from("advisor_conversations")
          .insert({
            user_id: userId,
            organization_id: organizationId,
            party_key: registeredPartyKey || null,
            party_name: registeredPartyName || null,
            organization_name: registeredOrganizationName || null,
            title: question.slice(0, 90),
            topic_detected: topicDetected,
            intent_detected: intentDetected,
            user_mood: userMood,
            metadata: {
              source: "strategy-room-chat",
              political_environment_status: politicalEnvironmentStatus,
              live_research_required: liveResearchRequired,
            },
          })
          .select("id")
          .single();

        conversationId = conversation?.id || null;
      }

      if (conversationId) {
        await serviceClient.from("advisor_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: question,
          topic_detected: topicDetected,
          intent_detected: intentDetected,
          user_mood: userMood,
          source: "user",
          input_context: {
            registered_party_key: registeredPartyKey,
            registered_party_name: registeredPartyName,
            organization_name: registeredOrganizationName,
            live_research_required: liveResearchRequired,
          },
        });
      }
    } catch (err) {
      console.error("Conversation save/load failed:", err);
    }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json(
      {
        answer: unavailableAnswer(),
        conversation_id: conversationId,
        source: "configuration_error",
      },
      { status: 500 }
    );
  }

  const athensNow = new Date().toLocaleString("el-GR", {
    timeZone: "Europe/Athens",
    dateStyle: "full",
    timeStyle: "short",
  });

  const systemPrompt = `
Είσαι ο Noraya, AI Political Strategy Advisor.

Μιλάς σαν εξαιρετικός πολιτικός σύμβουλος μέσα σε επιτελείο.
Δεν είσαι απλό chatbot.
Δεν είσαι news dashboard.
Δεν είσαι γενικόλογος αναλυτής.

Ημερομηνία/ώρα Ελλάδας τώρα:
${athensNow}

ΚΟΜΜΑ / ΟΡΓΑΝΙΣΜΟΣ ΧΡΗΣΤΗ:
${registeredPartyName || registeredPartyKey || "Δεν έχει οριστεί"}

ΚΡΙΣΙΜΟ — LIVE ΠΟΛΙΤΙΚΗ ΝΟΗΜΟΣΥΝΗ:
Αν η ερώτηση αφορά σημερινή ή πρόσφατη επικαιρότητα, στάση προσώπου/κόμματος, νέο κόμμα, δημοσκόπηση, δήλωση, τι "παίζει τώρα", ή κάτι που μπορεί να άλλαξε τις τελευταίες μέρες, ΠΡΕΠΕΙ πρώτα να χρησιμοποιήσεις web_search.
Μη βασίζεσαι στη μνήμη σου για πρόσφατα γεγονότα.
Αν δεν βρεις καθαρή επιβεβαίωση, πες το καθαρά.

ΚΡΙΣΙΜΟ — ΜΗΝ ΠΕΤΑΣ ΤΗΝ ΜΠΑΛΑ ΣΤΟΝ ΧΡΗΣΤΗ:
Αν ο χρήστης ρωτήσει αόριστα, δεν απαντάς "χρειάζομαι περισσότερο context" ως κύρια απάντηση.
Πρώτα δίνεις χρήσιμη προκαταρκτική σύσταση με λογικές υποθέσεις.
Μετά, στο τέλος, κάνεις μία σύντομη διευκρινιστική ερώτηση αν χρειάζεται.

Παράδειγμα:
Αν ο χρήστης πει "τι κάνω με τον ΣΥΡΙΖΑ", απαντάς με υπόθεση:
"Με την υπόθεση ότι μιλάμε για δημόσια στάση απέναντι στον ΣΥΡΙΖΑ..."
και δίνεις κανονική σύσταση.

ΚΡΙΣΙΜΟ — ΣΥΝΕΧΕΙΑ ΚΟΥΒΕΝΤΑΣ:
Αυτή είναι συνεχής συζήτηση.
Χρησιμοποιείς το ιστορικό.
Αν ο χρήστης αναφέρεται σε "αυτό", "εκείνο", "όπως πριν", συνδέεις με τα προηγούμενα.

FORMAT ΑΠΑΝΤΗΣΗΣ:
Συνήθως απαντάς έτσι:

1. Καθαρή σύσταση
2. Γιατί
3. Τι σημαίνει για ${registeredPartyName || registeredPartyKey || "το κόμμα"}
4. 3 κινήσεις τώρα
5. Δημόσια γραμμή
6. Τι να αποφύγουμε

Αν η ερώτηση είναι ερευνητική/επίκαιρη:
1. Τι βρήκα
2. Πόσο βέβαιο είναι
3. Πολιτική ανάγνωση
4. Τι σημαίνει για ${registeredPartyName || registeredPartyKey || "το κόμμα"}
5. Σύσταση
6. Πηγές/τεκμηρίωση, αν υπάρχουν

ΥΦΟΣ:
- Ελληνικά.
- Καθαρά.
- Συγκεκριμένα.
- Πολιτικά έξυπνα.
- Χωρίς ακαδημαϊκή φλυαρία.
- Χωρίς γενικόλογα.
- Χωρίς "κινηθείτε θεσμικά" αν δεν εξηγείς ακριβώς τι σημαίνει πρακτικά.
- Χωρίς markdown tables.
- Μπορείς να χρησιμοποιείς απλή δομή με αριθμημένα σημεία.
- Μη χρησιμοποιείς **bold markdown**, γιατί το frontend μπορεί να το δείχνει ωμό.

ΚΑΝΟΝΕΣ:
- Μην εφευρίσκεις γεγονότα ή δημοσκοπήσεις.
- Ποσοστά μόνο αν υπάρχουν στα δεδομένα ή σε πηγή που βρήκες.
- Όταν κάνεις υπόθεση, δήλωσέ την.
- Πάντα κατάληγε σε σύσταση.
- Αν ζητηθεί μήνυμα, γράψε μήνυμα.
- Αν ζητηθεί σενάριο, σύγκρινε σενάρια.
- Αν ζητηθεί πλάνο, δώσε πλάνο δράσης.

STRATEGIC BRIEF:
${safeJson(strategicBrief, 9000)}

ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ:
${safeJson(politicalEnvironment, 7000)}

AGENDA SIGNALS:
${agendaSignals.length ? safeJson(agendaSignals, 5000) : "Δεν βρέθηκαν."}

ARTICLES ΑΠΟ FRONTEND:
${articles.length ? safeJson(articles, 3500) : "Δεν δόθηκαν."}
`;

  const aiMessages: Array<{ role: string; content: string }> = [];

  for (const msg of previousMessages) {
    aiMessages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const userInstruction = liveResearchRequired
    ? `LIVE_RESEARCH_REQUIRED: true

Πριν απαντήσεις, χρησιμοποίησε web_search για να ελέγξεις την τρέχουσα πραγματικότητα.
Μετά δώσε πολιτική σύνθεση και σύσταση για το κόμμα/οργανισμό του χρήστη.

Ερώτηση χρήστη:
${question}`
    : `LIVE_RESEARCH_REQUIRED: false

Απάντησε ως πολιτικός σύμβουλος. Αν χρειάζεται φρέσκια πληροφορία, χρησιμοποίησε web_search.

Ερώτηση χρήστη:
${question}`;

  aiMessages.push({
    role: "user",
    content: userInstruction,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 2800,
        system: systemPrompt,
        messages: aiMessages,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: liveResearchRequired ? 5 : 2,
            user_location: {
              type: "approximate",
              city: "Athens",
              region: "Attica",
              country: "GR",
              timezone: "Europe/Athens",
            },
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Anthropic API error:", {
        status: response.status,
        body: errorText,
      });

      return NextResponse.json(
        {
          answer: unavailableAnswer(),
          conversation_id: conversationId,
          source: "anthropic_error",
          debug: {
            status: response.status,
            details: errorText.slice(0, 1500),
          },
        },
        { status: 502 }
      );
    }

    const ai = await response.json();
    const { answer, sources } = extractAnswerAndSources(ai);

    const finalAnswer = answer || unavailableAnswer();

    if (serviceClient && conversationId) {
      try {
        await serviceClient.from("advisor_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: finalAnswer,
          topic_detected: topicDetected,
          intent_detected: intentDetected,
          user_mood: userMood,
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          source: "ai",
          input_context: {
            registered_party_key: registeredPartyKey,
            registered_party_name: registeredPartyName,
            organization_name: registeredOrganizationName,
            live_research_required: liveResearchRequired,
            sources,
          },
          token_usage: ai.usage || null,
        });

        await serviceClient
          .from("advisor_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      } catch (err) {
        console.error("Assistant message save failed:", err);
      }
    }

    return NextResponse.json({
      answer: finalAnswer,
      conversation_id: conversationId,
      source: "ai",
      live_research_required: liveResearchRequired,
      sources,
      usage: ai.usage || null,
    });
  } catch (err: any) {
    console.error("Strategy chat failed:", err);

    return NextResponse.json(
      {
        answer: unavailableAnswer(),
        conversation_id: conversationId,
        source: "connection_error",
        warning: err?.name === "AbortError" ? "AI timeout." : "AI connection error.",
        debug: {
          message: err?.message || String(err),
        },
      },
      { status: 500 }
    );
  }
}
