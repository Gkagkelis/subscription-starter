// ============================================================
// ΒΡΟΧΟΣ ΒΕΛΤΙΩΣΗΣ: calibration (ρύθμιση) → validation (επιλογή) → final holdout (μία φορά).
//
//   tune      : πλέγμα υποψήφιων ρυθμίσεων, αξιολόγηση ΜΟΝΟ στο calibration· οι καλύτερες
//               αποθηκεύονται ως πειραματικές εκδόσεις (exp-*), ποτέ στην παραγωγή.
//   select    : παραγωγή vs υποψήφιες στο validation. Κανόνες αποδοχής (όλοι μαζί):
//                 1. βελτίωση του κύριου δείκτη (MAE ανά ανεξάρτητο δείγμα) ≥ 0,10 π.μ.·
//                 2. το 95% διάστημα (bootstrap ανά δείγμα) της ζευγαρωτής διαφοράς < 0·
//                 3. καμία οικογένεια πηγών δεν χειροτερεύει > 0,25 π.μ.·
//                 4. το σφάλμα ομάδων δεν χειροτερεύει > 0,25 π.μ.
//   holdout   : η υποψήφια αξιολογείται στο ανέγγιχτο final holdout ΜΙΑ φορά (καταγράφεται)·
//               η προαγωγή στην παραγωγή απαιτεί ρητή έγκριση και αλλαγή κώδικα (PRODUCTION_MODEL).
// ============================================================

import { PRODUCTION_MODEL, describeModel, type ModelConfig } from '../engine/model-config';
import { runBenchmark, type ItemResult } from './runner';
import { gapStats, summarize, summarizeBy, type Summary } from './score';
import { pairedCompare } from './experiments';
import { appendHistory, loadModel, readHistory, saveDecision, saveModel, saveRun } from './registry';
import { associationBenchmark } from './assoc';
import type { BenchSuite, Family } from './suite';

const FAMILIES: Family[] = ['eb_trend', 'eurostat_ts', 'findex_ts', 'dianeosis_ts', 'noraya_ts'];
const SEEDS = [1, 2];
const N = 2000;

function stamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function familyScores(items: ItemResult[]): Record<string, number | null> {
  return Object.fromEntries(Object.entries(summarizeBy(items, (r) => r.family)).map(([k, s]) => [k, s.sampleMeanMae]));
}

/**
 * Άξονες ρύθμισης (καθένας αντιστοιχεί σε αιτία που ελέγχθηκε πειραματικά — βλ. experiments.ts):
 * μεταφορά δομής (ελλιπείς διασπάσεις), συρρίκνωση (θόρυβος ομάδων), βάρη ερωτώμενων, πληθυσμός έτους, συνδυασμός κυμάτων.
 */
export const TUNING_AXES: { name: string; values: Partial<ModelConfig>[] }[] = [
  { name: 'αγκύρωση επιπέδου', values: [{ anchorOverall: false }, { anchorOverall: true }] },
  { name: 'μεταφορά δομής', values: [{ structureTransfer: false }, { structureTransfer: true }] },
  { name: 'συρρίκνωση', values: [{ shrinkage: 0 }, { shrinkage: 100 }, { shrinkage: 300 }, { shrinkage: 1000 }] }
];
/**
 * Άξονες που ΑΠΟΡΡΙΦΘΗΚΑΝ από τα διαγνωστικά πειράματα (δεν μπαίνουν στη ρύθμιση):
 *  - βάρη ερωτώμενων (E2: Δ=0), πληθυσμός έτους (E4: Δ≈0, CI περιέχει 0), συνδυασμός κυμάτων (E5: Δ>0, CI [-0.62, 0.51]).
 */
export const REJECTED_AXES = ['respondentWeighting (E2)', 'population year_raked (E4)', 'wavePolicy pool (E5)'];

/**
 * Coordinate search ΜΟΝΟ στο calibration: ξεκινά από την παραγωγή και για κάθε άξονα κρατά την τιμή με το μικρότερο
 * σφάλμα, μόνο αν βελτιώνει ≥ minGain π.μ. (αλλιώς μένει η τιμή παραγωγής). Δύο περάσματα.
 */
