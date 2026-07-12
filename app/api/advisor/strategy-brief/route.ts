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
export const maxDuration = 60; // δώσε χρόνο στο AI να τρέξει αντί να πέφτει σε fallback

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

type PoliticalEnvironmentRow = {
  snapshot_id?: string | null;
  snapshot_date?: string | null;
  title?: string | null;
  summary?: string | null;
  plain_language_summary?: string | null;
  source_type?: string | null;
  government_momentum?: string | null;
  opposition_structure?: string | null;
  dominant_dynamic?: string | null;
  key_polling_findings?: unknown;
  party_momentum?: Record<string, unknown> | null;
  party_specific_implications?: Record<string, unknown> | null;
  strategic_implications?: unknown;
  source_urls?: unknown;
  documentation_level?: string | null;
  verification_status?: string | null;
  recent_polls?: unknown;
  actor_trends?: unknown;
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
${safeJson(profile.party_profile_snapshot, 1200)}

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
${safeJson(row.top_sources, 400)}

Evidence articles:
${safeJson(row.top_evidence_articles, 700)}
`;
    })
    .join("\n---\n");
}

function buildPoliticalEnvironmentContext(
  environment: PoliticalEnvironmentRow | null,
  partyKey?: string | null
) {
  if (!environment) {
    return `
ΤΡΕΧΟΝ ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ

Δεν υπάρχει ακόμη αποθηκευμένο political environment snapshot.
Μην εφεύρεις δημοσκοπικά ποσοστά.
Αν χρειαστεί, πες ότι η δημοσκοπική τεκμηρίωση δεν έχει φορτωθεί ακόμη.
`;
  }

  const partyImplications = environment.party_specific_implications || {};
  const selectedPartyImplication =
    partyKey && typeof partyImplications === "object"
      ? (partyImplications as Record<string, unknown>)[partyKey]
      : null;

  const partyMomentum = environment.party_momentum || {};
  const selectedPartyMomentum =
    partyKey && typeof partyMomentum === "object"
      ? (partyMomentum as Record<string, unknown>)[partyKey]
      : null;

  return `
ΤΡΕΧΟΝ ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ

Snapshot:
${environment.title || "Δεν έχει τίτλο"}

Ημερομηνία:
${environment.snapshot_date || "Άγνωστη"}

Σύνοψη:
${cleanText(environment.summary, 2200)}

Απλή πολιτική ανάγνωση:
${cleanText(environment.plain_language_summary, 2200)}

Κυβερνητικό momentum:
${cleanText(environment.government_momentum, 1400)}

Δομή αντιπολίτευσης:
${cleanText(environment.opposition_structure, 1400)}

Κύρια δυναμική:
${cleanText(environment.dominant_dynamic, 1600)}

Ειδική επίπτωση για το κόμμα του χρήστη (${partyKey || "χωρίς party_key"}):
${
  selectedPartyImplication
    ? cleanText(selectedPartyImplication, 2200)
    : "Δεν υπάρχει ειδική επίπτωση για αυτό το κόμμα. Χρησιμοποίησε το γενικό πολιτικό περιβάλλον με χαμηλότερη βεβαιότητα."
}

Momentum για το κόμμα του χρήστη:
${
  selectedPartyMomentum
    ? safeJson(selectedPartyMomentum, 1800)
    : "Δεν υπάρχει ειδικό momentum για αυτό το κόμμα."
}

Τελευταίες δημοσκοπήσεις:
${safeJson(environment.recent_polls, 1200)}

Τάσεις κομμάτων / actors:
${safeJson(environment.actor_trends, 1200)}

Στρατηγικές επιπτώσεις:
${safeJson(environment.strategic_implications, 1200)}

Πηγές:
${safeJson(environment.source_urls, 1200)}

Βαθμός τεκμηρίωσης πολιτικού περιβάλλοντος:
${environment.documentation_level || "άγνωστος"}

Verification status:
${environment.verification_status || "άγνωστο"}
`;
}

function buildFallbackResponse(params: {
  profile: UserPoliticalProfile | null;
  topic: string;
  agendaUsed: AgendaRow[];
  processingStatus: string;
  politicalEnvironment?: PoliticalEnvironmentRow | null;
  politicalEnvironmentStatus?: string;
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
    political_environment: params.politicalEnvironment || null,
    political_environment_status: params.politicalEnvironmentStatus || null,
    processing_status: params.processingStatus,
    source: "fallback",
    warning: params.warning || null,
  });
}

// Διχτυ ασφαλειας: αν σκοντηψει η βαση, γυρνα το αποθηκευμενο brief αντι για 500
// (το cockpit δεν πρεπει να «μαυριζει» οσο υπαρχει ετοιμο brief).
async function precomputedFallback(serviceClient: any, profile: any) {
  try {
    const { data: cachedRow } = await serviceClient
      .from("analysis_cache")
      .select("result, created_at")
      .is("situation_id", null)
      .eq("analysis_kind", "strategy_brief_latest")
      .maybeSingle();
    if (!cachedRow?.result) return null;
    const cached = cachedRow.result as any;
    return NextResponse.json({
      profile,
      strategic_brief: { ...cached, profile },
      agenda_used: cached.agenda_used || [],
      political_environment: null,
      political_environment_status: "cache_fallback",
      processing_status: null,
      source: "ai",
      model: "claude-sonnet-4-6 (precomputed, fallback)",
      generated_at: cached.generated_at || cachedRow.created_at,
    });
  } catch {
    return null;
  }
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

  if (!user) {
    return NextResponse.json(
      {
        auth_required: true,
        redirect_to: "/signin/password_signin?next=/strategy-room",
        message: "Συνδεθείτε για να φορτωθεί το κομματικό προφίλ.",
      },
      { status: 401 }
    );
  }

  let profile: UserPoliticalProfile | null = null;

  const { data: orgData, error: orgError } = await serviceClient
    .from("organizations")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (orgError) {
    const fb = await precomputedFallback(serviceClient, null);
    if (fb) return fb;
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  profile = (orgData || null) as UserPoliticalProfile | null;

  if (profile?.party_key) {
    const { data: partyProfile } = await serviceClient
      .from("political_party_profiles")
      .select("*")
      .eq("party_key", profile.party_key)
      .eq("is_active", true)
      .maybeSingle();

    if (partyProfile) {
      profile = {
        ...profile,
        org_name: profile.org_name || partyProfile.party_name,
        party_profile_snapshot: profile.party_profile_snapshot || partyProfile,
        themes:
          Array.isArray(profile.themes) && profile.themes.length
            ? profile.themes
            : partyProfile.core_themes || [],
        tone: profile.tone || partyProfile.default_tone || "",
        red_lines:
          profile.red_lines ||
          (Array.isArray(partyProfile.red_lines)
            ? partyProfile.red_lines.join("\n")
            : ""),
        mission: profile.mission || partyProfile.strategic_positioning || "",
      } as UserPoliticalProfile;
    }
  }

  if (!profile) {
    return NextResponse.json(
      {
        profile_required: true,
        redirect_to: "/onboarding",
        message:
          "Δεν βρέθηκε αποθηκευμένο κομματικό προφίλ. Ολοκληρώστε το onboarding.",
      },
      { status: 409 }
    );
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
    const fb = await precomputedFallback(serviceClient, profile);
    if (fb) return fb;
    return NextResponse.json({ error: agendaError.message }, { status: 500 });
  }

  const { data: politicalEnvironmentData, error: politicalEnvironmentError } =
    await serviceClient
      .from("v_advisor_political_environment")
      .select("*")
      .maybeSingle();

  const politicalEnvironment = (politicalEnvironmentData ||
    null) as PoliticalEnvironmentRow | null;

  const politicalEnvironmentStatus = politicalEnvironmentError
    ? `Δεν φορτώθηκε political environment snapshot: ${politicalEnvironmentError.message}`
    : politicalEnvironment
      ? "Το political environment snapshot φορτώθηκε επιτυχώς."
      : "Δεν υπάρχει ακόμη political environment snapshot.";

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
      politicalEnvironment,
      politicalEnvironmentStatus,
      warning: "No classified agenda signals available.",
    });
  }

  // ── ΓΡΗΓΟΡΗ ΑΝΑΓΝΩΣΗ ΑΠΟ CACHE ──────────────────────────────────────────
  // Αν υπάρχει προ-υπολογισμένο brief (από /strategy-brief-precompute), δώσ' το
  // ΑΜΕΣΩΣ χωρίς να καλέσουμε AI (που σκάει στο Vercel timeout).
  try {
    const { data: cachedRow } = await serviceClient
      .from("analysis_cache")
      .select("result, created_at")
      .is("situation_id", null)
      .eq("analysis_kind", "strategy_brief_latest")
      .maybeSingle();
    if (cachedRow?.result) {
      const cached = cachedRow.result as any;
      return NextResponse.json({
        profile,
        strategic_brief: { ...cached, profile },
        agenda_used: cached.agenda_used || signals,
        political_environment: politicalEnvironment,
        political_environment_status: politicalEnvironmentStatus,
        processing_status: processingStatus,
        source: "ai",
        model: "claude-sonnet-4-6 (precomputed)",
        generated_at: cached.generated_at || cachedRow.created_at,
      });
    }
  } catch {
    // αν δεν υπάρχει cache, συνέχισε σε live (που μπορεί να κάνει timeout).
  }

  const mainSignal = signals[0];

  const profileContext = buildProfileContext(profile);
  const agendaContext = buildAgendaContext(signals.slice(0, 4)); // λιγότερο context = ταχύτερη AI απάντηση, χωρίς timeout
  const politicalEnvironmentContext = buildPoliticalEnvironmentContext(
    politicalEnvironment,
    profile?.party_key || null
  );

  const systemPrompt = `
${buildNorayaStrategicSystemPrompt()}

${buildNorayaStrategicJsonInstruction()}
`;

  const userPrompt = `
${profileContext}

ΤΡΕΧΟΝ ΠΟΛΙΤΙΚΟ / ΔΗΜΟΣΚΟΠΙΚΟ ΠΕΡΙΒΑΛΛΟΝ
${politicalEnvironmentContext}

ΤΡΕΧΟΝΤΑ AGENDA SIGNALS
${agendaContext}

ΚΑΤΑΣΤΑΣΗ ΕΠΕΞΕΡΓΑΣΙΑΣ
${processingStatus}

ΚΑΤΑΣΤΑΣΗ ΠΟΛΙΤΙΚΟΥ ΠΕΡΙΒΑΛΛΟΝΤΟΣ
${politicalEnvironmentStatus}

ΑΠΟΣΤΟΛΗ

Διάλεξε το σημαντικότερο πραγματικό πολιτικό θέμα ως κύριο issue.
Μην επιλέξεις ποτέ το "Μη ταξινομημένο" ως θέμα.
Μη γράψεις σαν dashboard.
Μη δείξεις raw metrics στον τελικό χρήστη.
Μην εφεύρεις στοιχεία που δεν υπάρχουν.

Χρησιμοποίησε το πολιτικό / δημοσκοπικό περιβάλλον μόνο για να εξηγήσεις τι σημαίνει το θέμα για το συγκεκριμένο κόμμα του χρήστη.

Μη γράψεις γενική ανάλυση πολιτικού σκηνικού. Πάντα να απαντάς:
- τι σημαίνει για το κόμμα του χρήστη,
- ποιοι αντίπαλοι το πιέζουν,
- ποιο κοινό μπορεί να κερδίσει ή να χάσει,
- αν το θέμα είναι ευκαιρία ή απειλή,
- τι πρέπει να κάνει σήμερα,
- τι πρέπει να αποφύγει.

Αν υπάρχουν πολλές δημοσκοπήσεις, μη βασιστείς σε μία ως απόλυτη αλήθεια. Διάβασε τάση, μέσο σήμα και διακύμανση.

Μπορείς να αναφέρεις ποσοστά μόνο όταν υπάρχουν στα δεδομένα. Μην εφευρίσκεις ποσοστά.

Μη χρησιμοποιείς τεχνικούς όρους όπως fragmentation. Γράφε απλά: «η αντιπολίτευση είναι κομμένη σε πολλά κέντρα».

Θέλω πλήρες Noraya Strategic Brief:
- daily brief,
- strategic diagnosis,
- scenario analysis,
- message package,
- action plan,
- monitoring plan,
- evidence note.

Η απάντηση πρέπει να είναι χρήσιμη για πολιτικό κόμμα / πολιτικό οργανισμό που χρειάζεται στρατηγική, όχι απλή περίληψη ειδήσεων.

ΥΦΟΣ — ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
Γράψε σαν κορυφαίος πολιτικός σύμβουλος που έχει καθίσει σε πραγματικά war rooms.
Κάθε πρόταση να έχει ΑΠΟΨΗ και ΕΝΤΑΣΗ — όχι ουδέτερες, generic διατυπώσεις.
ΑΠΑΓΟΡΕΥΟΝΤΑΙ φράσεις-κλισέ όπως: "χρειάζεται καλύτερη τεκμηρίωση", "χρειάζεται περαιτέρω ανάλυση",
"το θέμα βρίσκεται σε κατάσταση παρακολούθησης", "institutional", ή οποιοδήποτε μισό/κενό κείμενο.
Αντί για αυτά, πες ΣΥΓΚΕΚΡΙΜΕΝΑ: ποιος κερδίζει, ποιος χάνει, ποια είναι η παγίδα,
τι ακριβώς λέμε, τι ΔΕΝ λέμε, ποια κίνηση μας βάζει μπροστά.
Συγκεκριμένα ονόματα δυναμικών, συγκεκριμένα κοινά, συγκεκριμένες κινήσεις.
Ισορροπημένος αλλά με καθαρή θέση. Ποτέ νερόβραστα. Κάθε πεδίο να είναι κάτι που θα ΕΝΤΥΠΩΣΙΑΖΕ
έναν πραγματικό αρχηγό κόμματος και θα τον έκανε να πει "αυτό είναι σωστό".

ΣΥΝΤΟΜΙΑ: Κάθε πεδίο 1-3 δυνατές προτάσεις. Όχι σεντόνια. Πυκνό, κοφτό, ουσιαστικό — ώστε να απαντήσεις γρήγορα.
`;

  if (!anthropicKey) {
    return buildFallbackResponse({
      profile,
      topic: mainSignal.topic,
      agendaUsed: signals,
      processingStatus,
      politicalEnvironment,
      politicalEnvironmentStatus,
      warning: "Missing ANTHROPIC_API_KEY. Returned fallback strategic brief.",
    });
  }

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
        max_tokens: 3500,
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
        politicalEnvironment,
        politicalEnvironmentStatus,
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
        politicalEnvironment,
        politicalEnvironmentStatus,
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
      political_environment: politicalEnvironment,
      political_environment_status: politicalEnvironmentStatus,
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
      politicalEnvironment,
      politicalEnvironmentStatus,
      warning:
        err?.name === "AbortError"
          ? "AI timeout. Returned fallback strategic brief."
          : "AI connection error. Returned fallback strategic brief.",
    });
  }
}
