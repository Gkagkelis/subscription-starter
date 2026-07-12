import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeNorayaPriorityScore } from "@/lib/noraya-priority-score";

// Φιλτρο ευαισθητων/μη-πολιτικων περιστατικων (αστυνομικο δελτιο, ανηλικοι, τραγωδιες)
// — ΔΕΝ εμφανιζονται ΠΟΤΕ ως πολιτικες προτεραιοτητες.
const SENSITIVE_EVENT_RE = /(αν[ηή]λικ|εξαφ[αά]νι|αγνο[οό]?[υύ]μεν|βιασμ|αποπλ[αά]ν|κακοπο[ιί]η|παιδεραστ|αυτοκτον|απαγωγ|πνιγμ|τροχα[ιί]ο)/i;
function isSensitiveEvent(title?: string | null): boolean {
  return SENSITIVE_EVENT_RE.test(String(title || ""));
}

// Φιλτρο ξενων-εταιρικων/διεθνων ΧΩΡΙΣ ελληνικο πολιτικο αντικτυπο (θορυβος)
const FOREIGN_NOISE_RE = /(microsoft|google|amazon|\bapple\b|\bmeta\b|tesla|nvidia|openai|samsung|\bintel\b|boeing|volkswagen|\bbmw\b|mercedes|toyota|nasdaq|dow jones|wall street|silicon valley|federal reserve|γερμανικ[ήη][^.]{0,25}(αυτοκινητο|βιομηχαν)|κινεζικ[ήη][^.]{0,25}(ανταγωνισ|βιομηχαν|αυτοκινητο))/i;
const GREEK_CONTEXT_RE = /(ελλ[αά]δ|ελληνικ|αθ[ηή]ν|θεσσαλον|κυβ[εέ]ρν|βουλ[ήη]|υπουργ|μητσοτ[αά]κ|ΕΛΑΣ|ΠΑΣΟΚ|ΣΥΡΙΖΑ|ΚΚΕ|τσ[ιί]πρα|ανδρουλ[αά]κ)/i;
// Εμπορικος/καταναλωτικος θορυβος (εκπτωσεις κ.λπ.) — ΕΚΤΟΣ αν εχει πολιτικη αναφορα (φοροι/μετρα/κυβερνηση)
const COMMERCIAL_NOISE_RE = /((θεριν|χειμεριν|ενδιαμεσ)\w*\s+εκπτ[ωώ]σε|εκπτ[ωώ]σεις\s+(ξεκιν|αρχιζ|λ[ηή]γ)|black friday|cyber monday|εκπτωσιακ)/i;
const POLITICAL_CONTEXT_RE = /(φ[οό]ρο|φορολογ|κυβ[εέ]ρν|υπουργ|μ[εέ]τρ[οα]|νομοσχ[εέ]δι|επ[ιί]δομ|βουλ[ηή])/i;
// Εσωτερικη πολιτικη ΞΕΝΩΝ χωρων — κοβεται ΕΚΤΟΣ αν αφορα Τουρκια/ελληνοτουρκικα,
// αποφασεις ΕΕ/ΝΑΤΟ που δεσμευουν την Ελλαδα, ή αναφερει ρητα την Ελλαδα.
const FOREIGN_POLITICS_RE = /(στ[αά]ρμερ|starmer|μακρ[οό]ν|σολτς|\bμερτς|βρεταν|ηνωμ[εέ]νο βασ[ιί]λειο|γαλλικ[ηή] κυβ[εέ]ρν|γερμανικ[ηή] κυβ[εέ]ρν|ιταλικ[ηή] κυβ[εέ]ρν|ισπανικ|πολωνικ|ολλανδικ|λευκ[οό]ς ο[ιί]κος|αμερικανικ[εέ]ς εκλογ|πρωθυπουργ[οό]ς (της )?(βρεταν|γαλλ|γερμαν|ιταλ|ισπαν))/i;
const GREEK_STAKE_RE = /(ελλ[αά]δ|ελλην|ελληνοτουρκ|τουρκ|ερντογ[αά]ν|κ[υύ]προ|αιγα[ιί]|casus belli|μητσοτ[αά]κ|ευρωπαϊκ[οό] συμβο[υύ]λιο|σ[υύ]νοδο[ςυ]? κορυφ[ηή]ς|αποφ[αά]σ\w* (ΕΕ|νατο)|δασμ)/i;
function isForeignPolitics(title?: string | null): boolean {
  const t = String(title || "");
  return FOREIGN_POLITICS_RE.test(t) && !GREEK_STAKE_RE.test(t);
}