export async function tuneOnCalibration(
  suite: BenchSuite,
  opts: { maxGroups?: number; log?: (m: string) => void; minGain?: number; passes?: number; extra?: Partial<ModelConfig>; extraNote?: string } = {}
) {
  const log = opts.log || (() => undefined);
  const minGain = opts.minGain ?? 0.03;
  const cache = new Map<string, { summary: Summary; byFamily: Record<string, number | null> }>();
  const evalCfg = async (cfg: ModelConfig) => {
    const key = JSON.stringify({ ...cfg, version: '', label: '', notes: [], parent: null });
    const hit = cache.get(key);
    if (hit) return hit;
    const r = await runBenchmark(suite, { model: cfg, mode: 'blind', splits: ['calibration'], families: FAMILIES, seeds: SEEDS, n: N, maxGroups: opts.maxGroups });
    const out = { summary: summarize(r.items), byFamily: familyScores(r.items) };
    cache.set(key, out);
    log(`  ${describeModel(cfg)} → calibration ${out.summary.sampleMeanMae} (σύνολο ${out.summary.overallMae}, ομάδες ${out.summary.groupMae})`);
    return out;
  };
  let best: ModelConfig = { ...PRODUCTION_MODEL, version: 'cand', label: '' };
  const prod = await evalCfg(best);
  let bestScore = prod.summary.sampleMeanMae ?? 1e9;
  const trail: { axis: string; chosen: string; score: number | null }[] = [];
  for (let pass = 0; pass < (opts.passes ?? 2); pass++) {
    let changed = false;
    for (const axis of TUNING_AXES) {
      let axisBest = best;
      let axisScore = bestScore;
      for (const v of axis.values) {
        const cand: ModelConfig = { ...best, ...v };
        const s = (await evalCfg(cand)).summary.sampleMeanMae ?? 1e9;
        if (s < axisScore - minGain) {
          axisBest = cand;
          axisScore = s;
        }
      }
      if (axisBest !== best) changed = true;
      best = axisBest;
      bestScore = axisScore;
      trail.push({ axis: axis.name, chosen: describeModel(best), score: bestScore });
      log(`άξονας «${axis.name}» → ${describeModel(best)} (${bestScore})`);
    }
    if (!changed) break;
  }
  const version = `exp-${stamp()}-a`;
  const final: ModelConfig = {
    ...best,
    ...(opts.extra || {}),
    version,
    label: describeModel(best),
    parent: PRODUCTION_MODEL.version,
    notes: [
      `Coordinate search στο calibration: MAE ανά δείγμα ${bestScore} vs παραγωγή ${prod.summary.sampleMeanMae}.`,
      ...(opts.extraNote ? [opts.extraNote] : []),
      'ΔΕΝ είναι αποδεδειγμένη βελτίωση: απαιτείται validation και final holdout.'
    ]
  };
  final.label = describeModel(final);
  saveModel(final);
  appendHistory({ type: 'tune', at: new Date().toISOString(), suiteHash: suite.hash, production: { score: prod.summary.sampleMeanMae, group: prod.summary.groupMae }, trail, saved: [version], evaluated: cache.size });
  log(`αποθηκεύτηκε υποψήφια ${version}: ${final.label}`);
  return { best: final, score: bestScore, production: prod, trail };
}

export interface SelectionOutcome {
  version: string;
  accepted: boolean;
  reasons: string[];
  validation: Summary;
  production: Summary;
  delta: ReturnType<typeof pairedCompare>;
  familyDelta: Record<string, number | null>;
}

