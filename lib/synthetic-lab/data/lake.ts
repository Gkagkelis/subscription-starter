// ============================================================
// Greek Research Data Lake — φόρτωση εξαγωγής και μηχανή ανάκτησης (retrieval).
//
// Το lake χτίζεται από το Python pipeline (scripts/synthetic-lab/lake) σε
// ιδιωτικό φάκελο (<dataRoot>/lake ή SYNTHETIC_LAB_LAKE_DIR, gitignored):
//   export/lake_index.json   μελέτες (προέλευση, ποιότητα, άδεια) + ερωτήσεις/δείκτες
//   export/shards/*.json     PriorMetric[] ανά μελέτη (φορτώνονται κατά απαίτηση)
//
// Κανόνες χρήσης στο simulation engine:
//   - Χρονικός: με asOfYear δεν χρησιμοποιείται κανένα κύμα με έτος συλλογής > asOfYear.
//   - Holdout: μελέτες αξιολόγησης εξαιρούνται, μαζί με διπλότυπα/παράγωγά τους
//     (ίδιο DOI/κύμα σε άλλο αποθετήριο, ίδιο κλειδί τίτλου+έτους).
//   - Άδεια: σε SYNTHETIC_LAB_LICENSE_MODE=commercial φορτώνονται μόνο μελέτες tier «open».
// Χωρίς τοπικό lake όλα επιστρέφουν κενά (το Lab λειτουργεί κανονικά).
// ============================================================

import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import type { PriorMetric } from './noraya-build';
import { licenseMode } from './research';
import { dataRoot } from '../storage/paths';

export const LAKE_DATASET_PREFIX = 'lake:';

export interface LakeStudy {
  studyId: string;
  source: string;
  title: string;
  publisher: string | null;
  url: string | null;
  doi: string | null;
  license: string | null;
  tier: 'open' | 'research_only';
  level: 'A' | 'B' | 'C' | 'D';
  quality: number | null;
  representativeness: string | null;
  sampleSize: number | null;
  yearStart: number | null;
  yearEnd: number | null;
  fieldwork: string | null;
  population: string | null;
  topics: string[];
  dedupKey: string | null;
  duplicates: string[];
  shard: string;
  questions: number;
}

export interface LakeQuestion {
  id: string;
  studyId: string;
  kind: 'distribution' | 'binary';
  code: string;
  text: string;
  options: string[];
  dkOptions: string[];
  optionMetrics: Record<string, string>;
  years: number[];
  n: number | null;
  topics: string[];
  multi: boolean;
}

export interface LakeIndex {
  version: string;
  generatedAt: string;
  studies: LakeStudy[];
  questions: LakeQuestion[];
  dimensions: string[];
}

interface Loaded {
  index: LakeIndex;
  studies: Map<string, LakeStudy>;
  questions: Map<string, LakeQuestion>;
  /** Ρίζες λέξεων ανά ερώτηση (για ανάκτηση). */
  stems: Map<string, Set<string>>;
}

let cache: { key: string; value: Loaded | null } | null = null;
const shardCache = new Map<string, Map<string, PriorMetric>>();
const SHARD_CACHE_MAX = 300;

export function lakeDir(): string {
  return process.env.SYNTHETIC_LAB_LAKE_DIR || path.join(dataRoot(), 'lake');
}

function indexPath() {
  return path.join(lakeDir(), 'export', 'lake_index.json');
}

function load(): Loaded | null {
  const p = indexPath();
  if (!existsSync(p)) return null;
  const key = `${p}|${statSync(p).mtimeMs}|${licenseMode()}`;
  if (cache?.key === key) return cache.value;
  let value: Loaded | null = null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as LakeIndex;
    const allowed = (s: LakeStudy) => licenseMode() === 'research' || s.tier === 'open';
    const studies = new Map(raw.studies.filter(allowed).map((s) => [s.studyId, s]));
    const questions = new Map(raw.questions.filter((q) => studies.has(q.studyId)).map((q) => [q.id, q]));
    const stems = new Map<string, Set<string>>();
    questions.forEach((q) => stems.set(q.id, stemSet(`${q.text} ${q.options.join(' ')} ${studies.get(q.studyId)?.title || ''}`)));
    value = { index: { ...raw, studies: Array.from(studies.values()), questions: Array.from(questions.values()) }, studies, questions, stems };
  } catch {
    value = null; // κατεστραμμένη/μερική εξαγωγή: το lake αγνοείται
  }
  cache = { key, value };
  shardCache.clear();
  return value;
}

export function lakeAvailable(): boolean {
  return !!load();
}

