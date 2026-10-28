// ============================================================
// Τράπεζα ερωτήσεων με εμπειρική βάση: ερωτήσεις πραγματικών ερευνών που
// μπορούν να μπουν αυτούσιες σε μια συνθετική μελέτη. Οι απαντήσεις τους
// ακολουθούν τις μετρημένες κατανομές ανά ομάδα (ηλικία×φύλο, μόρφωση,
// περιφέρεια) — είναι εκτίμηση από την πηγή, όχι νέα μέτρηση.
// ============================================================

import { getMetric, listMetrics, metricSourceLabel, metricTier, latestWave, openQuestions, type OpenQuestion } from '../data/noraya';
import { researchQuestion, researchQuestions, type ResearchQuestion } from '../data/research';
import { lakeQuestion, searchLake, type RetrievalHit, type RetrievalOptions } from '../data/lake';
import type { Question } from '../types';

export interface BankEntry {
  id: string; // research question id ή metric id
  kind: 'distribution' | 'binary';
  text: string;
  options: string[];
  source: string;
  tier: 'open' | 'research_only';
  waveKey: string | null;
  /** Έτη στα οποία υπάρχει μέτρηση (για ερωτήσεις που επαναλαμβάνονται). */
  years?: number[];
  n: number | null;
  /** Συνολικά παρατηρημένα ποσοστά ανά επιλογή (για προεπισκόπηση). */
  observed: { option: string; value: number }[];
  /** Προέλευση (μόνο για ερωτήσεις του Greek Research Data Lake). */
  lake?: { studyId: string; title: string; source: string; level: string; quality: number | null; year: number; url: string | null; score: number };
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ');
}

const STOP = new Set(['ποια', 'ποιοσ', 'ποιεσ', 'ποιο', 'πωσ', 'πολυ', 'λιγο', 'οτι', 'αυτο', 'αυτη', 'αυτεσ', 'αυτα', 'ειναι', 'εχετε', 'σασ', 'μασ', 'στην', 'στον', 'στο', 'στα', 'στισ', 'στουσ', 'απο', 'για', 'και', 'μια', 'ενα', 'εναν', 'οπωσ', 'καθε', 'μεταξυ', 'παρακατω', 'γενικα', 'σημερα', 'ελλαδα', 'ελληνεσ', 'θεωρειτε', 'πιστευετε', 'συμφωνειτε']);

function stems(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/[^a-zα-ω0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.slice(0, 5))
  );
}

/** Δυαδικοί δείκτες ανοιχτών πηγών που έχουν διατύπωση ερώτησης (Eurostat ΤΠΕ). */
/** Επιλογές και «θετική» επιλογή (αυτή που μετρά ο δείκτης) δυαδικού δείκτη. */
function binaryOptions(m: { answerOptions?: string[]; positiveOption?: string }): { options: string[]; positive: string } {
  const options = m.answerOptions?.length === 2 ? m.answerOptions : ['Ναι', 'Όχι'];
  return { options, positive: m.positiveOption && options.includes(m.positiveOption) ? m.positiveOption : options[0] };
}

function binaryEntries(): BankEntry[] {
  return listMetrics()
    .filter((m) => (m.scheme === 'eurostat_ict' || m.scheme === 'eurostat_silc') && m.question && !OPEN_OPTION_METRICS().has(m.metric))
    .map((m) => {
      const w = latestWave(m.metric);
      const v = w?.groups.all?.all?.value;
      const { options, positive } = binaryOptions(m);
      return {
        id: m.metric,
        kind: 'binary' as const,
        text: m.question!,
        options,
        source: metricSourceLabel(m.metric),
        tier: metricTier(m.metric),
        waveKey: w?.key || null,
        n: null,
        observed: v === undefined ? [] : options.map((o) => ({ option: o, value: o === positive ? v : Math.round((100 - v) * 100) / 100 }))
      };
    });
}

