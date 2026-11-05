// Viewscope v2 — ιστορική δοκιμή της διαδρομής «προηγούμενο δημοσιευμένο κύμα» (κανόνες: VIEWSCOPE_V2_PREREGISTRATION.md §Α).
// Βαθμονόμηση: στόχοι < 2025-01-01 (επιλογή μέγιστης ηλικίας). Επικύρωση: 2025-01-01 … 2026-09-30. Η Phase 7A ΔΕΝ χρησιμοποιείται.
//   tsx scripts/synthetic-lab/viewscope/backtest_prev_wave.ts
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { loadPublishedWaves, routePublishedWave, type PublishedWave } from '../../../lib/synthetic-lab/viewscope/published-waves';

const OUT = path.resolve(__dirname, '../../../benchmarks/viewscope_v2/results');
const B5_MAE = 4.39;
const AGES = [1, 2, 3, 4, 6, 9, 12, 18, 24];
const CAL_END = '2025-01-01', VAL_END = '2026-10-01';

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);

interface Pair { target: string; source: string; org: string; date: string; ageMonths: number; mae: number; maeUniform: number; split: 'cal' | 'val'; kind: string | null; question: string }

function main(minQuestionChars: number, suffix: string) {
  const all = loadPublishedWaves();
  const pairs: Pair[] = [];
  for (const t of all) {
    if (t.quality !== 'high' || t.extraction.method !== 'pdf_text_auto') continue; // στόχοι: μόνο αυτόματοι πίνακες (οι 12 Metron είναι πηγές της 7A)
    const start = t.fieldworkStart || t.publishedAt;
    if (!start || start >= VAL_END) continue;
    const r = routePublishedWave({ text: t.question, options: t.options }, { org: t.org, fieldworkStart: start, maxAgeMonths: 1200, excludeDocIds: [t.doc.docId], entries: all, minQuestionChars });
    if (!r.routed || r.route !== 'prev_wave_same_org') continue;
    const tot = t.values.reduce((s, x) => s + x, 0);
    const truth = t.values.map((x) => (100 * x) / tot);
    const pred = t.options.map((o) => r.dist![o]);
    const mae = mean(truth.map((x, i) => Math.abs(x - pred[i])));
    const maeU = mean(truth.map((x) => Math.abs(x - 100 / truth.length)));
    pairs.push({ target: t.id, source: r.source!.id, org: t.org, date: start, ageMonths: r.ageMonths!, mae, maeUniform: maeU, split: start < CAL_END ? 'cal' : 'val', kind: t.kind, question: t.question.slice(0, 120) });
  }
  // επιλογή μέγιστης ηλικίας μόνο στη βαθμονόμηση
  const cal = pairs.filter((p) => p.split === 'cal');
  const table = AGES.map((A, i) => {
    const prev = i ? AGES[i - 1] : 0;
    const bucket = cal.filter((p) => p.ageMonths > prev && p.ageMonths <= A);
    const cum = cal.filter((p) => p.ageMonths <= A);
    return { A, bucketN: bucket.length, bucketMAE: bucket.length ? mean(bucket.map((p) => p.mae)) : null, cumN: cum.length, cumMAE: cum.length ? mean(cum.map((p) => p.mae)) : null };
  });
  let chosen: number | null = null;
  for (const row of table) {
    if (row.cumN >= 10 && row.cumMAE !== null && row.cumMAE <= B5_MAE) chosen = row.A;
    else if (row.cumN >= 10) break;
  }
  const val = pairs.filter((p) => p.split === 'val' && chosen !== null && p.ageMonths <= chosen);
  const rnd = mulberry32(20261105);
  const diffs = val.map((p) => p.mae - p.maeUniform);
  const boots: number[] = [];
  for (let b = 0; b < 4000; b++) { let s = 0; for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)]; boots.push(s / Math.max(1, diffs.length)); }
  boots.sort((a, b) => a - b);
  const ci: [number, number] = diffs.length ? [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]] : [NaN, NaN];
  const valMAE = val.length ? mean(val.map((p) => p.mae)) : null;
  const accepted = chosen !== null && valMAE !== null && valMAE <= B5_MAE && ci[1] < 0;
  const byOrg: Record<string, { n: number; mae: number }> = {};
  val.forEach((p) => { byOrg[p.org] = byOrg[p.org] || { n: 0, mae: 0 }; byOrg[p.org].n++; byOrg[p.org].mae += p.mae; });
  Object.values(byOrg).forEach((v) => (v.mae = v.mae / v.n));
  const res = {
    variant: suffix ? 'μετά τον συντηρητικό περιορισμό minQuestionChars=40 (ανάλυση ευαισθησίας)' : 'κύρια προκαταχωρημένη (χωρίς ελάχιστο μήκος κειμένου)',
    preregistration: 'docs/synthetic-lab/VIEWSCOPE_V2_PREREGISTRATION.md §Α',
    registryEntries: all.length,
    pairs: { total: pairs.length, calibration: cal.length, validation: pairs.filter((p) => p.split === 'val').length },
    calibrationTable: table,
    chosenMaxAgeMonths: chosen,
    validation: { n: val.length, mae: valMAE, maeUniform: val.length ? mean(val.map((p) => p.maeUniform)) : null, diffVsUniform: mean(diffs), ci95: ci, medianAge: val.length ? val.map((p) => p.ageMonths).sort((a, b) => a - b)[Math.floor(val.length / 2)] : null, byOrg },
    accepted,
    status: accepted ? 'validated_historical' : 'unvalidated',
    prospective: 'εκκρεμεί (πρώτα κύματα που θα δημοσιευτούν μετά τις 5/11/2026)'
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `prev_wave_backtest${suffix}.json`), JSON.stringify({ ...res, pairsDetail: pairs }, null, 1));
  console.log(JSON.stringify(res, null, 1));
}
main(0, '');
main(40, '_minchars40');
