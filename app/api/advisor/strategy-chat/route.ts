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
  if (q.includes("ακρίβ") || q.includes("κόστος ζωής") || q.includes("καλάθι") || q.includes("ρεύμα") || q.includes("ενοίκ")) return "Ακρίβεια / κόστος ζωής";
  if (q.includes("θεσμ") || q.includes("διαφάν") || q.includes("υποκλοπ") || q.includes("τέμπ") || q.includes("δικαιοσύνη")) return "Θεσμοί / διαφάνεια";
  if (q.includes("ελληνοτουρκ") || q.includes("τουρκ") || q.includes("εξωτερικ") || q.includes("άμυνα")) return "Εξωτερική κρίση / ασφάλεια";
  if (q.includes("υγεία") || q.includes("νοσοκομ") || q.includes("γιατρ") || q.includes("εσυ")) return "Υγεία";
  if (q.includes("παιδεία") || q.includes("σχολ") || q.includes("πανεπιστ")) return "Παιδεία";
  return "Γενική στρατηγική καθοδήγηση";
}
 
function detectAdvisorIntent(question: string) {
  const q = question.toLowerCase();
  if (q.includes("δήλωση") || q.includes("τι να πω") || q.includes("μήνυμα")) return "message_request";
  if (q.includes("τι κάνουμε") || q.includes("πλάνο") || q.includes("βήματα")) return "action_plan_request";
  if (q.includes("ρίσκο") || q.includes("κίνδυνος")) return "risk_assessment";
  return "strategic_advice";
}
 
function detectUserMood(question: string) {
  const q = question.toLowerCase();
  if (q.includes("χαμένος") || q.includes("πανικό") || q.includes("άγχος")) return "needs_reassurance";
  if (q.includes("επείγον") || q.includes("τώρα") || q.includes("άμεσα")) return "urgent";
  return "focused";
}
 
