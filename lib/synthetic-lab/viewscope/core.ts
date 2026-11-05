// ============================================================
// Viewscope v2 — Βήμα 2: ΚΟΙΝΟΣ ΣΥΝΘΕΤΙΚΟΣ ΑΝΘΡΩΠΟΣ (έκδοση vs-core-1.0, προαιρετική).
//
// Για μια ερώτηση με γνωστό περιθώριο (π.χ. προηγούμενο δημοσιευμένο κύμα, σενάριο S), αλλάζει ΜΟΝΟ το ποιος δίνει ποια
// απάντηση: σκορ προσώπου από συγγενικά items της PIE (δημογραφικά + άγκυρες + κοινά λανθάνοντα, ίδιος τύπος με IQGE/PIE),
// z = a·σκορ + √(1−a²)·θόρυβος, και ανάθεση με ποσοστημόρια ώστε το περιθώριο να διατηρείται ΑΚΡΙΒΩΣ.
// Η εξασθένιση a και οι ενεργοί τομείς προέρχονται από την αξιολόγηση σε πραγματικές έρευνες εκτός εκπαίδευσης
// (config/synthetic-lab/viewscope/core.json, benchmarks/viewscope_v2/results/core_eval.json). Καμία αλλαγή στην PIE.
// Όπου δεν υπάρχει συγγενικό item ή ο τομέας δεν πέρασε την αξιολόγηση → null (ανεξάρτητη ανάθεση, ρητή σήμανση).
// ============================================================
import { readFileSync } from 'fs';
import path from 'path';
import { createRng, deriveSeed } from '../rng';
import { featureVector, linear } from '../persona/model';
import { theta, type PersonaState } from '../persona/panel';
import type { Question, SyntheticRespondent } from '../types';
import type { corePanelFor } from './core-panel';
import { isDkOption } from './text';

/** variant: 'CORE' = ροπή με ιδιοσυγκρασιακό θόρυβο του item (όπως η PIE)· 'CORE_ETA' = μόνο το κοινό μέρος του προσώπου (η + κοινά λανθάνοντα). */
export interface CoreConfig { version: string; model: string; atten: number; variant?: 'CORE' | 'CORE_ETA'; enabledDomains: string[]; disabledDomains: Record<string, string> }
export interface CoreLink { domain?: string; enabled: boolean; analogs: { itemId: string; sim: number; sign: number; weight: number }[]; reason: string }
export interface CoreLinks { version: string; model: string; atten: number; links: Record<string, CoreLink> }

let cfg: CoreConfig | null = null;
export function loadCoreConfig(): CoreConfig {
  if (!cfg) cfg = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'synthetic-lab', 'viewscope', 'core.json'), 'utf8')) as CoreConfig;
  return cfg;
}

let activeLinks: CoreLinks | null = null;
export function setCoreLinks(l: CoreLinks | null) { activeLinks = l; }

/** Λανθάνουσα ροπή (η + e) ενός item της PIE για ένα πρόσωπο — ίδιος τύπος με το IQGE runtime (respond.ts). */
function propensity(it: any, ps: PersonaState, constructs: Record<string, { key: string; g: number }> | undefined, rng: ReturnType<typeof createRng>, sharedOnly = false): number {
  const noise = () => (sharedOnly ? 0 : rng.normal());
  const fv = featureVector(ps.demographics, ps.anchors);
  const eta = linear(it.feats, it.means, it.model.b, fv);
  const lam = it.factorKey ? it.lambda || 0 : 0;
  const ck = constructs?.[it.factorKey || it.id] || null;
  let e: number;
  if (it.latentRow && it.factorKey) {
    let s = 0, l2 = 0;
    it.latentRow.forEach((l: number, k: number) => { if (l) { s += l * theta(ps.pseed, `${it.factorKey}#${k}`); l2 += l * l; } });
    e = s + Math.sqrt(Math.max(1 - l2, 0)) * noise();
  } else if (lam) {
    let th = theta(ps.pseed, it.factorKey);
    if (ck) th = ck.g * theta(ps.pseed, ck.key) + Math.sqrt(Math.max(1 - ck.g * ck.g, 0)) * th;
    e = lam * th + Math.sqrt(Math.max(1 - lam * lam, 0)) * noise();
  } else e = ck ? ck.g * theta(ps.pseed, ck.key) + Math.sqrt(Math.max(1 - ck.g * ck.g, 0)) * noise() : noise();
  return eta + e;
}

