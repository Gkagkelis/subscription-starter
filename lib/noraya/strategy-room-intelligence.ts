// NORAYA Strategy Room intelligence mapping layer
// Version: strategy_room_intelligence_v5_5_advisor_case_pattern_intelligence
//
// This file converts agenda-probe data into targeted advisor language.
// It does NOT change fonts, CSS, spacing, colors, or layout.
// Core shift: data -> pattern -> political judgment -> decision logic -> section-specific text.

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

export type AgendaResearchContext = {
  version?: string;
  source_files?: string[];
  micro_agenda_id?: string;
  micro_agenda?: string;
  parent_topic?: string;
  research_frame?: string;
  social_basis?: string;
  audience_reading?: string;
  strategic_meaning?: string;
  party_relevance?: string;
  leader_trait_hint?: string;
  party_key?: string;
  party_lens?: {
    party_key?: string;
    party_label?: string;
    political_family?: string;
    value_frame?: string;
    preferred_tone?: string;
    persuasion_path?: string;
    risk_to_avoid?: string;
    preferred_language?: string[];
    core_themes?: string[];
    core_audiences?: string[];
    known_positions?: string[];
    red_lines?: string[];
    opportunity_frame?: string;
    risk_frame?: string;
    competitor_frame?: string;
    advisor_instructions?: string;
    source?: string;
  };
  party_profile?: Record<string, any> | null;
  narrative_instruction?: string;
  user_learning_slot?: { enabled?: boolean; note?: string };
  recommended_language?: string[];
  evidence_lines?: string[];
  evidence_points?: Array<{
    source?: string;
    label?: string;
    group?: string;
    value?: number;
    period?: string;
    confidence?: string;
  }>;
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
  research_context?: AgendaResearchContext | null;
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
  labelMeaning: string;
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

type AgendaFamily =
  | 'housing_rents'
  | 'housing_programs'
  | 'airbnb'
  | 'labor_wages'
  | 'precarity'
  | 'tax'
  | 'wildfire'
  | 'energy'
  | 'benefits'
  | 'consumer_prices'
  | 'institutions'
  | 'health'
  | 'education'
  | 'default';

type AgendaRole =
  | 'leadSignal'
  | 'proofPoint'
  | 'escalationSignal'
  | 'contradictionSignal'
  | 'grassrootsCue'
  | 'eliteCue'
  | 'riskAmplifier'
  | 'lowValueRepeat';

type PatternSignals = {
  trustPattern: string;
  economicExpectationPattern: string;
  democracyPattern: string;
  leaderFit: string;
  audiencePressure: string;
  patternStrength: string;
};

type PartyFit = {
  label: string;
  partyFit: string;
  partyOpportunity: string;
  partyRisk: string;
  credibilityCondition: string;
  spokespersonLevel: string;
};

type AdvisorCase = {
  eventMeaning: string;
  microAgendaMeaning: string;
  agendaRole: AgendaRole;
  agendaRoleText: string;
  politicalQuestion: string;
  affectedAudience: string;
  secondaryAudience: string;
  audiencePressure: string;
  emotionalDriver: string;
  historicalPattern: string;
  trustPattern: string;
  economicExpectationPattern: string;
  democracyPattern: string;
  patternStrength: string;
  leaderFit: string;
  partyFit: string;
  partyOpportunity: string;
  partyRisk: string;
  credibilityCondition: string;
  persuasionRoute: string;
  winningFrame: string;
  trap: string;
  recommendedMove: string;
  timing: string;
  spokespersonLevel: string;
  actionA: ActionOption;
  actionB: ActionOption;
  actionC: ActionOption;
  reassessmentSignals: string[];
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

const cleanSentence = (value: unknown): string => safeText(value).replace(/\s+/g, ' ').trim();
const stripRepeatedWhitespace = (value: string): string => value.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
const unique = <T,>(items: T[]): T[] => Array.from(new Set(items.filter(Boolean)));
const sourceWord = (count: number): string => (count === 1 ? 'πηγή' : 'πηγές');
const articleWord = (count: number): string => (count === 1 ? 'άρθρο' : 'άρθρα');

const normalize = (value: unknown): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .trim();

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const signalBridgeOf = (cluster: AgendaCluster): Record<string, unknown> => recordOf(cluster.signal_bridge);

const eventTitleForText = (event?: AgendaEvent | null): string => {
  const title = cleanSentence(event?.title);
  return title ? `«${title}»` : 'το σημερινό γεγονός';
};

const researchContextOf = (cluster: AgendaCluster): AgendaResearchContext | null => {
  const ctx = cluster.research_context;
  return ctx && typeof ctx === 'object' ? ctx : null;
};

const asTextList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(cleanSentence).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(cleanSentence).filter(Boolean);
    } catch {
      // Plain text list.
    }
    return trimmed.split(/[\n,;]+/).map(cleanSentence).filter(Boolean);
  }
  return [];
};

const partyLabelOf = (cluster: AgendaCluster): string => {
  const ctx = researchContextOf(cluster);
  return (
    cleanSentence(ctx?.party_lens?.party_label) ||
    cleanSentence(ctx?.party_profile?.party_name) ||
    cleanSentence(ctx?.party_profile?.short_name) ||
    'το επιλεγμένο κόμμα'
  );
};

const partyArticle = (label: string): string => {
  const normalized = label.trim().toUpperCase();
  if (!label) return 'το επιλεγμένο κόμμα';
  if (normalized === 'ΕΛΑΣ') return `την ${label}`;
  if (normalized === 'ΝΔ' || label.toLowerCase().includes('νέα δημοκρατία')) return `τη ${label}`;
  if (normalized === 'ΣΥΡΙΖΑ') return `τον ${label}`;
  if (normalized === 'ΚΚΕ' || normalized.includes('ΜΕΡΑ') || normalized.includes('ΜΈΡΑ') || normalized === 'ΠΑΣΟΚ') return `το ${label}`;
  return `το ${label}`;
};

const isElasProfile = (cluster: AgendaCluster): boolean => {
  const ctx = researchContextOf(cluster);
  const label = normalize(ctx?.party_lens?.party_label || ctx?.party_profile?.party_name || ctx?.party_profile?.short_name || ctx?.party_key);
  return label.includes('ελασ') || label.includes('elas') || label.includes('αριστερη συμπαραταξη');
};

const agendaFamily = (cluster: AgendaCluster): AgendaFamily => {
  const id = normalize(cluster.micro_agenda_id);
  const topic = normalize(`${cluster.micro_agenda} ${cluster.parent_topic || ''} ${(cluster.parent_topics || []).join(' ')}`);
  if (id.includes('housing_rents') || topic.includes('ενοικ') || topic.includes('στεγασ')) return 'housing_rents';
  if (id.includes('renovation') || topic.includes('ανακαιν')) return 'housing_programs';
  if (id.includes('airbnb') || topic.includes('airbnb') || topic.includes('βραχυχρον')) return 'airbnb';
  if (id.includes('wages') || id.includes('labor_rights') || topic.includes('μισθ') || topic.includes('εργασιακ') || topic.includes('απεργ')) return 'labor_wages';
  if (id.includes('unemployment') || id.includes('precarity') || topic.includes('ανεργ') || topic.includes('επισφαλ')) return 'precarity';
  if (id.includes('tax') || topic.includes('φορο') || topic.includes('ενφια') || topic.includes('ααδε')) return 'tax';
  if (id.includes('wildfire') || topic.includes('πυροπροστα') || topic.includes('οικοπεδ') || topic.includes('πυρκαγ')) return 'wildfire';
  if (id.includes('energy') || topic.includes('ενεργ') || topic.includes('ρευμα') || topic.includes('λογαριασμ')) return 'energy';
  if (id.includes('benefits') || topic.includes('επιδο') || topic.includes('στηριξ')) return 'benefits';
  if (id.includes('consumer_price') || topic.includes('ακριβ') || topic.includes('τιμων') || topic.includes('καταναλω')) return 'consumer_prices';
  if (topic.includes('θεσμ') || topic.includes('δικαιοσυν') || topic.includes('δημοκρατ')) return 'institutions';
  if (topic.includes('υγεια') || topic.includes('γιατρ') || topic.includes('νοσοκομ')) return 'health';
  if (topic.includes('παιδει') || topic.includes('εκπαιδευ') || topic.includes('σχολ')) return 'education';
  return 'default';
};

