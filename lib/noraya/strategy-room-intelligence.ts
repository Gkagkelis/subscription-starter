// NORAYA Strategy Room intelligence mapping layer
// Version: strategy_room_intelligence_v5_4_strategic_image_synthesis
//
// This file converts agenda-probe data into targeted advisor language.
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

const eventTitleForText = (event?: AgendaEvent | null): string => {
  const title = safeText(event?.title);
  return title ? `«${title}»` : 'το σημερινό γεγονός';
};

const researchContextOf = (cluster: AgendaCluster): AgendaResearchContext | null => {
  const ctx = cluster.research_context;
  return ctx && typeof ctx === 'object' ? ctx : null;
};

const cleanSentence = (value: unknown): string => safeText(value).replace(/\s+/g, ' ').trim();

const researchEvidenceLines = (cluster: AgendaCluster, limit = 3): string[] => {
  const ctx = researchContextOf(cluster);
  if (!ctx?.evidence_lines?.length) return [];
  return ctx.evidence_lines.map(cleanSentence).filter(Boolean).slice(0, limit);
};

const researchLanguage = (cluster: AgendaCluster): string => {
  const ctx = researchContextOf(cluster);
  const words = Array.isArray(ctx?.recommended_language) ? ctx.recommended_language.filter(Boolean).slice(0, 4) : [];
  return words.length ? words.join(', ') : 'σοβαρότητα, πρακτική λύση, ευθύνη';
};


const partyRedLines = (cluster: AgendaCluster, limit = 3): string[] => {
  const ctx = researchContextOf(cluster);
  const redLines = Array.isArray(ctx?.party_lens?.red_lines) ? ctx.party_lens.red_lines : [];
  return redLines.map(cleanSentence).filter(Boolean).slice(0, limit);
};

const uniqueStrategicTerms = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map(cleanSentence).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
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

const corePartyTerms = (cluster: AgendaCluster, limit = 4): string[] => {
  const lens = researchContextOf(cluster)?.party_lens;
  if (!lens) return [];
  return uniqueStrategicTerms([
    ...(Array.isArray(lens.known_positions) ? lens.known_positions : []),
    ...(Array.isArray(lens.core_themes) ? lens.core_themes : []),
    ...(Array.isArray(lens.preferred_language) ? lens.preferred_language : []),
  ]).slice(0, limit);
};

const coreAudienceTerms = (cluster: AgendaCluster, limit = 3): string[] => {
  const audiences = researchContextOf(cluster)?.party_lens?.core_audiences;
  return Array.isArray(audiences) ? audiences.map(cleanSentence).filter(Boolean).slice(0, limit) : [];
};

const partyOpportunityPhrase = (cluster: AgendaCluster): string => {
  const lens = researchContextOf(cluster)?.party_lens;
  const label = cleanSentence(lens?.party_label);
  const terms = corePartyTerms(cluster, 4);
  const themeText = terms.length ? terms.join(', ') : 'καθαρό σχέδιο και πολιτική αξιοπιστία';
  if (!label) return `Η πολιτική αξιοποίηση χρειάζεται να μεταφραστεί σε ${themeText}.`;
  return `Για ${partyArticle(label)}, η γραμμή πρέπει να γίνει πολιτική πρόταση με ${themeText}.`;
};

const partyTonePhrase = (cluster: AgendaCluster): string => {
  const lens = researchContextOf(cluster)?.party_lens;
  const tone = cleanSentence(lens?.preferred_tone);
  if (!tone) return 'Ο τόνος χρειάζεται να δείχνει σοβαρότητα, καθαρή κρίση και εφαρμόσιμη λύση.';
  return `Ο τόνος χρειάζεται να παραμείνει ${tone}, με αίσθηση σχεδίου και εφαρμογής.`;
};

const partyAudiencePhrase = (cluster: AgendaCluster): string => {
  const audiences = coreAudienceTerms(cluster, 3);
  if (!audiences.length) return '';
  return `Τα κρίσιμα κοινά είναι ${audiences.join(', ')}.`;
};

const strategicLimitPhrase = (cluster: AgendaCluster): string => {
  const redLines = partyRedLines(cluster, 3);
  if (!redLines.length) return '';
  return `Σημείο προσοχής: η αφήγηση κρατά καθαρό όριο απέναντι σε ${redLines.join(' · ')}.`;
};

const stripRepeatedWhitespace = (value: string): string => value.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();

const partyStrategicAxis = (cluster: AgendaCluster, limit = 5): string => {
  const terms = corePartyTerms(cluster, limit);
  return terms.length ? terms.join(', ') : cleanSentence(researchContextOf(cluster)?.party_lens?.value_frame);
};

const partyNarrativeDepth = (cluster: AgendaCluster): string => {
  return [partyOpportunityPhrase(cluster), partyAudiencePhrase(cluster), partyTonePhrase(cluster)]
    .filter(Boolean)
    .join(' ');
};

