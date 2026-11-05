// ============================================================
// Viewscope v2 — ΠΡΟΑΙΡΕΤΙΚΟΣ runner (έκδοση «viewscope-2.0»). Η παραγωγική προεπιλογή ΔΕΝ αλλάζει.
//
//   1. Εκτελεί τον υπάρχοντα μηχανισμό ΑΜΕΤΑΒΛΗΤΟ (runSurvey, save:false) → «base».
//   2. Ταξινομεί κάθε ερώτηση: διαδρομή, κατηγορία E/T/S, επικύρωση (routes.json), φραγή μορφής.
//   3. Νέες διαδρομές (μόνο αν ζητηθούν): προηγούμενο δημοσιευμένο κύμα (T) και ρητοί πίνακες αντιστοίχισης (T/S).
//      Κανόνας προτεραιότητας: κερδίζει η διαδρομή με το ΜΙΚΡΟΤΕΡΟ ΜΕΤΡΗΜΕΝΟ σφάλμα· μη επικυρωμένες νέες διαδρομές
//      συμπληρώνουν μόνο αποχές ή σενάρια S.
//   4. Τρεις δείκτες κάλυψης (τεχνική / εμπειρική / επικυρωμένη) για base και v2, χωριστά.
//   5. Πολιτικές μελέτες: εθνικά ποσοστά χωριστά από υποομάδες· οι υποομάδες ΜΟΝΟ ως S «σενάριο».
// Μηδενικές κλήσεις API. Αποθήκευση μόνο με save:true, σε <data>/viewscope/runs (όχι στις μελέτες παραγωγής).
// ============================================================
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { aggregateQuestion } from '../engine/aggregate';
import { runSurvey } from '../engine/survey';
import { createRng, deriveSeed } from '../rng';
import { DEFAULT_POPULATION_ID, loadPopulation } from '../population/store';
import { dataRoot } from '../storage/paths';
import type { EvidenceClass } from '../structured/evidence-class';
import type { Persona, Question, QuestionAggregate, StudyPlan, StudyRun, SyntheticAnswer, SyntheticRespondent } from '../types';
import { corePanelFor } from './core-panel';
import { coverage, type CoverageReport } from './coverage';
import { answerFromCrosswalk, findCrosswalk } from './crosswalk';
import { politicalSplit, type PoliticalSplit } from './political';
import { routePublishedWave, type WaveRouteResult } from './published-waves';
import { classifyExistingQuestion, gateFormat, loadRoutes, routeInfo, type QuestionRoute } from './routes';

export const VIEWSCOPE_VERSION = 'viewscope-2.0';

export interface ViewscopeOptions {
  plan: StudyPlan;
  populationId?: string;
  seed?: number;
  /** Στοιχεία της μελέτης-στόχου για τον χρονικό φραγμό και τον φορέα (διαδρομή δημοσιευμένων κυμάτων). */
  study?: { org?: string | null; fieldworkStart?: string };
  routes?: { publishedWaves?: boolean; allowOtherOrg?: boolean; crosswalks?: boolean };
  /** Βήμα 2: ανάθεση απαντήσεων διαδρομών περιθωρίου μέσω κοινού πυρήνα (βλ. core.ts). */
  core?: { enabled: boolean };
  save?: boolean;
  /** Μόνο για δοκιμές: συγκεκριμένο μητρώο δημοσιευμένων κυμάτων. */
  publishedWaveEntries?: import('./published-waves').PublishedWave[];
}

export interface Override { questionId: string; from: string | null; to: string; class: EvidenceClass; reason: string; source?: Record<string, unknown> }

export interface ViewscopeRun {
  version: typeof VIEWSCOPE_VERSION;
  label: 'ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ';
  base: StudyRun;
  respondents: SyntheticRespondent[];
  aggregates: QuestionAggregate[];
  baseRoutes: QuestionRoute[];
  routes: QuestionRoute[];
  coverage: { base: CoverageReport; v2: CoverageReport };
  political: PoliticalSplit[];
  overrides: Override[];
  answerClasses: Record<string, Record<string, number>>;
  warnings: string[];
  apiCalls: 0;
  timingsMs: Record<string, number>;
}

function optionsOf(q: Question): string[] {
  return q.type === 'likert' ? q.scale || [] : q.options || [];
}
function valueFor(q: Question, option: string): SyntheticAnswer['value'] {
  if (q.type === 'likert') return { scaleIndex: (q.scale || []).indexOf(option) };
  return { choice: option };
}

/** Κανόνας προτεραιότητας (βλ. επικεφαλίδα). */
export function shouldOverride(base: QuestionRoute, candidate: { route: string; validated: boolean; mae: number | null }): boolean {
  if (!base.answerable || base.class === null || base.class === 'S') return true;
  if (!candidate.validated) return false;
  if (!base.validated || base.expectedMAE === null) return true;
  return candidate.mae !== null && candidate.mae < base.expectedMAE;
}