export async function selectOnValidation(suite: BenchSuite, opts: { versions?: string[]; log?: (m: string) => void; note?: string } = {}) {
  const log = opts.log || (() => undefined);
  // πόσες φορές έχει ήδη κοιταχτεί το validation για κάθε υποψήφια (κάθε επανάληψη «φθείρει» το validation)
  const priorSelects = readHistory().filter((h) => h.type === 'select') as { outcomes?: { version: string }[] }[];
  const lastTune = [...readHistory()].reverse().find((h) => h.type === 'tune') as { saved?: string[] } | undefined;
  const versions = opts.versions || lastTune?.saved || [];
  if (!versions.length) throw new Error('Δεν υπάρχουν υποψήφιες εκδόσεις (τρέξε πρώτα «tune»).');
  const prod = await runBenchmark(suite, { model: PRODUCTION_MODEL, mode: 'blind', splits: ['validation'], families: FAMILIES, seeds: SEEDS, n: N });
  const prodSummary = summarize(prod.items);
  saveRun({ id: `validation-prod-${Date.now()}`, createdAt: new Date().toISOString(), tag: 'validation', suiteVersion: suite.version, suiteHash: suite.hash, model: PRODUCTION_MODEL, config: { mode: 'blind', splits: ['validation'], families: FAMILIES, seeds: SEEDS, n: N }, durationMs: prod.durationMs, summary: prodSummary, bySplit: summarizeBy(prod.items, (x) => x.split), byFamily: summarizeBy(prod.items, (x) => x.family), gaps: gapStats(prod.items), items: prod.items });
  log(`validation παραγωγή: ${prodSummary.sampleMeanMae} (ομάδες ${prodSummary.groupMae}, ${prodSummary.okItems} items, ${prodSummary.samples} δείγματα)`);
  const prodFam = familyScores(prod.items);
  const outcomes: SelectionOutcome[] = [];
  for (const v of versions) {
    const model = loadModel(v);
    if (!model) continue;
    const r = await runBenchmark(suite, { model, mode: 'blind', splits: ['validation'], families: FAMILIES, seeds: SEEDS, n: N });
    const s = summarize(r.items);
    saveRun({ id: `validation-${v}-${Date.now()}`, createdAt: new Date().toISOString(), tag: 'validation', suiteVersion: suite.version, suiteHash: suite.hash, model, config: { mode: 'blind', splits: ['validation'], families: FAMILIES, seeds: SEEDS, n: N }, durationMs: r.durationMs, summary: s, bySplit: summarizeBy(r.items, (x) => x.split), byFamily: summarizeBy(r.items, (x) => x.family), gaps: gapStats(r.items), items: r.items });
    const delta = pairedCompare(prod.items, r.items);
    const fam = familyScores(r.items);
    const familyDelta = Object.fromEntries(Object.keys(prodFam).map((k) => [k, prodFam[k] !== null && fam[k] != null ? Math.round(((fam[k] as number) - (prodFam[k] as number)) * 100) / 100 : null]));
    const reasons: string[] = [];
    const gain = (prodSummary.sampleMeanMae ?? 0) - (s.sampleMeanMae ?? 0);
    if (!(gain >= 0.1)) reasons.push(`Βελτίωση κύριου δείκτη ${gain.toFixed(2)} π.μ. < 0,10.`);
    if (!delta.ci95 || !(delta.ci95[1] < 0)) reasons.push(`Το 95% διάστημα της διαφοράς (${JSON.stringify(delta.ci95)}) δεν είναι αυστηρά αρνητικό.`);
    Object.entries(familyDelta).forEach(([k, d]) => d !== null && d > 0.25 && reasons.push(`Χειροτέρευση στην οικογένεια ${k}: +${d} π.μ.`));
    if ((s.groupMae ?? 0) - (prodSummary.groupMae ?? 0) > 0.25) reasons.push(`Χειροτέρευση σφάλματος ομάδων: ${prodSummary.groupMae} → ${s.groupMae}.`);
    const accepted = reasons.length === 0;
    outcomes.push({ version: v, accepted, reasons, validation: s, production: prodSummary, delta, familyDelta });
    log(`${v}: validation ${s.sampleMeanMae} (Δ ${delta.meanDeltaOverall}/${delta.meanDeltaGroup}, CI ${JSON.stringify(delta.ci95)}) → ${accepted ? 'ΑΠΟΔΕΚΤΗ' : 'απορρίπτεται: ' + reasons.join(' ')}`);
  }
  // συσχετίσεις (μικροδεδομένα, validation = κύμα 2022): μόνο αν η υποψήφια αλλάζει τη δομή απαντήσεων
  const assoc: Record<string, unknown> = {};
  const prodAssoc = await associationBenchmark({ model: PRODUCTION_MODEL, splits: ['validation'] });
  assoc[PRODUCTION_MODEL.version] = prodAssoc.bySplit.validation;
  for (const o of outcomes) {
    const m = loadModel(o.version);
    if (!m?.batteryRho) continue;
    const a = await associationBenchmark({ model: m, splits: ['validation'] });
    assoc[o.version] = a.bySplit.validation;
    const before = prodAssoc.bySplit.validation?.withinMae ?? null;
    const after = a.bySplit.validation?.withinMae ?? null;
    log(`${o.version}: συσχετίσεις συστοιχίας (validation 2022) MAE phi ${before} → ${after}, εκτός συστοιχίας ${prodAssoc.bySplit.validation?.acrossMae} → ${a.bySplit.validation?.acrossMae}`);
    if (before !== null && after !== null && after > before) {
      o.accepted = false;
      o.reasons.push(`Οι συσχετίσεις μέσα στη συστοιχία χειροτερεύουν στο validation (${before} → ${after}).`);
    }
    if ((a.bySplit.validation?.acrossMae ?? 0) - (prodAssoc.bySplit.validation?.acrossMae ?? 0) > 0.01) {
      o.accepted = false;
      o.reasons.push('Οι συσχετίσεις εκτός συστοιχίας χειροτερεύουν > 0,01 στο validation.');
    }
  }
  const best = outcomes.filter((o) => o.accepted).sort((a, b) => (a.validation.sampleMeanMae ?? 1e9) - (b.validation.sampleMeanMae ?? 1e9))[0] || null;
  saveDecision({
    id: `select-${Date.now()}`, type: 'select', at: new Date().toISOString(), suiteHash: suite.hash,
    outcomes: outcomes.map(({ version, accepted, reasons, validation, delta, familyDelta }) => ({
      version, accepted, reasons, score: validation.sampleMeanMae, group: validation.groupMae, delta, familyDelta,
      priorValidationLooks: priorSelects.filter((h) => h.outcomes?.some((o) => o.version === version)).length
    })),
    note: opts.note || null,
    production: { score: prodSummary.sampleMeanMae, group: prodSummary.groupMae },
    assoc,
    selected: best?.version || null
  });
  log(best ? `Επιλέχθηκε για final holdout: ${best.version}` : 'Καμία υποψήφια δεν πέρασε τους κανόνες αποδοχής· η παραγωγή μένει ως έχει.');
  return { outcomes, selected: best?.version || null, production: prodSummary };
}