const strongestResearchSignal = (cluster: AgendaCluster): string => {
  const points = researchContextOf(cluster)?.evidence_points;
  if (!Array.isArray(points) || !points.length) return '';
  const ranked = points
    .map((point) => ({
      label: cleanSentence(point?.label),
      group: cleanSentence(point?.group),
      value: n(point?.value, NaN),
      period: cleanSentence(point?.period),
      confidence: cleanSentence(point?.confidence),
    }))
    .filter((point) => point.label && Number.isFinite(point.value))
    .sort((a, b) => {
      const confidenceWeight = (value: string) => value === 'high' ? 3 : value === 'medium' ? 2 : 1;
      return confidenceWeight(b.confidence) - confidenceWeight(a.confidence) || Math.abs(50 - b.value) - Math.abs(50 - a.value);
    })[0];
  if (!ranked) return '';
  const rounded = Math.round(ranked.value);
  const group = ranked.group && ranked.group !== 'σύνολο κοινού' ? ` στους/στις ${ranked.group}` : '';
  const period = ranked.period ? ` (${ranked.period})` : '';
  return `Το ερευνητικό σήμα που βαραίνει περισσότερο είναι ${ranked.label}${group}: ${rounded}/100${period}.`;
};

const eventSpecificLens = (cluster: AgendaCluster, event: AgendaEvent): string => {
  const title = eventTitleForText(event);
  const raw = `${event.title || ''} ${cluster.micro_agenda || ''} ${cluster.parent_topic || ''}`.toLowerCase();
  const family = agendaFamily(cluster);

  if (raw.includes('απεργ')) {
    return `${title} δεν είναι απλώς εργασιακή κινητοποίηση· είναι σύγκρουση ανάμεσα στην εικόνα μιας οικονομίας που "πηγαίνει καλά" και στην καθημερινή εμπειρία εργαζομένων που ζητούν πραγματικό εισόδημα και σεβασμό.`;
  }
  if (raw.includes('άδεια') || raw.includes('αδεια')) {
    return `${title} δείχνει ότι τα εργασιακά δικαιώματα κρίνονται στις πρακτικές λεπτομέρειες: προβλεψιμότητα, κανόνες στον ιδιωτικό τομέα και αίσθηση ότι ο εργαζόμενος δεν είναι μόνο κόστος.`;
  }
  if (raw.includes('γιατρο') || raw.includes('εκπαιδευ')) {
    return `${title} ανοίγει πιο βαθύ ζήτημα από μια μισθολογική ανακοίνωση: αν το κράτος μπορεί να κρατήσει αξιοπρεπείς ανθρώπους σε κρίσιμες δημόσιες υπηρεσίες.`;
  }
  if (raw.includes('ανακαινίζω') || raw.includes('ανακαινιζω') || raw.includes('ανακαίνιση') || raw.includes('ανακαινιση')) {
    return `${title} δεν κρίνεται μόνο ως επιδότηση· κρίνεται ως τεστ εφαρμογής στο στεγαστικό: ποιος μπαίνει, πόσο γρήγορα ωφελείται και αν το πρόγραμμα αλλάζει πραγματικά την πρόσβαση σε αξιοπρεπή κατοικία.`;
  }
  if (raw.includes('60%') || raw.includes('6 στους 10') || raw.includes('οικονομική ασφυξία') || raw.includes('οικονομικη ασφυξια')) {
    return `${title} μετατρέπει το στεγαστικό από ατομική δυσκολία σε συλλογικό πρόβλημα προοπτικής ζωής: όταν το ενοίκιο απορροφά το εισόδημα, η νέα γενιά διαβάζει την πολιτική μέσα από το ερώτημα αν μπορεί να μείνει, να δουλέψει και να σχεδιάσει.`;
  }

  switch (family) {
    case 'housing_rents':
      return `${title} βάζει τη στέγη στον πυρήνα της κοινωνικής ασφάλειας: το θέμα δεν είναι μόνο οι τιμές, αλλά η δυνατότητα μιας γενιάς να οργανώσει ζωή με αξιοπρέπεια.`;
    case 'housing_programs':
      return `${title} δείχνει αν η πολιτική για την κατοικία περνά από την ανακοίνωση στην πράξη, με όρους ταχύτητας, πρόσβασης και μετρήσιμου αποτελέσματος.`;
    case 'labor_wages':
      return `${title} κάνει την εργασία πολιτικό μέτρο της καθημερινότητας: μισθός, δικαιώματα και κόστος ζωής ενώνονται σε ένα ερώτημα αξιοπρέπειας.`;
    case 'tax':
      return `${title} αγγίζει τον πυρήνα της σχέσης πολίτη-κράτους: δίκαιοι κανόνες, προβλεψιμότητα και αίσθηση ότι τα δημόσια έσοδα επιστρέφουν ως κοινωνική αξία.`;
    case 'energy':
      return `${title} μεταφέρει την ενέργεια από τεχνικό ζήτημα σε καθημερινό μέτρο αντοχής για νοικοκυριά και επιχειρήσεις.`;
    case 'benefits':
      return `${title} δοκιμάζει αν η κοινωνική στήριξη λειτουργεί ως προστασία με κανόνες ή ως αποσπασματική ανακούφιση χωρίς προοπτική.`;
    case 'consumer_prices':
      return `${title} δείχνει αν η μάχη με την ακρίβεια μένει σε παρακολούθηση τιμών ή περνά σε πραγματική πίεση για διαφάνεια και αποτέλεσμα.`;
    default:
      return `${title} δεν είναι μεμονωμένο σήμα· αποκτά βάρος επειδή συνδέεται με τη μικροατζέντα «${cluster.micro_agenda}» και μπορεί να μετακινήσει την πολιτική συζήτηση.`;
  }
};

