// ============================================================
// Αξιολόγηση ΧΡΟΝΙΚΗΣ ΠΡΟΒΛΕΨΗΣ (φάση 2.2) στα ίδια items της σουίτας, χωρίς προσομοίωση ερωτώμενων.
//
// Για κάθε στόχο: σειρά προγενέστερων πραγματικών μετρήσεων της ΙΔΙΑΣ ερώτησης/δείκτη
//   - Eurobarometer: ίδια διατύπωση (κανονικοποιημένη) και ίδιες επιλογές σε ΑΛΛΑ δείγματα, έτος < στόχου·
//   - χρονοσειρές (Eurostat, Findex, NORAYA, διαΝΕΟσις): τα κύματα του δείκτη πριν από το έτος του στόχου.
// Κάθε μέθοδος προβλέπει κάθε συγκρίσιμο κελί (σύνολο/ομάδες)· οι επιλογές κανονικοποιούνται ώστε να αθροίζουν 100.
// Το αποτέλεσμα είναι ItemResult (όπως του runner) ώστε να βαθμολογείται με τις ΙΔΙΕΣ μετρικές.
// Δεν υπάρχει πρόσβαση σε δεδομένα έτους ≥ στόχου (έλεγχος στο test).
// ============================================================

import { getMetric, waveCells } from '../data/noraya';
import type { PriorWave } from '../data/noraya-build';
import { lakeMetric, lakeQuestions, lakeStudies, sampleKeyOf, type LakeQuestion } from '../data/lake';
import { band65Comparable } from '../data/universe';
import { forecastWave, type ForecastConfig } from '../engine/forecast';
import type { CellResult, ItemResult } from './runner';
import { normOption, normText, targetCells, type BenchItem, type BenchSuite, type Split } from './suite';

export interface SeriesPoint {
  year: number;
  sampleKey: string;
  wave: PriorWave;
  /** επιλογή στόχου -> δείκτης της παρατήρησης */
  metricOf: Record<string, string>;
}

let chainCache: Map<string, { q: LakeQuestion; sample: string; year: number }[]> | null = null;

/** Αλυσίδες Eurobarometer: ίδια κανονικοποιημένη διατύπωση + ίδιο σύνολο επιλογών (όπως στη σουίτα). */
function ebChains() {
  if (chainCache) return chainCache;
  const studies = new Map(lakeStudies().map((s) => [s.studyId, s]));
  chainCache = new Map();
  for (const q of lakeQuestions()) {
    const st = studies.get(q.studyId);
    if (st?.source !== 'eurobarometer' || q.kind !== 'distribution' || q.multi) continue;
    const key = `${normText(q.text)}|${Array.from(new Set(q.options.map(normOption))).sort().join('|')}`;
    const arr = chainCache.get(key) || [];
    arr.push({ q, sample: sampleKeyOf(q.studyId, st.title), year: Math.max(...q.years) });
    chainCache.set(key, arr);
  }
  return chainCache;
}

