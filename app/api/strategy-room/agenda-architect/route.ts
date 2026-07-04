import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
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

function extractBetween(text: string, start: string, end: string) {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s === -1 || e === -1 || e <= s) return "";
  return text.slice(s + start.length, e).trim();
}

function cleanDisplayText(text: string) {
  const display = extractBetween(text, "<displayText>", "</displayText>");
  const raw = display || text;

  // Safety: if the model still returned JSON, recover displayText instead of showing raw JSON.
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.displayText === "string") return parsed.displayText.trim();
    if (typeof parsed?.display_text === "string") return parsed.display_text.trim();
  } catch {}

  return raw
    .replace(/<context>[\s\S]*?<\/context>/gi, "")
    .replace(/<\/?displayText>/gi, "")
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/```$/i, "")
    .trim()
    .slice(0, 6500);
}

function contextValue(context: string, key: string) {
  const re = new RegExp(`${key}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Za-zΑ-Ωα-ω_]+\\s*:|$)`, "i");
  const match = context.match(re);
  return cleanText(match?.[1] || "", 1400);
}

function contextList(context: string, key: string) {
  const value = contextValue(context, key);
  if (!value) return [];
  return value
    .split(/[,\n•;-]+/)
    .map((item) => cleanText(item, 220))
    .filter(Boolean)
    .slice(0, 6);
}

function compactAgendaOverview(rows: any[]) {
  return rows.slice(0, 14).map((row: any) => ({
    topic: row?.topic,
    score: row?.strategic_index_score ?? row?.agenda_score,
    signal_label: row?.strategic_index_label ?? row?.signal_label,
    coverage_level: row?.coverage_level,
    documentation_level: row?.documentation_level,
    opportunity_label: row?.opportunity_label,
    active_micro_agenda: row?.active_micro_agenda,
    micro_agendas: Array.isArray(row?.micro_agendas)
      ? row.micro_agendas.slice(0, 7).map((micro: any) => ({
          title: micro?.title,
          score: micro?.score,
          eventCount: micro?.eventCount,
          statusLabel: micro?.statusLabel,
          evidenceLabel: micro?.evidenceLabel,
        }))
      : [],
    related_events: Array.isArray(row?.related_events)
      ? row.related_events.slice(0, 8).map((event: any) => ({
          title: event?.title,
          micro_agenda: event?.micro_agenda,
          score: event?.event_score,
          article_count: event?.article_count,
          source_count: event?.source_count,
        }))
      : [],
  }));
}

function compactProbeAgendaMap(rows: any[]) {
  return rows.slice(0, 20).map((item: any) => ({
    title: item?.title,
    parentTopics: item?.parentTopics,
    score: item?.score,
    statusLabel: item?.statusLabel,
    evidenceLabel: item?.evidenceLabel,
    events: Array.isArray(item?.events)
      ? item.events.slice(0, 5).map((event: any) => ({
          title: event?.title,
          score: event?.event_score,
          article_count: event?.article_count,
          source_count: event?.source_count,
        }))
      : [],
    signals: item?.raw
      ? {
          real_news_coverage_score: item.raw.real_news_coverage_score,
          real_trend_score: item.raw.real_trend_score,
          real_frontpage_prominence_score: item.raw.real_frontpage_prominence_score,
          freshness_score: item.raw.freshness_score,
          documentation_score: item.raw.documentation_score,
          article_count: item.raw.article_count,
          source_count: item.raw.source_count,
        }
      : null,
  }));
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

  const partyKey = String(
    body.party_key ||
      body.profile?.party_key ||
      body.profile?.party_profile_snapshot?.party_key ||
      "",
  ).trim();
  let institutionalBlock = "";
  if (partyKey) {
    try {
      const { data: profRows } = await svcClient()
        .from("political_party_profiles")
        .select("strategic_positioning, advisor_instructions, issue_lens")
        .eq("party_key", partyKey)
        .limit(1);
      const prof: any = Array.isArray(profRows) ? profRows[0] : null;
      if (prof) {
        const pos = (prof.strategic_positioning || "").toString().trim();
        const adv = (prof.advisor_instructions || "").toString().trim();
        const lens = prof.issue_lens ? JSON.stringify(prof.issue_lens) : "";
        institutionalBlock =
          (pos ? "ΘΕΣΜΙΚΗ ΘΕΣΗ: " + pos + "\n" : "") +
          (adv ? "ΤΑΥΤΟΤΗΤΑ & ΟΔΗΓΙΕΣ:\n" + adv + "\n" : "") +
          (lens ? "ΔΟΜΗΜΕΝΟΣ ΦΑΚΟΣ ΑΝΑ ΘΕΜΑ (JSON): " + lens : "");
      }
    } catch {
      /* συνεχιζουμε χωρις */
    }
  }

  const prompt = `Είσαι ο κορυφαίος πολιτικός στρατηγικός σύμβουλος της Noraya.

Αποστολή: γράψε την premium ανάλυση "Στρατηγική Αναδιάταξη Ημέρας" για το ${party}.