function isCommercialNoise(title?: string | null): boolean {
  const t = String(title || "");
  return COMMERCIAL_NOISE_RE.test(t) && !POLITICAL_CONTEXT_RE.test(t);
}

function isForeignNoise(title?: string | null): boolean {
  const t = String(title || "");
  return FOREIGN_NOISE_RE.test(t) && !GREEK_CONTEXT_RE.test(t);
}

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EvidenceArticle = {
  article_id?: string | null;
  title?: string | null;
  source?: string | null;
  url?: string | null;
  published_at?: string | null;
  score?: number | string | null;
  role?: string | null;
};

type TrendSignal = {
  topic?: string | null;
  search_interest_score?: number | string | null;
  search_interest_status?: string | null;
  queries?: string[] | null;
  fetched_at?: string | null;
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signalLabel(score: number) {
  if (score >= 70) return "Ισχυρό σήμα";
  if (score >= 55) return "Ανερχόμενο σήμα";
  if (score >= 35) return "Υπό παρακολούθηση";
  return "Χαμηλό σήμα";
}

function clampScore(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeLevelScore(value: unknown, kind: "doc" | "risk") {
  const normalized = String(value || "").toLowerCase();
  if (kind === "doc") {
    if (normalized.includes("strong") || normalized.includes("high") || normalized.includes("ισχυ")) return 100;
    if (normalized.includes("medium") || normalized.includes("μεσα")) return 65;
    if (normalized.includes("initial") || normalized.includes("low") || normalized.includes("αρχ")) return 35;
    if (normalized.includes("weak") || normalized.includes("insufficient") || normalized.includes("ανεπαρκ")) return 15;
    return 40;
  }

  if (normalized.includes("critical") || normalized.includes("high") || normalized.includes("υψη") || normalized.includes("active")) return 100;
  if (normalized.includes("medium") || normalized.includes("μεσα") || normalized.includes("monitoring")) return 65;
  if (normalized.includes("low") || normalized.includes("χαμη") || normalized.includes("quiet")) return 35;
  return 40;
}

function freshnessScore(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return 35;
  const hoursOld = (Date.now() - date.getTime()) / 36e5;
  if (hoursOld <= 24) return 100;
  if (hoursOld <= 48) return 75;
  if (hoursOld <= 7 * 24) return 45;
  return 20;
}

function coverageComponent(articleCount: unknown, sourceCount: unknown) {
  const a = Math.max(0, numberValue(articleCount, 0));
  const s = Math.max(0, numberValue(sourceCount, 0));
  return clampScore(a * 8 + s * 12);
}

function strategicBoostScore(input: {
  article_count?: unknown;
  source_count?: unknown;
  documentation_level?: unknown;
  political_risk_level?: unknown;
  urgency?: unknown;
  status?: unknown;
  last_article_at?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
}) {
  const coverage = coverageComponent(input.article_count, input.source_count);
  const doc = normalizeLevelScore(input.documentation_level, "doc");
  const risk = normalizeLevelScore(input.political_risk_level || input.urgency || input.status, "risk");
  const fresh = freshnessScore(input.last_article_at || input.updated_at || input.created_at);

  return clampScore(0.35 * coverage + 0.25 * doc + 0.25 * risk + 0.15 * fresh, 50);
}

function strategicIndexScore(rawSignal: unknown, searchInterest: unknown, boost: unknown, opportunityBonus = 0) {
  const raw = clampScore(numberValue(rawSignal, 0));
  const search = clampScore(numberValue(searchInterest, 50), 50);
  const strategicBoost = clampScore(numberValue(boost, 50), 50);
  return clampScore(0.55 * raw + 0.25 * search + 0.20 * strategicBoost + opportunityBonus);
}

function trendForTopic(trendMap: Map<string, TrendSignal>, topic?: string | null): TrendSignal {
  const key = String(topic || "").trim();
  return trendMap.get(key) || {
    topic: key,
    search_interest_score: 50,
    search_interest_status: "pending_fallback_50",
    queries: key ? [key] : [],
    fetched_at: null,
  };
}

function trendPayload(trend: TrendSignal) {
  return {
    search_interest_score: clampScore(numberValue(trend.search_interest_score, 50), 50),
    search_interest_status: trend.search_interest_status || "pending_fallback_50",
    search_interest_queries: trend.queries || [],
    search_interest_fetched_at: trend.fetched_at || null,
  };
}

function realSearchInterestScore(trendInfo: {
  search_interest_score?: number | string | null;
  search_interest_status?: string | null;
  search_interest_fetched_at?: string | null;
}): number | string | null {
  const status = String(trendInfo.search_interest_status || "").toLowerCase();

  if (!trendInfo.search_interest_fetched_at) return null;
  if (status.includes("fallback") || status.includes("pending")) return null;

  const score = trendInfo.search_interest_score;
  if (score === null || score === undefined || score === "") return null;

  return score;
}

function opportunityLabel(score: number, coverageLevel?: string | null) {
  const coverage = String(coverageLevel || "").toLowerCase();

  if (score >= 60 && coverage === "low") return "Ευκαιρία ανάδειξης";
  if (score >= 60 && coverage === "medium") return "Χώρος για πλαισίωση";
  if (score >= 60 && coverage === "high") return "Ήδη στο κέντρο";
  return "Παρακολούθηση";
}

function articleKey(article: EvidenceArticle, fallback: string) {
  return String(article.article_id || article.url || `${article.source || "source"}-${article.title || fallback}`);
}

function eventToSituationRow(ev: any, trendMap = new Map<string, TrendSignal>(), coverageMap = new Map<string, number>(), trendsMap = new Map<string, number>()) {
  const trend = trendForTopic(trendMap, ev.topic);
  const trendInfo = trendPayload(trend);
  const rawSignal = numberValue(ev.event_score, 0);
  const boost = strategicBoostScore(ev);
  const strategicIndex = strategicIndexScore(rawSignal, trendInfo.search_interest_score, boost);
  const norayaPriority = computeNorayaPriorityScore({
    norayaScore: rawSignal,
    googleTrendsScore: trendsMap.get(String(ev.topic || "").trim()) ?? realSearchInterestScore(trendInfo),
    gdeltScore: coverageMap.get(String(ev.topic || "").trim()) ?? null,
    clientRelevanceScore: null,
  });

  return {
    id: ev.id,
    title: ev.title,
    topic: ev.topic,
    situation_key: ev.event_key,
    status: ev.status,
    situation_type: "event",
    is_event: true,

    priority_score: ev.event_score,
    public_attention_score: ev.event_score,
    raw_signal_score: rawSignal,
    search_interest_score: trendInfo.search_interest_score,
    search_interest_status: trendInfo.search_interest_status,
    search_interest_queries: trendInfo.search_interest_queries,
    search_interest_fetched_at: trendInfo.search_interest_fetched_at,
    strategic_boost_score: boost,
    strategic_index_score: strategicIndex,
    strategic_index_label: signalLabel(strategicIndex),

    noraya_priority_score: norayaPriority.score,
    noraya_priority_raw_score: norayaPriority.rawScore,
    noraya_priority_route: norayaPriority.route,
    noraya_priority_status: norayaPriority.status,
    noraya_priority_cap: norayaPriority.reliabilityCap,
    noraya_priority_signals: norayaPriority.signals,
    noraya_priority_routes: norayaPriority.routes,
    noraya_priority_formula_version: norayaPriority.formulaVersion,
    news_coverage_level: coverageMap.get(String(ev.topic || "").trim()) ?? null,
    google_trends_score: trendsMap.get(String(ev.topic || "").trim()) ?? null,

    documentation_level: ev.documentation_level,

    framing_summary: ev.framing_summary ?? ev.summary ?? null,
    recommended_action: ev.recommended_action ?? null,
    avoid_action: ev.avoid_action ?? null,
    red_team_warning: ev.red_team_warning ?? null,

    evidence_summary: ev.summary ?? null,
    evidence_article_count: ev.article_count ?? 0,
    article_count: ev.article_count ?? 0,
    source_count: ev.source_count ?? 0,
    evidence_articles: ev.evidence_articles ?? [],

    detection_method: ev.detection_method ?? null,
    first_seen_at: ev.first_seen_at ?? null,
    last_seen_at: ev.last_article_at ?? null,
    created_at: ev.first_seen_at ?? null,
    updated_at: ev.last_computed_at ?? null,

    advisor_brief: ev.advisor_brief ?? null,
  };
}

function buildAgendaOverview(agendaRows: any[] = [], eventRows: any[] = [], trendMap = new Map<string, TrendSignal>(), coverageMap = new Map<string, number>(), trendsMap = new Map<string, number>()) {
  const eventsByTopic = new Map<string, any[]>();

  for (const ev of eventRows || []) {
    const topic = String(ev?.topic || "").trim();
    if (!topic) continue;
    if (!eventsByTopic.has(topic)) eventsByTopic.set(topic, []);
    eventsByTopic.get(topic)!.push(ev);
  }

  return (agendaRows || []).map((row) => {
    const topic = String(row?.name || row?.topic || "").trim();
    const relatedEventsRaw = eventsByTopic.get(topic) || [];
    const articleMap = new Map<string, EvidenceArticle>();

    for (const ev of relatedEventsRaw) {
      const articles = Array.isArray(ev?.evidence_articles) ? ev.evidence_articles : [];
      for (const article of articles) {
        if (!article || typeof article !== "object") continue;
        const key = articleKey(article as EvidenceArticle, `${topic}-${articleMap.size}`);
        const existing = articleMap.get(key);
        const currentScore = numberValue((article as EvidenceArticle).score, 0);
        const existingScore = existing ? numberValue(existing.score, 0) : -1;
        if (!existing || currentScore > existingScore) {
          articleMap.set(key, article as EvidenceArticle);
        }
      }
    }

    const evidenceArticles = Array.from(articleMap.values())
      .sort((a, b) => {
        const scoreDiff = numberValue(b.score, 0) - numberValue(a.score, 0);
        if (scoreDiff !== 0) return scoreDiff;
        const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
        const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);

    const score = numberValue(row?.agenda_score, 0);
    const trend = trendForTopic(trendMap, topic);
    const trendInfo = trendPayload(trend);
    const relatedArticleCount = relatedEventsRaw.reduce((sum, ev) => sum + numberValue(ev?.article_count, 0), 0);
    const relatedSourceCount = Math.max(numberValue(row?.source_diversity, 0), ...relatedEventsRaw.map((ev) => numberValue(ev?.source_count, 0)), 0);
    const newestRelatedEvent = relatedEventsRaw
      .map((ev) => ev?.last_article_at || ev?.updated_at || ev?.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] || row?.updated_at;
    const boost = strategicBoostScore({
      article_count: relatedArticleCount || row?.article_count,
      source_count: relatedSourceCount,
      documentation_level: row?.documentation_level,
      political_risk_level: row?.political_risk_level,
      last_article_at: newestRelatedEvent,
      updated_at: row?.updated_at,
    });
    const opportunityBonus = trendInfo.search_interest_score >= 65 && String(row?.coverage_level || "").toLowerCase() === "low" ? 5 : 0;

    // ΠΟΛΙΤΙΚΗ ΒΑΡΥΤΗΤΑ (Φαση Α): θεματα χωρις πολιτικη διασταση δεν ανεβαινουν απο σκετο ογκο/αναζητησεις.
    // Χρησιμοποιει ΥΠΑΡΚΤΑ σηματα: political_risk_level (απο ταξινομηση) + υπαρξη πολιτικων γεγονοτων.
    const prl = String(row?.political_risk_level || "").toLowerCase();
    const politicalFactor =
      prl.includes("high") || prl.includes("υψηλ") ? 1.0
      : prl.includes("medium") || prl.includes("μεσ") || prl.includes("μετρ") ? 0.92
      : prl.includes("low") || prl.includes("χαμηλ") ? 0.78
      : 0.88;
    const eventsFactor = relatedEventsRaw.length === 0 ? 0.85 : 1.0; // κανενα πολιτικο γεγονος = ενδειξη θορυβου
    const politicalWeight = Math.round(politicalFactor * eventsFactor * 100) / 100;
    const weightedScore = Math.round(score * politicalWeight);

    const strategicIndex = strategicIndexScore(weightedScore, trendInfo.search_interest_score, boost, opportunityBonus);
    const norayaPriority = computeNorayaPriorityScore({
      norayaScore: weightedScore,
      googleTrendsScore: trendsMap.get(topic) ?? realSearchInterestScore(trendInfo),
      gdeltScore: coverageMap.get(topic) ?? null,
      clientRelevanceScore: null,
    });

    return {
      id: row?.id ?? topic,
      topic,
      category: row?.category ?? null,
      agenda_score: score,
      raw_signal_score: score,
      signal_label: signalLabel(score),
      search_interest_score: trendInfo.search_interest_score,
      search_interest_status: trendInfo.search_interest_status,
      search_interest_queries: trendInfo.search_interest_queries,
      search_interest_fetched_at: trendInfo.search_interest_fetched_at,
      strategic_boost_score: boost,
      strategic_index_score: strategicIndex,
      strategic_index_label: signalLabel(strategicIndex),

      noraya_priority_score: norayaPriority.score,
      noraya_priority_raw_score: norayaPriority.rawScore,
      noraya_priority_route: norayaPriority.route,
      noraya_priority_status: norayaPriority.status,
      noraya_priority_cap: norayaPriority.reliabilityCap,
      noraya_priority_signals: norayaPriority.signals,
      noraya_priority_routes: norayaPriority.routes,
      noraya_priority_formula_version: norayaPriority.formulaVersion,
      news_coverage_level: coverageMap.get(topic) ?? null,
      google_trends_score: trendsMap.get(topic) ?? null,

      strategic_index_components: {
        raw_signal: score,
        political_weight: politicalWeight,
        political_weighted_signal: weightedScore,
        search_interest: trendInfo.search_interest_score,
        strategic_boost: boost,
        opportunity_bonus: opportunityBonus,
        formula: "0.55*raw + 0.25*search + 0.20*boost + opportunity_bonus",
      },
      coverage_level: row?.coverage_level ?? null,
      source_diversity: row?.source_diversity ?? 0,
      documentation_level: row?.documentation_level ?? null,
      political_risk_level: row?.political_risk_level ?? null,
      opportunity_label: opportunityLabel(score, row?.coverage_level),
      events_detected_at: row?.events_detected_at ?? null,
      updated_at: row?.updated_at ?? null,
      related_events: relatedEventsRaw.slice(0, 8).map((ev) => ({
        id: ev.id,
        title: ev.title,
        topic: ev.topic,
        event_score: ev.event_score,
        status: ev.status,
        article_count: ev.article_count ?? 0,
        source_count: ev.source_count ?? 0,
        last_article_at: ev.last_article_at ?? null,
      })),
      evidence_articles: evidenceArticles,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const refresh = searchParams.get("refresh");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let refreshResult: unknown = null;

  if (refresh === "1" || refresh === "true") {
    const { data, error } = await supabase.rpc("refresh_situation_engine_all");
    if (error) {
      return NextResponse.json(
        { success: false, stage: "refresh_situation_engine_all", error: error.message },
        { status: 500 }
      );
    }
    refreshResult = data;
  }

  const {
    data: eventRows,
    error: eventError,
  } = await supabase
    .from("v_political_events_live")
    .select("*", { count: "exact" })
    .order("event_score", { ascending: false })
    .limit(60);

  const {
    data: agendaRows,
    error: agendaError,
  } = await supabase
    .from("agenda_topics")
    .select("id,name,category,agenda_score,coverage_level,source_diversity,documentation_level,political_risk_level,events_detected_at,updated_at")
    .is("organization_id", null)
    .neq("name", "Μη ταξινομημένο")
    .order("agenda_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false });

  const { data: trendRows, error: trendError } = await supabase
    .from("topic_trend_signals")
    .select("topic,search_interest_score,search_interest_status,queries,fetched_at")
    .eq("region", "GR")
    .eq("timeframe", "now 7-d");

  const trendMap = new Map<string, TrendSignal>();
  if (!trendError && Array.isArray(trendRows)) {
    for (const row of trendRows as TrendSignal[]) {
      const topic = String(row?.topic || "").trim();
      if (topic) trendMap.set(topic, row);
    }
  }

  // Google News coverage (Στρώση Β): analysis_cache -> topic -> coverage_level (0-100)
  const coverageMap = new Map<string, number>();
  const { data: coverageRows } = await supabase
    .from("analysis_cache")
    .select("result")
    .is("situation_id", null)
    .eq("analysis_kind", "news_coverage_v1")
    .limit(1);
  const coverageTopics =
    Array.isArray(coverageRows) && coverageRows[0] && (coverageRows[0] as any).result
      ? (coverageRows[0] as any).result.topics
      : null;
  if (coverageTopics && typeof coverageTopics === "object") {
    for (const [t, v] of Object.entries(coverageTopics as Record<string, any>)) {
      const key = String(t || "").trim();
      const lvl = numberValue((v as any)?.coverage_level, -1);
      if (key && lvl >= 0) coverageMap.set(key, lvl);
    }
  }

  // Google Trends (Στρώση Γ, best-effort): analysis_cache -> topic -> trends_score (0-100)
  const trendsMap = new Map<string, number>();
  const { data: trendsRows } = await supabase
    .from("analysis_cache")
    .select("result")
    .is("situation_id", null)
    .eq("analysis_kind", "trends_v1")
    .limit(1);
  const trendsTopics =
    Array.isArray(trendsRows) && trendsRows[0] && (trendsRows[0] as any).result
      ? (trendsRows[0] as any).result.topics
      : null;
  if (trendsTopics && typeof trendsTopics === "object") {
    for (const [t, v] of Object.entries(trendsTopics as Record<string, any>)) {
      const key = String(t || "").trim();
      const sc = numberValue((v as any)?.trends_score, -1);
      if (key && sc >= 0) trendsMap.set(key, sc);
    }
  }

  const allEventRows = (!eventError && Array.isArray(eventRows) ? eventRows : []).filter(
    (r: any) => !isSensitiveEvent((r as any)?.title) && !isForeignNoise((r as any)?.title) && !isCommercialNoise((r as any)?.title) && !isForeignPolitics((r as any)?.title),
  );
  // ΒΗΜΑ 1 — ΦΙΛΤΡΟ (gate): μόνο ΦΡΕΣΚΑ θέματα (≤48 ώρες, βάσει ημερομηνίας πιο πρόσφατου άρθρου).
  //          Η φρεσκάδα ΔΕΝ είναι κριτήριο σημαντικότητας — μόνο "ποιος μπαίνει στο γήπεδο".
  const FRESH_GATE = 75; // freshnessScore >= 75  ⇔  ≤48 ώρες
  const eligibleEventRows = allEventRows.filter((r) => {
    const f = freshnessScore((r as any).last_article_at || (r as any).updated_at || (r as any).first_seen_at);
    return f >= FRESH_GATE;
  });
  // Δίχτυ ασφαλείας: αν ΚΑΝΕΝΑ θέμα δεν είναι ≤48ώρου, δείχνουμε όλα (καλύτερα κάτι παρά κενή οθόνη).
  const gatedPool = eligibleEventRows.length > 0 ? eligibleEventRows : allEventRows;
  // ΒΗΜΑ 2 — ΚΑΤΑΤΑΞΗ (ranking): ΚΑΘΑΡΑ κατά Agenda Score (σημαντικότητα). Η φρεσκάδα δεν αλλάζει τη σειρά.
  const safeEventRows = gatedPool
    .slice()
    .sort((a, b) => numberValue((b as any).event_score, 0) - numberValue((a as any).event_score, 0))
    .slice(0, 25);
  const agendaOverview = !agendaError && Array.isArray(agendaRows)
    ? buildAgendaOverview(agendaRows, safeEventRows, trendMap, coverageMap, trendsMap)
    : [];

  // Δρόμος Β: ανάλυση ΑΝΑ ΚΟΜΜΑ — φέρε το brief του ενεργού κόμματος και μπόλιασέ το στα γεγονότα.
  const party = searchParams.get("party") || "elas";
  if (safeEventRows.length) {
    const eventIds = safeEventRows.map((e: any) => e.id).filter(Boolean);
    if (eventIds.length) {
      const { data: pbRows } = await supabase
        .from("event_party_briefs")
        .select("event_id,advisor_brief,framing_summary,recommended_action,avoid_action,red_team_warning,summary,brief_generated_at")
        .eq("party_key", party)
        .in("event_id", eventIds);
      if (Array.isArray(pbRows)) {
        const pbMap = new Map<string, any>();
        for (const r of pbRows) pbMap.set(String((r as any).event_id), r);
        for (const ev of safeEventRows as any[]) {
          const pb = pbMap.get(String(ev.id));
          if (pb) {
            ev.advisor_brief = pb.advisor_brief ?? ev.advisor_brief;
            ev.framing_summary = pb.framing_summary ?? ev.framing_summary;
            ev.recommended_action = pb.recommended_action ?? ev.recommended_action;
            ev.avoid_action = pb.avoid_action ?? ev.avoid_action;
            ev.red_team_warning = pb.red_team_warning ?? ev.red_team_warning;
            ev.summary = pb.summary ?? ev.summary;
            ev.brief_generated_at = pb.brief_generated_at ?? ev.brief_generated_at;
          }
        }
      }
    }
  }

  if (!eventError && safeEventRows.length > 0) {
    const situations = safeEventRows.map((ev) => eventToSituationRow(ev, trendMap, coverageMap, trendsMap));
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      refreshed: refresh === "1" || refresh === "true",
      refresh_result: refreshResult,
      count: situations.length,
      returned_count: situations.length,
      source: "v_political_events_live",
      fallback_used: false,
      agenda_overview: agendaOverview,
      agenda_overview_error: agendaError?.message ?? null,
      trends_error: trendError?.message ?? null,
      situations,
    });
  }

  const {
    data: liveSituations,
    error: liveError,
    count: liveCount,
  } = await supabase
    .from("v_situation_engine_live")
    .select("*", { count: "exact" })
    .limit(25);

  if (liveError) {
    return NextResponse.json(
      { success: false, stage: "read_v_situation_engine_live", error: liveError.message },
      { status: 500 }
    );
  }

  let source = "v_situation_engine_live";
  let fallbackUsed = false;
  let situations = liveSituations || [];
  let totalCount = liveCount ?? situations.length;

  if (situations.length === 0) {
    const {
      data: fallbackSituations,
      error: fallbackError,
      count: fallbackCount,
    } = await supabase
      .from("political_situations")
      .select("*", { count: "exact" })
      .limit(25);

    if (fallbackError) {
      return NextResponse.json(
        { success: false, stage: "fallback_read_political_situations", error: fallbackError.message },
        { status: 500 }
      );
    }

    source = "political_situations";
    fallbackUsed = true;
    situations = fallbackSituations || [];
    totalCount = fallbackCount ?? situations.length;
  }

  // ── ΦΡΕΣΚΑΔΑ 48ΩΡΟΥ στην ΠΡΑΓΜΑΤΙΚΗ πηγή ──────────────────────────────
  // Κρίνεται από την ημερομηνία του ΠΙΟ ΠΡΟΣΦΑΤΟΥ ΑΡΘΡΟΥ του γεγονότος
  // (όχι από updated_at/last_seen_at που τα τσιμπάει το radar).
  const newestArticleMs = (sit: any): number => {
    const arr = Array.isArray(sit?.evidence_articles)
      ? sit.evidence_articles
      : Array.isArray(sit?.evidence_snapshot)
      ? sit.evidence_snapshot
      : [];
    let max = 0;
    for (const ev of arr) {
      const raw = ev?.published_at ?? ev?.article_published_at ?? null;
      const t = raw ? new Date(String(raw)).getTime() : 0;
      if (Number.isFinite(t) && t > max) max = t;
    }
    if (!max) {
      const cand = sit?.last_seen_at || sit?.updated_at || sit?.created_at;
      const t = cand ? new Date(String(cand)).getTime() : 0;
      if (Number.isFinite(t)) max = t;
    }
    return max;
  };
  const FRESH_MS = 48 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const rankedByArticle = [...situations].sort((a, b) => newestArticleMs(b) - newestArticleMs(a));
  const freshOnly = rankedByArticle.filter((s) => {
    const t = newestArticleMs(s);
    return t > 0 && nowMs - t <= FRESH_MS;
  });
  situations = (freshOnly.length > 0 ? freshOnly : rankedByArticle).slice(0, 25);
  totalCount = situations.length;
  // ──────────────────────────────────────────────────────────────────────

  return NextResponse.json({
    agenda_overview: agendaOverview,
    agenda_overview_error: agendaError?.message ?? null,
    trends_error: trendError?.message ?? null,
    situations,
  });
}