/**
 * Επιστρέφει δείκτη επιλογής για κάθε ενεργό ερωτώμενο (ίδια σειρά με τους respondents που δεν παραλείπουν την ερώτηση),
 * ή null αν δεν υπάρχει ενεργή σύνδεση. Το ΔΓ/ΔΑ ανατίθεται ανεξάρτητα (η PIE δεν έχει δομή για αυτό).
 */
export function coreAssign(q: Question, opts: string[], p: number[], rs: SyntheticRespondent[], panel: ReturnType<typeof corePanelFor>, seed: number, links?: CoreLinks | null): number[] | null {
  const L = (links || activeLinks)?.links?.[q.id];
  const conf = loadCoreConfig();
  if (!L || !L.enabled || !L.analogs.length || (L.domain && !conf.enabledDomains.includes(L.domain))) return null;
  const items = L.analogs.map((a) => ({ a, it: panel.model.items.find((i) => i.id === a.itemId) })).filter((x) => x.it && x.it.model.kind === 'ordinal');
  if (!items.length) return null;
  const n = rs.length;
  const states = rs.map((r) => panel.states.get(r.personaId));
  if (states.some((s) => !s)) return null;
  const constructs = panel.model.constructLatent?.units;
  // σκορ: Σ w·sign·(ροπή − μέσος)/τυπ. απόκλιση, τυποποιημένο στο δείγμα
  const score = new Array(n).fill(0);
  for (const { a, it } of items) {
    const shared = (conf.variant || 'CORE') === 'CORE_ETA';
    const v = states.map((ps, i) => propensity(it, ps!, constructs, createRng(deriveSeed(seed, 'vs2-core-item', it!.id, rs[i].personaId)), shared));
    const m = v.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / n) || 1;
    v.forEach((x, i) => (score[i] += (a.weight * a.sign * (x - m)) / sd));
  }
  const m = score.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(score.reduce((s, x) => s + (x - m) ** 2, 0) / n) || 1;
  const at = Math.min(Math.max((links || activeLinks)?.atten ?? conf.atten, 0), 1);
  const z = score.map((x, i) => at * ((x - m) / sd) + Math.sqrt(1 - at * at) * createRng(deriveSeed(seed, 'vs2-core-noise', q.id, rs[i].personaId)).normal());
  // ΔΓ/ΔΑ: ανεξάρτητα, στο ποσοστό της διαδρομής
  const dkIdx = opts.findIndex((o) => isDkOption(o));
  const out = new Array(n).fill(-1);
  const pool: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = createRng(deriveSeed(seed, 'vs2-core-dk', q.id, rs[i].personaId)).next();
    if (dkIdx >= 0 && u < p[dkIdx]) out[i] = dkIdx; else pool.push(i);
  }
  const subst = opts.map((_, k) => k).filter((k) => k !== dkIdx);
  const ps = subst.map((k) => p[k]);
  const tot = ps.reduce((s, x) => s + x, 0) || 1;
  const order = pool.slice().sort((x, y) => z[x] - z[y]);
  let pos = 0;
  subst.forEach((k, j) => {
    const cnt = j === subst.length - 1 ? order.length - pos : Math.round((ps[j] / tot) * order.length);
    for (let c = 0; c < cnt && pos < order.length; c++) out[order[pos++]] = k;
  });
  return out;
}
