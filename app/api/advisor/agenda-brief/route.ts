import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type OrganizationProfile = {
  org_name?: string | null;
  org_type?: string | null;
  themes?: unknown;
  issues?: unknown;
  events?: unknown;
  stakeholders?: unknown;
  mission?: string | null;
  red_lines?: string | null;
  tone?: string | null;
};

function cleanText(value: unknown, maxLength = 900) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function listText(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function safeJson(value: unknown, maxLength = 1400) {
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

function priorityLabel(score: number | null) {
  if (score === null || score === undefined) return "Χρειάζεται παρακολούθηση";
  if (score >= 80) return "Πολύ υψηλή προτεραιότητα";
  if (score >= 65) return "Υψηλή προτεραιότητα";
  if (score >= 50) return "Θέμα προς παρακολούθηση";
  return "Χαμηλή άμεση προτεραιότητα";
}

function riskLabel(risk: string | null) {
  if (risk === "high") {
    return "Μπορεί να δημιουργήσει πολιτικό κόστος αν αγνοηθεί ή απαντηθεί λάθος";
  }

  if (risk === "medium") {
    return "Χρειάζεται προετοιμασία πριν υπάρξει δημόσια στάση";
  }

  if (risk === "low") {
    return "Δεν φαίνεται να απαιτεί άμεση δημόσια αντίδραση";
  }

  return "Το πολιτικό ρίσκο δεν είναι ακόμη καθαρό";
}

function confidenceLabel(level: string | null) {
  if (level === "strong") {
    return "Υψηλή βεβαιότητα: η εκτίμηση βασίζεται σε αρκετά στοιχεία";
  }

  if (level === "medium") {
    return "Μέτρια βεβαιότητα: υπάρχει σήμα, αλλά χρειάζεται παρακολούθηση";
  }

  if (level === "weak") {
    return "Χαμηλή βεβαιότητα: τα στοιχεία είναι ακόμη περιορισμένα";
  }

  return "Η βεβαιότητα δεν έχει αποτιμηθεί ακόμη";
}

function fallbackBrief(signal: AgendaRow, processingStatus: string) {
  const topic = signal.topic;

  return {
    main_signal: {
      topic,
      plain_title: topic,
      priority_label: priorityLabel(signal.agenda_score),
      risk_label: riskLabel(signal.political_risk_level),
      confidence_label: confidenceLabel(signal.documentation_level),
    },
    brief: {
      headline: `Το θέμα «${topic}» χρειάζεται πολιτική προσοχή σήμερα.`,
      decision_summary:
        "Το Noraya βλέπει ότι το θέμα έχει αρκετή ένταση στην τρέχουσα ατζέντα. Πριν υπάρξει δημόσια τοποθέτηση, χρειάζεται να συνδεθεί με τις θέσεις, το ύφος και τις κόκκινες γραμμές του οργανισμού.",
      what_it_means_for_you:
        cleanText(signal.framing_summary) ||
        "Το θέμα μπορεί να επηρεάσει την πολιτική εικόνα του οργανισμού, ανάλογα με το πώς θα πλαισιωθεί δημόσια.",
      why_it_matters_now:
        cleanText(signal.evidence_summary) ||
        "Το θέμα εμφανίζεται σε πρόσφατη ειδησεογραφία και χρειάζεται παρακολούθηση πριν παγιωθεί το framing.",
      recommended_move:
        cleanText(signal.recommended_action) ||
        "Κρατήστε προετοιμασμένη, θεσμική και καθαρή στάση. Μην ανοίξετε μέτωπο χωρίς επαρκή τεκμηρίωση.",
      avoid:
        cleanText(signal.avoid_action) ||
        "Αποφύγετε υπερβολική αντίδραση, ειρωνεία ή δημόσια θέση που δεν συνδέεται καθαρά με τη γραμμή του οργανισμού.",
      opportunity:
        "Υπάρχει ευκαιρία να εμφανιστείτε προετοιμασμένοι, σοβαροί και συνδεδεμένοι με πραγματικές κοινωνικές ανησυχίες.",
      main_risk:
        "Το βασικό ρίσκο είναι να δοθεί λάθος τόνος ή να φανεί ότι ο οργανισμός αντιδρά μηχανικά αντί να καταλαβαίνει το θέμα.",
      confidence: confidenceLabel(signal.documentation_level),
    },
    audiences: [
      {
        name: "Βάση οργανισμού",
        reading:
          "Θα περιμένει καθαρή γραμμή που να συνδέεται με τις ήδη δηλωμένες θέσεις.",
        move:
          "Δώστε σταθερή θέση χωρίς ασάφεια και χωρίς υπερβολή.",
      },
      {
        name: "Αναποφάσιστοι / μετριοπαθές κοινό",
        reading:
          "Θα αξιολογήσει κυρίως τον τόνο, τη σοβαρότητα και την αξιοπιστία.",
        move:
          "Κρατήστε θεσμική, απλή και τεκμηριωμένη γλώσσα.",
      },
      {
        name: "Νέοι και ενεργά κοινωνικά κοινά",
        reading:
          "Μπορεί να αντιδράσουν θετικά αν το θέμα συνδεθεί με δικαιοσύνη, διαφάνεια ή καθημερινή εμπειρία.",
        move:
          "Μιλήστε ανθρώπινα και συγκεκριμένα, όχι με γενικά συνθήματα.",
      },
    ],
    talking_points: [
      "Τοποθέτηση με καθαρό θεσμικό τόνο.",
      "Σύνδεση του θέματος με πραγματική κοινωνική επίπτωση.",
      "Αποφυγή προσωπικής επίθεσης χωρίς τεκμηρίωση.",
      "Έμφαση στη λύση, στη διαδικασία και στην αξιοπιστία.",
    ],
    advisor_questions: [
      `Τι να πούμε δημόσια για το θέμα «${topic}»;`,
      "Ποιο είναι το ρίσκο αν σωπάσουμε;",
      "Ποιο είναι το ρίσκο αν απαντήσουμε επιθετικά;",
      "Ποια κοινωνικά κοινά επηρεάζονται περισσότερο;",
      "Δώσε μου ασφαλή δημόσια διατύπωση.",
    ],
    secondary_signals: [],
    evidence_note:
      "Η εκτίμηση βασίζεται στα πρόσφατα agenda signals και στα διαθέσιμα άρθρα. Χρειάζεται συνεχής ανανέωση όσο προχωρά η ταξινόμηση.",
    processing_status: processingStatus,
  };
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

  let org: OrganizationProfile | null = null;

  if (user) {
    const { data: orgData, error: orgError } = await serviceClient
      .from("organizations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    org = (orgData || null) as OrganizationProfile | null;
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
      } άρθρα που δεν έχουν πλήρη θεματική ταξινόμηση. Αυτό δεν εμφανίζεται ως πολιτικό θέμα, αλλά επηρεάζει τη βεβαιότητα.`
    : "Δεν υπάρχει μεγάλο υπόλοιπο αταξινόμητων άρθρων στο τρέχον αποτέλεσμα.";

  if (signals.length === 0) {
    return NextResponse.json({
      profile: org,
      brief: {
        main_signal: null,
        brief: {
          headline:
            "Ο Noraya χρειάζεται περισσότερη ταξινόμηση πριν δώσει ασφαλή πολιτική σύσταση.",
          decision_summary:
            "Υπάρχει ειδησεογραφία, αλλά όχι ακόμη αρκετά ταξινομημένα πολιτικά σήματα.",
          what_it_means_for_you:
            "Δεν υπάρχει ακόμη αρκετή βάση για προσωποποιημένη πολιτική εκτίμηση.",
          why_it_matters_now:
            "Χωρίς θεματική ταξινόμηση, το σύστημα μπορεί να υπερεκτιμήσει γενική ειδησεογραφική ένταση.",
          recommended_move:
            "Συνέχισε το automated classification και επανέλεγξε την ατζέντα σε λίγο.",
          avoid:
            "Μην βγάλεις τελικό πολιτικό συμπέρασμα από αταξινόμητο υλικό.",
          opportunity:
            "Όταν ολοκληρωθεί περισσότερη ταξινόμηση, το Noraya θα μπορεί να δώσει πιο στοχευμένη σύσταση.",
          main_risk:
            "Το ρίσκο είναι να μπερδευτεί η ποσότητα άρθρων με πραγματική πολιτική σημασία.",
          confidence: "Χαμηλή βεβαιότητα.",
        },
        audiences: [],
        talking_points: [],
        advisor_questions: [
          "Ποια θέματα έχουν ταξινομηθεί μέχρι τώρα;",
          "Τι λείπει για ασφαλή εκτίμηση;",
          "Πότε θα έχουμε καλύτερη εικόνα;",
        ],
        secondary_signals: [],
        evidence_note:
          "Δεν υπάρχουν αρκετά ταξινομημένα πολιτικά σήματα για ασφαλή σύσταση.",
        processing_status: processingStatus,
      },
      agenda_used: [],
      processing_status: processingStatus,
    });
  }

  const orgContext = org
    ? `
ΟΡΓΑΝΙΣΜΟΣ / ΠΡΟΦΙΛ ΧΡΗΣΤΗ
Όνομα: ${org.org_name || "Δεν έχει οριστεί"}
Τύπος: ${org.org_type || "Πολιτικό κόμμα"}
Θεματικές προτεραιότητες: ${listText(org.themes) || "Δεν έχουν οριστεί"}
Συγκεκριμένα ζητήματα: ${listText(org.issues) || "Δεν έχουν οριστεί"}
Γεγονότα / κρίσεις που παρακολουθεί: ${listText(org.events) || "Δεν έχουν οριστεί"}
Κοινά / φορείς: ${safeJson(org.stakeholders, 1800)}
Αποστολή / πολιτική ταυτότητα: ${
        cleanText(org.mission, 1200) || "Δεν έχει οριστεί"
      }
Κόκκινες γραμμές: ${
        cleanText(org.red_lines, 1200) || "Δεν έχουν οριστεί"
      }
Προτιμώμενος τόνος: ${cleanText(org.tone, 900) || "Δεν έχει οριστεί"}
`
    : `
Δεν υπάρχει ακόμη αποθηκευμένο προφίλ οργανισμού.
Υπόθεσε προσωρινά γενικό προφίλ πολιτικού κόμματος, αλλά κράτησε χαμηλότερη βεβαιότητα και μην προσποιηθείς ότι ξέρεις θέσεις που δεν δόθηκαν.
`;

  const agendaContext = signals
    .map((row, index) => {
      return `
ΣΗΜΑ ${index + 1}
Θέμα: ${row.topic}
Εσωτερικό score: ${row.agenda_score ?? "άγνωστο"}
Εσωτερικό risk: ${row.political_risk_level || "άγνωστο"}
Εσωτερική τεκμηρίωση: ${row.documentation_level || "άγνωστο"}
Άρθρα: ${row.article_count || 0}
Πηγές: ${row.source_count || 0}
Πολιτικά άρθρα: ${row.political_articles || 0}
Υπάρχον framing: ${cleanText(row.framing_summary, 900)}
Υπάρχουσα σύσταση βάσης: ${cleanText(row.recommended_action, 700)}
Υπάρχουσα αποφυγή βάσης: ${cleanText(row.avoid_action, 700)}
Evidence summary: ${cleanText(row.evidence_summary, 700)}
Top sources: ${safeJson(row.top_sources, 1400)}
Evidence articles: ${safeJson(row.top_evidence_articles, 2400)}
`;
    })
    .join("\n---\n");

  const systemPrompt = `
Είσαι ο Noraya, AI Political Intelligence Advisor.

Αποστολή σου είναι να μετατρέπεις την πολιτική ατζέντα σε πρακτική, προσωποποιημένη σύσταση για ΠΟΛΙΤΙΚΟ ΚΟΜΜΑ.

Δεν είσαι news dashboard.
Δεν είσαι data analyst που δείχνει ωμούς δείκτες.
Είσαι πολιτικός σύμβουλος απόφασης.

ΚΡΙΣΙΜΟΙ ΚΑΝΟΝΕΣ

- Μην εμφανίζεις τεχνικούς όρους όπως "agenda_score", "documentation_level", "v1-baseline", "v1-classified" στον τελικό χρήστη.
- Μην κάνεις κύριο σήμα το "Μη ταξινομημένο". Είναι εσωτερική κατάσταση, όχι πολιτικό θέμα.
- Μετάφρασε τα δεδομένα σε ανθρώπινη γλώσσα: προτεραιότητα, πολιτικό κόστος, ευκαιρία, ρίσκο, επόμενη κίνηση.
- Σύνδεσε κάθε εκτίμηση με το προφίλ του οργανισμού: θέσεις, θεματικές, κοινά, κόκκινες γραμμές και τόνο.
- Μην εφευρίσκεις δημοσκοπικά ποσοστά ή βεβαιότητες.
- Αν η βεβαιότητα είναι περιορισμένη, πες το καθαρά.
- Η γλώσσα να είναι απλή, φιλική, σοβαρή και αποφασιστική.
- Πρώτα απόφαση, μετά εξήγηση, μετά evidence.
- Μη γράφεις σαν αναφορά database.

Πρέπει να επιστρέψεις ΜΟΝΟ έγκυρο JSON, χωρίς markdown και χωρίς επεξηγηματικό κείμενο έξω από το JSON.

Το JSON πρέπει να έχει ακριβώς αυτή τη δομή:

{
  "main_signal": {
    "topic": string,
    "plain_title": string,
    "priority_label": string,
    "risk_label": string,
    "confidence_label": string
  },
  "brief": {
    "headline": string,
    "decision_summary": string,
    "what_it_means_for_you": string,
    "why_it_matters_now": string,
    "recommended_move": string,
    "avoid": string,
    "opportunity": string,
    "main_risk": string,
    "confidence": string
  },
  "audiences": [
    {
      "name": string,
      "reading": string,
      "move": string
    }
  ],
  "talking_points": string[],
  "advisor_questions": string[],
  "secondary_signals": [
    {
      "topic": string,
      "plain_label": string,
      "why_watch": string
    }
  ],
  "evidence_note": string,
  "processing_status": string
}

Περιορισμοί:
- audiences: 3 έως 5.
- talking_points: 3 έως 5.
- advisor_questions: 4 έως 6 και να μοιάζουν με κουμπιά που θα πατήσει ο χρήστης.
- secondary_signals: έως 4.
`;

  const userPrompt = `
${orgContext}

ΤΡΕΧΟΝΤΑ AGENDA SIGNALS
${agendaContext}

ΚΑΤΑΣΤΑΣΗ ΕΠΕΞΕΡΓΑΣΙΑΣ
${processingStatus}

Γράψε personalized party agenda brief για τον χρήστη.

Διάλεξε ως main_signal το σημαντικότερο πραγματικό topic για το κόμμα, όχι το "Μη ταξινομημένο".

Μετάφρασε τα εσωτερικά metrics σε πρακτική πολιτική γλώσσα.
`;

  if (!anthropicKey) {
    return NextResponse.json({
      profile: org,
      brief: fallbackBrief(signals[0], processingStatus),
      agenda_used: signals,
      processing_status: processingStatus,
      warning:
        "Missing ANTHROPIC_API_KEY. Returned deterministic fallback brief.",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();

      return NextResponse.json(
        {
          error: err.error?.message || "AI error",
          fallback: fallbackBrief(signals[0], processingStatus),
        },
        { status: 500 }
      );
    }

    const ai = await response.json();

    const rawText =
      ai.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n") || "";

    const parsed = parseAiJson(rawText);

    if (!parsed) {
      return NextResponse.json({
        profile: org,
        brief: fallbackBrief(signals[0], processingStatus),
        agenda_used: signals,
        processing_status: processingStatus,
        warning: "AI response was not valid JSON. Returned fallback brief.",
        raw: rawText.slice(0, 1200),
      });
    }

    return NextResponse.json({
      profile: org,
      brief: parsed,
      agenda_used: signals,
      processing_status: processingStatus,
      model: "claude-sonnet-4-6",
      usage: ai.usage || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Σφάλμα σύνδεσης με AI: " + err.message,
        fallback: fallbackBrief(signals[0], processingStatus),
      },
      { status: 500 }
    );
  }
}
