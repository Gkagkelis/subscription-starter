// ============================================================
// Persona Intelligence Engine (PIE) — μοντέλο και χαρακτηριστικά.
//
// Το μοντέλο εκπαιδεύεται εκτός εφαρμογής (scripts/synthetic-lab/persona/train.py) σε ΠΡΑΓΜΑΤΙΚΑ
// μικροδεδομένα και αποθηκεύεται ιδιωτικά στο <data>/persona/models/<version>/{model,items}.json.
// Εδώ γίνεται μόνο ανάγνωση και υπολογισμός πιθανοτήτων — η ίδια λογική με το pie.py (ελέγχεται με τεστ ισοδυναμίας).
// Η εφαρμογή ΔΕΝ ανοίγει το διαδίκτυο και δεν διαβάζει δημοσκοπήσεις κατά την εκτέλεση.
// ============================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { dataRoot } from '../storage/paths';
import type { Persona } from '../types';

/**
 * pie-runtime-2 (Phase 3, 10/2026): επιλογή δείγματος PPS με τα βάρη βαθμονόμησης, κανόνες παράλειψης (followUpOf),
 * ελάχιστη ηλικία 17. pie-runtime-1: απλή τυχαία ανά περιφέρεια, χωρίς κανόνες παράλειψης.
 */
export const PIE_RUNTIME_VERSION = 'pie-runtime-2';

export interface AnchorNode {
  node: 'emp' | 'inc6' | 'econ4' | 'class3' | 'lr7' | 'pv' | 'believer' | 'polint4' | string;
  categories: string[];
  feats: string[];
  means: number[];
  a: number[];
  B: number[][];
  trainFiles: string[];
  wave: string;
  n: number;
  pvElection: string | null;
  observed: Record<string, number>;
}

export interface ItemOption {
  code: string;
  label: string;
}

export interface PersonaItem {
  id: string;
  file: string;
  wave: string;
  type: 'ordinal' | 'binary' | 'nominal';
  text: string;
  options: ItemOption[];
  construct?: string | null;
  family?: string | null;
  feats: string[];
  means: number[];
  n: number;
  dkShare: number;
  dk?: { a: number; b: number[] };
  observed: number[];
  model: { kind: 'ordinal'; b: number[]; tau: number[] } | { kind: 'nominal'; a: number[]; B: number[][] };
  lambda: number;
  factorKey?: string;
  /** C7: γραμμή του Cholesky της μπαταρίας (e = Σ_k L[k]·z_k, z_k κοινά για όλα τα items της μπαταρίας του προσώπου). */
  latentRow?: number[];
  inSampleMaxErrPp: number;
}

export interface ModelSource {
  fileId: string;
  family: string;
  source: string;
  url: string;
  wave: string;
  waveApprox: boolean;
  n: number;
  licence: string;
  tier: string;
  commercialUse: string;
  mode: string;
  population: string;
  pvElection: string | null;
}

export interface PersonaModel {
  version: string;
  engine: 'pie';
  createdAt: string;
  codeCommit: string | null;
  cutoff: string;
  licencePolicy: 'research' | 'commercial';
  holdout: string[];
  l2: number;
  factors: boolean;
  dataSnapshot: string;
  sources: ModelSource[];
  features: string[];
  anchorNodes: AnchorNode[];
  constructs: string[];
  nItems: number;
  syntheticInputs: false;
  items: PersonaItem[];
  vote?: VoteModel | null;
}

/** Μοντέλο εκλογικής επιλογής (conditional logit χωρίς σταθερές ανά κόμμα· βλ. scripts/synthetic-lab/persona/vote_model.py). */
export interface VoteModel {
  version: string;
  trainedOn: string[];
  beta: Record<string, number>;
  abstain: { a: number; feats: string[]; means: number[]; b: number[] } | null;
  undecided: { a: number; feats: string[]; means: number[]; b: number[] } | null;
  notes: string[];
}

