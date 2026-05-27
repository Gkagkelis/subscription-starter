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
  conversation_id?: string;
};

type TabId = "today" | "diagnosis" | "scenarios" | "messages" | "plan";

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  { id: "today", label: "ΈΘΈ°ΈΦΈΒœ¹Έ±", description: "Έ½ Έ§ΈΦΈΒœÉΈΖ œÄΈΩΈΜΈΙœ³ΈΙΈΚΈ° Έ±ΈΫΈ§Έ≥ΈΫœâœÉΈΖ." },
  { id: "diagnosis", label: "ΈîΈΙΈ§Έ≥ΈΫœâœÉΈΖ", description: "ΈΛΈΙ œÉΈΖΈΦΈ±Έ·ΈΫΈΒΈΙ œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ§." },
  { id: "scenarios", label: "ΈΘΈΒΈΫΈ§œ¹ΈΙΈ±", description: "ΈΛΈΙ Έ≥Έ·ΈΫΈΒœ³Έ±ΈΙ Έ±ΈΫ ΈΚΈΙΈΫΈΖΈΗΈΩœçΈΦΈΒ Έ¥ΈΙΈ±œÜΈΩœ¹ΈΒœ³ΈΙΈΚΈ§." },
  { id: "messages", label: "Έ€ΈΖΈΫœçΈΦΈ±œ³Έ±", description: "ΈΛΈΙ ΈΦœÄΈΩœ¹ΈΩœçΈΦΈΒ ΈΫΈ± œÄΈΩœçΈΦΈΒ Έ¥ΈΖΈΦœ¨œÉΈΙΈ±." },
  { id: "plan", label: "Έ†ΈΜΈ§ΈΫΈΩ", description: "ΈΛΈΙ ΈΚΈ§ΈΫΈΩœÖΈΦΈΒ œ³œéœ¹Έ± ΈΚΈ±ΈΙ ΈΦΈΒœ³Έ§." },
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
  if (value === "prefer") return "Έ†œ¹ΈΩœ³ΈΒΈΙΈΫœ¨ΈΦΈΒΈΫΈΩ";
  if (value === "acceptable") return "ΈëœÄΈΩΈ¥ΈΒΈΚœ³œ¨";
  if (value === "avoid") return "ΈùΈ± Έ±œÄΈΩœÜΈΒœÖœ΅ΈΗΈΒΈ·";
  return "ΈΘΈΒΈΫΈ§œ¹ΈΙΈΩ";
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

  if (normalized.includes("high") || normalized.includes("strong") || normalized.includes("ΈΙœÉœ΅œÖ")) {
    return "ΈôœÉœ΅œÖœ¹Έ° œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ";
  }

  if (normalized.includes("medium") || normalized.includes("ΈΦΈΒœÉΈ±")) {
    return "Έ€ΈΒœÉΈ±Έ·Έ± œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ";
  }

  if (normalized.includes("low") || normalized.includes("initial") || normalized.includes("starter") || normalized.includes("Έ±œ¹œ΅")) {
    return "Έëœ¹œ΅ΈΙΈΚΈ° œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ";
  }

  return "ΈΛΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ œÖœÄœ¨ Έ≠ΈΜΈΒΈ≥œ΅ΈΩ";
}

function riskLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("critical") || normalized.includes("high") || normalized.includes("œÖœàΈΖ")) {
    return "ΈΞœàΈΖΈΜΈ° Έ≠ΈΫœ³Έ±œÉΈΖ";
  }

  if (normalized.includes("medium") || normalized.includes("ΈΦΈΒœÉΈ±")) {
    return "Έ€ΈΒœÉΈ±Έ·Έ± Έ≠ΈΫœ³Έ±œÉΈΖ";
  }

  if (normalized.includes("low") || normalized.includes("œ΅Έ±ΈΦΈΖ")) {
    return "ΈßΈ±ΈΦΈΖΈΜΈ° Έ≠ΈΫœ³Έ±œÉΈΖ";
  }

  return "ΈàΈΫœ³Έ±œÉΈΖ œÖœÄœ¨ œÄΈ±œ¹Έ±ΈΚΈΩΈΜΈΩœçΈΗΈΖœÉΈΖ";
}

