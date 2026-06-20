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
  if (cluster.requires_human_review) return 'Ανθρώπινος τόνος, όχι κομματική εργαλειοποίηση.';
  if (n(cluster.score) >= 75) return 'Σύντομη τοποθέτηση με καθαρό framing και τεκμηρίωση.';
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
    { key: 'media_intensity', label: 'Media ένταση', value: media, valueLabel: gaugeLabel(media), explanation: 'Άρθρα, πηγές και επανάληψη σημάτων.' },
    { key: 'public_pulse', label: 'Δημόσιος παλμός', value: publicPulse, valueLabel: gaugeLabel(publicPulse), explanation: 'Αναζήτηση, τάσεις και εξωτερικός δημόσιος παλμός.' },
    { key: 'political_intensity', label: 'Πολιτική ένταση', value: political, valueLabel: gaugeLabel(political), explanation: 'Πολιτικά άρθρα, actors και πιθανότητα κομματικής χρήσης.' },
    { key: 'emotional_intensity', label: 'Συναισθηματική ένταση', value: emotional, valueLabel: gaugeLabel(emotional), explanation: 'Κοινωνική φόρτιση, ευαισθησία και γλώσσα τίτλων.' },
    { key: 'overreach_risk', label: 'Κίνδυνος υπερβολής', value: overreach, valueLabel: gaugeLabel(overreach), explanation: 'Ρίσκο υπερ-ερμηνείας πριν παγιωθεί το θέμα.' },
    { key: 'agenda_potential', label: 'Agenda potential', value: agenda, valueLabel: gaugeLabel(agenda), explanation: 'Πιθανότητα να περάσει από γεγονός σε πολιτικό θέμα.' },
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
  if (hasPoliticalActor(title)) triggers.push('Μπαίνουν ενεργά πολιτικοί ή θεσμικοί actors.');
  if (cluster.search_interest_score && cluster.search_interest_score >= 50) triggers.push('Ο δημόσιος παλμός αρχίζει να ανεβαίνει.');
  if (cluster.requires_human_review) triggers.push('Ο χειρισμός παραμένει θεσμικός και προσεκτικός λόγω ευαισθησίας.');
  if (!triggers.length) triggers.push('Η σύσταση αναθεωρείται αν εμφανιστεί δεύτερη πηγή ή νέο πολιτικό σήμα.');

  return triggers;
}

function buildStrategicImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const body = view.sensitiveMode
    ? `Το γεγονός ανήκει στο "${cluster.micro_agenda}" και χρειάζεται προσεκτική, ανθρώπινη ανάγνωση. Η αξία του για το Strategy Room είναι η έγκαιρη κατανόηση του θεσμικού και κοινωνικού πλαισίου.`
    : `Το γεγονός ανήκει στο "${cluster.micro_agenda}". Η στρατηγική σημασία δεν βρίσκεται μόνο στον τίτλο, αλλά στο πώς κουμπώνει με την τρέχουσα πολιτική ατζέντα.`;

  return {
    tab: 'strategic_image',
    label: 'Στρατηγική εικόνα',
    kicker: 'Ατζέντα → Πλαίσιο → Ρίσκο',
    title: 'Τι σημαίνει σήμερα',
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
    kicker: 'Micro-agenda context',
    title: 'Πού ανήκει και τι το στηρίζει',
    body: `Το γεγονός εντάσσεται στο micro-agenda "${cluster.micro_agenda}". Η εικόνα σχηματίζεται από ${eventCount} ${eventCount === 1 ? 'γεγονός' : 'γεγονότα'}, ${articleCount} ${articleWord(articleCount)} και ${sourceCount} ${sourceWord(sourceCount)}.`,
    bullets: [`Parent topics: ${view.parentTopics.join(', ') || '—'}`, `Πιο πρόσφατο σήμα: ${formatDate(cluster.newest_article_at ?? event.last_article_at)}`, `Κατεύθυνση: ${getProfessionalStatusLabel(cluster)}`],
  };
}

function buildWhyExistsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const reasons = [
    `Συνδέεται με το micro-agenda "${cluster.micro_agenda}".`,
    `${n(cluster.article_count)} ${articleWord(n(cluster.article_count))} / ${n(cluster.source_count)} ${sourceWord(n(cluster.source_count))}.`,
    `Τεκμηρίωση: ${view.evidenceLabel}.`,
  ];

  if (n(cluster.event_count) > 1) reasons.push('Δεν εμφανίζεται ως μεμονωμένος τίτλος, αλλά μέσα σε συστάδα σημάτων.');
  if (cluster.requires_human_review) reasons.push('Εμφανίζεται με προσεκτικό χειρισμό λόγω κοινωνικής ευαισθησίας.');

  return {
    tab: 'why_exists',
    label: 'Γιατί υπάρχει',
    kicker: 'Noraya rationale',
    title: 'Γιατί το βλέπει η Noraya',
    body: 'Το σύστημα δεν το εμφανίζει ως απλή αναπαραγωγή είδησης. Το εμφανίζει επειδή συγκεντρώνει σήματα με πολιτική ή θεσμική σημασία.',
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
    body: 'Οι πηγές δείχνουν το γεγονός· οι παράγοντες εξηγούν γιατί αποκτά πολιτική αξία.',
    bullets: [`Πηγές: ${sources.length ? sources.join(', ') : 'σε εξέλιξη'}`, ...factors],
  };
}

function buildPublicPulseSection(cluster: AgendaCluster, view: EventIntelligenceView): IntelligenceSection {
  const pulse = getPublicPulseLabel(cluster.search_interest_score);
  const score = n(cluster.search_interest_score);

  return {
    tab: 'public_pulse',
    label: 'Δημόσιος παλμός',
    kicker: 'Search / media pulse',
    title: pulse,
    body: score >= 45
      ? 'Το θέμα έχει αρχίσει να κινείται πέρα από την απλή ειδησεογραφική εμφάνιση και αξίζει παρακολούθηση ως δημόσιος παλμός.'
      : 'Το θέμα κινείται κυρίως ως θεσμικό ή μιντιακό σήμα. Δεν χρειάζεται να εμφανιστεί ως μαζικός παλμός για να έχει στρατηγική σημασία.',
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
      body: 'Το θέμα δεν πρέπει να αντιμετωπιστεί ως ευκαιρία αντιπαράθεσης. Η σωστή στάση είναι προσεκτική, θεσμική και μη εργαλειοποιητική.',
      bullets: ['Ανθρώπινος τόνος και σεβασμός στα πρόσωπα.', 'Όχι attack line πάνω σε θύματα ή τραγωδίες.', 'Έμφαση σε θεσμική ευθύνη, πρόληψη και προστασία.'],
    };
  }

  return {
    tab: 'how_to_win',
    label: 'Πώς κερδίζεται',
    kicker: 'Στρατηγική δυναμική',
    title: 'Το framing που δουλεύει',
    body: `Το θέμα κερδίζεται όταν μεταφερθεί από απλή είδηση σε καθαρό πολιτικό ερώτημα μέσα στο "${cluster.micro_agenda}".`,
    bullets: ['Κράτα το μήνυμα συγκεκριμένο, όχι γενικό.', 'Σύνδεσε το γεγονός με κόστος, ευθύνη ή επιλογή πολιτικής.', 'Απόφυγε υπερβολή πριν αυξηθεί η τεκμηρίωση.'],
  };
}

function buildActionOptionsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  return {
    tab: 'action_options',
    label: 'Επιλογές δράσης',
    kicker: 'Α/Β/Γ από scenarios',
    title: 'Τι κάνουμε τώρα',
    body: 'Οι επιλογές είναι σχεδιασμένες για γρήγορη απόφαση χωρίς να χαθεί η πολιτική ακρίβεια.',
    actions: buildActionOptions(view),
  };
}

function buildActionOptions(view: EventIntelligenceView): ActionOption[] {
  if (view.sensitiveMode) {
    return [
      { key: 'A', title: 'Θεσμική στάση', badge: 'Προτεινόμενη', body: 'Τοποθέτηση μόνο σε επίπεδο θεσμικής ευθύνης, πρόληψης και προστασίας.', gain: 'Δείχνει σοβαρότητα χωρίς εργαλειοποίηση.', risk: 'Να ακουστεί γενικό αν δεν είναι ανθρώπινο.', successProbability: 65, recommended: true, avoid: false },
      { key: 'B', title: 'Σιωπηλή παρακολούθηση', badge: 'Εναλλακτική', body: 'Καμία δημόσια κίνηση μέχρι να υπάρξει θεσμική εξέλιξη.', gain: 'Αποφεύγει άστοχη εμπλοκή.', risk: 'Μπορεί να χαθεί θεσμικό timing.', successProbability: 45, recommended: false, avoid: false },
      { key: 'Γ', title: 'Κομματική επίθεση', badge: 'Να αποφευχθεί', body: 'Χρήση του θέματος ως επιθετική κομματική γραμμή.', gain: 'Βραχυπρόθεσμη ένταση.', risk: 'Υψηλό ρίσκο κοινωνικής απόρριψης.', successProbability: 15, recommended: false, avoid: true },
    ];
  }

  return [
    { key: 'A', title: 'Ενεργή τοποθέτηση με αξιακή γραμμή', badge: 'Προτεινόμενη', body: 'Σύντομη δήλωση που αναγνωρίζει το θέμα και θέτει καθαρό πολιτικό ερώτημα.', gain: 'Κατοχυρώνει θέση πριν το θέμα γίνει θόρυβος.', risk: 'Θέλει ακριβή διατύπωση για να μη φανεί βιαστικό.', successProbability: 65, recommended: true, avoid: false },
    { key: 'B', title: 'Παρακολούθηση', badge: 'Ουδέτερη', body: 'Κρατάμε το θέμα ενεργό και περιμένουμε δεύτερο κύμα σημάτων.', gain: 'Μειώνει το ρίσκο υπερβολής.', risk: 'Μπορεί να χαθεί πρώτο framing.', successProbability: 45, recommended: false, avoid: false },
    { key: 'Γ', title: 'Σκληρή γραμμή', badge: 'Να αποφευχθεί', body: 'Άμεση επιθετική τοποθέτηση χωρίς επαρκές πλαίσιο.', gain: 'Δίνει ένταση.', risk: 'Μπορεί να παιχτεί ως υπερβολή ή μικροπολιτική.', successProbability: 25, recommended: false, avoid: true },
  ];
}

function buildMaterialSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const material = view.sensitiveMode
    ? {
        briefing: `Το θέμα "${event.title}" χρειάζεται θεσμική και ανθρώπινη διαχείριση. Δεν προτείνεται επιθετική πολιτική αξιοποίηση.`,
        talkingPoints: ['Πρώτα σεβασμός στα πρόσωπα και στα πραγματικά δεδομένα.', 'Η δημόσια στάση να μείνει σε πρόληψη, ευθύνη και θεσμική επάρκεια.', 'Αποφυγή δραματοποίησης και κομματικής εκμετάλλευσης.'],
        suggestedStatement: 'Η δημόσια συζήτηση χρειάζεται σοβαρότητα, σεβασμό και θεσμική ευθύνη. Η προτεραιότητα είναι η προστασία και η πρόληψη.',
        questionForIntervention: 'Ποια θεσμικά βήματα διασφαλίζουν ότι αντίστοιχα περιστατικά αντιμετωπίζονται έγκαιρα και με προστασία των ευάλωτων;',
        internalNote: 'Να μη χρησιμοποιηθεί ως attack line. Review required πριν από οποιαδήποτε δημόσια χρήση.',
      }
    : {
        briefing: `Το γεγονός "${event.title}" εντάσσεται στο "${cluster.micro_agenda}" και μπορεί να χρησιμοποιηθεί για καθαρό πολιτικό framing.`,
        talkingPoints: [`Το θέμα δεν είναι μεμονωμένο· συνδέεται με "${cluster.micro_agenda}".`, 'Η τοποθέτηση πρέπει να είναι συγκεκριμένη και τεκμηριωμένη.', 'Το framing να δείχνει επιλογή πολιτικής, όχι απλή αντίδραση σε τίτλο.'],
        suggestedStatement: 'Το ζήτημα δείχνει ότι χρειάζεται καθαρή πολιτική επιλογή και όχι επικοινωνιακή διαχείριση. Η κοινωνία πρέπει να ξέρει ποιο είναι το κόστος, ποιος το αναλαμβάνει και ποια προτεραιότητα προστατεύεται.',
        questionForIntervention: 'Ποια είναι η συγκεκριμένη επιλογή πολιτικής πίσω από αυτή την εξέλιξη και ποιος πληρώνει το κόστος της;',
        socialDraft: `Δεν αρκεί να παρακολουθούμε τις εξελίξεις. Χρειάζεται καθαρή στάση, τεκμηρίωση και πολιτική ευθύνη στο θέμα "${cluster.micro_agenda}".`,
        internalNote: 'Χρήσιμο για σύντομο briefing, όχι για υπερβολική κλιμάκωση χωρίς νέα τεκμηρίωση.',
      };

  return {
    tab: 'material',
    label: 'Υλικό',
    kicker: 'Briefing assets',
    title: 'Έτοιμο υλικό χρήσης',
    body: 'Σύντομο, στοχευμένο υλικό για εσωτερική χρήση ή προσεκτική δημόσια παρέμβαση.',
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
  if (cluster.requires_human_review) factors.push('Κοινωνική ευαισθησία και ανάγκη ανθρώπινου review.');
  if (!factors.length) factors.push('Σύνδεση γεγονότος με ενεργό πολιτικό micro-agenda.');

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