// ------------------------------------------------------------ χαρακτηριστικά (ίδια σειρά/ορισμοί με το pie.py)
export const FEATURES = [
  'age_17_24', 'age_25_34', 'age_35_44', 'age_55_64', 'age_65p', 'female', 'edu_low', 'edu_high',
  'n_attica', 'n_north', 'n_islands', 'rural',
  'emp_unemp', 'emp_retired', 'emp_student', 'emp_home', 'emp_public', 'emp_self', 'emp_other',
  'inc', 'econ', 'cls_low', 'cls_high', 'lr', 'lr2', 'lr_none',
  'pv_nd', 'pv_syriza', 'pv_pasok', 'pv_kke', 'pv_farright', 'pv_leftother', 'pv_centre', 'pv_other',
  'believer', 'polint', 'inc_q', 'hhsize'
] as const;

export const PV_FAMILY: Record<string, string> = {
  nd: 'nd', syriza: 'syriza', pasok: 'pasok', kke: 'kke', xa: 'farright', el: 'farright', spartiates: 'farright', niki: 'farright',
  laos: 'farright', anel: 'farright', potami: 'centre', ek: 'centre', dimar: 'centre', lae: 'leftother', mera25: 'leftother',
  plefsi: 'leftother', antarsya: 'leftother', nea_aristera: 'leftother', other: 'other'
};

const NUTS1: Record<string, string> = {
  GRCr101: 'attica', GRCr105: 'north', GRCr106: 'north', GRCr107: 'north', GRCr108: 'north', GRCr109: 'centre', GRCr110: 'centre',
  GRCr111: 'centre', GRCr112: 'centre', GRCr113: 'centre', GRCr102: 'islands', GRCr103: 'islands', GRCr104: 'islands'
};

/** Η «κατάσταση» ενός συνθετικού προσώπου: δημογραφικά (από τον πληθυσμό) + άγκυρες (από το μοντέλο). */
export interface PersonaAnchors {
  emp: string | null;
  inc6: number | null;
  econ4: number | null;
  class3: number | null;
  lr7: number | null;
  lr_none: 0 | 1 | null;
  pv: string | null;
  believer: number | null;
  polint4: number | null;
  /** Εισοδηματικό πεμπτημόριο νοικοκυριού (1–5) και μέγεθος νοικοκυριού (1–5+): από το μοντέλο ή, αν λείπει κόμβος, από τον πληθυσμό (Level B). */
  incq5?: number | null;
  hhsize5?: number | null;
}

export interface PersonaDemographics {
  age_band: string | null;
  gender: string | null;
  edu3: string | null;
  nuts1: string | null;
  urban: string | null;
}

export function demographicsOf(p: Persona): PersonaDemographics {
  const age = p.ageBand === '15-24' ? '17-24' : ['25-34', '35-44', '45-54', '55-64', '65+'].includes(p.ageBand) ? p.ageBand : null;
  const edu =
    p.education === 'tertiary' ? 'high' : p.education === 'upper_secondary' || p.education === 'lower_secondary' ? 'medium' : p.education === 'unknown' ? null : 'low';
  return {
    age_band: age,
    gender: p.gender,
    edu3: edu,
    nuts1: NUTS1[p.regionCode] || null,
    urban: p.settlement === 'unknown' ? null : p.settlement
  };
}

