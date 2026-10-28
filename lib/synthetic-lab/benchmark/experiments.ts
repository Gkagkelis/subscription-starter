// ============================================================
// ΔΙΑΓΝΩΣΤΙΚΑ ΠΕΙΡΑΜΑΤΑ — κάθε υπόθεση για την αιτία ενός σφάλματος ελέγχεται με
// μετρήσιμη σύγκριση παραλλαγών στα ΙΔΙΑ items και seeds (μόνο σε calibration).
//
// Τύποι σύγκρισης:
//   blind  vs  persistence      : προσθέτει το μοντέλο αξία πέρα από την αντιγραφή της προηγούμενης έρευνας;
//   oracle (ο στόχος ως είσοδος): σφάλμα ΔΟΜΗΣ (πληθυσμός/βάρη/μορφή μοντέλου) — όχι πρόβλεψη·
//   ablations διαστάσεων        : ποια δημογραφική διάσταση αλλοιώνει το σύνολο/τις ομάδες·
//   βάρη ερωτώμενων / πληθυσμός : επίδραση των δημογραφικών βαρών·
//   συρρίκνωση / συνδυασμός κυμάτων: θόρυβος vs μεταβολή στον χρόνο.
// ============================================================

import { PRODUCTION_MODEL, type ModelConfig } from '../engine/model-config';
import { runBenchmark, type ItemResult, type RunConfig } from './runner';
import { gapStats, scoreItem, summarize, type GapStat, type Summary } from './score';
import type { BenchItem, BenchSuite, Family, Split } from './suite';

export interface Variant {
  label: string;
  mode: 'blind' | 'oracle';
  model: Partial<ModelConfig>;
}

export interface ExperimentDef {
  id: string;
  hypothesis: string;
  families: Family[];
  splits: Split[];
  variants: Variant[];
  maxGroups?: number;
  seeds?: number[];
  n?: number;
  filter?: (i: BenchItem) => boolean;
  filterLabel?: string;
}

export interface VariantResult {
  label: string;
  mode: string;
  model: ModelConfig;
  summary: Summary;
  gaps: GapStat[];
  items: ItemResult[];
}

export interface ExperimentResult {
  id: string;
  hypothesis: string;
  createdAt: string;
  families: Family[];
  splits: Split[];
  seeds: number[];
  n: number;
  variants: VariantResult[];
  /** Ζευγαρωτή σύγκριση κάθε παραλλαγής με την πρώτη (ίδια items): μέση διαφορά MAE και ποσοστό items που βελτιώθηκαν. */
  paired: { label: string; items: number; meanDeltaOverall: number | null; meanDeltaGroup: number | null; improvedShare: number | null; ci95: [number, number] | null }[];
}

