"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Scenario = {
  name?: string;
  move?: string;
  likely_gain?: string;
  likely_risk?: string;
  audience_effect?: string;
  opponent_response?: string;
  media_response?: string;
  recommendation?: "prefer" | "acceptable" | "avoid" | string;
};

type StrategicBrief = {
  issue?: {
    topic?: string;
    plain_title?: string;
    agenda_status?: string;
    urgency?: string;
    dominant_frame?: string;
    priming_risk?: string;
    political_risk?: string;
    opportunity?: string;
    affected_audiences?: string[];
    documentation_level?: string;
  };
  daily_brief?: {
    headline?: string;
    what_is_happening?: string;
    why_it_matters_now?: string;
    immediate_recommendation?: string;
    avoid_today?: string;
  };
  strategic_diagnosis?: {
    agenda_reading?: string;
    framing_diagnosis?: string;
    priming_risk?: string;
    audience_reading?: string;
    persuasion_reading?: string;
    strategic_opportunity?: string;
    strategic_risk?: string;
    recommended_posture?: string;
    recommended_posture_explanation?: string;
  };
  scenarios?: Scenario[];
  message_package?: {
    central_line?: string;
    institutional_version?: string;
    human_version?: string;
    sharp_version?: string;
    social_post?: string;
    answer_if_attacked?: string;
    words_to_use?: string[];
    words_to_avoid?: string[];
  };
  action_plan?: {
    now?: string[];
    next_24h?: string[];
    next_48h?: string[];
    this_week?: string[];
    owner_suggestion?: string;
  };
  monitoring_plan?: {
    watch_topics?: string[];
    watch_actors?: string[];
    watch_media?: string[];
    escalation_triggers?: string[];
  };
  evidence?: {
    basis?: string;
    data_points?: string[];
    uncertainty?: string;
    documentation_level?: string;
  };
};

type Profile = {
  org_name?: string;
  org_type?: string;
  profile_source?: string;
  profile_review_status?: string;
  party_profile_snapshot?: {
    party_key?: string;
    party_name?: string;
    short_name?: string;
    logo_url?: string | null;
    brand_color?: string | null;
  };
  party_key?: string;
  [key: string]: unknown;
};

type AgendaUsedRow = {
  topic?: string;
  article_count?: number | null;
  source_count?: number | null;
  political_articles?: number | null;
  agenda_score?: number | null;
  documentation_level?: string | null;
  political_risk_level?: string | null;
  framing_summary?: string | null;
  recommended_action?: string | null;
  avoid_action?: string | null;
  top_sources?: unknown;
  top_evidence_articles?: unknown;
  evidence_summary?: string | null;
};

type ActorTrendRow = {
  actor_key?: string | null;
  party_key?: string | null;
  party_label?: string | null;
  poll_count?: number | null;
  avg_value?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  avg_reported_change?: number | null;
  best_rank?: number | null;
  worst_rank?: number | null;
  latest_value?: number | null;
  latest_rank?: number | null;
  latest_poll?: string | null;
  latest_fieldwork_end?: string | null;
  trend_reading?: string | null;
  signal_strength?: string | null;
};

type RecentPollRow = {
  survey_id?: string | null;
  survey_label?: string | null;
  pollster?: string | null;
  commissioner?: string | null;
  publication_name?: string | null;
  fieldwork_start?: string | null;
  fieldwork_end?: string | null;
  published_at?: string | null;
  sample_size?: number | null;
  survey_type?: string | null;
  documentation_level?: string | null;
  verification_status?: string | null;
  result_count?: number | null;
  results?: unknown;
};

type PoliticalEnvironment = {
  snapshot_id?: string | null;
  snapshot_date?: string | null;
  title?: string | null;
  summary?: string | null;
  plain_language_summary?: string | null;
  source_type?: string | null;
  government_momentum?: string | null;
  opposition_structure?: string | null;
  dominant_dynamic?: string | null;
  party_momentum?: Record<string, unknown> | null;
  party_specific_implications?: Record<string, unknown> | null;
  strategic_implications?: unknown;
  source_urls?: unknown;
  documentation_level?: string | null;
  verification_status?: string | null;
  recent_polls?: RecentPollRow[] | null;
  actor_trends?: ActorTrendRow[] | null;
};

