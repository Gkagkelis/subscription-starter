// ============================================================
// BENCHMARK RUNNER — τυφλή αναπαραγωγή πραγματικών ερευνών με τον ΠΡΑΓΜΑΤΙΚΟ engine.
//
// Για κάθε δείγμα-στόχο:
//   1. Τεκμηρίωση: blind -> το engine αναζητά στο lake (searchLake) με έτος αναφοράς
//      = έτος πεδίου − 1 και holdout της έρευνας-στόχου + διπλοτύπων + ίδιου δείγματος·
//      κρατά ερωτήσεις με ΙΔΙΕΣ επιλογές. Χρονοσειρές: ο ίδιος δείκτης, μόνο προγενέστερα κύματα.
//      oracle -> το engine τροφοδοτείται με τα ίδια τα αποτελέσματα του στόχου (ΔΙΑΓΝΩΣΤΙΚΟ,
//      όχι πρόβλεψη: μετρά το σφάλμα δομής πληθυσμού/μοντέλου).
//   2. Εκτέλεση: runSurvey (demo, χωρίς AI) με την έκδοση μοντέλου υπό δοκιμή, για πολλά seeds.
//   3. Σύγκριση με τα πραγματικά ποσοστά: σύνολο και ομάδες, μόνο σε συγκρίσιμες διαστάσεις.
// ============================================================

import { getMetric, latestWaveFor, norayaMembership, type EvidenceContext } from '../data/noraya';
import { band65Comparable, universeFraction } from '../data/universe';
import type { PriorWave } from '../data/noraya-build';
import { expandHoldout, lakeMetric, lakePoolId, lakeTransferId, sampleKeyOf, searchLake } from '../data/lake';
import { checkQuestionnaire } from '../engine/guardrails';
import { PRODUCTION_MODEL, type ModelConfig } from '../engine/model-config';
import { evidenceContextForPlan, runSurvey } from '../engine/survey';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../population/store';
import type { Persona, Question, StudyPlan } from '../types';
import { hash01, normOption, normText, targetCells, type BenchItem, type BenchSuite, type Family, type Split } from './suite';

