// ============================================================
// BENCHMARK SUITE — πραγματικές ελληνικές έρευνες ως σημεία αναφοράς.
//
// Πηγή: ΜΟΝΟ δεδομένα που ήδη υπάρχουν (export του Research Data Lake,
// ερευνητικά σύνολα, NORAYA). Κανένα νέο crawling.
//
// Οικογένειες στοιχείων (items):
//   eb_trend      Eurobarometer: ερώτηση που επαναλαμβάνεται σε ΑΛΛΟ, προγενέστερο δείγμα
//                 (ίδια διατύπωση και επιλογές) — το engine πρέπει να τη βρει μόνο του.
//   eurostat_ts   Eurostat (ΕΛΣΤΑΤ): ποσοστό ατόμων/νοικοκυριών, τελευταίο έτος από προηγούμενα.
//   findex_ts     World Bank Findex: τελευταίο κύμα από προηγούμενα.
//   dianeosis_ts  διαΝΕΟσις: τελευταίο κύμα ερώτησης από προηγούμενα (ήδη στην παραγωγή).
//   noraya_ts     NORAYA/Eurobarometer: δείκτες της παραγωγής (ήδη στην παραγωγή).
//
// Διαχωρισμός ανά ΑΝΕΞΑΡΤΗΤΟ ΔΕΙΓΜΑ (όχι ανά ερώτηση): calibration 50% / validation 25% /
// final holdout 25%, ντετερμινιστικά από hash του κλειδιού δείγματος. Ό,τι έχει ήδη
// χρησιμοποιηθεί για τη βαθμονόμηση/ρύθμιση του παραγωγικού μοντέλου πηγαίνει ΜΟΝΟ στο
// calibration και δεν παρουσιάζεται ποτέ ως άγνωστο test.
// ============================================================

import { createHash } from 'crypto';
import { getMetric, listMetrics, waveCells } from '../data/noraya';
import type { GroupScheme, PriorWave } from '../data/noraya-build';
import { lakeMeta, lakeMetric, lakeQuestions, lakeStudies, sampleKeyOf, type LakeQuestion, type LakeStudy } from '../data/lake';
import { researchQuestions } from '../data/research';

export const SUITE_VERSION = 'bench-suite-1';
export type Split = 'calibration' | 'validation' | 'holdout';
export type Family = 'eb_trend' | 'eurostat_ts' | 'findex_ts' | 'dianeosis_ts' | 'noraya_ts';

export interface BenchItem {
  id: string;
  family: Family;
  source: string;
  studyId: string;
  sampleKey: string;
  title: string;
  year: number;
  text: string;
  options: string[];
  dkOptions: string[];
  /** Δείκτες-στόχοι (πραγματικά αποτελέσματα) ανά επιλογή· στα δυαδικά μόνο η «θετική». */
  targetMetrics: Record<string, string>;
  targetWaveKey: string;
  binary: boolean;
  scheme: GroupScheme;
  topics: string[];
  /** Κλειδί συμβατότητας (διατύπωση + επιλογές) για τα eb_trend. */
  compatKey?: string;
  n: number | null;
  split: Split;
  productionUsed: boolean;
  productionReason?: string;
  /** Συγκρίσιμες διαστάσεις (συμβατοί πληθυσμοί/παρονομαστές). */
  compareOverall: boolean;
  compareDims: string[];
}

export interface BenchSuite {
  version: string;
  generatedAt: string;
  lakeGeneratedAt: string | null;
  hash: string;
  rules: string[];
  items: BenchItem[];
  excluded: Record<string, number>;
}

// ---------------- Κανόνες ----------------

export function hash01(s: string): number {
  const h = createHash('sha1').update(s).digest();
  return h.readUInt32BE(0) / 0x100000000;
}

export function splitOf(sampleKey: string): Split {
  const u = hash01(`split|${sampleKey}`);
  return u < 0.5 ? 'calibration' : u < 0.75 ? 'validation' : 'holdout';
}