type ApiResponse = {
  profile?: Profile | null;
  strategic_brief?: StrategicBrief;
  agenda_used?: AgendaUsedRow[];
  political_environment?: PoliticalEnvironment | null;
  political_environment_status?: string;
  source?: string;
};

type StrategyChatResponse = {
  answer?: string;
};

type TabId = "today" | "diagnosis" | "scenarios" | "messages" | "plan";

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  { id: "today", label: "Σήμερα", description: "Η άμεση πολιτική ανάγνωση." },
  { id: "diagnosis", label: "Διάγνωση", description: "Τι σημαίνει στρατηγικά." },
  { id: "scenarios", label: "Σενάρια", description: "Τι γίνεται αν κινηθούμε διαφορετικά." },
  { id: "messages", label: "Μηνύματα", description: "Τι μπορούμε να πούμε δημόσια." },
  { id: "plan", label: "Πλάνο", description: "Τι κάνουμε τώρα και μετά." },
];

function text(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function list(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function recommendationLabel(value?: string) {
  if (value === "prefer") return "Προτεινόμενο";
  if (value === "acceptable") return "Αποδεκτό";
  if (value === "avoid") return "Να αποφευχθεί";
  return "Σενάριο";
}

function recommendationClass(value?: string) {
  if (value === "prefer") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (value === "acceptable") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (value === "avoid") return "border-red-300/25 bg-red-300/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-zinc-200";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function documentationLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("high") || normalized.includes("strong") || normalized.includes("ισχυ")) {
    return "Ισχυρή τεκμηρίωση";
  }

  if (normalized.includes("medium") || normalized.includes("μεσα")) {
    return "Μεσαία τεκμηρίωση";
  }

  if (normalized.includes("low") || normalized.includes("initial") || normalized.includes("starter") || normalized.includes("αρχ")) {
    return "Αρχική τεκμηρίωση";
  }

  return "Τεκμηρίωση υπό έλεγχο";
}

function riskLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("critical") || normalized.includes("high") || normalized.includes("υψη")) {
    return "Υψηλή ένταση";
  }

  if (normalized.includes("medium") || normalized.includes("μεσα")) {
    return "Μεσαία ένταση";
  }

  if (normalized.includes("low") || normalized.includes("χαμη")) {
    return "Χαμηλή ένταση";
  }

  return "Ένταση υπό παρακολούθηση";
}

