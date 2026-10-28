// Κοινά για τα πολιτικά scripts (αξιολόγηση και τεκμηρίωση δημοσκοπήσεων): ίδια μέθοδος και στα δύο.
import { readFileSync } from 'fs';
import path from 'path';
import { parseCsvObjects } from '../../../lib/synthetic-lab/csv';
import { getMetric } from '../../../lib/synthetic-lab/data/noraya';
import type { PriorWave } from '../../../lib/synthetic-lab/data/noraya-build';
import { dataRoot } from '../../../lib/synthetic-lab/storage/paths';

export const TIDY = path.join(dataRoot(), 'raw/political/tidy');
export const DAY = 86400000;
export type ProfileChoice = 'auto' | 'noraya' | 'cses' | 'none';

export const logit = (p: number) => {
  const x = Math.min(0.998, Math.max(0.002, p));
  return Math.log(x / (1 - x));
};
export const inv = (z: number) => 1 / (1 + Math.exp(-z));
export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export type Dist = Record<string, number>;
export function normalize(d: Dist): Dist {
  const s = Object.values(d).reduce((a, b) => a + b, 0);
  return s > 0 ? Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (100 * v) / s])) : d;
}
export function collapse(d: Dist, keep: Set<string>, other = 'OTHER'): Dist {
  const out: Dist = {};
  for (const [k, v] of Object.entries(d)) {
    const kk = keep.has(k) ? k : other;
    out[kk] = (out[kk] || 0) + v;
  }
  keep.forEach((k) => (out[k] = out[k] || 0));
  out[other] = out[other] || 0;
  return normalize(out);
}

export const partyMap = parseCsvObjects(readFileSync(path.join(TIDY, 'party_map.csv'), 'utf8'));
export const LINEAGE: Record<string, string> = Object.fromEntries(partyMap.map((r) => [r.party_key, r.lineage_key]));
export const NON_PARTY = new Set(['UNDECIDED', 'BLANK_INVALID', 'ABSTENTION', 'NONE', 'YES', 'NO']);
export const lin = (k: string) => {
  if (k === 'OTHERS' || k === 'OTHER_MINOR') return 'OTHER';
  return LINEAGE[k] || k;
};
/** lineage -> κλειδί κόμματος στα δεδομένα ομάδων (NORAYA pol:vote / CSES cses:vote). */
export const ENGINE_KEY: Record<string, string> = {
  ND: 'nd', SYRIZA: 'syriza', PASOK: 'pasok_kinal', PASOK_KINAL: 'pasok_kinal', KINAL: 'pasok_kinal', KKE: 'kke', XA: 'xrysi_avgi', ANEL: 'anel',
  EL: 'elliniki_lysi', MERA25: 'mera25', POTAMI: 'potami', EK: 'enosi_kentroon', PE: 'plefsi', DIMAR: 'dimar', LAOS: 'laos', LAE: 'lae',
  DX: 'dx', OP: 'oikologoi', ANTARSYA: 'antarsya', EPAM: 'epam', OTHER: 'other'
};

export interface Poll {
  id: string;
  pollster: string;
  end: number;
  dist: Dist; // lineage -> % (κανονικοποιημένο σε 100)
}

export function loadPolls(): Poll[] {
  const rows = parseCsvObjects(readFileSync(path.join(TIDY, 'polls_toplines.csv'), 'utf8'));
  const by = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.poll_type !== 'poll' || r.scope !== 'national' || r.scenario !== '0') continue;
    if (!['vote_estimate', 'vote_intention_raw'].includes(r.measure)) continue;
    if (r.possible_duplicate_of || /violation/.test(r.sum_flag) || /missing_date|start_after_end|after_election/.test(r.date_flag)) continue;
    if (!r.fieldwork_end || !r.value_pct) continue;
    (by.get(r.poll_id) || by.set(r.poll_id, []).get(r.poll_id)!).push(r);
  }
  const polls: Poll[] = [];
  by.forEach((rs, id) => {
    const est = rs.filter((r) => r.measure === 'vote_estimate');
    const use = est.length ? est : rs;
    const measure = use[0].measure;
    const d: Dist = {};
    let others = 0;
    let hasOthers = false;
    for (const r of use) {
      if (NON_PARTY.has(r.party_key) || r.party_key.startsWith('LDR_')) continue;
      const v = Number(r.value_pct);
      if (!Number.isFinite(v)) continue;
      const k = lin(r.party_key);
      if (k === 'OTHER') {
        others += v;
        hasOthers = true;
      } else d[k] = (d[k] || 0) + v;
    }
    const s = Object.values(d).reduce((a, b) => a + b, 0);
    if (s <= 0) return;
    // εκτίμηση χωρίς στήλη «άλλα»: το υπόλοιπο ως «Άλλο»· πρόθεση με αναποφάσιστους: αναγωγή στα κόμματα
    if (hasOthers) d.OTHER = others;
    else if (measure === 'vote_estimate' && s < 99) d.OTHER = 100 - s;
    polls.push({ id, pollster: use[0].pollster_norm || use[0].pollster, end: Date.parse(use[0].fieldwork_end), dist: normalize(d) });
  });
  return polls.sort((a, b) => a.end - b.end);
}