const partyStrategicSentence = (cluster: AgendaCluster): string => {
  const label = cleanSentence(researchContextOf(cluster)?.party_lens?.party_label);
  const terms = corePartyTerms(cluster, 4);
  const family = agendaFamily(cluster);
  const party = label ? partyArticle(label) : 'το επιλεγμένο κόμμα';
  const axis = terms.length ? terms.join(', ') : 'θεσμική αξιοπιστία, κοινωνική δικαιοσύνη και εφαρμόσιμο σχέδιο';
  const base = `Για ${party}, η γραμμή πρέπει να γίνει συγκεκριμένη πολιτική πρόταση με ${axis}`;
  switch (family) {
    case 'housing_rents':
    case 'housing_programs':
      return `${base}, ώστε η στέγη να εμφανιστεί ως ζήτημα αξιοπρέπειας και κυβερνητικής ικανότητας.`;
    case 'labor_wages':
      return `${base}, ώστε η εργασία να συνδεθεί με δίκαιη ανάπτυξη και πραγματικό εισόδημα.`;
    case 'tax':
      return `${base}, ώστε η φορολογία να ακουστεί ως δίκαιη σχέση κράτους-πολίτη και όχι ως τεχνική διαχείριση.`;
    default:
      return `${base}, χωρίς να χαθεί η σύνδεση με την καθημερινή εμπειρία των πολιτών.`;
  }
};

const strategicDecisionLine = (cluster: AgendaCluster): string => {
  switch (agendaFamily(cluster)) {
    case 'housing_rents':
      return 'Η κρίσιμη πολιτική απόφαση είναι να παρουσιαστεί λύση που μειώνει την πίεση, ανοίγει πρόσβαση σε σπίτι και δείχνει ποιος εγγυάται εφαρμογή.';
    case 'housing_programs':
      return 'Η κρίσιμη πολιτική απόφαση είναι να μετατραπεί το πρόγραμμα σε απόδειξη εφαρμογής: απλό, γρήγορο, δίκαιο και με αποτέλεσμα που φαίνεται στον δικαιούχο.';
    case 'labor_wages':
      return 'Η κρίσιμη πολιτική απόφαση είναι να φύγει η συζήτηση από τη στενή κλαδική διαπραγμάτευση και να γίνει ζήτημα αξιοπρεπούς ζωής από την εργασία.';
    case 'tax':
      return 'Η κρίσιμη πολιτική απόφαση είναι να εξηγηθεί καθαρά ποιος πληρώνει, με ποιους κανόνες και τι κοινωνικό όφελος επιστρέφει.';
    default:
      return 'Η κρίσιμη πολιτική απόφαση είναι να περάσει το θέμα από περιγραφή προβλήματος σε καθαρή πρόταση χειρισμού.';
  }
};

const researchBackedStrategicBody = (cluster: AgendaCluster, event: AgendaEvent): string | null => {
  const ctx = researchContextOf(cluster);
  if (!ctx) return null;

  const opening = eventSpecificLens(cluster, event);
  const evidence = strongestResearchSignal(cluster);
  const decision = strategicDecisionLine(cluster);
  const party = partyStrategicSentence(cluster);
  const tone = partyTonePhrase(cluster);
  const limit = strategicLimitPhrase(cluster);

  const body = [opening, evidence, decision, party, tone, limit]
    .filter(Boolean)
    .join(' ');

  return stripRepeatedWhitespace(body);
};

const researchBackedWhyBody = (cluster: AgendaCluster, event: AgendaEvent): string | null => {
  const ctx = researchContextOf(cluster);
  if (!ctx) return null;
  const title = eventTitleForText(event);
  const frame = cleanSentence(ctx.research_frame);
  const evidence = researchEvidenceLines(cluster, 2);
  const evidenceText = evidence.length ? `Η ερευνητική βάση προσθέτει συγκεκριμένο υπόβαθρο: ${evidence.join(' · ')}.` : '';
  return `${title} μπαίνει στην εικόνα επειδή συνδέει το σημερινό γεγονός με τη μικροατζέντα «${cluster.micro_agenda}» και με βαθύτερο πεδίο ${frame}. ${evidenceText}`.trim();
};

const researchBackedWinningBody = (cluster: AgendaCluster, event: AgendaEvent): string | null => {
  const ctx = researchContextOf(cluster);
  if (!ctx) return null;

  const title = eventTitleForText(event);
  const meaning = cleanSentence(ctx.strategic_meaning);
  const language = researchLanguage(cluster);
  const opportunity = partyOpportunityPhrase(cluster);
  const audience = partyAudiencePhrase(cluster);
  const limit = strategicLimitPhrase(cluster);

  const body = [
    `${title} κερδίζεται όταν η γραμμή περάσει από την περιγραφή του προβλήματος σε καθαρή πολιτική απάντηση μέσα στη μικροατζέντα «${cluster.micro_agenda}».`,
    meaning,
    opportunity,
    audience,
    `Η γλώσσα πρέπει να κινηθεί γύρω από: ${language}.`,
    limit,
  ].filter(Boolean).join(' ');

  return stripRepeatedWhitespace(body);
};

