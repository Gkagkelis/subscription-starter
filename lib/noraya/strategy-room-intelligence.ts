// NORAYA Strategy Room intelligence mapping layer
// Version: strategy_room_intelligence_v1
//
// This file converts agenda-probe v4 data into UI-ready labels/sections.
// It does NOT change fonts, CSS, spacing, colors, or layout. Keep the existing
// Strategy Room visual format from the screenshots and use this only as data mapping.

export type SensitivityLevel = 'normal' | 'medium' | 'high';
export type StrategyRoomMode = 'standard' | 'careful_review' | 'review_required';

export type EvidenceArticle = {
  url?: string | null;
  title?: string | null;
  source?: string | null;
  score?: number | null;
  published_at?: string | null;
};

export type AgendaEvent = {
  id?: string;
  title: string;
  parent_topic?: string | null;
  micro_agenda?: string | null;
  event_micro_agenda_id?: string | null;
  event_micro_agenda_confidence?: number | null;
  event_micro_agenda_matches?: string[];
  event_score?: number | null;
  status?: string | null;
  article_count?: number | null;
  source_count?: number | null;
  political_article_count?: number | null;
  documentation_level?: string | null;
  detection_method?: string | null;
  last_article_at?: string | null;
  event_classification?: string | null;
};

export type AgendaCluster = {
  type?: string;
  parent_topic?: string | null;
  parent_topics?: string[];
  topic?: string | null;
  micro_agenda: string;
  micro_agenda_id: string;
  title?: string | null;
  score?: number | null;
  raw_score_before_cap?: number | null;
  top_event_score?: number | null;
  event_count?: number | null;
  article_count?: number | null;
  political_article_count?: number | null;
  source_count?: number | null;
  freshness_score?: number | null;
  documentation_score?: number | null;
  search_interest_score?: number | null;
  search_interest_status?: string | null;
  newest_article_at?: string | null;
  classification_mode?: string | null;
  micro_agenda_confidence?: number | null;
  micro_agenda_matches?: string[];
  sensitivity_level?: SensitivityLevel;
  requires_human_review?: boolean;
  ranking_policy?: string | null;
  show_in_strategy_room?: StrategyRoomMode | string | null;
  public_recommendation_allowed?: boolean;
  language_policy?: string | null;
  sensitivity_reasons?: string[];
  diagnosis?: string[];
  strategic_read?: string | null;
  real_news_coverage_score?: number | null;
  real_trend_score?: number | null;
  real_frontpage_prominence_score?: number | null;
  raw_frontpage_prominence_score?: number | null;
  editorial_relevance_score?: number | null;
  signal_bridge?: Record<string, unknown> | null;
  score_components?: Record<string, unknown> | null;
  top_events?: AgendaEvent[];
  evidence_articles?: EvidenceArticle[];
};

export type ProbeV4Response = {
  success: boolean;
  mode?: string;
  grouping?: string;
  generated_at?: string;
  diagnostics?: {
    read_only?: boolean;
    writes_to_database?: boolean;
    formula_version?: string;
    classifier_features?: string[];
    event_rows_considered?: number;
    legacy_situations_are_stale_for_today?: boolean;
  };
  agenda_clusters?: AgendaCluster[];
  monitoring_events?: AgendaCluster[];
};

export type AgendaMapItem = {
  id: string;
  title: string;
  parentTopics: string[];
  score: number;
  statusLabel: string;
  statusTone: 'cyan' | 'green' | 'yellow' | 'red' | 'muted';
  evidenceLabel: string;
  eventCountLabel: string;
  sparklineTone: 'rising' | 'stable' | 'cooling';
  events: AgendaEvent[];
  raw: AgendaCluster;
};

export type PriorityCard = {
  id: string;
  rank: 1 | 2 | 3;
  label: string;
  title: string;
  subtitle: string;
  score: number;
  statusLabel: string;
  priorityLabel: string;
  actionHint: string;
  tone: 'red' | 'yellow' | 'green';
  raw: AgendaCluster;
};

export type Gauge = {
  key:
    | 'media_intensity'
    | 'public_pulse'
    | 'political_intensity'
    | 'emotional_intensity'
    | 'overreach_risk'
    | 'agenda_potential';
  label: string;
  value: number;
  valueLabel: string;
  explanation: string;
};

export type EscalationStage = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  active: boolean;
};

export type ActionOption = {
  key: 'A' | 'B' | 'Γ';
  title: string;
  badge: string;
  body: string;
  gain: string;
  risk: string;
  successProbability: number;
  recommended: boolean;
  avoid: boolean;
};

export type IntelligenceSection = {
  tab:
    | 'strategic_image'
    | 'overall_image'
    | 'why_exists'
    | 'sources_factors'
    | 'public_pulse'
    | 'how_to_win'
    | 'action_options'
    | 'material';
  label: string;
  kicker: string;
  title: string;
  body: string;
  bullets?: string[];
  gauges?: Gauge[];
  escalation?: {
    currentLevel: 1 | 2 | 3 | 4 | 5 | 6;
    stages: EscalationStage[];
    triggerLines: string[];
  };
  actions?: ActionOption[];
  material?: {
    briefing: string;
    talkingPoints: string[];
    suggestedStatement: string;
    questionForIntervention: string;
    socialDraft?: string;
    internalNote: string;
  };
};

