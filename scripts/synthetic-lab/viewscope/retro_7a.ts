// Viewscope v2 — Phase 7A: ΑΝΑΔΡΟΜΙΚΗ επανάληψη (οι πραγματικές τιμές είναι ήδη γνωστές· δεν είναι holdout).
// Οι κλειδωμένες προβλέψεις ΔΕΝ αλλάζουν (μόνο ανάγνωση). Εφαρμόζονται οι νέες διαδρομές με χρονικό φραγμό = έναρξη πεδίου κάθε έρευνας.
//   tsx scripts/synthetic-lab/viewscope/retro_7a.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { deriveSeed } from '../../../lib/synthetic-lab/rng';
import { buildPanel } from '../../../lib/synthetic-lab/persona/panel';
import { DEFAULT_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { answerFromCrosswalk, findCrosswalk, loadCrosswalks } from '../../../lib/synthetic-lab/viewscope/crosswalk';
import { coverage } from '../../../lib/synthetic-lab/viewscope/coverage';
import { routePublishedWave } from '../../../lib/synthetic-lab/viewscope/published-waves';
import { gateFormat, loadRoutes, routeInfo, type QuestionRoute } from '../../../lib/synthetic-lab/viewscope/routes';
import { shouldOverride } from '../../../lib/synthetic-lab/viewscope/runner';

const REPO = path.resolve(__dirname, '../../..');
const OUT = path.join(REPO, 'benchmarks/viewscope_v2/results');
const SEED = 20261105;
function csv(file: string): Record<string, string>[] {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const parse = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const h = parse(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [h[i], v])));
}
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);