const familyLabel = (family: AgendaFamily): string => {
  switch (family) {
    case 'housing_rents': return 'στέγη και κόστος ζωής';
    case 'housing_programs': return 'εφαρμογή στεγαστικής πολιτικής';
    case 'airbnb': return 'τουριστική οικονομία και κατοικία';
    case 'labor_wages': return 'εργασία, εισόδημα και αξιοπρέπεια';
    case 'precarity': return 'εργασιακή προοπτική και νέα γενιά';
    case 'tax': return 'φορολογική δικαιοσύνη και σχέση κράτους-πολίτη';
    case 'wildfire': return 'πρόληψη, προστασία και κρατική επάρκεια';
    case 'energy': return 'ενεργειακό κόστος και ασφάλεια';
    case 'benefits': return 'κοινωνική προστασία και αγοραστική δύναμη';
    case 'consumer_prices': return 'ακρίβεια, αγορά και καθημερινή αντοχή';
    case 'institutions': return 'θεσμική εμπιστοσύνη και δημοκρατική λειτουργία';
    case 'health': return 'δημόσια υγεία και κρατική ικανότητα';
    case 'education': return 'εκπαίδευση, κοινωνική κινητικότητα και δημόσια εμπιστοσύνη';
    default: return 'πολιτική επιλογή και κοινωνική επίπτωση';
  }
};

const hasExactProminenceSignal = (cluster: AgendaCluster): boolean => {
  const bridge = signalBridgeOf(cluster);
  return Boolean(bridge.uses_editorial_prominence_signals) && !Boolean(bridge.parent_only_editorial_prominence) && n(bridge.editorial_signal_count) > 0;
};

const hasParentProminenceSignal = (cluster: AgendaCluster): boolean => {
  const bridge = signalBridgeOf(cluster);
  return Boolean(bridge.uses_editorial_prominence_signals) && Boolean(bridge.parent_only_editorial_prominence) && n(bridge.editorial_signal_count) > 0;
};

const evidencePoints = (cluster: AgendaCluster) => {
  const points = researchContextOf(cluster)?.evidence_points;
  return Array.isArray(points) ? points : [];
};

const strongestPoint = (cluster: AgendaCluster, source?: string) => {
  const points = evidencePoints(cluster)
    .filter((point) => !source || safeText(point.source) === source)
    .map((point) => ({
      source: safeText(point.source),
      label: cleanSentence(point.label),
      group: cleanSentence(point.group),
      value: n(point.value, NaN),
      confidence: cleanSentence(point.confidence),
    }))
    .filter((point) => point.label && Number.isFinite(point.value));

  const confidenceWeight = (value: string) => value === 'high' ? 3 : value === 'medium' ? 2 : 1;
  return points.sort((a, b) =>
    confidenceWeight(b.confidence) - confidenceWeight(a.confidence) ||
    Math.abs(50 - b.value) - Math.abs(50 - a.value)
  )[0] || null;
};

const confidencePhrase = (cluster: AgendaCluster): string => {
  const sourceCount = n(cluster.source_count);
  const articleCount = n(cluster.article_count);
  const eventCount = n(cluster.event_count);
  const score = n(cluster.score);
  if (sourceCount >= 4 || articleCount >= 8 || score >= 78) return 'στερεή εικόνα';
  if (sourceCount >= 2 || articleCount >= 3 || eventCount >= 2 || score >= 58) return 'σχηματισμένη εικόνα';
  return 'πρώτη εικόνα';
};

const interpretPatternSignals = (cluster: AgendaCluster, family: AgendaFamily): PatternSignals => {
  const publicPoint = strongestPoint(cluster, 'public_opinion');
  const leaderPoint = strongestPoint(cluster, 'leader_traits');
  const votePoint = strongestPoint(cluster, 'vote_intention');

  const publicLabel = normalize(publicPoint?.label);
  const publicGroup = cleanSentence(publicPoint?.group);
  const publicValue = publicPoint?.value ?? null;
  const hasLowTrust = publicLabel.includes('εμπιστοσυν') || publicLabel.includes('κοινοβουλ') || (publicValue !== null && publicValue < 45);
  const hasEconomic = publicLabel.includes('οικονομ') || publicLabel.includes('εισοδη') || publicLabel.includes('κοστο') || ['labor_wages', 'consumer_prices', 'housing_rents', 'energy', 'tax'].includes(family);
  const hasDemocracy = publicLabel.includes('δημοκρατ') || publicLabel.includes('θεσμ');

  const audienceHint = publicGroup && publicGroup !== 'all' && publicGroup !== 'σύνολο κοινού'
    ? `ιδίως σε κοινά όπως ${publicGroup}`
    : 'σε κοινά που νιώθουν ότι η καθημερινή τους πίεση δεν εκπροσωπείται πειστικά';

  const trustPattern = hasLowTrust || hasDemocracy
    ? 'Η βάση εκτίμησης δείχνει κενό εμπιστοσύνης: το κοινό δεν αρκείται σε ηθική καταγγελία και ζητά απόδειξη ότι υπάρχει εφαρμόσιμη πολιτική ικανότητα.'
    : 'Η βάση εκτίμησης δείχνει ότι η πειθώ θα κριθεί λιγότερο από την ένταση και περισσότερο από το αν το κόμμα μπορεί να συνδέσει πρόβλημα, αιτία και λύση.';

  const economicExpectationPattern = hasEconomic
    ? 'Το οικονομικό μοτίβο είναι καθαρό: όταν η ανάπτυξη ή οι δείκτες δεν μεταφράζονται σε σταθερή ζωή, το κοινό ανταποκρίνεται σε πλαίσιο που μιλά για εισόδημα, προβλεψιμότητα και δίκαιη κατανομή.'
    : 'Το μοτίβο προσδοκιών δεν ευνοεί αφηρημένες τοποθετήσεις· ευνοεί θέσεις που δείχνουν πώς η πολιτική επιλογή αλλάζει πρακτικά την καθημερινότητα.';

  const democracyPattern = hasDemocracy
    ? 'Το θεσμικό υπόβαθρο βαραίνει: η υπόθεση μπορεί να γίνει τεστ δημοκρατικής αξιοπιστίας, όχι μόνο διαχείρισης επικαιρότητας.'
    : 'Το θεσμικό στοιχείο υπάρχει ως υπόστρωμα: η αξιοπιστία χτίζεται όταν η στάση δείχνει κανόνες, εφαρμογή και λογοδοσία.';

  const leaderFit = leaderPoint
    ? 'Η ηγετική εικόνα που χρειάζεται να φανεί δεν είναι απλώς ενσυναίσθηση· είναι σοβαρότητα, ικανότητα εφαρμογής και αίσθηση ότι το πρόβλημα έχει πολιτική λύση.'
    : 'Η ηγετική διάσταση πρέπει να μείνει μετρημένη: πρώτα καθαρή γραμμή και μετά προσωποποίηση, μόνο αν το θέμα αποκτήσει κεντρική βαρύτητα.';

  const votePressure = votePoint
    ? 'Υπάρχει και κομματικό υπόβαθρο: το θέμα μπορεί να λειτουργήσει ως γέφυρα μόνο αν δεν ακουστεί σαν μηχανική αντιπολίτευση.'
    : '';

  return {
    trustPattern,
    economicExpectationPattern,
    democracyPattern,
    leaderFit,
    audiencePressure: stripRepeatedWhitespace(`Η πίεση βρίσκεται ${audienceHint}: δεν ζητούν μόνο αναγνώριση του προβλήματος, αλλά πειστική εξήγηση για το ποιος αλλάζει τους όρους. ${votePressure}`),
    patternStrength: confidencePhrase(cluster),
  };
};