export type EventIntelligenceView = {
  selectedKind: 'event';
  eventTitle: string;
  microAgenda: string;
  parentTopics: string[];
  score: number;
  scoreLabel: string;
  statusLabel: string;
  evidenceLabel: string;
  sensitiveMode: boolean;
  reviewMode: StrategyRoomMode | 'standard';
  primaryTabLabel: 'Πώς κερδίζεται' | 'Πώς χειρίζεται';
  gauges: Gauge[];
  escalation: IntelligenceSection['escalation'];
  sections: IntelligenceSection[];
};

const clamp = (value: number, min = 0, max = 100): number => {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const n = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeText = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
};

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items.filter(Boolean)));
const sourceWord = (count: number): string => (count === 1 ? 'πηγή' : 'πηγές');
const articleWord = (count: number): string => (count === 1 ? 'άρθρο' : 'άρθρα');

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const signalBridgeOf = (cluster: AgendaCluster): Record<string, unknown> => recordOf(cluster.signal_bridge);
const scoreComponentsOf = (cluster: AgendaCluster): Record<string, unknown> => recordOf(cluster.score_components);

const editorialItemsOf = (cluster: AgendaCluster): Record<string, unknown>[] => {
  const items = signalBridgeOf(cluster).editorial_top_items;
  return Array.isArray(items) ? items.map(recordOf) : [];
};

const sourceNamesOf = (items: Record<string, unknown>[]): string[] =>
  unique(items.map((item) => safeText(item.source_name)).filter(Boolean)).slice(0, 4);

const compactSourceList = (sources: string[]): string => {
  if (!sources.length) return 'πολιτικές και οικονομικές πηγές';
  if (sources.length === 1) return sources[0];
  if (sources.length === 2) return `${sources[0]} και ${sources[1]}`;
  return `${sources.slice(0, -1).join(', ')} και ${sources[sources.length - 1]}`;
};

const hasExactFrontpageSignal = (cluster: AgendaCluster): boolean => {
  const bridge = signalBridgeOf(cluster);
  return Boolean(bridge.uses_editorial_prominence_signals) && !Boolean(bridge.parent_only_editorial_prominence) && n(bridge.editorial_signal_count) > 0;
};

const hasParentFrontpageSignal = (cluster: AgendaCluster): boolean => {
  const bridge = signalBridgeOf(cluster);
  return Boolean(bridge.uses_editorial_prominence_signals) && Boolean(bridge.parent_only_editorial_prominence) && n(bridge.editorial_signal_count) > 0;
};

const signalStrengthWord = (value: number): string => {
  if (value >= 80) return 'ισχυρή';
  if (value >= 55) return 'σταθερή';
  if (value >= 30) return 'ήπια';
  return 'πρώιμη';
};

const publicInterestPhrase = (cluster: AgendaCluster): string => {
  const trend = n(cluster.real_trend_score ?? cluster.search_interest_score);
  if (trend >= 55) return 'Οι αναζητήσεις δείχνουν αυξημένο δημόσιο ενδιαφέρον και προσθέτουν κοινωνική ώθηση στο θέμα.';
  if (trend >= 25) return 'Οι αναζητήσεις δείχνουν υπαρκτό ενδιαφέρον και κρατούν το θέμα μέσα στην καθημερινή προσοχή του κοινού.';
  if (trend > 0) return 'Οι αναζητήσεις προσθέτουν πρώιμο δημόσιο ενδιαφέρον και λειτουργούν ως συμπληρωματικό σήμα.';
  return 'Το δημόσιο ενδιαφέρον παραμένει σε φάση σχηματισμού και παρακολουθείται μαζί με την ειδησεογραφική κάλυψη.';
};

const newsCoveragePhrase = (cluster: AgendaCluster): string => {
  const coverage = n(cluster.real_news_coverage_score, Math.min(100, n(cluster.article_count) * 8));
  if (coverage >= 80) return 'Η ειδησεογραφική κάλυψη είναι ισχυρή και δίνει διάρκεια στην ατζέντα.';
  if (coverage >= 50) return 'Η ειδησεογραφική κάλυψη είναι σταθερή και συντηρεί το θέμα στο προσκήνιο.';
  return 'Η ειδησεογραφική κάλυψη σχηματίζει αρχικό υπόβαθρο για παρακολούθηση.';
};

const frontpagePhrase = (cluster: AgendaCluster): string => {
  const sources = compactSourceList(sourceNamesOf(editorialItemsOf(cluster)));
  const raw = n(cluster.raw_frontpage_prominence_score ?? cluster.real_frontpage_prominence_score);
  const capped = n(cluster.real_frontpage_prominence_score);

  if (hasExactFrontpageSignal(cluster)) {
    return `Η παρουσία σε πρωτοσέλιδα από ${sources} δίνει στο θέμα θεσμικό βάρος και το μετακινεί προς το κέντρο της πολιτικής ατζέντας.`;
  }

  if (hasParentFrontpageSignal(cluster)) {
    return `Η ευρύτερη ατζέντα γύρω από ${safeText(signalBridgeOf(cluster).matched_editorial_topic, cluster.parent_topic || cluster.micro_agenda)} ανεβαίνει στα πρωτοσέλιδα και προσθέτει πλαίσιο στο θέμα, με ελεγχόμενη βαρύτητα ${capped || raw}.`;
  }

  return 'Η θέση του θέματος σχηματίζεται από την ειδησεογραφική κάλυψη, τη δημόσια προσοχή και τα συγγενή γεγονότα.';
};