export function lakeMeta(): { available: boolean; generatedAt: string | null; studies: number; questions: number; bySource: Record<string, number> } {
  const l = load();
  if (!l) return { available: false, generatedAt: null, studies: 0, questions: 0, bySource: {} };
  const bySource: Record<string, number> = {};
  l.index.studies.forEach((s) => (bySource[s.source] = (bySource[s.source] || 0) + 1));
  return { available: true, generatedAt: l.index.generatedAt, studies: l.index.studies.length, questions: l.index.questions.length, bySource };
}

export function lakeStudies(): LakeStudy[] {
  return load()?.index.studies || [];
}

export function lakeStudy(studyId: string): LakeStudy | null {
  return load()?.studies.get(studyId) || null;
}

export function lakeQuestion(id: string): LakeQuestion | null {
  return load()?.questions.get(id) || null;
}

export function lakeQuestions(): LakeQuestion[] {
  return load()?.index.questions || [];
}

/** studyId ενός δείκτη του lake («lake:<studyId>::<μεταβλητή>[::<επιλογή>]»). */
export function lakeStudyIdOfMetric(metric: string): string | null {
  if (!metric.startsWith(LAKE_DATASET_PREFIX)) return null;
  return metric.slice(LAKE_DATASET_PREFIX.length).split('::')[0] || null;
}

function shard(studyId: string): Map<string, PriorMetric> | null {
  const s = lakeStudy(studyId);
  if (!s) return null;
  const hit = shardCache.get(s.shard);
  if (hit) return hit;
  try {
    const d = JSON.parse(readFileSync(path.join(lakeDir(), 'export', 'shards', s.shard), 'utf8')) as { metrics: PriorMetric[] };
    const m = new Map(d.metrics.map((x) => [x.metric, { ...x, scheme: 'lake' as const, tier: s.tier, datasetId: s.studyId }]));
    if (shardCache.size >= SHARD_CACHE_MAX) shardCache.delete(shardCache.keys().next().value as string);
    shardCache.set(s.shard, m);
    return m;
  } catch {
    return null;
  }
}

export function lakeMetric(metric: string): PriorMetric | null {
  const sid = lakeStudyIdOfMetric(metric);
  if (!sid) return null;
  return shard(sid)?.get(metric) || null;
}

/** Για tests. */
export function resetLakeCache() {
  cache = null;
  shardCache.clear();
}

// ---------------- Holdout (εξαίρεση μελετών αξιολόγησης και παραγώγων τους) ----------------

/**
 * Επεκτείνει τη λίστα holdout με ό,τι μοιράζεται δείγμα με αυτές: διπλότυπα σε άλλα αποθετήρια
 * (`duplicates`), ίδιο κλειδί τίτλου+έτους. Δέχεται studyId ή datasetId του Lab.
 */
export function expandHoldout(ids: string[] = []): Set<string> {
  const out = new Set(ids.filter(Boolean));
  const l = load();
  if (!l || !out.size) return out;
  const keys = new Set<string>();
  l.index.studies.forEach((s) => {
    if (out.has(s.studyId) && s.dedupKey) keys.add(s.dedupKey);
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of l.index.studies) {
      const linked = out.has(s.studyId) || (s.dedupKey && keys.has(s.dedupKey)) || s.duplicates.some((d) => out.has(d));
      if (linked && !out.has(s.studyId)) {
        out.add(s.studyId);
        changed = true;
      }
      if (out.has(s.studyId)) for (const d of s.duplicates) if (!out.has(d)) (out.add(d), (changed = true));
    }
  }
  return out;
}

/** Έτη Eurobarometer που εξαιρούνται από τα παράγωγα σύνολα NORAYA (προέρχονται από τα ίδια κύματα). */
export function holdoutDerivedYears(holdout: Set<string>): Record<string, number[]> {
  const years = new Set<number>();
  holdout.forEach((id) => {
    const s = lakeStudy(id);
    if (s?.source === 'eurobarometer' && s.yearEnd) years.add(s.yearEnd);
  });
  return years.size ? { 'noraya-public-opinion': Array.from(years).sort() } : {};
}

// ---------------- Ανάκτηση (retrieval) ----------------

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ');
}

const STOP = new Set([
  'ποια', 'ποιοσ', 'ποιεσ', 'ποιο', 'ποιοι', 'πωσ', 'πολυ', 'λιγο', 'οτι', 'αυτο', 'αυτη', 'αυτεσ', 'αυτα', 'ειναι', 'εχετε', 'σασ', 'μασ',
  'στην', 'στον', 'στο', 'στα', 'στισ', 'στουσ', 'απο', 'για', 'και', 'μια', 'ενα', 'εναν', 'οπωσ', 'καθε', 'μεταξυ', 'θεωρειτε', 'πιστευετε',
  'νεα', 'νεοσ', 'νεο', 'θα', 'την', 'τον', 'του', 'τησ', 'των', 'τουσ', 'with', 'what', 'which', 'your', 'have', 'that', 'this', 'from', 'about',
  'would', 'could', 'following', 'tell', 'please', 'there', 'their', 'they', 'does', 'more', 'than', 'other', 'total', 'some', 'into'
]);