function signalToneClass(value?: string | null) {
  const label = riskLabel(value);

  if (label.includes("ΈΞœàΈΖΈΜΈ°")) return "border-red-300/25 bg-red-300/10 text-red-100";
  if (label.includes("Έ€ΈΒœÉΈ±Έ·Έ±")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (label.includes("ΈßΈ±ΈΦΈΖΈΜΈ°")) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function docToneClass(value?: string | null) {
  const label = documentationLabel(value);

  if (label.includes("ΈôœÉœ΅œÖœ¹Έ°")) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (label.includes("Έ€ΈΒœÉΈ±Έ·Έ±")) return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (label.includes("Έëœ¹œ΅ΈΙΈΚΈ°")) return "border-amber-300/25 bg-amber-300/10 text-amber-100";

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
          title: String(record.title || record.headline || record.url || "ΈÜœ¹ΈΗœ¹ΈΩ œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖœ²"),
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
  if (!Number.isFinite(parsed)) return "βÄî";
  return `${parsed.toFixed(1).replace(".", ",")}%`;
}

function shortDate(value?: string | null) {
  if (!value) return "βÄî";

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
    "Έ€ΈΖ œÉœÖΈΫΈ¥ΈΒΈ¥ΈΒΈΦΈ≠ΈΫΈΩ œÄœ¹ΈΩœÜΈ·ΈΜ"
  );
}

function partyShortName(profile?: Profile | null) {
  if (profile?.party_profile_snapshot?.short_name) {
    return profile.party_profile_snapshot.short_name;
  }

  if (profile?.party_key === "el_as") return "ΈïΈ¦.ΈëΈΘ";
  if (profile?.party_key === "elpida_dimokratia") return "ΈïΈΜœÄΈ·Έ¥Έ±";
  if (profile?.party_key === "nd") return "ΈùΈî";
  if (profile?.party_key === "pasok") return "Έ†ΈëΈΘΈüΈö";
  if (profile?.party_key === "syriza") return "ΈΘΈΞΈΓΈôΈ•Έë";
  if (profile?.party_key === "kke") return "ΈöΈöΈï";

  return (
    profile?.party_profile_snapshot?.party_name ||
    profile?.org_name ||
    profile?.party_key ||
    "βÄî"
  );
}

function partyInitials(profile?: Profile | null) {
  const shortName = partyShortName(profile);

  if (!shortName || shortName === "βÄî") return "?";

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
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = { current: null as HTMLDivElement | null };

  async function loadStrategy() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/advisor/strategy-brief", { cache: "no-store" });

if (response.status === 401) {
  window.location.href = "/signin/password_signin?next=/strategy-room";
  return;
}

if (response.status === 409) {
  window.location.href = "/onboarding";
  return;
}

if (!response.ok) {
  throw new Error(`Strategy brief API error: ${response.status}`);
}

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
      setChatError("Έ™œ¹Έ§œàΈΒ œÄœ¹œéœ³Έ± œ³ΈΖΈΫ ΈΒœ¹œéœ³ΈΖœÉΈΖ œÄΈΩœÖ ΈΗΈ≠ΈΜΈΒΈΙœ² ΈΫΈ± ΈΚΈ§ΈΫΈΒΈΙœ² œÉœ³ΈΩΈΫ œÉœçΈΦΈ≤ΈΩœÖΈΜΈΩ Noraya.");
      return;
    }

    // Add user message to chat immediately
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatQuestion("");
    setChatLoading(true);
    setChatError("");

    try {
      const response = await fetch("/api/advisor/strategy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          conversation_id: conversationId,
          profile: data?.profile || null,
          strategic_brief: data?.strategic_brief || null,
          party: partyName,
          articles: evidenceArticles,
        }),
      });

      if (!response.ok) throw new Error(`Strategy chat API error: ${response.status}`);

      const json = (await response.json()) as StrategyChatResponse;
      const answer = json.answer || "Έü œÉœçΈΦΈ≤ΈΩœÖΈΜΈΩœ² Noraya Έ¥ΈΒΈΫ ΈΒœÄΈ≠œÉœ³œ¹ΈΒœàΈΒ Έ±œÄΈ§ΈΫœ³ΈΖœÉΈΖ.";

      // Save conversation_id for continuity
      if (json.conversation_id) {
        setConversationId(json.conversation_id);
      }

      // Add assistant message to chat
      setChatMessages((prev) => [...prev, { role: "assistant", content: answer }]);

      // Scroll to bottom
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "ΈîΈΒΈΫ ΈΦœÄœ¨œ¹ΈΒœÉΈΒ ΈΫΈ± Έ±œÄΈ±ΈΫœ³Έ°œÉΈΒΈΙ ΈΩ œÉœçΈΦΈ≤ΈΩœÖΈΜΈΩœ² Noraya."
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
    ? data.agenda_used.filter((row) => row?.topic && row.topic !== "Έ€ΈΖ œ³Έ±ΈΨΈΙΈΫΈΩΈΦΈΖΈΦΈ≠ΈΫΈΩ").slice(0, 5)
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
        Έü Noraya ΈΒœ³ΈΩΈΙΈΦΈ§ΈΕΈΒΈΙ œ³ΈΩ Strategy Room...
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#020617] text-zinc-100">
        <div className="text-xl font-semibold">ΈîΈΒΈΫ œÜΈΩœ¹œ³œéΈΗΈΖΈΚΈΒ œ³ΈΩ Strategy Room</div>
        <p className="mt-3 text-sm text-red-100">{error}</p>
        <button
          type="button"
          onClick={loadStrategy}
          className="mt-5 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
        >
          ΈîΈΩΈΚΈ·ΈΦΈ±œÉΈΒ ΈΨΈ±ΈΫΈ§
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
                {text(daily.headline, text(issue.plain_title, "ΈΘœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° Έ±ΈΫΈ§Έ≥ΈΫœâœÉΈΖ œ³ΈΖœ² œÄΈΩΈΜΈΙœ³ΈΙΈΚΈ°œ² Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²"))}
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-400">
                {text(daily.what_is_happening, "Έü Noraya Έ¥ΈΙΈ±Έ≤Έ§ΈΕΈΒΈΙ œ³ΈΖΈΫ œ³œ¹Έ≠œ΅ΈΩœÖœÉΈ± Έ±œ³ΈΕΈ≠ΈΫœ³Έ± ΈΚΈ±ΈΙ œ³ΈΖ ΈΦΈΒœ³Έ±œ³œ¹Έ≠œÄΈΒΈΙ œÉΈΒ œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ°, œÉΈΒΈΫΈ§œ¹ΈΙΈ±, ΈΦΈ°ΈΫœÖΈΦΈ± ΈΚΈ±ΈΙ œÄΈΜΈ§ΈΫΈΩ Έ¥œ¹Έ§œÉΈΖœ².")}
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
                    ΈΘœÖΈΫΈ¥ΈΒΈ¥ΈΒΈΦΈ≠ΈΫΈΩ œÄœ¹ΈΩœÜΈ·ΈΜ
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-6 text-zinc-100">
                    {connectedPartyName}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {text(connectedProfile?.org_type, "Έ†ΈΩΈΜΈΙœ³ΈΙΈΚœ¨œ² ΈΩœ¹Έ≥Έ±ΈΫΈΙœÉΈΦœ¨œ²")}
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
                  ? `ΈΘœÖΈΫΈ¥ΈΒΈ¥ΈΒΈΦΈ≠ΈΫΈΩ ΈΦΈΒ party profile (${connectedProfile?.party_key}).`
                  : "ΈîΈΒΈΫ Έ≠œ΅ΈΒΈΙ œÉœÖΈΫΈ¥ΈΒΈΗΈΒΈ· œÉœÖΈ≥ΈΚΈΒΈΚœ¹ΈΙΈΦΈ≠ΈΫΈΩ ΈΚœ¨ΈΦΈΦΈ±. Έü Noraya ΈΗΈ± Έ±œÄΈ±ΈΫœ³Έ§ ΈΦΈΒ œ΅Έ±ΈΦΈΖΈΜœ¨œ³ΈΒœ¹ΈΖ Έ≤ΈΒΈ≤Έ±ΈΙœ¨œ³ΈΖœ³Έ±."}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <a
                  href="/onboarding"
                  className="inline-flex justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 hover:bg-white/[0.06]"
                >
                  ΈëΈΜΈΜΈ±Έ≥Έ° œÄœ¹ΈΩœÜΈ·ΈΜ
                </a>
                <a
                  href="#noraya-advisor-chat"
                  className="inline-flex justify-center rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                >
                  ΈΓœéœ³ΈΖœÉΈΒ œ³ΈΩΈΫ œÉœçΈΦΈ≤ΈΩœÖΈΜΈΩ Noraya
                </a>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <HeroDecision
            label="ΈΛΈΙ ΈΚΈ§ΈΫΈΩœÖΈΦΈΒ"
            textValue={text(daily.immediate_recommendation, "Έöœ¹Έ±œ³Έ§ΈΦΈΒ ΈΚΈ±ΈΗΈ±œ¹Έ° œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° Έ≥œ¹Έ±ΈΦΈΦΈ° ΈΚΈ±ΈΙ Έ±œÄΈΩœÜΈΒœçΈ≥ΈΩœÖΈΦΈΒ Έ≤ΈΙΈ±œÉœ³ΈΙΈΚΈ° ΈΚΈΜΈΙΈΦΈ§ΈΚœâœÉΈΖ.")}
            tone="positive"
          />
          <HeroDecision
            label="ΈΛΈΙ Έ±œÄΈΩœÜΈΒœçΈ≥ΈΩœÖΈΦΈΒ"
            textValue={text(daily.avoid_today, "ΈëœÄΈΩœÜΈΒœçΈ≥ΈΩœÖΈΦΈΒ Έ±œÄœ¨ΈΜœÖœ³ΈΖ Έ¥ΈΖΈΦœ¨œÉΈΙΈ± ΈΗΈ≠œÉΈΖ œ΅œâœ¹Έ·œ² ΈΒœÄΈ±œ¹ΈΚΈ° œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ.")}
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
            <Card title="Έ™ΈΙΈ±œ³Έ· Έ≠œ΅ΈΒΈΙ œÉΈΖΈΦΈ±œÉΈ·Έ± œ³œéœ¹Έ±">
              {text(daily.why_it_matters_now, "ΈΛΈΩ ΈΗΈ≠ΈΦΈ± ΈΦœÄΈΩœ¹ΈΒΈ· ΈΫΈ± ΈΒœÄΈΖœ¹ΈΒΈ§œÉΈΒΈΙ œ³ΈΩ ΈΚœ¹ΈΙœ³Έ°œ¹ΈΙΈΩ ΈΦΈΒ œ³ΈΩ ΈΩœÄΈΩΈ·ΈΩ ΈΗΈ± Έ±ΈΨΈΙΈΩΈΜΈΩΈ≥ΈΖΈΗΈΒΈ· ΈΩ ΈΩœ¹Έ≥Έ±ΈΫΈΙœÉΈΦœ¨œ².")}
            </Card>
            <Card title="ΈöœÖœ¹Έ·Έ±œ¹œ΅ΈΩ framing">
              {text(issue.dominant_frame, "ΈΛΈΩ framing œ΅œ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÄΈΒœ¹Έ±ΈΙœ³Έ≠œ¹œâ Έ±ΈΫΈ§ΈΜœÖœÉΈΖ œÄœ¹ΈΙΈΫ Έ≥Έ·ΈΫΈΒΈΙ œÄΈΜΈ°œ¹ΈΖœ² œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° ΈΚΈΜΈΙΈΦΈ§ΈΚœâœÉΈΖ.")}
            </Card>
            <Card title="Έ£Έ±œÉΈΙΈΚœ¨ œ¹Έ·œÉΈΚΈΩ">
              {text(issue.political_risk, "ΈΛΈΩ Έ≤Έ±œÉΈΙΈΚœ¨ œ¹Έ·œÉΈΚΈΩ ΈΒΈ·ΈΫΈ±ΈΙ Έ≤ΈΙΈ±œÉœ³ΈΙΈΚΈ° œ³ΈΩœÄΈΩΈΗΈ≠œ³ΈΖœÉΈΖ œ΅œâœ¹Έ·œ² ΈΒœÄΈ±œ¹ΈΚΈ° œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ.")}
            </Card>
          </section>
        )}

        {activeTab === "diagnosis" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="ΈëΈΫΈ§Έ≥ΈΫœâœÉΈΖ Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²">
              {text(diagnosis.agenda_reading, text(issue.agenda_status, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±œ¹ΈΚΈΒœ³Έ° œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° Έ±ΈΫΈ§Έ≥ΈΫœâœÉΈΖ Έ±ΈΚœ¨ΈΦΈΖ."))}
            </Card>
            <Card title="Framing diagnosis">
              {text(diagnosis.framing_diagnosis, "ΈΛΈΩ framing œ΅œ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÄΈΒœ¹Έ±ΈΙœ³Έ≠œ¹œâ Έ±ΈΫΈ§ΈΜœÖœÉΈΖ.")}
            </Card>
            <Card title="Priming risk">
              {text(diagnosis.priming_risk, text(issue.priming_risk, "ΈîΈΒΈΫ Έ≠œ΅ΈΒΈΙ œÖœÄΈΩΈΜΈΩΈ≥ΈΙœÉœ³ΈΒΈ· Έ±ΈΚœ¨ΈΦΈΖ priming risk."))}
            </Card>
            <Card title="ΈΘœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° œÉœ³Έ§œÉΈΖ">
              <p>{text(diagnosis.recommended_posture_explanation, "Έ†œ¹ΈΩœ³ΈΙΈΦΈ§œ³Έ±ΈΙ œÄœ¹ΈΩœÉΈΒΈΚœ³ΈΙΈΚΈ°, ΈΗΈΒœÉΈΦΈΙΈΚΈ° œÉœ³Έ§œÉΈΖ ΈΦΈ≠œ΅œ¹ΈΙ ΈΫΈ± ΈΙœÉœ΅œÖœ¹ΈΩœÄΈΩΈΙΈΖΈΗΈΒΈ· œ³ΈΩ œÉΈ°ΈΦΈ±.")}</p>
              <div className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                {text(diagnosis.recommended_posture, "institutional")}
              </div>
            </Card>
            <Card title="Έ†ΈΩΈΙΈ± ΈΚΈΩΈΙΈΫΈ§ ΈΒœÄΈΖœ¹ΈΒΈ§ΈΕΈΩΈΫœ³Έ±ΈΙ">
              <BulletList
                items={list(issue.affected_audiences)}
                fallback={["Έ£Έ§œÉΈΖ ΈΩœ¹Έ≥Έ±ΈΫΈΙœÉΈΦΈΩœç", "Έ€ΈΒœ³œ¹ΈΙΈΩœÄΈ±ΈΗΈ≠œ² ΈΚΈΩΈΙΈΫœ¨", "Έ†ΈΩΈΜΈΙœ³ΈΙΈΚΈ§ ΈΒΈΫΈΒœ¹Έ≥œ¨ ΈΚΈΩΈΙΈΫœ¨"]}
              />
            </Card>
            <Card title="ΈïœÖΈΚΈ±ΈΙœ¹Έ·Έ±">
              {text(diagnosis.strategic_opportunity, text(issue.opportunity, "ΈΞœÄΈ§œ¹œ΅ΈΒΈΙ ΈΒœÖΈΚΈ±ΈΙœ¹Έ·Έ± Έ≥ΈΙΈ± œÉΈΩΈ≤Έ±œ¹Έ° ΈΚΈ±ΈΙ œÄœ¹ΈΩΈΒœ³ΈΩΈΙΈΦΈ±œÉΈΦΈ≠ΈΫΈΖ œÉœ³Έ§œÉΈΖ."))}
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
                    <h2 className="text-2xl font-semibold">{text(scenario.name, `ΈΘΈΒΈΫΈ§œ¹ΈΙΈΩ ${index + 1}`)}</h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                      {text(scenario.move, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ œÄΈΒœ¹ΈΙΈ≥œ¹Έ±œÜΈ° ΈΚΈ·ΈΫΈΖœÉΈΖœ².")}
                    </p>
                  </div>
                  <div className={`w-fit rounded-full border px-3 py-1 text-xs ${recommendationClass(scenario.recommendation)}`}>
                    {recommendationLabel(scenario.recommendation)}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <MiniBox title="Έ¨œÜΈΒΈΜΈΩœ²" textValue={text(scenario.likely_gain, "βÄî")} />
                  <MiniBox title="ΈΓΈ·œÉΈΚΈΩ" textValue={text(scenario.likely_risk, "βÄî")} />
                  <MiniBox title="ΈöΈΩΈΙΈΫœ¨" textValue={text(scenario.audience_effect, "βÄî")} />
                  <MiniBox title="ΈëΈΫœ³Έ·Έ¥œ¹Έ±œÉΈΖ" textValue={text(scenario.opponent_response, "βÄî")} />
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === "messages" && (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">ΈöΈΒΈΫœ³œ¹ΈΙΈΚΈ° Έ≥œ¹Έ±ΈΦΈΦΈ°</div>
              <p className="mt-4 text-2xl font-semibold leading-snug">
                {text(messages.central_line, "Έßœ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÉΈΩΈ≤Έ±œ¹œ¨œ³ΈΖœ³Έ±, œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ ΈΚΈ±ΈΙ ΈΗΈΒœÉΈΦΈΙΈΚΈ° ΈΚΈ±ΈΗΈ±œ¹œ¨œ³ΈΖœ³Έ±.")}
              </p>
            </div>
            <Card title="Social post">
              {text(messages.social_post, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ œÄœ¹ΈΩœ³ΈΒΈΙΈΫœ¨ΈΦΈΒΈΫΈΩ social post.")}
            </Card>
            <Card title="Έ‰ΈΒœÉΈΦΈΙΈΚΈ° ΈΒΈΚΈ¥ΈΩœ΅Έ°">
              {text(messages.institutional_version, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ ΈΗΈΒœÉΈΦΈΙΈΚΈ° ΈΒΈΚΈ¥ΈΩœ΅Έ°.")}
            </Card>
            <Card title="ΈëΈΫΈΗœ¹œéœÄΈΙΈΫΈΖ ΈΒΈΚΈ¥ΈΩœ΅Έ°">
              {text(messages.human_version, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ Έ±ΈΫΈΗœ¹œéœÄΈΙΈΫΈΖ ΈΒΈΚΈ¥ΈΩœ΅Έ°.")}
            </Card>
            <Card title="Sharp ΈΒΈΚΈ¥ΈΩœ΅Έ°">
              {text(messages.sharp_version, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ sharp ΈΒΈΚΈ¥ΈΩœ΅Έ°.")}
            </Card>
            <Card title="ΈëΈΫ ΈΦΈ±œ² ΈΒœÄΈΙœ³ΈΒΈΗΈΩœçΈΫ">
              {text(messages.answer_if_attacked, "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ Έ±œÄΈ§ΈΫœ³ΈΖœÉΈΖ œÉΈΒ ΈΒœÄΈ·ΈΗΈΒœÉΈΖ.")}
            </Card>
            <Card title="Έ¦Έ≠ΈΨΈΒΈΙœ² œÄΈΩœÖ Έ≤ΈΩΈΖΈΗΈΩœçΈΫ">
              <BulletList
                items={list(messages.words_to_use)}
                fallback={["œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ", "œÉΈΩΈ≤Έ±œ¹œ¨œ³ΈΖœ³Έ±", "ΈΗΈΒœÉΈΦΈΙΈΚΈ° ΈΒœÖΈΗœçΈΫΈΖ"]}
              />
            </Card>
            <Card title="Έ¦Έ≠ΈΨΈΒΈΙœ² œÄΈΩœÖ Έ±œÄΈΩœÜΈΒœçΈ≥ΈΩœÖΈΦΈΒ">
              <BulletList
                items={list(messages.words_to_avoid)}
                fallback={["œÖœÄΈΒœ¹Έ≤ΈΩΈΜΈ°", "œÄœ¹ΈΩœÉœâœÄΈΙΈΚΈ° ΈΒœÄΈ·ΈΗΈΒœÉΈΖ", "Έ≤ΈΒΈ≤Έ±ΈΙœ¨œ³ΈΖœ³Έ± œ΅œâœ¹Έ·œ² œÉœ³ΈΩΈΙœ΅ΈΒΈ·Έ±"]}
              />
            </Card>
          </section>
        )}

        {activeTab === "plan" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="ΈΛœéœ¹Έ±">
              <BulletList items={list(actionPlan.now)} fallback={["Έöœ¹Έ±œ³Έ°œÉœ³ΈΒ Έ≠œ³ΈΩΈΙΈΦΈΖ œÉœçΈΫœ³ΈΩΈΦΈΖ ΈΗΈΒœÉΈΦΈΙΈΚΈ° Έ≥œ¹Έ±ΈΦΈΦΈ°."]} />
            </Card>
            <Card title="ΈïœÄœ¨ΈΦΈΒΈΫΈΒœ² 24 œéœ¹ΈΒœ²">
              <BulletList items={list(actionPlan.next_24h)} fallback={["Έ†Έ±œ¹Έ±ΈΚΈΩΈΜΈΩœÖΈΗΈ°œÉœ³ΈΒ Έ±ΈΫ Έ±ΈΜΈΜΈ§ΈΕΈΒΈΙ œ³ΈΩ framing."]} />
            </Card>
            <Card title="ΈïœÄœ¨ΈΦΈΒΈΫΈΒœ² 48 œéœ¹ΈΒœ²">
              <BulletList items={list(actionPlan.next_48h)} fallback={["ΈëœÄΈΩœÜΈ±œÉΈ·œÉœ³ΈΒ Έ±ΈΫ œ΅œ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ ΈΚΈΜΈΙΈΦΈ§ΈΚœâœÉΈΖ."]} />
            </Card>
            <Card title="ΈëœÖœ³Έ° œ³ΈΖΈΫ ΈΒΈ≤Έ¥ΈΩΈΦΈ§Έ¥Έ±">
              <BulletList
                items={list(actionPlan.this_week)}
                fallback={["ΈΘœÖΈΫΈ¥Έ≠œÉœ³ΈΒ œ³ΈΩ ΈΗΈ≠ΈΦΈ± ΈΦΈΒ ΈΒœÖœ¹œçœ³ΈΒœ¹ΈΖ œÉœ³œ¹Έ±œ³ΈΖΈ≥ΈΙΈΚΈ° ΈΦœ¨ΈΫΈΩ Έ±ΈΫ Έ±œÄΈΩΈΚœ³Έ°œÉΈΒΈΙ Έ≠ΈΫœ³Έ±œÉΈΖ."]}
              />
            </Card>
            <Card title="Έ†ΈΩΈΙΈΩœ² œÄœ¹Έ≠œÄΈΒΈΙ ΈΫΈ± œ³ΈΩ œÉΈΖΈΚœéœÉΈΒΈΙ">
              {text(actionPlan.owner_suggestion, "Έ†œ¹ΈΩœ³ΈΙΈΦΈ§œ³Έ±ΈΙ ΈΗΈΒœÉΈΦΈΙΈΚœ¨ œÄœ¹œ¨œÉœâœÄΈΩ ΈΦΈΒ Έ°œÄΈΙΈΩ ΈΚΈ±ΈΙ Έ±ΈΨΈΙœ¨œÄΈΙœÉœ³ΈΩ œçœÜΈΩœ².")}
            </Card>
            <Card title="Triggers ΈΚΈΜΈΙΈΦΈ§ΈΚœâœÉΈΖœ²">
              <BulletList
                items={list(monitoring.escalation_triggers)}
                fallback={[
                  "ΈëœçΈΨΈΖœÉΈΖ ΈΚΈ§ΈΜœÖœàΈΖœ² Έ±œÄœ¨ ΈΦΈ≠œÉΈ± œÖœàΈΖΈΜΈ°œ² Έ≤Έ±œ¹œçœ³ΈΖœ³Έ±œ².",
                  "Έ†Έ±œ¹Έ≠ΈΦΈ≤Έ±œÉΈΖ Έ≤Έ±œÉΈΙΈΚΈΩœç œÄΈΩΈΜΈΙœ³ΈΙΈΚΈΩœç Έ±ΈΫœ³ΈΙœÄΈ§ΈΜΈΩœÖ.",
                  "Έ€ΈΒœ³Έ±œ³œ¨œÄΈΙœÉΈΖ framing œÉΈΒ ΈΒœÖΈΗœçΈΫΈΖ Έ° ΈΜΈΩΈ≥ΈΩΈ¥ΈΩœÉΈ·Έ±.",
                ]}
              />
            </Card>
          </section>
        )}

        <section
          id="noraya-advisor-chat"
          className="mt-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-6"
        >
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Noraya Advisor</div>
              <h2 className="mt-3 text-2xl font-semibold">ΈΘœçΈΦΈ≤ΈΩœÖΈΜΈΩœ² Noraya</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Έ€Έ·ΈΜΈ± ΈΒΈΜΈΒœçΈΗΈΒœ¹Έ±. Έ½ ΈΚΈΩœÖΈ≤Έ≠ΈΫœ³Έ± œÉœÖΈΫΈΒœ΅Έ·ΈΕΈΒœ³Έ±ΈΙ βÄî ΈΩ Noraya ΈΗœÖΈΦΈ§œ³Έ±ΈΙ œ³ΈΙ ΈΒΈ·œÄΈ±ΈΦΈΒ.
              </p>

              {partyName ? (
                <div className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                  {partyName}
                </div>
              ) : null}

              <div className="mt-5 grid gap-2">
                {[
                  "Έ†ΈΩΈΙΈΩ œÉΈΒΈΫΈ§œ¹ΈΙΈΩ Έ≠œ΅ΈΒΈΙ œ³ΈΩ ΈΦΈΙΈΚœ¹œ¨œ³ΈΒœ¹ΈΩ œÄΈΩΈΜΈΙœ³ΈΙΈΚœ¨ œ¹Έ·œÉΈΚΈΩ;",
                  "Έ™œ¹Έ§œàΈΒ ΈΦΈΩœÖ ΈΦΈΙΈ± Έ±œÉœÜΈ±ΈΜΈ° Έ¥ΈΖΈΦœ¨œÉΈΙΈ± Έ¥Έ°ΈΜœâœÉΈΖ.",
                  "ΈΛΈΙ œÄœ¹Έ≠œÄΈΒΈΙ ΈΫΈ± ΈΚΈ§ΈΫΈΩœÖΈΦΈΒ œ³ΈΙœ² ΈΒœÄœ¨ΈΦΈΒΈΫΈΒœ² 48 œéœ¹ΈΒœ²;",
                  "Έ†œéœ² ΈΦœÄΈΩœ¹ΈΒΈ· ΈΫΈ± Έ±œÄΈ±ΈΫœ³Έ°œÉΈΒΈΙ ΈΩ Έ±ΈΫœ³Έ·œÄΈ±ΈΜΈΩœ²;",
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => askNorayaAdvisor(question)}
                    disabled={chatLoading}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>

              {conversationId ? (
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([]);
                    setConversationId(null);
                    setChatError("");
                  }}
                  className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.06]"
                >
                  ΈùΈ≠Έ± ΈΚΈΩœÖΈ≤Έ≠ΈΫœ³Έ±
                </button>
              ) : null}
            </div>

            <div className="flex flex-col rounded-[1.5rem] border border-white/10 bg-black/25">
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: "500px", minHeight: "300px" }}>
                {chatMessages.length === 0 && !chatLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                    ΈΓœéœ³ΈΖœÉΈΒ ΈΩœ³ΈΙΈ¥Έ°œÄΈΩœ³ΈΒ œ³ΈΩΈΫ œÉœçΈΦΈ≤ΈΩœÖΈΜΈΩ Noraya.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={`msg-${index}`}
                        className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                          msg.role === "user"
                            ? "ml-8 border border-white/10 bg-white/[0.06] text-zinc-200"
                            : "mr-4 border border-cyan-300/20 bg-cyan-300/10 text-zinc-100"
                        }`}
                      >
                        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {msg.role === "user" ? "ΈïœÉœç" : "Noraya"}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    ))}
                    {chatLoading ? (
                      <div className="mr-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Noraya</div>
                        <div className="animate-pulse">ΈΘΈΚΈ≠œÜœ³ΈΩΈΦΈ±ΈΙ...</div>
                      </div>
                    ) : null}
                    <div ref={(el) => { chatEndRef.current = el; }} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-white/10 p-4">
                {chatError ? <p className="mb-3 text-sm text-red-200">{chatError}</p> : null}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    askNorayaAdvisor();
                  }}
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    value={chatQuestion}
                    onChange={(event) => setChatQuestion(event.target.value)}
                    placeholder="Έ™œ¹Έ§œàΈΒ ΈΒΈ¥œé..."
                    disabled={chatLoading}
                    className="flex-1 rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40 disabled:opacity-50"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        askNorayaAdvisor();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={chatLoading}
                    className="shrink-0 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {chatLoading ? "..." : "ΈΘœ³ΈΒΈ·ΈΜΈΒ"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              β•Ε Έ£Έ§œÉΈΖ œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖœ²
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Έ£Έ§œÉΈΖ">
                {text(evidence.basis, "Έ½ ΈΒΈΚœ³Έ·ΈΦΈΖœÉΈΖ Έ≤Έ±œÉΈ·ΈΕΈΒœ³Έ±ΈΙ œÉœ³Έ± Έ¥ΈΙΈ±ΈΗΈ≠œÉΈΙΈΦΈ± agenda signals.")}
              </Card>
              <Card title="ΈëΈ≤ΈΒΈ≤Έ±ΈΙœ¨œ³ΈΖœ³Έ±">
                {text(evidence.uncertainty, "Έ½ Έ±ΈΫΈ§ΈΜœÖœÉΈΖ œ΅œ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÄΈΒœ¹ΈΙœÉœÉœ¨œ³ΈΒœ¹Έ± œ³Έ±ΈΨΈΙΈΫΈΩΈΦΈΖΈΦΈ≠ΈΫΈ± Έ¥ΈΒΈ¥ΈΩΈΦΈ≠ΈΫΈ±.")}
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
          Έ†ΈΩΈΜΈΙœ³ΈΙΈΚœ¨ œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫ
        </div>
        <h2 className="mt-2 text-2xl font-semibold">ΈîΈΒΈΫ Έ≠œ΅ΈΒΈΙ œÜΈΩœ¹œ³œâΈΗΈΒΈ· Έ±ΈΚœ¨ΈΦΈΖ Έ¥ΈΖΈΦΈΩœÉΈΚΈΩœÄΈΙΈΚœ¨ œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫ</h2>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Έü Noraya ΈΗΈ± œÉœÖΈΫΈΒœ΅Έ·œÉΈΒΈΙ ΈΦΈΒ Έ≤Έ§œÉΈΖ œ³Έ± agenda signals, Έ±ΈΜΈΜΈ§ œ΅œâœ¹Έ·œ² œÄΈΜΈ°œ¹ΈΖ Έ¥ΈΖΈΦΈΩœÉΈΚΈΩœÄΈΙΈΚΈ° ΈΒΈΙΈΚœ¨ΈΫΈ±.
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
            Έ†ΈΩΈΜΈΙœ³ΈΙΈΚœ¨ / Έ¥ΈΖΈΦΈΩœÉΈΚΈΩœÄΈΙΈΚœ¨ œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫ
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            {text(environment.title, "ΈΛœ¹Έ≠œ΅ΈΩΈΫ œÄΈΩΈΜΈΙœ³ΈΙΈΚœ¨ œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫ")}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-zinc-400">
            {text(
              environment.plain_language_summary || environment.summary,
              "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ Έ¥ΈΙΈ±ΈΗΈ≠œÉΈΙΈΦΈΖ œÉœçΈΫΈΩœàΈΖ œÄΈΩΈΜΈΙœ³ΈΙΈΚΈΩœç œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫœ³ΈΩœ²."
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
            ΈΛΈΙ œÉΈΖΈΦΈ±Έ·ΈΫΈΒΈΙ Έ≥ΈΙΈ± {partyName || "œ³ΈΩ ΈΚœ¨ΈΦΈΦΈ± œ³ΈΩœÖ œ΅œ¹Έ°œÉœ³ΈΖ"}
          </div>
          <p className="mt-3 text-sm leading-7 text-zinc-200">
            {text(
              partyImplication,
              "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ ΈΒΈΙΈ¥ΈΙΈΚΈ° Έ±ΈΫΈ§Έ≥ΈΫœâœÉΈΖ Έ≥ΈΙΈ± Έ±œÖœ³œ¨ œ³ΈΩ ΈΚœ¨ΈΦΈΦΈ±. Έü Noraya œ΅œ¹ΈΖœÉΈΙΈΦΈΩœÄΈΩΈΙΈΒΈ· œ³ΈΩ Έ≥ΈΒΈΫΈΙΈΚœ¨ œÄΈΩΈΜΈΙœ³ΈΙΈΚœ¨ œÄΈΒœ¹ΈΙΈ≤Έ§ΈΜΈΜΈΩΈΫ ΈΦΈΒ œ΅Έ±ΈΦΈΖΈΜœ¨œ³ΈΒœ¹ΈΖ Έ≤ΈΒΈ≤Έ±ΈΙœ¨œ³ΈΖœ³Έ±."
            )}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Έ£Έ±œÉΈΙΈΚΈ° Έ¥œÖΈΫΈ±ΈΦΈΙΈΚΈ°
          </div>
          <p className="mt-3 text-sm leading-7 text-zinc-300">
            {text(environment.dominant_dynamic, "Έ½ Έ≤Έ±œÉΈΙΈΚΈ° Έ¥œÖΈΫΈ±ΈΦΈΙΈΚΈ° Έ¥ΈΒΈΫ Έ≠œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ œÖœÄΈΩΈΜΈΩΈ≥ΈΙœÉœ³ΈΒΈ·.")}
          </p>
          <div className="mt-4 grid gap-2">
            <MiniLine title="ΈöœÖΈ≤ΈΒœ¹ΈΫΈΖœ³ΈΙΈΚœ¨ momentum" value={text(environment.government_momentum, "βÄî")} />
            <MiniLine title="ΈîΈΩΈΦΈ° Έ±ΈΫœ³ΈΙœÄΈΩΈΜΈ·œ³ΈΒœÖœÉΈΖœ²" value={text(environment.opposition_structure, "βÄî")} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              ΈΛΈΒΈΜΈΒœÖœ³Έ±Έ·ΈΒœ² Έ¥ΈΖΈΦΈΩœÉΈΚΈΩœÄΈ°œÉΈΒΈΙœ²
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              {polls.length} ΈΦΈΒœ³œ¹Έ°œÉΈΒΈΙœ²
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
                    {text(poll.survey_label, `${poll.pollster || "ΈîΈΖΈΦΈΩœÉΈΚœ¨œÄΈΖœÉΈΖ"} / ${poll.commissioner || "βÄî"}`)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    ΈîΈΒΈ·Έ≥ΈΦΈ±: {poll.sample_size || "βÄî"} ¬Ζ Έ±œÄΈΩœ³ΈΒΈΜΈ≠œÉΈΦΈ±œ³Έ±: {poll.result_count || "βÄî"} ¬Ζ Έ≠œâœ² {shortDate(poll.fieldwork_end)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-7 text-zinc-500">
              ΈîΈΒΈΫ Έ≠œ΅ΈΩœÖΈΫ œÜΈΩœ¹œ³œâΈΗΈΒΈ· Έ±ΈΚœ¨ΈΦΈΖ structured polling records.
            </p>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              ΈΛΈ§œÉΈΒΈΙœ² ΈΚΈΩΈΦΈΦΈ§œ³œâΈΫ / actors
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
                        {trend.trend_reading || "Έßœâœ¹Έ·œ² œ³Έ§œÉΈΖ"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-cyan-100">
                        {formatPercent(trend.avg_value)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        ΈΦ.œ¨. {trend.poll_count || 0} ΈΦΈΒœ³œ¹.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-400">
                      œ³ΈΒΈΜΈΒœÖœ³Έ±Έ·Έ±: {formatPercent(trend.latest_value)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-400">
                      ΈΗΈ≠œÉΈΖ #{trend.latest_rank || "βÄî"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-7 text-zinc-500">
              ΈîΈΒΈΫ Έ≠œ΅ΈΩœÖΈΫ œÖœÄΈΩΈΜΈΩΈ≥ΈΙœÉœ³ΈΒΈ· Έ±ΈΚœ¨ΈΦΈΖ œ³Έ§œÉΈΒΈΙœ² ΈΚΈΩΈΦΈΦΈ§œ³œâΈΫ.
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
              ΈôΈΒœ¹Έ§œ¹œ΅ΈΖœÉΈΖ Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²
            </div>
            <h2 className="mt-2 text-2xl font-semibold">ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΩœÖΈΫ Έ±ΈΚœ¨ΈΦΈΖ Έ±œ¹ΈΚΈΒœ³Έ§ œ³Έ±ΈΨΈΙΈΫΈΩΈΦΈΖΈΦΈ≠ΈΫΈ± ΈΗΈ≠ΈΦΈ±œ³Έ±</h2>
          </div>
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            ΈΞœÄœ¨ ΈΒœÄΈΒΈΨΈΒœ¹Έ≥Έ±œÉΈ·Έ±
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-zinc-400">
          Έü Noraya œ΅œ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÄΈΒœ¹ΈΙœÉœÉœ¨œ³ΈΒœ¹Έ± œ³Έ±ΈΨΈΙΈΫΈΩΈΦΈΖΈΦΈ≠ΈΫΈ± Έ§œ¹ΈΗœ¹Έ± Έ≥ΈΙΈ± ΈΫΈ± ΈΒΈΦœÜΈ±ΈΫΈ·œÉΈΒΈΙ Έ±ΈΨΈΙœ¨œÄΈΙœÉœ³ΈΖ ΈΙΈΒœ¹Έ§œ¹œ΅ΈΖœÉΈΖ Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²,
          Έ≠ΈΫœ³Έ±œÉΈΖ œÉΈ°ΈΦΈ±œ³ΈΩœ² ΈΚΈ±ΈΙ Έ≤Έ§œÉΈΖ œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖœ².
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
            ΈôΈΒœ¹Έ§œ¹œ΅ΈΖœÉΈΖ Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²
          </div>
          <h2 className="mt-2 text-2xl font-semibold">ΈΛΈΙ Έ±ΈΫΈΒΈ≤Έ±Έ·ΈΫΈΒΈΙ œÉΈ°ΈΦΈΒœ¹Έ±</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
            Έ½ Έ≤Έ±œ¹œçœ³ΈΖœ³Έ± Έ¥ΈΒΈΫ ΈΒΈ·ΈΫΈ±ΈΙ ΈΒΈΚΈΜΈΩΈ≥ΈΙΈΚœ¨ œÄΈΩœÉΈΩœÉœ³œ¨. ΈïΈ·ΈΫΈ±ΈΙ œÉœ΅ΈΒœ³ΈΙΈΚΈ° Έ≠ΈΫΈ¥ΈΒΈΙΈΨΈΖ Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ² ΈΦΈΒ Έ≤Έ§œÉΈΖ Έ§œ¹ΈΗœ¹Έ±,
            œÄΈΖΈ≥Έ≠œ², œÄΈΩΈΜΈΙœ³ΈΙΈΚΈ° œÉœÖΈΫΈ§œÜΈΒΈΙΈ±, Έ≠ΈΫœ³Έ±œÉΈΖ ΈΚΈ±ΈΙ Έ¥ΈΙΈ±ΈΗΈ≠œÉΈΙΈΦΈΖ œ³ΈΒΈΚΈΦΈΖœ¹Έ·œâœÉΈΖ.
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
                        {item.article_count || 0} Έ§œ¹ΈΗœ¹Έ± ¬Ζ {item.source_count || 0} œÄΈΖΈ≥Έ≠œ² ¬Ζ {item.political_articles || 0} œÄΈΩΈΜΈΙœ³ΈΙΈΚΈ§ Έ§œ¹ΈΗœ¹Έ±
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>ΈΘœ΅ΈΒœ³ΈΙΈΚΈ° Έ≤Έ±œ¹œçœ³ΈΖœ³Έ± Έ±œ³ΈΕΈ≠ΈΫœ³Έ±œ²</span>
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
                  ΈëœÄœ¨ œÄΈΩœç œÄœ¹ΈΩΈΚœçœÄœ³ΈΒΈΙ Έ±œÖœ³œ¨;
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      ΈëΈΫΈ§Έ≥ΈΫœâœÉΈΖ / framing
                    </div>
                    <p className="mt-2 text-sm leading-7 text-zinc-300">
                      {text(
                        item.framing_summary,
                        "ΈîΈΒΈΫ œÖœÄΈ§œ¹œ΅ΈΒΈΙ Έ±ΈΚœ¨ΈΦΈΖ œÄΈΜΈ°œ¹ΈΖœ² framing Έ±ΈΫΈ§ΈΜœÖœÉΈΖ Έ≥ΈΙΈ± Έ±œÖœ³œ¨ œ³ΈΩ ΈΗΈ≠ΈΦΈ±."
                      )}
                    </p>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Έ†œ¹ΈΩœ³ΈΒΈΙΈΫœ¨ΈΦΈΒΈΫΈΖ œÄœ¹ΈΩœÉΈΩœ΅Έ°
                    </div>
                    <p className="mt-2 text-sm leading-7 text-zinc-300">
                      {text(
                        item.evidence_summary || item.recommended_action,
                        "Έßœ¹ΈΒΈΙΈ§ΈΕΈΒœ³Έ±ΈΙ œÄΈ±œ¹Έ±ΈΚΈΩΈΜΈΩœçΈΗΈΖœÉΈΖ ΈΦΈ≠œ΅œ¹ΈΙ ΈΫΈ± ΈΙœÉœ΅œÖœ¹ΈΩœÄΈΩΈΙΈΖΈΗΈΒΈ· œ³ΈΩ œÉΈ°ΈΦΈ±."
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    ΈÜœ¹ΈΗœ¹Έ± / œÉœ³ΈΩΈΙœ΅ΈΒΈ·Έ± Έ≤Έ§œÉΈΖœ²
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
                      ΈîΈΒΈΫ Έ≠œ΅ΈΩœÖΈΫ ΈΒœÄΈΙœÉœ³œ¹Έ±œÜΈΒΈ· Έ±ΈΚœ¨ΈΦΈΖ œÉœÖΈ≥ΈΚΈΒΈΚœ¹ΈΙΈΦΈ≠ΈΫΈ± Έ§œ¹ΈΗœ¹Έ± Έ≥ΈΙΈ± Έ±œÖœ³œ¨ œ³ΈΩ ΈΗΈ≠ΈΦΈ±.
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
