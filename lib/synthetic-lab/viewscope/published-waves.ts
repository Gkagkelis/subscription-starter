// ============================================================
// Viewscope v2 — Π4: δρομολόγηση ερώτησης σε ΠΡΟΗΓΟΥΜΕΝΟ ΔΗΜΟΣΙΕΥΜΕΝΟ κύμα της ίδιας ερώτησης.
//
// Κανόνες (προκαταχωρημένοι: docs/synthetic-lab/VIEWSCOPE_V2_PREREGISTRATION.md, πριν από οποιαδήποτε βαθμολόγηση):
//   1. Χρονικός φραγμός: μόνο εγγραφές που έγιναν δημόσιες (availableAt) ΠΡΙΝ από την έναρξη του πεδίου της μελέτης-στόχου.
//   2. Ίδιος φορέας (sameOrg) για τη διαδρομή prev_wave_same_org. Άλλος φορέας → μόνο αν ζητηθεί ρητά (prev_wave_other_org, μη επικυρωμένη).
//   3. Ίδια ερώτηση: ομοιότητα τριγραμμάτων ≥ 0,85 ΚΑΙ ίδιες οντότητες (ονόματα προσώπων/κομμάτων/θεσμών).
//   4. Ίδιες επιλογές: κάθε επιλογή-στόχος αντιστοιχεί σε ακριβώς μία επιλογή της πηγής (κανονικοποιημένη ισότητα ή
//      ομοιότητα ≥ 0,8)· καμία επιλογή της πηγής > 2 π.μ. χωρίς αντιστοίχιση. Μόνο το «ΔΓ/ΔΑ» επιτρέπεται να λείπει από την
//      πηγή (τότε = 100 − άθροισμα, αν το άθροισμα είναι 98–100). Ποτέ σιωπηλό 0% σε νέα επιλογή.
//   5. Μέγιστη ηλικία κύματος: από την ιστορική δοκιμή (calibration < 2025)· βλ. config/synthetic-lab/viewscope/routes.json.
//   6. Μόνο εγγραφές υψηλής ποιότητας (άθροισμα ≈ 100 ή επαληθευμένη δεύτερη καταχώριση).
// Κατηγορία της νέας συνθετικής εκτίμησης: T (μεταφερόμενη), ΠΟΤΕ αυτόματα E — η πηγή είναι πραγματική, η εκτίμηση για τη
// νέα χρονική στιγμή δεν είναι μέτρηση.
// ============================================================
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { dataRoot } from '../storage/paths';
import { isDkOption, normalize, orgKey, sameEntities, trigramJaccard } from './text';

export interface PublishedWave {
  id: string;
  org: string;
  orgLabel: string | null;
  question: string;
  options: string[];
  values: number[];
  n: number | null;
  fieldworkStart: string | null;
  fieldworkEnd: string | null;
  publishedAt: string | null;
  availableAt: string | null;
  doc: { docId: string; sha256: string | null; page: number | null; url: string | null; title: string | null };
  kind: string | null;
  extraction: { method: string; secondEntry?: string | null; sumOk?: boolean };
  quality: 'high' | 'low';
}

/**
 * minQuestionChars: ΜΕΤΑΓΕΝΕΣΤΕΡΟΣ ΣΥΝΤΗΡΗΤΙΚΟΣ περιορισμός (μετά την ιστορική δοκιμή): κομμένα κείμενα ερωτήσεων από την αυτόματη
 * εξαγωγή (π.χ. «διακυβέρνηση της χώρας;») δεν αρκούν για ταύτιση. Μόνο μειώνει τις δρομολογήσεις· η κύρια προκαταχωρημένη δοκιμή
 * αναφέρεται χωρίς αυτόν, με ανάλυση ευαισθησίας (benchmarks/viewscope_v2/results/prev_wave_backtest*.json).
 */
export const PW_RULES = { textMin: 0.85, optionMin: 0.8, unmatchedSourceMaxPp: 2, dkFillMinSum: 98, minQuestionChars: 40 } as const;

let cache: { file: string; entries: PublishedWave[] } | null = null;
export function loadPublishedWaves(file?: string): PublishedWave[] {
  const f = file || path.join(dataRoot(), 'viewscope', 'published_waves.json');
  if (cache && cache.file === f) return cache.entries;
  const entries = existsSync(f) ? ((JSON.parse(readFileSync(f, 'utf8')).entries || []) as PublishedWave[]) : [];
  cache = { file: f, entries };
  return entries;
}

export interface TargetQuestion { text: string; options: string[] }