/** Δείκτες που ανήκουν σε ερωτήσεις κατανομής ανοιχτών πηγών (δεν εμφανίζονται ως δυαδικοί). */
const OPEN_OPTION_METRICS = () => new Set(openQuestions().flatMap((q) => Object.values(q.optionMetrics)));

function distributionEntry(rq: ResearchQuestion | OpenQuestion): BankEntry {
  const first = Object.values(rq.optionMetrics)[0];
  const observed = rq.options
    .map((o) => {
      const c = latestWave(rq.optionMetrics[o])?.groups.all?.all;
      return c ? { option: o, value: c.value } : null;
    })
    .filter((x): x is { option: string; value: number } => !!x);
  return {
    id: rq.id,
    kind: 'distribution',
    text: rq.text,
    options: rq.options,
    source: metricSourceLabel(first),
    tier: metricTier(first),
    waveKey: latestWave(first)?.key || null,
    years: 'years' in rq ? rq.years : undefined,
    n: rq.n || null,
    observed
  };
}

function lakeEntry(h: RetrievalHit): BankEntry & { score: number } {
  const q = h.question;
  const observed = q.options
    .map((o) => {
      const c = latestWave(q.optionMetrics[o] || '')?.groups.all?.all;
      return c ? { option: o, value: c.value } : null;
    })
    .filter((x): x is { option: string; value: number } => !!x);
  if (q.kind === 'binary' && observed.length === 1) observed.push({ option: 'Όχι', value: Math.round((100 - observed[0].value) * 100) / 100 });
  return {
    id: q.id,
    kind: q.kind,
    text: q.text,
    options: q.options,
    source: `${h.study.title} — ${h.study.publisher || h.study.source}`,
    tier: h.study.tier,
    waveKey: String(h.year),
    years: q.years,
    n: q.n,
    observed,
    lake: { studyId: h.study.studyId, title: h.study.title, source: h.study.source, level: h.study.level, quality: h.study.quality, year: h.year, url: h.study.url, score: Math.round(h.score * 1000) / 1000 },
    score: h.breakdown.matched.length
  };
}

/** Ερωτήσεις του Greek Research Data Lake για ένα ερώτημα (με χρονικό όριο/holdout). */
export function searchLakeBank(query: string, limit = 20, opts: RetrievalOptions = {}): (BankEntry & { score: number })[] {
  return searchLake(query, { ...opts, limit }).map(lakeEntry);
}

export function bankEntries(): BankEntry[] {
  return [...binaryEntries(), ...openQuestions().map(distributionEntry), ...researchQuestions().map(distributionEntry)];
}

/** Αναζήτηση στην τράπεζα (λέξεις-ρίζες· κενό ερώτημα -> όλα). */
export function searchBank(query: string, limit = 50): (BankEntry & { score: number })[] {
  const q = stems(query);
  const all = bankEntries().map((e) => {
    const t = stems(`${e.text} ${e.options.join(' ')}`);
    let score = 0;
    q.forEach((s) => t.has(s) && score++);
    return { ...e, score };
  });
  const recency = (e: BankEntry) => (e.waveKey || '').slice(0, 4);
  const hits = (q.size ? all.filter((e) => e.score > 0) : all).sort(
    (a, b) => b.score - a.score || recency(b).localeCompare(recency(a)) || (b.years?.length || 0) - (a.years?.length || 0)
  );
  // + Greek Research Data Lake (αν υπάρχει τοπικά): μόνο με ερώτημα
  const lake = q.size ? searchLakeBank(query, limit) : [];
  return [...hits.slice(0, Math.max(limit - Math.min(lake.length, Math.ceil(limit / 2)), 0)), ...lake].slice(0, limit);
}