export async function runViewscope(o: ViewscopeOptions): Promise<ViewscopeRun> {
  const t0 = Date.now();
  const seed = o.seed ?? 20261105;
  const populationId = o.populationId || DEFAULT_POPULATION_ID;
  const base = await runSurvey({ plan: o.plan, populationId, seed, save: false, stabilityRuns: 0, mode: 'demo' } as never);
  const t1 = Date.now();
  const warnings: string[] = [];
  const qs = o.plan.questions;
  const baseRoutes = qs.map((q) => classifyExistingQuestion(base, q, base.aggregates.find((a) => a.questionId === q.id)));
  const routes = baseRoutes.map((r) => ({ ...r, notes: [...r.notes] }));
  const respondents: SyntheticRespondent[] = base.respondents.map((r) => ({ ...r, answers: r.answers.map((a) => ({ ...a })) }));
  const overrides: Override[] = [];
  const answerClasses: Record<string, Record<string, number>> = {};
  const R = loadRoutes();
  let panel: ReturnType<typeof corePanelFor> | null = null;
  const needPanel = o.routes?.crosswalks || o.core?.enabled;
  if (needPanel) panel = corePanelFor(base, seed);

  for (let qi = 0; qi < qs.length; qi++) {
    const q = qs[qi];
    const opts = optionsOf(q);
    if (!opts.length || !R.validatedFormats.includes(q.type) || q.type === 'multiple_choice') continue;
    // (α) προηγούμενο δημοσιευμένο κύμα
    if (o.routes?.publishedWaves) {
      if (!o.study?.fieldworkStart) { warnings.push('Η διαδρομή δημοσιευμένων κυμάτων χρειάζεται study.fieldworkStart (χρονικός φραγμός)· δεν εφαρμόστηκε.'); }
      else {
        const maxAge = R.routes['prev_wave_same_org']?.maxAgeMonths ?? 0;
        const w: WaveRouteResult = routePublishedWave({ text: q.text, options: opts }, { org: o.study.org || null, fieldworkStart: o.study.fieldworkStart, maxAgeMonths: maxAge, allowOtherOrg: o.routes.allowOtherOrg, entries: o.publishedWaveEntries });
        if (w.routed && w.route) {
          const info = routeInfo(w.route);
          if (shouldOverride(routes[qi], { route: w.route, validated: info.validated, mae: info.mae })) {
            assignFromDistribution(q, respondents, w.dist!, seed, w.route, panel, !!o.core?.enabled);
            overrides.push({ questionId: q.id, from: routes[qi].route, to: w.route, class: 'T', reason: `προηγούμενο κύμα ${w.source!.orgLabel} (${w.source!.fieldworkEnd || w.source!.availableAt}), ηλικία ${w.ageMonths!.toFixed(1)} μήνες, ομοιότητα ${w.textSimilarity!.toFixed(2)}`, source: { id: w.source!.id, doc: w.source!.doc, extraction: w.source!.extraction.method } });
            routes[qi] = { ...routes[qi], answerable: true, route: w.route, engineClass: routes[qi].engineClass, class: 'T', validated: info.validated, expectedMAE: info.mae, validationStatus: info.status, notes: [...routes[qi].notes, `νέα διαδρομή: ${w.route}`] };
            answerClasses[q.id] = { T: 1 };
            continue;
          } else routes[qi].notes.push(`υπάρχει ${w.route} αλλά η τρέχουσα διαδρομή έχει μικρότερο μετρημένο σφάλμα`);
        } else routes[qi].notes.push(`δημοσιευμένο κύμα: ${w.reason}`);
      }
    }
    // (β) ρητός πίνακας αντιστοίχισης (μόνο εγκεκριμένοι)
    if (o.routes?.crosswalks && panel) {
      const c = findCrosswalk(q.text, opts);
      if (c) {
        const info = routeInfo('crosswalk_anchor');
        if (shouldOverride(routes[qi], { route: 'crosswalk_anchor', validated: info.validated, mae: info.mae })) {
          const counts: Record<string, number> = { T: 0, S: 0 };
          respondents.forEach((r) => {
            const a = r.answers.find((x) => x.questionId === q.id);
            if (!a || a.skipped) return;
            const ps = panel!.states.get(r.personaId);
            const ans = ps ? answerFromCrosswalk(c, ps, seed) : { option: null, cls: null };
            if (!ans.option) { a.value = null; a.basis = 'not_estimable'; a.rationale = 'vs2: χωρίς τιμή άγκυρας'; return; }
            a.value = valueFor(q, ans.option); a.basis = ans.cls === 'T' ? 'model_extrapolated' : 'assumption';
            a.rationale = `vs2:crosswalk_anchor ${c.id} (${ans.cls})`; counts[ans.cls!]++;
          });
          const tot = counts.T + counts.S || 1;
          answerClasses[q.id] = { T: counts.T / tot, S: counts.S / tot };
          const cls: EvidenceClass = counts.S / tot >= 0.05 ? 'S' : 'T';
          overrides.push({ questionId: q.id, from: routes[qi].route, to: 'crosswalk_anchor', class: cls, reason: `ρητός πίνακας ${c.id}: T ${(100 * counts.T / tot).toFixed(1)}% · S (παραδοχή διαχωρισμού) ${(100 * counts.S / tot).toFixed(1)}% — συντηρητικός κανόνας: κατηγορία ερώτησης ${cls}` });
          routes[qi] = gateFormat({ ...routes[qi], answerable: true, route: 'crosswalk_anchor', class: cls, validated: false, expectedMAE: null, validationStatus: info.status, notes: [...routes[qi].notes, `νέα διαδρομή: crosswalk ${c.id}`] });
        }
      }
    }
  }
  const t2 = Date.now();
  const pop = loadPopulation(populationId);
  const personaMap = new Map<string, Persona>();
  const byId = new Map<string, Persona>((pop?.personas || []).map((p) => [p.id, p]));
  respondents.forEach((r) => { const p = byId.get(r.personaId.split('~')[0]); if (p) personaMap.set(r.personaId, p); });
  const aggregates = qs.map((q) => {
    if (!overrides.some((x) => x.questionId === q.id)) return base.aggregates.find((a) => a.questionId === q.id)!;
    return aggregateQuestion(q, respondents, personaMap);
  });
  const political = qs.map((q, i) => politicalSplit(q, routes[i], aggregates[i])).filter((x): x is PoliticalSplit => !!x);
  if (political.some((p) => p.subgroups && !p.subgroups.isForecast)) warnings.push('Πολιτικές υποομάδες: οι διαφορές ομάδων ΔΕΝ έχουν επικυρωθεί (P2) — παρουσιάζονται μόνο ως σενάριο S, όχι ως πρόβλεψη.');
  const run: ViewscopeRun = {
    version: VIEWSCOPE_VERSION,
    label: 'ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ',
    base,
    respondents,
    aggregates,
    baseRoutes,
    routes,
    coverage: { base: coverage(baseRoutes), v2: coverage(routes) },
    political,
    overrides,
    answerClasses,
    warnings,
    apiCalls: 0,
    timingsMs: { base: t1 - t0, routing: t2 - t1, total: Date.now() - t0 }
  };
  if (o.save) {
    const dir = path.join(dataRoot(), 'viewscope', 'runs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${base.id}.json`), JSON.stringify({ ...run, base: { id: base.id, engine: base.engine } }));
  }
  return run;
}

/**
 * Ανάθεση απαντήσεων από κατανομή-στόχο. Χωρίς κοινό πυρήνα: ανεξάρτητες κληρώσεις (συμπεριφορά Βήματος 1).
 * Με κοινό πυρήνα (Βήμα 2): βλ. core.ts — η κατανομή διατηρείται, αλλάζει μόνο ΠΟΙΟΣ δίνει ποια απάντηση.
 */
function assignFromDistribution(q: Question, respondents: SyntheticRespondent[], dist: Record<string, number>, seed: number, route: string, panel: ReturnType<typeof corePanelFor> | null, useCore: boolean) {
  const opts = optionsOf(q);
  const p = opts.map((o) => Math.max(0, dist[o] || 0));
  const tot = p.reduce((s, x) => s + x, 0) || 1;
  const cum: number[] = []; p.reduce((s, x, i) => (cum[i] = s + x / tot), 0);
  const active = respondents.map((r) => r.answers.find((a) => a.questionId === q.id)).filter((a): a is SyntheticAnswer => !!a && !a.skipped);
  let picks: number[] | null = null;
  if (useCore && panel) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('./core') as typeof import('./core');
    picks = core.coreAssign(q, opts, p.map((x) => x / tot), respondents.filter((r) => r.answers.some((a) => a.questionId === q.id && !a.skipped)), panel, seed);
  }
  active.forEach((a, i) => {
    let k: number;
    if (picks && picks[i] != null && picks[i] >= 0) k = picks[i];
    else { const u = createRng(deriveSeed(seed, 'vs2-draw', q.id, i)).next(); k = cum.findIndex((c) => u < c); if (k < 0) k = opts.length - 1; }
    a.value = valueFor(q, opts[k]);
    a.basis = 'model_extrapolated';
    a.rationale = `vs2:${route}${picks ? ' + κοινός πυρήνας' : ''}`;
  });
}