/** Αντιστοίχιση επιλογών (κανόνας 4). Επιστρέφει κατανομή στις επιλογές-στόχους (άθροισμα 100) ή null με αιτία. */
export function mapOptions(target: string[], src: { options: string[]; values: number[] }): { dist: number[] | null; reason: string } {
  const used = new Set<number>();
  const idx: (number | null)[] = target.map((t) => {
    let best = -1, bs = 0;
    src.options.forEach((o, j) => {
      if (used.has(j)) return;
      const s = normalize(o) === normalize(t) || (isDkOption(o) && isDkOption(t)) ? 1 : trigramJaccard(o, t);
      if (s > bs) { bs = s; best = j; }
    });
    if (best >= 0 && bs >= PW_RULES.optionMin) { used.add(best); return best; }
    return null;
  });
  const unmatchedSrc = src.options.reduce((s, _, j) => s + (used.has(j) ? 0 : src.values[j] || 0), 0);
  if (unmatchedSrc > PW_RULES.unmatchedSourceMaxPp) return { dist: null, reason: `επιλογές της πηγής χωρίς αντιστοίχιση (${unmatchedSrc.toFixed(1)} π.μ.)` };
  const sum = idx.reduce((s: number, j) => s + (j === null ? 0 : src.values[j] || 0), 0);
  const raw = idx.map((j, i) => {
    if (j !== null) return src.values[j] || 0;
    if (isDkOption(target[i]) && sum >= PW_RULES.dkFillMinSum && sum <= 100.5) return Math.max(0, 100 - sum);
    return NaN;
  });
  if (raw.some((x) => Number.isNaN(x))) return { dist: null, reason: `επιλογές-στόχοι χωρίς αντιστοίχιση: ${target.filter((_, i) => Number.isNaN(raw[i])).join(', ')}` };
  const tot = raw.reduce((s, x) => s + x, 0);
  if (tot <= 0) return { dist: null, reason: 'μηδενικό άθροισμα' };
  return { dist: raw.map((x) => (100 * x) / tot), reason: 'ok' };
}

export function monthsBetween(a: string, b: string): number {
  const d = (Date.parse(b) - Date.parse(a)) / 86_400_000;
  return d / 30.4375;
}

export interface WaveRouteResult {
  routed: boolean;
  route: 'prev_wave_same_org' | 'prev_wave_other_org' | null;
  evidenceClass: 'T' | null;
  dist: Record<string, number> | null;
  source: PublishedWave | null;
  textSimilarity: number | null;
  ageMonths: number | null;
  reason: string;
  candidates: number;
}

/**
 * Βρίσκει το πιο πρόσφατο κατάλληλο δημοσιευμένο κύμα (κανόνες 1–6). Καμία αλλαγή σε υπάρχοντες μηχανισμούς·
 * το αποτέλεσμα χρησιμοποιείται μόνο από τον προαιρετικό Viewscope v2 runner.
 */
export function routePublishedWave(
  q: TargetQuestion,
  ctx: { org: string | null; fieldworkStart: string; maxAgeMonths: number; allowOtherOrg?: boolean; entries?: PublishedWave[]; excludeDocIds?: string[]; minQuestionChars?: number }
): WaveRouteResult {
  const minChars = ctx.minQuestionChars ?? PW_RULES.minQuestionChars;
  const entries = ctx.entries || loadPublishedWaves();
  const want = ctx.org ? orgKey(ctx.org) : null;
  const none = (reason: string, candidates = 0): WaveRouteResult => ({ routed: false, route: null, evidenceClass: null, dist: null, source: null, textSimilarity: null, ageMonths: null, reason, candidates });
  if ((q.text || '').trim().length < minChars) return none(`το κείμενο της ερώτησης είναι πολύ σύντομο για ασφαλή ταύτιση (< ${minChars} χαρακτήρες)`);
  const pool = entries.filter((e) => e.quality === 'high' && e.availableAt && e.availableAt < ctx.fieldworkStart && e.question.trim().length >= minChars && !(ctx.excludeDocIds || []).includes(e.doc.docId));
  const textual = pool
    .map((e) => ({ e, sim: trigramJaccard(e.question, q.text) }))
    .filter((x) => x.sim >= PW_RULES.textMin && sameEntities(x.e.question, q.text));
  if (!textual.length) return none('δεν βρέθηκε ίδια δημοσιευμένη ερώτηση πριν από το πεδίο');
  const tried: string[] = [];
  for (const sameOrg of [true, false]) {
    if (!sameOrg && !ctx.allowOtherOrg) break;
    const cands = textual
      .filter((x) => (want ? (x.e.org === want) === sameOrg : !sameOrg))
      .sort((a, b) => (b.e.availableAt! < a.e.availableAt! ? -1 : b.e.availableAt! > a.e.availableAt! ? 1 : b.sim - a.sim));
    for (const c of cands) {
      const age = monthsBetween(c.e.fieldworkEnd || c.e.availableAt!, ctx.fieldworkStart);
      if (age > ctx.maxAgeMonths) { tried.push(`${c.e.id}: παλαιότερο από ${ctx.maxAgeMonths} μήνες`); break; }
      const m = mapOptions(q.options, c.e);
      if (!m.dist) { tried.push(`${c.e.id}: ${m.reason}`); continue; }
      return {
        routed: true,
        route: sameOrg ? 'prev_wave_same_org' : 'prev_wave_other_org',
        evidenceClass: 'T',
        dist: Object.fromEntries(q.options.map((o, i) => [o, m.dist![i]])),
        source: c.e,
        textSimilarity: c.sim,
        ageMonths: age,
        reason: 'ok',
        candidates: cands.length
      };
    }
  }
  return none(tried.length ? tried.slice(0, 3).join(' · ') : 'μόνο άλλοι φορείς (δεν επιτρέπεται χωρίς ρητή επιλογή)', textual.length);
}