const agendaFamily = (cluster: AgendaCluster):
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
  | 'default' => {
  const id = safeText(cluster.micro_agenda_id).toLowerCase();
  const topic = `${cluster.micro_agenda} ${cluster.parent_topic || ''}`.toLowerCase();
  if (id.includes('housing_rents') || topic.includes('ενοίκ')) return 'housing_rents';
  if (id.includes('renovation') || topic.includes('ανακαιν')) return 'housing_programs';
  if (id.includes('airbnb') || topic.includes('airbnb') || topic.includes('βραχυχρόν')) return 'airbnb';
  if (id.includes('wages') || topic.includes('μισθ') || topic.includes('εργασιακ')) return 'labor_wages';
  if (id.includes('unemployment') || topic.includes('ανεργ') || topic.includes('επισφάλ')) return 'precarity';
  if (id.includes('tax') || topic.includes('φορο')) return 'tax';
  if (id.includes('wildfire') || topic.includes('πυροπροστα') || topic.includes('οικοπέδ')) return 'wildfire';
  if (id.includes('energy') || topic.includes('ενέργ') || topic.includes('ρεύμ')) return 'energy';
  if (id.includes('benefits') || topic.includes('επίδο') || topic.includes('στήριξ')) return 'benefits';
  if (id.includes('consumer_price') || topic.includes('σύγκριση τιμών') || topic.includes('καταναλω')) return 'consumer_prices';
  return 'default';
};

const agendaThemeSentence = (cluster: AgendaCluster, event?: AgendaEvent | null): string => {
  const title = eventTitleForText(event);
  switch (agendaFamily(cluster)) {
    case 'housing_rents':
      return `${title} συνδέει την πίεση στα ενοίκια με την πρόσβαση σε σπίτι, τη νέα γενιά και την αξιοπιστία των λύσεων που προτείνονται.`;
    case 'housing_programs':
      return `${title} δείχνει αν τα προγράμματα κατοικίας μπορούν να λειτουργήσουν ως πρακτική απάντηση στο στεγαστικό άγχος.`;
    case 'airbnb':
      return `${title} φέρνει στο ίδιο πεδίο την τουριστική οικονομία, τη διαθεσιμότητα κατοικίας και την πίεση στις γειτονιές.`;
    case 'labor_wages':
      return `${title} συνδέει τους μισθούς και τα εργασιακά δικαιώματα με την καθημερινή αξιοπρέπεια και το κόστος ζωής.`;
    case 'precarity':
      return `${title} συνδέει την εργασιακή προοπτική με τη νέα γενιά, την παραγωγική βάση και την εμπιστοσύνη στο μέλλον.`;
    case 'tax':
      return `${title} μεταφέρει τη φορολογία από τεχνική συζήτηση σε ερώτημα δικαιοσύνης, εμπιστοσύνης και κρατικής αποτελεσματικότητας.`;
    case 'wildfire':
      return `${title} συνδέει την πρόληψη με την ευθύνη δήμων, κράτους και πολιτών πριν η κρίση γίνει διαχείριση ζημιάς.`;
    case 'energy':
      return `${title} συνδέει την ενέργεια με το κόστος για νοικοκυριά και επιχειρήσεις, αλλά και με την ασφάλεια τροφοδοσίας.`;
    case 'benefits':
      return `${title} ανοίγει συζήτηση για κοινωνική προστασία, αγοραστική δύναμη και στοχευμένη στήριξη.`;
    case 'consumer_prices':
      return `${title} συνδέει την ακρίβεια με τη διαφάνεια στην αγορά και την ικανότητα του κράτους να πιέσει για πραγματικές τιμές.`;
    default:
      return `${title} συνδέεται με τη μικροατζέντα «${cluster.micro_agenda}» και δείχνει πού μπορεί να μετακινηθεί η πολιτική συζήτηση.`;
  }
};

const advisorMoveTitle = (cluster: AgendaCluster): string => {
  switch (agendaFamily(cluster)) {
    case 'housing_rents': return 'Γραμμή για προσιτή κατοικία';
    case 'housing_programs': return 'Γραμμή εφαρμογής και αξιοπιστίας';
    case 'airbnb': return 'Γραμμή ισορροπίας κατοικίας και αγοράς';
    case 'labor_wages': return 'Γραμμή αξιοπρέπειας στην εργασία';
    case 'precarity': return 'Γραμμή προοπτικής για τη νέα γενιά';
    case 'tax': return 'Γραμμή φορολογικής δικαιοσύνης';
    case 'wildfire': return 'Γραμμή πρόληψης και ευθύνης';
    case 'energy': return 'Γραμμή κόστους και ασφάλειας';
    case 'benefits': return 'Γραμμή στοχευμένης στήριξης';
    case 'consumer_prices': return 'Γραμμή διαφάνειας τιμών';
    default: return 'Γραμμή πολιτικής ουσίας';
  }
};

