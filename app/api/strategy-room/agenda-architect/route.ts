import { NextResponse } from "next/server";

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

function safeJson(value: unknown, maxLength = 22000) {
  try {
    return JSON.stringify(value ?? null, null, 2).slice(0, maxLength);
  } catch {
    return "null";
  }
}

function extractText(ai: any) {
  return (ai?.content || [])
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("\n")
    .trim();
}

function tryParseJsonObject(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function compactAgendaOverview(rows: any[]) {
  return rows.slice(0, 12).map((row: any) => {
    const microAgendas = Array.isArray(row?.micro_agendas)
      ? row.micro_agendas.slice(0, 6).map((micro: any) => ({
          title: micro?.title,
          score: micro?.score,
          eventCount: micro?.eventCount,
          statusLabel: micro?.statusLabel,
          evidenceLabel: micro?.evidenceLabel,
        }))
      : [];

    const relatedEvents = Array.isArray(row?.related_events)
      ? row.related_events.slice(0, 8).map((event: any) => ({
          title: event?.title,
          micro_agenda: event?.micro_agenda,
          score: event?.event_score,
          article_count: event?.article_count,
          source_count: event?.source_count,
        }))
      : [];

    return {
      topic: row?.topic,
      score: row?.strategic_index_score ?? row?.agenda_score,
      signal_label: row?.strategic_index_label ?? row?.signal_label,
      coverage_level: row?.coverage_level,
      documentation_level: row?.documentation_level,
      opportunity_label: row?.opportunity_label,
      active_micro_agenda: row?.active_micro_agenda,
      micro_agendas: microAgendas,
      related_events: relatedEvents,
    };
  });
}

function compactProbeAgendaMap(rows: any[]) {
  return rows.slice(0, 18).map((item: any) => ({
    id: item?.id,
    title: item?.title,
    parentTopics: item?.parentTopics,
    score: item?.score,
    statusLabel: item?.statusLabel,
    evidenceLabel: item?.evidenceLabel,
    eventCountLabel: item?.eventCountLabel,
    events: Array.isArray(item?.events)
      ? item.events.slice(0, 5).map((event: any) => ({
          title: event?.title,
          score: event?.event_score,
          article_count: event?.article_count,
          source_count: event?.source_count,
        }))
      : [],
    rawSignals: item?.raw
      ? {
          score: item.raw.score,
          real_news_coverage_score: item.raw.real_news_coverage_score,
          real_trend_score: item.raw.real_trend_score,
          real_frontpage_prominence_score: item.raw.real_frontpage_prominence_score,
          freshness_score: item.raw.freshness_score,
          documentation_score: item.raw.documentation_score,
          event_count: item.raw.event_count,
          article_count: item.raw.article_count,
          source_count: item.raw.source_count,
          strategic_read: item.raw.strategic_read,
        }
      : null,
  }));
}

function fallbackResult(text: string) {
  return {
    title: "Στρατηγική Αναδιάταξη Ημέρας",
    displayText: text || "Δεν μπόρεσα να παράγω αξιόπιστη Κίνηση Αναδιάταξης αυτή τη στιγμή.",
    chatContext: {
      coreDiagnosis: "",
      herestheticMove: "",
      agendaCreationRoute: "",
      connectedMicroAgendas: [],
      firstMove: "",
      trap: "",
      followups: [
        "Μετάτρεψέ το σε γραμμή 24ώρου.",
        "Ποια είναι η παγίδα των αντιπάλων;",
        "Πώς το λέει ο αρχηγός χωρίς να φανεί παλιό;",
      ],
    },
  };
}

export async function POST(req: Request) {
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "NO_ANTHROPIC_API_KEY",
        title: "Στρατηγική Αναδιάταξη Ημέρας",
        displayText: "Δεν υπάρχει διαθέσιμο ANTHROPIC_API_KEY για να παραχθεί η Κίνηση Αναδιάταξης.",
      },
      { status: 500 },
    );
  }

  const party = cleanText(
    body.party ||
      body.profile?.party_profile_snapshot?.party_name ||
      body.profile?.party_name ||
      body.profile?.org_name ||
      "το επιλεγμένο κόμμα",
    240,
  );

  const profile = body.profile || null;
  const agendaOverview = Array.isArray(body.agenda_overview) ? body.agenda_overview : [];
  const probeAgendaMap = Array.isArray(body.probe_agenda_map) ? body.probe_agenda_map : [];
  const politicalEnvironment = body.political_environment || null;
  const strategicBrief = body.strategic_brief || null;

  const prompt = `Είσαι ο κορυφαίος πολιτικός στρατηγικός σύμβουλος της Noraya.

Αποστολή σου: να παραγάγεις την premium ανάλυση "Στρατηγική Αναδιάταξη Ημέρας" για το κόμμα/οργανισμό ${party}.

Δεν κάνεις περίληψη. Δεν κάνεις dashboard analysis. Κάνεις heresthetic analysis με την έννοια του William Riker: βρίσκεις πώς μπορεί ο χρήστης να αλλάξει τη διάσταση της σύγκρουσης ώστε να δημιουργήσει ατζέντα, όχι απλώς να ακολουθήσει την ατζέντα.

ΔΕΔΟΜΕΝΑ ΠΟΥ ΕΧΕΙΣ:
1. Η συνολική εικόνα θεματικών, χτισμένη από agenda-probe micro-agendas.
2. Τα micro-agendas και τα γεγονότα που δημιουργούν ή δεν δημιουργούν ατζέντα.
3. Τα scores ως σήματα προτεραιότητας/έντασης — όχι ως raw δημόσιο copy.
4. Το party profile και τις κόκκινες γραμμές.
5. Το πολιτικό περιβάλλον και brief, όπου υπάρχουν.

ΚΟΜΜΑ / PROFILE:
${safeJson(profile, 7000)}

ΣΥΝΟΛΙΚΗ ΕΙΚΟΝΑ ΘΕΜΑΤΙΚΩΝ:
${safeJson(compactAgendaOverview(agendaOverview), 12000)}

MICRO-AGENDA FIELD MAP:
${safeJson(compactProbeAgendaMap(probeAgendaMap), 14000)}

ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ:
${safeJson(politicalEnvironment, 6000)}

STRATEGIC BRIEF:
${safeJson(strategicBrief, 5000)}

ΑΠΑΙΤΗΣΕΙΣ ΠΟΙΟΤΗΤΑΣ:
- Γράψε στα ελληνικά.
- Το displayText να είναι περίπου 350-470 λέξεις.
- Να ακούγεται σαν πολύ έμπειρος πολιτικός σύμβουλος σε κλειστό επιτελικό δωμάτιο.
- Να κάνει τον χρήστη να νιώσει: "αυτό δεν το είχα δει".
- Να ενώνει micro-agendas σε ενιαίο πολιτικό ερώτημα.
- Να δείχνει ποιο θέμα είναι ήδη κλειδωμένο από την επικαιρότητα και πού υπάρχει ανοιχτό πεδίο agenda-setting.
- Να δίνει καθαρή heresthetic κίνηση: ποια διάσταση της σύγκρουσης αλλάζουμε.
- Να δίνει πρώτη κίνηση 24ώρου χωρίς να λέει generic "βγάλε ανακοίνωση".
- Να δείχνει την παγίδα ειδικά για το συγκεκριμένο κόμμα.
- Να μη βγάζει raw fields, raw formulas, τεχνικά labels, πίνακες ή "Search/Boost".
- Να μη γράψει markdown table.
- Να μη χρησιμοποιήσει φλύαρες ενότητες. Επιτρέπονται λίγες συμπαγείς παράγραφοι.

ΑΠΑΝΤΗΣΕ ΜΟΝΟ σε έγκυρο JSON, χωρίς markdown fences, με ακριβώς αυτό το σχήμα:
{
  "title": "Στρατηγική Αναδιάταξη Ημέρας",
  "displayText": "...",
  "chatContext": {
    "coreDiagnosis": "...",
    "herestheticMove": "...",
    "agendaCreationRoute": "...",
    "connectedMicroAgendas": ["...", "..."],
    "firstMove": "...",
    "trap": "...",
    "followups": ["...", "...", "..."]
  }
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

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
        max_tokens: 2400,
        system:
          "You are Noraya Agenda Architect. Return only valid JSON. No markdown fences.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          ok: false,
          error: "ANTHROPIC_ERROR",
          debug: errorText.slice(0, 1200),
        },
        { status: 502 },
      );
    }

    const ai = await response.json();
    const text = extractText(ai);
    const parsed = tryParseJsonObject(text) || fallbackResult(text);

    const result = {
      title: cleanText(parsed.title || "Στρατηγική Αναδιάταξη Ημέρας", 200),
      displayText: cleanText(parsed.displayText || parsed.display_text || text, 6000),
      chatContext: {
        coreDiagnosis: cleanText(parsed.chatContext?.coreDiagnosis || parsed.chat_context?.coreDiagnosis, 1200),
        herestheticMove: cleanText(parsed.chatContext?.herestheticMove || parsed.chat_context?.herestheticMove, 1200),
        agendaCreationRoute: cleanText(parsed.chatContext?.agendaCreationRoute || parsed.chat_context?.agendaCreationRoute, 1200),
        connectedMicroAgendas: Array.isArray(parsed.chatContext?.connectedMicroAgendas)
          ? parsed.chatContext.connectedMicroAgendas.slice(0, 6).map((v: unknown) => cleanText(v, 200)).filter(Boolean)
          : [],
        firstMove: cleanText(parsed.chatContext?.firstMove || parsed.chat_context?.firstMove, 1200),
        trap: cleanText(parsed.chatContext?.trap || parsed.chat_context?.trap, 1200),
        followups: Array.isArray(parsed.chatContext?.followups)
          ? parsed.chatContext.followups.slice(0, 4).map((v: unknown) => cleanText(v, 220)).filter(Boolean)
          : [
              "Μετάτρεψέ το σε γραμμή 24ώρου.",
              "Ποια είναι η παγίδα των αντιπάλων;",
              "Πώς το λέει ο αρχηγός χωρίς να φανεί παλιό;",
            ],
      },
      generatedAt: new Date().toISOString(),
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      usage: ai.usage || null,
    };

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.name === "AbortError" ? "AI_TIMEOUT" : "AI_CONNECTION_ERROR",
        message: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}