/** Προγενέστερες μετρήσεις για ένα item (μόνο έτη < έτους στόχου, όχι από το ίδιο δείγμα). */
export function seriesFor(item: BenchItem): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  if (item.family === 'eb_trend' && item.compatKey) {
    const bySample = new Map<string, SeriesPoint>();
    for (const c of ebChains().get(item.compatKey) || []) {
      if (c.sample === item.sampleKey || c.year >= item.year) continue;
      const metricOf: Record<string, string> = {};
      for (const o of item.options) {
        const m = c.q.options.find((x) => normOption(x) === normOption(o));
        if (m) metricOf[o] = c.q.optionMetrics[m];
      }
      const first = metricOf[item.options[0]];
      const w = first ? lakeMetric(first)?.waves.filter((x) => x.groups.all?.all && x.year < item.year).pop() : null;
      if (!w) continue;
      const prev = bySample.get(c.sample);
      if (!prev || prev.year < w.year) bySample.set(c.sample, { year: w.year, sampleKey: c.sample, wave: w, metricOf });
    }
    out.push(...Array.from(bySample.values()));
  } else {
    const metric = Object.values(item.targetMetrics)[0];
    const m = getMetric(metric);
    for (const w of m?.waves || []) {
      if (!w.groups.all?.all || w.qualityFlag || w.year >= item.year) continue;
      out.push({ year: w.year, sampleKey: `${item.sampleKey}@${w.year}`, wave: w, metricOf: item.targetMetrics });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

/** Τα κύματα μιας επιλογής κατά μήκος της σειράς (ένα ανά δείγμα/έτος), για το forecastWave. */
function optionWaves(series: SeriesPoint[], option: string): PriorWave[] {
  const out: PriorWave[] = [];
  for (const p of series) {
    const metric = p.metricOf[option];
    if (!metric) continue;
    const m = getMetric(metric) || lakeMetric(metric);
    const w = metric === Object.values(p.metricOf)[0] && m?.waves.includes(p.wave) ? p.wave : m?.waves.find((x) => x.year === p.year && x.groups.all?.all && !x.qualityFlag);
    if (w) out.push({ ...w, key: `${p.sampleKey}:${w.key}` });
  }
  return out;
}

export interface TemporalVariant {
  label: string;
  cfg: ForecastConfig;
}

/** Προβλέψεις ενός item με μια ρύθμιση → ItemResult (sim = πρόβλεψη, persist = τελευταία μέτρηση του κελιού). */
export function forecastItem(item: BenchItem, cfg: ForecastConfig, series = seriesFor(item)): ItemResult {
  const base: ItemResult = {
    itemId: item.id, family: item.family, split: item.split, year: item.year, sampleKey: item.sampleKey, topics: item.topics,
    binary: item.binary, dkOptions: item.dkOptions, status: 'ok', cells: [], noiseFloorPp: null
  };
  if (!series.length) return { ...base, status: 'no_evidence', note: 'Χωρίς προγενέστερη μέτρηση.' };
  const opts = item.binary ? ['Ναι'] : item.options;
  const dims = item.compareOverall ? ['all', ...item.compareDims] : item.compareDims;
  const fw = new Map<string, PriorWave | null>();
  const lastCell = new Map<string, number | null>();
  for (const o of opts) {
    const ws = optionWaves(series, o);
    fw.set(o, forecastWave(ws, item.year, cfg));
    for (const dim of dims) {
      const withCells = ws.filter((w) => (dim === 'all' ? w.groups.all?.all : waveCells(w, dim)));
      const last = [...withCells].reverse();
      for (const w of last) {
        const cells = dim === 'all' ? { all: w.groups.all.all } : waveCells(w, dim);
        for (const [g, c] of Object.entries(cells)) if (!lastCell.has(`${o}|${dim}|${g}`) && !c.inconsistent) lastCell.set(`${o}|${dim}|${g}`, c.value);
      }
    }
  }
  const cells: CellResult[] = [];
  for (const dim of dims) {
    const groups = new Set<string>();
    for (const o of opts) {
      const tw = (getMetric(item.targetMetrics[o]) || lakeMetric(item.targetMetrics[o]))?.waves.find((w) => w.key === item.targetWaveKey);
      if (tw) Object.keys(targetCells(tw, dim)).forEach((g) => groups.add(g));
    }
    for (const g of Array.from(groups)) {
      if (dim === 'age_band' && g === '65+' && item.universe && !band65Comparable(item.universe)) continue;
      if (item.family === 'eurostat_ts' && !item.universe && (dim !== 'age_band' || g === '65+')) continue;
      const row: { o: string; real: number; n: number | null; f: number | null; persist: number | null }[] = [];
      for (const o of opts) {
        const tw = (getMetric(item.targetMetrics[o]) || lakeMetric(item.targetMetrics[o]))?.waves.find((w) => w.key === item.targetWaveKey);
        const tc = tw ? targetCells(tw, dim)[g] : undefined;
        if (!tc || (!tc.nUnknown && tc.n < 30)) continue;
        const f = fw.get(o);
        const fc = f ? (dim === 'all' ? f.groups.all?.all : waveCells(f, dim)[g]) : undefined;
        // χωρίς πρόβλεψη για την ομάδα: το επίπεδο του συνόλου (όπως ο engine όταν λείπει η διάσπαση)
        const fv = fc ? fc.value : f?.groups.all?.all ? f.groups.all.all.value : null;
        row.push({ o, real: tc.value, n: tc.nUnknown ? null : tc.n, f: fv, persist: lastCell.get(`${o}|${dim}|${g}`) ?? null });
      }
      if (!row.length || row.some((r) => r.f === null)) continue;
      if (!item.binary && row.length > 1) {
        const sf = row.reduce((a, r) => a + (r.f as number), 0);
        // άθροισμα-στόχος από το ΠΑΡΕΛΘΟΝ (τελευταίες μετρήσεις), ποτέ από τα πραγματικά του στόχου (διαρροή)
        const sp = row.every((r) => r.persist !== null) ? row.reduce((a, r) => a + (r.persist as number), 0) : sf;
        if (sf > 0) row.forEach((r) => (r.f = ((r.f as number) * sp) / sf));
      }
      for (const r of row) cells.push({ dim, group: g, option: r.o, real: r.real, sim: Math.round((r.f as number) * 100) / 100, simSd: 0, n: r.n, persist: r.persist });
    }
  }
  const years = series.map((s) => s.year);
  return {
    ...base,
    status: cells.length ? 'ok' : 'no_fit',
    cells,
    evidence: { metrics: [], studies: [], years, waveKeys: series.map((s) => s.wave.key), gapYears: item.year - Math.max(...years), surveyTypeMatch: null }
  };
}

export function runTemporal(suite: BenchSuite, variants: TemporalVariant[], opts: { splits: Split[]; families?: string[] }) {
  const items = suite.items.filter((i) => opts.splits.includes(i.split) && (!opts.families || opts.families.includes(i.family)));
  const series = new Map(items.map((i) => [i.id, seriesFor(i)]));
  return variants.map((v) => ({ label: v.label, cfg: v.cfg, items: items.map((i) => forecastItem(i, v.cfg, series.get(i.id))) }));
}