const affectedAudienceFor = (cluster: AgendaCluster, family: AgendaFamily): { primary: string; secondary: string; emotionalDriver: string } => {
  const ctx = researchContextOf(cluster);
  const lensAudiences = asTextList(ctx?.party_lens?.core_audiences).slice(0, 3);
  const contextAudience = cleanSentence(ctx?.audience_reading);

  const fallback = (() => {
    switch (family) {
      case 'housing_rents':
      case 'housing_programs':
        return { primary: 'νέοι, ενοικιαστές, νέα ζευγάρια και νοικοκυριά που πιέζονται από τη στέγη', secondary: 'μεσαία τάξη που βλέπει τη στέγη ως όριο κοινωνικής ανόδου', emotionalDriver: 'αίσθηση ότι η ζωή δεν μπορεί να σχεδιαστεί με ασφάλεια' };
      case 'labor_wages':
        return { primary: 'εργαζόμενοι, εποχικοί, νέοι μισθωτοί και νοικοκυριά που συνδέουν μισθό με κόστος ζωής', secondary: 'μεσαία στρώματα που φοβούνται ότι η ανάπτυξη δεν επιστρέφει ως σταθερότητα', emotionalDriver: 'αίσθηση αποκλεισμού από το μέρισμα της ανάπτυξης' };
      case 'precarity':
        return { primary: 'νέοι εργαζόμενοι, άνεργοι, επισφαλείς και πτυχιούχοι χωρίς καθαρή προοπτική', secondary: 'οικογένειες που χρηματοδοτούν την αναμονή της νέας γενιάς', emotionalDriver: 'κούραση από την υπόσχεση προόδου χωρίς ορατή διαδρομή' };
      case 'consumer_prices':
      case 'energy':
        return { primary: 'νοικοκυριά με πιεσμένο εισόδημα, μικρές επιχειρήσεις και καταναλωτές που μετρούν καθημερινά το κόστος', secondary: 'μεσαία τάξη που αισθάνεται ότι χάνει έλεγχο πάνω στον προϋπολογισμό της', emotionalDriver: 'αίσθηση αδικίας όταν οι τιμές μοιάζουν ανεξέλεγκτες' };
      case 'tax':
        return { primary: 'μεσαία τάξη, ελεύθεροι επαγγελματίες, μικρές επιχειρήσεις και φορολογούμενοι που ζητούν δίκαιους κανόνες', secondary: 'εργαζόμενοι που συνδέουν φορολογία με ανταποδοτικότητα και δημόσιες υπηρεσίες', emotionalDriver: 'ανάγκη προβλεψιμότητας και δίκαιης μεταχείρισης από το κράτος' };
      case 'institutions':
        return { primary: 'πολίτες με χαμηλή εμπιστοσύνη στους θεσμούς και δημοκρατικά ευαίσθητα κοινά', secondary: 'κεντρώα και προοδευτικά κοινά που ζητούν σοβαρότητα και λογοδοσία', emotionalDriver: 'κόπωση από την αίσθηση ατιμωρησίας ή θεσμικής αδυναμίας' };
      default:
        return { primary: 'πολίτες που βιώνουν άμεσα την καθημερινή επίπτωση του θέματος', secondary: 'κοινά που δεν έχουν ακόμη αποφασίσει αν το θέμα είναι πολιτικά σημαντικό', emotionalDriver: 'ανάγκη να μετατραπεί η ενόχληση σε καθαρή πολιτική επιλογή' };
    }
  })();

  return {
    primary: contextAudience || fallback.primary,
    secondary: lensAudiences.length ? lensAudiences.join(', ') : fallback.secondary,
    emotionalDriver: fallback.emotionalDriver,
  };
};

const eventMeaningFor = (cluster: AgendaCluster, event: AgendaEvent, family: AgendaFamily): string => {
  const title = eventTitleForText(event);
  const raw = normalize(`${event.title} ${cluster.micro_agenda} ${cluster.parent_topic || ''}`);

  if (raw.includes('απεργ') && (raw.includes('τουρισ') || raw.includes('επισιτισ'))) {
    return `${title} δεν είναι στενή κλαδική κινητοποίηση. Είναι τεστ για το αν το αφήγημα της τουριστικής ανάπτυξης αντέχει όταν συγκριθεί με τη ζωή όσων την παράγουν.`;
  }
  if (raw.includes('απεργ')) {
    return `${title} δεν είναι μόνο εργασιακή διαμαρτυρία. Είναι πολιτικό σήμα για το αν η εργασία μπορεί να δώσει αξιοπρεπή ζωή και όχι απλώς συμμετοχή σε μια οικονομία που πιέζει.`;
  }
  if (raw.includes('ανακαιν')) {
    return `${title} δεν κρίνεται ως απλή ανακοίνωση προγράμματος. Κρίνεται ως τεστ εφαρμογής: ποιος μπαίνει, πόσο γρήγορα ωφελείται και αν η πολιτική αλλάζει πραγματικά την πρόσβαση σε κατοικία.`;
  }

  switch (family) {
    case 'housing_rents': return `${title} μετατρέπει τη στέγη από ατομική δυσκολία σε πολιτικό μέτρο κοινωνικής ασφάλειας και προοπτικής ζωής.`;
    case 'housing_programs': return `${title} δοκιμάζει αν η στεγαστική πολιτική μπορεί να περάσει από την εξαγγελία σε μετρήσιμο αποτέλεσμα.`;
    case 'airbnb': return `${title} βάζει την τουριστική οικονομία απέναντι στο δικαίωμα κατοικίας και ζητά κανόνα ισορροπίας, όχι απλή σύγκρουση.`;
    case 'labor_wages': return `${title} κάνει την εργασία πολιτικό μέτρο της καθημερινότητας: εισόδημα, δικαιώματα, κόστος ζωής και αξιοπρέπεια μπαίνουν στο ίδιο ερώτημα.`;
    case 'precarity': return `${title} δείχνει αν η νέα γενιά βλέπει διαδρομή ζωής ή απλώς παράταση αναμονής.`;
    case 'tax': return `${title} αγγίζει τον πυρήνα της σχέσης πολίτη-κράτους: δίκαιοι κανόνες, προβλεψιμότητα και ανταπόδοση.`;
    case 'consumer_prices': return `${title} μεταφέρει την ακρίβεια από παράπονο καθημερινότητας σε ερώτημα κρατικής πίεσης πάνω στην αγορά.`;
    case 'energy': return `${title} κάνει την ενέργεια ζήτημα καθημερινής αντοχής για νοικοκυριά και παραγωγή, όχι τεχνική συζήτηση.`;
    case 'institutions': return `${title} λειτουργεί ως τεστ θεσμικής εμπιστοσύνης: αν οι κανόνες ισχύουν, αν υπάρχει λογοδοσία και αν η πολιτική μιλά με σοβαρότητα.`;
    case 'health': return `${title} δεν αφορά μόνο υπηρεσία υγείας. Αφορά την ικανότητα του κράτους να κρατά ανθρώπους, υποδομές και αξιοπιστία σε κρίσιμη δημόσια λειτουργία.`;
    case 'education': return `${title} δεν είναι μόνο εκπαιδευτικό ζήτημα. Είναι ερώτημα κοινωνικής κινητικότητας, εμπιστοσύνης και προοπτικής για οικογένειες και νέους.`;
    default: return `${title} αποκτά πολιτικό βάρος επειδή συνδέεται με τη μικροατζέντα «${cluster.micro_agenda}» και μπορεί να μετακινήσει τη δημόσια συζήτηση από περιστατικό σε επιλογή πολιτικής.`;
  }
};

const microAgendaMeaningFor = (cluster: AgendaCluster, family: AgendaFamily): string => {
  const topic = cluster.micro_agenda;
  switch (family) {
    case 'housing_rents': return `Η μικροατζέντα «${topic}» αφορά την ασφάλεια ζωής: αν η εργασία και το εισόδημα αρκούν για πρόσβαση σε σπίτι.`;
    case 'housing_programs': return `Η μικροατζέντα «${topic}» αφορά την αξιοπιστία εφαρμογής: αν οι δημόσιες παρεμβάσεις φτάνουν στον πολίτη ή μένουν ανακοίνωση.`;
    case 'labor_wages': return `Η μικροατζέντα «${topic}» αφορά τη δίκαιη ανάπτυξη: ποιος παράγει αξία, ποιος παίρνει το μέρισμα και ποιος μένει σε επισφάλεια.`;
    case 'consumer_prices': return `Η μικροατζέντα «${topic}» αφορά την καθημερινή αγοραστική δύναμη και το αν το κράτος μπορεί να επιβάλει διαφάνεια στην αγορά.`;
    case 'tax': return `Η μικροατζέντα «${topic}» αφορά τη δικαιοσύνη των κανόνων και την εμπιστοσύνη ότι το κράτος δεν μεταφέρει άνισα τα βάρη.`;
    case 'institutions': return `Η μικροατζέντα «${topic}» αφορά το επίπεδο εμπιστοσύνης στους θεσμούς και το αν υπάρχει σοβαρή δημοκρατική λογοδοσία.`;
    default: return `Η μικροατζέντα «${topic}» είναι το πολιτικό πλαίσιο που δίνει νόημα στο γεγονός και δείχνει τι πρέπει να παρακολουθείται.`;
  }
};

const classifyAgendaRole = (cluster: AgendaCluster, event: AgendaEvent): { role: AgendaRole; text: string } => {
  const eventCount = n(cluster.event_count);
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const score = n(event.event_score, n(cluster.score));
  const title = normalize(event.title);

  if (title.includes('κυβερνη') || title.includes('υπουργ') || title.includes('βουλη')) return { role: 'eliteCue', text: 'Το γεγονός λειτουργεί ως σήμα κορυφής: μετακινεί το θέμα από κοινωνική πίεση σε επίσημη πολιτική αντιπαράθεση.' };
  if (title.includes('απεργ') || title.includes('σωματει') || title.includes('εργαζομ')) return { role: 'grassrootsCue', text: 'Το γεγονός λειτουργεί ως κοινωνικό σήμα βάσης: δίνει πρόσωπο και πίεση σε μια ήδη υπαρκτή μικροατζέντα.' };
  if (eventCount >= 4 || score >= 82) return { role: 'escalationSignal', text: 'Το γεγονός δείχνει κλιμάκωση: η μικροατζέντα περνά από παρακολούθηση σε πιθανή πολιτική προτεραιότητα.' };
  if (sourceCount >= 3 || eventCount >= 2) return { role: 'proofPoint', text: 'Το γεγονός λειτουργεί ως απόδειξη μέσα σε ευρύτερο μοτίβο, όχι ως απομονωμένη είδηση.' };
  if (score < 45 && sourceCount <= 1) return { role: 'lowValueRepeat', text: 'Το γεγονός είναι ακόμη πρώτο σήμα και χρειάζεται προσοχή πριν πάρει μεγαλύτερο πολιτικό βάρος.' };
  return { role: 'leadSignal', text: 'Το γεγονός είναι αρχικό σήμα που μπορεί να ανοίξει πολιτικό πλαίσιο αν συνδεθεί με ευρύτερη εμπειρία κοινού.' };
};

