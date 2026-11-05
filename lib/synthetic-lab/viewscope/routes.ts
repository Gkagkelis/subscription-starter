// Viewscope v2 — μητρώο διαδρομών, κατηγορίες E/T/S και φραγή νέων μορφών (Π1).
import { readFileSync } from 'fs';
import path from 'path';
import type { EvidenceClass } from '../structured/evidence-class';
import type { Question, QuestionAggregate, StudyRun } from '../types';

export type ValidationStatus = 'validated' | 'validated_historical' | 'retrospective_only' | 'rejected' | 'unvalidated';
export interface RouteDef { label: string; class: EvidenceClass; maxAgeMonths?: number; validation: { status: ValidationStatus; mae?: number; holdout?: string; note?: string; source?: string; [k: string]: unknown } }
export interface RouteRegistry { version: string; validatedFormats: string[]; routes: Record<string, RouteDef> }

let reg: RouteRegistry | null = null;
export function loadRoutes(): RouteRegistry {
  if (!reg) reg = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'synthetic-lab', 'viewscope', 'routes.json'), 'utf8')) as RouteRegistry;
  return reg;
}
export const isValidatedStatus = (s: ValidationStatus | undefined) => s === 'validated' || s === 'validated_historical';

export interface QuestionRoute {
  questionId: string;
  type: string;
  /** Μπορεί ο μηχανισμός να δώσει απάντηση (μαζί με σενάρια S); */
  answerable: boolean;
  route: string | null;
  /** Κατηγορία όπως τη δίνει ο μηχανισμός. */
  engineClass: EvidenceClass | null;
  /** Κατηγορία μετά τη φραγή μορφής (νέες μορφές → S). */
  class: EvidenceClass | null;
  validated: boolean;
  expectedMAE: number | null;
  validationStatus: ValidationStatus | null;
  notes: string[];
}

/**
 * Φραγή μορφής (Π1): μορφή χωρίς επικυρωμένη διαδρομή (κατάταξη, ανοιχτή, αριθμητική, τιμές, έννοιες…) δεν μπορεί να εμφανιστεί
 * ως E/T — μόνο ως S «νέα μορφή, μόνο σενάριο». Αυξάνει μόνο την τεχνική κάλυψη.
 */
export function gateFormat(r: QuestionRoute): QuestionRoute {
  const R = loadRoutes();
  if (!r.answerable || R.validatedFormats.includes(r.type)) return r;
  return { ...r, class: 'S', route: 'new_format_scenario', validated: false, expectedMAE: null, validationStatus: 'unvalidated', notes: [...r.notes, `μορφή «${r.type}» χωρίς επικυρωμένη διαδρομή → μόνο σενάριο S (κατηγορία μηχανισμού: ${r.engineClass ?? '—'})`] };
}

export function routeInfo(routeId: string | null): { cls: EvidenceClass | null; validated: boolean; mae: number | null; status: ValidationStatus | null } {
  if (!routeId) return { cls: null, validated: false, mae: null, status: null };
  const d = loadRoutes().routes[routeId];
  if (!d) return { cls: null, validated: false, mae: null, status: null };
  return { cls: d.class, validated: isValidatedStatus(d.validation.status), mae: typeof d.validation.mae === 'number' ? d.validation.mae : null, status: d.validation.status };
}

/** Διαδρομή που ΗΔΗ χρησιμοποίησε ο υπάρχων μηχανισμός (μόνο ανάγνωση της εκτέλεσης· καμία αλλαγή). */
export function classifyExistingQuestion(run: StudyRun, q: Question, a: QuestionAggregate | undefined): QuestionRoute {
  const answers = run.respondents.map((r) => r.answers.find((x) => x.questionId === q.id)).filter(Boolean);
  const answerable = answers.some((x) => x!.value !== null && !x!.skipped);
  let route: string | null = null;
  const notes: string[] = [];
  const persona = (a as any)?.persona;
  if (run.personaRun) {
    const tierD = persona?.provenance?.evidenceTier;
    if (tierD) route = tierD.abstain ? null : `pie_tier${tierD.tier}`;
    else route = persona?.support === 'DIRECTLY_SUPPORTED' ? 'pie_direct' : persona?.support === 'MODEL_EXTRAPOLATED' ? 'pie_extrapolated' : null;
    if (route === 'pie_tier5') route = null;
  } else if (run.plan.engine === 'evidence') {
    const ec = a?.evidence?.evidenceClass;
    route = ec === 'EMPIRICALLY_ANCHORED' ? 'egps_anchored' : ec === 'MODEL_EXTRAPOLATED' ? 'egps_extrapolated' : null;
  } else {
    const mix = (a?.basisMix || {}) as Record<string, number>;
    const tot = Object.values(mix).reduce((s, x) => s + x, 0) || 1;
    const sh = (k: string) => (mix[k] || 0) / tot;
    route = sh('uninformed') >= 0.05 ? 'prod1_uninformed' : sh('assumption') >= 0.05 || sh('llm') >= 0.05 ? 'prod1_assumption' : sh('empirical_prior') > 0 ? 'prod1_prior' : null;
  }
  if (!answerable) route = null;
  const info = routeInfo(route);
  return gateFormat({ questionId: q.id, type: q.type, answerable, route, engineClass: info.cls, class: info.cls, validated: info.validated && !!info.cls && info.cls !== 'S', expectedMAE: info.mae, validationStatus: info.status, notes });
}