const advisorOpportunityLine = (cluster: AgendaCluster, event?: AgendaEvent | null): string => {
  switch (agendaFamily(cluster)) {
    case 'housing_rents': return 'Ευκαιρία να συνδεθεί η καθημερινή πίεση με συγκεκριμένη πολιτική λύση για ενοίκια, πρόσβαση σε σπίτι και νέους ανθρώπους.';
    case 'housing_programs': return 'Ευκαιρία να παρουσιαστεί η απάντηση ως εφαρμογή με μετρήσιμο αποτέλεσμα και όχι ως απλή ανακοίνωση προγράμματος.';
    case 'airbnb': return 'Ευκαιρία να μπει κανόνας ισορροπίας ανάμεσα σε τουρισμό, ιδιοκτησία και δικαίωμα κατοικίας.';
    case 'labor_wages': return 'Ευκαιρία να συνδεθεί ο μισθός με αξιοπρέπεια, παραγωγικότητα και κόστος ζωής.';
    case 'precarity': return 'Ευκαιρία να ανοίξει αφήγηση προοπτικής για πτυχιούχους, νέους εργαζόμενους και επιστροφή εμπιστοσύνης.';
    case 'tax': return 'Ευκαιρία να μεταφερθεί η συζήτηση από αριθμούς σε δίκαιη κατανομή βαρών και αξιοπιστία του κράτους.';
    case 'wildfire': return 'Ευκαιρία να μπει η πρόληψη πριν από την κρίση και η ευθύνη πριν από τις δικαιολογίες.';
    case 'energy': return 'Ευκαιρία να συνδεθεί το ενεργειακό με λογαριασμούς, παραγωγή και ασφάλεια.';
    case 'benefits': return 'Ευκαιρία να παρουσιαστεί η στήριξη ως στοχευμένη προστασία με κανόνες και αποτέλεσμα.';
    case 'consumer_prices': return 'Ευκαιρία να φανεί ποιος πιέζει πραγματικά την αγορά και ποιος μένει στην περιγραφή της ακρίβειας.';
    default: return `Ευκαιρία να συνδεθεί το γεγονός με καθαρή πολιτική επιλογή μέσα στο θέμα «${cluster.micro_agenda}».`;
  }
};

const advisorTrapLine = (cluster: AgendaCluster): string => {
  switch (agendaFamily(cluster)) {
    case 'housing_rents': return 'Η παγίδα είναι να μείνει η γραμμή σε γενική συμπόνια για τα ενοίκια χωρίς εφαρμόσιμη πρόταση.';
    case 'housing_programs': return 'Η παγίδα είναι να ακουστεί ως ακόμα ένα πρόγραμμα χωρίς εγγύηση εφαρμογής.';
    case 'airbnb': return 'Η παγίδα είναι να φανεί ως σύγκρουση με την ιδιοκτησία ή τον τουρισμό αντί για κανόνας ισορροπίας.';
    case 'labor_wages': return 'Η παγίδα είναι να κλειστεί το θέμα σε συντεχνιακή γλώσσα και να χαθεί η σύνδεση με την καθημερινότητα.';
    case 'precarity': return 'Η παγίδα είναι να γίνει γενική διαπίστωση για τους νέους χωρίς διέξοδο εργασίας και κατοικίας.';
    case 'tax': return 'Η παγίδα είναι να χαθεί το θέμα σε τεχνικές λεπτομέρειες και να μη φανεί η πολιτική αρχή.';
    case 'wildfire': return 'Η παγίδα είναι να εμφανιστεί η πρόληψη ως γραφειοκρατική υποχρέωση αντί για προστασία ζωής και περιουσίας.';
    case 'energy': return 'Η παγίδα είναι να γίνει αφηρημένη ενεργειακή συζήτηση χωρίς σύνδεση με λογαριασμούς και παραγωγή.';
    case 'benefits': return 'Η παγίδα είναι να φανεί ως διανομή επιδομάτων αντί για οργανωμένη προστασία αγοραστικής δύναμης.';
    case 'consumer_prices': return 'Η παγίδα είναι να παρουσιαστεί το εργαλείο ως επικοινωνία και όχι ως μηχανισμός πίεσης στην αγορά.';
    default: return 'Η παγίδα είναι να μείνει η τοποθέτηση γενική και να μην ακουστεί καθαρή επιλογή πολιτικής.';
  }
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
  const ctx = researchContextOf(cluster);
  if (ctx?.audience_reading) return cleanSentence(ctx.audience_reading);
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

  if (hasExactFrontpageSignal(cluster)) {
    return `Η παρουσία σε πρωτοσέλιδα από ${sources} δίνει στο θέμα θεσμικό βάρος και το μετακινεί προς το κέντρο της πολιτικής ατζέντας.`;
  }

  if (hasParentFrontpageSignal(cluster)) {
    return `Η ευρύτερη ατζέντα γύρω από ${safeText(signalBridgeOf(cluster).matched_editorial_topic, cluster.parent_topic || cluster.micro_agenda)} ανεβαίνει στα πρωτοσέλιδα και δίνει στο θέμα πρόσθετο πλαίσιο, ως έμμεση σύνδεση με το κεντρικό κύμα.`;
  }

  return 'Η θέση του θέματος σχηματίζεται από τη ροή ειδήσεων, τη δημόσια προσοχή και τα συγγενή γεγονότα.';
};