const LAKE_DIMS_PROD = ['age_band', 'age_group4', 'age_findex', 'gender', 'education_group', 'education_findex', 'income_quintile', 'income_findex'];

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'E1-structure',
    hypothesis:
      'Το σφάλμα οφείλεται (και) στη ΔΟΜΗ πληθυσμού/μοντέλου: ακόμη και με τα ίδια τα αποτελέσματα του στόχου ως είσοδο (oracle), το engine δεν τα αναπαράγει.',
    families: ['eb_trend', 'dianeosis_ts', 'noraya_ts', 'eurostat_ts'],
    splits: ['calibration'],
    variants: [
      { label: 'blind (παραγωγή)', mode: 'blind', model: {} },
      { label: 'oracle (παραγωγή)', mode: 'oracle', model: {} }
    ]
  },
  {
    id: 'E2-respondent-weights',
    hypothesis: 'Λανθασμένα δημογραφικά βάρη: η δειγματοληψία αγνοεί τα βάρη βαθμονόμησης (ηλικία×φύλο×μόρφωση) του πληθυσμού.',
    families: ['eb_trend', 'dianeosis_ts', 'noraya_ts'],
    splits: ['calibration'],
    variants: [
      { label: 'oracle · ίσα βάρη (παραγωγή)', mode: 'oracle', model: {} },
      { label: 'oracle · βάρη βαθμονόμησης', mode: 'oracle', model: { respondentWeighting: 'persona_weight' } }
    ]
  },
  {
    id: 'E3-dimensions',
    hypothesis:
      'Ασύμβατες/επικαλυπτόμενες διαστάσεις αλλοιώνουν το μοντέλο: η «μόρφωση» του Eurobarometer είναι συχνά proxy (ηλικία ολοκλήρωσης σπουδών) και η ηλικία δίνεται διπλά (ζώνες 10ετίας + 4 ομάδες).',
    families: ['eb_trend'],
    splits: ['calibration'],
    variants: [
      { label: 'oracle · όλες οι διαστάσεις (παραγωγή)', mode: 'oracle', model: {} },
      { label: 'oracle · χωρίς μόρφωση', mode: 'oracle', model: { dimensions: { lake: LAKE_DIMS_PROD.filter((d) => d !== 'education_group') } } },
      { label: 'oracle · χωρίς 4 ομάδες ηλικίας', mode: 'oracle', model: { dimensions: { lake: LAKE_DIMS_PROD.filter((d) => d !== 'age_group4') } } },
      { label: 'oracle · μόνο φύλο+ηλικία', mode: 'oracle', model: { dimensions: { lake: ['gender', 'age_band'] } } }
    ]
  },
  {
    id: 'E4-population-year',
    hypothesis: 'Χρονική ασυμβατότητα πληθυσμού: ο baseline 2015 δεν αντιστοιχεί στη δομή του έτους της έρευνας.',
    families: ['eb_trend', 'dianeosis_ts', 'noraya_ts'],
    splits: ['calibration'],
    variants: [
      { label: 'oracle · κανόνας παραγωγής', mode: 'oracle', model: {} },
      { label: 'oracle · πληθυσμός έτους (ηλικία×φύλο)', mode: 'oracle', model: { population: 'year_raked' } },
      { label: 'oracle · πληθυσμός έτους + βάρη', mode: 'oracle', model: { population: 'year_raked', respondentWeighting: 'persona_weight' } }
    ]
  },
  {
    id: 'E5-noise-vs-change',
    hypothesis:
      'Θόρυβος δειγματοληψίας της προγενέστερης έρευνας (μικρά n ομάδων) vs πραγματική μεταβολή: η συρρίκνωση των ομάδων ή ο συνδυασμός κυμάτων μειώνουν το σφάλμα αν κυριαρχεί ο θόρυβος.',
    families: ['eb_trend', 'dianeosis_ts', 'noraya_ts', 'eurostat_ts', 'findex_ts'],
    splits: ['calibration'],
    variants: [
      { label: 'blind · παραγωγή', mode: 'blind', model: {} },
      { label: 'blind · συρρίκνωση k=100', mode: 'blind', model: { shrinkage: 100 } },
      { label: 'blind · συνδυασμός 3 κυμάτων (hl 2)', mode: 'blind', model: { wavePolicy: 'pool', poolMaxWaves: 3, poolHalfLifeYears: 2 } }
    ]
  }
  ,
  {
    id: 'E6-structure-transfer',
    hypothesis:
      'Ελλιπής εμπειρική τεκμηρίωση: οι περισσότερες προγενέστερες έρευνες Eurobarometer δεν έχουν διασπάσεις, οπότε το engine μηδενίζει τις διαφορές φύλου/ηλικίας/μόρφωσης. Η μεταφορά δομής από παλαιότερη έρευνα με διασπάσεις τις επαναφέρει.',
    families: ['eb_trend'],
    splits: ['calibration'],
    variants: [
      { label: 'blind · παραγωγή', mode: 'blind', model: {} },
      { label: 'blind · μεταφορά δομής', mode: 'blind', model: { structureTransfer: true } },
      { label: 'blind · μεταφορά δομής + συρρίκνωση 300', mode: 'blind', model: { structureTransfer: true, shrinkage: 300 } }
    ]
  },
  {
    id: 'E7-shrinkage-sweep',
    hypothesis:
      'Υπερ-ερμηνεία θορύβου: οι διαφορές ομάδων μιας έρευνας προβλέπουν ασθενώς τις επόμενες (θόρυβος n≈500/ομάδα)· η συρρίκνωση προς το σύνολο μειώνει το σφάλμα ομάδων αν αυτό ισχύει.',
    families: ['eb_trend', 'dianeosis_ts', 'noraya_ts', 'eurostat_ts', 'findex_ts'],
    splits: ['calibration'],
    variants: [
      { label: 'blind · k=0 (παραγωγή)', mode: 'blind', model: {} },
      { label: 'blind · k=100', mode: 'blind', model: { shrinkage: 100 } },
      { label: 'blind · k=300', mode: 'blind', model: { shrinkage: 300 } },
      { label: 'blind · k=1000', mode: 'blind', model: { shrinkage: 1000 } }
    ]
  }
];

