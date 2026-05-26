import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  buildNorayaStrategicJsonInstruction,
  buildNorayaStrategicSystemPrompt,
  createFallbackStrategicBrief,
  type UserPoliticalProfile,
} from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_COOKIE_NAME = "noraya_guest_profile";

type AgendaRow = {
  topic: string;
  article_count: number | null;
  source_count: number | null;
  political_articles: number | null;
  agenda_score: number | null;
  documentation_level: string | null;
  political_risk_level: string | null;
  framing_summary: string | null;
  recommended_action: string | null;
  avoid_action: string | null;
  top_sources: unknown;
  top_evidence_articles: unknown;
  evidence_summary: string | null;
};

function cleanText(value: unknown, maxLength = 1000) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeJson(value: unknown, maxLength = 1800) {
  try {
    return JSON.stringify(value ?? null).slice(0, maxLength);
  } catch {
    return "null";
  }
}

function parseAiJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function readGuestProfileCookie(): UserPoliticalProfile | null {
  const raw = cookies().get(GUEST_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(raw)) as UserPoliticalProfile;
  } catch {
    return null;
  }
}

function buildProfileContext(profile: UserPoliticalProfile | null) {
  if (!profile) {
    return `
ΠΡΟΦΙΛ ΧΡΗΣΤΗ
Δεν υπάρχει ακόμη αποθηκευμένο προφίλ χρήστη.

Χειρίσου τον χρήστη ως γενικό πολιτικό οργανισμό.
Κράτησε χαμηλότερη βεβαιότητα.
Μην εφεύρεις κομματικές θέσεις.
`;
  }

  return `
ΠΡΟΦΙΛ ΧΡΗΣΤΗ

Όνομα:
${profile.org_name || "Δεν έχει οριστεί"}

Τύπος:
${profile.org_type || profile.role_type || "Πολιτικός οργανισμός"}

Party key:
${profile.party_key || "Δεν έχει οριστεί"}

Profile source:
${profile.profile_source || "Δεν έχει οριστεί"}

Review status:
${profile.profile_review_status || "Δεν έχει οριστεί"}

Party profile snapshot:
${safeJson(profile.party_profile_snapshot, 2600)}

Θεματικές προτεραιότητες:
${safeJson(profile.themes, 1800)}

Ζητήματα:
${safeJson(profile.issues, 1800)}

Κοινά / stakeholders:
${safeJson(profile.stakeholders, 2200)}

Αποστολή / πολιτική ταυτότητα:
${cleanText(profile.mission, 1800) || "Δεν έχει οριστεί"}

Κόκκινες γραμμές:
${cleanText(profile.red_lines, 1800) || "Δεν έχουν οριστεί"}

Προτιμώμενος τόνος:
${cleanText(profile.tone, 1600) || "Δεν έχει οριστεί"}
`;
}

function buildAgendaContext(signals: AgendaRow[]) {
  return signals
    .map((row, index) => {
      return `
ΣΗΜΑ ${index + 1}

Θέμα:
${row.topic}

Εσωτερική ένταση:
${row.agenda_score ?? "άγνωστη"}

Εσωτερικό ρίσκο:
${row.political_risk_level || "άγνωστο"}

Εσωτερική τεκμηρίωση:
${row.documentation_level || "άγνωστη"}

Άρθρα:
${row.article_count || 0}

Πηγές:
${row.source_count || 0}

Πολιτικά άρθρα:
${row.political_articles || 0}

Framing summary:
${cleanText(row.framing_summary, 1200)}

Recommended action βάσης:
${cleanText(row.recommended_action, 1000)}

Avoid action βάσης:
${cleanText(row.avoid_action, 1000)}

Evidence summary:
${cleanText(row.evidence_summary, 1000)}

Top sources:
${safeJson(row.top_sources, 1800)}

Evidence articles:
${safeJson(row.top_evidence_articles, 2800)}
`;
    })
    .join("\n---\n");
}