const historicalPatternFor = (family: AgendaFamily): string => {
  switch (family) {
    case 'labor_wages': return 'Σε περιόδους όπου η οικονομία εμφανίζει θετικούς δείκτες αλλά μεγάλα τμήματα νιώθουν πίεση κόστους ζωής, τα εργασιακά γεγονότα δεν λειτουργούν ως στενά συνδικαλιστικά θέματα. Λειτουργούν ως τεστ δικαιοσύνης της ανάπτυξης.';
    case 'housing_rents':
    case 'housing_programs': return 'Όταν η στέγη γίνεται όριο ζωής για νεότερες και μεσαίες ομάδες, η πολιτική συζήτηση δεν κερδίζεται με συμπόνια. Κερδίζεται με αίσθηση εφαρμογής, πρόσβασης και δίκαιης προτεραιότητας.';
    case 'consumer_prices':
    case 'energy': return 'Όταν η καθημερινή δαπάνη ανεβαίνει πιο γρήγορα από την αίσθηση εισοδηματικής ασφάλειας, το κοινό ακούει λιγότερο τους δείκτες και περισσότερο όποιον εξηγεί πώς πιέζεται πραγματικά η αγορά.';
    case 'tax': return 'Στα φορολογικά θέματα, η πολιτική εμπιστοσύνη χτίζεται όταν ο πολίτης καταλαβαίνει ποιος πληρώνει, γιατί πληρώνει και τι επιστρέφει ως δημόσια αξία.';
    case 'institutions': return 'Σε θέματα θεσμών, η υπερβολική ένταση συχνά μειώνει την αξιοπιστία. Η πολιτική αξία ανεβαίνει όταν η στάση δείχνει κανόνες, ευθύνη και καθαρή αποκατάσταση εμπιστοσύνης.';
    default: return 'Το ιστορικό μοτίβο είναι ότι ένα γεγονός αποκτά διάρκεια όταν συνδέεται με ευρύτερη καθημερινή εμπειρία και όχι όταν μένει ως σχόλιο επικαιρότητας.';
  }
};

const politicalQuestionFor = (family: AgendaFamily): string => {
  switch (family) {
    case 'labor_wages': return 'Η ανάπτυξη παράγει αξιοπρεπή ζωή για όσους τη δουλεύουν ή μόνο θετικούς δείκτες;';
    case 'housing_rents':
    case 'housing_programs': return 'Μπορεί ένας νέος ή ένα νοικοκυριό να σχεδιάσει ζωή με πρόσβαση σε αξιοπρεπή κατοικία;';
    case 'consumer_prices': return 'Ποιος μπορεί να πιέσει την αγορά ώστε η ακρίβεια να μην είναι μόνιμη συνθήκη;';
    case 'energy': return 'Ποιος εγγυάται κόστος ενέργειας που δεν διαλύει νοικοκυριά και παραγωγή;';
    case 'tax': return 'Είναι οι κανόνες δίκαιοι, προβλέψιμοι και ανταποδοτικοί ή απλώς εισπρακτικοί;';
    case 'institutions': return 'Υπάρχει θεσμική λογοδοσία που αποκαθιστά εμπιστοσύνη ή μόνο πολιτική διαχείριση εντυπώσεων;';
    default: return 'Ποια πολιτική επιλογή αλλάζει την καθημερινή εμπειρία πίσω από αυτό το γεγονός;';
  }
};

const interpretPartyFit = (cluster: AgendaCluster, family: AgendaFamily, pattern: PatternSignals): PartyFit => {
  const ctx = researchContextOf(cluster);
  const label = partyLabelOf(cluster);
  const party = partyArticle(label);
  const opportunity = cleanSentence(ctx?.party_lens?.opportunity_frame);
  const risk = cleanSentence(ctx?.party_lens?.risk_frame || ctx?.party_lens?.risk_to_avoid);
  const advisor = cleanSentence(ctx?.party_lens?.advisor_instructions);
  const redLines = asTextList(ctx?.party_lens?.red_lines);

  if (isElasProfile(cluster)) {
    return {
      label,
      partyFit: `Για ${party}, το θέμα αξίζει μόνο αν δείχνει νέα προοδευτική κυβερνητική επάρκεια: κοινωνική δικαιοσύνη με εργαλεία εφαρμογής, όχι επιστροφή σε γνώριμο καταγγελτικό ύφος.`,
      partyOpportunity: 'Η ευνοϊκή διάσταση είναι να συνδεθεί η κοινωνική πίεση με σοβαρή εναλλακτική διακυβέρνηση. Το θέμα πρέπει να ανοίξει γέφυρα με εργαζόμενους, νέους, πιεσμένη μεσαία τάξη και απογοητευμένα προοδευτικά κοινά, χωρίς να μοιάσει ανακύκλωση παλιού πολιτικού κύκλου.',
      partyRisk: 'Ο κίνδυνος είναι να ακουστεί ως παλιά αντιπολιτευτική αντανακλαστική κίνηση: σωστή αγανάκτηση, αλλά χωρίς πειστική κυβερνησιμότητα.',
      credibilityCondition: 'Η προϋπόθεση αξιοπιστίας είναι να υπάρχει καθαρό “πώς”: κανόνες, εφαρμογή, κόστος, ωφελούμενοι και δείκτης αποτελέσματος. Χωρίς αυτά, η κοινωνική γραμμή μικραίνει.',
      spokespersonLevel: 'Πρώτα πολιτικό στέλεχος με γνώση πεδίου και κυβερνητική γλώσσα. Ο αρχηγός μπαίνει μόνο αν το θέμα ανέβει από κλαδικό σήμα σε κεντρικό τεστ οικονομικής ή θεσμικής δικαιοσύνης.',
    };
  }

  const familyFit = (() => {
    switch (family) {
      case 'labor_wages': return `Για ${party}, το θέμα έχει αξία αν η εργασία παρουσιαστεί ως υπόθεση εισοδήματος, παραγωγής και αξιοπρεπούς ζωής, όχι ως απλή δήλωση συμπαράστασης.`;
      case 'housing_rents':
      case 'housing_programs': return `Για ${party}, το θέμα έχει αξία αν η στέγη εμφανιστεί ως υπόθεση κοινωνικής ασφάλειας και εφαρμοσμένης πολιτικής, όχι ως γενική ευαισθησία.`;
      case 'tax': return `Για ${party}, το θέμα έχει αξία αν ακουστεί ως δίκαιη σχέση κράτους-πολίτη με κανόνες και ανταπόδοση, όχι ως τεχνική φορολογική αντιπαράθεση.`;
      default: return `Για ${party}, το θέμα έχει αξία μόνο αν μετατραπεί από αντίδραση στην επικαιρότητα σε καθαρή πολιτική κρίση με εφαρμόσιμη διαδρομή.`;
    }
  })();

  return {
    label,
    partyFit: familyFit,
    partyOpportunity: opportunity ? 'Η ευνοϊκή διάσταση είναι να μεταφραστεί το υπάρχον στρατηγικό πλαίσιο του κόμματος σε συγκεκριμένη απάντηση, όχι να παρατεθεί ως σύνθημα.' : 'Η ευνοϊκή διάσταση είναι να δείξει ότι αναγνωρίζει την κοινωνική πίεση και έχει διαδρομή λύσης.',
    partyRisk: risk || (redLines.length ? `Ο κίνδυνος είναι να ενεργοποιηθούν οι κόκκινες γραμμές του προφίλ: ${redLines.slice(0, 2).join(' και ')}.` : 'Ο κίνδυνος είναι να μείνει η τοποθέτηση γενική και να μην παράγει αίσθηση ικανότητας.'),
    credibilityCondition: advisor ? `Η προϋπόθεση αξιοπιστίας είναι να εφαρμοστεί η οδηγία στρατηγικής ως πολιτική κρίση και όχι ως φραστικό δάνειο: ${advisor}.` : pattern.trustPattern,
    spokespersonLevel: 'Το επίπεδο παρέμβασης πρέπει να ακολουθήσει τη βαρύτητα του σήματος: όχι κορυφή πριν φανεί κεντρική δυναμική, όχι καθυστέρηση αν το θέμα αρχίσει να καθορίζει την ατζέντα.',
  };
};