function main() {
  const surveys = JSON.parse(readFileSync(path.join(REPO, 'docs/synthetic-lab/PHASE7A_QUESTIONNAIRES.json'), 'utf8')).surveys as any[];
  const gt = csv(path.join(REPO, 'docs/synthetic-lab/PHASE7A_GROUND_TRUTH.csv'));
  const locked = csv(path.join(REPO, 'docs/synthetic-lab/PHASE7A_LOCKED_PREDICTIONS.csv'));
  const truth = new Map<string, Record<string, number>>();
  gt.forEach((r) => { const k = `${r.survey}|${r.qid}`; truth.set(k, { ...(truth.get(k) || {}), [r.option]: Number(r.observed_pct) }); });
  const pred = (meth: string, k: string) => {
    const rows = locked.filter((r) => r.method === meth && `${r.survey}|${r.qid}` === k && r.answered === 'True' && r.option);
    return rows.length ? Object.fromEntries(rows.map((r) => [r.option, Number(r.predicted_pct)])) : null;
  };
  const score = (p: Record<string, number> | null, t: Record<string, number>) => (p ? mean(Object.keys(t).filter((o) => o in p).map((o) => Math.abs(t[o] - p[o]))) : null);
  const prevSame = JSON.parse(readFileSync(path.join(REPO, 'config/synthetic-lab/p7a/prev_same.json'), 'utf8'));
  // panel PIE για τον ρητό πίνακα αντιστοίχισης (άγκυρα econ4): ίδιο μέγεθος με τις κλειδωμένες εκτελέσεις (n = 2.000)
  const panel = buildPanel({ modelVersion: 'pie-0.7', populationId: DEFAULT_POPULATION_ID, size: 2000, seed: deriveSeed(SEED, 'vs2-retro'), save: false });
  const R = loadRoutes();
  const rows: any[] = []; const baseR: QuestionRoute[] = []; const v2R: QuestionRoute[] = [];
  for (const s of surveys) for (const q of s.questions) {
    const k = `${s.surveyId}|${q.qid}`;
    const t = truth.get(k); if (!t) continue; // μόνο οι 75 με πραγματική τιμή
    const b5 = pred('B5', k), p7 = pred('pie-0.7', k);
    const baseRoute = b5 ? 'pie_tier3' : p7 ? 'pie_tier3' : null;
    const bi = routeInfo(baseRoute);
    const type = q.type === 'likert' ? 'likert' : q.type === 'multi' || q.type === 'multiple_choice' ? 'multiple_choice' : q.type === 'single' || q.type === 'single_choice' ? 'single_choice' : q.type;
    const base: QuestionRoute = gateFormat({ questionId: k, type, answerable: !!(b5 || p7), route: baseRoute, engineClass: bi.cls, class: bi.cls, validated: bi.validated, expectedMAE: bi.mae, validationStatus: bi.status, notes: [] });
    let v2 = { ...base, notes: [] as string[] };
    let v2pred: Record<string, number> | null = b5 || p7;
    let detail = '';
    const w = routePublishedWave({ text: q.text, options: q.options }, { org: s.organisation, fieldworkStart: s.fieldworkStart, maxAgeMonths: R.routes.prev_wave_same_org.maxAgeMonths || 0 });
    if (w.routed && type !== 'multiple_choice') {
      const info = routeInfo(w.route);
      if (shouldOverride(base, { route: w.route!, validated: info.validated, mae: info.mae })) {
        v2 = gateFormat({ ...base, answerable: true, route: w.route, class: 'T', validated: info.validated, expectedMAE: info.mae, validationStatus: info.status, notes: [] });
        v2pred = w.dist; detail = `${w.source!.id} · ${w.source!.fieldworkEnd || w.source!.availableAt} · ηλικία ${w.ageMonths!.toFixed(1)} μ. · ${w.source!.extraction.method}`;
      }
    } else detail = w.reason;
    const c = findCrosswalk(q.text, q.options);
    if (c && !v2.answerable) {
      const counts: Record<string, number> = {}; let T = 0, S = 0, n = 0;
      panel.personas.forEach((ps) => { const a = answerFromCrosswalk(c, ps, SEED); if (!a.option) return; counts[a.option] = (counts[a.option] || 0) + 1; n++; if (a.cls === 'T') T++; else S++; });
      // ΔΞ/ΔΑ: η άγκυρα δεν έχει τέτοια κατηγορία → δεν εκτιμάται (δεν βαθμολογείται)
      v2pred = Object.fromEntries(Object.entries(counts).map(([o, x]) => [o, (100 * x) / n]));
      const cls = S / n >= 0.05 ? 'S' : 'T';
      v2 = gateFormat({ ...base, answerable: true, route: 'crosswalk_anchor', class: cls, validated: false, expectedMAE: null, validationStatus: 'retrospective_only', notes: [] });
      detail = `crosswalk ${c.id}: T ${(100 * T / n).toFixed(1)}% · S ${(100 * S / n).toFixed(1)}%`;
      // ευαισθησία της παραδοχής διαχωρισμού
      const sens = ((c.optionMap as any[]).find((m) => m.options.length > 1)?.splitSensitivity || []).map((sp: number[]) => {
        const cc: Record<string, number> = {}; let nn = 0;
        panel.personas.forEach((ps) => { const a = answerFromCrosswalk(c, ps, SEED, sp); if (!a.option) return; cc[a.option] = (cc[a.option] || 0) + 1; nn++; });
        return { split: sp, mae: score(Object.fromEntries(Object.entries(cc).map(([o, x]) => [o, (100 * x) / nn])), t) };
      });
      detail += ` · ευαισθησία: ${sens.map((x: any) => `${x.split.join('/')}→${x.mae?.toFixed(2)}`).join(', ')}`;
    }
    const ps = prevSame[s.surveyId]?.[q.qid]?.shares || null;
    rows.push({ survey: s.surveyId, qid: q.qid, type, baseRoute: base.route, baseClass: base.class, baseValidated: base.validated, v2Route: v2.route, v2Class: v2.class, v2Validated: v2.validated,
      maeBase: score(b5 || p7, t), maeV2: score(v2pred, t), maePrevSame: score(ps, t), maeUniform: mean(Object.keys(t).map((o) => Math.abs(t[o] - 100 / Object.keys(t).length))), detail });
    baseR.push(base); v2R.push(v2);
  }
  const routed = rows.filter((r) => r.v2Route && r.v2Route !== r.baseRoute);
  const summary = {
    note: 'ΑΝΑΔΡΟΜΙΚΗ επανάληψη — οι πραγματικές τιμές ήταν γνωστές· οι 12 πηγές Metron είναι η γνωστή βάση PREV_SAME. Δεν αποτελεί holdout· οι κλειδωμένες προβλέψεις δεν άλλαξαν.',
    questions: rows.length,
    coverage: { base: coverage(baseR), v2: coverage(v2R) },
    newlyRouted: routed.map((r) => ({ survey: r.survey, qid: r.qid, route: r.v2Route, class: r.v2Class, maeV2: r.maeV2, maePrevSame: r.maePrevSame, maeUniform: r.maeUniform, detail: r.detail })),
    newlyRoutedMAE: { v2: mean(routed.map((r) => r.maeV2).filter((x) => x != null)), uniform: mean(routed.map((r) => r.maeUniform)), prevSameSameQuestions: mean(routed.map((r) => r.maePrevSame).filter((x) => x != null)) },
    notRouted: rows.filter((r) => !r.v2Route).map((r) => ({ survey: r.survey, qid: r.qid, reason: r.detail }))
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'retro_7a.json'), JSON.stringify({ ...summary, rows }, null, 1));
  console.log(JSON.stringify({ ...summary, notRouted: summary.notRouted.length }, null, 1));
}
main();