/** Μετατροπή εγγραφής της τράπεζας σε ερώτηση μελέτης. */
export function bankQuestion(entryId: string, questionId: string): Question | null {
  const rq: ResearchQuestion | OpenQuestion | null = researchQuestion(entryId) || openQuestions().find((q) => q.id === entryId) || null;
  if (rq) {
    const firstMetric = Object.values(rq.optionMetrics)[0];
    // θετική/αναφοράς επιλογή = η συχνότερη ουσιαστική απάντηση (όχι ΔΓ/ΔΑ)
    const substantive = rq.options.filter((o) => !rq.dkOptions.includes(o));
    const ranked = (substantive.length ? substantive : rq.options)
      .map((o) => ({ o, v: latestWave(rq.optionMetrics[o])?.groups.all?.all?.value ?? -1 }))
      .sort((a, b) => b.v - a.v);
    const top = ranked[0]?.o || rq.options[0];
    return {
      id: questionId,
      type: 'single_choice',
      text: rq.text.length > 500 ? rq.text.slice(0, 497) + '…' : rq.text,
      options: rq.options,
      evidenceLink: { datasetId: rq.datasetId || 'eurostat-silc', metric: rq.optionMetrics[top] || firstMetric, positiveOption: top, optionMetrics: rq.optionMetrics }
    };
  }
  const lq = lakeQuestion(entryId);
  if (lq) {
    const om = lq.optionMetrics;
    if (lq.kind === 'binary') {
      const metric = Object.values(om)[0];
      return { id: questionId, type: 'single_choice', text: lq.text.slice(0, 500), options: ['Ναι', 'Όχι'], evidenceLink: { datasetId: lq.studyId, metric, positiveOption: 'Ναι' } };
    }
    const substantive = lq.options.filter((o) => !lq.dkOptions.includes(o));
    const top =
      (substantive.length ? substantive : lq.options)
        .map((o) => ({ o, v: latestWave(om[o])?.groups.all?.all?.value ?? -1 }))
        .sort((a, b) => b.v - a.v)[0]?.o || lq.options[0];
    return {
      id: questionId,
      type: 'single_choice',
      text: lq.text.length > 500 ? lq.text.slice(0, 497) + '…' : lq.text,
      options: lq.options.slice(0, 12),
      evidenceLink: { datasetId: lq.studyId, metric: om[top], positiveOption: top, optionMetrics: Object.fromEntries(lq.options.slice(0, 12).map((o) => [o, om[o]])) }
    };
  }
  const m = getMetric(entryId);
  if (m && m.question) {
    const { options, positive } = binaryOptions(m);
    return {
      id: questionId,
      type: 'single_choice',
      text: m.question,
      options,
      evidenceLink: { datasetId: m.datasetId || 'eurostat-isoc-ict', metric: m.metric, positiveOption: positive }
    };
  }
  return null;
}

/**
 * Προτάσεις του lake για τον planner: ερωτήσεις με ισχυρή επικάλυψη (≥2 ρίζες), μία ανά μελέτη,
 * σεβόμενες το έτος αναφοράς και το holdout.
 */
export function suggestLakeQuestions(text: string, max = 2, opts: RetrievalOptions = {}): RetrievalHit[] {
  const out: RetrievalHit[] = [];
  const seen = new Set<string>();
  for (const h of searchLake(text, { ...opts, limit: 200 })) {
    if (h.breakdown.matched.length < 2 || h.breakdown.relevance < 0.5) continue;
    if (h.question.options.length > 12 || seen.has(h.study.studyId)) continue;
    seen.add(h.study.studyId);
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

/** Προτάσεις για τον planner: ερωτήσεις πηγών με ισχυρή θεματική επικάλυψη. */
export function suggestResearchQuestions(text: string, max = 2): ResearchQuestion[] {
  const q = stems(text);
  if (!q.size) return [];
  return researchQuestions()
    .map((rq) => {
      const t = stems(rq.text);
      let score = 0;
      q.forEach((s) => t.has(s) && score++);
      return { rq, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || Math.max(...(b.rq.years || [0])) - Math.max(...(a.rq.years || [0])) || b.rq.n - a.rq.n)
    .filter((x, i, arr) => arr.findIndex((y) => norm(y.rq.text) === norm(x.rq.text)) === i) // ίδια διατύπωση σε άλλο κύμα
    .slice(0, max)
    .map((x) => x.rq);
}