/** Διάνυσμα χαρακτηριστικών (NaN όπου λείπει η μεταβλητή) — ακριβές αντίγραφο του pie.feature_columns. */
export function featureVector(d: PersonaDemographics, a: Partial<PersonaAnchors>): Record<string, number> {
  const f: Record<string, number> = {};
  const set = (k: string, v: number | null | undefined) => (f[k] = v == null || Number.isNaN(v) ? NaN : v);
  const age = d.age_band;
  const ages: [string, string][] = [['age_17_24', '17-24'], ['age_25_34', '25-34'], ['age_35_44', '35-44'], ['age_55_64', '55-64'], ['age_65p', '65+']];
  ages.forEach(([k, b]) => set(k, age == null ? null : age === b ? 1 : 0));
  set('female', d.gender == null ? null : d.gender === 'female' ? 1 : 0);
  set('edu_low', d.edu3 == null ? null : d.edu3 === 'low' ? 1 : 0);
  set('edu_high', d.edu3 == null ? null : d.edu3 === 'high' ? 1 : 0);
  (['attica', 'north', 'islands'] as const).forEach((r) => set(`n_${r}`, d.nuts1 == null ? null : d.nuts1 === r ? 1 : 0));
  set('rural', d.urban == null ? null : d.urban === 'rural' ? 1 : 0);
  const e = a.emp ?? null;
  const emps: [string, string][] = [['emp_unemp', 'unemployed'], ['emp_retired', 'retired'], ['emp_student', 'student'], ['emp_home', 'homemaker'], ['emp_other', 'other']];
  emps.forEach(([k, v]) => set(k, e == null ? null : e === v ? 1 : 0));
  const detail = e != null && e !== 'employed';
  set('emp_public', detail ? (e === 'public_emp' ? 1 : 0) : null);
  set('emp_self', detail ? (e === 'self_emp' || e === 'farmer' ? 1 : 0) : null);
  set('inc', a.inc6 == null ? null : (a.inc6 - 3.5) / 1.5);
  set('econ', a.econ4 == null ? null : (a.econ4 - 2.5) / 1.0);
  set('cls_low', a.class3 == null ? null : a.class3 === 1 ? 1 : 0);
  set('cls_high', a.class3 == null ? null : a.class3 === 3 ? 1 : 0);
  if (a.lr7 === undefined && a.lr_none === undefined) {
    set('lr', null); set('lr2', null); set('lr_none', null);
  } else {
    const none = a.lr_none ?? (a.lr7 == null ? null : 0);
    const z = a.lr7 == null ? NaN : (a.lr7 - 4) / 1.5;
    set('lr', none === 1 ? 0 : none == null ? null : z);
    set('lr2', none === 1 ? 0 : none == null ? null : z * z - 1);
    set('lr_none', none);
  }
  const pv = a.pv;
  const fam = pv == null ? null : PV_FAMILY[pv] || 'nonvote';
  const fams: [string, string][] = [['pv_nd', 'nd'], ['pv_syriza', 'syriza'], ['pv_pasok', 'pasok'], ['pv_kke', 'kke'], ['pv_farright', 'farright'], ['pv_leftother', 'leftother'], ['pv_centre', 'centre'], ['pv_other', 'other']];
  fams.forEach(([k, v]) => set(k, fam == null ? null : fam === v ? 1 : 0));
  set('believer', a.believer ?? null);
  set('polint', a.polint4 == null ? null : (a.polint4 - 2.5) / 1.0);
  set('inc_q', a.incq5 == null ? null : (a.incq5 - 3) / 1.41);
  set('hhsize', a.hhsize5 == null ? null : (a.hhsize5 - 2.5) / 1.2);
  return f;
}

/** Γραμμικός συνδυασμός με τα χαρακτηριστικά του μοντέλου· ελλείπουσες τιμές → μέσος όρος εκπαίδευσης (όπως το design()). */
export function linear(feats: string[], means: number[], coef: number[], fv: Record<string, number>): number {
  let s = 0;
  for (let j = 0; j < feats.length; j++) {
    const v = fv[feats[j]];
    s += coef[j] * (v == null || Number.isNaN(v) ? means[j] : v);
  }
  return s;
}

