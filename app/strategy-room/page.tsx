"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";

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

type LiveSituationRow = {
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

type AgendaRelatedEvent = {
  id?: string | null;
  title?: string | null;
  topic?: string | null;
  event_score?: number | string | null;
  status?: string | null;
  article_count?: number | string | null;
  source_count?: number | string | null;
  last_article_at?: string | null;
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
};

type SituationEngineResponse = {
  success?: boolean;
  timestamp?: string;
  count?: number;
  returned_count?: number;
  source?: string;
  fallback_used?: boolean;
  situations?: LiveSituationRow[];
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
    return "Ισχυρή τεκμηρίωση";
  }

  if (normalized.includes("medium") || normalized.includes("μεσα")) {
    return "Μεσαία τεκμηρίωση";
  }

  if (
    normalized.includes("low") ||
    normalized.includes("initial") ||
    normalized.includes("starter") ||
    normalized.includes("αρχ")
  ) {
    return "Αρχική τεκμηρίωση";
  }

  if (
    normalized.includes("insufficient") ||
    normalized.includes("weak") ||
    normalized.includes("ανεπαρκ")
  ) {
    return "Ανεπαρκής τεκμηρίωση";
  }

  return "Τεκμηρίωση υπό έλεγχο";
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
  if (label.includes("Μεσαία"))
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (label.includes("Χαμηλή"))
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function docToneClass(value?: string | null) {
  const label = documentationLabel(value);
  if (label.includes("Ισχυρή"))
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (label.includes("Μεσαία"))
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (label.includes("Αρχική"))
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (label.includes("Ανεπαρκής"))
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

function situationId(situation: LiveSituationRow, index: number) {
  return String(
    situation.id ||
      `${situation.title || situation.topic || "situation"}-${index}`,
  );
}

function situationTitle(
  situation?: LiveSituationRow | null,
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

function situationScore(situation?: LiveSituationRow | null, fallback = 0) {
  if (!situation) return fallback;
  return clamp(
    numberValue(
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

function evidenceRoleLabel(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("primary")) return "Κύριο άρθρο";
  if (normalized.includes("support")) return "Υποστηρικτικό άρθρο";
  if (normalized.includes("fallback")) return "Συμπληρωματικό άρθρο";
  return role || "Άρθρο τεκμηρίωσης";
}

function evidenceArticlesFromSituation(
  situation?: LiveSituationRow | null,
): EvidenceArticleItem[] {
  return Array.isArray(situation?.evidence_articles)
    ? situation.evidence_articles
    : [];
}

function articleDate(article?: EvidenceArticleItem | null) {
  return shortDate(article?.published_at || null);
}

function cockpitIntensityScore(
  situation?: LiveSituationRow | null,
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
  situation?: LiveSituationRow | null,
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
  situation?: LiveSituationRow | null,
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

function searchInterestLabel(score?: unknown, status?: string | null) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("fallback") ||
    normalizedStatus.includes("unavailable") ||
    normalizedStatus.includes("error")
  ) {
    return `Search · ${numberValue(score, 50)} (pending)`;
  }
  return `Search · ${numberValue(score, 50)}`;
}

function strategicIndexExplanation(
  raw: number,
  search: number,
  boost: number,
  bonus = 0,
) {
  return `55% Raw Signal (${raw}) + 25% Search Interest (${search}) + 20% Strategic Boost (${boost})${bonus ? ` + bonus ευκαιρίας (${bonus})` : ""}.`;
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
  situation: LiveSituationRow | null | undefined,
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
  situation: LiveSituationRow | null | undefined,
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

function publicPulseScore(situation: LiveSituationRow | null | undefined) {
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

function confidenceFromDocLevel(level?: string | null, fallbackScore = 0) {
  const normalized = String(level || "").toLowerCase();
  if (
    normalized.includes("strong") ||
    normalized.includes("high") ||
    normalized.includes("ισχυ")
  )
    return Math.max(fallbackScore, 76);
  if (normalized.includes("medium") || normalized.includes("μεσα"))
    return Math.max(fallbackScore, 56);
  if (
    normalized.includes("initial") ||
    normalized.includes("low") ||
    normalized.includes("αρχ")
  )
    return Math.max(fallbackScore, 34);
  return fallbackScore;
}

export default function StrategyRoomPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [situationEngine, setSituationEngine] =
    useState<SituationEngineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [situationWarning, setSituationWarning] = useState("");
  const [activeSituationId, setActiveSituationId] = useState<string | null>(
    null,
  );
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const requestedBriefRef = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<SituationTab>("strategic");
  const [activeOverviewTopic, setActiveOverviewTopic] = useState<string | null>(
    null,
  );

  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
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

  useEffect(() => {
    if (!activeOverviewTopic && agendaOverview.length > 0) {
      setActiveOverviewTopic(agendaOverview[0].topic);
    }
  }, [activeOverviewTopic, agendaOverview]);

  const selectedAgendaOverview = useMemo(() => {
    if (!agendaOverview.length) return null;
    return (
      agendaOverview.find((row) => row.topic === activeOverviewTopic) ||
      agendaOverview[0]
    );
  }, [activeOverviewTopic, agendaOverview]);

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
    if ((activeSituation as any).advisor_brief) return;
    const id = String((activeSituation as any).id || "");
    if (!id || requestedBriefRef.current.has(id)) return;
    requestedBriefRef.current.add(id);
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
        // αφήνουμε το id σημειωμένο ώστε να μη μπει σε loop· retry με reload
      } finally {
        setAnalyzingId((cur) => (cur === id ? null : cur));
      }
    })();
  }, [activeSituation, data]);

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

  const activeTitle = situationTitle(
    activeSituation,
    text(
      daily.headline,
      text(
        issue.plain_title,
        rankedAgenda[0]?.topic || "Στρατηγική εικόνα ημέρας",
      ),
    ),
  );
  const activeCategory = text(
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
  const activeScore = situationScore(
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
  const activeEvidenceArticles = evidenceArticlesFromSituation(activeSituation);
  const activeDocLevel =
    activeSituation?.documentation_level ||
    issue.documentation_level ||
    evidence.documentation_level ||
    null;
  const activeDocScore = confidenceFromDocLevel(
    activeDocLevel,
    numberValue(activeSituation?.confidence_score, 0),
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
    const situationKey = String(
      (activeSituation as any)?.id || activeTitle || "no-active-situation",
    );
    return `noraya-advisor:${partyKey}:${situationKey}`;
  }, [activeSituation, activeTitle, data?.profile?.party_key, profile]);

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
          active_situation: activeSituation || null,
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
          activeSituationId={activeSituationId}
          onSelectSituation={(id) => {
            setActiveSituationId(id);
            setActiveTab("strategic");
          }}
          situationSource={situationEngine?.source || "—"}
          situationCount={situationEngine?.count || liveSituations.length}
          situationWarning={situationWarning}
          politicalEnvironment={politicalEnvironment}
        />

        <section className="min-w-0 flex-1 overflow-hidden border-x border-[#1a2640] bg-[#070d18]">
          <div className="h-full overflow-y-auto px-5 py-4">
            <PriorityStrip
              agenda={rankedAgenda}
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
              agendaOverview={agendaOverview}
              selectedAgendaOverview={selectedAgendaOverview}
              activeOverviewTopic={activeOverviewTopic}
              onSelectOverviewTopic={setActiveOverviewTopic}
              selectedPartyImplication={selectedPartyImplication}
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
  activeSituationId,
  onSelectSituation,
  situationSource,
  situationCount,
  situationWarning,
  politicalEnvironment,
}: {
  agenda: RankedAgenda[];
  situations: LiveSituationRow[];
  activeSituationId: string | null;
  onSelectSituation: (id: string) => void;
  situationSource: string;
  situationCount: number;
  situationWarning: string;
  politicalEnvironment: PoliticalEnvironment | null;
}) {
  const polls = recentPolls(politicalEnvironment);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  // #1: Θέματα (επισκόπηση) που ανοίγουν σε ΣΥΓΚΕΚΡΙΜΕΝΑ γεγονότα. Καμία αλληλοκάλυψη, τίποτα generic.
  type AgendaEvent = {
    id: string;
    title: string;
    score: number;
    status: string;
  };
  const agendaItems = useMemo(() => {
    if (situations && situations.length) {
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
        } else {
          ex.events.push(ev);
          if (sc > ex.score) ex.score = sc;
        }
      });
      return (
        Array.from(groups.values())
          .map((g) => ({
            topic: g.topic,
            score: g.score,
            count: g.events.length,
            events: g.events.sort((a, b) => b.score - a.score),
          }))
          // Κατάταξη κατά Agenda Score (σημαντικότητα) — ΙΔΙΟ κριτήριο με τη μηχανή, άρα συμφωνεί με το κέντρο.
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((g, i) => ({ ...g, rank: i + 1 }))
      );
    }
    // Fallback: classified θέματα όταν δεν υπάρχουν ακόμη live γεγονότα.
    return (agenda || []).slice(0, 8).map((a, i) => ({
      topic: a.topic,
      score: a.score,
      count: 0,
      rank: i + 1,
      events: [] as AgendaEvent[],
    }));
  }, [situations, agenda]);

  return (
    <aside className="flex w-[256px] shrink-0 flex-col overflow-hidden bg-[#060a14]">
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarPanel
          title="Χάρτης ατζέντας"
          info
          action="Δες όλη την ατζέντα"
          footer={
            agendaItems.length
              ? `${situationCount || situations.length} γεγονότα · ${situationSource}`
              : "αναμονή ατζέντας"
          }
        >
          {situationWarning ? (
            <TinyWarning>{situationWarning}</TinyWarning>
          ) : null}
          {agendaItems.length ? (
            <div className="grid gap-2">
              {agendaItems.map((item) => {
                const tone =
                  item.score >= 70
                    ? "red"
                    : item.score >= 50
                      ? "amber"
                      : "emerald";
                const priorityLabel =
                  item.score >= 70
                    ? "Υψηλή"
                    : item.score >= 50
                      ? "Μεσαία"
                      : "Χαμηλή";
                const isExpanded = expandedTopic === item.topic;
                const hasActiveChild = item.events.some(
                  (e) => e.id === activeSituationId,
                );
                return (
                  <div
                    key={`${item.topic}-${item.rank}`}
                    className={`overflow-hidden rounded-2xl border transition ${
                      hasActiveChild
                        ? "border-cyan-300/40 bg-cyan-300/[0.06]"
                        : "border-[#1a2640] bg-[#0c1220]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const topicKey: string | null = item.topic ?? null;
                        setExpandedTopic((prev) =>
                          prev === topicKey ? null : topicKey,
                        );
                        if (item.events[0]?.id)
                          onSelectSituation(item.events[0].id);
                      }}
                      className="group flex w-full items-center gap-2 p-3 text-left transition hover:bg-cyan-300/[0.04]"
                    >
                      <NumberBadge value={item.rank} tone={tone} />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-medium leading-5 text-zinc-200 group-hover:text-cyan-100">
                          {item.topic}
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
                          {priorityLabel}
                          {item.count
                            ? ` · ${item.count} ${item.count === 1 ? "γεγονός" : "γεγονότα"}`
                            : ""}
                        </div>
                      </div>
                      <Sparkline
                        seed={`agenda-${item.topic}-${item.rank}`}
                        score={item.score}
                        series={deterministicTrendSeries(item.score, undefined)}
                        color={sparkColor(item.score)}
                        className="h-6 w-9 shrink-0"
                      />
                      {item.events.length ? (
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      ) : null}
                    </button>
                    {isExpanded && item.events.length ? (
                      <div className="grid gap-1 border-t border-[#1a2640] px-2 pb-2 pt-2">
                        {item.events.map((ev) => {
                          const selected = ev.id === activeSituationId;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => onSelectSituation(ev.id)}
                              className={`rounded-xl px-2 py-1.5 text-left text-[11px] leading-4 transition ${
                                selected
                                  ? "bg-cyan-300/15 text-cyan-100"
                                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                              }`}
                            >
                              <span className="line-clamp-2">{ev.title}</span>
                            </button>
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
            <DataRow label="Focus groups" value="—" />
            <DataRow
              label="Briefs"
              value={politicalEnvironment?.snapshot_date ? "1" : "—"}
            />
            <DataRow label="Κόκκινες γραμμές" value="προφίλ" />
          </div>
        </SidebarPanel>

        <SidebarPanel title="Γρήγορη καταγραφή">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Σημείωση / Ιδέα", Glyph: IconNote },
              { label: "URL / Άρθρο", Glyph: IconLink },
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
            <MemoryLine date="Live" title="Situation engine ενεργό" />
          </div>
        </SidebarPanel>
      </div>

      <div className="grid grid-cols-4 border-t border-[#1a2640] bg-[#060a14] text-[10px] text-zinc-600">
        {["UX", "Αρχεία", "Σημειώσεις", "Θεωρήσεις"].map((item) => (
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
  activeTitle,
  immediateRecommendation,
  avoidToday,
}: {
  agenda: RankedAgenda[];
  activeTitle: string;
  immediateRecommendation?: string;
  avoidToday?: string;
}) {
  const cards = [
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

  const badgeTone = {
    red: "border-red-400/30 bg-red-400/10 text-red-200",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
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
        {cards.map((card, index) => (
          <article
            key={card.label}
            className="rounded-[1.5rem] border border-[#1a2640] bg-[#0c1220] p-4"
          >
            <div className="flex items-start gap-3">
              <NumberBadge value={index + 1} tone={card.tone} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-[0.01em] text-cyan-100/65">
                  {card.label}
                </div>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-zinc-100">
                  {card.title}
                </h2>
                <span
                  className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] ${badgeTone[card.tone]}`}
                >
                  {card.badge}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="line-clamp-3 flex-1 text-xs leading-5 text-zinc-400">
                {card.textValue}
              </p>
              <Sparkline
                seed={`priority-${card.label}`}
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
        ))}
      </div>
    </section>
  );
}

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
  selectedPartyImplication,
}: {
  activeTab: SituationTab;
  onTabChange: (tab: SituationTab) => void;
  situation: LiveSituationRow | null;
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
  selectedPartyImplication: string;
}) {
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const diagnosis = brief.strategic_diagnosis || {};
  const actionPlan = brief.action_plan || {};
  const monitoring = brief.monitoring_plan || {};
  const messages = brief.message_package || {};
  const evidence = brief.evidence || {};
  const activeEvidenceArticles = evidenceArticlesFromSituation(situation);

  return (
    <section className="rounded-[2rem] border border-white/[0.07] bg-gradient-to-b from-[#0d1424] via-[#0a1020] to-[#070c18] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusChip className={statusToneClass(status)}>
                {statusLabel(status)}
              </StatusChip>
              <StatusChip className={signalToneClass(urgency)}>
                {riskLabel(urgency)}
              </StatusChip>
              <StatusChip className={docToneClass(documentationLevel)}>
                {documentationLabel(documentationLevel)}
              </StatusChip>
            </div>
            <h1 className="max-w-[760px] text-[1.35rem] font-semibold leading-[1.22] tracking-[-0.03em] text-zinc-50 xl:text-[1.65rem]">
              {title}
            </h1>
            <p className="mt-2 text-xs font-medium tracking-wide text-zinc-500">
              {category}
            </p>
          </div>

                  <div className="grid shrink-0 grid-cols-2 gap-3">
            <MiniMetric
              label="Noraya Priority"
              value={score ? Math.round(score).toString() : "—"}
            />
            <MiniMetric
              label="Τεκμηρίωση"
              value={documentationLabel(documentationLevel)}
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
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 xl:p-6">
        {activeTab === "overview" ? (
          <AgendaOverviewPanel
            overview={agendaOverview}
            selectedRow={selectedAgendaOverview}
            activeTopic={activeOverviewTopic}
            onSelectTopic={onSelectOverviewTopic}
          />
        ) : null}

        {activeTab === "strategic" ? (
          <div className="grid gap-4">
            <CockpitSection
              title="1. Στρατηγική ανάγνωση"
              subtitle="Ατζέντα → Πλαίσιο → Ρίσκο"
            >
              <div className="grid gap-5 xl:grid-cols-[1fr_150px]">
                <p className="text-[13px] leading-7 text-zinc-300/95">
                  {readStrategicText(situation, brief)}
                </p>
                                <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Τεκμηρίωση
                  </div>
                  <div className="mt-3 text-lg font-semibold text-zinc-100">
                    {documentationLabel(documentationLevel)}
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                    Στάδιο επιβεβαίωσης πηγών — όχι ψευδοποσοστό.
                  </p>
                </div>
              </div>
            </CockpitSection>

            <CockpitSection
              title="2. Πώς κερδίζεται το θέμα"
              subtitle="Στρατηγική δυναμική"
            >
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                <WinCard
                  title="Το παιχνίδι σήμερα"
                  tone="red"
                  textValue={text(
                    diagnosis.agenda_reading,
                    text(
                      issue.dominant_frame,
                      "Το παιχνίδι δεν έχει ακόμη πλήρως οριστεί.",
                    ),
                  )}
                />
                <WinCard
                  title="Η παγίδα"
                  tone="amber"
                  textValue={text(
                    diagnosis.strategic_risk,
                    text(
                      issue.priming_risk,
                      "Το ρίσκο είναι πρόωρη ή άστοχη αντίδραση.",
                    ),
                  )}
                />
                <WinCard
                  title="Ευνοϊκή διάσταση"
                  tone="emerald"
                  textValue={text(
                    diagnosis.strategic_opportunity,
                    text(
                      issue.opportunity,
                      "Να εισαχθεί διάσταση θεσμικής σοβαρότητας και λύσης.",
                    ),
                  )}
                />
                <WinCard
                  title="Κίνηση αναδιάταξης"
                  tone="purple"
                  textValue={text(
                    diagnosis.recommended_posture,
                    "Μετατόπιση από άμυνα σε τεκμηριωμένη πρόταση.",
                  )}
                />
                <WinCard
                  title="Ακολουθία"
                  tone="zinc"
                  textValue={
                    list(actionPlan.next_24h)[0] ||
                    "Πρώτα παρακολούθηση, μετά ασφαλής δημόσια γραμμή, μετά κλιμάκωση μόνο με νέα στοιχεία."
                  }
                />
              </div>
            </CockpitSection>

            <div className="grid gap-4 2xl:grid-cols-2">
              <CockpitSection
                title="3. Τι κάνουμε τώρα — επιλογές"
                subtitle="Επιλογές δράσης Α/Β/Γ από scenarios"
              >
                <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-1">
                  {decisionOptions(brief).map((opt) => (
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
              </CockpitSection>

              <CockpitSection
                title="4. Τι θα άλλαζε την εκτίμηση"
                subtitle="Triggers παρακολούθησης"
              >
                <BulletList
                  compact
                  items={list(monitoring.escalation_triggers)}
                  fallback={[
                    "Νέο δημοσκοπικό εύρημα ή verified internal poll.",
                    "Θεσμική αντίδραση που αλλάζει το επίπεδο κλιμάκωσης.",
                    "Μετατόπιση framing σε προσωπική ή ηθική στόχευση.",
                  ]}
                />
                <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs leading-6 text-amber-100">
                  Το κοινό αλλάζει γρήγορα. Η σύσταση πρέπει να αναθεωρείται
                  όταν ενεργοποιηθούν triggers.
                </div>
              </CockpitSection>
            </div>

            <CockpitSection
              title="5. Ένταση & δυναμική"
              subtitle="6 gauges — αρχικά από διαθέσιμα live signals"
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Gauge
                  score={clamp(
                    numberValue(
                      situation?.article_count,
                      agenda[0]?.article_count || 0,
                    ) * 8,
                  )}
                  label="Media ένταση"
                  small
                />
                <Gauge
                  score={clamp(
                    numberValue(
                      situation?.source_count,
                      agenda[0]?.source_count || 0,
                    ) * 15,
                  )}
                  label="Social ένταση"
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
                        (score >= 70 ? 20 : score >= 50 ? 10 : 0),
                    ),
                  )}
                  label="Κίνδυνος υπερβολής"
                  small
                />
                <Gauge
                  score={clamp(Math.max(score, documentationScore))}
                  label="Agenda potential"
                  small
                />
              </div>
            </CockpitSection>

            <CockpitSection
              title="6. Κλίμακα κλιμάκωσης"
              subtitle="Αποφυγή πρόωρης κλιμάκωσης"
            >
              <EscalationLadder
                current={clamp(
                  numberValue(
                    situation?.escalation_level,
                    score >= 70 ? 3 : score >= 50 ? 2 : 1,
                  ),
                  1,
                  6,
                )}
                recommended={clamp(
                  numberValue(
                    situation?.escalation_recommended,
                    score >= 75 ? 3 : 2,
                  ),
                  1,
                  6,
                )}
              />
            </CockpitSection>
          </div>
        ) : null}

        {activeTab === "why" ? (
          <div className="grid gap-4 2xl:grid-cols-2">
            <CockpitSection
              title="Γιατί υπάρχει αυτή η κατάσταση"
              subtitle="Basis / documentation"
            >
              <p className="text-[13px] leading-7 text-zinc-300/95">
                {readWhyText(situation, brief)}
              </p>
            </CockpitSection>
            <CockpitSection title="Τι δεν ξέρουμε ακόμη" subtitle="Uncertainty">
              <p className="text-sm leading-7 text-zinc-300">
                {text(
                  evidence.uncertainty,
                  "Δεν υπάρχει ακόμη πλήρης αβεβαιότητα καταγεγραμμένη. Μέχρι να υπάρξει verified internal data, δεν παρουσιάζουμε ισχυρή σύσταση ως βεβαιότητα.",
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
                {(agenda.length ? agenda.slice(0, 5) : []).map((item) => (
                  <DriverBar
                    key={`${item.topic}-${item.rank}`}
                    label={item.topic || "Θέμα"}
                    score={item.score}
                    trend={item.signalLabel}
                  />
                ))}
                {!agenda.length ? (
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
          <PublicPulsePanel situation={situation} brief={brief} />
        ) : null}

        {activeTab === "win" ? (
          <CockpitSection
            title="Πώς κερδίζεται το θέμα"
            subtitle="Στρατηγική δυναμική και καθαρό framing"
          >
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <WinCard
                title="Το παιχνίδι σήμερα"
                tone="red"
                textValue={text(
                  diagnosis.agenda_reading,
                  text(
                    issue.dominant_frame,
                    "Το παιχνίδι δεν έχει ακόμη πλήρως οριστεί.",
                  ),
                )}
              />
              <WinCard
                title="Η παγίδα"
                tone="amber"
                textValue={text(
                  diagnosis.strategic_risk,
                  text(
                    issue.priming_risk,
                    "Το ρίσκο είναι πρόωρη ή άστοχη αντίδραση.",
                  ),
                )}
              />
              <WinCard
                title="Ευνοϊκή διάσταση"
                tone="emerald"
                textValue={text(
                  diagnosis.strategic_opportunity,
                  text(
                    issue.opportunity,
                    "Να εισαχθεί διάσταση θεσμικής σοβαρότητας και λύσης.",
                  ),
                )}
              />
              <WinCard
                title="Κίνηση αναδιάταξης"
                tone="purple"
                textValue={text(
                  diagnosis.recommended_posture,
                  "Μετατόπιση από άμυνα σε τεκμηριωμένη πρόταση.",
                )}
              />
              <WinCard
                title="Ακολουθία"
                tone="zinc"
                textValue={
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
            subtitle="Πάντα A / B / Γ — όταν δεν υπάρχουν AI options, εμφανίζονται ως pending"
          >
            <div className="grid gap-3 xl:grid-cols-3">
              {decisionOptions(brief).map((option) => (
                <DecisionCard key={option.label} {...option} />
              ))}
            </div>
          </CockpitSection>
        ) : null}

        {activeTab === "comms" ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <CockpitSection
              title="Κεντρική γραμμή"
              subtitle="Communication material"
            >
              <p className="text-lg font-semibold leading-8 text-zinc-100">
                {text(
                  messages.central_line,
                  "Δεν υπάρχει ακόμη κεντρική γραμμή από το strategy brief.",
                )}
              </p>
            </CockpitSection>
            <CockpitSection
              title="Θεσμική εκδοχή"
              subtitle="Safe public version"
            >
              <p className="text-sm leading-7 text-zinc-300">
                {text(
                  messages.institutional_version,
                  "Εκκρεμεί θεσμική εκδοχή.",
                )}
              </p>
            </CockpitSection>
            <CockpitSection title="Αν μας επιτεθούν" subtitle="Response seed">
              <p className="text-sm leading-7 text-zinc-300">
                {text(
                  messages.answer_if_attacked,
                  "Εκκρεμεί απάντηση σε πιθανή επίθεση.",
                )}
              </p>
            </CockpitSection>
            <CockpitSection
              title="Για το συγκεκριμένο κόμμα"
              subtitle="Party implication"
            >
              <p className="text-sm leading-7 text-zinc-300">
                {text(
                  selectedPartyImplication,
                  "Δεν υπάρχει ειδική επίπτωση για το επιλεγμένο party profile στο political environment snapshot.",
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
  situation: LiveSituationRow | null;
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
      title="PUBLIC PULSE – ΕΝΔΕΙΞΕΙΣ ΚΟΙΝΟΥ"
      subtitle={
        hasVoices
          ? "Πραγματικές φωνές πολιτών (YouTube + Twitter)"
          : "Signal από την κάλυψη, όχι δημοσκόπηση"
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

function AgendaOverviewPanel({
  overview,
  selectedRow,
  activeTopic,
  onSelectTopic,
}: {
  overview: AgendaOverviewRow[];
  selectedRow: AgendaOverviewRow | null;
  activeTopic: string | null;
  onSelectTopic: (topic: string) => void;
}) {
  const selected = selectedRow || overview[0] || null;
  const relatedEvents = Array.isArray(selected?.related_events)
    ? selected.related_events
    : [];
  const evidenceArticles = Array.isArray(selected?.evidence_articles)
    ? selected.evidence_articles
    : [];
  const selectedScore = numberValue(selected?.agenda_score, 0);
  const selectedStrategicIndex = strategicIndexFromAgenda(selected);
  const selectedSearchInterest = numberValue(
    selected?.search_interest_score,
    50,
  );
  const selectedStrategicBoost = numberValue(
    selected?.strategic_boost_score,
    50,
  );
  const selectedOpportunityBonus = numberValue(
    selected?.strategic_index_components?.opportunity_bonus,
    0,
  );

  return (
    <div className="grid gap-4">
      <CockpitSection
        title="ΣΥΝΟΛΙΚΗ ΕΙΚΟΝΑ ΑΤΖΕΝΤΑΣ"
        subtitle="Όλες οι θεματικές που παρακολουθεί σήμερα ο Noraya — τι είναι ήδη ψηλά και πού υπάρχει χώρος να ορίσεις εσύ την ατζέντα."
      >
        {!overview.length ? (
          <EmptyState>
            Δεν υπάρχουν διαθέσιμες θεματικές από το agenda overview.
          </EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="overflow-hidden rounded-3xl border border-[#1a2640] bg-black/10">
              <div className="grid min-w-[860px] grid-cols-[minmax(170px,1.4fr)_150px_90px_80px_120px_90px_minmax(150px,1fr)] gap-2 border-b border-[#1a2640] px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <div>Θεματική</div>
                <div>Στρατηγικός Δείκτης</div>
                <div>Κάλυψη</div>
                <div>Πηγές</div>
                <div>Τεκμηρίωση</div>
                <div>Ρίσκο</div>
                <div>Ευκαιρία</div>
              </div>
              <div className="max-h-[460px] min-w-[860px] overflow-y-auto">
                {overview.map((row) => {
                  const score = numberValue(row.agenda_score, 0);
                  const strategicIndex = strategicIndexFromAgenda(row);
                  const isActive = row.topic === activeTopic;
                  return (
                    <button
                      key={row.id || row.topic}
                      type="button"
                      onClick={() => onSelectTopic(row.topic)}
                      className={`grid w-full grid-cols-[minmax(170px,1.4fr)_150px_90px_80px_120px_90px_minmax(150px,1fr)] gap-2 border-b border-[#111a2b] px-4 py-3 text-left text-xs transition ${
                        isActive
                          ? "bg-cyan-300/10 text-cyan-50"
                          : "text-zinc-300 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="font-medium leading-5">{row.topic}</div>
                      <div className="text-cyan-100">
                        {scoreSignalText(strategicIndex)}
                      </div>
                      <div>{coverageLabel(row.coverage_level)}</div>
                      <div>{numberValue(row.source_diversity, 0)}</div>
                      <div>{documentationLabel(row.documentation_level)}</div>
                      <div>{riskLabel(row.political_risk_level)}</div>
                      <div className="text-amber-100">
                        {opportunityText(row)}
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
                        Στρατηγικός Δείκτης · {selectedStrategicIndex}
                      </StatusChip>
                      <StatusChip className="border-white/10 bg-white/[0.04] text-zinc-300">
                        Κάλυψη: {coverageLabel(selected.coverage_level)}
                      </StatusChip>
                      <StatusChip
                        className={docToneClass(selected.documentation_level)}
                      >
                        {documentationLabel(selected.documentation_level)}
                      </StatusChip>
                    </div>
                  </div>

                  <MiniBox
                    title="Γιατί έχει σημασία"
                    textValue={topicWhyText(selected)}
                  />

                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <MiniMetric
                      label="Βασικό σήμα"
                      value={String(selectedScore)}
                      small
                    />
                    <MiniMetric
                      label="Ενδιαφέρον αναζήτησης"
                      value={searchInterestLabel(
                        selectedSearchInterest,
                        selected.search_interest_status,
                      )}
                      small
                    />
                    <MiniMetric
                      label="Στρατηγική ώθηση"
                      value={String(selectedStrategicBoost)}
                      small
                    />
                    <MiniMetric
                      label="Ευκαιρία"
                      value={opportunityText(selected)}
                      small
                    />
                  </div>

                  <MiniBox
                    title="Από τι βγαίνει ο Στρατηγικός Δείκτης"
                    textValue={strategicIndexExplanation(
                      selectedScore,
                      selectedSearchInterest,
                      selectedStrategicBoost,
                      selectedOpportunityBonus,
                    )}
                  />

                  <div className="rounded-2xl border border-[#1a2640] bg-black/10 p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Σχετικά γεγονότα
                    </div>
                    {relatedEvents.length ? (
                      <div className="grid gap-2">
                        {relatedEvents.slice(0, 5).map((event, index) => {
                          const eventScore = numberValue(event.event_score, 0);
                          return (
                            <div
                              key={event.id || `${event.title}-${index}`}
                              className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3"
                            >
                              <div className="text-xs font-medium leading-5 text-zinc-100">
                                {event.title || "Γεγονός"}
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500">
                                {scoreSignalText(eventScore)} ·{" "}
                                {numberValue(event.article_count, 0)} άρθρα ·{" "}
                                {numberValue(event.source_count, 0)} πηγές
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState small>
                        Δεν υπάρχουν ακόμη συνδεδεμένα γεγονότα για αυτή τη
                        θεματική.
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
                                {articleScore ? Math.round(articleScore) : "—"}{" "}
                                · {evidenceRoleLabel(article.role)}
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
}: {
  situation: LiveSituationRow | null;
  title: string;
  score: number;
  intensityScore: number;
  documentationLevel?: string | null;
  brief: StrategicBrief;
  agenda: RankedAgenda[];
  politicalEnvironment: PoliticalEnvironment | null;
}) {
  const diagnosis = brief.strategic_diagnosis || {};
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const pulse = asRecord(situation?.public_pulse);
  const summary = asRecord(situation?.summary_assessment);
  const redTeam = redTeamItems(situation?.red_team);
  const polls = recentPolls(politicalEnvironment);
  const actors = topActorTrends(politicalEnvironment);
  const inspectorTopic = text(
    situation?.topic || situation?.category || issue.topic,
    "Πολιτική ατζέντα",
  );
  const inspectorArticleCount = numberValue(situation?.article_count, 0);
  const inspectorSourceCount = numberValue(situation?.source_count, 0);
  const inspectorEvidenceArticles = evidenceArticlesFromSituation(situation);

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
            {readWhyText(situation, brief)}
          </p>
          <div className="mt-3 text-[10px] leading-5 text-zinc-500">
            Τεκμηρίωση: {documentationLabel(documentationLevel)}
          </div>
        </InspectorPanel>

        <InspectorPanel title="Πηγές γεγονότος">
          <EventEvidenceList articles={inspectorEvidenceArticles} compact />
        </InspectorPanel>

        <InspectorPanel title="Κύριοι παράγοντες">
          <div className="grid gap-3">
            {Array.isArray(brief.key_drivers) && brief.key_drivers.length
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
              title="Κοινωνικό framing"
              textValue={pickString(
                pulse,
                ["dominant_public_frame", "frame"],
                text(issue.dominant_frame, "Δεν έχει υπολογιστεί."),
              )}
            />
            <MiniBox
              compact
              title="Διάθεση"
              textValue={pickString(
                pulse,
                ["dominant_emotion", "emotion"],
                "Signal υπό επεξεργασία",
              )}
            />
            <BarMeter score={publicPulseScore(situation)} label="mood" />
            <TinyWarning>
              {pickString(
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
              value={documentationLabel(documentationLevel)}
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