function signalToneClass(value?: string | null) {
  const label = riskLabel(value);

  if (label.includes("Υψηλή")) return "border-red-300/25 bg-red-300/10 text-red-100";
  if (label.includes("Μεσαία")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (label.includes("Χαμηλή")) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function docToneClass(value?: string | null) {
  const label = documentationLabel(value);

  if (label.includes("Ισχυρή")) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (label.includes("Μεσαία")) return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (label.includes("Αρχική")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function evidenceArticleItems(value: unknown): Array<{ title: string; source?: string; url?: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 6)
    .map((item) => {
      if (typeof item === "string") return { title: item };

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;

        return {
          title: String(record.title || record.headline || record.url || "Άρθρο τεκμηρίωσης"),
          source: record.source ? String(record.source) : undefined,
          url: record.url || record.link ? String(record.url || record.link) : undefined,
        };
      }

      return null;
    })
    .filter((item): item is { title: string; source?: string; url?: string } => Boolean(item?.title));
}

function formatPercent(value: unknown) {
  const parsed = numberValue(value, Number.NaN);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toFixed(1).replace(".", ",")}%`;
}

function shortDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function partyImplicationText(
  environment: PoliticalEnvironment | null | undefined,
  partyKey?: string
) {
  if (!environment?.party_specific_implications || !partyKey) {
    return "";
  }

  const value = environment.party_specific_implications[partyKey];

  return typeof value === "string" ? value : "";
}

function topActorTrends(environment: PoliticalEnvironment | null | undefined) {
  return Array.isArray(environment?.actor_trends)
    ? environment.actor_trends
        .filter((trend) => trend?.actor_key && trend.actor_key !== "undecided" && trend.actor_key !== "other")
        .slice(0, 8)
    : [];
}

function recentPolls(environment: PoliticalEnvironment | null | undefined) {
  return Array.isArray(environment?.recent_polls)
    ? environment.recent_polls.slice(0, 4)
    : [];
}

function partyDisplayName(profile?: Profile | null) {
  return (
    profile?.party_profile_snapshot?.party_name ||
    profile?.org_name ||
    profile?.party_key ||
    "Μη συνδεδεμένο προφίλ"
  );
}

function partyShortName(profile?: Profile | null) {
  if (profile?.party_profile_snapshot?.short_name) {
    return profile.party_profile_snapshot.short_name;
  }

  if (profile?.party_key === "el_as") return "ΕΛ.ΑΣ";
  if (profile?.party_key === "elpida_dimokratia") return "Ελπίδα";
  if (profile?.party_key === "nd") return "ΝΔ";
  if (profile?.party_key === "pasok") return "ΠΑΣΟΚ";
  if (profile?.party_key === "syriza") return "ΣΥΡΙΖΑ";
  if (profile?.party_key === "kke") return "ΚΚΕ";

  return (
    profile?.party_profile_snapshot?.party_name ||
    profile?.org_name ||
    profile?.party_key ||
    "—"
  );
}

function partyInitials(profile?: Profile | null) {
  const shortName = partyShortName(profile);

  if (!shortName || shortName === "—") return "?";

  if (shortName.length <= 6) return shortName;

  return shortName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function hasConnectedPartyProfile(profile?: Profile | null) {
  return Boolean(
    profile?.party_key &&
      (
        profile?.party_profile_snapshot?.party_name ||
        profile?.org_name
      )
  );
}

export default function StrategyRoomPage() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  async function loadStrategy() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/advisor/strategy-brief", { cache: "no-store" });

      if (!response.ok) throw new Error(`Strategy brief API error: ${response.status}`);

      const json = (await response.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStrategy();
  }, []);

  const partyName =
    data?.profile?.party_profile_snapshot?.party_name ||
    data?.profile?.party_key ||
    data?.profile?.org_name ||
    "";

  const evidenceArticles = Array.isArray(data?.strategic_brief?.evidence?.data_points)
    ? data.strategic_brief.evidence.data_points
        .slice(0, 8)
        .map((point) => ({ title: point, source: "" }))
    : [];

  async function askNorayaAdvisor(questionOverride?: string) {
    const question = (questionOverride || chatQuestion).trim();

    if (!question) {
      setChatError("Γράψε πρώτα την ερώτηση που θέλεις να κάνεις στον σύμβουλο Noraya.");
      return;
    }

    setChatLoading(true);
    setChatError("");
    setChatAnswer("");

    try {
      const response = await fetch("/api/advisor/strategy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          profile: data?.profile || null,
          strategic_brief: data?.strategic_brief || null,
          party: partyName,
          articles: evidenceArticles,
        }),
      });

      if (!response.ok) throw new Error(`Strategy chat API error: ${response.status}`);

      const json = (await response.json()) as StrategyChatResponse;
      setChatAnswer(json.answer || "Ο σύμβουλος Noraya δεν επέστρεψε απάντηση.");
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Δεν μπόρεσε να απαντήσει ο σύμβουλος Noraya."
      );
    } finally {
      setChatLoading(false);
    }
  }

  const brief = data?.strategic_brief || {};
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const diagnosis = brief.strategic_diagnosis || {};
  const messages = brief.message_package || {};
  const actionPlan = brief.action_plan || {};
  const monitoring = brief.monitoring_plan || {};
  const evidence = brief.evidence || {};

  const politicalEnvironment = data?.political_environment || null;
  const selectedPartyKey = data?.profile?.party_key || "";
  const selectedPartyImplication = partyImplicationText(politicalEnvironment, selectedPartyKey);

  const agendaRows = Array.isArray(data?.agenda_used)
    ? data.agenda_used.filter((row) => row?.topic && row.topic !== "Μη ταξινομημένο").slice(0, 5)
    : [];

  const totalAgendaWeight = agendaRows.reduce((sum, row) => {
    return sum + Math.max(numberValue(row.agenda_score, row.article_count || 0), 1);
  }, 0);

  const rankedAgenda = agendaRows.map((row, index) => {
    const rawWeight = Math.max(numberValue(row.agenda_score, row.article_count || 0), 1);
    const share = totalAgendaWeight > 0 ? Math.round((rawWeight / totalAgendaWeight) * 100) : 0;

    return {
      ...row,
      rank: index + 1,
      weight: rawWeight,
      share,
      signalLabel: riskLabel(row.political_risk_level),
      documentationLabel: documentationLabel(row.documentation_level),
      evidenceArticles: evidenceArticleItems(row.top_evidence_articles),
    };
  });

  const connectedProfile = data?.profile || null;
  const connectedPartyName = partyDisplayName(connectedProfile);
  const connectedPartyInitials = partyInitials(connectedProfile);
  const connectedPartyLogo = connectedProfile?.party_profile_snapshot?.logo_url || "";
  const isPartyConnected = hasConnectedPartyProfile(connectedProfile);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-zinc-300">
        Ο Noraya ετοιμάζει το Strategy Room...
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#020617] text-zinc-100">
        <div className="text-xl font-semibold">Δεν φορτώθηκε το Strategy Room</div>
        <p className="mt-3 text-sm text-red-100">{error}</p>
        <button
          type="button"
          onClick={loadStrategy}
          className="mt-5 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
        >
          Δοκίμασε ξανά
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-zinc-100 md:px-8">
      <div className="relative mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="mb-5 flex items-center gap-3">
            <img src="/noraya-eye.png" alt="Noraya" className="h-11 w-11 object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-300">NORAYA</div>
              <div className="text-xs text-zinc-500">Political Strategy Room</div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                {text(issue.urgency, "watch").toUpperCase()}
              </div>
              <h1 className="max-w-5xl text-4xl font-semibold tracking-tight md:text-5xl">
                {text(daily.headline, text(issue.plain_title, "Στρατηγική ανάγνωση της πολιτικής ατζέντας"))}
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-400">
                {text(daily.what_is_happening, "Ο Noraya διαβάζει την τρέχουσα ατζέντα και τη μετατρέπει σε στρατηγική, σενάρια, μήνυμα και πλάνο δράσης.")}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-300/25 bg-cyan-300/10">
                  {connectedPartyLogo ? (
                    <img
                      src={connectedPartyLogo}
                      alt={connectedPartyName}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="px-2 text-center text-sm font-semibold text-cyan-100">
                      {connectedPartyInitials}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                    Συνδεδεμένο προφίλ
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-6 text-zinc-100">
                    {connectedPartyName}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {text(connectedProfile?.org_type, "Πολιτικός οργανισμός")}
                  </div>
                </div>
              </div>

              <div
                className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                  isPartyConnected
                    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                    : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                }`}
              >
                {isPartyConnected
                  ? `Συνδεδεμένο με party profile (${connectedProfile?.party_key}).`
                  : "Δεν έχει συνδεθεί συγκεκριμένο κόμμα. Ο Noraya θα απαντά με χαμηλότερη βεβαιότητα."}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <a
                  href="/onboarding"
                  className="inline-flex justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 hover:bg-white/[0.06]"
                >
                  Αλλαγή προφίλ
                </a>
                <a
                  href="#noraya-advisor-chat"
                  className="inline-flex justify-center rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                >
                  Ρώτησε τον σύμβουλο Noraya
                </a>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <HeroDecision
            label="Τι κάνουμε"
            textValue={text(daily.immediate_recommendation, "Κρατάμε καθαρή στρατηγική γραμμή και αποφεύγουμε βιαστική κλιμάκωση.")}
            tone="positive"
          />
          <HeroDecision
            label="Τι αποφεύγουμε"
            textValue={text(daily.avoid_today, "Αποφεύγουμε απόλυτη δημόσια θέση χωρίς επαρκή τεκμηρίωση.")}
            tone="negative"
          />
        </section>

        <AgendaRankingPanel items={rankedAgenda} />

        <PoliticalEnvironmentPanel
          environment={politicalEnvironment}
          partyName={partyName}
          partyImplication={selectedPartyImplication}
          status={data?.political_environment_status}
        />

        <section className="mb-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-5">
          <div className="grid gap-3 md:grid-cols-5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  activeTab === tab.id
                    ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-50"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:bg-white/[0.05]"
                }`}
              >
                <div className="font-semibold">{tab.label}</div>
                <div className="mt-1 text-xs leading-5 opacity-80">{tab.description}</div>
              </button>
            ))}
          </div>
        </section>

        {activeTab === "today" && (
          <section className="grid gap-5 lg:grid-cols-3">
            <Card title="Γιατί έχει σημασία τώρα">
              {text(daily.why_it_matters_now, "Το θέμα μπορεί να επηρεάσει το κριτήριο με το οποίο θα αξιολογηθεί ο οργανισμός.")}
            </Card>
            <Card title="Κυρίαρχο framing">
              {text(issue.dominant_frame, "Το framing χρειάζεται περαιτέρω ανάλυση πριν γίνει πλήρης στρατηγική κλιμάκωση.")}
            </Card>
            <Card title="Βασικό ρίσκο">
              {text(issue.political_risk, "Το βασικό ρίσκο είναι βιαστική τοποθέτηση χωρίς επαρκή τεκμηρίωση.")}
            </Card>
          </section>
        )}

        {activeTab === "diagnosis" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="Ανάγνωση ατζέντας">
              {text(diagnosis.agenda_reading, text(issue.agenda_status, "Δεν υπάρχει αρκετή στρατηγική ανάγνωση ακόμη."))}
            </Card>
            <Card title="Framing diagnosis">
              {text(diagnosis.framing_diagnosis, "Το framing χρειάζεται περαιτέρω ανάλυση.")}
            </Card>
            <Card title="Priming risk">
              {text(diagnosis.priming_risk, text(issue.priming_risk, "Δεν έχει υπολογιστεί ακόμη priming risk."))}
            </Card>
            <Card title="Στρατηγική στάση">
              <p>{text(diagnosis.recommended_posture_explanation, "Προτιμάται προσεκτική, θεσμική στάση μέχρι να ισχυροποιηθεί το σήμα.")}</p>
              <div className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                {text(diagnosis.recommended_posture, "institutional")}
              </div>
            </Card>
            <Card title="Ποια κοινά επηρεάζονται">
              <BulletList
                items={list(issue.affected_audiences)}
                fallback={["Βάση οργανισμού", "Μετριοπαθές κοινό", "Πολιτικά ενεργό κοινό"]}
              />
            </Card>
            <Card title="Ευκαιρία">
              {text(diagnosis.strategic_opportunity, text(issue.opportunity, "Υπάρχει ευκαιρία για σοβαρή και προετοιμασμένη στάση."))}
            </Card>
          </section>
        )}

        {activeTab === "scenarios" && (
          <section className="grid gap-5">
            {(brief.scenarios || []).map((scenario, index) => (
              <article
                key={`${scenario.name}-${index}`}
                className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"
              >
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">{text(scenario.name, `Σενάριο ${index + 1}`)}</h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                      {text(scenario.move, "Δεν υπάρχει περιγραφή κίνησης.")}
                    </p>
                  </div>
                  <div className={`w-fit rounded-full border px-3 py-1 text-xs ${recommendationClass(scenario.recommendation)}`}>
                    {recommendationLabel(scenario.recommendation)}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <MiniBox title="Όφελος" textValue={text(scenario.likely_gain, "—")} />
                  <MiniBox title="Ρίσκο" textValue={text(scenario.likely_risk, "—")} />
                  <MiniBox title="Κοινό" textValue={text(scenario.audience_effect, "—")} />
                  <MiniBox title="Αντίδραση" textValue={text(scenario.opponent_response, "—")} />
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === "messages" && (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Κεντρική γραμμή</div>
              <p className="mt-4 text-2xl font-semibold leading-snug">
                {text(messages.central_line, "Χρειάζεται σοβαρότητα, τεκμηρίωση και θεσμική καθαρότητα.")}
              </p>
            </div>
            <Card title="Social post">
              {text(messages.social_post, "Δεν υπάρχει ακόμη προτεινόμενο social post.")}
            </Card>
            <Card title="Θεσμική εκδοχή">
              {text(messages.institutional_version, "Δεν υπάρχει ακόμη θεσμική εκδοχή.")}
            </Card>
            <Card title="Ανθρώπινη εκδοχή">
              {text(messages.human_version, "Δεν υπάρχει ακόμη ανθρώπινη εκδοχή.")}
            </Card>
            <Card title="Sharp εκδοχή">
              {text(messages.sharp_version, "Δεν υπάρχει ακόμη sharp εκδοχή.")}
            </Card>
            <Card title="Αν μας επιτεθούν">
              {text(messages.answer_if_attacked, "Δεν υπάρχει ακόμη απάντηση σε επίθεση.")}
            </Card>
            <Card title="Λέξεις που βοηθούν">
              <BulletList
                items={list(messages.words_to_use)}
                fallback={["τεκμηρίωση", "σοβαρότητα", "θεσμική ευθύνη"]}
              />
            </Card>
            <Card title="Λέξεις που αποφεύγουμε">
              <BulletList
                items={list(messages.words_to_avoid)}
                fallback={["υπερβολή", "προσωπική επίθεση", "βεβαιότητα χωρίς στοιχεία"]}
              />
            </Card>
          </section>
        )}

        {activeTab === "plan" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="Τώρα">
              <BulletList items={list(actionPlan.now)} fallback={["Κρατήστε έτοιμη σύντομη θεσμική γραμμή."]} />
            </Card>
            <Card title="Επόμενες 24 ώρες">
              <BulletList items={list(actionPlan.next_24h)} fallback={["Παρακολουθήστε αν αλλάζει το framing."]} />
            </Card>
            <Card title="Επόμενες 48 ώρες">
              <BulletList items={list(actionPlan.next_48h)} fallback={["Αποφασίστε αν χρειάζεται κλιμάκωση."]} />
            </Card>
            <Card title="Αυτή την εβδομάδα">
              <BulletList
                items={list(actionPlan.this_week)}
                fallback={["Συνδέστε το θέμα με ευρύτερη στρατηγική μόνο αν αποκτήσει ένταση."]}
              />
            </Card>
            <Card title="Ποιος πρέπει να το σηκώσει">
              {text(actionPlan.owner_suggestion, "Προτιμάται θεσμικό πρόσωπο με ήπιο και αξιόπιστο ύφος.")}
            </Card>
            <Card title="Triggers κλιμάκωσης">
              <BulletList
                items={list(monitoring.escalation_triggers)}
                fallback={[
                  "Αύξηση κάλυψης από μέσα υψηλής βαρύτητας.",
                  "Παρέμβαση βασικού πολιτικού αντιπάλου.",
                  "Μετατόπιση framing σε ευθύνη ή λογοδοσία.",
                ]}
              />
            </Card>
          </section>
        )}

        <section
          id="noraya-advisor-chat"
          className="mt-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-6"
        >
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Noraya Advisor</div>
              <h2 className="mt-3 text-2xl font-semibold">Ρώτησε τον σύμβουλο Noraya</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Κάνε ερώτηση πάνω στο σημερινό θέμα, στα σενάρια, στη δημόσια γραμμή ή στο πλάνο
                δράσης. Ο Noraya απαντά με βάση το Strategy Room και το προφίλ του κόμματός σου.
              </p>

              {partyName ? (
                <div className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                  {partyName}
                </div>
              ) : null}

              <div className="mt-5 grid gap-2">
                {[
                  "Ποιο σενάριο έχει το μικρότερο πολιτικό ρίσκο;",
                  "Γράψε μου μια ασφαλή δημόσια δήλωση.",
                  "Τι πρέπει να κάνουμε τις επόμενες 48 ώρες;",
                  "Πώς μπορεί να απαντήσει ο αντίπαλος;",
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setChatQuestion(question);
                      askNorayaAdvisor(question);
                    }}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-white/[0.06]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  askNorayaAdvisor();
                }}
              >
                <label className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Η ερώτησή σου
                </label>
                <textarea
                  value={chatQuestion}
                  onChange={(event) => setChatQuestion(event.target.value)}
                  placeholder="Π.χ. Τι να πούμε δημόσια χωρίς να πάρουμε μεγάλο ρίσκο;"
                  className="mt-3 min-h-32 w-full resize-none rounded-2xl border border-white/10 bg-[#020617] p-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
                />
                {chatError ? <p className="mt-3 text-sm text-red-200">{chatError}</p> : null}
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="mt-4 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {chatLoading ? "Ο σύμβουλος Noraya απαντά..." : "Ρώτησε τον σύμβουλο Noraya"}
                </button>
              </form>

              {chatAnswer ? (
                <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">
                    Απάντηση συμβούλου Noraya
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-100">
                    {chatAnswer}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-zinc-500">
                  Η απάντηση θα εμφανιστεί εδώ.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              ▶ Βάση τεκμηρίωσης
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Βάση">
                {text(evidence.basis, "Η εκτίμηση βασίζεται στα διαθέσιμα agenda signals.")}
              </Card>
              <Card title="Αβεβαιότητα">
                {text(evidence.uncertainty, "Η ανάλυση χρειάζεται περισσότερα ταξινομημένα δεδομένα.")}
              </Card>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}

function PoliticalEnvironmentPanel({
  environment,
  partyName,
  partyImplication,
  status,
}: {
  environment: PoliticalEnvironment | null;
  partyName: string;
  partyImplication: string;
  status?: string;
}) {
  const trends = topActorTrends(environment);
  const polls = recentPolls(environment);

  if (!environment) {
    return (
      <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
          Πολιτικό περιβάλλον
        </div>
        <h2 className="mt-2 text-2xl font-semibold">Δεν έχει φορτωθεί ακόμη δημοσκοπικό περιβάλλον</h2>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Ο Noraya θα συνεχίσει με βάση τα agenda signals, αλλά χωρίς πλήρη δημοσκοπική εικόνα.
          {status ? ` ${status}` : ""}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
            Πολιτικό / δημοσκοπικό περιβάλλον
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            {text(environment.title, "Τρέχον πολιτικό περιβάλλον")}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-zinc-400">
            {text(
              environment.plain_language_summary || environment.summary,
              "Δεν υπάρχει ακόμη διαθέσιμη σύνοψη πολιτικού περιβάλλοντος."
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
            {shortDate(environment.snapshot_date)}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs ${docToneClass(environment.documentation_level)}`}>
            {documentationLabel(environment.documentation_level)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.045] p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">
            Τι σημαίνει για {partyName || "το κόμμα του χρήστη"}
          </div>
          <p className="mt-3 text-sm leading-7 text-zinc-200">
            {text(
              partyImplication,
              "Δεν υπάρχει ακόμη ειδική ανάγνωση για αυτό το κόμμα. Ο Noraya χρησιμοποιεί το γενικό πολιτικό περιβάλλον με χαμηλότερη βεβαιότητα."
            )}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Βασική δυναμική
          </div>
          <p className="mt-3 text-sm leading-7 text-zinc-300">
            {text(environment.dominant_dynamic, "Η βασική δυναμική δεν έχει ακόμη υπολογιστεί.")}
          </p>
          <div className="mt-4 grid gap-2">
            <MiniLine title="Κυβερνητικό momentum" value={text(environment.government_momentum, "—")} />
            <MiniLine title="Δομή αντιπολίτευσης" value={text(environment.opposition_structure, "—")} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Τελευταίες δημοσκοπήσεις
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              {polls.length} μετρήσεις
            </div>
          </div>

          {polls.length ? (
            <div className="grid gap-2">
              {polls.map((poll, index) => (
                <div
                  key={`${poll.survey_id || poll.survey_label}-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="text-sm font-medium text-zinc-200">
                    {text(poll.survey_label, `${poll.pollster || "Δημοσκόπηση"} / ${poll.commissioner || "—"}`)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Δείγμα: {poll.sample_size || "—"} · αποτελέσματα: {poll.result_count || "—"} · έως {shortDate(poll.fieldwork_end)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-7 text-zinc-500">
              Δεν έχουν φορτωθεί ακόμη structured polling records.
            </p>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Τάσεις κομμάτων / actors
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              Top {trends.length}
            </div>
          </div>

          {trends.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {trends.map((trend) => (
                <div
                  key={trend.actor_key || trend.party_label || "actor"}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">
                        {trend.party_label || trend.actor_key}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {trend.trend_reading || "Χωρίς τάση"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-cyan-100">
                        {formatPercent(trend.avg_value)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        μ.ό. {trend.poll_count || 0} μετρ.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-400">
                      τελευταία: {formatPercent(trend.latest_value)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-400">
                      θέση #{trend.latest_rank || "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-7 text-zinc-500">
              Δεν έχουν υπολογιστεί ακόμη τάσεις κομμάτων.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function AgendaRankingPanel({
  items,
}: {
  items: Array<
    AgendaUsedRow & {
      rank: number;
      share: number;
      signalLabel: string;
      documentationLabel: string;
      evidenceArticles: Array<{ title: string; source?: string; url?: string }>;
    }
  >;
}) {
  if (!items.length) {
    return (
      <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
              Ιεράρχηση ατζέντας
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Δεν υπάρχουν ακόμη αρκετά ταξινομημένα θέματα</h2>
          </div>
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            Υπό επεξεργασία
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-zinc-400">
          Ο Noraya χρειάζεται περισσότερα ταξινομημένα άρθρα για να εμφανίσει αξιόπιστη ιεράρχηση ατζέντας,
          ένταση σήματος και βάση τεκμηρίωσης.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
            Ιεράρχηση ατζέντας
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Τι ανεβαίνει σήμερα</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
            Η βαρύτητα δεν είναι εκλογικό ποσοστό. Είναι σχετική ένδειξη ατζέντας με βάση άρθρα,
            πηγές, πολιτική συνάφεια, ένταση και διαθέσιμη τεκμηρίωση.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-zinc-300">
          Top {items.length} agenda signals
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((item) => {
          const barWidth = `${Math.max(item.share, 8)}%`;

          return (
            <article
              key={`${item.topic}-${item.rank}`}
              className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                      #{item.rank}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-100">
                        {item.topic}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.article_count || 0} άρθρα · {item.source_count || 0} πηγές · {item.political_articles || 0} πολιτικά άρθρα
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>Σχετική βαρύτητα ατζέντας</span>
                      <span className="font-medium text-zinc-300">{item.share}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: barWidth }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                  <span className={`rounded-full border px-3 py-1 text-xs ${signalToneClass(item.political_risk_level)}`}>
                    {item.signalLabel}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs ${docToneClass(item.documentation_level)}`}>
                    {item.documentationLabel}
                  </span>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-300">
                  Από πού προκύπτει αυτό;
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Ανάγνωση / framing
                    </div>
                    <p className="mt-2 text-sm leading-7 text-zinc-300">
                      {text(
                        item.framing_summary,
                        "Δεν υπάρχει ακόμη πλήρης framing ανάλυση για αυτό το θέμα."
                      )}
                    </p>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Προτεινόμενη προσοχή
                    </div>
                    <p className="mt-2 text-sm leading-7 text-zinc-300">
                      {text(
                        item.evidence_summary || item.recommended_action,
                        "Χρειάζεται παρακολούθηση μέχρι να ισχυροποιηθεί το σήμα."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Άρθρα / στοιχεία βάσης
                  </div>

                  {item.evidenceArticles.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {item.evidenceArticles.map((article, index) => (
                        <div
                          key={`${article.title}-${index}`}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300"
                        >
                          {article.url ? (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-100 hover:text-cyan-200"
                            >
                              {article.title}
                            </a>
                          ) : (
                            <span>{article.title}</span>
                          )}
                          {article.source ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {article.source}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-zinc-500">
                      Δεν έχουν επιστραφεί ακόμη συγκεκριμένα άρθρα για αυτό το θέμα.
                    </p>
                  )}
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HeroDecision({ label, textValue, tone }: { label: string; textValue: string; tone: "positive" | "negative" }) {
  return (
    <div
      className={`rounded-[2rem] border p-6 ${
        tone === "positive" ? "border-emerald-300/25 bg-emerald-300/10" : "border-red-300/20 bg-red-300/10"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <p className="mt-4 text-lg font-medium leading-8 text-zinc-100">{textValue}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">{title}</div>
      <div className="mt-3 text-sm leading-7 text-zinc-300">{children}</div>
    </section>
  );
}

function MiniBox({ title, textValue }: { title: string; textValue: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">{title}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{textValue}</p>
    </div>
  );
}

function MiniLine({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      <div className="mt-2 text-sm leading-6 text-zinc-300">{value}</div>
    </div>
  );
}

function BulletList({ items, fallback }: { items: string[]; fallback: string[] }) {
  const values = items.length > 0 ? items : fallback;

  return (
    <ul className="grid gap-2">
      {values.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