export function normText(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\s*[a-z]{0,4}\d+[a-z0-9_.]*\s*[.:)]?\s*/, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function normOption(o: string): string {
  const t = o
    .toLowerCase()
    .replace(/\(spontaneous\)|\(spont\.?\)|\(do not read out\)/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(dk|don'?t know|dk\/na|dk\/no answer|ne sait pas|nsp|nsp\/sr)$/.test(t)) return 'dk';
  if (/^(refusal|refusal \(spontaneous\)|refus)$/.test(t)) return 'refusal';
  return t;
}

const DEMOGRAPHIC = new RegExp(
  [
    'how old are you', 'stopped full.?time education', 'are you a man', 'gender', 'what is your current occupation', 'your occupation',
    'nationality', 'marital status', 'how many people', 'type of community', 'living in a', 'household composition', 'what is your age',
    'socio.?professional', 'level of diploma', 'highest level of education', 'do you have a fixed line', 'mobile phone in your household',
    'number of persons', 'respondent occupation', 'region'
  ].join('|')
);

/** Eurostat σύνολα που ήδη τροφοδοτούν το παραγωγικό μοντέλο (priors ή βαθμονόμηση πληθυσμού). */
const PRODUCTION_EUROSTAT = /^eurostat:(isoc_ec_ib20|isoc_ec_ibgs|ilc_mdes0\d|demo_r_pjangroup|demo_pjangroup|edat_lfs_9901|hbs_str_t223)$/;

function lastWave(metric: string): PriorWave | null {
  const m = getMetric(metric);
  const w = m?.waves.filter((x) => x.groups.all?.all);
  return w?.length ? w[w.length - 1] : null;
}

// ---------------- Κατασκευή ----------------

export function buildSuite(opts: { maxEurostatPerStudy?: number; maxEurostat?: number } = {}): BenchSuite {
  const excluded: Record<string, number> = {};
  const skip = (why: string) => (excluded[why] = (excluded[why] || 0) + 1);
  const items: BenchItem[] = [];
  const studies = new Map<string, LakeStudy>(lakeStudies().map((s) => [s.studyId, s]));
  const qs = lakeQuestions();

  // --- Eurobarometer: επαναλαμβανόμενες ερωτήσεις σε διαφορετικά δείγματα ---
  const eb = qs.filter((q) => studies.get(q.studyId)?.source === 'eurobarometer' && q.kind === 'distribution' && !q.multi);
  const perStudyKey = new Map<string, number>();
  const keyOf = (q: LakeQuestion) => normText(q.text);
  eb.forEach((q) => perStudyKey.set(`${q.studyId}|${keyOf(q)}`, (perStudyKey.get(`${q.studyId}|${keyOf(q)}`) || 0) + 1));
  const compat = new Map<string, { sample: string; year: number }[]>();
  const usable: { q: LakeQuestion; key: string; sample: string; year: number }[] = [];
  for (const q of eb) {
    const s = studies.get(q.studyId)!;
    const t = keyOf(q);
    if (t.length < 15) {
      skip('eb: πολύ σύντομη/γενική διατύπωση');
      continue;
    }
    if ((perStudyKey.get(`${q.studyId}|${t}`) || 0) > 1) {
      skip('eb: γενικό stem συστοιχίας (ίδιο κείμενο σε πολλές ερωτήσεις της ίδιας έρευνας)');
      continue;
    }
    if (DEMOGRAPHIC.test(t)) {
      skip('eb: δημογραφική ερώτηση (σύνθεση δείγματος, όχι στάση/συμπεριφορά)');
      continue;
    }
    const subst = q.options.filter((o) => !['dk', 'refusal'].includes(normOption(o)));
    if (subst.length < 2 || q.options.length > 12) {
      skip('eb: ακατάλληλο πλήθος επιλογών');
      continue;
    }
    const year = Math.max(...q.years);
    const key = `${t}|${Array.from(new Set(q.options.map(normOption))).sort().join('|')}`;
    const sample = sampleKeyOf(q.studyId, s.title);
    usable.push({ q, key, sample, year });
    compat.set(key, [...(compat.get(key) || []), { sample, year }]);
  }
  for (const u of usable) {
    const earlier = (compat.get(u.key) || []).some((c) => c.sample !== u.sample && c.year < u.year);
    if (!earlier) {
      skip('eb: δεν υπάρχει προγενέστερο ανεξάρτητο δείγμα με την ίδια ερώτηση');
      continue;
    }
    if (u.year < 2013 || u.year > 2026) {
      skip('eb: έτος εκτός 2013–2026');
      continue;
    }
    const s = studies.get(u.q.studyId)!;
    items.push({
      id: `eb:${u.q.id}`,
      family: 'eb_trend',
      source: 'eurobarometer',
      studyId: u.q.studyId,
      sampleKey: u.sample,
      title: s.title,
      year: u.year,
      text: u.q.text,
      options: u.q.options,
      dkOptions: u.q.options.filter((o) => ['dk', 'refusal'].includes(normOption(o))),
      targetMetrics: u.q.optionMetrics,
      targetWaveKey: String(u.year),
      binary: false,
      scheme: 'lake',
      topics: u.q.topics.length ? u.q.topics : s.topics,
      compatKey: u.key,
      n: u.q.n,
      split: splitOf(u.sample),
      productionUsed: false,
      compareOverall: true,
      compareDims: ['gender', 'age_band', 'age_group4', 'education_group']
    });
  }

  // --- Eurostat: ποσοστά ατόμων/νοικοκυριών, χρονοσειρές ---
  const maxPer = opts.maxEurostatPerStudy ?? 4;
  const maxAll = opts.maxEurostat ?? 900;
  const perStudy = new Map<string, number>();
  const es = qs
    .filter((q) => studies.get(q.studyId)?.source === 'eurostat' && q.kind === 'binary' && q.years.length >= 3 && Math.max(...q.years) >= 2014)
    .sort((a, b) => hash01(a.id) - hash01(b.id));
  for (const q of es) {
    if (items.filter((i) => i.family === 'eurostat_ts').length >= maxAll) break;
    if ((perStudy.get(q.studyId) || 0) >= maxPer) continue;
    const metric = q.optionMetrics['Ναι'];
    const w = lakeMetric(metric)?.waves.filter((x) => x.groups.all?.all);
    const last = w?.[w.length - 1];
    const bands = last ? Object.keys(last.groups.age_band || {}).filter((b) => b !== '65+') : [];
    if (!last || bands.length < 3) {
      skip('eurostat: χωρίς ζώνες ηλικίας στο τελευταίο έτος (μη συγκρίσιμος πληθυσμός)');
      continue;
    }
    perStudy.set(q.studyId, (perStudy.get(q.studyId) || 0) + 1);
    const s = studies.get(q.studyId)!;
    const family = q.studyId.split(':')[1].split('_')[0];
    const used = PRODUCTION_EUROSTAT.test(q.studyId);
    items.push({
      id: `es:${q.id}`,
      family: 'eurostat_ts',
      source: 'eurostat',
      studyId: q.studyId,
      sampleKey: `ES:${family}`,
      title: s.title,
      year: last.year,
      text: q.text,
      options: ['Ναι', 'Όχι'],
      dkOptions: [],
      targetMetrics: { Ναι: metric },
      targetWaveKey: last.key,
      binary: true,
      scheme: 'lake',
      topics: q.topics.length ? q.topics : s.topics,
      n: null,
      split: used ? 'calibration' : splitOf(`ES:${family}`),
      productionUsed: used,
      productionReason: used ? 'Σύνολο Eurostat που ήδη τροφοδοτεί το παραγωγικό μοντέλο' : undefined,
      // ο πληθυσμός-βάση των Eurostat διαφέρει (16-74, όλες οι ηλικίες…): συγκρίνονται μόνο οι ζώνες ηλικίας 15-64
      compareOverall: false,
      compareDims: ['age_band']
    });
  }

  // --- World Bank Findex ---
  for (const q of qs.filter((x) => studies.get(x.studyId)?.source === 'worldbank' && x.years.length >= 2)) {
    const metric = q.optionMetrics['Ναι'];
    const last = lastWave(metric);
    if (!last || last.year < 2014) continue;
    items.push({
      id: `wb:${q.id}`,
      family: 'findex_ts',
      source: 'worldbank',
      studyId: q.studyId,
      sampleKey: 'WB:findex',
      title: studies.get(q.studyId)!.title,
      year: last.year,
      text: q.text,
      options: ['Ναι', 'Όχι'],
      dkOptions: [],
      targetMetrics: { Ναι: metric },
      targetWaveKey: last.key,
      binary: true,
      scheme: 'lake',
      topics: q.topics,
      n: 1000,
      split: splitOf('WB:findex'),
      productionUsed: false,
      compareOverall: true,
      compareDims: ['gender', 'age_findex', 'education_findex', 'income_findex']
    });
  }

  // --- διαΝΕΟσις (ήδη στην παραγωγή: μόνο calibration) ---
  for (const rq of researchQuestions()) {
    if (!rq.years || rq.years.length < 2) continue;
    const first = Object.values(rq.optionMetrics)[0];
    const last = lastWave(first);
    if (!last) continue;
    items.push({
      id: `dn:${rq.id}`,
      family: 'dianeosis_ts',
      source: 'dianeosis',
      studyId: rq.datasetId,
      sampleKey: `DN:${last.year}`,
      title: 'διαΝΕΟσις «Τι πιστεύουν οι Έλληνες»',
      year: last.year,
      text: rq.text,
      options: rq.options,
      dkOptions: rq.dkOptions,
      targetMetrics: rq.optionMetrics,
      targetWaveKey: last.key,
      binary: false,
      scheme: 'dianeosis',
      topics: [],
      n: rq.n,
      split: 'calibration',
      productionUsed: true,
      productionReason: 'Δεδομένα και backtests της διαΝΕΟσις χρησιμοποιήθηκαν ήδη στην παραγωγή',
      compareOverall: true,
      compareDims: ['age_gender', 'education_group', 'region']
    });
  }

  // --- NORAYA (δείκτες της παραγωγής: μόνο calibration), ένα κύμα ανά έτος 2016–2024 ---
  for (const m of listMetrics().filter((x) => (x.scheme || 'eurobarometer') === 'eurobarometer')) {
    const byYear = new Map<number, PriorWave>();
    m.waves.filter((w) => w.groups.all?.all).forEach((w) => byYear.set(w.year, w));
    for (const [year, w] of Array.from(byYear.entries())) {
      if (year < 2016 || year > 2024) continue;
      if (!m.waves.some((x) => x.year < year && x.groups.all?.all)) continue;
      items.push({
        id: `nr:${m.metric}:${year}`,
        family: 'noraya_ts',
        source: 'noraya',
        studyId: 'noraya-public-opinion',
        sampleKey: `EB-NORAYA:${w.key}`,
        title: 'NORAYA — δείκτες Eurobarometer',
        year,
        text: m.label,
        options: ['Ναι', 'Όχι'],
        dkOptions: [],
        targetMetrics: { Ναι: m.metric },
        targetWaveKey: w.key,
        binary: true,
        scheme: 'eurobarometer',
        topics: [],
        n: w.groups.all.all.n || null,
        split: 'calibration',
        productionUsed: true,
        productionReason: 'Δείκτες NORAYA: priors της παραγωγής',
        compareOverall: true,
        compareDims: ['age_group', 'gender', 'education_group']
      });
    }
  }

  const items2 = items.sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash('sha1')
    .update(JSON.stringify(items2.map((i) => [i.id, i.split, i.targetWaveKey])))
    .digest('hex')
    .slice(0, 12);
  return {
    version: SUITE_VERSION,
    generatedAt: new Date().toISOString(),
    lakeGeneratedAt: lakeMeta().generatedAt,
    hash,
    rules: [
      'Διαχωρισμός ανά ανεξάρτητο δείγμα (κύμα Eurobarometer· το Standard και τα Special του ίδιου κύματος είναι ένα δείγμα).',
      'Ό,τι χρησιμοποιείται ήδη από το παραγωγικό μοντέλο (NORAYA, διαΝΕΟσις, Eurostat ΤΠΕ/SILC/πληθυσμός) μόνο στο calibration.',
      'Eurobarometer: μόνο ερωτήσεις με μοναδική διατύπωση στην έρευνα, όχι δημογραφικές, με ίδιες επιλογές σε προγενέστερο ανεξάρτητο δείγμα.',
      'Eurostat: μόνο ποσοστά ατόμων/νοικοκυριών· σύγκριση μόνο στις ζώνες ηλικίας 15-64 (διαφορετικοί πληθυσμοί-βάση στο σύνολο).',
      'Τυφλή προσομοίωση: έτος αναφοράς = έτος πεδίου − 1, holdout της έρευνας-στόχου μαζί με διπλότυπα και ίδιο δείγμα.'
    ],
    items: items2,
    excluded
  };
}

/** Κελιά πραγματικής κατανομής μιας διάστασης (με τις συνενώσεις ομάδων του engine). */
export function targetCells(wave: PriorWave, dim: string) {
  return dim === 'all' ? wave.groups.all || {} : waveCells(wave, dim);
}