Δεν κάνεις περίληψη. Δεν κάνεις dashboard analysis. Κάνεις heresthetic analysis με την έννοια του William Riker: βρίσκεις πώς αλλάζει η διάσταση της σύγκρουσης ώστε το κόμμα να δημιουργήσει ατζέντα, όχι απλώς να ακολουθήσει την επικαιρότητα.

ΔΕΔΟΜΕΝΑ:
ΚΟΜΜΑ / PROFILE:
${safeJson(profile, 7000)}
${institutionalBlock ? "\nΘΕΣΜΙΚΗ ΘΕΣΗ & ΤΑΥΤΟΤΗΤΑ (ΚΡΙΣΙΜΟ):\n" + institutionalBlock : ""}

ΣΥΝΟΛΙΚΗ ΕΙΚΟΝΑ ΘΕΜΑΤΙΚΩΝ:
${safeJson(compactAgendaOverview(agendaOverview), 13000)}

MICRO-AGENDA FIELD MAP:
${safeJson(compactProbeAgendaMap(probeAgendaMap), 15000)}

ΠΟΛΙΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ:
${safeJson(politicalEnvironment, 6000)}

STRATEGIC BRIEF:
${safeJson(strategicBrief, 5000)}

ΚΑΝΟΝΕΣ:
- ΘΕΣΜΙΚΗ ΣΥΜΒΑΤΟΤΗΤΑ (ΚΟΡΥΦΑΙΟΣ): πρότεινε ΜΟΝΟ κινήσεις που το κόμμα ΜΠΟΡΕΙ να κάνει βάσει της ΘΕΣΜΙΚΗΣ ΘΕΣΗΣ. Αν είναι ΕΚΤΟΣ Βουλής, ΚΑΜΙΑ κοινοβουλευτική ενέργεια (ερωτήσεις/επερωτήσεις/τροπολογίες/κατάθεση στη Βουλή)· χρησιμοποίησε τον «φακό ανά θέμα» (issue_lens).
- ΟΡΙΟ ΠΕΡΙΕΧΟΜΕΝΟΥ: Αποτύπωσε τη στρατηγική ΓΡΑΜΜΗ και το ΥΦΟΣ του κόμματος (ακόμη κι αν είναι σκληρό/εθνικό/ριζοσπαστικό). ΑΛΛΑ ΜΗΝ παράγεις ρατσιστικό, μισαλλόδοξο ή υβριστικό περιεχόμενο, ούτε ρητορική μίσους ή στοχοποίηση ομάδων — πλαισίωσε/περίγραψε τη γραμμή, χωρίς να αναπαράγεις το μίσος.
- Γράψε ελληνικά.
- Περίπου 350-470 λέξεις.
- Όχι raw JSON. Όχι markdown table. Όχι bullet list ως βασική μορφή.
- Όχι τεχνικά labels τύπου Search, Boost, Raw Signal.
- Μην παρουσιάσεις scores ως δημόσια επιχειρήματα. Χρησιμοποίησέ τα ως εσωτερικά σήματα.
- Να ενώνεις 2-5 micro-agendas σε ένα ενιαίο πολιτικό ερώτημα.
- Να λες ποιο θέμα είναι ήδη κλειδωμένο από την επικαιρότητα και πού υπάρχει ανοιχτό πεδίο agenda-setting.
- Να δώσεις καθαρή heresthetic κίνηση: ποια διάσταση αλλάζουμε.
- Να δώσεις πρώτη κίνηση 24ώρου χωρίς generic "βγάλε ανακοίνωση".
- Να δείξεις την παγίδα ειδικά για το κόμμα.
- Ύφος: κλειστό επιτελικό δωμάτιο, υψηλή πολιτική οξυδέρκεια, όχι ακαδημαϊκή φλυαρία.

ΑΠΑΝΤΗΣΕ ΑΚΡΙΒΩΣ ΜΕ ΑΥΤΗ ΤΗ ΜΟΡΦΗ:

<displayText>
[εδώ το καθαρό κείμενο που θα εμφανιστεί στο UI]
</displayText>

<context>
coreDiagnosis: [μία πρόταση]
herestheticMove: [μία πρόταση]
agendaCreationRoute: [μία πρόταση]
connectedMicroAgendas: [λίστα ονομάτων χωρισμένη με κόμμα]
firstMove: [μία πρόταση]
trap: [μία πρόταση]
</context>`;

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
        max_tokens: 2200,
        system:
          "You are Noraya Agenda Architect. Follow the exact XML-like output tags. Never return raw JSON.",
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
    const displayText = cleanDisplayText(text);
    const context = extractBetween(text, "<context>", "</context>");

    return NextResponse.json({
      ok: true,
      title: "Στρατηγική Αναδιάταξη Ημέρας",
      displayText,
      chatContext: {
        coreDiagnosis: contextValue(context, "coreDiagnosis") || displayText.slice(0, 600),
        herestheticMove: contextValue(context, "herestheticMove"),
        agendaCreationRoute: contextValue(context, "agendaCreationRoute"),
        connectedMicroAgendas: contextList(context, "connectedMicroAgendas"),
        firstMove: contextValue(context, "firstMove"),
        trap: contextValue(context, "trap"),
        followups: [],
      },
      generatedAt: new Date().toISOString(),
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      usage: ai.usage || null,
    });
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
