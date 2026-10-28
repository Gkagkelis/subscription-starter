// ============================================================
// PIE — εκτέλεση έρευνας: panel (Στάδιο Α) → ατομικές απαντήσεις (Στάδιο Β) → αποθήκευση → συγκέντρωση.
// Χρησιμοποιεί ΜΟΝΟ συγκεκριμένη έκδοση μοντέλου (εσωτερικό snapshot του Research Data Lake)· δεν κάνει
// κλήσεις στο διαδίκτυο, δεν διαβάζει δημοσκοπήσεις. Η παραγωγική έκδοση του Lab μένει ανέπαφη (επιλογή engine='persona').
// ============================================================

import { deriveSeed } from '../rng';
import { round, mean, sd } from '../stats';
import { loadPopulation } from '../population/store';
import { newId, saveDoc } from '../storage/file-store';
import { aggregateQuestion } from '../engine/aggregate';
import { checkQuestionnaire } from '../engine/guardrails';
import {
  SIMULATED_LABEL,
  type Persona,
  type Question,
  type StabilityResult,
  type SyntheticAnswer,
  type StudyPlan,
  type StudyRun,
  type SyntheticRespondent
} from '../types';
import { defaultModelVersion, loadPersonaModel, PIE_RUNTIME_VERSION, readRegistry, type PersonaModel } from './model';
import { buildPanel, loadPanel, type SyntheticPanel } from './panel';
import { answerPersona, expectedDistribution, prepareQuestion, type PreparedPersonaQuestion } from './respond';
import { AUTOLINK_VERSION, buildIdf, suggestLink } from './autolink';

export interface PersonaSurveyOptions {
  plan: StudyPlan;
  populationId: string;
  seed?: number;
  runId?: string;
  save?: boolean;
  stabilityRuns?: number;
  licencePolicy?: 'research' | 'commercial';
}