export async function holdoutEvaluate(suite: BenchSuite, version: string, opts: { log?: (m: string) => void; confirm?: boolean } = {}) {
  const log = opts.log || (() => undefined);
  const model = loadModel(version);
  if (!model) throw new Error(`Άγνωστη έκδοση ${version}`);
  // μία φορά ανά έκδοση, ανεξάρτητα από την αναδημιουργία της σουίτας (αλλιώς θα ήταν δυνατό να «ξαναρίξεις τα ζάρια»)
  const prior = readHistory().find((h) => h.type === 'holdout' && h.version === version);
  if (prior) throw new Error(`Το final holdout έχει ήδη χρησιμοποιηθεί για την ${version} — δεν επαναλαμβάνεται.`);
  if (!opts.confirm) throw new Error('Το final holdout χρησιμοποιείται μία φορά. Πρόσθεσε --i-understand-this-is-final.');
  const prod = await runBenchmark(suite, { model: PRODUCTION_MODEL, mode: 'blind', splits: ['holdout'], families: FAMILIES, seeds: SEEDS, n: N });
  const cand = await runBenchmark(suite, { model, mode: 'blind', splits: ['holdout'], families: FAMILIES, seeds: SEEDS, n: N });
  const ps = summarize(prod.items);
  const cs = summarize(cand.items);
  const delta = pairedCompare(prod.items, cand.items);
  for (const [m, r, s] of [[PRODUCTION_MODEL, prod, ps], [model, cand, cs]] as const) {
    saveRun({ id: `holdout-${m.version}-${Date.now()}`, createdAt: new Date().toISOString(), tag: 'holdout', suiteVersion: suite.version, suiteHash: suite.hash, model: m, config: { mode: 'blind', splits: ['holdout'], families: FAMILIES, seeds: SEEDS, n: N }, durationMs: r.durationMs, summary: s, bySplit: summarizeBy(r.items, (x) => x.split), byFamily: summarizeBy(r.items, (x) => x.family), gaps: gapStats(r.items), items: r.items });
  }
  const improved = (cs.sampleMeanMae ?? 1e9) < (ps.sampleMeanMae ?? 0) && !!delta.ci95 && delta.ci95[1] < 0;
  const assocProd = (await associationBenchmark({ model: PRODUCTION_MODEL, splits: ['holdout'] })).bySplit.holdout || null;
  const assocCand = model.batteryRho ? (await associationBenchmark({ model, splits: ['holdout'] })).bySplit.holdout || null : assocProd;
  const rec = {
    type: 'holdout', at: new Date().toISOString(), suiteHash: suite.hash, version, production: { score: ps.sampleMeanMae, group: ps.groupMae, overall: ps.overallMae },
    candidate: { score: cs.sampleMeanMae, group: cs.groupMae, overall: cs.overallMae }, delta, byFamilyProd: familyScores(prod.items), byFamilyCand: familyScores(cand.items),
    gapsProd: gapStats(prod.items), gapsCand: gapStats(cand.items), assocProd, assocCand,
    recommendation: improved ? 'Βελτίωση επιβεβαιώθηκε στο ανεξάρτητο final holdout — υποψήφια για προαγωγή ΜΕ έγκριση.' : 'Δεν επιβεβαιώθηκε βελτίωση στο final holdout — δεν προτείνεται προαγωγή.'
  };
  saveDecision({ id: `holdout-${version}-${Date.now()}`, ...rec });
  log(`final holdout: παραγωγή ${ps.sampleMeanMae} → ${version} ${cs.sampleMeanMae} (Δ ${delta.meanDeltaOverall}/${delta.meanDeltaGroup}, CI ${JSON.stringify(delta.ci95)}). ${rec.recommendation}`);
  log(`final holdout συσχετίσεις (2024): συστοιχία MAE phi ${assocProd?.withinMae} → ${assocCand?.withinMae} · εκτός ${assocProd?.acrossMae} → ${assocCand?.acrossMae}`);
  return { production: ps, candidate: cs, delta, improved, prodItems: prod.items, candItems: cand.items, assocProd, assocCand };
}
