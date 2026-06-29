                "use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  buildAgendaMap,
  buildEventIntelligenceView,
  buildPriorityCards,
  type AgendaMapItem as ProbeAgendaMapItem,
  type EventIntelligenceView,
  type ProbeV4Response,
  type PriorityCard as ProbePriorityCard,
} from "../../lib/noraya/strategy-room-intelligence";

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
    dominant_emotion?: string;
    emotion_intensity?: number;
    social_spread?: string;
    priming_risk?: string;
    political_risk?: string;
    opportunity?: string;
    affected_audiences?: string[];
    documentation_level?: string;
  };
  key_drivers?: { label?: string; value?: number }[];
  red_team?: string[];
  escalation_stage?: number;
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
  processing_status?: string;
  source?: string;
  warning?: string | null;
};

type StrategyChatResponse = {
  answer?: string;
  conversation_id?: string;
};

type AgendaArchitectResult = {
  title: string;
  displayText: string;
  generatedAt?: string;
  chatContext?: {
    coreDiagnosis?: string;
    herestheticMove?: string;
    agendaCreationRoute?: string;
    connectedMicroAgendas?: string[];
    firstMove?: string;
    trap?: string;
    followups?: string[];
  };
};

type ΕνεργόSituationRow = {
  id?: string | null;
  title?: string | null;
  topic?: string | null;
  plain_title?: string | null;
  situation_title?: string | null;
  category?: string | null;
  status?: string | null;
  urgency?: string | null;
  confidence_score?: number | string | null;
  documentation_level?: string | null;
  documentation_basis?: string | null;
  agenda_score?: number | string | null;
  priority_score?: number | string | null;
  noraya_priority_score?: number | string | null;
  news_coverage_level?: number | string | null;
  google_trends_score?: number | string | null;
  raw_signal_score?: number | string | null;
  search_interest_score?: number | string | null;
  search_interest_status?: string | null;
  search_interest_queries?: string[] | null;
  search_interest_fetched_at?: string | null;
  strategic_boost_score?: number | string | null;
  strategic_index_score?: number | string | null;
  strategic_index_label?: string | null;
  political_risk_level?: string | null;
  dominant_frame?: string | null;
  framing_summary?: string | null;
  recommended_action?: string | null;
  avoid_action?: string | null;
  evidence_summary?: string | null;
  source_count?: number | string | null;
  article_count?: number | string | null;
  strategic_read?: unknown;
  heresthetic_read?: unknown;
  public_pulse?: unknown;
  red_team?: unknown;
  summary_assessment?: unknown;
  escalation_level?: number | string | null;
  escalation_recommended?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  evidence_articles?: EvidenceArticleItem[];
  [key: string]: unknown;
};

type EvidenceArticleItem = {
  article_id?: string | null;
  title?: string | null;
  source?: string | null;
  url?: string | null;
  published_at?: string | null;
  score?: number | string | null;
  role?: string | null;
};

type ProbeMicroAgendaSummary = {
  clusterId: string;
  title: string;
  score: number;
  eventCount: number;
  statusLabel?: string;
  evidenceLabel?: string;
};

type AgendaRelatedEvent = {
  id?: string | null;
  title?: string | null;
  topic?: string | null;
  event_score?: number | string | null;
  status?: string | null;
  article_count?: number | string | null;
  source_count?: number | string | null;
  last_article_at?: string | null;

  // From agenda-probe / probeAgendaMap.
  probe_cluster_id?: string | null;
  probe_event_id?: string | null;
  micro_agenda?: string | null;
};

type AgendaOverviewRow = {
  id?: string | null;
  topic: string;
  category?: string | null;
  agenda_score?: number | string | null;
  raw_signal_score?: number | string | null;
  signal_label?: string | null;
  search_interest_score?: number | string | null;
  search_interest_status?: string | null;
  search_interest_queries?: string[] | null;
  search_interest_fetched_at?: string | null;
  strategic_boost_score?: number | string | null;
  strategic_index_score?: number | string | null;
  strategic_index_label?: string | null;
  strategic_index_components?: {
    raw_signal?: number | string | null;
    search_interest?: number | string | null;
    strategic_boost?: number | string | null;
    opportunity_bonus?: number | string | null;
    formula?: string | null;
  } | null;
  coverage_level?: string | null;
  source_diversity?: number | string | null;
  documentation_level?: string | null;
  political_risk_level?: string | null;
  opportunity_label?: string | null;
  events_detected_at?: string | null;
  updated_at?: string | null;
  related_events?: AgendaRelatedEvent[];
  evidence_articles?: EvidenceArticleItem[];
  active_micro_agenda?: string | null;
  micro_agendas?: ProbeMicroAgendaSummary[];
  overview_source?: "agenda_probe" | "situation_engine";
};

type SituationEngineResponse = {
  success?: boolean;
  timestamp?: string;
  count?: number;
  returned_count?: number;
  source?: string;
  fallback_used?: boolean;
  situations?: ΕνεργόSituationRow[];
  agenda_overview?: AgendaOverviewRow[];
  agenda_overview_error?: string | null;
  error?: string;
};

type RankedAgenda = AgendaUsedRow & {
  rank: number;
  score: number;
  share: number;
  signalLabel: string;
  documentationLabel: string;
  evidenceArticles: Array<{ title: string; source?: string; url?: string }>;
};

type SituationTab =
  | "strategic"
  | "overview"
  | "why"
  | "drivers"
  | "pulse"
  | "win"
  | "options"
  | "comms";

type ChatMessage = { role: "user" | "assistant"; content: string };

type AdvisorConversation = {
  id: string;
  title: string;
  situationTitle: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type AgendaProbeSelection = {
  clusterId: string;
  eventId?: string | null;
};

type ProbeAgendaEventItem = ProbeAgendaMapItem["events"][number];

const situationTabs: Array<{ id: SituationTab; label: string }> = [
  { id: "strategic", label: "Στρατηγική εικόνα" },
  { id: "overview", label: "Συνολική εικόνα" },
  { id: "why", label: "Γιατί υπάρχει" },
  { id: "drivers", label: "Πηγές & παράγοντες" },
  { id: "pulse", label: "Δημόσιος παλμός" },
  { id: "win", label: "Πώς κερδίζεται" },
  { id: "options", label: "Επιλογές δράσης" },
  { id: "comms", label: "Υλικό" },
];

const navTabs = [
  "Σήμερα",
  "Ατζέντα",
  "Καταστάσεις",
  "Σενάρια",
  "Πρόσωπα",
  "Αρχεία",
  "Δεδομένα",
];
const cognitiveStages = [
  "Agenda",
  "Framing",
  "Priming",
  "Audience",
  "Persuasion",
  "Mobilization",
  "Recommendation",
];

function text(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function list(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(source: unknown, keys: string[], fallback = "") {
  if (typeof source === "string" && source.trim()) return source.trim();
  const record = asRecord(source);
  if (!record) return fallback;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
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

function documentationLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (
    normalized.includes("high") ||
    normalized.includes("strong") ||
    normalized.includes("ισχυ")
  ) {
    return "Στερεή βάση εκτίμησης";
  }

  if (normalized.includes("medium") || normalized.includes("μεσα")) {
    return "Σχηματισμένη εικόνα";
  }

  if (
    normalized.includes("low") ||
    normalized.includes("initial") ||
    normalized.includes("starter") ||
    normalized.includes("αρχ")
  ) {
    return "Πρώτη εικόνα";
  }

  if (
    normalized.includes("insufficient") ||
    normalized.includes("weak") ||
    normalized.includes("ανεπαρκ")
  ) {
    return "Εικόνα που συμπληρώνεται";
  }

  return "Εικόνα υπό διαμόρφωση";
}

function riskLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (
    normalized.includes("critical") ||
    normalized.includes("high") ||
    normalized.includes("υψη")
  ) {
    return "Υψηλή ένταση";
  }

  if (normalized.includes("medium") || normalized.includes("μεσα")) {
    return "Μεσαία ένταση";
  }

  if (normalized.includes("low") || normalized.includes("χαμη")) {
    return "Χαμηλή ένταση";
  }

  return "Υπό παρακολούθηση";
}

function signalToneClass(value?: string | null) {
  const label = riskLabel(value);
  if (label.includes("Υψηλή"))
    return "border-red-400/30 bg-red-400/10 text-red-100";
  if (label.includes("Σχηματισμένη"))
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (label.includes("Χαμηλή"))
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function docToneClass(value?: string | null) {
  const label = documentationLabel(value);
  if (label.includes("Στερεή"))
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (label.includes("Σχηματισμένη"))
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (label.includes("Πρώτη"))
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (label.includes("συμπληρώνεται"))
    return "border-red-300/25 bg-red-300/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function statusToneClass(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("active"))
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (normalized.includes("new") || normalized.includes("candidate"))
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (normalized.includes("monitor"))
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (normalized.includes("resolved") || normalized.includes("archived"))
    return "border-white/10 bg-white/[0.04] text-zinc-400";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}


function statusLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("active")) return "Ενεργό";
  if (normalized.includes("new") || normalized.includes("candidate")) return "Νέο";
  if (normalized.includes("monitor")) return "Υπό παρακολούθηση";
  if (normalized.includes("resolved")) return "Ολοκληρωμένο";
  if (normalized.includes("archived")) return "Αρχείο";
  return text(value, "Κατάσταση");
}


function recommendationLabel(value?: string) {
  if (value === "prefer") return "Προτεινόμενη";
  if (value === "acceptable") return "Αποδεκτή";
  if (value === "avoid") return "Να αποφευχθεί";
  return "Επιλογή";
}

function recommendationClass(value?: string) {
  if (value === "prefer")
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (value === "acceptable")
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (value === "avoid") return "border-red-300/25 bg-red-300/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function evidenceArticleItems(
  value: unknown,
): Array<{ title: string; source?: string; url?: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 5)
    .map((item): { title: string; source?: string; url?: string } | null => {
      if (typeof item === "string") return { title: item };

      const record = asRecord(item);
      if (!record) return null;

      return {
        title: String(
          record.title || record.headline || record.url || "Άρθρο τεκμηρίωσης",
        ),
        source: record.source ? String(record.source) : undefined,
        url:
          record.url || record.link
            ? String(record.url || record.link)
            : undefined,
      };
    })
    .filter((item): item is { title: string; source?: string; url?: string } =>
      Boolean(item?.title),
    );
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
  if (profile?.party_profile_snapshot?.short_name)
    return profile.party_profile_snapshot.short_name;
  if (profile?.party_key === "elas" || profile?.party_key === "el_as")
    return "ΕΛΑΣ";
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

function topActorTrends(environment: PoliticalEnvironment | null | undefined) {
  return Array.isArray(environment?.actor_trends)
    ? environment.actor_trends
        .filter(
          (trend) =>
            trend?.actor_key &&
            trend.actor_key !== "undecided" &&
            trend.actor_key !== "other",
        )
        .slice(0, 5)
    : [];
}

function recentPolls(environment: PoliticalEnvironment | null | undefined) {
  return Array.isArray(environment?.recent_polls)
    ? environment.recent_polls.slice(0, 4)
    : [];
}

function partyImplicationText(
  environment: PoliticalEnvironment | null | undefined,
  partyKey?: string,
) {
  if (!environment?.party_specific_implications || !partyKey) return "";
  const value = environment.party_specific_implications[partyKey];
  return typeof value === "string" ? value : "";
}

function situationId(situation: ΕνεργόSituationRow, index: number) {
  return String(
    situation.id ||
      `${situation.title || situation.topic || "situation"}-${index}`,
  );
}

function situationTitle(
  situation?: ΕνεργόSituationRow | null,
  fallback = "Ενεργή πολιτική κατάσταση",
) {
  if (!situation) return fallback;
  return text(
    situation.title ||
      situation.situation_title ||
      situation.plain_title ||
      situation.topic,
    fallback,
  );
}

function situationScore(situation?: ΕνεργόSituationRow | null, fallback = 0) {
  if (!situation) return fallback;
  return clamp(
    numberValue(
      situation.noraya_priority_score ??
        situation.priority_score ??
        situation.agenda_score ??
        situation.confidence_score,
      fallback,
    ),
  );
}

function signalLabelFromScore(score: number) {
  if (score >= 70) return "Ισχυρό σήμα";
  if (score >= 55) return "Ανερχόμενο σήμα";
  if (score >= 35) return "Υπό παρακολούθηση";
  return "Χαμηλό σήμα";
}

function scoreSignalText(score: number) {
  return `${signalLabelFromScore(score)} · ${score ? Math.round(score) : "—"}`;
}

function coverageLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "high") return "Υψηλή";
  if (normalized === "medium") return "Μεσαία";
  if (normalized === "low") return "Χαμηλή";
  return value || "—";
}

function opportunityLabel(
  score: number,
  coverageLevel?: string | null,
  fallback?: string | null,
) {
  if (fallback && fallback.trim()) return fallback.trim();
  const coverage = String(coverageLevel || "").toLowerCase();
  if (score >= 60 && coverage === "low") return "Ευκαιρία ανάδειξης";
  if (score >= 60 && coverage === "medium") return "Χώρος για πλαισίωση";
  if (score >= 60 && coverage === "high") return "Ήδη στο κέντρο";
  return "Παρακολούθηση";
}

function opportunityText(row: AgendaOverviewRow | null | undefined) {
  if (!row) return "Παρακολούθηση";
  return opportunityLabel(
    numberValue(row.agenda_score, 0),
    row.coverage_level,
    row.opportunity_label,
  );
}

function normalizeAgendaKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
}

function evidenceLevelFromProbeLabel(label?: string | null) {
  const normalized = normalizeAgendaKey(label);
  if (normalized.includes("στερε") || normalized.includes("ισχυ")) return "high";
  if (normalized.includes("σχηματισ") || normalized.includes("μεσα")) return "medium";
  if (normalized.includes("πρωτ") || normalized.includes("αρχ")) return "low";
  return "medium";
}

function strongerCoverageLevel(a?: string | null, b?: string | null) {
  const rank = (value?: string | null) => {
    const normalized = normalizeAgendaKey(value);
    if (normalized.includes("high") || normalized.includes("υψη")) return 3;
    if (normalized.includes("medium") || normalized.includes("μεσα")) return 2;
    if (normalized.includes("low") || normalized.includes("χαμη")) return 1;
    return 0;
  };
  return rank(b) > rank(a) ? b || a || "medium" : a || b || "medium";
}

function coverageLevelFromProbeItem(item: ProbeAgendaMapItem) {
  const articleCount = numberValue(item.raw?.article_count, 0);
  const sourceCount = numberValue(item.raw?.source_count, 0);
  if (sourceCount >= 4 || articleCount >= 8) return "high";
  if (sourceCount >= 2 || articleCount >= 3) return "medium";
  return "low";
}

function broadThemeForProbeItem(
  item: ProbeAgendaMapItem,
  legacyOverview: AgendaOverviewRow[],
) {
  const rawCandidates = [
    ...(Array.isArray(item.parentTopics) ? item.parentTopics : []),
    item.raw?.parent_topic,
    ...(Array.isArray(item.raw?.parent_topics) ? item.raw.parent_topics : []),
    item.title,
    item.raw?.micro_agenda,
    item.raw?.topic,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const textIndex = normalizeAgendaKey(rawCandidates.join(" "));

  const canonical = (() => {
    if (
      textIndex.includes("στεγασ") ||
      textIndex.includes("κατοικ") ||
      textIndex.includes("ενοικ") ||
      textIndex.includes("airbnb") ||
      textIndex.includes("βραχυχρον")
    ) {
      return "Στέγαση";
    }

    if (
      textIndex.includes("ακριβ") ||
      textIndex.includes("κοστοσ ζωησ") ||
      textIndex.includes("τιμων") ||
      textIndex.includes("καταναλωτ") ||
      textIndex.includes("βασικα αγαθα")
    ) {
      return "Ακρίβεια / κόστος ζωής";
    }

    if (
      textIndex.includes("ενεργ") ||
      textIndex.includes("ρευμα") ||
      textIndex.includes("θερμαν")
    ) {
      return "Ενέργεια";
    }

    if (
      textIndex.includes("μισθ") ||
      textIndex.includes("εργασ") ||
      textIndex.includes("φορο") ||
      textIndex.includes("τραπεζ") ||
      textIndex.includes("δανει") ||
      textIndex.includes("χρεοσ") ||
      textIndex.includes("οικονομ")
    ) {
      return "Οικονομία";
    }

    if (
      textIndex.includes("δικαιοσυν") ||
      textIndex.includes("θεσμ") ||
      textIndex.includes("δημοκρατ")
    ) {
      return "Δικαιοσύνη";
    }

    if (
      textIndex.includes("αμυνα") ||
      textIndex.includes("εξοπλισ") ||
      textIndex.includes("στρατιωτικ") ||
      textIndex.includes("drone")
    ) {
      return "Άμυνα";
    }

    if (
      textIndex.includes("εξωτερικ") ||
      textIndex.includes("γεωπολιτικ") ||
      textIndex.includes("νατο") ||
      textIndex.includes("ευρωπη") ||
      textIndex.includes("τουρκ")
    ) {
      return "Εξωτερική πολιτική";
    }

    if (
      textIndex.includes("υγεια") ||
      textIndex.includes("νοσοκομ") ||
      textIndex.includes("γιατρ")
    ) {
      return "Υγεία";
    }

    if (
      textIndex.includes("παιδει") ||
      textIndex.includes("πανεπιστημ") ||
      textIndex.includes("σχολ")
    ) {
      return "Παιδεία";
    }

    if (
      textIndex.includes("ασφαλ") ||
      textIndex.includes("εγκλημα") ||
      textIndex.includes("προστασια")
    ) {
      return "Ασφάλεια / πολιτική προστασία";
    }

    if (textIndex.includes("κοινων")) {
      return "Κοινωνία";
    }

    return rawCandidates[0] || item.title || "Γενικά";
  })();

  const exactLegacy = legacyOverview.find(
    (row) => normalizeAgendaKey(row.topic) === normalizeAgendaKey(canonical),
  );
  if (exactLegacy?.topic) return exactLegacy.topic;

  return canonical;
}

function probeOpportunityLabel(score: number, coverageLevel?: string | null) {
  const coverage = String(coverageLevel || "").toLowerCase();
  if (score >= 70) return "Ήδη στο κέντρο";
  if (score >= 58 && coverage === "low") return "Ευκαιρία ανάδειξης";
  if (score >= 55) return "Χώρος για πλαισίωση";
  return "Παρακολούθηση";
}

function mergeDocumentationLevel(a?: string | null, b?: string | null) {
  const rank = (value?: string | null) => {
    const normalized = normalizeAgendaKey(value);
    if (
      normalized.includes("high") ||
      normalized.includes("strong") ||
      normalized.includes("ισχυ")
    ) {
      return 3;
    }
    if (normalized.includes("medium") || normalized.includes("μεσα")) return 2;
    if (
      normalized.includes("low") ||
      normalized.includes("initial") ||
      normalized.includes("αρχ")
    ) {
      return 1;
    }
    return 0;
  };
  return rank(b) > rank(a) ? b || a || "medium" : a || b || "medium";
}

function buildProbeThematicOverview(
  probeAgendaMap: ProbeAgendaMapItem[],
  legacyOverview: AgendaOverviewRow[],
): AgendaOverviewRow[] {
  if (!probeAgendaMap.length) return [];

  const grouped = new Map<string, AgendaOverviewRow>();

  for (const item of probeAgendaMap) {
    const theme = broadThemeForProbeItem(item, legacyOverview);
    const itemScore = Math.round(numberValue(item.score, 0));
    const sourceCount = numberValue(item.raw?.source_count, 0);
    const articleCount = numberValue(item.raw?.article_count, 0);
    const coverage = coverageLevelFromProbeItem(item);
    const documentation = evidenceLevelFromProbeLabel(item.evidenceLabel);
    const existing = grouped.get(theme);

    const microSummary: ProbeMicroAgendaSummary = {
      clusterId: item.id,
      title: item.title,
      score: itemScore,
      eventCount: (item.events || []).length,
      statusLabel: item.statusLabel,
      evidenceLabel: item.evidenceLabel,
    };

    const relatedEvents: AgendaRelatedEvent[] = (item.events || []).map(
      (event, index) => ({
        id: String(event.id || `${item.id}-${index}`),
        title: event.title || item.title,
        topic: theme,
        micro_agenda: item.title,
        event_score: numberValue(event.event_score, itemScore),
        status: event.status || item.statusLabel || "live",
        article_count: numberValue(event.article_count, articleCount),
        source_count: numberValue(event.source_count, sourceCount),
        last_article_at: event.last_article_at || item.raw?.newest_article_at || null,
        probe_cluster_id: item.id,
        probe_event_id: event.id ? String(event.id) : null,
      }),
    );

    const evidenceArticles = Array.isArray(item.raw?.evidence_articles)
      ? (item.raw.evidence_articles as EvidenceArticleItem[])
      : [];

    if (!existing) {
      grouped.set(theme, {
        id: `probe-theme-${normalizeAgendaKey(theme).replace(/[^a-zα-ω0-9]+/g, "_")}`,
        topic: theme,
        category: theme,
        agenda_score: itemScore,
        raw_signal_score: itemScore,
        strategic_index_score: itemScore,
        strategic_index_label: signalLabelFromScore(itemScore),
        search_interest_score:
          item.raw?.real_trend_score ?? item.raw?.search_interest_score ?? null,
        search_interest_status: item.raw?.search_interest_status ?? null,
        strategic_boost_score:
          item.raw?.editorial_relevance_score ??
          item.raw?.real_news_coverage_score ??
          itemScore,
        coverage_level: coverage,
        source_diversity: sourceCount,
        documentation_level: documentation,
        political_risk_level:
          itemScore >= 70 ? "high" : itemScore >= 55 ? "medium" : "low",
        opportunity_label: probeOpportunityLabel(itemScore, coverage),
        events_detected_at: item.raw?.newest_article_at ?? null,
        updated_at: item.raw?.newest_article_at ?? null,
        related_events: relatedEvents,
        evidence_articles: evidenceArticles.slice(0, 5),
        active_micro_agenda: item.title,
        micro_agendas: [microSummary],
        overview_source: "agenda_probe",
      });
      continue;
    }

    const currentScore = numberValue(existing.agenda_score, 0);
    const nextScore = Math.max(currentScore, itemScore);
    const nextCoverage = strongerCoverageLevel(existing.coverage_level, coverage);
    const nextDocumentation = mergeDocumentationLevel(
      existing.documentation_level,
      documentation,
    );
    const currentSourceDiversity = numberValue(existing.source_diversity, 0);
    const nextSourceDiversity = Math.max(currentSourceDiversity, sourceCount);

    const mergedEvents = [...(existing.related_events || []), ...relatedEvents].sort(
      (a, b) => numberValue(b.event_score, 0) - numberValue(a.event_score, 0),
    );

    const articleMap = new Map<string, EvidenceArticleItem>();
    for (const article of [...(existing.evidence_articles || []), ...evidenceArticles]) {
      if (!article) continue;
      const key = String(
        article.article_id ||
          article.url ||
          `${article.source || "source"}-${article.title || articleMap.size}`,
      );
      const old = articleMap.get(key);
      if (!old || numberValue(article.score, 0) > numberValue(old.score, 0)) {
        articleMap.set(key, article);
      }
    }

    const microMap = new Map<string, ProbeMicroAgendaSummary>();
    for (const micro of [...(existing.micro_agendas || []), microSummary]) {
      microMap.set(micro.clusterId, micro);
    }

    const mergedMicroAgendas = Array.from(microMap.values()).sort(
      (a, b) => numberValue(b.score, 0) - numberValue(a.score, 0),
    );

    grouped.set(theme, {
      ...existing,
      agenda_score: nextScore,
      raw_signal_score: nextScore,
      strategic_index_score: nextScore,
      strategic_index_label: signalLabelFromScore(nextScore),
      search_interest_score: Math.max(
        numberValue(existing.search_interest_score, 0),
        numberValue(item.raw?.real_trend_score ?? item.raw?.search_interest_score, 0),
      ),
      strategic_boost_score: Math.max(
        numberValue(existing.strategic_boost_score, 0),
        numberValue(
          item.raw?.editorial_relevance_score ?? item.raw?.real_news_coverage_score,
          itemScore,
        ),
      ),
      coverage_level: nextCoverage,
      source_diversity: nextSourceDiversity,
      documentation_level: nextDocumentation,
      political_risk_level:
        nextScore >= 70 ? "high" : nextScore >= 55 ? "medium" : "low",
      opportunity_label: probeOpportunityLabel(nextScore, nextCoverage),
      events_detected_at: existing.events_detected_at || item.raw?.newest_article_at || null,
      updated_at: item.raw?.newest_article_at || existing.updated_at || null,
      related_events: mergedEvents,
      evidence_articles: Array.from(articleMap.values())
        .sort((a, b) => numberValue(b.score, 0) - numberValue(a.score, 0))
        .slice(0, 5),
      active_micro_agenda:
        mergedMicroAgendas[0]?.title || existing.active_micro_agenda || item.title,
      micro_agendas: mergedMicroAgendas,
      overview_source: "agenda_probe",
    });
  }

  return Array.from(grouped.values()).sort(
    (a, b) => numberValue(b.agenda_score, 0) - numberValue(a.agenda_score, 0),
  );
}

function evidenceRoleLabel(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("primary")) return "Κύριο άρθρο";
  if (normalized.includes("support")) return "Υποστηρικτικό άρθρο";
  if (normalized.includes("fallback")) return "Συμπληρωματικό άρθρο";
  return role || "Άρθρο τεκμηρίωσης";
}