function referenceMonthOf(plan: StudyPlan): string {
  const now = new Date();
  const y = plan.referenceYear || now.getUTCFullYear();
  const m = plan.referenceYear ? plan.referenceMonth || 12 : now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Η επιλογή (ή οι επιλογές) μιας απάντησης ως ετικέτες, για τους κανόνες παράλειψης. */
function givenOptions(q: Question, a: SyntheticAnswer | undefined): string[] {
  const v = a && !a.skipped ? a.value : null;
  if (!v) return [];
  if (v.choice != null) return [v.choice];
  if (v.choices) return v.choices;
  if (v.scaleIndex != null && v.scaleIndex >= 0) return [(q.scale || [])[v.scaleIndex]].filter(Boolean) as string[];
  return [];
}

/**
 * Ατομικές απαντήσεις με τη σειρά του ερωτηματολογίου· ερώτηση συνέχειας (followUpOf) τίθεται ΜΟΝΟ αν η προηγούμενη
 * απάντηση του ίδιου προσώπου είναι μία από τις δηλωμένες (αλλιώς skipped, rationale «εκτός ροής»).
 */
export function respondPanel(panel: SyntheticPanel, prepared: PreparedPersonaQuestion[], seed: number): SyntheticRespondent[] {
  const qById = new Map(prepared.map((pq) => [pq.q.id, pq.q]));
  return panel.personas.map((ps) => {
    const given = new Map<string, SyntheticAnswer>();
    const answers = prepared.map((pq) => {
      const f = pq.q.followUpOf;
      if (f) {
        const prevQ = qById.get(f.questionId);
        const opts = prevQ ? givenOptions(prevQ, given.get(f.questionId)) : [];
        if (!opts.some((o) => f.whenAnswerIn.includes(o))) {
          const skip: SyntheticAnswer = { questionId: pq.q.id, value: null, skipped: true, basis: pq.support === 'NOT_RELIABLY_ESTIMABLE' ? 'not_estimable' : 'persona_model', rationale: 'εκτός ροής (κανόνας παράλειψης)' };
          given.set(pq.q.id, skip);
          return skip;
        }
      }
      const a = answerPersona(pq, ps, seed);
      given.set(pq.q.id, a);
      return a;
    });
    return { personaId: ps.personaId, weight: ps.weight, label: SIMULATED_LABEL, answers };
  });
}

export function runPersonaSurvey(o: PersonaSurveyOptions): StudyRun {
  const t0 = Date.now();
  const seed = o.seed ?? 20261028;
  const runId = o.runId || newId('study');
  const policy = o.licencePolicy || 'research';
  const reg = defaultModelVersion(policy);
  const version = o.plan.personaModelVersion || reg.version;
  if (!version) throw new Error('Δεν υπάρχει έκδοση μοντέλου PIE στο μητρώο (config/synthetic-lab/persona/registry.json).');
  const model: PersonaModel | null = loadPersonaModel(version);
  if (!model) throw new Error(`Το μοντέλο PIE ${version} δεν βρέθηκε στον ιδιωτικό φάκελο δεδομένων.`);
  const status = readRegistry().find((r) => r.version === version)?.status || null;
  const pop = loadPopulation(o.populationId);
  if (!pop) throw new Error('Ο πληθυσμός δεν βρέθηκε.');
  const refMonth = referenceMonthOf(o.plan);
  const warnings: string[] = [
    'AI-GENERATED SYNTHETIC RESEARCH: συνθετικά πρόσωπα από μοντέλο εκτιμημένο σε πραγματικά μικροδεδομένα — όχι πραγματικοί ερωτώμενοι.',
    `Μηχανισμός PIE (${PIE_RUNTIME_VERSION}), μοντέλο ${model.version}${status ? ` (${status})` : ''}, δεδομένα έως ${model.cutoff}, πολιτική αδειών «${model.licencePolicy}».`
  ];
  if (status !== 'approved') warnings.push('Η έκδοση μοντέλου δεν έχει εγκριθεί για παραγωγή· τα αποτελέσματα είναι πειραματικά.');
  if (model.cutoff < refMonth) warnings.push(`Τα πιο πρόσφατα μικροδεδομένα του μοντέλου είναι έως ${model.anchorNodes.map((n) => n.wave).sort().slice(-1)[0]}· ό,τι άλλαξε από τότε δεν αποτυπώνεται.`);
  const guard = checkQuestionnaire(o.plan.researchQuestion, o.plan.questions);
  const base = {
    id: runId,
    createdAt: new Date().toISOString(),
    plan: o.plan,
    populationId: o.populationId,
    populationSummary: pop.summary,
    engine: { mode: 'demo' as const, engineVersion: `${PIE_RUNTIME_VERSION}+${model.version}`, model: null },
    seed,
    cost: { mode: 'demo' as const, model: null, inputTokens: 0, outputTokens: 0, usd: 0, capUsd: 0, calls: 0 }
  };
  if (!guard.allowed) {
    const blocked: StudyRun = {
      ...base,
      status: 'blocked',
      completedAt: new Date().toISOString(),
      respondents: [],
      aggregates: [],
      respondentCount: 0,
      durationMs: Date.now() - t0,
      warnings: [...warnings, ...guard.blockedReasons],
      datasetsUsed: [],
      validation: { status: 'not_applicable', message: 'Η μελέτη δεν εκτελέστηκε.', linkedMetrics: [], backtestIds: [] }
    };
    if (o.save !== false) saveDoc('studies', runId, blocked);
    return blocked;
  }
  warnings.push(...guard.warnings);

  // Στάδιο Α — panel (νέο ή υπάρχον)
  let panel = o.plan.panelId ? loadPanel(o.plan.panelId) : null;
  if (panel && panel.modelVersion !== model.version) {
    warnings.push(`Το panel ${panel.id} δημιουργήθηκε με άλλη έκδοση μοντέλου (${panel.modelVersion})· δημιουργείται νέο.`);
    panel = null;
  }
  if (!panel) panel = buildPanel({ modelVersion: model.version, populationId: o.populationId, size: o.plan.sampleSize, seed: deriveSeed(seed, 'panel'), audience: o.plan.audience, save: o.save });

  // Στάδιο Β — ατομικές απαντήσεις (αποθηκεύονται ΠΡΙΝ από τη συγκέντρωση)
  // Ερωτήσεις χωρίς χειροκίνητη σύνδεση: αυτόματη ερμηνεία (αποδοχή μόνο πάνω από κατώφλι· αλλιώς «δεν εκτιμάται»)
  const idf = o.plan.personaAutoLink === false ? null : buildIdf(model);
  const prepared = o.plan.questions.map((q) => {
    if (q.personaLink || !idf) return prepareQuestion(model, q, refMonth);
    const s = suggestLink(model, q, refMonth, { idf });
    const pq = prepareQuestion(model, s.accepted && s.link ? { ...q, personaLink: s.link } : q, refMonth);
    pq.provenance.autoLink = { version: AUTOLINK_VERSION, accepted: s.accepted, confidence: s.confidence, target: s.target, reason: s.reason };
    return pq;
  });
  const auto = prepared.filter((p) => p.provenance.autoLink?.accepted).map((p) => p.q.id);
  if (auto.length) warnings.push(`Αυτόματη ερμηνεία (${AUTOLINK_VERSION}): ${auto.join(', ')} συνδέθηκαν αυτόματα με πραγματικά δεδομένα (MODEL-EXTRAPOLATED, η αντιστοίχιση καταγράφεται στην προέλευση).`);
  const respondents = respondPanel(panel, prepared, seed);
  const ne = prepared.filter((p) => p.support === 'NOT_RELIABLY_ESTIMABLE').map((p) => p.q.id);
  const ex = prepared.filter((p) => p.support === 'MODEL_EXTRAPOLATED').map((p) => p.q.id);
  warnings.push(
    `Κατηγορίες υποστήριξης: ${prepared.length - ne.length - ex.length} DIRECTLY SUPPORTED · ${ex.length} MODEL-EXTRAPOLATED${ex.length ? ` (${ex.join(', ')})` : ''} · ${ne.length} NOT RELIABLY ESTIMABLE${ne.length ? ` (${ne.join(', ')}: καμία συνθετική απάντηση)` : ''}.`
  );

  // Συγκέντρωση (μόνο από τις ατομικές απαντήσεις)
  // Διασταυρώσεις: κάθε συνθετικός ερωτώμενος (και τα επαναλαμβανόμενα «…~2» της επιλογής PPS) → το προφίλ πληθυσμού του
  const popById = new Map<string, Persona>(pop.personas.map((p) => [p.id, p]));
  const personaMap = new Map<string, Persona>();
  const addIds = (ids: string[]) => ids.forEach((id) => {
    const p = popById.get(id.split('~')[0]);
    if (p) personaMap.set(id, p);
  });
  addIds(panel.personas.map((ps) => ps.personaId));
  const aggregates = o.plan.questions.map((q, i) => {
    const a = aggregateQuestion(q, respondents, personaMap);
    const pq = prepared[i];
    a.persona = { support: pq.support, reason: pq.reason, provenance: { ...pq.provenance, expectedDistribution: expectedDistribution(pq, panel!.personas) } };
    a.evidence = {
      evidenceClass: pq.support === 'DIRECTLY_SUPPORTED' ? 'EMPIRICALLY_ANCHORED' : pq.support === 'MODEL_EXTRAPOLATED' ? 'MODEL_EXTRAPOLATED' : 'NOT_ESTIMABLE',
      basis: pq.support === 'NOT_RELIABLY_ESTIMABLE' ? 'none' : pq.support === 'DIRECTLY_SUPPORTED' ? 'direct' : 'researcher_assumptions',
      reason: pq.reason,
      sources: pq.item ? [pq.item.file] : pq.vote ? pq.vote.model.trainedOn : []
    };
    a.evidenceKind = pq.support === 'NOT_RELIABLY_ESTIMABLE' ? 'simulation' : 'estimate';
    return a;
  });

  let stability: StabilityResult | null = null;
  const runs = o.stabilityRuns ?? 5;
  if (runs > 1) {
    const seeds = Array.from({ length: runs }, (_, i) => deriveSeed(seed, 'pie-stability', i));
    const per = seeds.map((s) => {
      const p2 = buildPanel({ modelVersion: model.version, populationId: o.populationId, size: o.plan.sampleSize, seed: s, audience: o.plan.audience, save: false });
      addIds(p2.personas.map((ps) => ps.personaId));
      const rs = respondPanel(p2, prepared, s);
      return o.plan.questions.map((q) => aggregateQuestion(q, rs, personaMap));
    });
    const perQuestion: StabilityResult['perQuestion'] = [];
    o.plan.questions.forEach((q, qi) => {
      (per[0][qi].shares || []).forEach((sh, oi) => {
        const vals = per.map((r) => r[qi].shares?.[oi]?.share ?? NaN).filter((v) => !Number.isNaN(v));
        if (vals.length) perQuestion.push({ questionId: q.id, option: sh.option, mean: round(mean(vals), 1), sd: round(sd(vals), 2), min: round(Math.min(...vals), 1), max: round(Math.max(...vals), 1) });
      });
    });
    stability = { runs, seeds, perQuestion, maxSd: perQuestion.reduce((m, x) => Math.max(m, x.sd), 0) };
  }

  const usedFiles = new Set<string>();
  prepared.forEach((p) => {
    if (p.item) usedFiles.add(p.item.file);
    p.multi?.forEach((m) => usedFiles.add(m.item.file));
    p.vote?.model.trainedOn.forEach((f) => usedFiles.add(f));
  });
  model.anchorNodes.forEach((n) => n.trainFiles.forEach((f) => usedFiles.add(f)));
  const run: StudyRun = {
    ...base,
    status: 'completed',
    completedAt: new Date().toISOString(),
    respondents,
    aggregates,
    respondentCount: respondents.length,
    durationMs: Date.now() - t0,
    warnings: Array.from(new Set(warnings)),
    datasetsUsed: [pop.summary.datasetId, ...pop.summary.updateStatus.targetsDatasetIds, ...Array.from(usedFiles).map((f) => `pie:${f}`)],
    evidenceContext: { referenceYear: o.plan.referenceYear || null, referenceMonth: o.plan.referenceMonth || null, holdout: [], populationNote: null },
    validation: {
      status: 'partially_validated',
      message: 'Ο μηχανισμός PIE αξιολογήθηκε σε ανεξάρτητο holdout (διαΝΕΟσις 2024)· βλ. docs/synthetic-lab/PERSONA_RESULTS.md. Η συγκεκριμένη έρευνα δεν έχει επικυρωθεί απέναντι σε πραγματική.',
      linkedMetrics: [],
      backtestIds: ['persona-final-holdout']
    },
    stability,
    personaRun: { panelId: panel.id, modelVersion: model.version, modelSnapshot: model.dataSnapshot, licencePolicy: model.licencePolicy, modelStatus: status, anchorSources: panel.anchorSources }
  };
  if (o.save !== false) saveDoc('studies', runId, run);
  return run;
}