const strategicAdvisorBody = (cluster: AgendaCluster, view: EventIntelligenceView): string => {
  const topic = cluster.micro_agenda;
  const frontpage = frontpagePhrase(cluster);
  const pulse = publicInterestPhrase(cluster);
  const coverage = newsCoveragePhrase(cluster);

  if (hasExactFrontpageSignal(cluster)) {
    return `${topic} συγκεντρώνει σήμερα ${signalStrengthWord(n(cluster.real_news_coverage_score, n(cluster.article_count) * 8))} ειδησεογραφική κάλυψη, υπαρκτό ενδιαφέρον στις αναζητήσεις και καθαρή παρουσία στα πολιτικά και οικονομικά πρωτοσέλιδα. ${frontpage} ${pulse} Για τη στρατηγική ανάγνωση, το θέμα μπορεί να λειτουργήσει ως γέφυρα ανάμεσα στην καθημερινή πίεση, την αξιοπιστία λύσεων και την πολιτική τοποθέτηση.`;
  }

  if (hasParentFrontpageSignal(cluster)) {
    return `${topic} κινείται μέσα σε ευρύτερο κύμα που έχει αποκτήσει πρωτοσέλιδη παρουσία. ${frontpage} ${coverage} ${pulse} Για τη στρατηγική ανάγνωση, το θέμα αποκτά αξία ως πεδίο εφαρμογής, εξειδίκευσης και αξιοπιστίας.`;
  }

  return `${topic} συγκεντρώνει σήματα από ειδήσεις, συγγενή γεγονότα και δημόσια προσοχή. ${coverage} ${pulse} Για τη στρατηγική ανάγνωση, το θέμα αξίζει παρακολούθηση ως πεδίο πιθανής πολιτικής μετατόπισης.`;
};

const whyAdvisorBody = (cluster: AgendaCluster): string => {
  const topic = cluster.micro_agenda;
  if (hasExactFrontpageSignal(cluster)) {
    return `${topic} εμφανίζεται επειδή ενώνονται τρία επίπεδα: δημόσιο ενδιαφέρον, ειδησεογραφική διάρκεια και πρωτοσέλιδη ανάδειξη. Η σύμπτωση αυτών των σημάτων δημιουργεί πολιτικό βάρος και φέρνει το θέμα σε θέση άμεσης αξιολόγησης.`;
  }
  if (hasParentFrontpageSignal(cluster)) {
    return `${topic} εμφανίζεται επειδή συνδέεται με ευρύτερη ατζέντα που αποκτά πρωτοσέλιδη δύναμη. Η σύνδεση λειτουργεί συμπληρωματικά και δείχνει πού μπορεί να μετακινηθεί η συζήτηση τις επόμενες ώρες.`;
  }
  return `${topic} εμφανίζεται επειδή συγκεντρώνει επαναλαμβανόμενα σήματα από ειδήσεις, πηγές και σχετικές εξελίξεις. Η εικόνα δείχνει θέμα που σχηματίζει πολιτική σημασία μέσα από τη συσσώρευση ενδείξεων.`;
};

const winningAdvisorBody = (cluster: AgendaCluster): string => {
  if (hasExactFrontpageSignal(cluster)) {
    return `Το θέμα κερδίζεται με γραμμή που αναγνωρίζει την κοινωνική πίεση και δείχνει συγκεκριμένη λύση. Η πρωτοσέλιδη παρουσία δημιουργεί χώρο για σοβαρή τοποθέτηση με θεσμικό τόνο και πρακτική απάντηση.`;
  }
  if (hasParentFrontpageSignal(cluster)) {
    return `Το θέμα κερδίζεται όταν συνδεθεί καθαρά με την κεντρική ατζέντα που ήδη ανεβαίνει. Η σωστή κίνηση είναι εξειδίκευση: από το γενικό πρόβλημα σε εφαρμόσιμη λύση.`;
  }
  return `Το θέμα κερδίζεται με καθαρή σύνδεση ανάμεσα στο γεγονός, την καθημερινή επίπτωση και την πολιτική επιλογή. Η τοποθέτηση χρειάζεται ακρίβεια, ανθρώπινο τόνο και τεκμηρίωση.`;
};

export function getProfessionalStatusLabel(item: AgendaCluster | AgendaEvent): string {
  const articleCount = n((item as AgendaCluster).article_count ?? (item as AgendaEvent).article_count);
  const sourceCount = n((item as AgendaCluster).source_count ?? (item as AgendaEvent).source_count);
  const eventCount = n((item as AgendaCluster).event_count, 1);
  const score = n((item as AgendaCluster).score ?? (item as AgendaEvent).event_score);
  const sensitive = Boolean((item as AgendaCluster).requires_human_review) || (item as AgendaCluster).sensitivity_level === 'high';

  if (sensitive) return 'Απαιτεί προσεκτικό χειρισμό';
  if (eventCount >= 3 && sourceCount >= 3 && score >= 70) return 'Σήμα ατζέντας';
  if (eventCount >= 2 && sourceCount >= 2) return 'Σε διαμόρφωση';
  if (articleCount >= 2 || sourceCount >= 2) return 'Υπό παρακολούθηση';
  return 'Αρχικό σήμα';
}