const persuasionRouteFor = (family: AgendaFamily): { route: string; frame: string; trap: string; move: string } => {
  switch (family) {
    case 'labor_wages': return { route: 'Η διαδρομή νίκης είναι να φύγει η συζήτηση από το στενό “εργασιακή διαμαρτυρία” και να πάει στο “ποιος παίρνει το μέρισμα της ανάπτυξης”.', frame: 'Ανάπτυξη που φαίνεται στον μισθό, στη σταθερότητα και στην αξιοπρέπεια της εργασίας.', trap: 'Η παγίδα είναι η απλή ανακοίνωση συμπαράστασης. Δίνει μικρό σήμα, θυμίζει παλιό reflex και δεν αποδεικνύει κυβερνητική ικανότητα.', move: 'Κίνηση αναδιάταξης: πλαίσιο δίκαιης ανάπτυξης με συγκεκριμένα εργαλεία για εισόδημα, ελέγχους, εποχικότητα και προβλεψιμότητα.' };
    case 'housing_rents':
    case 'housing_programs': return { route: 'Η διαδρομή νίκης είναι να φύγει η συζήτηση από το “υπάρχει πρόβλημα στέγης” και να πάει στο “ποιος μπορεί να ανοίξει πραγματική πρόσβαση σε σπίτι”.', frame: 'Στέγη ως προϋπόθεση ζωής, εργασίας και οικογένειας, με εφαρμογή που μετριέται.', trap: 'Η παγίδα είναι η γενική συμπόνια για τα ενοίκια ή τα προγράμματα χωρίς αίσθηση εφαρμογής.', move: 'Κίνηση αναδιάταξης: συγκεκριμένη γραμμή πρόσβασης, ταχύτητας, δικαιούχων και ελέγχου αποτελέσματος.' };
    case 'consumer_prices':
    case 'energy': return { route: 'Η διαδρομή νίκης είναι να φύγει η συζήτηση από την περιγραφή της πίεσης και να πάει στο ποιος μπορεί να βάλει κανόνες στην αγορά.', frame: 'Καθημερινή αγοραστική δύναμη με διαφάνεια, έλεγχο και πραγματικό αποτέλεσμα στον λογαριασμό.', trap: 'Η παγίδα είναι να γίνει ακόμη μία γενική καταγγελία για την ακρίβεια χωρίς μηχανισμό πίεσης.', move: 'Κίνηση αναδιάταξης: στοχευμένη πίεση στην αγορά, με σαφή ευθύνη κράτους, ελέγχων και ανταγωνισμού.' };
    case 'tax': return { route: 'Η διαδρομή νίκης είναι να μετακινηθεί η συζήτηση από αριθμούς σε δικαιοσύνη κανόνων και ανταποδοτικότητα.', frame: 'Φορολογία που είναι δίκαιη, προβλέψιμη και επιστρέφει ως δημόσια αξία.', trap: 'Η παγίδα είναι να χαθεί το θέμα σε τεχνικές λεπτομέρειες ή να ακουστεί ως εύκολη υπόσχεση χωρίς κόστος.', move: 'Κίνηση αναδιάταξης: καθαρή αρχή δικαιοσύνης, ποιος πληρώνει, ποιος ελαφρύνεται και τι αλλάζει στην πράξη.' };
    case 'institutions': return { route: 'Η διαδρομή νίκης είναι να φύγει η συζήτηση από την κομματική ένταση και να πάει στην αποκατάσταση εμπιστοσύνης με κανόνες.', frame: 'Θεσμική σοβαρότητα, λογοδοσία και δημοκρατική αξιοπιστία.', trap: 'Η παγίδα είναι η υπερβολή που κάνει το θέμα να φαίνεται εργαλειακό.', move: 'Κίνηση αναδιάταξης: θεσμικό πλαίσιο με καθαρή ευθύνη, συγκεκριμένη αλλαγή και μετρημένη γλώσσα.' };
    default: return { route: 'Η διαδρομή νίκης είναι να περάσει το γεγονός από την περιγραφή του προβλήματος σε καθαρή επιλογή πολιτικής.', frame: 'Πρόβλημα, αιτία, ευθύνη και εφαρμόσιμη λύση σε μία συνεκτική γραμμή.', trap: 'Η παγίδα είναι να μείνει η τοποθέτηση γενική και να μην παράγει νέα κατανόηση.', move: 'Κίνηση αναδιάταξης: καθαρή πολιτική ανάγνωση με συγκεκριμένη απόφαση και όχι απλή αντίδραση.' };
  }
};

const timingFor = (cluster: AgendaCluster, event: AgendaEvent, role: AgendaRole): string => {
  const score = n(event.event_score, n(cluster.score));
  const eventCount = n(cluster.event_count);
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const trend = n(cluster.real_trend_score ?? cluster.search_interest_score);
  const hasProminence = hasExactProminenceSignal(cluster) || hasParentProminenceSignal(cluster);
  if (score >= 78 || hasProminence || eventCount >= 4) return 'Το timing είναι άμεσο: όχι απαραίτητα με μέγιστη ένταση, αλλά με γρήγορη πλαισίωση πριν κλειδώσει η δημόσια ανάγνωση από άλλους.';
  if (role === 'grassrootsCue' && (sourceCount >= 2 || trend >= 35)) return 'Το timing είναι πρώτο κύμα με μέτρο: να μπει πλαίσιο τώρα και να κρατηθεί χώρος για κλιμάκωση αν υπάρξει κυβερνητική αντίδραση ή νέα κοινωνική συμμετοχή.';
  if (score < 55 && sourceCount <= 1) return 'Το timing είναι ελεγχόμενη αναμονή: όχι σιωπή, αλλά προετοιμασία δεύτερου κύματος μέχρι να υπάρξει ισχυρότερη βάση εκτίμησης.';
  return 'Το timing είναι επιλεκτική παρέμβαση: αρκετή για να ορίσει πλαίσιο, όχι τόσο βαριά ώστε να κάψει θέμα που ακόμη σχηματίζεται.';
};

const buildReassessmentSignals = (cluster: AgendaCluster, event: AgendaEvent, family: AgendaFamily): string[] => {
  const title = eventTitleForText(event);
  const signals: string[] = [];
  signals.push(`Αλλάζει η εκτίμηση αν το ${title} συνδεθεί με δεύτερο ανεξάρτητο κοινωνικό ή θεσμικό σήμα.`);
  signals.push('Ανεβαίνει προτεραιότητα αν υπάρξει κυβερνητική απάντηση που δείχνει άμυνα, καθυστέρηση ή υποτίμηση του προβλήματος.');
  if (['labor_wages', 'precarity'].includes(family)) signals.push('Ανεβαίνει επίπεδο αν μπει δεύτερο σωματείο, άλλος κλάδος ή εικόνα ευρύτερης εργασιακής πίεσης.');
  if (['housing_rents', 'housing_programs'].includes(family)) signals.push('Αλλάζει timing αν εμφανιστεί νέο στοιχείο για δικαιούχους, απορρόφηση, αποκλεισμούς ή πραγματική πρόσβαση σε κατοικία.');
  if (['consumer_prices', 'energy'].includes(family)) signals.push('Ανεβαίνει ρίσκο και δυναμική αν το θέμα δεθεί με νέο κύμα τιμών ή μετρήσιμη πίεση σε νοικοκυριά και μικρές επιχειρήσεις.');
  if (['institutions', 'tax'].includes(family)) signals.push('Αλλάζει η γραμμή αν μπει θεσμικός παίκτης, νέα τεκμηρίωση ή στοιχείο που κάνει το θέμα ζήτημα λογοδοσίας.');
  if (hasExactProminenceSignal(cluster) || hasParentProminenceSignal(cluster)) signals.push('Η διατήρηση υψηλής εκδοτικής ανάδειξης μετατρέπει το θέμα από παρακολούθηση σε πεδίο άμεσης πολιτικής τοποθέτησης.');
  if (n(cluster.real_trend_score ?? cluster.search_interest_score) >= 45) signals.push('Αν ο δημόσιος παλμός συνεχίσει να ανεβαίνει, χρειάζεται πιο καθαρή και κεντρική παρέμβαση.');
  else signals.push('Αν ο δημόσιος παλμός δεν ακολουθήσει, κρατάμε το θέμα ως υλικό δεύτερου κύματος και όχι ως κεντρική σύγκρουση.');
  return unique(signals).slice(0, 5);
};

const actionProbability = (cluster: AgendaCluster, event: AgendaEvent, base: number): number => {
  const score = n(event.event_score, n(cluster.score));
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const eventCount = n(cluster.event_count);
  return clamp(base + Math.min(10, sourceCount * 2) + Math.min(8, eventCount * 2) + (score >= 75 ? 8 : score >= 55 ? 3 : -4), 12, 86);
};