const strategicAdvisorBody = (cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): string => {
  const researchBody = researchBackedStrategicBody(cluster, event);
  if (researchBody) return researchBody;
  const topic = cluster.micro_agenda;
  const frontpage = frontpagePhrase(cluster);
  const pulse = publicInterestPhrase(cluster);
  const coverage = newsCoveragePhrase(cluster);
  const theme = agendaThemeSentence(cluster, event);

  if (hasExactFrontpageSignal(cluster)) {
    return `${theme} Το θέμα συγκεντρώνει σήμερα ${signalStrengthWord(n(cluster.real_news_coverage_score, n(cluster.article_count) * 8))} ειδησεογραφική κάλυψη, υπαρκτό ενδιαφέρον στις αναζητήσεις και καθαρή παρουσία στα πολιτικά και οικονομικά πρωτοσέλιδα. ${frontpage} ${pulse} Για τη στρατηγική ανάγνωση, η ατζέντα μετακινείται από την περιγραφή του προβλήματος προς την αξιολόγηση λύσεων.`;
  }

  if (hasParentFrontpageSignal(cluster)) {
    return `${theme} Το θέμα κινείται μέσα σε ευρύτερο κύμα που έχει αποκτήσει πρωτοσέλιδη παρουσία. ${frontpage} ${coverage} ${pulse} Για τη στρατηγική ανάγνωση, αποκτά αξία ως πεδίο εφαρμογής, εξειδίκευσης και αξιοπιστίας.`;
  }

  return `${theme} ${coverage} ${pulse} Για τη στρατηγική ανάγνωση, το θέμα αξίζει παρακολούθηση ως πεδίο πιθανής πολιτικής μετατόπισης μέσα στο «${topic}».`;
};

const whyAdvisorBody = (cluster: AgendaCluster, event: AgendaEvent): string => {
  const researchBody = researchBackedWhyBody(cluster, event);
  if (researchBody) return researchBody;
  const topic = cluster.micro_agenda;
  const theme = agendaThemeSentence(cluster, event);
  if (hasExactFrontpageSignal(cluster)) {
    return `${theme} Μπαίνει στην εικόνα επειδή ενώνονται τρία επίπεδα: δημόσιο ενδιαφέρον, ειδησεογραφική διάρκεια και πρωτοσέλιδη ανάδειξη. Η σύμπτωση αυτών των σημάτων δημιουργεί πολιτικό βάρος και φέρνει το θέμα σε θέση άμεσης αξιολόγησης.`;
  }
  if (hasParentFrontpageSignal(cluster)) {
    return `${theme} Μπαίνει στην εικόνα επειδή συνδέεται με ευρύτερη ατζέντα που αποκτά πρωτοσέλιδη δύναμη. Η σύνδεση λειτουργεί συμπληρωματικά και δείχνει πού μπορεί να μετακινηθεί η συζήτηση τις επόμενες ώρες.`;
  }
  return `${theme} Μπαίνει στην εικόνα επειδή συγκεντρώνει επαναλαμβανόμενα σήματα από ειδήσεις, πηγές και σχετικές εξελίξεις. Η εικόνα δείχνει θέμα που σχηματίζει πολιτική σημασία μέσα από τη συσσώρευση ενδείξεων.`;
};

const winningAdvisorBody = (cluster: AgendaCluster, event: AgendaEvent): string => {
  const researchBody = researchBackedWinningBody(cluster, event);
  if (researchBody) return researchBody;
  const theme = agendaThemeSentence(cluster, event);
  if (hasExactFrontpageSignal(cluster)) {
    return `${theme} Η γραμμή κερδίζει όταν αναγνωρίζει την κοινωνική πίεση, δείχνει συγκεκριμένη λύση και αξιοποιεί την πρωτοσέλιδη παρουσία για θεσμική, ώριμη τοποθέτηση.`;
  }
  if (hasParentFrontpageSignal(cluster)) {
    return `${theme} Η γραμμή κερδίζει όταν συνδεθεί καθαρά με την κεντρική ατζέντα που ήδη ανεβαίνει και περάσει από το γενικό πρόβλημα σε εφαρμόσιμη λύση.`;
  }
  return `${theme} Η γραμμή κερδίζει με καθαρή σύνδεση ανάμεσα στο γεγονός, την καθημερινή επίπτωση και την πολιτική επιλογή.`;
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


const EVENT_STOPWORDS = new Set([
  'κριση', 'νεα', 'νεο', 'στον', 'στην', 'στις', 'στη', 'στο', 'των', 'του', 'της', 'και', 'για', 'απο',
  'υψηλα', 'επιπεδα', 'ζητηση', 'ζητησης', 'οικονομικη', 'οικονομικης', 'ασφυξια', 'πλαισια', 'πλαισιο'
]);

const eventTokenStem = (value: string): string[] =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ω0-9]+/gi, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !EVENT_STOPWORDS.has(token))
    .map((token) => token.slice(0, 6));

const tokenSimilarity = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const left = Array.from(new Set(a));
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = Array.from(new Set(a.concat(b))).length;
  return union ? intersection / union : 0;
};

const hasAnyStem = (stems: string[], needles: string[]): boolean =>
  needles.some((needle) => stems.some((stem) => stem.startsWith(needle)));

const sameStoryByFamily = (family: ReturnType<typeof agendaFamily>, left: string[], right: string[]): boolean => {
  if (family === 'housing_rents') {
    return hasAnyStem(left, ['στεγασ', 'ενοικ']) && hasAnyStem(right, ['στεγασ', 'ενοικ']);
  }
  if (family === 'housing_programs') {
    return hasAnyStem(left, ['ανακαι', 'κατοικ']) && hasAnyStem(right, ['ανακαι', 'κατοικ']);
  }
  if (family === 'tax') {
    return hasAnyStem(left, ['φορο', 'ενφια', 'ααδε']) && hasAnyStem(right, ['φορο', 'ενφια', 'ααδε']);
  }
  return false;
};