export function getEvidenceLabel(item: AgendaCluster | AgendaEvent): string {
  const articleCount = n((item as AgendaCluster).article_count ?? (item as AgendaEvent).article_count);
  const sourceCount = n((item as AgendaCluster).source_count ?? (item as AgendaEvent).source_count);
  const documentation = safeText((item as AgendaEvent).documentation_level ?? '');

  if (sourceCount >= 4 || articleCount >= 8) return 'Ισχυρή τεκμηρίωση';
  if (sourceCount >= 2 || articleCount >= 3) return 'Μεσαία τεκμηρίωση';
  if (documentation === 'medium') return 'Μεσαία τεκμηρίωση';
  return 'Αρχική τεκμηρίωση';
}

export function getPublicPulseLabel(searchInterestScore?: number | null): string {
  const score = n(searchInterestScore, 0);
  if (score >= 70) return 'Υψηλός δημόσιος παλμός';
  if (score >= 45) return 'Μεσαίος δημόσιος παλμός';
  if (score >= 20) return 'Ήπιος δημόσιος παλμός';
  return 'Σε αναμονή δημόσιου παλμού';
}

export function scoreLabel(score: number): string {
  if (score >= 80) return 'Υψηλή προτεραιότητα';
  if (score >= 68) return 'Σήμα ατζέντας';
  if (score >= 52) return 'Υπό παρακολούθηση';
  return 'Αρχικό σήμα';
}

export function getStatusTone(label: string): AgendaMapItem['statusTone'] {
  if (label.includes('προσεκτικό')) return 'red';
  if (label.includes('Σήμα')) return 'yellow';
  if (label.includes('διαμόρφωση')) return 'green';
  if (label.includes('παρακολούθηση')) return 'cyan';
  return 'muted';
}