const buildAdvisorCase = (cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): AdvisorCase => {
  const family = agendaFamily(cluster);
  const pattern = interpretPatternSignals(cluster, family);
  const audience = affectedAudienceFor(cluster, family);
  const party = interpretPartyFit(cluster, family, pattern);
  const route = persuasionRouteFor(family);
  const role = classifyAgendaRole(cluster, event);
  const timing = timingFor(cluster, event, role.role);
  const politicalQuestion = politicalQuestionFor(family);
  const title = eventTitleForText(event);
  const eventMeaning = eventMeaningFor(cluster, event, family);
  const microAgendaMeaning = microAgendaMeaningFor(cluster, family);
  const historicalPattern = historicalPatternFor(family);
  const recommendedMove = route.move;

  const actionA: ActionOption = {
    key: 'A', title: 'Κίνηση αναδιάταξης', badge: 'Προτεινόμενη',
    body: `${recommendedMove} Η παρέμβαση πρέπει να απαντά στο ερώτημα: ${politicalQuestion}`,
    gain: `${party.partyOpportunity} Κερδίζει επειδή δεν μένει στο γεγονός· αλλάζει το πλαίσιο μέσα στο οποίο θα διαβαστεί.`,
    risk: `Θέλει πειθαρχία στη συγκεκριμενοποίηση. ${party.credibilityCondition}`,
    successProbability: actionProbability(cluster, event, 58), recommended: true, avoid: false,
  };
  const actionB: ActionOption = {
    key: 'B', title: 'Ελεγχόμενη αναμονή', badge: 'Δεύτερο κύμα',
    body: `Δεν εγκαταλείπουμε το ${title}. Κρατάμε έτοιμη γραμμή και περιμένουμε ένα επιπλέον σήμα: κυβερνητική αντίδραση, διεύρυνση σε νέο κοινό, άνοδο δημόσιου παλμού ή νέα τεκμηρίωση.`,
    gain: 'Αποφεύγει υπεραντίδραση και επιτρέπει πιο ώριμη παρέμβαση με καλύτερη βάση εκτίμησης.',
    risk: 'Αν το θέμα επιταχύνει, η πρώτη πλαισίωση μπορεί να περάσει σε άλλους.',
    successProbability: actionProbability(cluster, event, 43), recommended: false, avoid: false,
  };
  const actionC: ActionOption = {
    key: 'Γ', title: 'Κίνηση υψηλού ρίσκου', badge: 'Προς αποφυγή',
    body: `Άμεση υψηλής έντασης αξιοποίηση του ${title}, χωρίς να έχει μετατραπεί πρώτα σε καθαρό πολιτικό ερώτημα.`,
    gain: 'Μπορεί να δώσει γρήγορη προσοχή.',
    risk: `${route.trap} ${party.partyRisk}`,
    successProbability: actionProbability(cluster, event, 18), recommended: false, avoid: true,
  };

  return {
    eventMeaning, microAgendaMeaning, agendaRole: role.role, agendaRoleText: role.text, politicalQuestion,
    affectedAudience: audience.primary, secondaryAudience: audience.secondary, audiencePressure: pattern.audiencePressure,
    emotionalDriver: audience.emotionalDriver, historicalPattern, trustPattern: pattern.trustPattern,
    economicExpectationPattern: pattern.economicExpectationPattern, democracyPattern: pattern.democracyPattern,
    patternStrength: pattern.patternStrength, leaderFit: pattern.leaderFit, partyFit: party.partyFit,
    partyOpportunity: party.partyOpportunity, partyRisk: party.partyRisk, credibilityCondition: party.credibilityCondition,
    persuasionRoute: route.route, winningFrame: route.frame, trap: route.trap, recommendedMove,
    timing, spokespersonLevel: party.spokespersonLevel, actionA, actionB, actionC,
    reassessmentSignals: buildReassessmentSignals(cluster, event, family),
  };
};

const strategicAdvisorBody = (advisorCase: AdvisorCase): string => stripRepeatedWhitespace([
  advisorCase.eventMeaning,
  advisorCase.microAgendaMeaning,
  advisorCase.historicalPattern,
  `Το κοινό που αγγίζει: ${advisorCase.affectedAudience}. Η πίεση δεν είναι μόνο επικοινωνιακή· είναι ${advisorCase.emotionalDriver}.`,
  advisorCase.economicExpectationPattern,
  advisorCase.partyFit,
  advisorCase.partyRisk,
].join(' '));

const whyAdvisorBody = (cluster: AgendaCluster, event: AgendaEvent, advisorCase: AdvisorCase): string => stripRepeatedWhitespace([
  `${eventTitleForText(event)} μπαίνει στην εικόνα όχι επειδή είναι ακόμη ένα επεισόδιο επικαιρότητας, αλλά επειδή λειτουργεί ως ${advisorCase.agendaRoleText.toLowerCase()}`,
  `Η βάση εκτίμησης είναι ${advisorCase.patternStrength}: ${n(cluster.article_count)} ${articleWord(n(cluster.article_count))}, ${n(cluster.source_count)} ${sourceWord(n(cluster.source_count))} και ${n(cluster.event_count)} ${n(cluster.event_count) === 1 ? 'σχετικό γεγονός' : 'σχετικά γεγονότα'} στη μικροατζέντα.`,
  advisorCase.trustPattern,
].join(' '));

const winningAdvisorBody = (advisorCase: AdvisorCase): string => stripRepeatedWhitespace([
  advisorCase.persuasionRoute,
  `Το νικηφόρο πλαίσιο είναι: ${advisorCase.winningFrame}`,
  advisorCase.credibilityCondition,
  advisorCase.timing,
  advisorCase.spokespersonLevel,
].join(' '));

const publicInterestPhrase = (cluster: AgendaCluster): string => {
  const trend = n(cluster.real_trend_score ?? cluster.search_interest_score);
  if (trend >= 70) return 'Ο δημόσιος παλμός είναι υψηλός και μπορεί να μετατρέψει το θέμα σε πεδίο άμεσης πολιτικής σύγκρουσης.';
  if (trend >= 45) return 'Ο δημόσιος παλμός είναι σχηματισμένος και δίνει χώρο σε καθαρή πλαισίωση πριν κλειδώσει η ερμηνεία.';
  if (trend >= 20) return 'Ο δημόσιος παλμός υπάρχει, αλλά ακόμη χρειάζεται σύνδεση με ευρύτερη καθημερινή εμπειρία.';
  return 'Ο δημόσιος παλμός είναι σε αναμονή· το θέμα χρειάζεται παρακολούθηση πριν σηκώσει μεγάλη πολιτική κλιμάκωση.';
};

const getSparklineTone = (cluster: AgendaCluster): AgendaMapItem['sparklineTone'] => {
  const freshness = n(cluster.freshness_score);
  const events = n(cluster.event_count);
  if (freshness >= 80 && events >= 2) return 'rising';
  if (freshness < 45) return 'cooling';
  return 'stable';
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
  if (sourceCount >= 4 || articleCount >= 8) return 'Στερεή βάση εκτίμησης';
  if (sourceCount >= 2 || articleCount >= 3) return 'Σχηματισμένη εικόνα';
  if (documentation === 'medium') return 'Σχηματισμένη εικόνα';
  return 'Πρώτη εικόνα';
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

const EVENT_STOPWORDS = new Set(['κριση', 'νεα', 'νεο', 'στον', 'στην', 'στις', 'στη', 'στο', 'των', 'του', 'της', 'και', 'για', 'απο', 'υψηλα', 'επιπεδα', 'ζητηση', 'ζητησης', 'οικονομικη', 'οικονομικης', 'ασφυξια', 'πλαισια', 'πλαισιο']);

const eventTokenStem = (value: string): string[] => normalize(value).replace(/[^a-zα-ω0-9]+/gi, ' ').split(' ').map((token) => token.trim()).filter((token) => token.length >= 4 && !EVENT_STOPWORDS.has(token)).map((token) => token.slice(0, 6));

const tokenSimilarity = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const left = Array.from(new Set(a));
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = Array.from(new Set(a.concat(b))).length;
  return union ? intersection / union : 0;
};

const compactAgendaEvents = (cluster: AgendaCluster, events: AgendaEvent[]): AgendaEvent[] => {
  const kept: { event: AgendaEvent; stems: string[] }[] = [];
  for (const event of events) {
    const stems = eventTokenStem(event.title || '');
    const duplicate = kept.some((item) => {
      const sameMicro = safeText(item.event.event_micro_agenda_id) && safeText(item.event.event_micro_agenda_id) === safeText(event.event_micro_agenda_id);
      if (!sameMicro) return false;
      return tokenSimilarity(item.stems, stems) >= 0.34;
    });
    if (!duplicate) kept.push({ event, stems });
  }
  return kept.map((item) => item.event).slice(0, 3);
};