function evidenceArticlesFromSituation(
  situation?: ΕνεργόSituationRow | null,
): EvidenceArticleItem[] {
  return Array.isArray(situation?.evidence_articles)
    ? situation.evidence_articles
    : [];
}

function evidenceArticlesFromProbeItem(
  item?: ProbeAgendaMapItem | null,
): EvidenceArticleItem[] {
  const articles = item?.raw?.evidence_articles;
  if (!Array.isArray(articles)) return [];

  return articles.slice(0, 8).map((article, index) => {
    const record = article as Record<string, unknown>;
    const articleId =
      typeof record.article_id === "string" && record.article_id.trim()
        ? record.article_id
        : `${item?.id || "probe"}-${index}`;

    return {
      article_id: articleId,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title
          : "Άρθρο τεκμηρίωσης",
      source:
        typeof record.source === "string" && record.source.trim()
          ? record.source
          : "Πηγή",
      url:
        typeof record.url === "string" && record.url.trim()
          ? record.url
          : null,
      published_at:
        typeof record.published_at === "string" && record.published_at.trim()
          ? record.published_at
          : null,
      score:
        typeof record.score === "number" || typeof record.score === "string"
          ? record.score
          : null,
      role:
        typeof record.role === "string" && record.role.trim()
          ? record.role
          : "primary",
    };
  });
}

function articleDate(article?: EvidenceArticleItem | null) {
  return shortDate(article?.published_at || null);
}

function cockpitIntensityScore(
  situation?: ΕνεργόSituationRow | null,
  fallback = 0,
) {
  const raw = situationScore(situation, fallback);
  const articleCount = numberValue(situation?.article_count, 0);
  const sourceCount = numberValue(situation?.source_count, 0);
  const doc = String(situation?.documentation_level || "").toLowerCase();
  const risk = String(
    situation?.political_risk_level ||
      situation?.urgency ||
      situation?.status ||
      "",
  ).toLowerCase();
  const last = new Date(
    String(situation?.updated_at || situation?.created_at || ""),
  );
  const hoursOld = Number.isNaN(last.getTime())
    ? null
    : (Date.now() - last.getTime()) / 36e5;

  const articleBonus = Math.min(8, Math.max(0, articleCount) * 1.5);
  const sourceBonus = Math.min(8, Math.max(0, sourceCount) * 2);
  const docBonus =
    doc.includes("strong") || doc.includes("high") || doc.includes("ισχυ")
      ? 8
      : doc.includes("medium") || doc.includes("μεσα")
        ? 4
        : doc.includes("initial") || doc.includes("low") || doc.includes("αρχ")
          ? 1
          : 0;
  const riskBonus =
    risk.includes("critical") ||
    risk.includes("high") ||
    risk.includes("υψη") ||
    risk.includes("active")
      ? 8
      : risk.includes("medium") || risk.includes("μεσα")
        ? 4
        : risk.includes("low") || risk.includes("χαμη")
          ? 1
          : 0;
  const freshnessBonus =
    hoursOld === null ? 0 : hoursOld <= 24 ? 6 : hoursOld <= 48 ? 3 : 0;

  return clamp(
    Math.round(
      raw + articleBonus + sourceBonus + docBonus + riskBonus + freshnessBonus,
    ),
  );
}

function strategicIndexFromSituation(
  situation?: ΕνεργόSituationRow | null,
  fallback = 0,
) {
  return clamp(
    Math.round(
      numberValue(
        situation?.strategic_index_score,
        cockpitIntensityScore(situation, fallback),
      ),
    ),
  );
}

function strategicIndexFromAgenda(row?: AgendaOverviewRow | null) {
  return clamp(
    Math.round(
      numberValue(
        row?.strategic_index_score,
        numberValue(row?.agenda_score, 0),
      ),
    ),
  );
}

function rawSignalFromSituation(
  situation?: ΕνεργόSituationRow | null,
  fallback = 0,
) {
  return clamp(
    Math.round(
      numberValue(
        situation?.raw_signal_score,
        situationScore(situation, fallback),
      ),
    ),
  );
}

function rawSignalFromAgenda(row?: AgendaOverviewRow | null) {
  return clamp(
    Math.round(
      numberValue(row?.raw_signal_score, numberValue(row?.agenda_score, 0)),
    ),
  );
}



function EventEvidenceList({
  articles,
  compact = false,
}: {
  articles: EvidenceArticleItem[];
  compact?: boolean;
}) {
  const rows = articles.slice(0, compact ? 4 : 8);

  if (!rows.length) {
    return (
      <EmptyState small>
        Δεν υπάρχουν ακόμη διαθέσιμες πηγές για αυτό το γεγονός.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-2">
      {rows.map((article, index) => {
        const score = numberValue(article.score, 0);
        const body = (
          <>
            <div className="text-[10px] font-semibold tracking-[0.01em] text-cyan-300/85">
              {article.source || "Πηγή"}
            </div>
            <div className="mt-1 text-xs font-medium leading-5 text-zinc-100">
              {article.title || "Άρθρο"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
              <span>Score {score ? Math.round(score) : "—"}</span>
              <span>·</span>
              <span>{evidenceRoleLabel(article.role)}</span>
              <span>·</span>
              <span>{articleDate(article)}</span>
            </div>
            {article.url ? (
              <div className="mt-2 text-[10px] text-cyan-200">
                Άνοιγμα άρθρου ↗
              </div>
            ) : null}
          </>
        );

        return article.url ? (
          <a
            key={
              article.article_id || article.url || `${article.title}-${index}`
            }
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]"
          >
            {body}
          </a>
        ) : (
          <div
            key={article.article_id || `${article.title}-${index}`}
            className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

function topicWhyText(row: AgendaOverviewRow | null | undefined) {
  if (!row) return "Δεν έχει επιλεγεί θεματική.";
  const score = numberValue(row.agenda_score, 0);
  const opportunity = opportunityText(row);
  const coverage = String(row.coverage_level || "").toLowerCase();
  if (opportunity === "Ευκαιρία ανάδειξης") {
    return "Υπάρχει αξιόλογο σήμα, αλλά η κάλυψη παραμένει χαμηλή. Αυτό μπορεί να είναι παράθυρο για έγκαιρη πρωτοβουλία και καθαρό πλαίσιο πριν το ορίσουν άλλοι.";
  }
  if (opportunity === "Χώρος για πλαισίωση") {
    return "Το θέμα έχει ήδη αρκετό σήμα, αλλά δεν έχει κλειδώσει πλήρως το κυρίαρχο πλαίσιο. Υπάρχει χώρος για στοχευμένη παρέμβαση.";
  }
  if (opportunity === "Ήδη στο κέντρο") {
    return "Το θέμα είναι ήδη στο κέντρο της δημόσιας ατζέντας. Η προτεραιότητα είναι καθαρή θέση, τεκμηρίωση και αποφυγή άστοχης κλιμάκωσης.";
  }
  if (score >= 50 || coverage === "high") {
    return "Το θέμα κινείται στην ατζέντα και χρειάζεται παρακολούθηση, ώστε να φανεί αν δημιουργείται πολιτικό παράθυρο παρέμβασης.";
  }
  return "Το θέμα δεν είναι ακόμη ώριμο για μεγάλη δημόσια πρωτοβουλία, αλλά παραμένει χρήσιμο ως σήμα παρακολούθησης.";
}

function readStrategicText(
  situation: ΕνεργόSituationRow | null | undefined,
  brief: StrategicBrief,
) {
  const detail = asRecord(
    (situation as Record<string, unknown> | null | undefined)?.situation_detail,
  );
  const strategicRead = situation?.strategic_read;

  return text(
    // 1) Πραγματική ανάλυση από το brain (situation_detail)
    pickString(detail, ["strategic_read", "why_this_exists"]),
    text(
      // 2) framing_summary (το brain γράφει κι εδώ)
      pickString(situation as unknown, ["framing_summary"]),
      text(
        pickString(strategicRead, [
          "summary",
          "text",
          "strategic_read",
          "diagnosis",
          "what_it_means",
          "assessment",
        ]),
        text(
          brief.strategic_diagnosis?.agenda_reading,
          text(
            brief.daily_brief?.why_it_matters_now,
            "Δεν υπάρχει ακόμη πλήρης Strategic Read για αυτή την κατάσταση. Τρέξε ανάλυση για να γεμίσει.",
          ),
        ),
      ),
    ),
  );
}

function readWhyText(
  situation: ΕνεργόSituationRow | null | undefined,
  brief: StrategicBrief,
) {
  const detail = asRecord(
    (situation as Record<string, unknown> | null | undefined)?.situation_detail,
  );

  return text(
    // 1) Πραγματική ανάλυση από το brain
    pickString(detail, ["why_this_exists", "strategic_read"]),
    text(
      situation?.documentation_basis ||
        situation?.evidence_summary ||
        situation?.framing_summary,
      text(
        brief.evidence?.basis,
        "Η κατάσταση εμφανίζεται επειδή υπάρχει σήμα ατζέντας ή live row στο situation engine. Δεν έχει ακόμη πλήρη τεκμηρίωση basis.",
      ),
    ),
  );
}

function probeRawNumber(item: ProbeAgendaMapItem | null | undefined, keys: string[], fallback = 0) {
  const raw = item?.raw as Record<string, unknown> | undefined;
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "number" || typeof value === "string") {
      const n = numberValue(value, NaN);
      if (Number.isFinite(n)) return clamp(Math.round(n));
    }
  }
  return clamp(Math.round(fallback));
}

function probeSearchSignalScore(
  item: ProbeAgendaMapItem | null | undefined,
  situation: ΕνεργόSituationRow | null | undefined,
) {
  const primary = probeRawNumber(item, ["real_trend_score", "search_interest_score"], NaN);
  const secondary = numberValue(
    situation?.search_interest_score ?? situation?.google_trends_score,
    NaN,
  );

  const values = [primary, secondary].filter((value) => Number.isFinite(value));
  if (!values.length) return 0;

  if (values.length === 1) return clamp(Math.round(values[0]));

  // Οι δύο είσοδοι δημόσιου ενδιαφέροντος: agenda-probe trend + situation/search fallback.
  return clamp(Math.round(values[0] * 0.6 + values[1] * 0.4));
}

function signalStrengthLabel(score: number) {
  if (score >= 70) return "Ισχυρό";
  if (score >= 50) return "Ανιχνεύσιμο";
  if (score >= 30) return "Πρώιμο";
  if (score > 0) return "Χαμηλό";
  return "Άγνωστο";
}

function probeWhyContext(item: ProbeAgendaMapItem | null | undefined, event: ProbeAgendaEventItem | null | undefined, situation: ΕνεργόSituationRow | null | undefined) {
  const title = item?.title || situation?.topic || situation?.title || "η micro-agenda";
  const eventTitle = event?.title || situation?.title || item?.events?.[0]?.title || title;
  const articleCount = numberValue(
    event?.article_count ?? item?.raw?.article_count ?? situation?.article_count,
    0,
  );
  const sourceCount = numberValue(
    event?.source_count ?? item?.raw?.source_count ?? situation?.source_count,
    0,
  );
  const eventCount = item?.events?.length || 0;
  const searchScore = probeSearchSignalScore(item, situation);
  const coverageScore = probeRawNumber(
    item,
    ["real_news_coverage_score", "coverage_score", "news_coverage_score"],
    numberValue(situation?.news_coverage_level, 0),
  );
  const frontpageScore = probeRawNumber(
    item,
    ["real_frontpage_prominence_score", "frontpage_prominence_score"],
    0,
  );
  const freshnessScore = probeRawNumber(item, ["freshness_score"], 0);
  const documentationScore = probeRawNumber(
    item,
    ["documentation_score"],
    evidenceConfidenceScore(articleCount, sourceCount),
  );

  return {
    title,
    eventTitle,
    articleCount,
    sourceCount,
    eventCount,
    searchScore,
    coverageScore,
    frontpageScore,
    freshnessScore,
    documentationScore,
  };
}

function whyProbeAgendaExistsText(
  item: ProbeAgendaMapItem | null | undefined,
  event: ProbeAgendaEventItem | null | undefined,
  situation: ΕνεργόSituationRow | null | undefined,
) {
  const ctx = probeWhyContext(item, event, situation);

  if (!item) {
    return readWhyText(situation, {});
  }

  const searchHigh = ctx.searchScore >= 60;
  const coverageHigh = ctx.coverageScore >= 60;
  const coverageMedium = ctx.coverageScore >= 35;
  const frontpageHigh = ctx.frontpageScore >= 55;
  const docStrong = ctx.documentationScore >= 55;
  const manyEvents = ctx.eventCount >= 3;

  if (searchHigh && coverageHigh) {
    return `Η «${ctx.title}» υπάρχει στον Χάρτη επειδή δεν είναι απλώς δημοσιογραφικό επεισόδιο: συμπίπτουν δημόσιο ενδιαφέρον και πραγματική κάλυψη. Το ενεργό γεγονός «${ctx.eventTitle}» δίνει πρόσωπο στη micro-agenda, ενώ τα ${ctx.articleCount || "—"} άρθρα και οι ${ctx.sourceCount || "—"} πηγές δείχνουν ότι το θέμα έχει περάσει από μεμονωμένη είδηση σε πεδίο πίεσης. Εδώ ο σύμβουλος δεν βλέπει μόνο ένταση· βλέπει θέμα που μπορεί να απαιτήσει καθαρή πολιτική θέση.`;
  }

  if (searchHigh && !coverageHigh) {
    return `Η «${ctx.title}» μπήκε στον Χάρτη επειδή το δημόσιο ενδιαφέρον κινείται πιο γρήγορα από την οργανωμένη κάλυψη. Αυτό είναι σημαντικό: η micro-agenda δεν έχει ακόμη πλήρως κλειδώσει από τα μέσα, άρα υπάρχει παράθυρο να οριστεί το πλαίσιο πριν το κάνουν άλλοι. Το «${ctx.eventTitle}» λειτουργεί ως πρώτο ορατό σημείο, όχι ως τελική εικόνα.`;
  }

  if (!searchHigh && coverageHigh) {
    return `Η «${ctx.title}» υπάρχει επειδή η κάλυψη και οι πηγές σηκώνουν θέμα πριν φανεί καθαρά αν το ακολουθεί το ευρύ κοινό. Αυτό δεν είναι αδυναμία· είναι προειδοποιητικό σήμα. Το «${ctx.eventTitle}» δείχνει ότι το πεδίο κινείται θεσμικά ή ειδησεογραφικά, αλλά η πολιτική αξία του θα κριθεί από το αν μετατραπεί σε καθημερινό ερώτημα για περισσότερους.`;
  }

  if (frontpageHigh || docStrong || manyEvents) {
    return `Η «${ctx.title}» υπάρχει στον Χάρτη επειδή μαζεύει αρκετά επιμέρους σήματα ώστε να μην αγνοηθεί. Δεν είναι απαραίτητα κεντρικό θέμα ακόμη, αλλά το «${ctx.eventTitle}» συνδέεται με ${ctx.eventCount || "—"} σχετικά γεγονότα και σχηματίζει μικροατζέντα. Αυτό είναι το σημείο όπου ο σύμβουλος ξεχωρίζει το απλό monitoring από το πιθανό agenda opening.`;
  }

  if (coverageMedium || ctx.searchScore >= 30) {
    return `Η «${ctx.title}» παρακολουθείται επειδή εμφανίζει πρώιμο αλλά υπαρκτό σήμα. Το «${ctx.eventTitle}» από μόνο του δεν αρκεί για μεγάλη κλιμάκωση, όμως δείχνει πιθανή κατεύθυνση: αν προστεθεί δεύτερο γεγονός, ισχυρότερη πηγή ή αντίδραση actor, η micro-agenda μπορεί να περάσει από παρακολούθηση σε πολιτική προτεραιότητα.`;
  }

  return `Η «${ctx.title}» βρίσκεται στον Χάρτη ως χαμηλό σήμα παρακολούθησης. Αυτό σημαίνει ότι ο Noraya την κρατά στο πεδίο όχι επειδή είναι ήδη ατζέντα, αλλά επειδή μπορεί να συνδεθεί με ισχυρότερο θέμα αν αλλάξει η κάλυψη, η αναζήτηση ή η πολιτική αντίδραση γύρω από το «${ctx.eventTitle}».`;
}

function whyProbeAgendaUnknownText(
  item: ProbeAgendaMapItem | null | undefined,
  event: ProbeAgendaEventItem | null | undefined,
  situation: ΕνεργόSituationRow | null | undefined,
) {
  const ctx = probeWhyContext(item, event, situation);

  if (!item) {
    return text(
      situation?.evidence_summary,
      "Χρειάζεται νέο σήμα, δεύτερη πηγή ή πολιτική αντίδραση για να αναθεωρηθεί η εκτίμηση.",
    );
  }

  if (ctx.searchScore >= 60 && ctx.coverageScore < 45) {
    return `Το ανοιχτό ερώτημα είναι αν το δημόσιο ενδιαφέρον θα βρει πολιτικό φορέα και αφήγημα ή θα μείνει διάσπαρτη αναζήτηση. Θέλουμε δεύτερο γεγονός ή καθαρή αντίδραση actor για να ξέρουμε αν η micro-agenda μπορεί να σηκωθεί δημόσια.`;
  }

  if (ctx.coverageScore >= 60 && ctx.searchScore < 35) {
    return `Δεν ξέρουμε ακόμη αν η έντονη κάλυψη περνάει έξω από το ειδησεογραφικό/θεσμικό κύκλωμα. Αν δεν ακολουθήσει ενδιαφέρον κοινού ή κοινωνική σύνδεση, το θέμα μπορεί να μείνει “θέμα πηγών” και όχι θέμα ατζέντας.`;
  }

  if (ctx.documentationScore < 35) {
    return `Η βασική αβεβαιότητα είναι η τεκμηρίωση. Χρειάζεται καθαρότερη δεύτερη πηγή, νεότερο άρθρο ή πιο συγκεκριμένο στοιχείο πριν η micro-agenda γίνει ασφαλής βάση δημόσιας παρέμβασης.`;
  }

  if (ctx.eventCount <= 1) {
    return `Αυτό που λείπει είναι η επανάληψη. Ένα γεγονός μπορεί να ανοίξει micro-agenda, αλλά χρειάζεται δεύτερο συγγενές επεισόδιο ή actor reaction για να φανεί ότι έχουμε μοτίβο και όχι απλή ημερήσια είδηση.`;
  }

  return `Δεν ξέρουμε ακόμη ποια διάσταση θα κλειδώσει: κοινωνική πίεση, θεσμική ευθύνη, κόστος ζωής ή κομματική αντιπαράθεση. Η επόμενη πηγή ή αντίδραση θα δείξει αν η micro-agenda σηκώνεται ή μένει σε επίπεδο παρακολούθησης.`;
}

function whyProbeSignalPills(
  item: ProbeAgendaMapItem | null | undefined,
  event: ProbeAgendaEventItem | null | undefined,
  situation: ΕνεργόSituationRow | null | undefined,
) {
  const ctx = probeWhyContext(item, event, situation);

  return [
    {
      label: "Δημόσιο ενδιαφέρον",
      value: signalStrengthLabel(ctx.searchScore),
      score: ctx.searchScore,
    },
    {
      label: "Κάλυψη",
      value: coverageLabel(ctx.coverageScore >= 60 ? "high" : ctx.coverageScore >= 35 ? "medium" : "low"),
      score: ctx.coverageScore,
    },
    {
      label: "Βάση",
      value: docLabelFromScore(ctx.documentationScore),
      score: ctx.documentationScore,
    },
    {
      label: "Φρεσκάδα",
      value: signalStrengthLabel(ctx.freshnessScore),
      score: ctx.freshnessScore,
    },
  ];
}

function publicPulseScore(situation: ΕνεργόSituationRow | null | undefined) {
  const pulse = asRecord(situation?.public_pulse);
  return clamp(
    numberValue(
      pulse?.social_mood_score ?? pulse?.mood_score ?? pulse?.score,
      0,
    ),
  );
}

function redTeamItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 5)
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          attack_text: item,
          risk_level: "medium",
          likely_actor: "—",
          suggested_defense:
            "Να προετοιμαστεί ασφαλής απάντηση πριν από δημόσια κλιμάκωση.",
        };
      }

      const record = asRecord(item);
      if (!record) return null;

      return {
        attack_text: pickString(
          record,
          ["attack_text", "attack", "text"],
          `Αντεπίθεση ${index + 1}`,
        ),
        risk_level: pickString(record, ["risk_level", "risk"], "medium"),
        likely_actor: pickString(record, ["likely_actor", "actor"], "—"),
        suggested_defense: pickString(
          record,
          ["suggested_defense", "defense", "response"],
          "Να ετοιμαστεί γραμμή άμυνας.",
        ),
      };
    })
    .filter(
      (
        item,
      ): item is {
        attack_text: string;
        risk_level: string;
        likely_actor: string;
        suggested_defense: string;
      } => Boolean(item),
    );
}