const compactAgendaEvents = (cluster: AgendaCluster, events: AgendaEvent[]): AgendaEvent[] => {
  const family = agendaFamily(cluster);
  const kept: { event: AgendaEvent; stems: string[] }[] = [];
  for (const event of events) {
    const stems = eventTokenStem(event.title || '');
    const duplicate = kept.some((item) => {
      const sameMicro = safeText(item.event.event_micro_agenda_id) && safeText(item.event.event_micro_agenda_id) === safeText(event.event_micro_agenda_id);
      if (!sameMicro) return false;
      return tokenSimilarity(item.stems, stems) >= 0.34 || sameStoryByFamily(family, item.stems, stems);
    });
    if (!duplicate) kept.push({ event, stems });
  }
  return kept.map((item) => item.event).slice(0, 3);
};

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
        events: compactAgendaEvents(cluster, cluster.top_events ?? []),
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
      label: rank === 1 ? 'Προτεραιότητα 1' : rank === 2 ? 'Σήμα ατζέντας' : 'Σημείο προσοχής',
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
    buildHowToWinSection(cluster, selectedEvent, view),
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
  if (n(cluster.score) >= 75) return 'Σύντομη τοποθέτηση με καθαρή πλαισίωση και βάση εκτίμησης.';
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
  const title = eventTitleForText(event);

  if (sourceCount >= 3) triggers.push(`${title} περνά σε περισσότερες ανεξάρτητες πηγές και αποκτά μεγαλύτερη διάρκεια.`);
  if (eventCount >= 3) triggers.push(`Η μικροατζέντα «${cluster.micro_agenda}» συνδέεται με περισσότερα συγγενή γεγονότα.`);
  if (hasPoliticalActor(event.title)) triggers.push('Μπαίνουν ενεργά πολιτικοί ή θεσμικοί παράγοντες και αυξάνεται η ανάγκη καθαρής θέσης.');
  if (cluster.search_interest_score && cluster.search_interest_score >= 50) triggers.push('Οι αναζητήσεις δείχνουν ότι το ενδιαφέρον του κοινού ανεβαίνει και μπορεί να αλλάξει ο ρυθμός παρέμβασης.');
  if (hasExactFrontpageSignal(cluster)) triggers.push('Η πρωτοσέλιδη παρουσία διατηρείται και επιβεβαιώνει ότι το θέμα παραμένει στο κέντρο της ατζέντας.');
  if (hasParentFrontpageSignal(cluster)) triggers.push('Η γειτονική πρωτοσέλιδη ατζέντα μετακινείται πιο κοντά στο ίδιο θέμα.');
  if (cluster.requires_human_review) triggers.push('Η κοινωνική ευαισθησία απαιτεί θεσμικό και ανθρώπινο χειρισμό.');
  if (!triggers.length) triggers.push(`Η εκτίμηση αλλάζει αν το ${title} συνδεθεί με δεύτερη πηγή, νέο πολιτικό σήμα ή μεγαλύτερο δημόσιο ενδιαφέρον.`);

  return triggers;
}

function buildStrategicImageSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const body = view.sensitiveMode
    ? `Το θέμα ανήκει στο "${cluster.micro_agenda}" και ζητά προσεκτική, ανθρώπινη ανάγνωση. Η αξία του για το Strategy Room είναι η έγκαιρη κατανόηση του θεσμικού και κοινωνικού πλαισίου.`
    : strategicAdvisorBody(cluster, event, view);

  return {
    tab: 'strategic_image',
    label: 'Στρατηγική εικόνα',
    kicker: 'Ατζέντα → Πλαίσιο → Ευθύνη',
    title: 'Τι βλέπουμε',
    body,
    bullets: [`Θέμα: ${cluster.micro_agenda}`, `Κατάσταση: ${view.statusLabel}`, `Βάση εκτίμησης: ${view.evidenceLabel}`],
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
    `Συνδέεται με την μικροατζέντα "${cluster.micro_agenda}".`,
    `${n(cluster.article_count)} ${articleWord(n(cluster.article_count))} / ${n(cluster.source_count)} ${sourceWord(n(cluster.source_count))}.`,
    `Βάση εκτίμησης: ${view.evidenceLabel}.`,
  ];

  researchEvidenceLines(cluster, 2).forEach((line) => reasons.push(`Ερευνητικό υπόβαθρο: ${line}.`));
  if (n(cluster.event_count) > 1) reasons.push('Εμφανίζεται μέσα σε συστάδα συγγενών σημάτων.');
  if (hasExactFrontpageSignal(cluster)) reasons.push('Έχει άμεση παρουσία σε πολιτικά και οικονομικά πρωτοσέλιδα.');
  if (hasParentFrontpageSignal(cluster)) reasons.push('Συνδέεται με ευρύτερο πρωτοσέλιδο κύμα της ίδιας ατζέντας.');
  if (cluster.requires_human_review) reasons.push('Εμφανίζεται με προσεκτικό χειρισμό λόγω κοινωνικής ευαισθησίας.');

  return {
    tab: 'why_exists',
    label: 'Γιατί έχει σημασία',
    kicker: 'Στρατηγική αιτιολόγηση',
    title: 'Γιατί μπαίνει στην εικόνα',
    body: whyAdvisorBody(cluster, event),
    bullets: reasons,
  };
}

function buildSourcesFactorsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  const sources = unique((cluster.evidence_articles ?? []).map((a) => safeText(a.source ?? '')).filter(Boolean)).slice(0, 5);
  const factors = [...buildFactors(cluster, event), ...researchEvidenceLines(cluster, 2).map((line) => `Ερευνητική βάση: ${line}.`)];

  return {
    tab: 'sources_factors',
    label: 'Πηγές & παράγοντες',
    kicker: 'Βάση εκτίμησης',
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

function buildHowToWinSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
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
    body: winningAdvisorBody(cluster, event),
    bullets: [advisorTrapLine(cluster), advisorOpportunityLine(cluster, event), `Κεντρική κίνηση: ${advisorMoveTitle(cluster).toLowerCase()}.`],
  };
}

function buildActionOptionsSection(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): IntelligenceSection {
  return {
    tab: 'action_options',
    label: 'Επιλογές δράσης',
    kicker: 'Τρεις διαδρομές απόφασης',
    title: 'Τι κάνουμε τώρα',
    body: 'Οι επιλογές είναι σχεδιασμένες για γρήγορη απόφαση με πολιτική ακρίβεια και καθαρή ευθύνη.',
    actions: buildActionOptions(cluster, event, view),
  };
}

function buildActionOptions(cluster: AgendaCluster, event: AgendaEvent, view: EventIntelligenceView): ActionOption[] {
  if (view.sensitiveMode) {
    return [
      { key: 'A', title: 'Θεσμική στάση', badge: 'Προτεινόμενη', body: 'Τοποθέτηση μόνο σε επίπεδο θεσμικής ευθύνης, πρόληψης και προστασίας.', gain: 'Δείχνει σοβαρότητα χωρίς εργαλειοποίηση.', risk: 'Χρειάζεται ανθρώπινη διατύπωση για να αποκτήσει βάρος.', successProbability: 65, recommended: true, avoid: false },
      { key: 'B', title: 'Σιωπηλή παρακολούθηση', badge: 'Εναλλακτική', body: 'Εσωτερική παρακολούθηση μέχρι να υπάρξει θεσμική εξέλιξη.', gain: 'Αποφεύγει άστοχη εμπλοκή.', risk: 'Μπορεί να χαθεί θεσμικό timing.', successProbability: 45, recommended: false, avoid: false },
      { key: 'Γ', title: 'Υψηλού ρίσκου αντιπαράθεση', badge: 'Υψηλό ρίσκο', body: 'Επιθετική κομματική γραμμή πάνω στο θέμα.', gain: 'Βραχυπρόθεσμη ένταση.', risk: 'Υψηλό ρίσκο κοινωνικής απόρριψης.', successProbability: 15, recommended: false, avoid: true },
    ];
  }

  const title = eventTitleForText(event);
  const move = advisorMoveTitle(cluster);
  const opportunity = advisorOpportunityLine(cluster, event);
  const trap = advisorTrapLine(cluster);

  return [
    {
      key: 'A',
      title: move,
      badge: 'Προτεινόμενη',
      body: researchBackedWinningBody(cluster, event) || `${title} γίνεται αφορμή για καθαρή τοποθέτηση μέσα στο «${cluster.micro_agenda}». Η γραμμή αναγνωρίζει την πίεση, ορίζει την ευθύνη και δείχνει πρακτική κατεύθυνση.`,
      gain: opportunity,
      risk: 'Χρειάζεται συγκεκριμένη διατύπωση για να ακουστεί ως λύση και όχι ως γενική αντίδραση.',
      successProbability: 68,
      recommended: true,
      avoid: false,
    },
    {
      key: 'B',
      title: 'Στοχευμένη αναμονή',
      badge: 'Αποδεκτή',
      body: `Κρατάμε το ${title} ενεργό, παρακολουθούμε αν συνδέεται με περισσότερα σήματα στο «${cluster.micro_agenda}» και ετοιμάζουμε γραμμή δεύτερου κύματος.`,
      gain: 'Δίνει χρόνο για πιο ώριμη τοποθέτηση με καλύτερη βάση εκτίμησης.',
      risk: 'Η πρώτη πλαισίωση μπορεί να περάσει σε άλλους αν η ατζέντα επιταχύνει.',
      successProbability: 48,
      recommended: false,
      avoid: false,
    },
    {
      key: 'Γ',
      title: 'Γραμμή υψηλής έντασης',
      badge: 'Υψηλό ρίσκο',
      body: `Άμεση επιθετική αξιοποίηση του ${title} πριν σταθεροποιηθεί η σύνδεσή του με το «${cluster.micro_agenda}».`,
      gain: 'Δίνει γρήγορη ένταση και τραβά προσοχή.',
      risk: trap,
      successProbability: 24,
      recommended: false,
      avoid: true,
    },
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
        briefing: researchBackedStrategicBody(cluster, event) || `Το γεγονός "${event.title}" εντάσσεται στο "${cluster.micro_agenda}" και μπορεί να στηρίξει καθαρή πολιτική ανάγνωση.`,
        talkingPoints: [`Το θέμα συνδέεται με τη μικροατζέντα "${cluster.micro_agenda}".`, `Η γλώσσα να πατήσει σε: ${researchLanguage(cluster)}.`, 'Η γραμμή να δείχνει επιλογή πολιτικής και καθαρή ευθύνη.'],
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