/** Ανάλυση σφαλμάτων μιας εκτέλεσης ανά χρονικό κενό, ταύτιση τύπου έρευνας, μέγεθος δείγματος, θέμα (χωρίς νέες εκτελέσεις). */
export function breakdownAnalysis(items: ItemResult[]) {
  const ok = items.filter((r) => r.status === 'ok');
  const by = (key: (r: ItemResult) => string | null) => {
    const m = new Map<string, ItemResult[]>();
    ok.forEach((r) => {
      const k = key(r);
      if (k !== null) m.set(k, [...(m.get(k) || []), r]);
    });
    return Object.fromEntries(Array.from(m.entries()).sort().map(([k, v]) => [k, summarize(v)]));
  };
  return {
    gapYears: by((r) => (r.evidence?.gapYears == null ? null : r.evidence.gapYears >= 4 ? '4+' : String(r.evidence.gapYears))),
    surveyType: by((r) => (r.evidence?.surveyTypeMatch == null ? null : r.evidence.surveyTypeMatch ? 'ίδιος τύπος' : 'διαφορετικός τύπος (Flash/Special/Standard)')),
    family: by((r) => r.family),
    topic: by((r) => r.topics[0] || 'other'),
    year: by((r) => String(r.year))
  };
}

function mkModel(base: ModelConfig, over: Partial<ModelConfig>, label: string): ModelConfig {
  return { ...base, ...over, version: Object.keys(over).length ? `${base.version}~${label}` : base.version, label };
}

function bootstrapCi(xs: number[], reps = 1000): [number, number] | null {
  if (xs.length < 5) return null;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const means: number[] = [];
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  return [Math.round(means[Math.floor(0.025 * reps)] * 100) / 100, Math.round(means[Math.floor(0.975 * reps)] * 100) / 100];
}

/** Ζευγαρωτή διαφορά (παραλλαγή − αναφορά) ανά ΑΝΕΞΑΡΤΗΤΟ ΔΕΙΓΜΑ (cluster), για έντιμα διαστήματα. */
export function pairedCompare(ref: ItemResult[], alt: ItemResult[]) {
  const a = new Map(ref.filter((r) => r.status === 'ok').map((r) => [r.itemId, scoreItem(r)]));
  const deltasO: number[] = [];
  const deltasG: number[] = [];
  const bySample = new Map<string, number[]>();
  let improved = 0;
  let n = 0;
  for (const r of alt) {
    if (r.status !== 'ok') continue;
    const s0 = a.get(r.itemId);
    if (!s0) continue;
    const s1 = scoreItem(r);
    const v0 = s0.overallMae ?? s0.groupMae;
    const v1 = s1.overallMae ?? s1.groupMae;
    if (v0 === null || v1 === null) continue;
    n++;
    if (v1 < v0 - 1e-9) improved++;
    if (s0.overallMae !== null && s1.overallMae !== null) deltasO.push(s1.overallMae - s0.overallMae);
    if (s0.groupMae !== null && s1.groupMae !== null) deltasG.push(s1.groupMae - s0.groupMae);
    bySample.set(r.sampleKey, [...(bySample.get(r.sampleKey) || []), v1 - v0]);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((x, y) => x + y, 0) / xs.length) * 100) / 100 : null);
  const clusterMeans = Array.from(bySample.values()).map((v) => v.reduce((x, y) => x + y, 0) / v.length);
  return { items: n, meanDeltaOverall: avg(deltasO), meanDeltaGroup: avg(deltasG), improvedShare: n ? Math.round((1000 * improved) / n) / 10 : null, ci95: bootstrapCi(clusterMeans) };
}

export async function runExperiment(
  suite: BenchSuite,
  def: ExperimentDef,
  opts: { base?: ModelConfig; seeds?: number[]; n?: number; maxGroups?: number; onProgress?: (msg: string) => void } = {}
): Promise<ExperimentResult> {
  const base = opts.base || PRODUCTION_MODEL;
  const seeds = opts.seeds || def.seeds || [1, 2];
  const n = opts.n || def.n || 2000;
  const variants: VariantResult[] = [];
  for (const v of def.variants) {
    const model = mkModel(base, v.model, v.label);
    const cfg: RunConfig = { model, mode: v.mode, splits: def.splits, families: def.families, seeds, n, maxGroups: opts.maxGroups ?? def.maxGroups, itemFilter: def.filter };
    opts.onProgress?.(`${def.id}: ${v.label}`);
    const r = await runBenchmark(suite, cfg);
    variants.push({ label: v.label, mode: v.mode, model, summary: summarize(r.items), gaps: gapStats(r.items), items: r.items });
  }
  const paired = variants.slice(1).map((v) => ({ label: v.label, ...pairedCompare(variants[0].items, v.items) }));
  return { id: def.id, hypothesis: def.hypothesis, createdAt: new Date().toISOString(), families: def.families, splits: def.splits, seeds, n, variants, paired };
}