export function results() {
  const rows = parseCsvObjects(readFileSync(path.join(TIDY, 'election_results.csv'), 'utf8')).filter((r) => r.level === 'national' && r.pct_valid);
  const out = new Map<string, { date: number; type: string; dist: Dist }>();
  for (const r of rows) {
    const e = out.get(r.election_id) || { date: Date.parse(r.date), type: r.type, dist: {} as Dist };
    const k = lin(r.party_key);
    e.dist[k] = (e.dist[k] || 0) + Number(r.pct_valid);
    out.set(r.election_id, e);
  }
  return out;
}

/** B2: μέσος όρος ανά εταιρεία στις 14 ημέρες πριν από το T (ή οι 3 τελευταίες δημοσκοπήσεις), μετά μέσος εταιρειών. */
export function pollAverage(polls: Poll[], T: number): { dist: Dist; n: number; pollsters: number } | null {
  const before = polls.filter((p) => p.end <= T);
  let win = before.filter((p) => p.end > T - 14 * DAY);
  if (win.length < 3) win = before.slice(-3);
  if (!win.length) return null;
  const byPollster = new Map<string, Dist[]>();
  win.forEach((p) => (byPollster.get(p.pollster) || byPollster.set(p.pollster, []).get(p.pollster)!).push(p.dist));
  const per = Array.from(byPollster.values()).map((ds) => {
    const keys = new Set(ds.flatMap((d) => Object.keys(d)));
    return Object.fromEntries(Array.from(keys).map((k) => [k, mean(ds.map((d) => d[k] || 0))]));
  });
  const keys = new Set(per.flatMap((d) => Object.keys(d)));
  return { dist: normalize(Object.fromEntries(Array.from(keys).map((k) => [k, mean(per.map((d) => d[k] || 0))]))), n: win.length, pollsters: per.length };
}

export const QUARTER_END: Record<string, number> = { Q1: 3, Q2: 6, Q3: 9, Q4: 12 };
/** Το κύμα τελείωσε έως το T (τελευταία ημέρα του τριμήνου ≤ T). Κύματα χωρίς τρίμηνο: τέλος του έτους. */
export function waveBefore(w: PriorWave, T: number): boolean {
  const endMonth = QUARTER_END[w.quarter] ?? 12;
  return Date.UTC(w.year, endMonth, 0) <= T;
}
/** Η νεότερη πηγή διαφορών ομάδων πριν από το T: NORAYA (pol:vote) ή CSES (cses:vote). */
export function profileSource(T: number, PROFILE: ProfileChoice = 'auto'): { prefix: 'pol:vote:' | 'cses:vote:'; scheme: 'eurobarometer' | 'dianeosis'; waveKey: string } | null {
  const cand: { prefix: 'pol:vote:' | 'cses:vote:'; scheme: 'eurobarometer' | 'dianeosis'; w: PriorWave }[] = [];
  if (PROFILE === 'none') return null;
  for (const [prefix, scheme] of [
    ['pol:vote:', 'eurobarometer'],
    ['cses:vote:', 'dianeosis']
  ] as const) {
    if ((PROFILE === 'noraya' && prefix !== 'pol:vote:') || (PROFILE === 'cses' && prefix !== 'cses:vote:')) continue;
    const m = getMetric(`${prefix}nd`);
    const ws = (m?.waves || []).filter((w) => w.groups.all?.all && !w.qualityFlag && waveBefore(w, T));
    if (ws.length) cand.push({ prefix, scheme, w: ws[ws.length - 1] });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.w.year - b.w.year || (QUARTER_END[a.w.quarter] || 0) - (QUARTER_END[b.w.quarter] || 0));
  const best = cand[cand.length - 1];
  return { prefix: best.prefix, scheme: best.scheme, waveKey: best.w.key };
}

export const SCHEME_DIMS = { eurobarometer: ['gender', 'age_group', 'education_group'], dianeosis: ['age_gender', 'education_group'] } as const;