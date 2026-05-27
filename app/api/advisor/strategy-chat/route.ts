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

  if (
    q.includes("ακρίβ") ||
    q.includes("κόστος ζωής") ||
    q.includes("καλάθι") ||
    q.includes("σούπερ") ||
    q.includes("ρεύμα") ||
    q.includes("ενοίκ")
  ) {
    return "Ακρίβεια / κόστος ζωής";
  }

  if (
    q.includes("θεσμ") ||
    q.includes("διαφάν") ||
    q.includes("υποκλοπ") ||
    q.includes("τέμπ") ||
    q.includes("δικαιοσύνη") ||
    q.includes("λογοδοσία")
  ) {
    return "Θεσμοί / διαφάνεια";
  }

  if (
    q.includes("ελληνοτουρκ") ||
    q.includes("τουρκ") ||
    q.includes("εξωτερικ") ||
    q.includes("κρίση") ||
    q.includes("άμυνα")
  ) {
    return "Εξωτερική κρίση / ασφάλεια";
  }

  if (
    q.includes("υγεία") ||
    q.includes("νοσοκομ") ||
    q.includes("γιατρ") ||
    q.includes("εσυ")
  ) {
    return "Υγεία";
  }

  if (
    q.includes("παιδεία") ||
    q.includes("σχολ") ||
    q.includes("πανεπιστ")
  ) {
    return "Παιδεία";
  }

  return "Γενική στρατηγική καθοδήγηση";
}

function detectAdvisorIntent(question: string) {
  const q = question.toLowerCase();

  if (q.includes("δήλωση") || q.includes("τι να πω") || q.includes("μήνυμα")) {
    return "message_request";
  }

  if (q.includes("τι κάνουμε") || q.includes("πλάνο") || q.includes("βήματα")) {
    return "action_plan_request";
  }

  if (q.includes("χαμένος") || q.includes("δεν ξέρω") || q.includes("μπερδε")) {
    return "guidance_request";
  }

  if (q.includes("ρίσκο") || q.includes("κίνδυνος")) {
    return "risk_assessment";
  }

  return "strategic_advice";
}

function detectUserMood(question: string) {
  const q = question.toLowerCase();

  if (q.includes("χαμένος") || q.includes("πανικό") || q.includes("άγχος")) {
    return "needs_reassurance";
  }

  if (q.includes("επείγον") || q.includes("τώρα") || q.includes("άμεσα")) {
    return "urgent";
  }

  return "focused";
}

function fallbackAnswer(question: string) {
  return `
Η ασφαλής στρατηγική απάντηση αυτή τη στιγμή είναι να κινηθείτε θεσμικά, με καθαρό μήνυμα και χωρίς υπερβολική βεβαιότητα.

Για την ερώτηση: «${question || "—"}»

Προτείνεται:
1. Κρατήστε χαμηλό αλλά καθαρό τόνο.
2. Μη μετατρέψετε το θέμα σε προσωπική επίθεση.
3. Συνδέστε τη θέση σας με αρχές: τεκμηρίωση, διαφάνεια, ευθύνη.
4. Αφήστε χώρο για κλιμάκωση αν το θέμα ανέβει περισσότερο.

Ασφαλής δημόσια γραμμή:
«Χρειάζονται καθαρές απαντήσεις, θεσμική σοβαρότητα και τεκμηρίωση. Οι πολίτες δεν χρειάζονται θόρυβο, χρειάζονται ευθύνη.»

Σημείωση: Αυτή είναι fallback απάντηση επειδή ο AI advisor δεν μπόρεσε να ολοκληρώσει πλήρη απάντηση.
`.trim();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    expects: {
      question: "string",
      strategic_brief: "object",
      profile: "object | null",
      party: "string | null",
      articles: "array | null",
    },
  });
}

