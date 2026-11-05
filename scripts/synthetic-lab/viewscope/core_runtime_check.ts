// Viewscope v2 — Βήμα 2: έλεγχος ότι το TS runtime του κοινού πυρήνα (core.ts) δίνει το όφελος της αξιολόγησης σε Python.
// Είσοδος: έξοδος του export_core_check.py (έρευνες ελέγχου εκτός εκπαίδευσης PIE). Πληθυσμός: ο βαθμονομημένος GLOPOP-S (όχι τα
// δημογραφικά της πραγματικής έρευνας) — δηλαδή όπως στην πράξη. Σύγκριση INDEP (σημερινή) έναντι CORE με τα ίδια ακριβώς περιθώρια.
//   tsx scripts/synthetic-lab/viewscope/core_runtime_check.ts <dir>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { createRng, deriveSeed } from '../../../lib/synthetic-lab/rng';
import { buildPanel } from '../../../lib/synthetic-lab/persona/panel';
import { loadPersonaModel } from '../../../lib/synthetic-lab/persona/model';
import { DEFAULT_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { coreAssign } from '../../../lib/synthetic-lab/viewscope/core';
import type { SyntheticRespondent } from '../../../lib/synthetic-lab/types';

const dir = process.argv[2];
const OUT = path.resolve(__dirname, '../../../benchmarks/viewscope_v2/results');
const N = 2000, SEEDS = [21, 22, 23];
const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
function spear(a: number[], b: number[]) { const x = rank(a), y = rank(b), n = x.length, m = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - m) * (y[i] - m); sxx += (x[i] - m) ** 2; syy += (y[i] - m) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; }

function main() {
  const model = loadPersonaModel('pie-0.7')!;
  const res: any = { note: 'TS runtime, πληθυσμός GLOPOP-S (n = 2.000), 3 σπόροι· ίδια πραγματικά περιθώρια σε INDEP και CORE.', files: {}, byDomain: {} };
  const agg: Record<string, { INDEP: number[]; CORE: number[]; sI: number[]; sC: number[] }> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    const per = { INDEP: [] as number[][][], CORE: [] as number[][][] };
    for (const seed of SEEDS) {
      const panel = buildPanel({ modelVersion: 'pie-0.7', populationId: DEFAULT_POPULATION_ID, size: N, seed: deriveSeed(seed, 'core-check'), save: false });
      const states = new Map(panel.personas.map((p) => [p.personaId, p]));
      const rs: SyntheticRespondent[] = panel.personas.map((p) => ({ personaId: p.personaId, weight: p.weight, label: 'ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ' as any, answers: [] }));
      for (const mode of ['INDEP', 'CORE'] as const) {
        const cols: number[][] = [];
        d.questions.forEach((q: any) => {
          const p: number[] = d.marginals[q.id];
          let picks: number[] | null = mode === 'CORE' ? coreAssign(q, q.scale, p, rs, { model, states, reproducedPie: false } as any, seed, d.links) : null;
          if (!picks) { // ανεξάρτητη ανάθεση με ακριβές περιθώριο (ίδια με τη σημερινή συμπεριφορά διαδρομών περιθωρίου)
            const z = rs.map((r) => createRng(deriveSeed(seed, 'indep', q.id, r.personaId)).normal());
            const order = z.map((_, i) => i).sort((a, b) => z[a] - z[b]); picks = new Array(rs.length); let pos = 0;
            p.forEach((pk, k) => { const c = k === p.length - 1 ? order.length - pos : Math.round(pk * order.length); for (let j = 0; j < c && pos < order.length; j++) picks![order[pos++]] = k; });
          }
          cols.push(picks);
        });
        const k = cols.length; const R = Array.from({ length: k }, () => new Array(k).fill(NaN));
        for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) R[a][b] = R[b][a] = spear(cols[a], cols[b]);
        per[mode].push(R);
      }
    }
    const k = d.questions.length; const fileRes: any = {};
    for (const mode of ['INDEP', 'CORE'] as const) {
      const R = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => per[mode].reduce((s, M) => s + M[a][b], 0) / SEEDS.length));
      let err: number[] = [], sOk = 0, sN = 0;
      for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
        const rr = d.realSpearman[a][b]; if (rr == null || Number.isNaN(R[a][b])) continue;
        const dom = d.domains[a] === d.domains[b] ? d.domains[a] : 'cross';
        const e = Math.abs(R[a][b] - rr); err.push(e);
        agg[dom] = agg[dom] || { INDEP: [], CORE: [], sI: [], sC: [] }; agg[dom][mode].push(e);
        if (Math.abs(rr) > 0.1) { sN++; const ok = Math.sign(R[a][b]) === Math.sign(rr) ? 1 : 0; sOk += ok; (mode === 'INDEP' ? agg[dom].sI : agg[dom].sC).push(ok); }
      }
      fileRes[mode] = { corrErr: err.reduce((s, x) => s + x, 0) / err.length, signAgree: sOk / sN, pairs: err.length };
    }
    res.files[d.file] = fileRes;
    console.log(d.file, JSON.stringify(fileRes));
  }
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  for (const [dom, v] of Object.entries(agg)) res.byDomain[dom] = { pairs: v.INDEP.length, INDEP: { corrErr: mean(v.INDEP), signAgree: mean(v.sI) }, CORE: { corrErr: mean(v.CORE), signAgree: mean(v.sC) } };
  console.log(JSON.stringify(res.byDomain, null, 1));
  mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, 'core_runtime_check.json'), JSON.stringify(res, null, 1));
}
main();