/** Μικρό ελληνο-αγγλικό λεξικό θεμάτων: οι πηγές (Eurobarometer, Eurostat) είναι στα αγγλικά. */
const EL_EN: [string, string[]][] = [
  ['ρευμ', ['electricity', 'energy']], ['ενεργει', ['energy', 'electricity']], ['ηλεκτρικ', ['electricity', 'electric']], ['θερμανσ', ['heating', 'heat']],
  ['καυσιμ', ['fuel']], ['φωτοβολτα', ['solar']], ['μπυρ', ['beer', 'alcohol', 'drink']], ['αλκοολ', ['alcohol', 'drink']], ['κρασ', ['wine', 'alcohol']],
  ['ποτα', ['drink', 'alcohol']], ['καπνισ', ['smoking', 'tobacco', 'cigarettes']], ['τσιγαρ', ['cigarettes', 'tobacco', 'smoking']],
  ['συνδρομ', ['subscription', 'subscribe']], ['ταινι', ['films', 'movies', 'video', 'streaming']], ['σειρ', ['series', 'video', 'streaming']],
  ['streaming', ['streaming', 'video', 'internet']], ['τηλεορασ', ['television', 'tv']], ['μουσικ', ['music']], ['βιβλι', ['books', 'reading']],
  ['κινηματογρ', ['cinema']], ['θεατρ', ['theatre']], ['πολιτισμ', ['culture', 'cultural']], ['αθλητ', ['sport', 'sports']],
  ['γυμναστ', ['exercise', 'sport', 'physical']], ['ασκησ', ['exercise', 'physical']], ['διατροφ', ['diet', 'food', 'nutrition']],
  ['τροφιμ', ['food']], ['φαγητ', ['food', 'meals']], ['βιολογικ', ['organic']], ['ρουχ', ['clothes', 'clothing']], ['ενδυσ', ['clothing', 'clothes']],
  ['παπουτσ', ['shoes', 'footwear']], ['μοδα', ['fashion', 'clothing']], ['αγορ', ['buy', 'purchase', 'shopping']], ['ψωνι', ['shopping', 'buy']],
  ['online', ['online', 'internet']], ['ιντερνετ', ['internet', 'online']], ['διαδικτυ', ['internet', 'online']], ['κινητ', ['mobile', 'phone']],
  ['τηλεφων', ['phone', 'telephone']], ['εφαρμογ', ['app', 'apps', 'applications']], ['social', ['social', 'networks']], ['κοινωνικα δικτυ', ['social', 'networks']],
  ['ειδησ', ['news']], ['ενημερωσ', ['information', 'news', 'media']], ['τραπεζ', ['bank', 'banking', 'account']], ['πληρωμ', ['payment', 'payments', 'pay']],
  ['καρτ', ['card', 'cards']], ['μετρητ', ['cash']], ['δανει', ['loan', 'borrow', 'credit']], ['πιστωτ', ['credit']], ['αποταμιευ', ['save', 'saving', 'savings']],
  ['χρεο', ['debt']], ['εισοδημ', ['income']], ['φτωχ', ['poverty', 'poor']], ['τιμ', ['prices', 'price']], ['ακριβει', ['prices', 'cost', 'inflation']],
  ['πληθωρισμ', ['inflation', 'prices']], ['στεγ', ['housing', 'home', 'dwelling']], ['σπιτ', ['home', 'house', 'housing']], ['ενοικ', ['rent']],
  ['μεταφορ', ['transport']], ['αυτοκινητ', ['car', 'cars']], ['συγκοινων', ['public transport', 'transport']], ['ποδηλατ', ['bicycle', 'cycling']],
  ['ταξιδ', ['travel', 'trip', 'holiday']], ['διακοπ', ['holiday', 'holidays', 'vacation']], ['τουρισ', ['tourism', 'tourist', 'holiday']],
  ['ξενοδοχ', ['hotel', 'accommodation']], ['υγει', ['health', 'healthcare']], ['γιατρ', ['doctor', 'medical']], ['φαρμακ', ['medicine', 'medicines', 'pharmacy']],
  ['ψυχικ', ['mental', 'wellbeing']], ['περιβαλλ', ['environment', 'environmental']], ['κλιματ', ['climate']], ['ανακυκλ', ['recycling', 'recycle', 'waste']],
  ['πλαστικ', ['plastic']], ['ρυπανσ', ['pollution']], ['νερο', ['water']], ['εμπιστοσ', ['trust']], ['διαφθορ', ['corruption']], ['δημοκρατ', ['democracy']],
  ['ευρωπ', ['european', 'europe', 'eu']], ['μεταναστ', ['immigration', 'immigrants', 'migrants', 'migration']], ['προσφυγ', ['refugees']],
  ['εργασ', ['work', 'job', 'employment']], ['δουλει', ['work', 'job']], ['ανεργ', ['unemployment', 'unemployed']], ['συνταξ', ['pension', 'retired', 'retirement']],
  ['εκπαιδευ', ['education', 'training']], ['σχολ', ['school']], ['πανεπιστημ', ['university']], ['δεξιοτ', ['skills']], ['ψηφιακ', ['digital']],
  ['τεχνητη νοημοσυνη', ['artificial intelligence', 'ai']], ['ρομποτ', ['robots']], ['ασφαλει', ['security', 'safety']], ['εγκλημ', ['crime']],
  ['οικογεν', ['family']], ['παιδι', ['children', 'child']], ['νεοι', ['young']], ['ηλικιωμεν', ['elderly', 'older']], ['καταναλω', ['consumer', 'consumption']],
  ['προϊον', ['product', 'products']], ['προιον', ['product', 'products']], ['ποιοτητ', ['quality']], ['ικανοποιησ', ['satisfaction', 'satisfied']],
  ['επιχειρ', ['business', 'company']], ['ζωα', ['animals', 'animal']], ['αγροτ', ['agriculture', 'farmers', 'farming']], ['ενθαρρυν', ['encourage']],
  ['ταυτοτητ', ['identity']], ['θρησκ', ['religion', 'religious']], ['ισοτητ', ['equality']], ['φυλο', ['gender']], ['γυναικ', ['women']]
];

function stemSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(/[^a-zα-ω0-9]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.slice(0, 5));
  }
  return out;
}

/** Ρίζες ερωτήματος + αγγλικές αντιστοιχίες. */
export function queryStems(query: string): Set<string> {
  const n = norm(query);
  const stems = stemSet(query);
  for (const [el, en] of EL_EN) if (n.includes(norm(el))) en.forEach((w) => stemSet(w).forEach((s) => stems.add(s)));
  return stems;
}

export interface RetrievalOptions {
  /** Έτος αναφοράς: αγνοούνται κύματα μετά από αυτό. */
  asOfYear?: number;
  /** Μελέτες holdout (επεκτείνονται αυτόματα σε διπλότυπα/παράγωγα). */
  holdout?: string[];
  topics?: string[];
  limit?: number;
  kinds?: ('distribution' | 'binary')[];
  sources?: string[];
  minQuality?: number;
}

export interface RetrievalHit {
  question: LakeQuestion;
  study: LakeStudy;
  /** Τελευταίο έτος με μέτρηση ≤ asOfYear. */
  year: number;
  score: number;
  breakdown: { relevance: number; quality: number; recency: number; matched: string[] };
}

/**
 * Ανάκτηση ερωτήσεων/μεταβλητών του lake για ένα ερευνητικό ερώτημα.
 * Σκορ = 0.6·συνάφεια + 0.25·ποιότητα + 0.15·επικαιρότητα (ως προς asOfYear).
 * Κάθε αποτέλεσμα φέρει την προέλευσή του (μελέτη, έτος, επίπεδο, άδεια).
 */
export function searchLake(query: string, opts: RetrievalOptions = {}): RetrievalHit[] {
  const l = load();
  if (!l) return [];
  const q = queryStems(query);
  const holdout = expandHoldout(opts.holdout);
  const asOf = opts.asOfYear ?? new Date().getFullYear();
  const hits: RetrievalHit[] = [];
  for (const question of l.index.questions) {
    if (opts.kinds && !opts.kinds.includes(question.kind)) continue;
    const study = l.studies.get(question.studyId);
    if (!study || holdout.has(study.studyId)) continue;
    if (opts.sources && !opts.sources.includes(study.source)) continue;
    if (opts.minQuality !== undefined && (study.quality ?? 0) < opts.minQuality) continue;
    if (opts.topics?.length && !opts.topics.some((t) => question.topics.includes(t) || study.topics.includes(t))) continue;
    const years = question.years.filter((y) => y <= asOf);
    if (!years.length) continue;
    const t = l.stems.get(question.id)!;
    const matched: string[] = [];
    if (q.size) q.forEach((s) => t.has(s) && matched.push(s));
    if (q.size && !matched.length) continue;
    const relevance = q.size ? Math.min(1, matched.length / Math.min(q.size, 4)) : 0;
    const year = Math.max(...years);
    const recency = Math.exp(-(asOf - year) / 6);
    const quality = (study.quality ?? 30) / 100;
    hits.push({ question, study, year, score: 0.6 * relevance + 0.25 * quality + 0.15 * recency, breakdown: { relevance, quality, recency, matched } });
  }
  hits.sort((a, b) => b.score - a.score || b.year - a.year);
  return hits.slice(0, opts.limit ?? 50);
}