export function buildAgendaMap(raw: ProbeV4Response): AgendaMapItem[] {
  const clusters = [...(raw.agenda_clusters ?? []), ...(raw.monitoring_events ?? [])];

  return clusters
    .filter((cluster) => cluster?.micro_agenda_id && cluster?.micro_agenda)
    .map((cluster) => {
      const score = clamp(n(cluster.score));
      const statusLabel = getProfessionalStatusLabel(cluster);
      const parentTopics = unique([...(cluster.parent_topics ?? []), safeText(cluster.parent_topic ?? '')]);

      return {
        id: cluster.micro_agenda_id,
        title: cluster.micro_agenda,
        parentTopics,
        score,
        statusLabel,
        statusTone: getStatusTone(statusLabel),
        evidenceLabel: getEvidenceLabel(cluster),
        eventCountLabel: `${n(cluster.event_count)} ${n(cluster.event_count) === 1 ? 'γεγονός' : 'γεγονότα'}`,
        sparklineTone: getSparklineTone(cluster),
        events: cluster.top_events ?? [],
        raw: cluster,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildPriorityCards(raw: ProbeV4Response): PriorityCard[] {
  const eligible = buildAgendaMap(raw)
    .filter((item) => item.raw.show_in_strategy_room !== 'review_required')
    .filter((item) => item.events.length > 0)
    .slice(0, 3);

  return eligible.map((item, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    const tone: PriorityCard['tone'] = rank === 1 ? 'red' : rank === 2 ? 'yellow' : 'green';
    const topEvent = item.events[0];

    return {
      id: item.id,
      rank,
      label: rank === 1 ? 'Προτεραιότητα 1' : rank === 2 ? 'Σήμα ατζέντας' : 'Να αποφύγουμε',
      title: safeText(topEvent?.title, item.title),
      subtitle: buildPrioritySubtitle(item.raw),
      score: clamp(n(topEvent?.event_score, item.score)),
      statusLabel: item.statusLabel,
      priorityLabel: scoreLabel(item.score),
      actionHint: buildActionHint(item.raw),
      tone,
      raw: item.raw,
    };
  });
}

export function buildEventIntelligenceView(cluster: AgendaCluster, event?: AgendaEvent): EventIntelligenceView {
  const selectedEvent = event ?? cluster.top_events?.[0] ?? {
    title: cluster.micro_agenda,
    event_score: cluster.score,
    article_count: cluster.article_count,
    source_count: cluster.source_count,
  };

  const parentTopics = unique([...(cluster.parent_topics ?? []), safeText(selectedEvent.parent_topic ?? ''), safeText(cluster.parent_topic ?? '')]);
  const sensitiveMode =
    Boolean(cluster.requires_human_review) ||
    cluster.show_in_strategy_room === 'review_required' ||
    cluster.show_in_strategy_room === 'careful_review' ||
    cluster.sensitivity_level === 'high' ||
    cluster.sensitivity_level === 'medium';

  const gauges = buildDynamicGauges(cluster, selectedEvent);
  const escalation = buildEscalation(cluster, selectedEvent, gauges);
  const primaryTabLabel = sensitiveMode ? 'Πώς χειρίζεται' : 'Πώς κερδίζεται';

  const view: EventIntelligenceView = {
    selectedKind: 'event',
    eventTitle: safeText(selectedEvent.title, cluster.micro_agenda),
    microAgenda: cluster.micro_agenda,
    parentTopics,
    score: clamp(n(selectedEvent.event_score, n(cluster.score))),
    scoreLabel: scoreLabel(clamp(n(selectedEvent.event_score, n(cluster.score)))),
    statusLabel: getProfessionalStatusLabel(cluster),
    evidenceLabel: getEvidenceLabel(selectedEvent),
    sensitiveMode,
    reviewMode: (cluster.show_in_strategy_room as StrategyRoomMode) ?? 'standard',
    primaryTabLabel,
    gauges,
    escalation,
    sections: [],
  };

  view.sections = [
    buildStrategicImageSection(cluster, selectedEvent, view),
    buildOverallImageSection(cluster, selectedEvent, view),
    buildWhyExistsSection(cluster, selectedEvent, view),
    buildSourcesFactorsSection(cluster, selectedEvent, view),
    buildPublicPulseSection(cluster, view),
    buildHowToWinSection(cluster, view),
    buildActionOptionsSection(cluster, selectedEvent, view),
    buildMaterialSection(cluster, selectedEvent, view),
  ];

  return view;
}

function getSparklineTone(cluster: AgendaCluster): AgendaMapItem['sparklineTone'] {
  const freshness = n(cluster.freshness_score);
  const events = n(cluster.event_count);
  if (freshness >= 80 && events >= 2) return 'rising';
  if (freshness < 45) return 'cooling';
  return 'stable';
}

function buildPrioritySubtitle(cluster: AgendaCluster): string {
  if (cluster.requires_human_review) return 'Χρειάζεται προσεκτική θεσμική ανάγνωση πριν από δημόσια χρήση.';
  if (n(cluster.event_count) >= 2) return `Το ${cluster.micro_agenda} έχει αρκετά συναφή σήματα για σημερινή παρακολούθηση.`;
  return `Το γεγονός μπαίνει στο ${cluster.micro_agenda} και χρειάζεται καθαρή πρώτη ανάγνωση.`;
}

function buildActionHint(cluster: AgendaCluster): string {
  if (cluster.requires_human_review) return 'Ανθρώπινος τόνος, θεσμική ακρίβεια και αποφυγή εργαλειοποίησης.';
  if (n(cluster.score) >= 75) return 'Σύντομη τοποθέτηση με καθαρή πλαισίωση και τεκμηρίωση.';
  if (n(cluster.event_count) <= 1) return 'Παρακολούθηση μέχρι να φανεί αν επαναλαμβάνεται.';
  return 'Κράτα το θέμα ενεργό και σύνδεσέ το με ευρύτερο πλαίσιο.';
}

function buildDynamicGauges(cluster: AgendaCluster, event: AgendaEvent): Gauge[] {
  const eventArticles = n(event.article_count, n(cluster.article_count));
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const eventCount = n(cluster.event_count);
  const politicalArticles = n(cluster.political_article_count);
  const searchInterest = n(cluster.search_interest_score);
  const score = n(event.event_score, n(cluster.score));
  const sensitive = cluster.sensitivity_level === 'high' || cluster.sensitivity_level === 'medium' || Boolean(cluster.requires_human_review);
  const singleSource = sourceCount <= 1 || eventArticles <= 1;

  const media = clamp(18 + eventArticles * 7 + sourceCount * 9 + eventCount * 4);
  const publicPulse = clamp(searchInterest || (cluster.search_interest_status?.includes('attention') ? 42 : 24));
  const political = clamp(20 + politicalArticles * 4 + eventCount * 5 + (hasPoliticalActor(event.title) ? 18 : 0));
  const emotional = clamp((sensitive ? 70 : 25) + (cluster.sensitivity_level === 'high' ? 18 : 0) + (hasChargedLanguage(event.title) ? 12 : 0));
  const overreach = clamp((singleSource ? 55 : 28) + (sensitive ? 24 : 0) - Math.min(sourceCount * 4, 16));
  const agenda = clamp(score * 0.55 + media * 0.2 + political * 0.15 + publicPulse * 0.1);

  return [
    { key: 'media_intensity', label: 'Ένταση κάλυψης', value: media, valueLabel: gaugeLabel(media), explanation: 'Άρθρα, πηγές και επανάληψη σημάτων.' },
    { key: 'public_pulse', label: 'Δημόσιος παλμός', value: publicPulse, valueLabel: gaugeLabel(publicPulse), explanation: 'Αναζήτηση, τάσεις και εξωτερικός δημόσιος παλμός.' },
    { key: 'political_intensity', label: 'Πολιτική βαρύτητα', value: political, valueLabel: gaugeLabel(political), explanation: 'Πολιτικά άρθρα, θεσμικοί παράγοντες και δυνατότητα δημόσιας χρήσης.' },
    { key: 'emotional_intensity', label: 'Συναισθηματική ένταση', value: emotional, valueLabel: gaugeLabel(emotional), explanation: 'Κοινωνική φόρτιση, ευαισθησία και γλώσσα τίτλων.' },
    { key: 'overreach_risk', label: 'Προσοχή χειρισμού', value: overreach, valueLabel: gaugeLabel(overreach), explanation: 'Βαθμός προσοχής πριν από δημόσια κλιμάκωση.' },
    { key: 'agenda_potential', label: 'Δυναμική ατζέντας', value: agenda, valueLabel: gaugeLabel(agenda), explanation: 'Πιθανότητα να περάσει από γεγονός σε κεντρικό πολιτικό θέμα.' },
  ];
}

function gaugeLabel(value: number): string {
  if (value >= 78) return 'Υψηλό';
  if (value >= 58) return 'Μεσαίο προς υψηλό';
  if (value >= 40) return 'Μεσαίο';
  if (value >= 22) return 'Ήπιο';
  return 'Σε αναμονή σήματος';
}

function buildEscalation(cluster: AgendaCluster, event: AgendaEvent, gauges: Gauge[]): EventIntelligenceView['escalation'] {
  const score = clamp(n(event.event_score, n(cluster.score)));
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const eventCount = n(cluster.event_count);
  const agendaPotential = gauges.find((g) => g.key === 'agenda_potential')?.value ?? score;
  const politicalIntensity = gauges.find((g) => g.key === 'political_intensity')?.value ?? 0;
  const sensitive = Boolean(cluster.requires_human_review);

  let level: 1 | 2 | 3 | 4 | 5 | 6 = 1;
  if (score >= 45 || sourceCount >= 1) level = 2;
  if (score >= 62 || eventCount >= 2 || sourceCount >= 2) level = 3;
  if (agendaPotential >= 68 || politicalIntensity >= 65 || eventCount >= 4) level = 4;
  if (score >= 82 && sourceCount >= 4 && eventCount >= 4) level = 5;
  if (score >= 90 && sourceCount >= 6 && eventCount >= 6) level = 6;
  if (sensitive && level > 4) level = 4;

  return {
    currentLevel: level,
    stages: [
      { level: 1, label: 'Παρακολούθηση', active: level >= 1 },
      { level: 2, label: 'Χαμηλή επίπτωση', active: level >= 2 },
      { level: 3, label: 'Σήμα ατζέντας', active: level >= 3 },
      { level: 4, label: 'Πολιτική πίεση', active: level >= 4 },
      { level: 5, label: 'Παρέμβαση αρχηγού', active: level >= 5 },
      { level: 6, label: 'Κρίση / σύγκρουση', active: level >= 6 },
    ],
    triggerLines: buildEscalationTriggers(cluster, event),
  };
}

function buildEscalationTriggers(cluster: AgendaCluster, event: AgendaEvent): string[] {
  const triggers: string[] = [];
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const eventCount = n(cluster.event_count);
  const title = safeText(event.title);

  if (sourceCount >= 3) triggers.push('Περνά σε περισσότερες ανεξάρτητες πηγές.');
  if (eventCount >= 3) triggers.push('Συνδέεται με περισσότερα συγγενή γεγονότα.');
  if (hasPoliticalActor(title)) triggers.push('Μπαίνουν ενεργά πολιτικοί ή θεσμικοί παράγοντες.');
  if (cluster.search_interest_score && cluster.search_interest_score >= 50) triggers.push('Ο δημόσιος παλμός αρχίζει να ανεβαίνει.');
  if (cluster.requires_human_review) triggers.push('Ο χειρισμός παραμένει θεσμικός και προσεκτικός λόγω ευαισθησίας.');
  if (!triggers.length) triggers.push('Η σύσταση αναθεωρείται αν εμφανιστεί δεύτερη πηγή ή νέο πολιτικό σήμα.');

  return triggers;
}

function buildStrategicImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const body = view.sensitiveMode
    ? `Το θέμα ανήκει στο "${cluster.micro_agenda}" και ζητά προσεκτική, ανθρώπινη ανάγνωση. Η αξία του για το Strategy Room είναι η έγκαιρη κατανόηση του θεσμικού και κοινωνικού πλαισίου.`
    : strategicAdvisorBody(cluster, view);

  return {
    tab: 'strategic_image',
    label: 'Στρατηγική εικόνα',
    kicker: 'Ατζέντα → Πλαίσιο → Ρίσκο',
    title: 'Τι βλέπουμε',
    body,
    bullets: [`Θέμα: ${cluster.micro_agenda}`, `Κατάσταση: ${view.statusLabel}`, `Τεκμηρίωση: ${view.evidenceLabel}`],
  };
}

function buildOverallImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const eventCount = n(cluster.event_count);
  const articleCount = n(cluster.article_count);
  const sourceCount = n(cluster.source_count);

  return {
    tab: 'overall_image',
    label: 'Συνολική εικόνα',
    kicker: 'Πλαίσιο μικροατζέντας',
    title: 'Πού ανήκει και τι το στηρίζει',
    body: `Το γεγονός εντάσσεται στη μικροατζέντα "${cluster.micro_agenda}". Η εικόνα σχηματίζεται από ${eventCount} ${eventCount === 1 ? 'γεγονός' : 'γεγονότα'}, ${articleCount} ${articleWord(articleCount)} και ${sourceCount} ${sourceWord(sourceCount)}.`,
    bullets: [`Ευρύτερο πλαίσιο: ${view.parentTopics.join(', ') || '—'}`, `Πιο πρόσφατο σήμα: ${formatDate(cluster.newest_article_at ?? event.last_article_at)}`, `Κατεύθυνση: ${getProfessionalStatusLabel(cluster)}`],
  };
}

function buildWhyExistsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const reasons = [
    `Συνδέεται με τη μικροατζέντα "${cluster.micro_agenda}".`,
    `${n(cluster.article_count)} ${articleWord(n(cluster.article_count))} / ${n(cluster.source_count)} ${sourceWord(n(cluster.source_count))}.`,
    `Τεκμηρίωση: ${view.evidenceLabel}.`,
  ];

  if (n(cluster.event_count) > 1) reasons.push('Εμφανίζεται μέσα σε συστάδα συγγενών σημάτων.');
  if (hasExactFrontpageSignal(cluster)) reasons.push('Έχει άμεση παρουσία σε πολιτικά και οικονομικά πρωτοσέλιδα.');
  if (hasParentFrontpageSignal(cluster)) reasons.push('Συνδέεται με ευρύτερο πρωτοσέλιδο κύμα της ίδιας ατζέντας.');
  if (cluster.requires_human_review) reasons.push('Εμφανίζεται με προσεκτικό χειρισμό λόγω κοινωνικής ευαισθησίας.');

  return {
    tab: 'why_exists',
    label: 'Γιατί έχει σημασία',
    kicker: 'Στρατηγική αιτιολόγηση',
    title: 'Γιατί μπαίνει στην εικόνα',
    body: whyAdvisorBody(cluster),
    bullets: reasons,
  };
}

function buildSourcesFactorsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const sources = unique((cluster.evidence_articles ?? []).map((a) => safeText(a.source ?? '')).filter(Boolean)).slice(0, 5);
  const factors = buildFactors(cluster, event);

  return {
    tab: 'sources_factors',
    label: 'Πηγές & παράγοντες',
    kicker: 'Τεκμηρίωση',
    title: 'Από πού προκύπτει',
    body: 'Οι πηγές δείχνουν το γεγονός· οι παράγοντες φωτίζουν το πολιτικό του βάρος.',
    bullets: [`Πηγές: ${sources.length ? sources.join(', ') : 'σε εξέλιξη'}`, ...factors],
  };
}