// ΠΡΑΓΜΑΤΙΚΗ τεκμηρίωση από πλήθος άρθρων/πηγών (όχι καρφωτό 34).
// Ευθυγραμμισμένο με τα κατώφλια: ~5 ανεξάρτητες πηγές & ~8 άρθρα = ισχυρή.
function evidenceConfidenceScore(articleCount: number, sourceCount: number) {
  const a = Math.max(0, numberValue(articleCount, 0));
  const s = Math.max(0, numberValue(sourceCount, 0));
  const sourceComp = Math.min(100, (s / 5) * 100); // οι ανεξάρτητες πηγές μετράνε περισσότερο
  const articleComp = Math.min(100, (a / 8) * 100); // ο όγκος άρθρων
  const score = 0.6 * sourceComp + 0.4 * articleComp;
  return Math.round(Math.min(100, Math.max(0, score)));
}

function docLabelFromScore(score?: number | null) {
  const sc = numberValue(score, 0);
  if (sc >= 65) return "Στερεή βάση εκτίμησης";
  if (sc >= 35) return "Σχηματισμένη εικόνα";
  if (sc > 0) return "Πρώτη εικόνα";
  return "Πρώτη εικόνα";
}

export default function StrategyRoomPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [situationEngine, setSituationEngine] =
    useState<SituationEngineResponse | null>(null);
  const [agendaProbe, setAgendaProbe] = useState<ProbeV4Response | null>(null);
  const [strategicImageCache, setStrategicImageCache] = useState<Record<string, string>>({});
  const fetchingStrategicRef = useRef<Set<string>>(new Set());
  const [strategicPlayCache, setStrategicPlayCache] = useState<Record<string, any>>({});
  const fetchingPlayRef = useRef<Set<string>>(new Set());
  const [aiBusyIds, setAiBusyIds] = useState<Record<string, boolean>>({});
  const [activeProbeSelection, setActiveProbeSelection] =
    useState<AgendaProbeSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [situationWarning, setSituationWarning] = useState("");
  const [activeSituationId, setActiveSituationId] = useState<string | null>(
    null,
  );
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const requestedBriefRef = useRef<Map<string, number>>(new Map());
  const [activeTab, setActiveTab] = useState<SituationTab>("strategic");
  const [activeOverviewTopic, setActiveOverviewTopic] = useState<string | null>(
    null,
  );

  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [agendaArchitectLoading, setAgendaArchitectLoading] = useState(false);
  const [agendaArchitectError, setAgendaArchitectError] = useState("");
  const [agendaArchitectResult, setAgendaArchitectResult] =
    useState<AgendaArchitectResult | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [advisorConversations, setAdvisorConversations] = useState<
    AdvisorConversation[]
  >([]);
  const [advisorStorageReady, setAdvisorStorageReady] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  async function loadCockpit() {
    setLoading(true);
    setError("");
    setSituationWarning("");

    try {
      const briefResponse = await fetch("/api/advisor/strategy-brief?limit=8", {
        cache: "no-store",
      });

      if (briefResponse.status === 401) {
        window.location.href = "/signin/password_signin?next=/strategy-room";
        return;
      }

      if (briefResponse.status === 409) {
        window.location.href = "/onboarding";
        return;
      }

      if (!briefResponse.ok) {
        throw new Error(`Strategy brief API error: ${briefResponse.status}`);
      }

      const briefJson = (await briefResponse.json()) as ApiResponse;
      setData(briefJson);

      const activeParty = briefJson?.profile?.party_key || "elas";
      const situationResponse = await fetch(
        `/api/situation-engine?token=dev&party=${encodeURIComponent(activeParty)}`,
        { cache: "no-store" },
      );

      if (situationResponse.ok) {
        const situationJson =
          (await situationResponse.json()) as SituationEngineResponse;
        setSituationEngine(situationJson);
      } else {
        setSituationEngine(null);
        setSituationWarning(
          `Situation engine API error: ${situationResponse.status}`,
        );
      }

      try {
        const agendaProbeResponse = await fetch(
          `/api/situation-engine/agenda-probe?token=dev&hours=168&party=${encodeURIComponent(activeParty)}`,
          { cache: "no-store" },
        );

        if (agendaProbeResponse.ok) {
          setAgendaProbe((await agendaProbeResponse.json()) as ProbeV4Response);
        } else {
          setAgendaProbe(null);
        }
      } catch {
        setAgendaProbe(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCockpit();
  }, []);

  const politicalEnvironment = data?.political_environment || null;
  const selectedPartyKey = data?.profile?.party_key || "";
  const selectedPartyImplication = partyImplicationText(
    politicalEnvironment,
    selectedPartyKey,
  );

  const rankedAgenda = useMemo<RankedAgenda[]>(() => {
    const agendaRows = Array.isArray(data?.agenda_used)
      ? data.agenda_used
          .filter((row) => row?.topic && row.topic !== "Μη ταξινομημένο")
          .slice(0, 8)
      : [];

    const totalAgendaWeight = agendaRows.reduce((sum, row) => {
      return (
        sum + Math.max(numberValue(row.agenda_score, row.article_count || 0), 1)
      );
    }, 0);

    return agendaRows.map((row, index) => {
      const rawWeight = Math.max(
        numberValue(row.agenda_score, row.article_count || 0),
        1,
      );
      const share =
        totalAgendaWeight > 0
          ? Math.round((rawWeight / totalAgendaWeight) * 100)
          : 0;

      return {
        ...row,
        rank: index + 1,
        score: rawWeight,
        share,
        signalLabel: riskLabel(row.political_risk_level),
        documentationLabel: documentationLabel(row.documentation_level),
        evidenceArticles: evidenceArticleItems(row.top_evidence_articles),
      };
    });
  }, [data?.agenda_used]);

  const liveSituations = useMemo(() => {
    const rows = Array.isArray(situationEngine?.situations)
      ? situationEngine.situations
      : [];
    return rows.slice(0, 25);
  }, [situationEngine?.situations]);
  const agendaOverview = useMemo<AgendaOverviewRow[]>(() => {
    const rows = Array.isArray(situationEngine?.agenda_overview)
      ? situationEngine.agenda_overview
      : [];
    return rows.filter((row) => row?.topic && row.topic !== "Μη ταξινομημένο");
  }, [situationEngine?.agenda_overview]);

  const probeAgendaMap = useMemo<ProbeAgendaMapItem[]>(() => {
    return agendaProbe?.success ? buildAgendaMap(agendaProbe) : [];
  }, [agendaProbe]);

  const probeThematicOverview = useMemo<AgendaOverviewRow[]>(() => {
    return buildProbeThematicOverview(probeAgendaMap, agendaOverview);
  }, [probeAgendaMap, agendaOverview]);

  const effectiveAgendaOverview = useMemo<AgendaOverviewRow[]>(() => {
    return probeThematicOverview.length ? probeThematicOverview : agendaOverview;
  }, [probeThematicOverview, agendaOverview]);

  const probePriorityCards = useMemo<ProbePriorityCard[]>(() => {
    return agendaProbe?.success ? buildPriorityCards(agendaProbe) : [];
  }, [agendaProbe]);

  useEffect(() => {
    if (!activeProbeSelection && probeAgendaMap.length > 0) {
      const firstItem = probeAgendaMap[0];
      setActiveProbeSelection({
        clusterId: firstItem.id,
        eventId: firstItem.events[0]?.id ?? null,
      });
    }
  }, [activeProbeSelection, probeAgendaMap]);

  const activeProbeItem = useMemo(() => {
    if (!probeAgendaMap.length) return null;
    return (
      probeAgendaMap.find((item) => item.id === activeProbeSelection?.clusterId) ||
      probeAgendaMap[0]
    );
  }, [activeProbeSelection?.clusterId, probeAgendaMap]);

  const activeProbeEvent = useMemo(() => {
    const events = activeProbeItem?.events ?? [];
    if (!events.length) return undefined;
    return (
      events.find((event) => event.id === activeProbeSelection?.eventId) ||
      events[0]
    );
  }, [activeProbeItem, activeProbeSelection?.eventId]);

  const activeProbeView = useMemo<EventIntelligenceView | null>(() => {
    if (!activeProbeItem) return null;
    return buildEventIntelligenceView(activeProbeItem.raw, activeProbeEvent);
  }, [activeProbeEvent, activeProbeItem]);

  const activeProbeEvidenceArticles = useMemo(() => {
    return evidenceArticlesFromProbeItem(activeProbeItem);
  }, [activeProbeItem]);

  const probeSituationCount = useMemo(() => {
    return probeAgendaMap.reduce((sum, item) => sum + item.events.length, 0);
  }, [probeAgendaMap]);

  // On-demand AI strategic image — καλείται όταν αλλάζει το active cluster
  useEffect(() => {
    if (!activeProbeItem) return;
    const raw = activeProbeItem.raw;
    const eventId = String(activeProbeEvent?.id || activeProbeSelection?.eventId || "");
    const id = String((raw.micro_agenda_id || raw.micro_agenda || "") + (eventId ? "__" + eventId : ""));
    if (!id) return;
    if (strategicImageCache[id]) return; // ήδη έχουμε
    if (fetchingStrategicRef.current.has(id)) return; // ήδη φέρνουμε
    if (raw.requires_human_review || raw.sensitivity_level === "high") return; // sensitive — δεν το στέλνουμε

    fetchingStrategicRef.current.add(id);
    setAiBusyIds((p) => ({ ...p, [id + "|img"]: true }));

    const partyKey = (data as any)?.profile?.party_key || "elas";
    const partyName = (data as any)?.profile?.party_profile_snapshot?.party_name || "ΕΛΑΣ";
    const partyProfile = (data as any)?.profile;
    const redLines: string[] = Array.isArray(partyProfile?.red_lines) ? partyProfile.red_lines : [];
    const knownPositions: string[] = Array.isArray(partyProfile?.known_positions) ? partyProfile.known_positions : [];
    const tone: string = partyProfile?.default_tone || "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός";

    const eventTitles: string[] = (raw.top_events || []).map((e: any) => String(e.title || "")).filter(Boolean);
    const articleTitles: string[] = (raw.evidence_articles || []).map((a: any) => String(a.title || "")).filter(Boolean);
    const sourcesArr: string[] = Array.from(new Set((raw.evidence_articles || []).map((a: any) => String(a.source || "")).filter(Boolean))) as string[];

    (async () => {
      try {
        const resp = await fetch("/api/situation-engine/strategic-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            micro_agenda_id: id,
            micro_agenda: raw.micro_agenda,
            theme: String(raw.parent_topic || raw.parent_topics?.[0] || ""),
            active_event_id: eventId || null,
            active_event_title: String(activeProbeEvent?.title || "") || null,
            party_key: partyKey,
            party_name: partyName,
            red_lines: redLines,
            known_positions: knownPositions,
            tone,
            event_titles: eventTitles,
            article_titles: articleTitles,
            sources: sourcesArr,
            real_news_coverage_score: raw.real_news_coverage_score ?? null,
            real_trend_score: raw.real_trend_score ?? null,
            score: raw.score ?? 0,
            memory_lines: [],
          }),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json.ok && json.body) {
            setStrategicImageCache((prev) => ({ ...prev, [id]: json.body }));
          }
        }
      } catch {
        // best-effort — fallback στο template
      } finally {
        fetchingStrategicRef.current.delete(id);
        setAiBusyIds((p) => ({ ...p, [id + "|img"]: false }));
      }
    })();
  }, [activeProbeItem, activeProbeEvent, activeProbeSelection, data, strategicImageCache]);

  // On-demand AI «Πώς κερδίζεται» + «Επιλογές» ανά γεγονός (premium, μη-generic)
  useEffect(() => {
    if (!activeProbeItem) return;
    const raw = activeProbeItem.raw;
    const eventId = String(activeProbeEvent?.id || activeProbeSelection?.eventId || "");
    const id = String((raw.micro_agenda_id || raw.micro_agenda || "") + (eventId ? "__" + eventId : ""));
    if (!id) return;
    if (strategicPlayCache[id]) return;
    if (fetchingPlayRef.current.has(id)) return;
    if (raw.requires_human_review || raw.sensitivity_level === "high") return;

    fetchingPlayRef.current.add(id);
    setAiBusyIds((p) => ({ ...p, [id + "|play"]: true }));

    const partyKey = (data as any)?.profile?.party_key || "elas";
    const partyName = (data as any)?.profile?.party_profile_snapshot?.party_name || "ΕΛΑΣ";
    const partyProfile = (data as any)?.profile;
    const redLines: string[] = Array.isArray(partyProfile?.red_lines) ? partyProfile.red_lines : [];
    const knownPositions: string[] = Array.isArray(partyProfile?.known_positions) ? partyProfile.known_positions : [];
    const tone: string = partyProfile?.default_tone || "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός";

    const eventTitles: string[] = (raw.top_events || []).map((e: any) => String(e.title || "")).filter(Boolean);
    const articleTitles: string[] = (raw.evidence_articles || []).map((a: any) => String(a.title || "")).filter(Boolean);
    const sourcesArr: string[] = Array.from(new Set((raw.evidence_articles || []).map((a: any) => String(a.source || "")).filter(Boolean))) as string[];

    (async () => {
      try {
        const resp = await fetch("/api/situation-engine/strategic-play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            micro_agenda_id: id,
            micro_agenda: raw.micro_agenda,
            theme: String(raw.parent_topic || raw.parent_topics?.[0] || ""),
            active_event_id: eventId || null,
            active_event_title: String(activeProbeEvent?.title || "") || null,
            party_key: partyKey,
            party_name: partyName,
            red_lines: redLines,
            known_positions: knownPositions,
            tone,
            event_titles: eventTitles,
            article_titles: articleTitles,
            sources: sourcesArr,
            real_news_coverage_score: raw.real_news_coverage_score ?? null,
            real_trend_score: raw.real_trend_score ?? null,
            score: raw.score ?? 0,
          }),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json.ok && json.body) {
            setStrategicPlayCache((prev) => ({ ...prev, [id]: json.body }));
          }
        }
      } catch {
        // best-effort — fallback στα templates
      } finally {
        fetchingPlayRef.current.delete(id);
        setAiBusyIds((p) => ({ ...p, [id + "|play"]: false }));
      }
    })();
  }, [activeProbeItem, activeProbeEvent, activeProbeSelection, data, strategicPlayCache]);

  useEffect(() => {
    if (
      effectiveAgendaOverview.length > 0 &&
      (!activeOverviewTopic ||
        !effectiveAgendaOverview.some((row) => row.topic === activeOverviewTopic))
    ) {
      setActiveOverviewTopic(effectiveAgendaOverview[0].topic);
    }
  }, [activeOverviewTopic, effectiveAgendaOverview]);

  const selectedAgendaOverview = useMemo(() => {
    if (!effectiveAgendaOverview.length) return null;
    return (
      effectiveAgendaOverview.find((row) => row.topic === activeOverviewTopic) ||
      effectiveAgendaOverview[0]
    );
  }, [activeOverviewTopic, effectiveAgendaOverview]);

  async function runAgendaArchitect() {
    setAgendaArchitectLoading(true);
    setAgendaArchitectError("");

    try {
      const response = await fetch("/api/strategy-room/agenda-architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party: partyName,
          profile: data?.profile || null,
          strategic_brief: data?.strategic_brief || null,
          political_environment: data?.political_environment || null,
          agenda_overview: effectiveAgendaOverview,
          probe_agenda_map: probeAgendaMap,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || `Agenda Architect API error: ${response.status}`);
      }

      setAgendaArchitectResult({
        title: json.title || "Στρατηγική Αναδιάταξη Ημέρας",
        displayText: json.displayText || "",
        generatedAt: json.generatedAt,
        chatContext: json.chatContext || null,
      });
    } catch (err) {
      setAgendaArchitectError(
        err instanceof Error
          ? err.message
          : "Δεν μπόρεσε να παραχθεί η Κίνηση Αναδιάταξης.",
      );
    } finally {
      setAgendaArchitectLoading(false);
    }
  }

  function continueAgendaArchitectInAdvisor() {
    if (!agendaArchitectResult) return;
    setActiveTab("overview");
    askNorayaAdvisor(
      "Συνέχισε από την Κίνηση Αναδιάταξης. Θέλω να μου πεις πώς το μετατρέπω σε πολιτική γραμμή για τις επόμενες 24 ώρες.",
    );
  }

  useEffect(() => {
    if (!activeSituationId && liveSituations.length > 0) {
      // Αν ήρθαμε από την Ατζέντα με ?topic=, προεπίλεξε το αντίστοιχο θέμα· αλλιώς το πρώτο.
      let targetId = situationId(liveSituations[0], 0);
      try {
        const wanted = (
          new URLSearchParams(window.location.search).get("topic") || ""
        )
          .trim()
          .toLowerCase();
        if (wanted) {
          const idx = liveSituations.findIndex((s) => {
            const tp = String((s as any).topic || (s as any).category || "")
              .trim()
              .toLowerCase();
            return tp === wanted;
          });
          if (idx >= 0) targetId = situationId(liveSituations[idx], idx);
        }
      } catch {
        /* αγνοούμε — fallback στο πρώτο */
      }
      setActiveSituationId(targetId);
    }
  }, [activeSituationId, liveSituations]);

  const activeSituation = useMemo(() => {
    if (!liveSituations.length) return null;
    return (
      liveSituations.find(
        (situation, index) =>
          situationId(situation, index) === activeSituationId,
      ) ||
      liveSituations.find(
        (situation) =>
          String(situation.status || "").toLowerCase() === "active",
      ) ||
      liveSituations[0]
    );
  }, [activeSituationId, liveSituations]);

  // Α: On-demand ανάλυση — αν το επιλεγμένο γεγονός δεν έχει ακόμη άποψη, ζήτα την τώρα (cached μετά).
  useEffect(() => {
    if (!activeSituation) return;
    if (analyzingId) return;
    const ab = (activeSituation as any).advisor_brief;
    const hasScenarios =
      ab && Array.isArray(ab.scenarios) && ab.scenarios.length > 0;
    if (hasScenarios) return;
    const id = String((activeSituation as any).id || "");
    if (!id) return;
    const tries = requestedBriefRef.current.get(id) || 0;
    if (tries >= 2) return;
    requestedBriefRef.current.set(id, tries + 1);
    const party = (data as any)?.profile?.party_key || "elas";
    setAnalyzingId(id);
    (async () => {
      try {
        await fetch(
          `/api/situation-engine/advise-event?force=1&event_id=${encodeURIComponent(id)}&party=${encodeURIComponent(party)}`,
          { cache: "no-store" },
        );
        const r = await fetch(
          `/api/situation-engine?token=dev&party=${encodeURIComponent(party)}`,
          { cache: "no-store" },
        );
        if (r.ok)
          setSituationEngine((await r.json()) as SituationEngineResponse);
      } catch {
        requestedBriefRef.current.set(id, tries);
      } finally {
        setAnalyzingId((cur) => (cur === id ? null : cur));
      }
    })();
  }, [activeSituation, data, analyzingId]);

  // Το brief έρχεται ΜΟΝΟ από την ανάλυση ΤΟΥ ΕΠΙΛΕΓΜΕΝΟΥ ΓΕΓΟΝΟΤΟΣ.
  // ΠΟΤΕ δεν πέφτουμε στο global strategy-brief: θα έδειχνε περιεχόμενο ΑΛΛΟΥ θέματος
  // (π.χ. γεωπολιτική σε ένα περιβαλλοντικό γεγονός). Αν δεν υπάρχει ακόμη ανάλυση,
  // δείχνουμε ουδέτερα placeholders και το on-demand (Α) τη γεμίζει με τη σωστή ανάλυση.
  const brief: StrategicBrief =
    ((activeSituation as any)?.advisor_brief as StrategicBrief) ||
    ({} as StrategicBrief);
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const diagnosis = brief.strategic_diagnosis || {};
  const messages = brief.message_package || {};
  const actionPlan = brief.action_plan || {};
  const monitoring = brief.monitoring_plan || {};
  const evidence = brief.evidence || {};

  const profile = data?.profile || null;
  const partyName = partyDisplayName(profile);
  const partyLogo = profile?.party_profile_snapshot?.logo_url || "";
  const partyInitial = partyInitials(profile);

  const baseActiveTitle = situationTitle(
    activeSituation,
    text(
      daily.headline,
      text(
        issue.plain_title,
        rankedAgenda[0]?.topic || "Στρατηγική εικόνα ημέρας",
      ),
    ),
  );
  const activeTitle = activeProbeView?.eventTitle || baseActiveTitle;
  const activeCategory =
    activeProbeView?.microAgenda ||
    text(
      activeSituation?.category || activeSituation?.topic || issue.topic,
      "Πολιτική ατζέντα",
    );
  const activeStatus = text(
    activeSituation?.status,
    liveSituations.length ? "active" : "derived",
  );
  const activeUrgency = text(
    activeSituation?.urgency || issue.urgency,
    "watch",
  );
  const activeScore =
    activeProbeView?.score ??
    situationScore(
      activeSituation,
      numberValue(rankedAgenda[0]?.score, 0),
    );
  const activeIntensityScore = strategicIndexFromSituation(
    activeSituation,
    activeScore,
  );
  const activeRawSignal = rawSignalFromSituation(activeSituation, activeScore);
  const activeSearchInterest = numberValue(
    activeSituation?.search_interest_score,
    50,
  );
  const activeStrategicBoost = numberValue(
    activeSituation?.strategic_boost_score,
    cockpitIntensityScore(activeSituation, activeScore),
  );
  const activeSituationEvidenceArticles = evidenceArticlesFromSituation(activeSituation);
  const activeEvidenceArticles = activeProbeEvidenceArticles.length
    ? activeProbeEvidenceArticles
    : activeSituationEvidenceArticles;
  const activeDocLevel =
    activeSituation?.documentation_level ||
    issue.documentation_level ||
    evidence.documentation_level ||
    null;
  const activeDocScore = evidenceConfidenceScore(
    numberValue(activeSituation?.article_count, 0),
    numberValue(activeSituation?.source_count, 0),
  );

  const evidenceArticles = activeEvidenceArticles.length
    ? activeEvidenceArticles.map((article) => ({
        title: article.title || "Άρθρο",
        source: article.source || "",
        url: article.url || undefined,
        score: article.score,
        role: article.role,
        published_at: article.published_at,
      }))
    : Array.isArray(brief.evidence?.data_points)
      ? brief.evidence.data_points
          .slice(0, 8)
          .map((point: string) => ({ title: point, source: "" }))
      : [];

  const advisorSituationKey = useMemo(() => {
    const partyKey =
      data?.profile?.party_key || partyShortName(profile) || "unknown-party";
    const probeKey = activeProbeSelection
      ? `${activeProbeSelection.clusterId || ""}::${activeProbeSelection.eventId || ""}`
      : "";
    const situationKey = String(
      probeKey || (activeSituation as any)?.id || activeTitle || "no-active-situation",
    );
    return `noraya-advisor:${partyKey}:${situationKey}`;
  }, [activeProbeSelection, activeSituation, activeTitle, data?.profile?.party_key, profile]);

  useEffect(() => {
    setAdvisorStorageReady(false);

    try {
      const raw = window.localStorage.getItem(advisorSituationKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const conversations: AdvisorConversation[] = Array.isArray(parsed)
        ? parsed
        : [];
      setAdvisorConversations(conversations);

      const latest = conversations[0];
      if (latest) {
        setConversationId(latest.id);
        setChatMessages(Array.isArray(latest.messages) ? latest.messages : []);
      } else {
        setConversationId(null);
        setChatMessages([]);
      }
      setChatQuestion("");
      setChatError("");
    } catch {
      setAdvisorConversations([]);
      setConversationId(null);
      setChatMessages([]);
    } finally {
      setAdvisorStorageReady(true);
    }
  }, [advisorSituationKey]);

  useEffect(() => {
    if (!advisorStorageReady) return;

    try {
      window.localStorage.setItem(
        advisorSituationKey,
        JSON.stringify(advisorConversations.slice(0, 20)),
      );
    } catch {
      // localStorage can be unavailable in private browsing; chat still works in memory.
    }
  }, [advisorConversations, advisorSituationKey, advisorStorageReady]);

  function upsertAdvisorConversation(
    id: string,
    conversationMessages: ChatMessage[],
    replaceId?: string | null,
  ) {
    if (!conversationMessages.length) return;

    const now = new Date().toISOString();
    const firstUserMessage =
      conversationMessages.find((message) => message.role === "user")
        ?.content || "Νέα συνομιλία";
    const title =
      firstUserMessage.length > 88
        ? `${firstUserMessage.slice(0, 88)}…`
        : firstUserMessage;

    setAdvisorConversations((prev) => {
      const existing = prev.find(
        (conversation) =>
          conversation.id === id || conversation.id === replaceId,
      );
      const rest = prev.filter(
        (conversation) =>
          conversation.id !== id && conversation.id !== replaceId,
      );

      return [
        {
          id,
          title: existing?.title || title,
          situationTitle: activeTitle,
          messages: conversationMessages,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        },
        ...rest,
      ].slice(0, 20);
    });
  }

  function openAdvisorConversation(id: string) {
    const conversation = advisorConversations.find((item) => item.id === id);
    if (!conversation) return;

    setConversationId(conversation.id);
    setChatMessages(conversation.messages);
    setChatQuestion("");
    setChatError("");

    setTimeout(() => {
      const node = chatScrollRef.current;
      node?.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }, 80);
  }

  function renameAdvisorConversation(id: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setAdvisorConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title: cleanTitle.length > 90 ? `${cleanTitle.slice(0, 90)}…` : cleanTitle,
              updatedAt: new Date().toISOString(),
            }
          : conversation,
      ),
    );
  }

  function deleteAdvisorConversation(id: string) {
    const remaining = advisorConversations.filter((conversation) => conversation.id !== id);
    setAdvisorConversations(remaining);

    if (conversationId === id) {
      const next = remaining[0];
      setConversationId(next?.id || null);
      setChatMessages(next?.messages || []);
      setChatQuestion("");
      setChatError("");
    }
  }

  function startNewAdvisorConversation() {
    setConversationId(null);
    setChatMessages([]);
    setChatQuestion("");
    setChatError("");
  }

  async function askNorayaAdvisor(questionOverride?: string) {
    const question = (questionOverride || chatQuestion).trim();

    if (!question) {
      setChatError(
        "Γράψε πρώτα την ερώτηση που θέλεις να κάνεις στον σύμβουλο Noraya.",
      );
      return;
    }

    // ΤΟ ΣΩΣΤΟ ΕΝΕΡΓΟ ΓΕΓΟΝΟΣ: όταν έχεις διαλέξει γεγονός από τον Χάρτη ατζέντας
    // (probe), στέλνουμε ΑΥΤΟ στον advisor — όχι το παλιό activeSituation που
    // μπορεί να αφορά άλλο θέμα. Έτσι ο σύμβουλος κλειδώνει στο σωστό γεγονός.
    const advisorActiveSituation = activeProbeItem
      ? {
          id:
            activeProbeSelection?.eventId ||
            activeProbeEvent?.id ||
            activeProbeItem.id,
          title: activeProbeView?.eventTitle || activeProbeEvent?.title || activeProbeItem.title,
          topic: activeProbeView?.microAgenda || activeProbeItem.title,
          summary: pickString(activeProbeView as unknown, ["summary"], ""),
          status: "live",
          event_score: activeProbeView?.score ?? activeProbeEvent?.event_score ?? activeProbeItem.score,
          documentation_level: activeProbeView?.evidenceLabel || "",
          article_count: numberValue(activeProbeItem.raw?.article_count, 0),
          source_count: numberValue(activeProbeItem.raw?.source_count, 0),
          evidence_articles: activeProbeEvidenceArticles || [],
          advisor_brief: (activeSituation as any)?.advisor_brief || null,
        }
      : activeSituation;

    const localConversationId = conversationId || `local-${Date.now()}`;
    const userMessage: ChatMessage = { role: "user", content: question };
    const nextUserMessages = [...chatMessages, userMessage];

    setConversationId(localConversationId);
    setChatMessages(nextUserMessages);
    upsertAdvisorConversation(localConversationId, nextUserMessages);
    setChatQuestion("");
    setChatLoading(true);
    setChatError("");

    try {
      const response = await fetch("/api/advisor/strategy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: chatMessages,
          conversation_id: localConversationId,
          profile: data?.profile || null,
          strategic_brief: data?.strategic_brief || null,
          political_environment: data?.political_environment || null,
          political_environment_status:
            data?.political_environment_status || "",
          agenda_used: data?.agenda_used || [],
          party: partyName,
          articles: evidenceArticles,
          active_situation: advisorActiveSituation || null,
          advisor_mode: activeTab === "overview" && agendaArchitectResult ? "agenda_architect" : "event",
          agenda_architect_display: agendaArchitectResult?.displayText || "",
          agenda_architect_context: agendaArchitectResult?.chatContext || null,
        }),
      });

      if (!response.ok) {
        let errorMessage = `Strategy chat API error: ${response.status}`;

        try {
          const errorJson = await response.json();
          errorMessage =
            typeof errorJson?.answer === "string" && errorJson.answer.trim()
              ? errorJson.answer
              : "Ο σύμβουλος Noraya δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.";
        } catch {
          // Keep default error.
        }

        throw new Error(errorMessage);
      }

      const json = (await response.json()) as StrategyChatResponse;
      const answer =
        json.answer || "Ο σύμβουλος Noraya δεν επέστρεψε απάντηση.";
      const finalConversationId = json.conversation_id || localConversationId;
      const nextMessages: ChatMessage[] = [
        ...nextUserMessages,
        { role: "assistant", content: answer },
      ];

      setConversationId(finalConversationId);
      setChatMessages(nextMessages);
      upsertAdvisorConversation(
        finalConversationId,
        nextMessages,
        localConversationId,
      );

      setTimeout(() => {
        const node = chatScrollRef.current;
        node?.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      }, 100);
    } catch (err) {
      const known =
        err instanceof Error && /Noraya|διαθέσιμ|Δοκιμάστε/.test(err.message);
      setChatError(
        known
          ? (err as Error).message
          : "Δεν μπόρεσε να απαντήσει ο σύμβουλος Noraya. Δοκιμάστε ξανά.",
      );
    } finally {
      setChatLoading(false);
    }
  }

  if (loading) {
    return (
      <main
        style={{
          fontFamily:
            "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        }}
        className="flex h-screen items-center justify-center bg-[#060a14] text-zinc-300"
      >
        <div className="rounded-[2rem] border border-cyan-300/20 bg-[#0c1220] px-6 py-5 shadow-2xl shadow-cyan-950/20">
          <div className="text-xs uppercase tracking-[0.28em] text-cyan-300">
            NORAYA
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            Φορτώνει cockpit shell με live δεδομένα...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main
        style={{
          fontFamily:
            "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        }}
        className="flex h-screen flex-col items-center justify-center bg-[#060a14] px-6 text-zinc-100"
      >
        <div className="max-w-xl rounded-[2rem] border border-red-300/25 bg-red-300/10 p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-red-100">
            Strategy Room
          </div>
          <h1 className="mt-3 text-2xl font-semibold">
            Δεν φορτώθηκε το cockpit
          </h1>
          <p className="mt-3 text-sm leading-7 text-red-100/90">{error}</p>
          <button
            type="button"
            onClick={loadCockpit}
            className="mt-5 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            Δοκίμασε ξανά
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily:
          "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
      }}
      className="h-screen overflow-hidden bg-[#060a14] text-zinc-100"
    >
      <TopNavigation
        partyName={partyName}
        partyLogo={partyLogo}
        partyInitial={partyInitial}
        source={data?.source || "strategy-brief"}
        situationSource={situationEngine?.source || "situation-engine"}
      />

      <div className="flex h-[calc(100vh-64px)] min-w-[1180px] overflow-hidden border-t border-[#1a2640]">
        <LeftSidebar
          agenda={rankedAgenda}
          situations={liveSituations}
          agendaMap={probeAgendaMap}
          activeSituationId={activeSituationId}
          activeProbeSelection={activeProbeSelection}
          onSelectSituation={(id) => {
            setActiveSituationId(id);
            setActiveTab("strategic");
          }}
          onSelectProbeEvent={(selection) => {
            setActiveProbeSelection(selection);
            setActiveTab("strategic");
          }}
          situationSource={probeAgendaMap.length ? "agenda-probe v4" : situationEngine?.source || "—"}
          situationCount={probeAgendaMap.length ? probeSituationCount : situationEngine?.count || liveSituations.length}
          situationWarning={situationWarning}
          politicalEnvironment={politicalEnvironment}
        />

        <section className="min-w-0 flex-1 overflow-hidden border-x border-[#1a2640] bg-[#070d18]">
          <div className="h-full overflow-y-auto px-5 py-4">
            <PriorityStrip
              agenda={rankedAgenda}
              probeCards={probePriorityCards}
              activeTitle={activeTitle}
              immediateRecommendation={daily.immediate_recommendation}
              avoidToday={daily.avoid_today}
            />

            {analyzingId &&
            activeSituation &&
            String((activeSituation as any).id) === analyzingId ? (
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                Ο Noraya αναλύει αυτό το γεγονός για το κόμμα σου… (λίγα
                δευτερόλεπτα)
              </div>
            ) : null}

            <ActiveSituationWorkspace
              activeTab={activeTab}
              onTabChange={setActiveTab}
              situation={activeSituation}
              title={activeTitle}
              category={activeCategory}
              status={activeStatus}
              urgency={activeUrgency}
              score={activeScore}
              documentationScore={activeDocScore}
              documentationLevel={activeDocLevel}
              brief={brief}
              agenda={rankedAgenda}
              agendaOverview={effectiveAgendaOverview}
              selectedAgendaOverview={selectedAgendaOverview}
              activeOverviewTopic={activeOverviewTopic}
              onSelectOverviewTopic={setActiveOverviewTopic}
              onSelectProbeEvent={(selection) => {
                setActiveProbeSelection(selection);
                setActiveTab("strategic");
              }}
              selectedPartyImplication={selectedPartyImplication}
              probeView={activeProbeView}
              probeEvidenceArticles={activeProbeEvidenceArticles}
              probeItem={activeProbeItem}
              probeEvent={activeProbeEvent}
              aiStrategicBody={activeProbeItem ? (strategicImageCache[String((activeProbeItem.raw.micro_agenda_id || activeProbeItem.raw.micro_agenda || "") + (activeProbeSelection?.eventId ? "__" + activeProbeSelection.eventId : ""))] || null) : null}
              aiPlay={activeProbeItem ? (strategicPlayCache[String((activeProbeItem.raw.micro_agenda_id || activeProbeItem.raw.micro_agenda || "") + (activeProbeSelection?.eventId ? "__" + activeProbeSelection.eventId : ""))] || null) : null}
              aiBusyStrategic={activeProbeItem ? Boolean(aiBusyIds[String((activeProbeItem.raw.micro_agenda_id || activeProbeItem.raw.micro_agenda || "") + (activeProbeSelection?.eventId ? "__" + activeProbeSelection.eventId : "")) + "|img"]) : false}
              aiBusyPlay={activeProbeItem ? Boolean(aiBusyIds[String((activeProbeItem.raw.micro_agenda_id || activeProbeItem.raw.micro_agenda || "") + (activeProbeSelection?.eventId ? "__" + activeProbeSelection.eventId : "")) + "|play"]) : false}
              agendaArchitectResult={agendaArchitectResult}
              agendaArchitectLoading={agendaArchitectLoading}
              agendaArchitectError={agendaArchitectError}
              onRunAgendaArchitect={runAgendaArchitect}
              onContinueAgendaArchitect={continueAgendaArchitectInAdvisor}
            />

            <AdvisorDock
              partyName={partyName}
              activeTitle={activeTitle}
              chatQuestion={chatQuestion}
              setChatQuestion={setChatQuestion}
              chatMessages={chatMessages}
              chatLoading={chatLoading}
              chatError={chatError}
              conversationId={conversationId}
              conversations={advisorConversations}
              onSelectConversation={openAdvisorConversation}
              onRenameConversation={renameAdvisorConversation}
              onDeleteConversation={deleteAdvisorConversation}
              onAsk={askNorayaAdvisor}
              onReset={startNewAdvisorConversation}
              chatEndRef={chatEndRef}
              chatScrollRef={chatScrollRef}
            />
          </div>
        </section>

        <RightInspector
          situation={activeSituation}
          title={activeTitle}
          score={activeScore}
          intensityScore={activeIntensityScore}
          documentationLevel={activeDocLevel}
          brief={brief}
          agenda={rankedAgenda}
          politicalEnvironment={politicalEnvironment}
          probeView={activeProbeView}
          probeItem={activeProbeItem}
          probeEvidenceArticles={activeProbeEvidenceArticles}
        />
      </div>
    </main>
  );
}

function TopNavigation({
  partyName,
  partyLogo,
  partyInitial,
  source,
  situationSource,
}: {
  partyName: string;
  partyLogo: string;
  partyInitial: string;
  source: string;
  situationSource: string;
}) {
  return (
    <header className="flex h-16 items-center justify-between bg-[#060a14] px-4 text-zinc-100">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 shadow-lg shadow-cyan-950/30">
            <span className="absolute h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_#00c8ff]" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-[0.22em] text-cyan-100">
              NORAYA
            </div>
            <div className="text-[10px] font-semibold tracking-[0.01em] text-cyan-100/65">
              Political Intelligence
            </div>
          </div>
        </div>

        <nav className="hidden items-center gap-1 xl:flex">
          {navTabs.map((tab, index) => {
            const cls = `rounded-2xl px-3 py-2 text-xs transition ${
              index === 0
                ? "border border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            }`;
            if (tab === "Ατζέντα") {
              return (
                <a key={tab} href="/agenda" className={cls}>
                  {tab}
                </a>
              );
            }
            if (tab === "Καταστάσεις") {
              return (
                <a key={tab} href="/situations" className={cls}>
                  {tab}
                </a>
              );
            }
            if (tab === "Σενάρια") {
              return (
                <a key={tab} href="/scenarios" className={cls}>
                  {tab}
                </a>
              );
            }
            if (tab === "Πρόσωπα") {
              return (
                <a key={tab} href="/people" className={cls}>
                  {tab}
                </a>
              );
            }
            return (
              <button key={tab} type="button" className={cls}>
                {tab}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-500 2xl:block">
          {source} · {situationSource}
        </div>

        <div className="flex max-w-[280px] items-center gap-3 rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-[10px] font-semibold text-cyan-100">
            {partyLogo ? (
              <img
                src={partyLogo}
                alt={partyName}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              partyInitial
            )}
          </div>
          <div className="truncate text-xs text-zinc-200">{partyName}</div>
          <IconChevron className="h-4 w-4 text-zinc-600" />
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-xs text-zinc-300">
          <IconCalendar className="h-4 w-4 text-zinc-500" />
          {new Date().toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          <IconChevron className="h-4 w-4 text-zinc-600" />
        </div>

        <button
          type="button"
          className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-2 text-zinc-400 transition hover:text-cyan-100"
        >
          <IconSun className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-2 text-zinc-400 transition hover:text-cyan-100"
        >
          <IconSettings className="h-4 w-4" />
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-xs font-semibold text-cyan-100">
          N
        </div>
      </div>
    </header>
  );
}

function LeftSidebar({
  agenda,
  situations,
  agendaMap,
  activeSituationId,
  activeProbeSelection,
  onSelectSituation,
  onSelectProbeEvent,
  situationSource,
  situationCount,
  situationWarning,
  politicalEnvironment,
}: {
  agenda: RankedAgenda[];
  situations: ΕνεργόSituationRow[];
  agendaMap?: ProbeAgendaMapItem[];
  activeSituationId: string | null;
  activeProbeSelection?: AgendaProbeSelection | null;
  onSelectSituation: (id: string) => void;
  onSelectProbeEvent?: (selection: AgendaProbeSelection) => void;
  situationSource: string;
  situationCount: number;
  situationWarning: string;
  politicalEnvironment: PoliticalEnvironment | null;
}) {
  const polls = recentPolls(politicalEnvironment);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [expandedMicro, setExpandedMicro] = useState<string | null>(null);

  // 3 επίπεδα: Κεντρικό θέμα → Μικροατζέντα → Γεγονός.
  // Ομαδοποιούμε ΜΟΝΟ εδώ (στο μενού), χωρίς να αγγίξουμε το buildAgendaMap.
  type AgendaEvent = {
    id: string;
    title: string;
    score: number;
    status: string;
    probeClusterId?: string;
    probeEventId?: string | null;
  };
  type MicroAgenda = {
    clusterId: string;
    title: string;
    score: number;
    statusLabel?: string;
    events: AgendaEvent[];
  };
  type ThemeGroup = {
    theme: string;
    score: number;
    microCount: number;
    eventCount: number;
    rank: number;
    micros: MicroAgenda[];
  };
  const themeGroups = useMemo<ThemeGroup[]>(() => {
    if (agendaMap && agendaMap.length) {
      const order: string[] = [];
      const byTheme = new Map<string, MicroAgenda[]>();

      agendaMap.forEach((item) => {
        const parents = (item as any).parentTopics;
        const theme =
          (Array.isArray(parents) && parents[0]) || item.title || "Άλλα";
        const micro: MicroAgenda = {
          clusterId: item.id,
          title: item.title,
          score: item.score,
          statusLabel: item.statusLabel,
          events: item.events.map((event, eventIndex) => ({
            id: String(event.id || `${item.id}-${eventIndex}`),
            title: event.title || item.title,
            score: numberValue(event.event_score, item.score),
            status: String(event.status || item.statusLabel || "live"),
            probeClusterId: item.id,
            probeEventId: event.id ? String(event.id) : null,
          })),
        };
        const existing = byTheme.get(theme);
        if (existing) {
          existing.push(micro);
        } else {
          byTheme.set(theme, [micro]);
          order.push(theme);
        }
      });

      return order
        .map((theme) => {
          const micros = (byTheme.get(theme) || []).sort(
            (a, b) => b.score - a.score,
          );
          const score = micros.reduce((m, x) => Math.max(m, x.score), 0);
          const eventCount = micros.reduce((s, x) => s + x.events.length, 0);
          return {
            theme,
            score,
            micros,
            microCount: micros.length,
            eventCount,
            rank: 0,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((g, i) => ({ ...g, rank: i + 1 }));
    }

    if (situations && situations.length) {
      const order: string[] = [];
      const groups = new Map<
        string,
        { topic: string; score: number; events: AgendaEvent[] }
      >();
      situations.forEach((s, index) => {
        const topic =
          String((s as any).topic || (s as any).category || "Γενικά").trim() ||
          "Γενικά";
        const sc = situationScore(s, 0);
        const ev: AgendaEvent = {
          id: situationId(s, index),
          title: situationTitle(s),
          score: sc,
          status: String((s as any).status || "live"),
        };
        const ex = groups.get(topic);
        if (!ex) {
          groups.set(topic, { topic, score: sc, events: [ev] });
          order.push(topic);
        } else {
          ex.events.push(ev);
          if (sc > ex.score) ex.score = sc;
        }
      });

      return order
        .map((topic) => {
          const g = groups.get(topic) || { topic, score: 0, events: [] };
          const micro: MicroAgenda = {
            clusterId: topic,
            title: topic,
            score: g.score,
            events: g.events.sort((a, b) => b.score - a.score),
          };
          return {
            theme: topic,
            score: g.score,
            micros: [micro],
            microCount: 1,
            eventCount: g.events.length,
            rank: 0,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((g, i) => ({ ...g, rank: i + 1 }));
    }

    // Fallback: classified θέματα όταν δεν υπάρχουν ακόμη live γεγονότα.
    return (agenda || []).slice(0, 8).map((a, i): ThemeGroup => {
      const sc = numberValue(a.score, 0);
      const topic = String(a.topic || "Γενικά");
      return {
        theme: topic,
        score: sc,
        micros: [
          { clusterId: topic, title: topic, score: sc, events: [] as AgendaEvent[] },
        ],
        microCount: 1,
        eventCount: 0,
        rank: i + 1,
      };
    });
  }, [agendaMap, situations, agenda]);

  // Προεπιλογή: άνοιξε το πρώτο κεντρικό θέμα και την πρώτη του μικροατζέντα,
  // ώστε το μενού να μη φαίνεται ποτέ άδειο όταν μπαίνεις.
  useEffect(() => {
    if (themeGroups.length) {
      setExpandedTheme((prev) => prev ?? themeGroups[0].theme);
      setExpandedMicro(
        (prev) => prev ?? themeGroups[0].micros[0]?.clusterId ?? null,
      );
    }
  }, [themeGroups]);

  return (
    <aside className="flex w-[256px] shrink-0 flex-col overflow-hidden bg-[#060a14]">
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarPanel
          title="Χάρτης ατζέντας"
          info
          action="Δες όλη την ατζέντα"
          footer={
            themeGroups.length
              ? `${situationCount || situations.length} γεγονότα · ${situationSource}`
              : "αναμονή ατζέντας"
          }
        >
          {situationWarning ? (
            <TinyWarning>{situationWarning}</TinyWarning>
          ) : null}
          {themeGroups.length ? (
            <div className="grid gap-2">
              {themeGroups.map((group) => {
                const tone =
                  group.score >= 70
                    ? "red"
                    : group.score >= 50
                      ? "amber"
                      : "emerald";
                const priorityLabel =
                  group.score >= 70
                    ? "Υψηλή"
                    : group.score >= 50
                      ? "Μεσαία"
                      : "Χαμηλή";
                const themeOpen = expandedTheme === group.theme;
                const themeActive = group.micros.some((m) =>
                  activeProbeSelection?.clusterId
                    ? m.clusterId === activeProbeSelection.clusterId
                    : m.events.some((e) => e.id === activeSituationId),
                );
                return (
                  <div
                    key={`theme-${group.theme}-${group.rank}`}
                    className={`overflow-hidden rounded-2xl border transition ${
                      themeActive
                        ? "border-cyan-300/40 bg-cyan-300/[0.06]"
                        : "border-[#1a2640] bg-[#0c1220]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const key = group.theme;
                        setExpandedTheme((prev) => (prev === key ? null : key));
                      }}
                      className="group flex w-full items-center gap-2 p-3 text-left transition hover:bg-cyan-300/[0.04]"
                    >
                      <NumberBadge value={group.rank} tone={tone} />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-semibold leading-5 text-zinc-100 group-hover:text-cyan-100">
                          {group.theme}
                        </div>
                        <div
                          className={`mt-0.5 text-[10px] ${
                            tone === "red"
                              ? "text-red-300/80"
                              : tone === "amber"
                                ? "text-amber-300/80"
                                : "text-emerald-300/80"
                          }`}
                        >
                          {priorityLabel} · {group.microCount}{" "}
                          {group.microCount === 1 ? "μικροατζέντα" : "μικροατζέντες"} ·{" "}
                          {group.eventCount}{" "}
                          {group.eventCount === 1 ? "γεγονός" : "γεγονότα"}
                        </div>
                      </div>
                      <Sparkline
                        seed={`theme-${group.theme}-${group.rank}`}
                        score={group.score}
                        series={deterministicTrendSeries(group.score, undefined)}
                        color={sparkColor(group.score)}
                        className="h-6 w-9 shrink-0"
                      />
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {themeOpen ? "▾" : "▸"}
                      </span>
                    </button>

                    {themeOpen ? (
                      <div className="grid gap-1 border-t border-[#1a2640] px-2 pb-2 pt-2">
                        {group.micros.map((micro) => {
                          const microOpen = expandedMicro === micro.clusterId;
                          const microActive =
                            activeProbeSelection?.clusterId === micro.clusterId;
                          return (
                            <div key={micro.clusterId}>
                              <button
                                type="button"
                                onClick={() => {
                                  const key = micro.clusterId;
                                  setExpandedMicro((prev) =>
                                    prev === key ? null : key,
                                  );
                                  if (onSelectProbeEvent) {
                                    onSelectProbeEvent({
                                      clusterId: micro.clusterId,
                                      eventId: micro.events[0]?.probeEventId ?? null,
                                    });
                                  } else if (micro.events[0]?.id) {
                                    onSelectSituation(micro.events[0].id);
                                  }
                                }}
                                className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition ${
                                  microActive
                                    ? "bg-cyan-300/10 text-cyan-100"
                                    : "text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100"
                                }`}
                              >
                                <span className="min-w-0 flex-1 line-clamp-2 text-[11px] font-medium leading-4">
                                  {micro.title}
                                </span>
                                {micro.events.length ? (
                                  <span className="shrink-0 text-[10px] text-zinc-500">
                                    {microOpen ? "▾" : "▸"}
                                  </span>
                                ) : null}
                              </button>

                              {microOpen && micro.events.length ? (
                                <div className="ml-1 grid gap-1 border-l border-[#1a2640] py-1 pl-2">
                                  {micro.events.map((ev) => {
                                    const selected = ev.probeClusterId
                                      ? activeProbeSelection?.clusterId ===
                                          ev.probeClusterId &&
                                        activeProbeSelection?.eventId ===
                                          ev.probeEventId
                                      : ev.id === activeSituationId;
                                    return (
                                      <button
                                        key={ev.id}
                                        type="button"
                                        onClick={() => {
                                          if (
                                            ev.probeClusterId &&
                                            onSelectProbeEvent
                                          ) {
                                            onSelectProbeEvent({
                                              clusterId: ev.probeClusterId,
                                              eventId: ev.probeEventId ?? null,
                                            });
                                          } else {
                                            onSelectSituation(ev.id);
                                          }
                                        }}
                                        className={`rounded-lg px-2 py-1.5 text-left text-[11px] leading-4 transition ${
                                          selected
                                            ? "bg-cyan-300/15 text-cyan-100"
                                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                                        }`}
                                      >
                                        <span className="line-clamp-2">
                                          {ev.title}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState small>
              Δεν υπάρχουν ακόμη ενεργές καταστάσεις.
            </EmptyState>
          )}
        </SidebarPanel>

        <SidebarPanel title="Εσωτερικά δεδομένα">
          <div className="grid gap-2 text-[11px] text-zinc-400">
            <DataRow
              label="Δημοσκοπήσεις"
              value={String(polls.length)}
              badge={polls.length ? "Νέο" : undefined}
            />
            <DataRow label="Ομάδες συζήτησης" value="—" />
            <DataRow
              label="Ενημερώσεις"
              value={politicalEnvironment?.snapshot_date ? "1" : "—"}
            />
            <DataRow label="Κόκκινες γραμμές" value="προφίλ" />
          </div>
        </SidebarPanel>

        <SidebarPanel title="Γρήγορη καταγραφή">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Σημείωση / Ιδέα", Glyph: IconNote },
              { label: "Σύνδεσμος / Άρθρο", Glyph: IconLink },
              { label: "Στιγμιότυπο", Glyph: IconCamera },
              { label: "Ηχητική σημείωση", Glyph: IconMic },
            ].map(({ label, Glyph }) => (
              <button
                key={label}
                type="button"
                className="flex items-center gap-2 rounded-2xl border border-[#1a2640] bg-[#0c1220] px-2.5 py-3 text-[10px] leading-4 text-zinc-400 transition hover:border-cyan-300/25 hover:text-cyan-100"
              >
                <Glyph className="h-4 w-4 shrink-0" />
                <span className="text-left">{label}</span>
              </button>
            ))}
          </div>
        </SidebarPanel>

        <SidebarPanel title="Εσωτερική μνήμη" action="Όλες οι σημειώσεις">
          <div className="grid gap-2">
            <MemoryLine date="Σήμερα" title="Έλεγχος Strategy Room" />
            <MemoryLine date="Ενεργό" title="Situation engine ενεργό" />
          </div>
        </SidebarPanel>
      </div>

      <div className="grid grid-cols-4 border-t border-[#1a2640] bg-[#060a14] text-[10px] text-zinc-600">
        {["Εμπειρία", "Αρχεία", "Σημειώσεις", "Θεωρήσεις"].map((item) => (
          <button
            key={item}
            type="button"
            className="px-1 py-3 hover:bg-white/[0.03] hover:text-zinc-300"
          >
            {item}
          </button>
        ))}
      </div>
    </aside>
  );
}

function PriorityStrip({
  agenda,
  probeCards,
  activeTitle,
  immediateRecommendation,
  avoidToday,
}: {
  agenda: RankedAgenda[];
  probeCards?: ProbePriorityCard[];
  activeTitle: string;
  immediateRecommendation?: string;
  avoidToday?: string;
}) {
  const mappedCards = probeCards?.length
    ? probeCards.slice(0, 3).map((card) => ({
        label: card.label,
        theme:
          text(card.raw.parent_topic, "") ||
          (Array.isArray(card.raw.parent_topics)
            ? text(card.raw.parent_topics[0], "")
            : ""),
        meaning: text(card.labelMeaning, ""),
        title: card.title,
        badge: card.priorityLabel,
        tone:
          card.tone === "red"
            ? ("red" as const)
            : card.tone === "yellow"
              ? ("amber" as const)
              : ("emerald" as const),
        score: card.score,
        textValue: card.actionHint,
      }))
    : null;

  const cards = mappedCards || [
    {
      label: "Προτεραιότητα 1",
      title: activeTitle,
      badge: "Υψηλή προτεραιότητα",
      tone: "red" as const,
      score: numberValue(agenda[0]?.score, 78),
      textValue: text(
        immediateRecommendation,
        agenda[0]?.recommended_action ||
          "Παρακολούθηση και ασφαλής γραμμή πριν από κλιμάκωση.",
      ),
    },
    {
      label: "Σήμα ατζέντας",
      title: agenda[1]?.topic || "Δεύτερο σήμα υπό ταξινόμηση",
      badge: "Μεσαία",
      tone: "amber" as const,
      score: numberValue(agenda[1]?.score, 58),
      textValue: text(
        agenda[1]?.evidence_summary,
        "Κρατάμε το θέμα σε παρακολούθηση μέχρι να ισχυροποιηθεί η τεκμηρίωση.",
      ),
    },
    {
      label: "Να αποφύγουμε",
      title: "Πρόωρη κλιμάκωση",
      badge: "Χαμηλή προς Μεσαία",
      tone: "emerald" as const,
      score: numberValue(agenda[2]?.score, 42),
      textValue: text(
        avoidToday,
        agenda[0]?.avoid_action ||
          "Όχι υπερβολική δημόσια βεβαιότητα χωρίς επαρκή στοιχεία.",
      ),
    },
  ];

  const accentBar = {
    red: "bg-gradient-to-r from-red-400/0 via-red-400/60 to-red-400/0",
    amber: "bg-gradient-to-r from-amber-400/0 via-amber-400/60 to-amber-400/0",
    emerald: "bg-gradient-to-r from-emerald-400/0 via-emerald-400/60 to-emerald-400/0",
  };
  const dotTone = {
    red: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]",
    amber: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]",
    emerald: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
  };
  const labelTone = {
    red: "text-red-200",
    amber: "text-amber-200",
    emerald: "text-emerald-200",
  };

  return (
    <section className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-semibold tracking-[0.01em] text-cyan-200/85">
              Προτεραιότητες σήμερα
            </div>
            <IconInfo className="h-3.5 w-3.5 text-zinc-600" />
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            Τρία πράγματα που πρέπει να βλέπει το επιτελείο με την πρώτη ματιά.
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100"
        >
          <IconPlus className="h-4 w-4" />
          Καταγραφή νέου συμβάντος
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {cards.map((card, index) => {
          const theme = (card as any).theme as string | undefined;
          const meaning = (card as any).meaning as string | undefined;
          return (
            <article
              key={`${card.label}-${index}`}
              className="group relative overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-gradient-to-b from-[#0e1626] via-[#0b1322] to-[#0a101e] p-[1.15rem] shadow-[0_18px_60px_rgba(0,0,0,0.32)] transition hover:border-cyan-300/25"
            >
              <span
                className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${accentBar[card.tone]}`}
              />
              <div className="flex items-start gap-3">
                <NumberBadge value={index + 1} tone={card.tone} size="lg" />
                <div className="min-w-0 flex-1">
                  {theme ? (
                    <div className="mb-1 truncate text-[9px] font-semibold tracking-[0.22em] text-cyan-300/70">
                      {theme}
                    </div>
                  ) : null}
                  <h2
                    title={card.title}
                    className="text-[15px] font-semibold leading-[1.3] tracking-[-0.02em] text-zinc-50"
                  >
                    {card.title}
                  </h2>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone[card.tone]}`}
                  />
                  <span
                    className={`text-[12px] font-semibold tracking-[0.01em] ${labelTone[card.tone]}`}
                  >
                    {card.label}
                  </span>
                </div>
                {meaning ? (
                  <p className="mt-1.5 text-[11px] leading-5 text-zinc-400/90">
                    {meaning}
                  </p>
                ) : null}
              </div>

              <div className="mt-3.5 flex items-end justify-between gap-3 border-t border-white/[0.05] pt-3">
                <p className="flex-1 text-[11px] leading-5 text-zinc-500">
                  {card.textValue}
                </p>
                <Sparkline
                  seed={`priority-${card.label}-${index}`}
                  score={card.score}
                  series={deterministicTrendSeries(
                    card.score,
                    (card as any).change_7d,
                  )}
                  color={sparkColor(card.score)}
                  className="h-8 w-20 shrink-0"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type DecisionCardOption = {
  label: string;
  title: string;
  move?: string;
  gain: string;
  risk: string;
  recommendation: string;
  success?: number;
};

function ActiveSituationWorkspace({
  activeTab,
  onTabChange,
  situation,
  title,
  category,
  status,
  urgency,
  score,
  documentationScore,
  documentationLevel,
  brief,
  agenda,
  agendaOverview,
  selectedAgendaOverview,
  activeOverviewTopic,
  onSelectOverviewTopic,
  onSelectProbeEvent,
  selectedPartyImplication,
  probeView,
  probeEvidenceArticles,
  probeItem,
  probeEvent,
  aiStrategicBody,
  aiPlay,
  aiBusyStrategic,
  aiBusyPlay,
  agendaArchitectResult,
  agendaArchitectLoading,
  agendaArchitectError,
  onRunAgendaArchitect,
  onContinueAgendaArchitect,
}: {
  activeTab: SituationTab;
  onTabChange: (tab: SituationTab) => void;
  situation: ΕνεργόSituationRow | null;
  title: string;
  category: string;
  status: string;
  urgency: string;
  score: number;
  documentationScore: number;
  documentationLevel?: string | null;
  brief: StrategicBrief;
  agenda: RankedAgenda[];
  agendaOverview: AgendaOverviewRow[];
  selectedAgendaOverview: AgendaOverviewRow | null;
  activeOverviewTopic: string | null;
  onSelectOverviewTopic: (topic: string) => void;
  onSelectProbeEvent?: (selection: AgendaProbeSelection) => void;
  selectedPartyImplication: string;
  probeView?: EventIntelligenceView | null;
  probeEvidenceArticles?: EvidenceArticleItem[];
  probeItem?: ProbeAgendaMapItem | null;
  probeEvent?: ProbeAgendaEventItem | null;
  aiStrategicBody?: string | null;
  aiPlay?: any | null;
  aiBusyStrategic?: boolean;
  aiBusyPlay?: boolean;
  agendaArchitectResult?: AgendaArchitectResult | null;
  agendaArchitectLoading?: boolean;
  agendaArchitectError?: string;
  onRunAgendaArchitect?: () => void;
  onContinueAgendaArchitect?: () => void;
}) {
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const diagnosis = brief.strategic_diagnosis || {};
  const actionPlan = brief.action_plan || {};
  const monitoring = brief.monitoring_plan || {};
  const messages = brief.message_package || {};
  const evidence = brief.evidence || {};
  const situationEvidenceArticles = evidenceArticlesFromSituation(situation);
  const activeEvidenceArticles = probeEvidenceArticles?.length
    ? probeEvidenceArticles
    : situationEvidenceArticles;
  const probeSection = (tab: EventIntelligenceView["sections"][number]["tab"]) =>
    probeView?.sections.find((section) => section.tab === tab);
  const strategicSection = probeSection("strategic_image");
  const overallSection = probeSection("overall_image");
  const whySection = probeSection("why_exists");
  const sourcesSection = probeSection("sources_factors");
  const pulseSection = probeSection("public_pulse");
  const winSectionBase = probeSection("how_to_win");
  const winSection: any = aiPlay
    ? {
        ...(winSectionBase || {}),
        body: aiPlay.game_today || winSectionBase?.body || "",
        bullets: [
          aiPlay.trap || winSectionBase?.bullets?.[0] || "",
          aiPlay.favorable || winSectionBase?.bullets?.[1] || "",
          aiPlay.realign_move || winSectionBase?.bullets?.[2] || "",
          aiPlay.sequence || winSectionBase?.bullets?.[3] || "",
        ],
      }
    : winSectionBase;
  const actionSection = probeSection("action_options");
  const materialSection = probeSection("material");
  const effectiveTitle = probeView?.eventTitle || title;
  const effectiveCategory = probeView?.microAgenda || category;
  const effectiveScore = probeView?.score ?? score;
  const effectiveDocumentationLabel =
    probeView?.evidenceLabel || docLabelFromScore(documentationScore);
  const effectiveStatusLabel = probeView?.statusLabel || statusLabel(status);
  const effectiveUrgencyLabel = probeView?.scoreLabel || riskLabel(urgency);
  const effectiveStatusClass = probeView
    ? probeView.sensitiveMode
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : effectiveScore >= 68
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : statusToneClass(status);
  const effectiveUrgencyClass = probeView
    ? effectiveScore >= 68
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : signalToneClass(urgency);
  const effectiveDecisionOptions =
    aiPlay?.options?.length
      ? aiPlay.options.map((option: any) => ({
          label: option.key,
          title: option.title,
          move: option.body,
          gain: option.gain,
          risk: option.risk,
          recommendation: option.avoid
            ? "avoid"
            : option.recommended
              ? "prefer"
              : "acceptable",
          success: option.success,
        }))
      : actionSection?.actions?.length
      ? actionSection.actions.map((option) => ({
          label: option.key,
          title: option.title,
          move: option.body,
          gain: option.gain,
          risk: option.risk,
          recommendation: option.avoid
            ? "avoid"
            : option.recommended
              ? "prefer"
              : "acceptable",
          success: option.successProbability,
        }))
      : decisionOptions(brief);

  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-gradient-to-b from-[#0d1424] via-[#0a1020] to-[#070c18] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusChip className={effectiveStatusClass}>
                {effectiveStatusLabel}
              </StatusChip>
              <StatusChip className={effectiveUrgencyClass}>
                {effectiveUrgencyLabel}
              </StatusChip>
              <StatusChip className={docToneClass(effectiveDocumentationLabel)}>
                {effectiveDocumentationLabel}
              </StatusChip>
            </div>
            <h1 className="max-w-[760px] text-[1.35rem] font-semibold leading-[1.22] tracking-[-0.03em] text-zinc-50 xl:text-[1.65rem]">
              {effectiveTitle}
            </h1>
            <p className="mt-2 text-xs font-medium tracking-wide text-zinc-500">
              {effectiveCategory}
            </p>
          </div>

                  <div className="grid shrink-0 grid-cols-2 gap-3">
            <MiniMetric
              label="Προτεραιότητα ημέρας"
              value={effectiveScore ? Math.round(effectiveScore).toString() : "—"}
            />
            <MiniMetric
              label="Βάση εκτίμησης"
              value={effectiveDocumentationLabel}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {situationTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-2xl border px-3 py-2 text-[11px] font-medium transition ${
                activeTab === tab.id
                  ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                  : "border-[#1a2640] bg-black/15 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.id === "win" && probeView ? probeView.primaryTabLabel : tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 xl:p-6">
        {activeTab === "overview" ? (
          <div className="grid gap-4">
            <AgendaOverviewPanel
              overview={agendaOverview}
              selectedRow={selectedAgendaOverview}
              activeTopic={activeOverviewTopic}
              onSelectTopic={onSelectOverviewTopic}
              onSelectProbeEvent={(selection) => {
                onSelectProbeEvent?.(selection);
                onTabChange("strategic");
              }}
            />

            <AgendaArchitectPanel
              result={agendaArchitectResult || null}
              loading={Boolean(agendaArchitectLoading)}
              error={agendaArchitectError || ""}
              onRun={onRunAgendaArchitect}
              onContinue={onContinueAgendaArchitect}
            />
          </div>
        ) : null}

        {activeTab === "strategic" ? (
          <div className="grid gap-4">
            <CockpitSection
              title="1. Στρατηγική ανάγνωση"
              subtitle="Ατζέντα → Πλαίσιο → Ρίσκο"
            >
              <div>
                {aiBusyStrategic && !aiStrategicBody ? (
                  <AnalysisLoading lines={5} label="Ο Noraya γράφει τη στρατηγική ανάγνωση…" />
                ) : (() => {
                  const full =
                    aiStrategicBody ||
                    strategicSection?.body ||
                    readStrategicText(situation, brief);
                  const idx = full.indexOf("\n\n");
                  const lead = idx > -1 ? full.slice(0, idx).trim() : "";
                  const rest = idx > -1 ? full.slice(idx + 2).trim() : full;
                  return (
                    <div className="min-w-0">
                      {lead ? (
                        <p className="mb-3 border-l-2 border-cyan-300/50 pl-3 text-[15px] font-semibold leading-7 tracking-[-0.01em] text-zinc-50">
                          {lead}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-line text-justify text-[13px] leading-7 text-zinc-300/95">
                        {rest}
                      </p>
                    </div>
                  );
                })()}
                
              </div>
            </CockpitSection>

            <CockpitSection
              title={`2. ${probeView?.primaryTabLabel || "Πώς κερδίζεται το θέμα"}`}
              subtitle={winSection?.kicker || "Στρατηγική δυναμική"}
            >
              {aiBusyPlay && !aiPlay ? (
                <AnalysisLoading lines={4} label="Ο Noraya χτίζει το «Πώς κερδίζεται»…" />
              ) : (
              <>
              {aiPlay?.headline ? (
                <p className="mb-3 border-l-2 border-cyan-300/50 pl-3 text-[14px] font-semibold leading-7 tracking-[-0.01em] text-zinc-50">
                  {aiPlay.headline}
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                <WinCard
                  title="Το παιχνίδι σήμερα"
                  tone="red"
                  textValue={
                    winSection?.body ||
                    text(
                      diagnosis.agenda_reading,
                      text(
                        issue.dominant_frame,
                        "Το παιχνίδι δεν έχει ακόμη πλήρως οριστεί.",
                      ),
                    )
                  }
                />
                <WinCard
                  title="Η παγίδα"
                  tone="amber"
                  textValue={
                    winSection?.bullets?.[0] ||
                    text(
                      diagnosis.strategic_risk,
                      text(
                        issue.priming_risk,
                        "Το ρίσκο είναι πρόωρη ή άστοχη αντίδραση.",
                      ),
                    )
                  }
                />
                <WinCard
                  title="Ευνοϊκή διάσταση"
                  tone="emerald"
                  textValue={
                    winSection?.bullets?.[1] ||
                    text(
                      diagnosis.strategic_opportunity,
                      text(
                        issue.opportunity,
                        "Να εισαχθεί διάσταση θεσμικής σοβαρότητας και λύσης.",
                      ),
                    )
                  }
                />
                <WinCard
                  title="Κίνηση αναδιάταξης"
                  tone="purple"
                  textValue={
                    winSection?.bullets?.[2] ||
                    text(
                      diagnosis.recommended_posture,
                      "Μετατόπιση από άμυνα σε τεκμηριωμένη πρόταση.",
                    )
                  }
                />
                <WinCard
                  title="Ακολουθία"
                  tone="zinc"
                  textValue={
                    aiPlay?.sequence ||
                    list(actionPlan.next_24h)[0] ||
                    "Πρώτα παρακολούθηση, μετά ασφαλής δημόσια γραμμή, μετά κλιμάκωση μόνο με νέα στοιχεία."
                  }
                />
              </div>
              </>
              )}
            </CockpitSection>

            <div className="grid gap-4 2xl:grid-cols-2">
              <CockpitSection
                title="3. Τι κάνουμε τώρα — επιλογές"
                subtitle="Τρεις διαδρομές απόφασης"
              >
                {aiBusyPlay && !aiPlay ? (
                  <AnalysisLoading lines={4} label="Ο Noraya ετοιμάζει τις επιλογές δράσης…" />
                ) : (
                <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-1">
                  {effectiveDecisionOptions.map((opt: DecisionCardOption) => (
                    <DecisionCard
                      key={opt.label}
                      label={opt.label}
                      title={opt.title}
                      move={opt.move}
                      gain={opt.gain}
                      risk={opt.risk}
                      recommendation={opt.recommendation}
                      success={opt.success}
                    />
                  ))}
                </div>
                )}
              </CockpitSection>

              <CockpitSection
                title="4. Τι θα άλλαζε την εκτίμηση"
                subtitle="Σήματα επανεκτίμησης"
              >
                <BulletList
                  compact
                  items={probeView?.escalation?.triggerLines || list(monitoring.escalation_triggers)}
                  fallback={[
                    "Νέο δημοσκοπικό εύρημα ή verified internal poll.",
                    "Θεσμική αντίδραση που αλλάζει το επίπεδο κλιμάκωσης.",
                    "Μετατόπιση framing σε προσωπική ή ηθική στόχευση.",
                  ]}
                />
                <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs leading-6 text-amber-100">
                  Το κοινό αλλάζει γρήγορα. Η σύσταση πρέπει να αναθεωρείται
                  όταν εμφανιστούν νέα σήματα.
                </div>
              </CockpitSection>
            </div>

            <CockpitSection
              title="5. Ένταση & δυναμική"
              subtitle="6 gauges — αρχικά από διαθέσιμα live signals"
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {probeView?.gauges?.length ? (
                  probeView.gauges.map((gauge) => (
                    <Gauge
                      key={gauge.key}
                      score={gauge.value}
                      label={gauge.label}
                      small
                    />
                  ))
                ) : (
                  <>
                    <Gauge
                      score={clamp(
                        numberValue(
                          situation?.news_coverage_level,
                          numberValue(
                            situation?.article_count,
                            agenda[0]?.article_count || 0,
                          ) * 8,
                        ),
                      )}
                      label="Ένταση κάλυψης"
                      small
                    />
                    <Gauge
                      score={clamp(
                        numberValue(
                          situation?.google_trends_score,
                          numberValue(
                            situation?.source_count,
                            agenda[0]?.source_count || 0,
                          ) * 15,
                        ),
                      )}
                      label="Δημόσια αναζήτηση"
                      small
                    />
                    <Gauge
                      score={clamp(
                        numberValue(
                          situation?.confidence_score,
                          documentationScore,
                        ),
                      )}
                      label="Πολιτική ένταση"
                      small
                    />
                    <Gauge
                      score={clamp(
                        numberValue(
                          issue.emotion_intensity,
                          publicPulseScore(situation),
                        ),
                      )}
                      label="Συναισθηματική ένταση"
                      small
                    />
                    <Gauge
                      score={clamp(
                        Math.round(
                          numberValue(
                            issue.emotion_intensity,
                            publicPulseScore(situation),
                          ) *
                            0.6 +
                            (effectiveScore >= 70 ? 20 : effectiveScore >= 50 ? 10 : 0),
                        ),
                      )}
                      label="Κίνδυνος υπερβολής"
                      small
                    />
                    <Gauge
                      score={clamp(Math.max(effectiveScore, documentationScore))}
                      label="Δυναμική ατζέντας"
                      small
                    />
                  </>
                )}
              </div>
            </CockpitSection>

            <CockpitSection
              title="6. Κλίμακα κλιμάκωσης"
              subtitle="Αποφυγή πρόωρης κλιμάκωσης"
            >
              <EscalationLadder
                current={
                  probeView?.escalation?.currentLevel ??
                  clamp(
                    numberValue(
                      situation?.escalation_level,
                      effectiveScore >= 70 ? 3 : effectiveScore >= 50 ? 2 : 1,
                    ),
                    1,
                    6,
                  )
                }
                recommended={
                  probeView?.escalation?.currentLevel ??
                  clamp(
                    numberValue(
                      situation?.escalation_recommended,
                      effectiveScore >= 75 ? 3 : 2,
                    ),
                    1,
                    6,
                  )
                }
              />
            </CockpitSection>
          </div>
        ) : null}

        {activeTab === "why" ? (
          <div className="grid gap-4">
            <CockpitSection
              title="Γιατί μπήκε στον Χάρτη"
              subtitle="Δημόσιο ενδιαφέρον · Κάλυψη · Πηγές · Φρεσκάδα"
            >
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {whyProbeSignalPills(probeItem, probeEvent, situation).map((pill) => (
                    <StatusChip
                      key={pill.label}
                      className="border-cyan-300/18 bg-cyan-300/[0.06] text-cyan-100"
                    >
                      {pill.label}: {pill.value}
                      {pill.score ? ` · ${Math.round(pill.score)}` : ""}
                    </StatusChip>
                  ))}
                </div>

                <div className="rounded-3xl border border-[#1a2640] bg-black/10 p-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Ανάγνωση micro-agenda
                  </div>
                  <p className="mt-3 text-[13px] leading-7 text-zinc-300/95">
                    {probeItem
                      ? whyProbeAgendaExistsText(probeItem, probeEvent, situation)
                      : whySection?.body || readWhyText(situation, brief)}
                  </p>
                </div>
              </div>
            </CockpitSection>

            <CockpitSection
              title="Τι θα ξεκαθάριζε την εικόνα"
              subtitle="Σήματα που αλλάζουν την εκτίμηση"
            >
              <p className="text-sm leading-7 text-zinc-300">
                {probeItem
                  ? whyProbeAgendaUnknownText(probeItem, probeEvent, situation)
                  : probeView?.escalation?.triggerLines?.[0] ||
                    text(
                      evidence.uncertainty,
                      "Χρειάζεται νέο σήμα, δεύτερη πηγή ή πολιτική αντίδραση για να αναθεωρηθεί η εκτίμηση.",
                    )}
              </p>
            </CockpitSection>
          </div>
        ) : null}

        {activeTab === "drivers" ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <CockpitSection
              title="Παράγοντες"
              subtitle="Agenda signals behind the selected situation"
            >
              <div className="grid gap-3">
                {sourcesSection?.bullets?.length
                  ? sourcesSection.bullets.slice(0, 5).map((item, index) => (
                      <DriverBar
                        key={`${item}-${index}`}
                        label={item}
                        score={probeView?.gauges?.[index]?.value ?? effectiveScore}
                        trend={probeView?.statusLabel}
                      />
                    ))
                  : (agenda.length ? agenda.slice(0, 5) : []).map((item) => (
                      <DriverBar
                        key={`${item.topic}-${item.rank}`}
                        label={item.topic || "Θέμα"}
                        score={item.score}
                        trend={item.signalLabel}
                      />
                    ))}
                {!sourcesSection?.bullets?.length && !agenda.length ? (
                  <EmptyState>
                    Δεν υπάρχουν διαθέσιμοι παράγοντες ατζέντας.
                  </EmptyState>
                ) : null}
              </div>
            </CockpitSection>
            <CockpitSection
              title="Πηγές γεγονότος"
              subtitle="Άρθρα που στηρίζουν το επιλεγμένο γεγονός"
            >
              <EventEvidenceList articles={activeEvidenceArticles} />
            </CockpitSection>
          </div>
        ) : null}

        {activeTab === "pulse" ? (
          pulseSection ? (
            <CockpitSection title={pulseSection.title} subtitle={pulseSection.kicker}>
              <p className="text-[13px] leading-7 text-zinc-300/95">
                {pulseSection.body}
              </p>
              {pulseSection.gauges?.length ? (
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {pulseSection.gauges.map((gauge) => (
                    <Gauge
                      key={gauge.key}
                      score={gauge.value}
                      label={gauge.label}
                      small
                    />
                  ))}
                </div>
              ) : null}
            </CockpitSection>
          ) : (
            <PublicPulsePanel situation={situation} brief={brief} />
          )
        ) : null}

        {activeTab === "win" ? (
          <CockpitSection
            title={probeView?.primaryTabLabel || "Πώς κερδίζεται το θέμα"}
            subtitle={winSection?.kicker || "Στρατηγική δυναμική και καθαρό framing"}
          >
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <WinCard
                title="Το παιχνίδι σήμερα"
                tone="red"
                textValue={
                  winSection?.body ||
                  text(
                    diagnosis.agenda_reading,
                    text(
                      issue.dominant_frame,
                      "Το παιχνίδι δεν έχει ακόμη πλήρως οριστεί.",
                    ),
                  )
                }
              />
              <WinCard
                title="Η παγίδα"
                tone="amber"
                textValue={
                  winSection?.bullets?.[0] ||
                  text(
                    diagnosis.strategic_risk,
                    text(
                      issue.priming_risk,
                      "Το ρίσκο είναι πρόωρη ή άστοχη αντίδραση.",
                    ),
                  )
                }
              />
              <WinCard
                title="Ευνοϊκή διάσταση"
                tone="emerald"
                textValue={
                  winSection?.bullets?.[1] ||
                  text(
                    diagnosis.strategic_opportunity,
                    text(
                      issue.opportunity,
                      "Να εισαχθεί διάσταση θεσμικής σοβαρότητας και λύσης.",
                    ),
                  )
                }
              />
              <WinCard
                title="Κίνηση αναδιάταξης"
                tone="purple"
                textValue={
                  winSection?.bullets?.[2] ||
                  text(
                    diagnosis.recommended_posture,
                    "Μετατόπιση από άμυνα σε τεκμηριωμένη πρόταση.",
                  )
                }
              />
              <WinCard
                title="Ακολουθία"
                tone="zinc"
                textValue={
                  winSection?.bullets?.[3] ||
                  list(actionPlan.next_24h)[0] ||
                  "Πρώτα παρακολούθηση, μετά ασφαλής δημόσια γραμμή, μετά κλιμάκωση μόνο με νέα στοιχεία."
                }
              />
            </div>
          </CockpitSection>
        ) : null}

        {activeTab === "options" ? (
          <CockpitSection
            title="ΕΠΙΛΟΓΕΣ ΔΡΑΣΗΣ"
            subtitle="Τρεις διαδρομές απόφασης — όταν λείπει πλήρης ανάλυση, μένουν σε αναμονή"
          >
            <div className="grid gap-3 xl:grid-cols-3">
              {effectiveDecisionOptions.map((option: DecisionCardOption) => (
                <DecisionCard key={option.label} {...option} />
              ))}
            </div>
          </CockpitSection>
        ) : null}

        {activeTab === "comms" ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <CockpitSection
              title="Κεντρική γραμμή"
              subtitle="Υλικό επικοινωνίας"
            >
              <p className="text-lg font-semibold leading-8 text-zinc-100">
                {materialSection?.material?.briefing ||
                  text(
                    messages.central_line,
                    "Δεν υπάρχει ακόμη κεντρική γραμμή από το strategy brief.",
                  )}
              </p>
            </CockpitSection>
            <CockpitSection
              title="Θεσμική εκδοχή"
              subtitle="Ασφαλής δημόσια εκδοχή"
            >
              <p className="text-sm leading-7 text-zinc-300">
                {materialSection?.material?.suggestedStatement ||
                  text(
                    messages.institutional_version,
                    "Εκκρεμεί θεσμική εκδοχή.",
                  )}
              </p>
            </CockpitSection>
            <CockpitSection title="Αν μας επιτεθούν" subtitle="Πρώτη γραμμή απάντησης">
              <p className="text-sm leading-7 text-zinc-300">
                {materialSection?.material?.internalNote ||
                  text(
                    messages.answer_if_attacked,
                    "Εκκρεμεί απάντηση σε πιθανή επίθεση.",
                  )}
              </p>
            </CockpitSection>
            <CockpitSection
              title="Για το συγκεκριμένο κόμμα"
              subtitle="Επίπτωση για το προφίλ"
            >
              <p className="text-sm leading-7 text-zinc-300">
                {text(
                  selectedPartyImplication,
                  "Δεν υπάρχει ακόμη ειδική επίπτωση για το επιλεγμένο προφίλ στο σημερινό πολιτικό περιβάλλον.",
                )}
              </p>
            </CockpitSection>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PublicPulsePanel({
  situation,
  brief,
}: {
  situation: ΕνεργόSituationRow | null;
  brief: StrategicBrief;
}) {
  const pulse = asRecord(situation?.public_pulse);
  const voices = asRecord(
    (brief as unknown as Record<string, unknown>)?.voices_pulse,
  );
  const hasVoices =
    !!voices && (voices.social_mood_score != null || !!voices.dominant_emotion);
  const emotion = hasVoices
    ? String(voices.dominant_emotion_label || voices.dominant_emotion)
    : pickString(
        pulse,
        ["dominant_emotion", "emotion"],
        text(brief.issue?.dominant_emotion, "Υπό αξιολόγηση"),
      );
  const frame = hasVoices
    ? String(
        voices.dominant_public_frame ||
          pickString(
            pulse,
            ["dominant_public_frame", "dominant_frame", "frame"],
            text(brief.issue?.dominant_frame, "Υπό αξιολόγηση"),
          ),
      )
    : pickString(
        pulse,
        ["dominant_public_frame", "dominant_frame", "frame"],
        text(brief.issue?.dominant_frame, "Υπό αξιολόγηση"),
      );
  const intensityRaw = hasVoices
    ? numberValue(voices.social_mood_score, 0)
    : typeof brief.issue?.emotion_intensity === "number"
      ? brief.issue.emotion_intensity
      : publicPulseScore(situation);
  const intensity = Math.min(100, Math.max(0, Math.round(intensityRaw)));
  const spreadKey = String(
    hasVoices
      ? voices.social_spread || ""
      : brief.issue?.social_spread || pickString(pulse, ["social_spread"], ""),
  ).toLowerCase();
  const spreadLabel =
    spreadKey === "high"
      ? "Υψηλή"
      : spreadKey === "medium"
        ? "Μεσαία"
        : spreadKey === "low"
          ? "Χαμηλή"
          : "Υπό αξιολόγηση";
  const spreadScore =
    spreadKey === "high"
      ? 82
      : spreadKey === "medium"
        ? 56
        : spreadKey === "low"
          ? 30
          : 50;

  return (
    <CockpitSection
      title="ΔΗΜΟΣΙΟ ΕΝΔΙΑΦΕΡΟΝ — ΕΝΔΕΙΞΕΙΣ ΚΟΙΝΟΥ"
      subtitle={
        hasVoices
          ? "Ενδείξεις από δημόσιες πλατφόρμες"
          : "Σήμα από την κάλυψη, όχι δημοσκόπηση"
      }
    >
      <div className="grid gap-4 xl:grid-cols-[170px_1fr]">
        <Gauge score={intensity} label="Ένταση συναισθήματος" />
        <div className="grid gap-3">
          <MiniBox title="Κυρίαρχο συναίσθημα" textValue={emotion} />
          <MiniBox title="Κυρίαρχο framing" textValue={frame} />
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] text-zinc-400">Συναίσθημα</span>
            <div className="flex items-center gap-2">
              <Sparkline
                seed={`pulse-emotion-${emotion}`}
                score={intensity}
                series={deterministicTrendSeries(
                  intensity,
                  undefined,
                  intensity,
                )}
                color={sparkColor(intensity)}
                className="h-6 w-24 shrink-0"
              />
              <span className="text-xs font-semibold text-zinc-100">
                {intensity}%
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] text-zinc-400">Κοινωνική διάδοση</span>
            <div className="flex items-center gap-2">
              <Sparkline
                seed={`pulse-spread-${spreadKey}`}
                score={spreadScore}
                series={deterministicTrendSeries(
                  spreadScore,
                  undefined,
                  spreadScore,
                )}
                color={sparkColor(spreadScore)}
                className="h-6 w-24 shrink-0"
              />
              <span className="text-xs font-semibold text-zinc-100">
                {spreadLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </CockpitSection>
  );
}

function agendaThemeWhyText(row: AgendaOverviewRow | null | undefined) {
  if (!row) return "Δεν έχει επιλεγεί θεματική.";

  const microAgendas = row.micro_agendas || [];
  const lead = row.active_micro_agenda || microAgendas[0]?.title;
  const second = microAgendas[1]?.title;
  const events = row.related_events?.length || 0;
  const opportunity = opportunityText(row);

  if (row.overview_source === "agenda_probe" && lead) {
    const pair = second ? ` μαζί με το «${second}»` : "";
    if (opportunity === "Ήδη στο κέντρο") {
      return `Η θεματική βρίσκεται ήδη ψηλά επειδή το «${lead}»${pair} παράγει πραγματική πίεση στο πεδίο. Με ${events || "—"} σχετικά γεγονότα, το ζήτημα δεν είναι να το “ανακαλύψουμε”, αλλά να μη χαθεί ο έλεγχος του πλαισίου.`;
    }
    if (opportunity === "Χώρος για πλαισίωση") {
      return `Η θεματική έχει αρκετό σήμα, αλλά δεν έχει ακόμη κλειδώσει το κυρίαρχο πλαίσιο. Το «${lead}»${pair} δείχνει πού υπάρχει χώρος να ενωθούν διάσπαρτες πιέσεις σε καθαρή πολιτική γραμμή.`;
    }
    if (opportunity === "Ευκαιρία ανάδειξης") {
      return `Η θεματική δεν είναι ακόμη πλήρως στο κέντρο, αλλά το «${lead}» δίνει παράθυρο έγκαιρης πρωτοβουλίας. Αυτό είναι πεδίο όπου μπορείς να πας πρώτος πριν το ορίσουν άλλοι.`;
    }
    return `Η θεματική παρακολουθείται επειδή το «${lead}» παράγει αρχικό σήμα. Δεν είναι ακόμη ώριμη για μεγάλη κλιμάκωση, αλλά μπορεί να γίνει χρήσιμη αν συνδεθεί με ισχυρότερη πολιτική αφήγηση.`;
  }

  return topicWhyText(row);
}

function agendaThemeBasisText(row: AgendaOverviewRow | null | undefined) {
  if (!row) return "Δεν υπάρχει ακόμη βάση εκτίμησης.";

  if (row.overview_source === "agenda_probe") {
    const microCount = row.micro_agendas?.length || 0;
    const eventCount = row.related_events?.length || 0;
    return `Η εκτίμηση βγαίνει από τα micro-agendas που ανιχνεύει ο Χάρτης ατζέντας με την ίδια μεθοδολογία scoring. Η θεματική δεν σημαίνει ότι όλα είναι “στην ατζέντα”· δείχνει ποια σήματα υπάρχουν στο πεδίο, ποια ανεβαίνουν και ποια μπορούν να μετατραπούν σε ατζέντα. Εδώ συνυπολογίζονται ${microCount || "—"} micro-agendas, ${eventCount || "—"} σχετικά γεγονότα, κάλυψη, φρεσκάδα και βάση τεκμηρίωσης.`;
  }

  return "Η εκτίμηση βασίζεται στα διαθέσιμα σήματα της θεματικής και στη συνολική εικόνα του situation engine.";
}

function agendaArchitectDisplay(result: AgendaArchitectResult | null) {
  const raw = String(result?.displayText || "").trim();
  if (!raw) return "";

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.displayText === "string") return parsed.displayText.trim();
      if (typeof parsed?.display_text === "string") return parsed.display_text.trim();
    } catch {
      return raw
        .replace(/^\{[\s\S]*?"displayText"\s*:\s*"/, "")
        .replace(/",\s*"chatContext"[\s\S]*$/,"")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .trim();
    }
  }

  return raw;
}

function AgendaArchitectPanel({
  result,
  loading,
  error,
  onRun,
  onContinue,
}: {
  result: AgendaArchitectResult | null;
  loading: boolean;
  error: string;
  onRun?: () => void;
  onContinue?: () => void;
}) {
  const displayText = agendaArchitectDisplay(result);

  return (
    <CockpitSection
      title="ΚΙΝΗΣΗ ΑΝΑΔΙΑΤΑΞΗΣ"
      subtitle="Πώς μπορεί να δημιουργηθεί ατζέντα από το σημερινό πεδίο."
    >
      <div className="rounded-[2rem] border border-red-400/20 bg-gradient-to-br from-red-500/[0.10] via-[#120914] to-black/20 p-5 shadow-[0_0_48px_rgba(248,113,113,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-red-200">
              Agenda Architect
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-zinc-50">
              Στρατηγική Αναδιάταξη Ημέρας
            </h3>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-zinc-400">
              Η Noraya ενώνει θεματικές, micro-agendas και γεγονότα για να δείξει πού μπορείς να αλλάξεις τη διάσταση της σύγκρουσης.
            </p>
          </div>

          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="rounded-2xl border border-red-300/30 bg-red-400 px-4 py-3 text-xs font-semibold text-red-950 shadow-lg shadow-red-950/30 transition hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Αναλύει το πεδίο…" : displayText ? "Ανανέωση" : "Κίνηση Αναδιάταξης"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-300/10 p-3 text-xs leading-6 text-red-100">
            {error}
          </div>
        ) : null}

        {displayText ? (
          <div className="mt-5 rounded-3xl border border-white/[0.08] bg-black/25 p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {result?.title || "Στρατηγική Αναδιάταξη Ημέρας"}
            </div>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-7 text-zinc-200">
              {displayText}
            </p>

            <div className="mt-5">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-300/15"
              >
                Συνέχισε στο Advisor Chat
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </CockpitSection>
  );
}

function AgendaOverviewPanel({
  overview,
  selectedRow,
  activeTopic,
  onSelectTopic,
  onSelectProbeEvent,
}: {
  overview: AgendaOverviewRow[];
  selectedRow: AgendaOverviewRow | null;
  activeTopic: string | null;
  onSelectTopic: (topic: string) => void;
  onSelectProbeEvent?: (selection: AgendaProbeSelection) => void;
}) {
  const selected = selectedRow || overview[0] || null;
  const relatedEvents = Array.isArray(selected?.related_events)
    ? selected.related_events
    : [];
  const evidenceArticles = Array.isArray(selected?.evidence_articles)
    ? selected.evidence_articles
    : [];
  const microAgendas = Array.isArray(selected?.micro_agendas)
    ? selected.micro_agendas
    : [];
  const selectedSignal = strategicIndexFromAgenda(selected);
  const selectedOpportunity = opportunityText(selected);

  return (
    <div className="grid gap-4">
      <CockpitSection
        title="ΣΥΝΟΛΙΚΗ ΕΙΚΟΝΑ ΑΤΖΕΝΤΑΣ"
        subtitle="Θεματικές, micro-agendas και γεγονότα που δείχνουν τι κινείται σήμερα και πού μπορεί να δημιουργηθεί ατζέντα."
      >
        {!overview.length ? (
          <EmptyState>
            Δεν υπάρχουν διαθέσιμες θεματικές από τη συνολική εικόνα ατζέντας.
          </EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.95fr]">
            <div className="overflow-hidden rounded-3xl border border-[#1a2640] bg-black/10">
              <div className="grid min-w-[680px] grid-cols-[minmax(170px,1.2fr)_130px_90px_minmax(180px,1fr)] gap-2 border-b border-[#1a2640] px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <div>Θεματική</div>
                <div>Σήμα ημέρας</div>
                <div>Κάλυψη</div>
                <div>Τι τη σηκώνει</div>
              </div>

              <div className="max-h-[460px] min-w-[680px] overflow-y-auto">
                {overview.map((row) => {
                  const isActive = row.topic === activeTopic;
                  const score = strategicIndexFromAgenda(row);
                  const leadMicro =
                    row.active_micro_agenda ||
                    row.micro_agendas?.[0]?.title ||
                    "—";
                  const microCount = row.micro_agendas?.length || 0;

                  return (
                    <button
                      key={row.id || row.topic}
                      type="button"
                      onClick={() => onSelectTopic(row.topic)}
                      className={`grid w-full grid-cols-[minmax(170px,1.2fr)_130px_90px_minmax(180px,1fr)] gap-2 border-b border-[#111a2b] px-4 py-3 text-left text-xs transition ${
                        isActive
                          ? "bg-cyan-300/10 text-cyan-50"
                          : "text-zinc-300 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="font-medium leading-5">{row.topic}</div>
                      <div className="text-cyan-100">{scoreSignalText(score)}</div>
                      <div>{coverageLabel(row.coverage_level)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-zinc-300">{leadMicro}</div>
                        <div className="mt-0.5 text-[10px] text-zinc-500">
                          {microCount ? `${microCount} micro-agendas` : "χωρίς micro-agenda"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid content-start gap-3 rounded-3xl border border-[#1a2640] bg-[#080f1c] p-4">
              {selected ? (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">
                      Θεματική
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-7 text-zinc-50">
                      {selected.topic}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusChip className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                        {scoreSignalText(selectedSignal)}
                      </StatusChip>
                      <StatusChip className="border-white/10 bg-white/[0.04] text-zinc-300">
                        Κάλυψη: {coverageLabel(selected.coverage_level)}
                      </StatusChip>
                      <StatusChip className={docToneClass(selected.documentation_level)}>
                        {documentationLabel(selected.documentation_level)}
                      </StatusChip>
                      <StatusChip className="border-amber-300/20 bg-amber-300/[0.08] text-amber-100">
                        {selectedOpportunity}
                      </StatusChip>
                    </div>
                  </div>

                  {microAgendas.length ? (
                    <div className="rounded-2xl border border-[#1a2640] bg-black/10 p-3">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        Τι τη σηκώνει σήμερα
                      </div>
                      <div className="grid gap-2">
                        {microAgendas.slice(0, 5).map((micro) => (
                          <button
                            key={micro.clusterId}
                            type="button"
                            onClick={() =>
                              onSelectProbeEvent?.({
                                clusterId: micro.clusterId,
                                eventId: null,
                              })
                            }
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.05]"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-zinc-100">
                                {micro.title}
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500">
                                {micro.eventCount} {micro.eventCount === 1 ? "γεγονός" : "γεγονότα"}
                              </div>
                            </div>
                            <div className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-100">
                              {Math.round(numberValue(micro.score, 0))}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <MiniBox
                    title="Γιατί έχει σημασία"
                    textValue={agendaThemeWhyText(selected)}
                  />

                  <MiniBox
                    title="Βάση εκτίμησης"
                    textValue={agendaThemeBasisText(selected)}
                  />

                  <div className="rounded-2xl border border-[#1a2640] bg-black/10 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Σχετικά γεγονότα
                    </div>
                    {relatedEvents.length ? (
                      <div className="grid gap-2">
                        {relatedEvents.slice(0, 5).map((event, index) => {
                          const eventScore = numberValue(event.event_score, 0);
                          const probeClusterId = event.probe_cluster_id
                            ? String(event.probe_cluster_id)
                            : "";
                          const probeEventId = event.probe_event_id
                            ? String(event.probe_event_id)
                            : null;
                          const clickable = Boolean(
                            probeClusterId && onSelectProbeEvent,
                          );

                          const content = (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-medium leading-5 text-zinc-100">
                                    {event.title || "Γεγονός"}
                                  </div>
                                  {event.micro_agenda ? (
                                    <div className="mt-1 text-[10px] text-cyan-300/75">
                                      {event.micro_agenda}
                                    </div>
                                  ) : null}
                                </div>
                                {clickable ? (
                                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">
                                    Άνοιγμα
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-[10px] text-zinc-500">
                                {scoreSignalText(eventScore)} ·{" "}
                                {numberValue(event.article_count, 0)} άρθρα ·{" "}
                                {numberValue(event.source_count, 0)} πηγές
                              </div>
                            </>
                          );

                          return clickable ? (
                            <button
                              key={event.id || `${event.title}-${index}`}
                              type="button"
                              onClick={() =>
                                onSelectProbeEvent?.({
                                  clusterId: probeClusterId,
                                  eventId: probeEventId,
                                })
                              }
                              className="block w-full rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"
                            >
                              {content}
                            </button>
                          ) : (
                            <div
                              key={event.id || `${event.title}-${index}`}
                              className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3"
                            >
                              {content}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState small>
                        Δεν υπάρχουν ακόμη συνδεδεμένα γεγονότα για αυτή τη θεματική.
                      </EmptyState>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#1a2640] bg-black/10 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Κύρια άρθρα
                    </div>
                    {evidenceArticles.length ? (
                      <div className="grid gap-2">
                        {evidenceArticles.slice(0, 5).map((article, index) => {
                          const articleScore = numberValue(article.score, 0);
                          const body = (
                            <>
                              <div className="text-xs font-medium leading-5 text-zinc-100">
                                {article.title || "Άρθρο"}
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500">
                                {article.source || "Πηγή"} · Score{" "}
                                {articleScore ? Math.round(articleScore) : "—"} ·{" "}
                                {evidenceRoleLabel(article.role)}
                              </div>
                            </>
                          );

                          return article.url ? (
                            <a
                              key={
                                article.article_id ||
                                article.url ||
                                `${article.title}-${index}`
                              }
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]"
                            >
                              {body}
                            </a>
                          ) : (
                            <div
                              key={
                                article.article_id ||
                                `${article.title}-${index}`
                              }
                              className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3"
                            >
                              {body}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState small>
                        Δεν υπάρχουν διαθέσιμα κύρια άρθρα για αυτή τη θεματική.
                      </EmptyState>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState>
                  Επίλεξε θεματική για να δεις λεπτομέρειες.
                </EmptyState>
              )}
            </div>
          </div>
        )}
      </CockpitSection>
    </div>
  );
}

function RightInspector({
  situation,
  title,
  score,
  intensityScore,
  documentationLevel,
  brief,
  agenda,
  politicalEnvironment,
  probeView,
  probeItem,
  probeEvidenceArticles,
}: {
  situation: ΕνεργόSituationRow | null;
  title: string;
  score: number;
  intensityScore: number;
  documentationLevel?: string | null;
  brief: StrategicBrief;
  agenda: RankedAgenda[];
  politicalEnvironment: PoliticalEnvironment | null;
  probeView?: EventIntelligenceView | null;
  probeItem?: ProbeAgendaMapItem | null;
  probeEvidenceArticles?: EvidenceArticleItem[];
}) {
  const diagnosis = brief.strategic_diagnosis || {};
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const pulse = asRecord(situation?.public_pulse);
  const summary = asRecord(situation?.summary_assessment);
  const redTeam = redTeamItems(situation?.red_team);
  const polls = recentPolls(politicalEnvironment);
  const actors = topActorTrends(politicalEnvironment);
  const probeWhySection = probeView?.sections.find(
    (section) => section.tab === "why_exists",
  );
  const probeSourcesSection = probeView?.sections.find(
    (section) => section.tab === "sources_factors",
  );
  const probePulseSection = probeView?.sections.find(
    (section) => section.tab === "public_pulse",
  );
  const inspectorTopic = probeView?.microAgenda || text(
    situation?.topic || situation?.category || issue.topic,
    "Πολιτική ατζέντα",
  );
  const inspectorEvidenceArticles = probeEvidenceArticles?.length
    ? probeEvidenceArticles
    : evidenceArticlesFromSituation(situation);
  const inspectorArticleCount = probeItem
    ? numberValue(probeItem.raw.article_count, inspectorEvidenceArticles.length)
    : numberValue(situation?.article_count, 0);
  const inspectorSourceCount = probeItem
    ? numberValue(
        probeItem.raw.source_count,
        new Set(inspectorEvidenceArticles.map((article) => article.source).filter(Boolean)).size,
      )
    : numberValue(situation?.source_count, 0);
  const inspectorDocumentationLabel =
    probeView?.evidenceLabel ||
    docLabelFromScore(evidenceConfidenceScore(inspectorArticleCount, inspectorSourceCount));

  return (
    <aside className="flex w-[240px] shrink-0 flex-col overflow-hidden bg-[#060a14]">
      <div className="flex-1 overflow-y-auto p-3">
        <InspectorPanel title="Γιατί το βλέπει ο Noraya">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
            <div className="text-[10px] font-semibold tracking-[0.01em] text-cyan-300/85">
              {inspectorTopic}
            </div>
            <div className="mt-2 text-xs font-semibold leading-5 text-zinc-100">
              {title}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">
                {scoreSignalText(score)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-300">
                {inspectorArticleCount} άρθρα · {inspectorSourceCount} πηγές
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-6 text-zinc-400">
            {probeWhySection?.body || readWhyText(situation, brief)}
          </p>
          <div className="mt-3 text-[10px] leading-5 text-zinc-500">
            Βάση εκτίμησης: {inspectorDocumentationLabel}
          </div>
        </InspectorPanel>

        <InspectorPanel title="Πηγές γεγονότος">
          <EventEvidenceList articles={inspectorEvidenceArticles} compact />
        </InspectorPanel>

        <InspectorPanel title="Κύριοι παράγοντες">
          <div className="grid gap-3">
            {probeSourcesSection?.bullets?.length
              ? probeSourcesSection.bullets.slice(0, 5).map((item, index) => (
                  <DriverBar
                    key={`${item}-${index}`}
                    label={item}
                    score={probeView?.gauges?.[index]?.value ?? score}
                    trend={probeView?.statusLabel || ""}
                    compact
                  />
                ))
              : Array.isArray(brief.key_drivers) && brief.key_drivers.length
                ? brief.key_drivers
                    .slice(0, 5)
                    .map((d, index) => (
                      <DriverBar
                        key={`${d?.label || "driver"}-${index}`}
                        label={text(d?.label, "Παράγοντας")}
                        score={numberValue(d?.value, score)}
                        trend=""
                        compact
                      />
                    ))
                : (agenda.length
                    ? agenda.slice(0, 4)
                    : [
                        {
                          topic: title,
                          score,
                          signalLabel: riskLabel(situation?.political_risk_level),
                        },
                      ]
                  ).map((item, index) => (
                    <DriverBar
                      key={`${item.topic}-${index}`}
                      label={item.topic || "Παράγοντας"}
                      score={numberValue(
                        (item as RankedAgenda).score ?? score,
                        score,
                      )}
                      trend={
                        (item as RankedAgenda).signalLabel ||
                        riskLabel(situation?.political_risk_level)
                      }
                      compact
                    />
                  ))}
          </div>
        </InspectorPanel>

        <InspectorPanel title="PUBLIC PULSE">
          <div className="space-y-3">
            <MiniBox
              compact
              title="Δημόσιος παλμός"
              textValue={
                probePulseSection?.body ||
                pickString(
                  pulse,
                  ["dominant_public_frame", "frame"],
                  text(issue.dominant_frame, "Δεν έχει υπολογιστεί."),
                )
              }
            />
            <MiniBox
              compact
              title="Διάθεση"
              textValue={
                probeView?.sensitiveMode
                  ? "Προσεκτικός χειρισμός"
                  : pickString(
                      pulse,
                      ["dominant_emotion", "emotion"],
                      "Signal υπό επεξεργασία",
                    )
              }
            />
            <BarMeter
              score={probeView?.gauges?.find((gauge) => gauge.key === "public_pulse")?.value ?? publicPulseScore(situation)}
              label="mood"
            />
            <TinyWarning>
              {probeView
                ? "Δημόσιος παλμός = ένδειξη, όχι κοινή γνώμη χωρίς δημοσκόπηση."
                : pickString(
                    pulse,
                    ["bias_warning"],
                    "Public pulse = ένδειξη, όχι κοινή γνώμη χωρίς δημοσκόπηση.",
                  )}
            </TinyWarning>
          </div>
        </InspectorPanel>

        <InspectorPanel title="RED TEAM">
          {Array.isArray(brief.red_team) && brief.red_team.length ? (
            <div className="grid gap-2">
              {brief.red_team.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3"
                >
                  <div className="text-[10px] text-red-100">#{index + 1}</div>
                  <div className="mt-1 text-[11px] leading-5 text-zinc-200">
                    {item}
                  </div>
                </div>
              ))}
            </div>
          ) : redTeam.length ? (
            <div className="grid gap-2">
              {redTeam.map((item, index) => (
                <div
                  key={`${item.attack_text}-${index}`}
                  className="rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3"
                >
                  <div className="text-[10px] text-red-100">
                    #{index + 1} · {item.risk_level}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-zinc-200">
                    {item.attack_text}
                  </div>
                  <div className="mt-2 text-[10px] leading-5 text-zinc-500">
                    {item.suggested_defense}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState small>
              Δεν υπάρχει ακόμη red team object για αυτή την κατάσταση.
            </EmptyState>
          )}
          <button
            type="button"
            className="mt-3 text-[11px] text-cyan-200 hover:text-cyan-100"
          >
            Προετοιμάσου σήμερα →
          </button>
        </InspectorPanel>

        <InspectorPanel title="ΣΥΝΟΠΤΙΚΗ ΑΞΙΟΛΟΓΗΣΗ">
          <div className="grid gap-2">
            <SummaryLine
              label="Στρατηγική σημασία"
              value={pickString(
                summary,
                ["strategic_importance", "importance"],
                text(daily.why_it_matters_now, "Υπό αξιολόγηση"),
              )}
            />
            <SummaryLine
              label="Ευκαιρία"
              value={pickString(
                summary,
                ["opportunity"],
                text(
                  diagnosis.strategic_opportunity,
                  text(issue.opportunity, "—"),
                ),
              )}
            />
            <SummaryLine
              label="Κίνδυνος"
              value={pickString(
                summary,
                ["risk"],
                text(diagnosis.strategic_risk, text(issue.political_risk, "—")),
              )}
            />
            <SummaryLine
              label="Χρονικό παράθυρο"
              value={pickString(
                summary,
                ["time_window", "window"],
                "24–48 ώρες αν ενισχυθεί το σήμα",
              )}
            />
            <SummaryLine
              label="Βαθμός τεκμηρίωσης"
              value={docLabelFromScore(evidenceConfidenceScore(inspectorArticleCount, inspectorSourceCount))}
            />
          </div>
        </InspectorPanel>

        <InspectorPanel title="ΔΗΜΟΣΚΟΠΗΣΕΙΣ">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Loaded" value={String(polls.length)} small />
            <MiniMetric label="Actors" value={String(actors.length)} small />
            <MiniMetric
              label="Verified"
              value={String(
                polls.filter((poll) =>
                  String(poll.verification_status || "").includes("verified"),
                ).length,
              )}
              small
            />
            <MiniMetric
              label="Review"
              value={String(
                polls.filter((poll) =>
                  String(poll.verification_status || "").includes("review"),
                ).length,
              )}
              small
            />
          </div>
          <div className="mt-3 text-[10px] leading-5 text-zinc-500">
            Τελευταία ενημέρωση:{" "}
            {shortDate(
              polls[0]?.published_at ||
                polls[0]?.fieldwork_end ||
                politicalEnvironment?.snapshot_date,
            )}
          </div>
        </InspectorPanel>
      </div>

      <footer className="border-t border-[#1a2640] bg-[#060a14] p-3">
        <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          Noraya Cognitive Model
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cognitiveStages.map((stage, index) => (
            <div
              key={stage}
              title={stage}
              className="flex h-7 items-center justify-center rounded-xl border border-[#1a2640] bg-[#0c1220] text-[10px] text-cyan-100"
            >
              {index + 1}
            </div>
          ))}
        </div>
      </footer>
    </aside>
  );
}

function AdvisorDock({
  partyName,
  activeTitle,
  chatQuestion,
  setChatQuestion,
  chatMessages,
  chatLoading,
  chatError,
  conversationId,
  conversations,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onAsk,
  onReset,
  chatEndRef,
  chatScrollRef,
}: {
  partyName: string;
  activeTitle: string;
  chatQuestion: string;
  setChatQuestion: (value: string) => void;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string;
  conversationId: string | null;
  conversations: AdvisorConversation[];
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onAsk: (questionOverride?: string) => void;
  onReset: () => void;
  chatEndRef: MutableRefObject<HTMLDivElement | null>;
  chatScrollRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const advisorPrompts = [
    {
      eyebrow: "Ρίσκο",
      title: "Πού είναι η παγίδα;",
      body: "Βρες το σημείο που μπορεί να μας εκθέσει σήμερα.",
      question:
        "Πού είναι η παγίδα σε αυτό το γεγονός; Θέλω καθαρό risk read, τι να αποφύγουμε και τι να πούμε με ασφάλεια.",
    },
    {
      eyebrow: "Κοινό",
      title: "Τι κινεί το κοινό;",
      body: "Συναισθήματα, φόβοι, προσδοκίες και κοινά-κλειδιά.",
      question:
        "Τι κινεί το κοινό σε αυτό το γεγονός; Ποια κοινά επηρεάζονται και με ποιο συναίσθημα πρέπει να μιλήσουμε;",
    },
    {
      eyebrow: "Εκπροσώπηση",
      title: "Ποιος πρέπει να μιλήσει;",
      body: "Πρόσωπο, τόνος, timing και λόγος παρέμβασης.",
      question:
        "Ποιος πρέπει να μιλήσει για αυτό το γεγονός, με τι τόνο, πότε και γιατί; Δώσε μου ασφαλή επιλογή εκπροσώπησης.",
    },
    {
      eyebrow: "Κόκκινες γραμμές",
      title: "Τι δεν λέμε σήμερα;",
      body: "Κόκκινες λέξεις, υπερβολές και framing traps.",
      question:
        "Τι δεν λέμε σήμερα για αυτό το γεγονός; Θέλω κόκκινες λέξεις, framing traps και διατυπώσεις που αυξάνουν ρίσκο.",
    },
    {
      eyebrow: "Δημόσια γραμμή",
      title: "Δώσε 3 ασφαλείς γραμμές",
      body: "Θεσμική, ανθρώπινη και πιο αιχμηρή εκδοχή.",
      question:
        "Δώσε μου 3 ασφαλείς δημόσιες γραμμές για αυτό το γεγονός: θεσμική, ανθρώπινη και πιο αιχμηρή, χωρίς να μας εκθέτουν.",
    },
  ];

  const strategicMoves = [
    {
      label: "Τι ανεβαίνει στην ατζέντα;",
      title: "Εντόπισε τι αλλάζει στην ατζέντα",
      question:
        "Με βάση όλο το dashboard και το active situation, ποια κίνηση στην ατζέντα πρέπει να δω τώρα; Τι ανεβαίνει, τι πέφτει και τι μπορεί να γίνει πολιτικό παράθυρο;",
    },
    {
      label: "Τι μηνύματα λέμε;",
      title: "Μηνύματα & συμβολισμοί",
      question:
        "Δημιούργησε πακέτο μηνυμάτων και συμβολισμών για αυτό το θέμα: βασική γραμμή, λέξεις που χρησιμοποιούμε, λέξεις που αποφεύγουμε και εικόνα/σύμβολο που μπορεί να κουβαλήσει το αφήγημα.",
    },
    {
      label: "Ποιο αφήγημα χτίζουμε;",
      title: "Πρότεινε νέο αφήγημα",
      question:
        "Πρότεινε νέο αφήγημα για το active situation που να μας βγάζει από άμυνα και να μας δίνει πολιτική πρωτοβουλία. Θέλω framing, κοινό-στόχο και βασική αντίθεση.",
    },
    {
      label: "Τι πρωτοβουλία παίρνουμε;",
      title: "Ιδέα για πρωτοβουλία",
      question:
        "Πρότεινε συγκεκριμένη πρωτοβουλία, πρόταση ή μικρή καμπάνια για αυτό το θέμα. Θέλω τι κάνουμε, ποιος το ανακοινώνει, timing και πιθανό κέρδος/ρίσκο.",
    },
    {
      label: "Πώς θα μας χτυπήσουν;",
      title: "Κάνε επίθεση στον εαυτό μας",
      question:
        "Κάνε red-team στο θέμα. Πώς θα μας χτυπήσουν αντίπαλοι, ΜΜΕ και κοινό; Ποια είναι η καλύτερη άμυνα και ποια διατύπωση δεν πρέπει να ειπωθεί;",
    },
  ];

  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function beginRenameConversation(conversation: AdvisorConversation) {
    setEditingConversationId(conversation.id);
    setRenameDraft(conversation.title);
    setDeleteConfirmId(null);
  }

  function finishRenameConversation(id: string) {
    const cleanTitle = renameDraft.trim();
    if (!cleanTitle) return;
    onRenameConversation(id, cleanTitle);
    setEditingConversationId(null);
    setRenameDraft("");
  }

  function cancelRenameConversation() {
    setEditingConversationId(null);
    setRenameDraft("");
  }

  return (
    <section className="mt-5 h-[calc(100vh-110px)] max-h-[940px] min-h-[760px] rounded-[2.25rem] border border-cyan-300/20 bg-[#050914] p-[1px] shadow-[0_36px_140px_rgba(8,145,178,0.16)]">
      <div className="flex h-full min-h-0 overflow-hidden rounded-[2.2rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_32%),linear-gradient(180deg,rgba(8,17,30,0.98),rgba(3,7,18,0.98))]">
        <aside className="hidden w-[360px] shrink-0 flex-col overflow-y-auto border-r border-cyan-300/10 bg-black/20 p-5 xl:flex">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-200/75">
                NORAYA ADVISOR
              </div>
              <div className="mt-2 text-lg font-semibold tracking-[-0.01em] text-zinc-50">
                Στρατηγικός σύμβουλος
              </div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                {partyName}
              </div>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3.5 py-2 text-[11px] font-semibold text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-200/40 hover:bg-cyan-300/15"
            >
              Νέο Chat
            </button>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.055] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold tracking-[0.08em] text-cyan-200/80">
                Ενεργό Γεγονός
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold text-emerald-100">
                Ζωντανό
              </span>
            </div>
            <div className="mt-3 line-clamp-4 text-sm font-semibold leading-6 text-zinc-100">
              {activeTitle}
            </div>
            <div className="mt-3 text-[11px] leading-5 text-zinc-500">
              Ο σύμβουλος απαντά πάνω στο γεγονός, το στρατηγικό brief, τις πηγές
              και το πολιτικό περιβάλλον.
            </div>
          </div>

          <div className="mt-5 border-t border-cyan-300/10 pt-5">
            <div className="mb-3 text-[12px] font-semibold tracking-[0.08em] text-cyan-200/85">
              Σύμβουλος Σήμερα
            </div>
            <div className="grid gap-2.5">
              {advisorPrompts.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onAsk(item.question)}
                  disabled={chatLoading}
                  className="rounded-[1.25rem] border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.07] disabled:opacity-50"
                >
                  <div className="text-[9px] font-medium tracking-[0.08em] text-cyan-200/60">
                    {item.eyebrow}
                  </div>
                  <div className="mt-1 text-[12px] font-semibold leading-5 text-zinc-100">
                    {item.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">
                    {item.body}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-cyan-300/10 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[12px] font-semibold tracking-[0.08em] text-cyan-200/85">
                Συζητήσεις
              </div>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">
                {conversations.length}
              </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto rounded-[1.35rem] border border-white/[0.06] bg-black/15 p-2 pr-1">
              {conversations.length ? (
                <div className="grid gap-2">
                  {conversations.map((conversation) => {
                    const active = conversation.id === conversationId;
                    const editing = editingConversationId === conversation.id;
                    const confirmingDelete = deleteConfirmId === conversation.id;

                    return (
                      <article
                        key={conversation.id}
                        className={`rounded-[1rem] border transition ${
                          active
                            ? "border-cyan-300/40 bg-cyan-300/[0.11] shadow-[0_14px_50px_rgba(8,145,178,0.10)]"
                            : "border-white/[0.07] bg-white/[0.025] hover:border-cyan-300/25 hover:bg-cyan-300/[0.045]"
                        }`}
                      >
                        {editing ? (
                          <div className="grid gap-2 p-2.5">
                            <input
                              value={renameDraft}
                              onChange={(event) => setRenameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  finishRenameConversation(conversation.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelRenameConversation();
                                }
                              }}
                              autoFocus
                              className="w-full rounded-xl border border-cyan-300/25 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-200/50"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => finishRenameConversation(conversation.id)}
                                className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                              >
                                Αποθήκευση
                              </button>
                              <button
                                type="button"
                                onClick={cancelRenameConversation}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] text-zinc-500 transition hover:text-zinc-200"
                              >
                                Άκυρο
                              </button>
                            </div>
                          </div>
                        ) : confirmingDelete ? (
                          <div className="grid gap-2 p-2.5">
                            <div className="text-[12px] font-semibold text-zinc-100">
                              Να διαγραφεί αυτή η συζήτηση;
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteConversation(conversation.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="rounded-xl border border-red-300/25 bg-red-300/10 px-3 py-1.5 text-[10px] font-semibold text-red-100 transition hover:bg-red-300/15"
                              >
                                Διαγραφή
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] text-zinc-500 transition hover:text-zinc-200"
                              >
                                Άκυρο
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2.5">
                            <button
                              type="button"
                              onClick={() => onSelectConversation(conversation.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="line-clamp-1 text-[12px] font-medium leading-5 text-zinc-100">
                                {conversation.title}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[9px] text-zinc-600">
                                <span>
                                  {new Date(conversation.updatedAt).toLocaleDateString("el-GR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                  })}
                                </span>
                                <span>·</span>
                                <span>{conversation.messages.length} μηνύματα</span>
                              </div>
                            </button>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                title="Μετονομασία"
                                onClick={() => beginRenameConversation(conversation)}
                                className="rounded-lg px-2 py-1 text-[9px] text-zinc-600 transition hover:bg-white/[0.05] hover:text-cyan-100"
                              >
                                Μετονομασία
                              </button>
                              <button
                                type="button"
                                title="Διαγραφή"
                                onClick={() => {
                                  setEditingConversationId(null);
                                  setDeleteConfirmId(conversation.id);
                                }}
                                className="rounded-lg px-2 py-1 text-[9px] text-zinc-600 transition hover:bg-red-300/10 hover:text-red-100"
                              >
                                Διαγραφή
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1rem] border border-white/[0.07] bg-white/[0.03] px-3.5 py-5 text-[11px] leading-5 text-zinc-500">
                  Οι συνομιλίες για το ενεργό γεγονός θα εμφανίζονται εδώ.
                </div>
              )}
            </div>
          </div>

        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-cyan-300/10 bg-black/10 px-6 py-5">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold tracking-[0.08em] text-cyan-200/85">
                  Workspace Συμβούλου
                </div>
              </div>
              <div className="grid min-w-[420px] gap-2 sm:grid-cols-5 2xl:w-[650px]">
                {strategicMoves.map((move, index) => (
                  <button
                    key={move.label}
                    type="button"
                    onClick={() => onAsk(move.question)}
                    disabled={chatLoading}
                    title={move.title}
                    className="group rounded-[1.1rem] border border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-3 text-left transition hover:border-cyan-200/40 hover:bg-cyan-300/[0.09] disabled:opacity-50"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/25 bg-black/20 text-[10px] font-semibold text-cyan-100">
                      {index + 1}
                    </div>
                    <div className="mt-2 line-clamp-3 text-[10px] font-semibold leading-4 text-zinc-100 group-hover:text-cyan-50">
                      {move.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={(el) => {
              chatScrollRef.current = el;
            }}
            className="min-h-0 flex-1 overflow-y-auto p-6"
          >
            {chatMessages.length === 0 && !chatLoading ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="text-2xl font-semibold tracking-[-0.02em] text-zinc-100">
                  Ρώτησε τον σύμβουλο Noraya
                </div>
                <div className="mt-4 max-w-2xl rounded-[1.5rem] border border-cyan-300/12 bg-cyan-300/[0.04] px-6 py-5 text-sm leading-7 text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  Ξεκίνα όπως σε βολεύει: από τις επιλογές της ενότητας
                  «Σύμβουλος Σήμερα», από το «Workspace Συμβούλου» ή γράφοντας
                  ελεύθερα τι συνέβη. Ο Noraya θα κατανοήσει την κατάσταση, θα
                  αξιολογήσει τα δεδομένα και θα σου προτείνει τα επόμενα βήματα.
                </div>
              </div>
            ) : (
              <div className="grid gap-5">
                {chatMessages.map((message, index) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`max-w-[84%] rounded-[1.45rem] px-5 py-4 text-sm leading-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${
                        isUser
                          ? "justify-self-end border border-white/[0.09] bg-white/[0.075] text-zinc-100"
                          : "justify-self-start border border-cyan-300/20 bg-cyan-300/[0.105] text-zinc-50 shadow-[0_18px_70px_rgba(8,145,178,0.10)]"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium tracking-[0.08em] text-zinc-500">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${isUser ? "bg-zinc-400" : "bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.8)]"}`}
                        />
                        {isUser ? "Εσύ" : "Noraya"}
                      </div>
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                    </div>
                  );
                })}
                {chatLoading ? (
                  <div className="max-w-[84%] justify-self-start rounded-[1.45rem] border border-cyan-300/20 bg-cyan-300/[0.10] px-5 py-4 text-sm text-cyan-100 shadow-[0_18px_70px_rgba(8,145,178,0.10)]">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                      <span>Σκέφτομαι στρατηγικά…</span>
                    </div>
                  </div>
                ) : null}
                <div
                  ref={(el) => {
                    chatEndRef.current = el;
                  }}
                />
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAsk();
            }}
            className="border-t border-cyan-300/10 bg-black/15 p-5"
          >
            {chatError ? (
              <p className="mb-3 text-xs text-red-200">{chatError}</p>
            ) : null}
            <div className="flex items-stretch gap-3">
              <textarea
                rows={4}
                value={chatQuestion}
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onAsk();
                  }
                }}
                placeholder="Γράψε εδώ..."
                disabled={chatLoading}
                className="min-h-[132px] max-h-[240px] min-w-0 flex-1 resize-y rounded-[1.45rem] border border-white/[0.08] bg-[#040813] px-5 py-4 text-sm leading-7 text-zinc-100 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-zinc-600 focus:border-cyan-300/45 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatQuestion.trim()}
                className="min-h-[132px] rounded-[1.45rem] border border-cyan-200/20 bg-cyan-300 px-7 text-xs font-bold text-slate-950 shadow-[0_18px_60px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 disabled:opacity-50"
              >
                Αποστολή
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function SidebarPanel({
  title,
  action,
  footer,
  info,
  children,
}: {
  title: string;
  action?: string;
  footer?: string;
  info?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 rounded-[1.5rem] border border-[#1a2640] bg-[#080f1c] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold tracking-[0.02em] text-cyan-200/80">
          {title}
        </div>
        {info ? <IconInfo className="h-3.5 w-3.5 text-zinc-600" /> : null}
      </div>
      {children}
      {action || footer ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-[10px]">
          {action ? (
            <button type="button" className="text-cyan-200 hover:text-cyan-100">
              {action}
            </button>
          ) : (
            <span />
          )}
          {footer ? (
            <span className="truncate text-zinc-600">{footer}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function InspectorPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 rounded-[1.5rem] border border-[#1a2640] bg-[#080f1c] p-3">
      <div className="mb-3 text-[11px] font-semibold tracking-[0.02em] text-cyan-200/80">
        {title}
      </div>
      {children}
    </section>
  );
}

function CockpitSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#070c16]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-[12px] font-semibold tracking-[0.01em] text-cyan-100/90">
          {title}
        </div>
        {subtitle ? (
          <div className="text-[10px] font-medium tracking-[0.01em] text-zinc-600">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatusChip({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-medium tracking-[0.01em] ${className}`}
    >
      {children}
    </span>
  );
}

function MiniMetric({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] bg-black/20 ${small ? "px-3 py-2" : "px-4 py-3"}`}
    >
      <div className="text-[10px] font-medium tracking-[0.01em] text-zinc-600">
        {label}
      </div>
      <div
        className={`${small ? "mt-1 text-sm" : "mt-2 text-xl"} font-semibold text-cyan-100`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniBox({
  title,
  textValue,
  compact,
}: {
  title: string;
  textValue: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="text-[10px] font-medium tracking-[0.01em] text-zinc-600">
        {title}
      </div>
      <p
        className={`${compact ? "mt-1 text-[11px] leading-5" : "mt-2 text-sm leading-6"} break-words text-zinc-300`}
      >
        {textValue}
      </p>
    </div>
  );
}

function BulletList({
  items,
  fallback,
  compact,
}: {
  items: string[];
  fallback: string[];
  compact?: boolean;
}) {
  const values = items.length > 0 ? items : fallback;

  return (
    <ul className="grid gap-2">
      {values.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className={`rounded-2xl border border-[#1a2640] bg-black/20 ${compact ? "px-3 py-2 text-xs leading-6" : "px-4 py-3 text-sm leading-7"} text-zinc-300`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Gauge({
  score,
  label,
  small,
}: {
  score: number;
  label: string;
  small?: boolean;
}) {
  const value = clamp(score);
  const color = value >= 70 ? "#ef4444" : value >= 50 ? "#f59e0b" : "#00c8ff";
  const size = small ? "h-20 w-20" : "h-28 w-28";

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${size} rounded-full p-2`}
        style={{
          background: `conic-gradient(${color} ${value * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#060a14]">
          <span
            className={`${small ? "text-lg" : "text-2xl"} font-semibold text-zinc-100`}
          >
            {Math.round(value)}
          </span>
        </div>
      </div>
      <div className="text-center text-[10px] leading-4 text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function BarMeter({ score, label }: { score: number; label: string }) {
  const value = clamp(score);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-600">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function DriverBar({
  label,
  score,
  trend,
  compact,
}: {
  label: string;
  score: number;
  trend?: string;
  compact?: boolean;
}) {
  const value = clamp(score);

  return (
    <div
      className={
        compact ? "" : "rounded-2xl border border-[#1a2640] bg-black/20 p-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`${compact ? "line-clamp-2 text-[11px]" : "text-xs"} min-w-0 font-medium leading-5 text-zinc-300`}
        >
          {label}
        </div>
        <div className="shrink-0 text-[10px] text-cyan-100">
          {Math.round(value)}
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${Math.max(value, 4)}%` }}
        />
      </div>
      {trend ? (
        <div className="mt-1 text-[10px] text-zinc-600">{trend}</div>
      ) : null}
    </div>
  );
}

function WinCard({
  title,
  textValue,
  tone,
}: {
  title: string;
  textValue: string;
  tone: "red" | "amber" | "emerald" | "purple" | "zinc";
}) {
  const className = {
    red: "border-red-300/20 bg-red-300/[0.055]",
    amber: "border-amber-300/20 bg-amber-300/[0.055]",
    emerald: "border-emerald-300/20 bg-emerald-300/[0.055]",
    purple: "border-purple-300/20 bg-purple-300/[0.055]",
    zinc: "border-white/[0.08] bg-white/[0.035]",
  }[tone];

  return (
    <div
      className={`min-w-0 rounded-[1.35rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${className}`}
    >
      <div className="text-[10px] font-semibold tracking-[0.01em] text-cyan-100/70">
        {title}
      </div>
      <p className="mt-3 break-words text-[12px] leading-6 text-zinc-200/90">
        {textValue}
      </p>
    </div>
  );
}

function DecisionCard({
  label,
  title,
  move,
  gain,
  risk,
  recommendation,
  success,
}: {
  label: string;
  title: string;
  move?: string;
  gain: string;
  risk: string;
  recommendation: string;
  success?: number;
}) {
  return (
    <article
      className={`min-w-0 rounded-[1.5rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${recommendationClass(recommendation)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-semibold">{label}</div>
        <span className="shrink-0 rounded-full border border-current/20 px-2 py-1 text-[9px] font-medium">
          {recommendationLabel(recommendation)}
        </span>
      </div>
      <h3 className="mt-3 break-words text-sm font-semibold leading-6 text-zinc-100">
        {title}
      </h3>
      {move ? (
        <p className="mt-1 break-words text-[11px] leading-5 text-zinc-400">
          {move}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        <MiniBox compact title="Κέρδος" textValue={gain} />
        <MiniBox compact title="Ρίσκο" textValue={risk} />
      </div>
      {typeof success === "number" ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>Βεβαιότητα επιτυχίας</span>
            <span className="font-semibold text-zinc-100">{success}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-current/60"
              style={{ width: `${clamp(success)}%` }}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function decisionOptions(brief: StrategicBrief) {
  const scenarios = Array.isArray(brief.scenarios)
    ? brief.scenarios.slice(0, 3)
    : [];
  const labels = ["A", "B", "Γ"];

  return labels.map((label, index) => {
    const scenario = scenarios[index];
    const rec =
      scenario?.recommendation || (index === 1 ? "prefer" : "acceptable");
    // Βεβαιότητα επιτυχίας: deterministic από το recommendation (όχι random).
    const success =
      rec === "prefer"
        ? 65
        : rec === "acceptable"
          ? 45
          : rec === "avoid"
            ? 25
            : 40;
    return {
      label,
      title: text(
        scenario?.name,
        index === 0
          ? "Συντηρητική — χαμηλό ρίσκο"
          : index === 1
            ? "Ισορροπημένη — προτεινόμενη"
            : "Τολμηρή — υψηλότερο ρίσκο",
      ),
      move: text(scenario?.move, ""),
      gain: text(
        scenario?.likely_gain,
        "Δεν έχει παραχθεί ακόμη πλήρες gain για αυτή την επιλογή.",
      ),
      risk: text(
        scenario?.likely_risk,
        "Δεν έχει παραχθεί ακόμη πλήρες risk για αυτή την επιλογή.",
      ),
      recommendation: rec,
      success,
    };
  });
}

function EscalationLadder({
  current,
  recommended,
}: {
  current: number;
  recommended: number;
}) {
  const steps = [
    "Παρακολούθηση",
    "Χαμηλή επίπτωση",
    "Θεσμική πρόκληση",
    "Κοινωνική πίεση",
    "Παρέμβαση αρχηγού",
    "Σύγκρουση",
  ];
  const cur = Math.min(6, Math.max(1, Math.round(current)));
  const rec = Math.min(6, Math.max(1, Math.round(recommended)));

  return (
    <div>
      <div className="flex items-start justify-between gap-1">
        {steps.map((step, index) => {
          const level = index + 1;
          const isCurrent = level === cur;
          const isRecommended = level === rec;
          const reached = level <= cur;
          return (
            <div
              key={step}
              className="flex flex-1 flex-col items-center text-center"
            >
              <div className="flex w-full items-center">
                <div
                  className={`h-[2px] flex-1 ${index === 0 ? "opacity-0" : reached ? "bg-cyan-300/50" : "bg-[#1a2640]"}`}
                />
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isCurrent
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : isRecommended
                        ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                        : reached
                          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                          : "border-[#1a2640] bg-black/20 text-zinc-500"
                  }`}
                >
                  {level}
                </div>
                <div
                  className={`h-[2px] flex-1 ${index === steps.length - 1 ? "opacity-0" : level < cur ? "bg-cyan-300/50" : "bg-[#1a2640]"}`}
                />
              </div>
              <div
                className={`mt-2 text-[9px] leading-3 ${isCurrent ? "text-cyan-100" : "text-zinc-500"}`}
              >
                {step}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#1a2640] bg-black/20 px-3 py-2 text-[11px] text-zinc-400">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
        <span>
          Βρισκόμαστε στο στάδιο{" "}
          <span className="font-semibold text-cyan-100">{steps[cur - 1]}</span>.
          Παρακολουθούμε τάσεις.
        </span>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-zinc-500">
        {badge ? (
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[9px] text-emerald-100">
            {badge}
          </span>
        ) : null}
        {value}
      </span>
    </div>
  );
}

function MemoryLine({ date, title }: { date: string; title: string }) {
  return (
    <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2">
      <div className="text-[10px] text-zinc-600">{date}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-zinc-400">
        {title}
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1a2640] bg-black/20 px-3 py-2">
      <div className="text-[10px] font-medium tracking-[0.01em] text-zinc-600">
        {label}
      </div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-5 text-zinc-300">
        {value}
      </div>
    </div>
  );
}

function TinyWarning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] leading-5 text-amber-100">
      {children}
    </div>
  );
}

function EmptyState({
  children,
  small,
}: {
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-[#1a2640] bg-black/10 ${small ? "px-3 py-3 text-[11px]" : "px-4 py-5 text-sm"} leading-6 text-zinc-600`}
    >
      {children}
    </div>
  );
}

function AnalysisLoading({
  lines = 4,
  label = "Ο Noraya αναλύει το γεγονός…",
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-cyan-100/90">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.85)]" />
        {label}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-gradient-to-r from-white/[0.10] via-white/[0.04] to-white/[0.10]"
            style={{ width: `${92 - i * 9}%`, animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function agendaBarClass(score: number) {
  if (score >= 70) return "bg-red-400";
  if (score >= 50) return "bg-amber-400";
  return "bg-cyan-300";
}

/* ---------------------------------------------------------------------------
   Εικονίδια (inline SVG — χωρίς external dependency)
   Όλα δέχονται className για μέγεθος/χρώμα (currentColor).
--------------------------------------------------------------------------- */

type IconProps = { className?: string };
const iconBase = "h-4 w-4";

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || iconBase}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.5h.01" />
  </Icon>
);
const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 14H2.5a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
  </Icon>
);
const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);
const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);
const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9h18" />
    <path d="M8 3v3" />
    <path d="M16 3v3" />
  </Icon>
);
const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
const IconSave = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5h11l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V5A1.5 1.5 0 0 1 5.5 3.5z" />
    <path d="M8 3.5V8h7V3.5" />
    <path d="M8 20v-6h8v6" />
  </Icon>
);
const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="6" r="2.5" />
    <circle cx="17.5" cy="18" r="2.5" />
    <path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6" />
  </Icon>
);
const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Icon>
);
const IconNote = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h14V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z" />
    <path d="M9 9h6M9 12.5h6M9 16h3" />
  </Icon>
);
const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5" />
  </Icon>
);
const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5z" />
    <circle cx="12" cy="13.5" r="3" />
  </Icon>
);
const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
    <path d="M9 21h6" />
  </Icon>
);
const IconAttach = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11.5 11.8 19.7a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.2 4.2l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8" />
  </Icon>
);
const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12 20 4.5 14.5 20l-3-6.5z" />
    <path d="m11.5 13.5 8.5-9" />
  </Icon>
);
const IconWallet = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14" r="1.2" />
  </Icon>
);
const IconChartUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19V5M4 19h16" />
    <path d="m7 14 3-3 3 2 4-5" />
  </Icon>
);
const IconScale = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16M7 20h10" />
    <path d="M6 7h12" />
    <path d="M6 7 3.5 13a3 3 0 0 0 5 0z" />
    <path d="M18 7l-2.5 6a3 3 0 0 0 5 0z" />
  </Icon>
);
const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
);
const IconBuilding = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20v-3.5h4V20" />
  </Icon>
);

const driverIcons = [
  IconWallet,
  IconChartUp,
  IconScale,
  IconUser,
  IconBuilding,
];

/* ---------------------------------------------------------------------------
   Sparkline — μικρό γράφημα τάσης (deterministic από seed, σταθερό σε render).
--------------------------------------------------------------------------- */

function seededPoints(seed: string, score = 50, count = 14) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1)
    h = (h * 31 + seed.charCodeAt(i)) % 100000;

  const base = clamp(score, 12, 88);
  const points: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = (h * 9301 + 49297) % 233280;
    const noise = (h / 233280) * 26 - 13;
    const drift = (i / (count - 1)) * (base - 50) * 0.5;
    points.push(clamp(base + noise + drift, 6, 96));
  }
  return points;
}

function deterministicTrendSeries(
  score?: number | null,
  change7d?: number | null,
  intensity?: number | null,
  count = 14,
) {
  // Deterministic τάση από ΥΠΑΡΧΟΝΤΑ signals — όχι random.
  // Προτεραιότητα: change_7d (πραγματική κίνηση) > intensity > απόκλιση score από το 50.
  // TODO(history): όταν υπάρξει πίνακας ιστορικού 7 ημερών ανά θέμα, βάλε εδώ πραγματικά daily points.
  const end = clamp(numberValue(score, 50), 5, 95);
  const c7 = typeof change7d === "number" ? change7d : Number(change7d);
  const inten = typeof intensity === "number" ? intensity : Number(intensity);
  const delta = Number.isFinite(c7)
    ? clamp(c7, -40, 40)
    : Number.isFinite(inten)
      ? (inten - 50) * 0.4
      : (end - 50) * 0.3;
  const start = clamp(end - delta, 5, 95);
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const smooth = t * t * (3 - 2 * t);
    const base = start + (end - start) * smooth;
    const wave =
      Math.sin(t * Math.PI * 3) * Math.min(4, Math.abs(delta) * 0.15);
    pts.push(clamp(base + wave, 4, 96));
  }
  return pts;
}

function Sparkline({
  seed,
  score = 50,
  color = "#00c8ff",
  className = "h-7 w-20",
  hasHistory = false,
  series,
}: {
  seed: string;
  score?: number;
  color?: string;
  className?: string;
  hasHistory?: boolean;
  series?: number[];
}) {
  // series = deterministic τάση από signals. Αλλιώς fallback (seeded ή flat).
  const points =
    Array.isArray(series) && series.length > 1
      ? series
      : hasHistory
        ? seededPoints(seed, score)
        : new Array(14).fill(clamp(score, 12, 88));
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const w = 100;
  const h = 32;

  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * w;
      const y = h - ((value - min) / range) * (h - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const gradientId = `spark-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "x"}-${Math.round(score)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${w},${h} L0,${h} Z`}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sparkColor(score: number) {
  if (score >= 70) return "#f87171";
  if (score >= 50) return "#fbbf24";
  return "#34d399";
}

function NumberBadge({
  value,
  tone = "cyan",
  size = "sm",
}: {
  value: number | string;
  tone?: "red" | "amber" | "emerald" | "cyan";
  size?: "sm" | "lg";
}) {
  const tones = {
    red: "border-red-400/40 bg-red-400/15 text-red-200",
    amber: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    emerald: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
    cyan: "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
  }[tone];

  const dims = size === "lg" ? "h-9 w-9 text-lg" : "h-5 w-5 text-[11px]";

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${dims} ${tones}`}
    >
      {value}
    </span>
  );
}