function buildFallbackResponse(params: {
  profile: UserPoliticalProfile | null;
  topic: string;
  agendaUsed: AgendaRow[];
  processingStatus: string;
  warning?: string;
}) {
  return NextResponse.json({
    profile: params.profile,
    strategic_brief: createFallbackStrategicBrief({
      profile: params.profile,
      topic: params.topic,
      processingStatus: params.processingStatus,
    }),
    agenda_used: params.agendaUsed,
    processing_status: params.processingStatus,
    source: "fallback",
    warning: params.warning || null,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const rawLimit = Number.parseInt(searchParams.get("limit") || "8", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 12)
    : 8;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
  }

  const authClient = createAuthClient();
  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
  } = await authClient.auth.getUser();

  let profile: UserPoliticalProfile | null = null;

  if (user) {
    const { data: orgData, error: orgError } = await serviceClient
      .from("organizations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    profile = (orgData || null) as UserPoliticalProfile | null;
  }

  if (!profile) {
    profile = readGuestProfileCookie();
  }

  const { data: agendaData, error: agendaError } = await serviceClient
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
    .order("agenda_score", { ascending: false })
    .limit(limit + 4);

  if (agendaError) {
    return NextResponse.json({ error: agendaError.message }, { status: 500 });
  }

  const rows = ((agendaData || []) as AgendaRow[]).filter(Boolean);

  const unclassifiedSignal =
    rows.find((row) => row.topic === "Μη ταξινομημένο") || null;

  const signals = rows
    .filter((row) => row.topic && row.topic !== "Μη ταξινομημένο")
    .slice(0, limit);

  const processingStatus = unclassifiedSignal
    ? `Ο Noraya επεξεργάζεται ακόμη ${
        unclassifiedSignal.article_count || 0
      } άρθρα που δεν έχουν πλήρη θεματική ταξινόμηση. Αυτό μειώνει τη βεβαιότητα αλλά δεν πρέπει να εμφανιστεί ως πολιτικό θέμα.`
    : "Δεν υπάρχει μεγάλο υπόλοιπο αταξινόμητων άρθρων στο τρέχον αποτέλεσμα.";

  if (signals.length === 0) {
    return buildFallbackResponse({
      profile,
      topic: "Τρέχουσα πολιτική ατζέντα",
      agendaUsed: [],
      processingStatus,
      warning: "No classified agenda signals available.",
    });
  }

  const mainSignal = signals[0];

  const profileContext = buildProfileContext(profile);
  const agendaContext = buildAgendaContext(signals);

  const systemPrompt = `
${buildNorayaStrategicSystemPrompt()}

${buildNorayaStrategicJsonInstruction()}
`;

  const userPrompt = `
${profileContext}

ΤΡΕΧΟΝΤΑ AGENDA SIGNALS
${agendaContext}

ΚΑΤΑΣΤΑΣΗ ΕΠΕΞΕΡΓΑΣΙΑΣ
${processingStatus}

ΑΠΟΣΤΟΛΗ

Διάλεξε το σημαντικότερο πραγματικό πολιτικό θέμα ως κύριο issue.
Μην επιλέξεις ποτέ το "Μη ταξινομημένο" ως θέμα.
Μη γράψεις σαν dashboard.
Μη δείξεις raw metrics στον τελικό χρήστη.
Μην εφεύρεις στοιχεία που δεν υπάρχουν.

Θέλω πλήρες Noraya Strategic Brief:
- daily brief,
- strategic diagnosis,
- scenario analysis,
- message package,
- action plan,
- monitoring plan,
- evidence note.

Η απάντηση πρέπει να είναι χρήσιμη για πολιτικό κόμμα / πολιτικό οργανισμό που χρειάζεται στρατηγική, όχι απλή περίληψη ειδήσεων.
`;

  if (!anthropicKey) {
    return buildFallbackResponse({
      profile,
      topic: mainSignal.topic,
      agendaUsed: signals,
      processingStatus,
      warning: "Missing ANTHROPIC_API_KEY. Returned fallback strategic brief.",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

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
        max_tokens: 5000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      let message = "AI error. Returned fallback strategic brief.";

      try {
        const err = await response.json();
        message = err.error?.message || message;
      } catch {
        // keep default message
      }

      return buildFallbackResponse({
        profile,
        topic: mainSignal.topic,
        agendaUsed: signals,
        processingStatus,
        warning: message,
      });
    }

    const ai = await response.json();

    const rawText =
      ai.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n") || "";

    const parsed = parseAiJson(rawText);

    if (!parsed) {
      return buildFallbackResponse({
        profile,
        topic: mainSignal.topic,
        agendaUsed: signals,
        processingStatus,
        warning: "AI response was not valid JSON. Returned fallback strategic brief.",
      });
    }

    const strategicBrief = {
      ...parsed,
      model: parsed.model || "v1",
      profile,
    };

    return NextResponse.json({
      profile,
      strategic_brief: strategicBrief,
      agenda_used: signals,
      processing_status: processingStatus,
      source: "ai",
      model: "claude-sonnet-4-6",
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return buildFallbackResponse({
      profile,
      topic: mainSignal.topic,
      agendaUsed: signals,
      processingStatus,
      warning:
        err?.name === "AbortError"
          ? "AI timeout. Returned fallback strategic brief."
          : "AI connection error. Returned fallback strategic brief.",
    });
  }
}