function buildPublicPulseSection(cluster: AgendaCluster, view: EventIntelligenceView): IntelligenceSection {
  const pulse = getPublicPulseLabel(cluster.search_interest_score);
  const score = n(cluster.search_interest_score);

  return {
    tab: 'public_pulse',
    label: 'Δημόσιο ενδιαφέρον',
    kicker: 'Αναζητήσεις και δημόσια προσοχή',
    title: pulse,
    body: publicInterestPhrase(cluster),
    gauges: view.gauges,
  };
}

function buildHowToWinSection(cluster: AgendaCluster, view: EventIntelligenceView): IntelligenceSection {
  if (view.sensitiveMode) {
    return {
      tab: 'how_to_win',
      label: 'Πώς χειρίζεται',
      kicker: 'Προσεκτική λειτουργία',
      title: 'Θεσμικός και ανθρώπινος χειρισμός',
      body: 'Η σωστή στάση χτίζεται με σεβασμό, θεσμική σοβαρότητα και καθαρή προστατευτική γλώσσα.',
      bullets: ['Ανθρώπινος τόνος και σεβασμός στα πρόσωπα.', 'Θεσμική ευθύνη, πρόληψη και προστασία.', 'Δημόσια στάση με ακρίβεια και μέτρο.'],
    };
  }

  return {
    tab: 'how_to_win',
    label: 'Πώς κερδίζεται',
    kicker: 'Στρατηγική δυναμική',
    title: 'Η γραμμή που δουλεύει',
    body: winningAdvisorBody(cluster),
    bullets: ['Κράτα το μήνυμα συγκεκριμένο και ανθρώπινο.', 'Σύνδεσε το γεγονός με κόστος, ευθύνη ή επιλογή πολιτικής.', 'Δώσε πρακτική κατεύθυνση πριν από την κλιμάκωση.'],
  };
}

function buildActionOptionsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  return {
    tab: 'action_options',
    label: 'Επιλογές δράσης',
    kicker: 'Τρεις διαδρομές απόφασης',
    title: 'Τι κάνουμε τώρα',
    body: 'Οι επιλογές είναι σχεδιασμένες για γρήγορη απόφαση με πολιτική ακρίβεια και καθαρή ευθύνη.',
    actions: buildActionOptions(view),
  };
}

function buildActionOptions(view: EventIntelligenceView): ActionOption[] {
  if (view.sensitiveMode) {
    return [
      { key: 'A', title: 'Θεσμική στάση', badge: 'Προτεινόμενη', body: 'Τοποθέτηση μόνο σε επίπεδο θεσμικής ευθύνης, πρόληψης και προστασίας.', gain: 'Δείχνει σοβαρότητα χωρίς εργαλειοποίηση.', risk: 'Χρειάζεται ανθρώπινη διατύπωση για να αποκτήσει βάρος.', successProbability: 65, recommended: true, avoid: false },
      { key: 'B', title: 'Σιωπηλή παρακολούθηση', badge: 'Εναλλακτική', body: 'Εσωτερική παρακολούθηση μέχρι να υπάρξει θεσμική εξέλιξη.', gain: 'Αποφεύγει άστοχη εμπλοκή.', risk: 'Μπορεί να χαθεί θεσμικό timing.', successProbability: 45, recommended: false, avoid: false },
      { key: 'Γ', title: 'Υψηλού ρίσκου αντιπαράθεση', badge: 'Υψηλό ρίσκο', body: 'Επιθετική κομματική γραμμή πάνω στο θέμα.', gain: 'Βραχυπρόθεσμη ένταση.', risk: 'Υψηλό ρίσκο κοινωνικής απόρριψης.', successProbability: 15, recommended: false, avoid: true },
    ];
  }

  return [
    { key: 'A', title: 'Ενεργή τοποθέτηση με αξιακή γραμμή', badge: 'Προτεινόμενη', body: 'Σύντομη δήλωση που αναγνωρίζει το θέμα και θέτει καθαρό πολιτικό ερώτημα.', gain: 'Κατοχυρώνει θέση πριν το θέμα γίνει θόρυβος.', risk: 'Θέλει ακριβή διατύπωση για να ακουστεί ώριμο.', successProbability: 65, recommended: true, avoid: false },
    { key: 'B', title: 'Παρακολούθηση', badge: 'Ουδέτερη', body: 'Κρατάμε το θέμα ενεργό και περιμένουμε δεύτερο κύμα σημάτων.', gain: 'Μειώνει το ρίσκο υπερβολής.', risk: 'Μπορεί να χαθεί η πρώτη πλαισίωση.', successProbability: 45, recommended: false, avoid: false },
    { key: 'Γ', title: 'Υψηλής έντασης γραμμή', badge: 'Υψηλό ρίσκο', body: 'Άμεση επιθετική τοποθέτηση με περιορισμένο πλαίσιο.', gain: 'Δίνει ένταση.', risk: 'Μπορεί να παιχτεί ως υπερβολή ή μικροπολιτική.', successProbability: 25, recommended: false, avoid: true },
  ];
}

function buildMaterialSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const material = view.sensitiveMode
    ? {
        briefing: `Το θέμα "${event.title}" χρειάζεται θεσμική και ανθρώπινη διαχείριση με προστατευτική γλώσσα.`,
        talkingPoints: ['Πρώτα σεβασμός στα πρόσωπα και στα πραγματικά δεδομένα.', 'Η δημόσια στάση να μείνει σε πρόληψη, ευθύνη και θεσμική επάρκεια.', 'Αποφυγή δραματοποίησης και κομματικής εκμετάλλευσης.'],
        suggestedStatement: 'Η δημόσια συζήτηση χρειάζεται σοβαρότητα, σεβασμό και θεσμική ευθύνη. Η προτεραιότητα είναι η προστασία και η πρόληψη.',
        questionForIntervention: 'Ποια θεσμικά βήματα διασφαλίζουν ότι αντίστοιχα περιστατικά αντιμετωπίζονται έγκαιρα και με προστασία των ευάλωτων;',
        internalNote: 'Χρήση μόνο μετά από ανθρώπινη αξιολόγηση και με θεσμικό τόνο.',
      }
    : {
        briefing: `Το γεγονός "${event.title}" εντάσσεται στο "${cluster.micro_agenda}" και μπορεί να στηρίξει καθαρή πολιτική πλαισίωση.`,
        talkingPoints: [`Το θέμα συνδέεται με τη μικροατζέντα "${cluster.micro_agenda}".`, 'Η τοποθέτηση χρειάζεται συγκεκριμένη και τεκμηριωμένη κατεύθυνση.', 'Η πλαισίωση να δείχνει επιλογή πολιτικής και καθαρή ευθύνη.'],
        suggestedStatement: 'Το ζήτημα δείχνει ότι χρειάζεται καθαρή πολιτική επιλογή με ουσία, κόστος και ευθύνη. Η κοινωνία πρέπει να ξέρει ποιο είναι το κόστος, ποιος το αναλαμβάνει και ποια προτεραιότητα προστατεύεται.',
        questionForIntervention: 'Ποια είναι η συγκεκριμένη επιλογή πολιτικής πίσω από αυτή την εξέλιξη και ποιος πληρώνει το κόστος της;',
        socialDraft: `Οι εξελίξεις στο θέμα "${cluster.micro_agenda}" ζητούν καθαρή στάση, τεκμηρίωση και πολιτική ευθύνη.`,
        internalNote: 'Χρήσιμο για σύντομη ενημέρωση με συγκρατημένη κλιμάκωση και νέα τεκμηρίωση.',
      };

  return {
    tab: 'material',
    label: 'Υλικό',
    kicker: 'Υλικό συμβούλου',
    title: 'Έτοιμο υλικό χρήσης',
    body: 'Σύντομο, στοχευμένο υλικό για εσωτερική χρήση και προσεκτική δημόσια παρέμβαση.',
    material,
  };
}

function buildFactors(cluster: AgendaCluster, event: AgendaEvent): string[] {
  const factors: string[] = [];
  const text = `${event.title} ${cluster.micro_agenda} ${(cluster.micro_agenda_matches ?? []).join(' ')}`.toLowerCase();

  if (text.includes('νατο') || text.includes('άμυνα') || text.includes('αμυν')) factors.push('Αμυντικό και διεθνές πλαίσιο.');
  if (text.includes('ακρίβ') || text.includes('τιμ') || text.includes('καταναλω')) factors.push('Κόστος ζωής και καταναλωτική πίεση.');
  if (text.includes('τράπεζ')) factors.push('Τραπεζικό πλαίσιο και προστασία καταναλωτή.');
  if (text.includes('δήμαρχ') || text.includes('θεσμ')) factors.push('Θεσμική ευθύνη και δημόσια λογοδοσία.');
  if (cluster.requires_human_review) factors.push('Κοινωνική ευαισθησία και ανάγκη ανθρώπινης αξιολόγησης.');
  if (!factors.length) factors.push('Σύνδεση γεγονότος με ενεργή πολιτική μικροατζέντα.');

  return factors;
}

function hasPoliticalActor(title?: string | null): boolean {
  const t = safeText(title).toLowerCase();
  return ['κυβέρνηση', 'υπουργ', 'μητσοτακ', 'ανδρουλακ', 'συριζ', 'πασοκ', 'νδ', 'βουλη', 'δημαρχ', 'νατο', 'εε'].some((term) => t.includes(term));
}

function hasChargedLanguage(title?: string | null): boolean {
  const t = safeText(title).toLowerCase();
  return ['τραγωδ', 'δυστυχη', 'γυναικοκτον', 'ανηλικ', 'θύμα', 'θυμα', 'σοκ', 'βια', 'δολοφον'].some((term) => t.includes(term));
}

function formatDate(value?: string | null): string {
  if (!value) return 'σήμερα';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'σήμερα';
  return date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