export interface RunConfig {
  model: ModelConfig;
  mode: 'blind' | 'oracle';
  splits: Split[];
  families?: Family[];
  seeds: number[];
  n: number;
  populationId?: string;
  /** Όριο ομάδων εκτέλεσης (δειγμάτων) ΑΝΑ ΟΙΚΟΓΕΝΕΙΑ πηγών (για γρηγορότερα πειράματα). */
  maxGroups?: number;
  /** Επιλογή υποσυνόλου items (π.χ. για ablations). */
  itemFilter?: (i: BenchItem) => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface CellResult {
  dim: string;
  group: string;
  option: string;
  real: number;
  sim: number;
  simSd: number;
  n: number | null;
  persist: number | null;
}

export interface ItemResult {
  itemId: string;
  family: Family;
  split: Split;
  year: number;
  sampleKey: string;
  topics: string[];
  binary: boolean;
  dkOptions: string[];
  status: 'ok' | 'no_evidence' | 'guardrail' | 'no_fit';
  note?: string;
  evidence?: { metrics: string[]; studies: string[]; years: number[]; waveKeys: string[]; gapYears: number | null; surveyTypeMatch: boolean | null };
  populationId?: string;
  cells: CellResult[];
  noiseFloorPp: number | null;
}

/** Σχεδιαστικό φαινόμενο (design effect) ανά πηγή για το «όριο θορύβου» δειγματοληψίας. */
const DEFF: Partial<Record<Family, number>> = { eb_trend: 1.5, findex_ts: 1.5, dianeosis_ts: 1.6, noraya_ts: 1.5 };

function surveyType(title: string): string {
  return /flash/i.test(title) ? 'flash' : /special/i.test(title) ? 'special' : /standard/i.test(title) ? 'standard' : 'other';
}

/** Τεκμηρίωση μιας ερώτησης Eurobarometer χωρίς τα δεδομένα της (blind). */
function ebEvidence(item: BenchItem, model: ModelConfig): { link: Question['evidenceLink']; metrics: string[]; studies: string[]; years: number[]; typeMatch: boolean } | null {
  const holdout = Array.from(expandHoldout([item.studyId]));
  const want = Array.from(new Set(item.options.map(normOption))).sort().join('|');
  const hits = searchLake(item.text, { asOfYear: item.year - 1, holdout, kinds: ['distribution'], limit: 80 }).filter((h) => {
    if (sampleKeyOf(h.study.studyId, h.study.title) === item.sampleKey) return false; // διπλή ασφάλεια
    return Array.from(new Set(h.question.options.map(normOption))).sort().join('|') === want;
  });
  if (!hits.length) return null;
  // ακριβής αντιστοίχιση (φάση 2, μετά το holdout2): αν υπάρχει η ΙΔΙΑ ερώτηση (ίδια κανονικοποιημένη διατύπωση, μαζί με
  // την ετικέτα υπο-ερώτησης), προηγείται — αλλιώς η κατάταξη του retrieval διαλέγει συχνά «αδελφή» υπο-ερώτηση συστοιχίας
  if (model.exactQuestionMatch) {
    const want = normText(item.text);
    const exact = hits.filter((h) => normText(h.question.text) === want);
    if (exact.length) hits.splice(0, hits.length, ...exact, ...hits.filter((h) => !exact.includes(h)));
  }
  // παραγωγή: η πρώτη συμβατή κατά την κατάταξη του retrieval· pool: έως K συμβατές από διαφορετικά δείγματα, νεότερες πρώτα
  let chosen = [hits[0]];
  if (model.wavePolicy === 'pool' || model.wavePolicy === 'forecast') {
    const seen = new Set<string>();
    // σειρά = η ΙΔΙΑ ερώτηση με την καλύτερη αντιστοίχιση (ίδια κανονικοποιημένη διατύπωση + επιλογές), όχι απλώς «παρόμοιες»
    // (π.χ. «δημοκρατία στη χώρα» ≠ «δημοκρατία στην ΕΕ» — ίδιες επιλογές, διαφορετική ερώτηση)
    const head = normText(hits[0].question.text);
    chosen = [...hits]
      .filter((h) => normText(h.question.text) === head)
      .sort((a, b) => b.year - a.year)
      .filter((h) => {
        const k = sampleKeyOf(h.study.studyId, h.study.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, model.wavePolicy === 'forecast' ? 12 : model.poolMaxWaves ?? 3)
      .reverse();
  }
  const hasGroups = (metric: string) => {
    const w = lakeMetric(metric)?.waves.filter((x) => x.groups.all?.all);
    const last = w?.[w.length - 1];
    return !!last && ['gender', 'age_band', 'age_group4'].some((d) => Object.keys(last.groups[d] || {}).length >= 2);
  };
  // μεταφορά δομής: η πιο πρόσφατη συμβατή έρευνα με διασπάσεις (από τις ίδιες, ήδη φιλτραρισμένες με holdout/χρόνο)
  const optOf = (h: (typeof hits)[number], o: string) => {
    const c = h.question.options.find((x) => normOption(x) === normOption(o));
    return c ? h.question.optionMetrics[c] : null;
  };
  const structSrc =
    model.structureTransfer && !chosen.some((h) => { const m = optOf(h, item.options[0]); return m ? hasGroups(m) : false; })
      ? [...hits].sort((a, b) => b.year - a.year).find((h) => { const m = optOf(h, item.options[0]); return m ? hasGroups(m) : false; }) || null
      : null;
  const optionMetrics: Record<string, string> = {};
  for (const o of item.options) {
    const ids = chosen
      .map((h) => {
        const c = h.question.options.find((x) => normOption(x) === normOption(o));
        return c ? h.question.optionMetrics[c] : null;
      })
      .filter((x): x is string => !!x);
    if (!ids.length) return null;
    const level = ids.length === 1 ? ids[0] : lakePoolId(ids);
    const sm = structSrc ? optOf(structSrc, o) : null;
    optionMetrics[o] = sm ? lakeTransferId(level, sm) : level;
  }
  const first = Object.values(optionMetrics)[0];
  return {
    link: { datasetId: chosen[chosen.length - 1].study.studyId, metric: first, positiveOption: item.options[0], optionMetrics },
    metrics: Object.values(optionMetrics),
    studies: [...chosen.map((h) => h.study.studyId), ...(structSrc ? [structSrc.study.studyId] : [])],
    years: chosen.map((h) => h.year),
    typeMatch: chosen.every((h) => surveyType(h.study.title) === surveyType(item.title))
  };
}

function itemQuestion(item: BenchItem, qid: string, link: Question['evidenceLink']): Question {
  return {
    id: qid,
    type: 'single_choice',
    text: item.text.length > 500 ? item.text.slice(0, 497) + '…' : item.text,
    options: item.binary ? ['Ναι', 'Όχι'] : item.options,
    evidenceLink: link
  };
}

function targetWave(metric: string, key: string): PriorWave | null {
  return getMetric(metric)?.waves.find((w) => w.key === key) || null;
}

/** Ομάδες ανά πρόσωπο για τις συγκρίσιμες διαστάσεις του item (με πιθανοτική συμμετοχή όπου ισχύει). */
function memberships(p: Persona, item: BenchItem): Record<string, Record<string, number>> | null {
  const m = norayaMembership(p, item.scheme);
  if (!m) return null;
  const out: Record<string, Record<string, number>> = { all: { all: 1 } };
  for (const d of item.compareDims) if (m[d]) out[d] = m[d];
  return out;
}

function groupKey(item: BenchItem): string {
  if (item.family === 'eb_trend') return `${item.sampleKey}|${item.year}`;
  return `${item.studyId}|${item.year}`;
}

export async function runBenchmark(suite: BenchSuite, cfg: RunConfig): Promise<{ items: ItemResult[]; groups: number; durationMs: number }> {
  const t0 = Date.now();
  const model = cfg.mode === 'oracle' ? { ...cfg.model, wavePolicy: 'last' as const } : cfg.model;
  const items = suite.items.filter((i) => cfg.splits.includes(i.split) && (!cfg.families || cfg.families.includes(i.family)) && (!cfg.itemFilter || cfg.itemFilter(i)));
  const groups = new Map<string, BenchItem[]>();
  items.forEach((i) => groups.set(groupKey(i), [...(groups.get(groupKey(i)) || []), i]));
  // όριο ανά οικογένεια πηγών, με ψευδοτυχαία (hash) σειρά — όχι αλφαβητική/χρονολογική (αποφυγή μεροληψίας επιλογής)
  const famOf = (k: string) => groups.get(k)![0].family;
  const ordered = Array.from(groups.keys()).sort((a, b) => hash01(`grp|${a}`) - hash01(`grp|${b}`));
  const perFam = new Map<string, number>();
  const keys = ordered.filter((k) => {
    const f = famOf(k);
    const c = perFam.get(f) || 0;
    if (cfg.maxGroups !== undefined && c >= cfg.maxGroups) return false;
    perFam.set(f, c + 1);
    return true;
  });
  const results: ItemResult[] = [];
  let done = 0;
  for (const key of keys) {
    const group = groups.get(key)!;
    const year = group[0].year;
    const questions: Question[] = [];
    const meta = new Map<string, { item: BenchItem; ev?: ReturnType<typeof ebEvidence> }>();
    const holdoutAll = new Set<string>();
    for (const item of group) {
      const base: ItemResult = {
        itemId: item.id, family: item.family, split: item.split, year: item.year, sampleKey: item.sampleKey, topics: item.topics,
        binary: item.binary, dkOptions: item.dkOptions, status: 'ok', cells: [], noiseFloorPp: null
      };
      if (!checkQuestionnaire('benchmark', [{ text: item.text, options: item.options }]).allowed) {
        results.push({ ...base, status: 'guardrail', note: 'Η ερώτηση μπλοκάρεται από τους κανόνες (πολιτικό/εκλογικό περιεχόμενο).' });
        continue;
      }
      const qid = `b${questions.length + 1}`;
      if (cfg.mode === 'oracle' || item.family !== 'eb_trend') {
        const first = Object.values(item.targetMetrics)[0];
        const link: Question['evidenceLink'] = item.binary
          ? { datasetId: getMetric(first)?.datasetId || item.studyId, metric: first, positiveOption: 'Ναι' }
          : { datasetId: item.studyId, metric: first, positiveOption: item.options[0], optionMetrics: item.targetMetrics };
        questions.push(itemQuestion(item, qid, link));
        meta.set(qid, { item });
      } else {
        const ev = ebEvidence(item, model);
        if (!ev) {
          results.push({ ...base, status: 'no_evidence', note: 'Το retrieval δεν βρήκε συμβατή προγενέστερη ερώτηση σε ανεξάρτητο δείγμα.' });
          continue;
        }
        questions.push(itemQuestion(item, qid, ev.link));
        meta.set(qid, { item, ev });
        expandHoldout([item.studyId]).forEach((x) => holdoutAll.add(x));
      }
    }
    if (questions.length) {
      const plan: StudyPlan = {
        domain: 'social_policy',
        kind: 'survey',
        title: `Benchmark ${key}`,
        researchQuestion: 'Benchmark αναπαραγωγής πραγματικής έρευνας',
        questions,
        assumptions: [],
        audience: { minAge: 15 },
        sampleSize: cfg.n,
        warnings: [],
        plannerVersion: 'benchmark',
        plannerMode: 'rules',
        // oracle: η ίδια η έρευνα-στόχος (μόνο για διάγνωση)· blind: καμία πληροφορία από το έτος πεδίου και μετά
        referenceYear: cfg.mode === 'oracle' ? year : year - 1,
        holdoutDatasets: cfg.mode === 'oracle' ? [] : Array.from(holdoutAll)
      };
      const perSeed: Map<string, Map<string, number>>[] = [];
      let populationId = '';
      let provenanceWaves = new Map<string, string>();
      for (const seed of cfg.seeds) {
        // eslint-disable-next-line no-await-in-loop
        const run = await runSurvey({ plan, populationId: cfg.populationId || CALIBRATED_POPULATION_ID, seed, mode: 'demo', save: false, stabilityRuns: 1, modelConfig: model });
        populationId = run.populationId;
        provenanceWaves = new Map((run.provenance || []).filter((p) => p.kind === 'observed').map((p) => [p.metric, p.waveKey || '']));
        const pop = loadPopulation(run.populationId)!;
        const byId = new Map(pop.personas.map((p) => [p.id, p]));
        const acc = new Map<string, Map<string, number>>();
        for (const r of run.respondents) {
          const persona = byId.get(r.personaId.split('~')[0]);
          if (!persona) continue;
          for (const a of r.answers) {
            const mm = meta.get(a.questionId);
            if (!mm || a.skipped || !a.value?.choice || a.basis !== 'empirical_prior') continue;
            const mem = memberships(persona, mm.item);
            if (!mem) continue;
            // σύγκριση στον πληθυσμό αναφοράς του στόχου (π.χ. 16-74): μέτρηση, όχι μοντέλο — ίδιο για όλες τις εκδόσεις
            const uf = mm.item.universe ? universeFraction(persona, mm.item.universe) : 1;
            if (uf <= 0) continue;
            const m = acc.get(a.questionId) || new Map<string, number>();
            for (const [dim, gs] of Object.entries(mem)) {
              for (const [g, f] of Object.entries(gs)) {
                if (f <= 0) continue;
                const w = r.weight * f * uf;
                m.set(`${dim}\u0001${g}\u0001`, (m.get(`${dim}\u0001${g}\u0001`) || 0) + w);
                m.set(`${dim}\u0001${g}\u0001${a.value.choice}`, (m.get(`${dim}\u0001${g}\u0001${a.value.choice}`) || 0) + w);
              }
            }
            acc.set(a.questionId, m);
          }
        }
        perSeed.push(acc);
      }
      for (const [qid, mm] of Array.from(meta.entries())) {
        const item = mm.item;
        const res: ItemResult = {
          itemId: item.id, family: item.family, split: item.split, year: item.year, sampleKey: item.sampleKey, topics: item.topics,
          binary: item.binary, dkOptions: item.dkOptions, status: 'ok', cells: [], noiseFloorPp: null, populationId
        };
        if (!perSeed.some((s) => s.has(qid))) {
          results.push({ ...res, status: 'no_fit', note: 'Χωρίς εμπειρική εκτίμηση (π.χ. όλα τα κύματα εξαιρέθηκαν).' });
          continue;
        }
        const evMetrics = mm.ev ? mm.ev.metrics : Object.values(item.targetMetrics);
        const ctx: EvidenceContext = { ...evidenceContextForPlan(plan), wavePolicy: model.wavePolicy, poolMaxWaves: model.poolMaxWaves, poolHalfLifeYears: model.poolHalfLifeYears, forecast: model.forecast };
        const evWaveOf = (opt: string): PriorWave | null => {
          const metric = mm.ev ? mm.ev.link!.optionMetrics![opt] : item.targetMetrics[opt];
          // «επιμονή» = η τελευταία πραγματική μέτρηση, ανεξάρτητα από την πολιτική κύματος της έκδοσης
          return metric ? latestWaveFor(metric, { ...ctx, wavePolicy: 'last' }).wave : null;
        };
        const opts = item.binary ? ['Ναι'] : item.options;
        const dims = item.compareOverall ? ['all', ...item.compareDims] : item.compareDims;
        const floor: number[] = [];
        for (const opt of opts) {
          const tw = targetWave(item.targetMetrics[opt], item.targetWaveKey);
          if (!tw) continue;
          const ew = evWaveOf(opt);
          for (const dim of dims) {
            const cells = targetCells(tw, dim);
            const ecells = ew ? targetCells(ew, dim) : {};
            for (const [g, c] of Object.entries(cells)) {
              // η ζώνη «65+» της πηγής μπορεί να είναι μόνο 65-74 (π.χ. Έρευνα ΤΠΕ): τότε δεν συγκρίνεται
              if (dim === 'age_band' && g === '65+' && item.universe && !band65Comparable(item.universe)) continue;
              if (item.family === 'eurostat_ts' && !item.universe && (dim !== 'age_band' || g === '65+')) continue; // παλιές σουίτες
              if (!c.nUnknown && c.n < 30) continue;
              const vals = perSeed
                .map((s) => {
                  const m = s.get(qid);
                  const den = m?.get(`${dim}\u0001${g}\u0001`) || 0;
                  return den > 0 ? (100 * (m!.get(`${dim}\u0001${g}\u0001${opt}`) || 0)) / den : NaN;
                })
                .filter((v) => !Number.isNaN(v));
              if (!vals.length) continue;
              const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
              const sdv = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / (vals.length - 1)) : 0;
              res.cells.push({ dim, group: g, option: opt, real: c.value, sim: Math.round(mu * 100) / 100, simSd: Math.round(sdv * 100) / 100, n: c.nUnknown ? null : c.n, persist: ecells[g]?.value ?? null });
              if (dim === 'all' && !c.nUnknown && c.n) {
                const p = c.value / 100;
                floor.push(100 * Math.sqrt(2 / Math.PI) * Math.sqrt((p * (1 - p) * (DEFF[item.family] ?? 1.5)) / c.n));
              }
            }
          }
        }
        res.noiseFloorPp = floor.length ? Math.round((floor.reduce((a, b) => a + b, 0) / floor.length) * 100) / 100 : null;
        const evYears = mm.ev ? mm.ev.years : evMetrics.map((m) => Number((provenanceWaves.get(m) || '').slice(0, 4))).filter((y) => y > 0);
        res.evidence = {
          metrics: evMetrics,
          studies: mm.ev ? mm.ev.studies : [item.studyId],
          years: evYears,
          waveKeys: evMetrics.map((m) => provenanceWaves.get(m) || '').filter(Boolean),
          gapYears: evYears.length ? item.year - Math.max(...evYears) : null,
          surveyTypeMatch: mm.ev ? mm.ev.typeMatch : null
        };
        results.push(res);
      }
    }
    done++;
    cfg.onProgress?.(done, keys.length);
  }
  return { items: results, groups: keys.length, durationMs: Date.now() - t0 };
}

export { PRODUCTION_MODEL };