export function buildAgendaMap(raw: ProbeV4Response): AgendaMapItem[] {
  const clusters = [...(raw.agenda_clusters ?? []), ...(raw.monitoring_events ?? [])];
  return clusters.filter((cluster) => cluster?.micro_agenda_id && cluster?.micro_agenda).map((cluster) => {
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
      events: compactAgendaEvents(cluster, cluster.top_events ?? []),
      raw: cluster,
    };
  }).sort((a, b) => b.score - a.score);
}

type PriorityCardSignal = { label: string; meaning: string; tone: PriorityCard['tone'] };

function buildPriorityCardSignal(item: AgendaMapItem): PriorityCardSignal {
  const raw = item.raw;
  const score = n(item.score);
  const eventCount = n(raw.event_count);
  const sourceCount = n(raw.source_count);
  const trend = n(raw.real_trend_score ?? raw.search_interest_score);
  const rising = item.sparklineTone === 'rising';
  const cooling = item.sparklineTone === 'cooling';
  const sensitive = Boolean(raw.requires_human_review) || raw.sensitivity_level === 'high';

  if (sensitive) {
    return { label: 'Χρειάζεται προσοχή', meaning: 'Ευαίσθητο θέμα — θέλει προσεκτικό, θεσμικό χειρισμό πριν από δημόσια κίνηση.', tone: 'red' };
  }
  if (rising || trend >= 55) {
    return { label: 'Ανεβαίνει', meaning: 'Κερδίζει δυναμική τώρα: φρέσκα γεγονότα και κάλυψη τις τελευταίες ώρες.', tone: 'red' };
  }
  if (score >= 70 && eventCount >= 2 && sourceCount >= 2) {
    return { label: 'Εδραιωμένο', meaning: 'Σταθερά ισχυρό θέμα με αρκετές πηγές — ήδη στο κέντρο της ατζέντας.', tone: 'yellow' };
  }
  if (cooling) {
    return { label: 'Υποχωρεί', meaning: 'Έχει χάσει ένταση — κράτα το στο ραντάρ χωρίς βιασύνη.', tone: 'green' };
  }
  if (eventCount <= 1 && sourceCount <= 1) {
    return { label: 'Πρώιμο σήμα', meaning: 'Νέο σήμα με λίγη ακόμη τεκμηρίωση — αξίζει παρακολούθηση πριν κινηθείς.', tone: 'green' };
  }
  return { label: 'Στην ατζέντα', meaning: 'Ενεργό θέμα που παρακολουθούμε σήμερα.', tone: 'yellow' };
}

export function buildPriorityCards(raw: ProbeV4Response): PriorityCard[] {
  const eligible = buildAgendaMap(raw).filter((item) => item.raw.show_in_strategy_room !== 'review_required').filter((item) => item.events.length > 0).slice(0, 3);
  return eligible.map((item, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    const signal = buildPriorityCardSignal(item);
    const topEvent = item.events[0];
    return {
      id: item.id,
      rank,
      label: signal.label,
      labelMeaning: signal.meaning,
      title: safeText(topEvent?.title, item.title),
      subtitle: buildPrioritySubtitle(item.raw),
      score: clamp(n(topEvent?.event_score, item.score)),
      statusLabel: item.statusLabel,
      priorityLabel: scoreLabel(item.score),
      actionHint: buildActionHint(item.raw),
      tone: signal.tone,
      raw: item.raw,
    };
  });
}

function buildPrioritySubtitle(cluster: AgendaCluster): string {
  const family = agendaFamily(cluster);
  if (cluster.requires_human_review) return 'Χρειάζεται προσεκτική θεσμική ανάγνωση πριν από δημόσια χρήση.';
  if (n(cluster.event_count) >= 2) return `Η μικροατζέντα για ${familyLabel(family)} έχει αρκετά συγγενή σήματα για σημερινή παρακολούθηση.`;
  return `Το γεγονός μπαίνει στη μικροατζέντα για ${familyLabel(family)} και χρειάζεται καθαρή πρώτη ανάγνωση.`;
}

function buildActionHint(cluster: AgendaCluster): string {
  const family = agendaFamily(cluster);
  if (cluster.requires_human_review) return 'Πρώτα θεσμική ακρίβεια, ανθρώπινος τόνος και αποφυγή εργαλειοποίησης.';
  if (n(cluster.score) >= 75) return `Να οριστεί γρήγορα το πλαίσιο για ${familyLabel(family)}, πριν το κλειδώσουν άλλοι.`;
  if (n(cluster.event_count) <= 1) return 'Παρακολούθηση με έτοιμη γραμμή δεύτερου κύματος.';
  return 'Κράτα το θέμα ενεργό και σύνδεσέ το με το ευρύτερο μοτίβο.';
}

export function buildEventIntelligenceView(cluster: AgendaCluster, event?: AgendaEvent): EventIntelligenceView {
  const selectedEvent = event ?? cluster.top_events?.[0] ?? { title: cluster.micro_agenda, event_score: cluster.score, article_count: cluster.article_count, source_count: cluster.source_count };
  const parentTopics = unique([...(cluster.parent_topics ?? []), safeText(selectedEvent.parent_topic ?? ''), safeText(cluster.parent_topic ?? '')]);
  const sensitiveMode = Boolean(cluster.requires_human_review) || cluster.show_in_strategy_room === 'review_required' || cluster.show_in_strategy_room === 'careful_review' || cluster.sensitivity_level === 'high' || cluster.sensitivity_level === 'medium';
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
  const advisorCase = buildAdvisorCase(cluster, selectedEvent, view);
  view.sections = [
    buildStrategicImageSection(cluster, selectedEvent, view, advisorCase),
    buildOverallImageSection(cluster, selectedEvent, view, advisorCase),
    buildWhyExistsSection(cluster, selectedEvent, view, advisorCase),
    buildSourcesFactorsSection(cluster, selectedEvent, view, advisorCase),
    buildPublicPulseSection(cluster, view, advisorCase),
    buildHowToWinSection(cluster, selectedEvent, view, advisorCase),
    buildActionOptionsSection(cluster, selectedEvent, view, advisorCase),
    buildMaterialSection(cluster, selectedEvent, view, advisorCase),
  ];
  return view;
}

function buildDynamicGauges(cluster: AgendaCluster, event: AgendaEvent): Gauge[] {
  const eventArticles = n(event.article_count, n(cluster.article_count));
  const sourceCount = n(event.source_count, n(cluster.source_count));
  const eventCount = n(cluster.event_count);
  const politicalArticles = n(cluster.political_article_count);
  const searchInterest = n(cluster.real_trend_score ?? cluster.search_interest_score);
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
    { key: 'public_pulse', label: 'Δημόσιος παλμός', value: publicPulse, valueLabel: gaugeLabel(publicPulse), explanation: 'Αναζητήσεις, τάσεις και εξωτερικός δημόσιος παλμός.' },
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
    triggerLines: buildReassessmentSignals(cluster, event, agendaFamily(cluster)),
  };
}

function buildStrategicImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  const body = view.sensitiveMode ? `Το θέμα ανήκει στη μικροατζέντα «${cluster.micro_agenda}» και ζητά προσεκτική, ανθρώπινη ανάγνωση. Η αξία του για το Strategy Room είναι η κατανόηση του θεσμικού και κοινωνικού πλαισίου πριν από οποιαδήποτε δημόσια κλιμάκωση.` : strategicAdvisorBody(advisorCase);
  return { tab: 'strategic_image', label: 'Στρατηγική ανάγνωση', kicker: 'Γεγονός → Μοτίβο → Απόφαση', title: 'Τι σημαίνει πολιτικά', body, bullets: [`Πολιτικό ερώτημα: ${advisorCase.politicalQuestion}`, `Ρόλος γεγονότος: ${advisorCase.agendaRoleText}`, `Βάση εκτίμησης: ${view.evidenceLabel}`] };
}

function buildOverallImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  const eventCount = n(cluster.event_count);
  const articleCount = n(cluster.article_count);
  const sourceCount = n(cluster.source_count);
  return { tab: 'overall_image', label: 'Συνολική εικόνα', kicker: 'Πλαίσιο μικροατζέντας', title: 'Πού ανήκει και τι προσθέτει', body: `${advisorCase.microAgendaMeaning} Η εικόνα σχηματίζεται από ${eventCount} ${eventCount === 1 ? 'γεγονός' : 'γεγονότα'}, ${articleCount} ${articleWord(articleCount)} και ${sourceCount} ${sourceWord(sourceCount)}. Το συγκεκριμένο event προσθέτει κυρίως αυτό: ${advisorCase.eventMeaning}`, bullets: [`Ευρύτερο πλαίσιο: ${view.parentTopics.join(', ') || '—'}`, `Πιο πρόσφατο σήμα: ${formatDate(cluster.newest_article_at ?? event.last_article_at)}`, `Κατεύθυνση: ${getProfessionalStatusLabel(cluster)}`] };
}

function buildWhyExistsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  return { tab: 'why_exists', label: 'Γιατί έχει σημασία', kicker: 'Στρατηγική αιτιολόγηση', title: 'Γιατί μπαίνει στην εικόνα', body: whyAdvisorBody(cluster, event, advisorCase), bullets: [`Μικροατζέντα: ${cluster.micro_agenda}`, `Κοινό που επηρεάζεται: ${advisorCase.affectedAudience}`, `Συναισθηματικός οδηγός: ${advisorCase.emotionalDriver}`, `Σημείο προσοχής: ${advisorCase.partyRisk}`] };
}

function buildSourcesFactorsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  const factors = [advisorCase.historicalPattern, advisorCase.trustPattern, advisorCase.economicExpectationPattern];
  if (hasExactProminenceSignal(cluster)) factors.push('Η υψηλή εκδοτική ανάδειξη δίνει στο θέμα πρόσθετο πολιτικό βάρος και μειώνει τον χρόνο αναμονής.');
  else if (hasParentProminenceSignal(cluster)) factors.push('Η ευρύτερη ατζέντα έχει αυξημένη ανάδειξη και μπορεί να τραβήξει το συγκεκριμένο γεγονός πιο κοντά στο κέντρο.');
  return { tab: 'sources_factors', label: 'Βάση εκτίμησης', kicker: 'Μοτίβα και παράγοντες', title: 'Από τι προκύπτει η ανάγνωση', body: 'Η εκτίμηση δεν πατά σε ωμές γραμμές δεδομένων. Τα στοιχεία μεταφράζονται σε μοτίβο πίεσης, εμπιστοσύνης, προσδοκίας και πολιτικού timing.', bullets: factors };
}

function buildPublicPulseSection(cluster: AgendaCluster, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  const pulse = getPublicPulseLabel(cluster.real_trend_score ?? cluster.search_interest_score);
  return { tab: 'public_pulse', label: 'Δημόσιος παλμός', kicker: 'Προσοχή και κοινωνική ώθηση', title: pulse, body: `${publicInterestPhrase(cluster)} ${advisorCase.audiencePressure}`, gauges: view.gauges };
}

function buildHowToWinSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  if (view.sensitiveMode) return { tab: 'how_to_win', label: 'Πώς χειρίζεται', kicker: 'Προσεκτική λειτουργία', title: 'Θεσμικός και ανθρώπινος χειρισμός', body: 'Η σωστή στάση χτίζεται με σεβασμό, θεσμική σοβαρότητα και καθαρή προστατευτική γλώσσα. Δεν χρειάζεται ένταση πριν σταθεροποιηθεί η βάση εκτίμησης.', bullets: ['Ανθρώπινος τόνος και σεβασμός στα πρόσωπα.', 'Θεσμική ευθύνη, πρόληψη και προστασία.', 'Δημόσια στάση με ακρίβεια και μέτρο.'] };
  return { tab: 'how_to_win', label: 'Πώς κερδίζεται', kicker: 'Διαδρομή νίκης', title: 'Η μετατόπιση που πρέπει να γίνει', body: winningAdvisorBody(advisorCase), bullets: [`Ευνοϊκή διάσταση: ${advisorCase.partyOpportunity}`, `Παγίδα: ${advisorCase.trap}`, `Πλαίσιο νίκης: ${advisorCase.winningFrame}`] };
}

function buildActionOptionsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  return { tab: 'action_options', label: 'Τι κάνουμε τώρα', kicker: 'Τρεις διαδρομές απόφασης', title: 'Επιλογές', body: 'Οι επιλογές δεν είναι παραλλαγές της ίδιας δήλωσης. Είναι τρεις διαφορετικές αποφάσεις: αναδιάταξη, ελεγχόμενη αναμονή ή κίνηση υψηλού ρίσκου.', actions: buildActionOptions(cluster, event, view, advisorCase) };
}

function buildActionOptions(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): ActionOption[] {
  if (view.sensitiveMode) return [
    { key: 'A', title: 'Θεσμική στάση', badge: 'Προτεινόμενη', body: 'Τοποθέτηση μόνο σε επίπεδο θεσμικής ευθύνης, πρόληψης και προστασίας.', gain: 'Δείχνει σοβαρότητα χωρίς εργαλειοποίηση.', risk: 'Χρειάζεται ανθρώπινη διατύπωση για να αποκτήσει βάρος.', successProbability: 65, recommended: true, avoid: false },
    { key: 'B', title: 'Σιωπηλή παρακολούθηση', badge: 'Εναλλακτική', body: 'Εσωτερική παρακολούθηση μέχρι να υπάρξει θεσμική εξέλιξη.', gain: 'Αποφεύγει άστοχη εμπλοκή.', risk: 'Μπορεί να χαθεί θεσμικό timing.', successProbability: 45, recommended: false, avoid: false },
    { key: 'Γ', title: 'Υψηλού ρίσκου αντιπαράθεση', badge: 'Υψηλό ρίσκο', body: 'Επιθετική κομματική γραμμή πάνω στο θέμα.', gain: 'Βραχυπρόθεσμη ένταση.', risk: 'Υψηλό ρίσκο κοινωνικής απόρριψης.', successProbability: 15, recommended: false, avoid: true },
  ];
  return [advisorCase.actionA, advisorCase.actionB, advisorCase.actionC];
}

function buildMaterialSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView, advisorCase: AdvisorCase): IntelligenceSection {
  const material = view.sensitiveMode ? {
    briefing: `Το θέμα «${event.title}» χρειάζεται θεσμική και ανθρώπινη διαχείριση με προστατευτική γλώσσα.`,
    talkingPoints: ['Πρώτα σεβασμός στα πρόσωπα και στα πραγματικά δεδομένα.', 'Η δημόσια στάση να μείνει σε πρόληψη, ευθύνη και θεσμική επάρκεια.', 'Αποφυγή δραματοποίησης και κομματικής εκμετάλλευσης.'],
    suggestedStatement: 'Η δημόσια συζήτηση χρειάζεται σοβαρότητα, σεβασμό και θεσμική ευθύνη. Η προτεραιότητα είναι η προστασία και η πρόληψη.',
    questionForIntervention: 'Ποια θεσμικά βήματα διασφαλίζουν ότι αντίστοιχα περιστατικά αντιμετωπίζονται έγκαιρα και με προστασία των ευάλωτων;',
    internalNote: 'Χρήση μόνο μετά από ανθρώπινη αξιολόγηση και με θεσμικό τόνο.',
  } : {
    briefing: strategicAdvisorBody(advisorCase),
    talkingPoints: [advisorCase.politicalQuestion, advisorCase.winningFrame, advisorCase.credibilityCondition],
    suggestedStatement: `${advisorCase.winningFrame} Το κρίσιμο δεν είναι να περιγράψουμε ακόμη μία φορά το πρόβλημα, αλλά να δείξουμε ποια πολιτική επιλογή αλλάζει τους όρους για τους ανθρώπους που πιέζονται.`,
    questionForIntervention: advisorCase.politicalQuestion,
    socialDraft: `Το θέμα στη μικροατζέντα «${cluster.micro_agenda}» δεν είναι απλή επικαιρότητα. Είναι ερώτημα πολιτικής επιλογής: ${advisorCase.politicalQuestion}`,
    internalNote: `Σήματα επανεκτίμησης: ${advisorCase.reassessmentSignals.join(' ')}`,
  };
  return { tab: 'material', label: 'Σήματα επανεκτίμησης', kicker: 'Τι θα άλλαζε την εκτίμηση', title: 'Πότε αλλάζει η απόφαση', body: 'Η εκτίμηση δεν είναι στατική. Αλλάζει αν εμφανιστούν νέα σήματα που μετακινούν προτεραιότητα, ρίσκο ή timing.', bullets: advisorCase.reassessmentSignals, material };
}

function hasPoliticalActor(title?: string | null): boolean {
  const t = normalize(title);
  return ['κυβερνηση', 'υπουργ', 'μητσοτακ', 'ανδρουλακ', 'συριζ', 'πασοκ', 'νδ', 'βουλη', 'δημαρχ', 'νατο', 'εε', 'κομμα'].some((term) => t.includes(term));
}

function hasChargedLanguage(title?: string | null): boolean {
  const t = normalize(title);
  return ['τραγωδ', 'δυστυχη', 'γυναικοκτον', 'ανηλικ', 'θυμα', 'σοκ', 'βια', 'δολοφον'].some((term) => t.includes(term));
}

function formatDate(value?: string | null): string {
  if (!value) return 'σήμερα';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'σήμερα';
  return date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