export async function POST(req: Request) {
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const question = cleanText(body.question, 2000);
  const strategicBrief = body.strategic_brief || body.strategicBrief || null;
  const profile = body.profile || null;
  const party = cleanText(
    body.party || profile?.party_name || profile?.organization_type || "",
    200
  );
  const articles = Array.isArray(body.articles) ? body.articles.slice(0, 8) : [];

  if (!question) {
    return NextResponse.json(
      { error: "Missing question." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authClient =
    supabaseUrl && serviceRoleKey ? await createAuthClient() : null;

  const serviceClient =
    supabaseUrl && serviceRoleKey
      ? createServiceClient(supabaseUrl, serviceRoleKey)
      : null;

  const topicDetected = detectAdvisorTopic(question);
  const intentDetected = detectAdvisorIntent(question);
  const userMood = detectUserMood(question);

  let registeredProfile = profile;
  let registeredPartyKey = profile?.party_key || "";
  let registeredPartyName = party;
  let registeredOrganizationName =
    profile?.org_name || profile?.organization_name || "";

  let userId: string | null = null;
  let organizationId: string | null = null;
  let politicalEnvironment: any =
    body.political_environment || body.politicalEnvironment || null;
  let politicalEnvironmentStatus = cleanText(
    body.political_environment_status || body.politicalEnvironmentStatus || "",
    500
  );
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
          registeredOrganizationName =
            orgData.org_name ||
            orgData.organization_name ||
            orgData.name ||
            registeredOrganizationName ||
            "";
        }
      }

      if (registeredPartyKey) {
        const { data: partyProfile } = await serviceClient
          .from("political_party_profiles")
          .select("*")
          .eq("party_key", registeredPartyKey)
          .maybeSingle();

        if (partyProfile) {
          registeredPartyName =
            partyProfile.party_name ||
            partyProfile.short_name ||
            registeredPartyKey;

          registeredProfile = {
            ...(registeredProfile || {}),
            party_profile_snapshot: partyProfile,
            party_key: registeredPartyKey,
          };
        }
      }

      if (!politicalEnvironment) {
        const { data: environmentData, error: environmentError } =
          await serviceClient
            .from("v_advisor_political_environment")
            .select("*")
            .maybeSingle();

        politicalEnvironment = environmentData || null;
        politicalEnvironmentStatus = environmentError
          ? `Δεν φορτώθηκε political environment: ${environmentError.message}`
          : environmentData
            ? "Το political environment φορτώθηκε από τη βάση."
            : "Δεν υπάρχει political environment στη βάση.";
      }

      const { data: agendaData } = await serviceClient
        .from("v_advisor_agenda_briefs_recent")
        .select(
          `
          topic,
          article_count,
          source_count,
          political_articles,
          agenda_score,
          documentation_level,
          political_risk_level,
          framing_summary,
          recommended_action,
          avoid_action,
          top_sources,
          top_evidence_articles,
          evidence_summary
          `
        )
        .ilike("topic", `%${topicDetected.split("/")[0].trim()}%`)
        .order("agenda_score", { ascending: false })
        .limit(5);

      agendaSignals = Array.isArray(agendaData) ? agendaData : [];
    } catch {
      // Αν κάτι αποτύχει, δεν σπάμε το chat. Συνεχίζουμε με context από frontend.
    }
  }

  let conversationId: string | null = null;
  let userMessageId: string | null = null;

  if (serviceClient) {
    try {
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
          },
        })
        .select("id")
        .single();

      conversationId = conversation?.id || null;

      if (conversationId) {
        const { data: userMessage } = await serviceClient
          .from("advisor_messages")
          .insert({
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
            },
          })
          .select("id")
          .single();

        userMessageId = userMessage?.id || null;
      }
    } catch {
      // Δεν σταματάμε την απάντηση αν η αποθήκευση αποτύχει.
    }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json({
      answer: fallbackAnswer(question),
      source: "fallback",
      warning: "Missing ANTHROPIC_API_KEY.",
    });
  }

  const systemPrompt = `
Είσαι ο Noraya, AI Political Strategy Advisor.

Δεν είσαι γενικό chatbot.
Δεν είσαι news dashboard.
Δεν απαντάς με raw metrics.
Δεν λες τεχνικά σφάλματα στον τελικό χρήστη.

Δεν μιλάς σαν ρομπότ.
Μιλάς σαν πολιτικός σύμβουλος μέσα σε επιτελείο.

Αν ο χρήστης δείχνει χαμένος, πιεσμένος ή μπερδεμένος:
- ξεκίνα ανθρώπινα και πρακτικά,
- πες «πάμε πρακτικά» ή αντίστοιχη φυσική φράση,
- δώσε πρώτα καθαρή σύσταση,
- μετά εξήγησε γιατί,
- μετά δώσε 3 κινήσεις,
- στο τέλος δώσε δημόσια γραμμή ή φράση.

Πάντα απαντάς για το κόμμα/οργανισμό που είναι εγγεγραμμένος στο προφίλ, όχι γενικά.

Απαντάς σαν έμπειρος πολιτικός σύμβουλος στρατηγικής.

Χρησιμοποιείς το διαθέσιμο Strategy Brief ως context.
Απαντάς με βάση:
- το θέμα,
- τη διάγνωση,
- τα σενάρια,
- το message package,
- το action plan,
- το προφίλ και το κόμμα του χρήστη.

ΚΡΙΣΙΜΟ: Η απάντησή σου αλλάζει ανάλογα με το κόμμα.
- Αν είναι κυβερνητικό κόμμα: υπερασπίζεσαι θεσμική σοβαρότητα, αποφεύγεις επίθεση.
- Αν είναι αντιπολίτευση: αναδεικνύεις ευκαιρίες κριτικής, χωρίς υπερβολή.
- Αν είναι τοπικός φορέας/δήμαρχος: εστιάζεις σε τοπική επίδραση και πολίτες.
Πάντα με βάση τα πραγματικά δεδομένα που έχεις.

Κανόνες:
- Μην εφευρίσκεις γεγονότα.
- Μην εφευρίσκεις δημοσκοπήσεις.
- Μπορείς να αναφέρεις ποσοστά μόνο αν υπάρχουν στο Strategy Brief ή στο πολιτικό / δημοσκοπικό περιβάλλον.
- Αν υπάρχουν πολλές δημοσκοπήσεις, μη βασίζεσαι σε μία ως απόλυτη αλήθεια. Μίλα για τάση, πίεση, ευκαιρία ή ρίσκο.
- Μην κάνεις γενική πολιτική ανάλυση. Πάντα να λες τι σημαίνει για το εγγεγραμμένο κόμμα/οργανισμό.
- Μη χρησιμοποιείς τεχνικούς όρους όπως fragmentation. Πες απλά: «η αντιπολίτευση είναι κομμένη σε πολλά κέντρα».
- Μην παρουσιάζεις βεβαιότητα όταν δεν υπάρχει.
- Δώσε πρακτική πολιτική συμβουλή.
- Αν ζητηθεί μήνυμα, γράψε μήνυμα.
- Αν ζητηθεί σενάριο, σύγκρινε σενάρια.
- Αν ζητηθεί πλάνο, δώσε πλάνο δράσης.
- Αν υπάρχει ρίσκο, πες το καθαρά.
- Πάντα να καταλήγεις σε σύσταση.

Γλώσσα:
- Ελληνικά.
- Καθαρά.
- Σοβαρά.
- Χωρίς ακαδημαϊκή φλυαρία.
- Σαν σύμβουλος μέσα σε πολιτικό επιτελείο.
`;

  const userPrompt = `
ΠΡΟΦΙΛ ΕΓΓΕΓΡΑΜΜΕΝΟΥ ΟΡΓΑΝΙΣΜΟΥ
${safeJson(registeredProfile, 5000)}

ΕΓΓΕΓΡΑΜΜΕΝΟ ΚΟΜΜΑ / ΟΡΓΑΝΙΣΜΟΣ
${registeredPartyName || registeredPartyKey || registeredOrganizationName || "Δεν έχει οριστεί"}

STRATEGY BRIEF
${safeJson(strategicBrief, 12000)}

ΠΟΛΙΤΙΚΟ / ΔΗΜΟΣΚΟΠΙΚΟ ΠΕΡΙΒΑΛΛΟΝ
Status:
${politicalEnvironmentStatus || "Δεν έχει δοθεί status."}

Data:
${safeJson(politicalEnvironment, 10000)}

ΣΧΕΤΙΚΑ AGENDA SIGNALS ΓΙΑ ΤΗΝ ΕΡΩΤΗΣΗ
${agendaSignals.length ? safeJson(agendaSignals, 8000) : "Δεν βρέθηκαν ειδικά agenda signals για αυτό το θέμα."}

ΑΡΘΡΑ ΒΑΣΗΣ (έως 8)
${
  articles.length > 0
    ? articles
        .map(
          (a: any, i: number) =>
            `${i + 1}. [${a.source || ""}] ${a.title || ""}`
        )
        .join("\n")
    : "Δεν υπάρχουν άρθρα."
}

ΕΡΩΤΗΣΗ ΧΡΗΣΤΗ
${question}

Απάντησε ως Noraya Political Strategy Advisor.
Μην αναφέρεις JSON, fallback, API, model ή τεχνικές λεπτομέρειες.
Δώσε χρήσιμη πολιτική απάντηση.
`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        answer: fallbackAnswer(question),
        source: "fallback",
        warning: "AI advisor returned non-OK response.",
      });
    }

    const ai = await response.json();

    const answer =
      ai.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n")
        .trim() || fallbackAnswer(question);

    if (serviceClient && conversationId) {
      try {
        const { data: assistantMessage } = await serviceClient
          .from("advisor_messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: answer,
            topic_detected: topicDetected,
            intent_detected: intentDetected,
            user_mood: userMood,
            model: "claude-sonnet-4-6",
            source: "ai",
            input_context: {
              registered_party_key: registeredPartyKey,
              registered_party_name: registeredPartyName,
              organization_name: registeredOrganizationName,
              strategy_brief: strategicBrief,
              political_environment_status: politicalEnvironmentStatus,
            },
            used_political_environment_id:
              politicalEnvironment?.snapshot_id || null,
            used_agenda_signals: agendaSignals,
            used_polling_context: politicalEnvironment || {},
            token_usage: ai.usage || null,
          })
          .select("id")
          .single();

        const assistantMessageId = assistantMessage?.id || null;

        if (assistantMessageId) {
          await serviceClient.from("advisor_message_sources").insert([
            {
              message_id: assistantMessageId,
              conversation_id: conversationId,
              source_type: "political_environment",
              title:
                politicalEnvironment?.title || "Political environment snapshot",
              source_name: "Noraya",
              relevance_note:
                "Used as political/polling context for advisor answer.",
              metadata: politicalEnvironment || {},
            },
            ...agendaSignals.slice(0, 5).map((signal: any) => ({
              message_id: assistantMessageId,
              conversation_id: conversationId,
              source_type: "agenda_article",
              title: signal.topic || "Agenda signal",
              source_name: "Noraya agenda",
              snippet: signal.evidence_summary || signal.framing_summary || null,
              relevance_note: "Used as topic-specific agenda context.",
              metadata: signal,
            })),
          ]);
        }

        await serviceClient
          .from("advisor_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      } catch {
        // Δεν χαλάμε την απάντηση αν αποτύχει το save.
      }
    }

    return NextResponse.json({
      answer,
      conversation_id: conversationId,
      user_message_id: userMessageId,
      source: "ai",
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      answer: fallbackAnswer(question),
      source: "fallback",
      warning:
        err?.name === "AbortError"
          ? "AI timeout."
          : "AI connection error.",
    });
  }
}
