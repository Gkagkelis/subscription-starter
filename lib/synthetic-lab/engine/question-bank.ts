// ============================================================
// Τράπεζα ερωτήσεων με εμπειρική βάση: ερωτήσεις πραγματικών ερευνών που
// μπορούν να μπουν αυτούσιες σε μια συνθετική μελέτη. Οι απαντήσεις τους
// ακολουθούν τις μετρημένες κατανομές ανά ομάδα (ηλικία×φύλο, μόρφωση,
// περιφέρεια) — είναι εκτίμηση από την πηγή, όχι νέα μέτρηση.
// ============================================================

import { getMetric, listMetrics, metricSourceLabel, metricTier, latestWave } from '../data/noraya';
import { researchQuestion, researchQuestions, type ResearchQuestion } from '../data/research';
import type { Question } from '../types';

export interface BankEntry {
  id: string; // research question id ή metric id
  kind: 'distribution' | 'binary';
  text: string;
  options: string[];
  source: string;
  tier: 'open' | 'research_only';
  waveKey: string | null;
  n: number | null;
  /** Συνολικά παρατηρημένα ποσοστά ανά επιλογή (για προεπισκόπηση). */
  observed: { option: string; value: number }[];
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
function binaryEntries(): BankEntry[] {
  return listMetrics()
    .filter((m) => m.scheme === 'eurostat_ict' && m.question)
    .map((m) => {
      const w = latestWave(m.metric);
      const v = w?.groups.all?.all?.value;
      return {
        id: m.metric,
        kind: 'binary' as const,
        text: m.question!,
        options: ['Ναι', 'Όχι'],
        source: metricSourceLabel(m.metric),
        tier: metricTier(m.metric),
        waveKey: w?.key || null,
        n: null,
        observed: v === undefined ? [] : [{ option: 'Ναι', value: v }, { option: 'Όχι', value: Math.round((100 - v) * 100) / 100 }]
      };
    });
}

function distributionEntry(rq: ResearchQuestion): BankEntry {
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
    n: rq.n,
    observed
  };
}

export function bankEntries(): BankEntry[] {
  return [...binaryEntries(), ...researchQuestions().map(distributionEntry)];
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
  const hits = q.size ? all.filter((e) => e.score > 0).sort((a, b) => b.score - a.score) : all;
  return hits.slice(0, limit);
}

/** Μετατροπή εγγραφής της τράπεζας σε ερώτηση μελέτης. */
export function bankQuestion(entryId: string, questionId: string): Question | null {
  const rq = researchQuestion(entryId);
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
      evidenceLink: { datasetId: rq.datasetId, metric: rq.optionMetrics[top] || firstMetric, positiveOption: top, optionMetrics: rq.optionMetrics }
    };
  }
  const m = getMetric(entryId);
  if (m && m.question) {
    return {
      id: questionId,
      type: 'single_choice',
      text: m.question,
      options: ['Ναι', 'Όχι'],
      evidenceLink: { datasetId: m.datasetId || 'eurostat-isoc-ict', metric: m.metric, positiveOption: 'Ναι' }
    };
  }
  return null;
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
    .sort((a, b) => b.score - a.score || b.rq.n - a.rq.n)
    .slice(0, max)
    .map((x) => x.rq);
}