function fallbackAnswer(question: string) {
  return `Η ασφαλής στρατηγική απάντηση αυτή τη στιγμή είναι να κινηθείτε θεσμικά, με καθαρό μήνυμα και χωρίς υπερβολική βεβαιότητα.
 
Προτείνεται:
1. Κρατήστε χαμηλό αλλά καθαρό τόνο.
2. Μη μετατρέψετε το θέμα σε προσωπική επίθεση.
3. Συνδέστε τη θέση σας με αρχές: τεκμηρίωση, διαφάνεια, ευθύνη.
 
Σημείωση: Αυτή είναι fallback απάντηση.`;
}
 
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/advisor/strategy-chat",
    method: "POST",
    expects: {
      question: "string",
      conversation_id: "string | null (to continue existing conversation)",
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
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
 
  const question = cleanText(body.question, 2000);
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
 
  let registeredProfile = profile;
  let registeredPartyKey = profile?.party_key || "";
  let registeredPartyName = party;
  let registeredOrganizationName = profile?.org_name || "";
  let userId: string | null = null;
  let organizationId: string | null = null;
  let politicalEnvironment: any = body.political_environment || null;
  let politicalEnvironmentStatus = cleanText(body.political_environment_status || "", 500);
  let agendaSignals: any[] = [];
 
  // --- Load user profile and political context from DB ---
  if (authClient && serviceClient) {
    try {
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id || null;
 
      if (userId) {
        const { data: orgData } = await serviceClient.from("organizations").select("*").eq("user_id", userId).maybeSingle();
        if (orgData) {
          registeredProfile = orgData;
          organizationId = orgData.id || null;
          registeredPartyKey = orgData.party_key || registeredPartyKey || "";
          registeredOrganizationName = orgData.org_name || orgData.name || registeredOrganizationName || "";
        }
      }
 
      if (registeredPartyKey) {
        const { data: partyProfile } = await serviceClient.from("political_party_profiles").select("*").eq("party_key", registeredPartyKey).maybeSingle();
        if (partyProfile) {
          registeredPartyName = partyProfile.party_name || partyProfile.short_name || registeredPartyKey;
          registeredProfile = { ...(registeredProfile || {}), party_profile_snapshot: partyProfile, party_key: registeredPartyKey };
        }
      }
 
      if (!politicalEnvironment) {
        const { data: environmentData, error: environmentError } = await serviceClient.from("v_advisor_political_environment").select("*").maybeSingle();
        politicalEnvironment = environmentData || null;
        politicalEnvironmentStatus = environmentError ? `Error: ${environmentError.message}` : environmentData ? "Loaded." : "No data.";
      }
 
      const { data: agendaData } = await serviceClient.from("v_advisor_agenda_briefs_recent")
        .select("topic, article_count, source_count, political_articles, agenda_score, documentation_level, political_risk_level, framing_summary, recommended_action, avoid_action, top_sources, top_evidence_articles, evidence_summary")
        .ilike("topic", `%${topicDetected.split("/")[0].trim()}%`)
        .order("agenda_score", { ascending: false })
        .limit(5);
      agendaSignals = Array.isArray(agendaData) ? agendaData : [];
    } catch { /* continue without DB data */ }
  }
 
  // --- Load or create conversation ---
  let conversationId = existingConversationId;
  let previousMessages: Array<{ role: string; content: string }> = [];
 
  if (serviceClient) {
    try {
      // If continuing existing conversation, load history
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
              content: m.role === "user" ? m.content.slice(0, 2000) : m.content.slice(0, 3000),
            }));
        }
      } else {
        // Create new conversation
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
            metadata: { source: "strategy-room-chat", political_environment_status: politicalEnvironmentStatus },
          })
          .select("id")
          .single();
        conversationId = conversation?.id || null;
      }
 
      // Save user message
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
          },
        });
      }
    } catch { /* don't break the chat if save fails */ }
  }
 
  // --- Build messages for AI ---
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ answer: fallbackAnswer(question), conversation_id: conversationId, source: "fallback" });
  }
 
  const systemPrompt = `
Είσαι ο Noraya, AI Political Strategy Advisor.
 
Μιλάς σαν πολιτικός σύμβουλος μέσα σε επιτελείο. Δεν είσαι chatbot, δεν είσαι news dashboard.
 
ΚΡΙΣΙΜΟ — ΣΥΝΕΧΕΙΑ ΚΟΥΒΕΝΤΑΣ:
Αυτή είναι συνεχής συζήτηση. Θυμάσαι τι είπαμε πριν. Αν ο χρήστης αναφέρεται σε κάτι που συζητήσαμε, απαντάς με βάση αυτό. Δεν ξεκινάς από την αρχή κάθε φορά.
 
Αν ο χρήστης πει κάτι ανεπίσημο (π.χ. "τι κάνεις", "γεια", "ευχαριστώ"), απάντησε φυσικά και σύντομα, σαν συνάδελφος σε επιτελείο — και μετά πρόσφερε να συνεχίσεις τη δουλειά.
 
Πάντα απαντάς για το κόμμα/οργανισμό: ${registeredPartyName || registeredPartyKey || "Δεν έχει οριστεί"}.
 
Αν ο χρήστης δείχνει χαμένος ή μπερδεμένος:
- ξεκίνα πρακτικά
- δώσε πρώτα σύσταση, μετά εξήγηση
- δώσε 3 κινήσεις
- δώσε δημόσια γραμμή
 
Κανόνες:
- Μην εφευρίσκεις γεγονότα ή δημοσκοπήσεις.
- Ποσοστά μόνο αν υπάρχουν στα δεδομένα.
- Πάντα πες τι σημαίνει για το εγγεγραμμένο κόμμα.
- Μη χρησιμοποιείς τεχνικούς όρους.
- Πάντα κατάληγε σε σύσταση.
- Αν ζητηθεί μήνυμα, γράψε μήνυμα.
- Αν ζητηθεί σενάριο, σύγκρινε σενάρια.
- Αν ζητηθεί πλάνο, δώσε πλάνο δράσης.
 
Γλώσσα: Ελληνικά. Καθαρά. Σοβαρά. Σαν σύμβουλος σε πολιτικό επιτελείο.
 
CONTEXT:
${safeJson(strategicBrief, 8000)}
 
ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ:
${safeJson(politicalEnvironment, 6000)}
 
AGENDA SIGNALS:
${agendaSignals.length ? safeJson(agendaSignals, 4000) : "Δεν βρέθηκαν."}
`;
 
  // Build conversation messages: history + new question
  const aiMessages: Array<{ role: string; content: string }> = [];
 
  // Add previous messages (conversation history)
  for (const msg of previousMessages) {
    aiMessages.push({ role: msg.role, content: msg.content });
  }
 
  // Add current user question
  aiMessages.push({ role: "user", content: question });
 
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
 
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
        max_tokens: 2000,
        system: systemPrompt,
        messages: aiMessages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
 
    clearTimeout(timeout);
 
    if (!response.ok) {
      return NextResponse.json({ answer: fallbackAnswer(question), conversation_id: conversationId, source: "fallback" });
    }
 
    const ai = await response.json();
 
    const answer = ai.content
      ?.filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n")
      .trim() || fallbackAnswer(question);
 
    // Save assistant message
    if (serviceClient && conversationId) {
      try {
        await serviceClient.from("advisor_messages").insert({
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
          },
          token_usage: ai.usage || null,
        });
 
        await serviceClient.from("advisor_conversations").update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", conversationId);
      } catch { /* don't break chat */ }
    }
 
    return NextResponse.json({
      answer,
      conversation_id: conversationId,
      source: "ai",
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      answer: fallbackAnswer(question),
      conversation_id: conversationId,
      source: "fallback",
      warning: err?.name === "AbortError" ? "AI timeout." : "AI connection error.",
    });
  }
}
 