export function softmax(eta: number[]): number[] {
  const m = Math.max(...eta);
  const e = eta.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Φ(x) — Κανονική συνάρτηση κατανομής (σφάλμα < 1e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

export function nodeProbs(node: AnchorNode, fv: Record<string, number>): number[] {
  const eta = node.a.map((a, k) => a + linear(node.feats, node.means, node.B[k], fv));
  return softmax(eta);
}

/** Κατανομή επί των ουσιαστικών επιλογών ενός item (χωρίς ΔΞ). */
export function itemProbs(item: PersonaItem, fv: Record<string, number>): number[] {
  if (item.model.kind === 'ordinal') {
    const eta = linear(item.feats, item.means, item.model.b, fv);
    const cdf = item.model.tau.map((t) => normalCdf(t - eta));
    const out: number[] = [];
    let prev = 0;
    cdf.forEach((c) => {
      out.push(Math.max(c - prev, 0));
      prev = c;
    });
    out.push(Math.max(1 - prev, 0));
    return out;
  }
  const m = item.model;
  return softmax(m.a.map((a, k) => a + linear(item.feats, item.means, m.B[k], fv)));
}

export function dkProb(item: PersonaItem, fv: Record<string, number>): number {
  if (!item.dk) return 0;
  const z = item.dk.a + linear(item.feats, item.means, item.dk.b, fv);
  return 1 / (1 + Math.exp(-z));
}

// ------------------------------------------------------------ φόρτωση / μητρώο
const CACHE = new Map<string, PersonaModel>();

export function modelsRoot(): string {
  return path.join(dataRoot(), 'persona', 'models');
}

export function loadPersonaModel(version: string): PersonaModel | null {
  if (CACHE.has(version)) return CACHE.get(version)!;
  if (!/^[\w.\-]+$/.test(version)) return null;
  const dir = path.join(modelsRoot(), version);
  const mf = path.join(dir, 'model.json');
  if (!existsSync(mf)) return null;
  const meta = JSON.parse(readFileSync(mf, 'utf8')) as Omit<PersonaModel, 'items'>;
  if ((meta as PersonaModel).syntheticInputs !== false) throw new Error('Μοντέλο χωρίς πιστοποίηση πραγματικών εισόδων — απορρίπτεται.');
  const items = JSON.parse(readFileSync(path.join(dir, 'items.json'), 'utf8')) as PersonaItem[];
  const vf = path.join(dir, 'vote.json');
  const vote = existsSync(vf) ? (JSON.parse(readFileSync(vf, 'utf8')) as VoteModel) : null;
  const model: PersonaModel = { ...(meta as PersonaModel), items, vote };
  CACHE.set(version, model);
  return model;
}

export function clearPersonaModelCache() {
  CACHE.clear();
}

export interface RegistryEntry {
  version: string;
  /** staged = έτοιμη προς ενεργοποίηση· δεν επιλέγεται ποτέ αυτόματα (μόνο με ρητή έκδοση ή έγκριση). */
  status: 'candidate' | 'staged' | 'approved' | 'rejected' | 'retired';
  licencePolicy: 'research' | 'commercial';
  cutoff: string;
  dataSnapshot: string;
  createdAt: string;
  evaluation: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
  /** general = πρόσωπα (κοινωνικές/πολιτικές/καταναλωτικές στάσεις) · household = νοικοκυριά (ΕΟΠ). */
  scope?: 'general' | 'household';
}

const REGISTRY_FILE = path.join(process.cwd(), 'config', 'synthetic-lab', 'persona', 'registry.json');

export function readRegistry(): RegistryEntry[] {
  if (!existsSync(REGISTRY_FILE)) return [];
  return JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')).versions as RegistryEntry[];
}

/** Η εγκεκριμένη έκδοση για την πολιτική αδειών (αν δεν υπάρχει, η πιο πρόσφατη υποψήφια — με προειδοποίηση). */
export function defaultModelVersion(policy: 'research' | 'commercial' = 'research', scope: 'general' | 'household' = 'general'): { version: string | null; status: RegistryEntry['status'] | null } {
  const reg = readRegistry().filter((r) => r.licencePolicy === policy && (r.scope || 'general') === scope);
  const approved = reg.filter((r) => r.status === 'approved').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (approved.length) return { version: approved[0].version, status: 'approved' };
  const cand = reg.filter((r) => r.status === 'candidate').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cand.length ? { version: cand[0].version, status: 'candidate' } : { version: null, status: null };
}
