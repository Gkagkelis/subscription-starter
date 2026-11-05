// Viewscope v2 — Βήμα 1: κάλυψη (3 δείκτες), φραγή μορφής, καραντίνα, πολιτικός διαχωρισμός, δημοσιευμένα κύματα, runner.
import { describe, expect, it } from 'vitest';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { DEFAULT_POPULATION_ID } from '@/lib/synthetic-lab/population/store';
import { coverage } from '@/lib/synthetic-lab/viewscope/coverage';
import { answerFromCrosswalk, findCrosswalk, loadCrosswalks } from '@/lib/synthetic-lab/viewscope/crosswalk';
import { politicalSplit, SUBGROUP_LABEL } from '@/lib/synthetic-lab/viewscope/political';
import { mapOptions, routePublishedWave, type PublishedWave } from '@/lib/synthetic-lab/viewscope/published-waves';
import { assertDatasetUse, datasetUse } from '@/lib/synthetic-lab/viewscope/quarantine';
import { gateFormat, loadRoutes, type QuestionRoute } from '@/lib/synthetic-lab/viewscope/routes';
import { runViewscope, shouldOverride } from '@/lib/synthetic-lab/viewscope/runner';
import { entityTokens, isDkOption, sameEntities, trigramJaccard } from '@/lib/synthetic-lab/viewscope/text';
import type { Question } from '@/lib/synthetic-lab/types';

const Q = 'Κατά τη γνώμη σας η χώρα μας αυτή την περίοδο κινείται προς τη σωστή ή προς τη λάθος κατεύθυνση;';
const OPTS = ['Προς τη σωστή', 'Προς τη λάθος', 'Ούτε-ούτε (αυθ.)', 'ΔΓ/ΔΑ (αυθ.)'];
function wave(id: string, org: string, availableAt: string, values: number[], options = OPTS, question = Q, quality: 'high' | 'low' = 'high'): PublishedWave {
  return { id, org, orgLabel: org, question, options, values, n: 1000, fieldworkStart: availableAt, fieldworkEnd: availableAt, publishedAt: availableAt, availableAt, doc: { docId: id, sha256: null, page: 1, url: null, title: null }, kind: 'polls', extraction: { method: 'pdf_text_auto', sumOk: true }, quality };
}
const route = (over: Partial<QuestionRoute>): QuestionRoute => ({ questionId: 'q', type: 'single_choice', answerable: true, route: 'pie_tier1', engineClass: 'E', class: 'E', validated: true, expectedMAE: 5.3, validationStatus: 'validated', notes: [], ...over });

describe('Viewscope v2 — κείμενα και οντότητες', () => {
  it('ταυτίζει ίδιες διατυπώσεις, ξεχωρίζει διαφορετικά πρόσωπα/θεσμούς', () => {
    expect(trigramJaccard(Q, Q)).toBe(1);
    expect(sameEntities('γνώμη για τον Πρωθυπουργό κ. Μητσοτάκη;', 'γνώμη για τον Πρόεδρο του ΠΑΣΟΚ;')).toBe(false);
    expect(Array.from(entityTokens('10. Θα θέλατε στις επόμενες εκλογές;'))).toEqual([]);
    expect(isDkOption('ΔΓ/ΔΑ (αυθ.)') && isDkOption('Δεν ξέρω / Δεν απαντώ')).toBe(true);
  });
});

describe('Viewscope v2 — δημοσιευμένα κύματα (κανόνες προκαταχώρισης)', () => {
  it('ποτέ σιωπηλό 0% σε νέα επιλογή· ΔΓ/ΔΑ μόνο ως υπόλοιπο', () => {
    expect(mapOptions([...OPTS, 'Νέα επιλογή'], { options: OPTS, values: [30, 67, 2, 1] }).dist).toBeNull();
    const m = mapOptions(OPTS, { options: OPTS.slice(0, 3), values: [30, 67, 2] });
    expect(m.dist![3]).toBeCloseTo(1, 5);
    expect(mapOptions(OPTS.slice(0, 2), { options: OPTS, values: [30, 60, 9, 1] }).dist).toBeNull(); // 10 π.μ. της πηγής χωρίς αντιστοίχιση
  });
  it('χρονικός φραγμός, ίδιος φορέας, μέγιστη ηλικία· κατηγορία πάντα T', () => {
    const entries = [wave('a', 'metron', '2026-07-02', [30, 67, 2, 1]), wave('future', 'metron', '2026-10-20', [10, 10, 10, 70]), wave('other', 'gpo', '2026-09-01', [40, 50, 5, 5])];
    const r = routePublishedWave({ text: Q, options: OPTS }, { org: 'Metron Analysis', fieldworkStart: '2026-10-14', maxAgeMonths: 24, entries });
    expect(r.routed).toBe(true);
    expect(r.source!.id).toBe('a'); // όχι το μεταγενέστερο, όχι άλλος φορέας
    expect(r.evidenceClass).toBe('T');
    expect(r.route).toBe('prev_wave_same_org');
    expect(routePublishedWave({ text: Q, options: OPTS }, { org: 'Metron Analysis', fieldworkStart: '2026-10-14', maxAgeMonths: 2, entries }).routed).toBe(false);
    expect(routePublishedWave({ text: Q, options: OPTS }, { org: 'Pulse', fieldworkStart: '2026-10-14', maxAgeMonths: 24, entries }).routed).toBe(false);
    expect(routePublishedWave({ text: Q, options: OPTS }, { org: 'Pulse', fieldworkStart: '2026-10-14', maxAgeMonths: 24, entries, allowOtherOrg: true }).route).toBe('prev_wave_other_org');
    expect(routePublishedWave({ text: Q, options: OPTS }, { org: 'Metron', fieldworkStart: '2026-10-14', maxAgeMonths: 24, entries: [wave('low', 'metron', '2026-07-02', [30, 67, 2, 1], OPTS, Q, 'low')] }).routed).toBe(false);
  });
  it('η διαδρομή έχει μετρημένη (ιστορική) επικύρωση στο μητρώο, όχι E', () => {
    const r = loadRoutes().routes.prev_wave_same_org;
    expect(r.class).toBe('T');
    expect(r.validation.status).toBe('validated_historical');
  });
});

describe('Viewscope v2 — τρεις ξεχωριστοί δείκτες κάλυψης και φραγή μορφής', () => {
  it('νέα μορφή χωρίς επικυρωμένη διαδρομή → S, αυξάνει μόνο την τεχνική κάλυψη', () => {
    const ranking = gateFormat(route({ type: 'ranking', class: 'E', engineClass: 'E' }));
    expect(ranking.class).toBe('S');
    expect(ranking.validated).toBe(false);
    const cov = coverage([route({}), ranking, route({ answerable: false, route: null, class: null, validated: false })]);
    expect(cov.technical.n).toBe(2);
    expect(cov.empirical.n).toBe(1);
    expect(cov.validated.n).toBe(1);
    expect(cov.scenarioS).toBe(1);
  });
  it('κανόνας προτεραιότητας: κερδίζει το μικρότερο ΜΕΤΡΗΜΕΝΟ σφάλμα· μη επικυρωμένες μόνο σε αποχή/S', () => {
    expect(shouldOverride(route({}), { route: 'prev_wave_same_org', validated: true, mae: 1.38 })).toBe(true);
    expect(shouldOverride(route({ expectedMAE: 1 }), { route: 'prev_wave_same_org', validated: true, mae: 1.38 })).toBe(false);
    expect(shouldOverride(route({}), { route: 'crosswalk_anchor', validated: false, mae: null })).toBe(false);
    expect(shouldOverride(route({ class: 'S' }), { route: 'crosswalk_anchor', validated: false, mae: null })).toBe(true);
  });
});

describe('Viewscope v2 — καραντίνα BankSat', () => {
  it('απαγορεύει εκπαίδευση/επικύρωση ατομικών σχέσεων· επιτρέπει περιθώρια με σήμανση', () => {
    expect(() => assertDatasetUse('banksat', 'individual_training')).toThrow();
    expect(() => assertDatasetUse('BankSat', 'correlation_estimation')).toThrow();
    expect(datasetUse('banksat', 'marginal_validation')).toMatchObject({ allowed: true, flagged: true });
    expect(datasetUse('dn2024a', 'individual_training').allowed).toBe(true);
  });
});

describe('Viewscope v2 — πολιτικές μελέτες: εθνικά ποσοστά χωριστά από υποομάδες', () => {
  it('οι υποομάδες εμφανίζονται μόνο ως S «σενάριο», όχι πρόβλεψη', () => {
    const q: Question = { id: 'v', type: 'single_choice', text: 'Τι θα ψηφίζατε αν είχαμε βουλευτικές εκλογές την επόμενη Κυριακή;', options: ['ΝΔ', 'ΠΑΣΟΚ', 'Άλλο κόμμα'] };
    const s = politicalSplit(q, route({ class: 'T', route: 'political_national' }))!;
    expect(s.national.class).toBe('T');
    expect(s.subgroups!.class).toBe('S');
    expect(s.subgroups!.isForecast).toBe(false);
    expect(s.subgroups!.label).toBe(SUBGROUP_LABEL);
    expect(politicalSplit({ id: 'x', type: 'single_choice', text: 'Πόσο συχνά αγοράζετε φρούτα;', options: ['Συχνά', 'Σπάνια'] }, route({}))).toBeNull();
  });
});

describe('Viewscope v2 — ρητοί πίνακες αντιστοίχισης', () => {
  it('ενεργοί μόνο με έγκριση· 1:1 → T, μοιρασμένη κατηγορία → S', () => {
    const cws = loadCrosswalks();
    expect(cws.find((c) => c.id === 'gpo_gov_continuation_reworded')!.approved).toBe(false);
    const c = findCrosswalk('Ποια από τις παρακάτω φράσεις περιγράφει καλύτερα την οικονομική σας κατάσταση:', (cws[0].optionMap as any[]).flatMap((m) => m.options))!;
    expect(c.id).toBe('econ4_hardship5');
    const ps = (econ4: number) => ({ personaId: `p${econ4}`, weight: 1, demographics: {} as any, anchors: { econ4 } as any, pseed: 1 });
    expect(answerFromCrosswalk(c, ps(3), 1).cls).toBe('T');
    expect(answerFromCrosswalk(c, ps(1), 1).cls).toBe('S');
  });
});

describe('Viewscope v2 — runner (προαιρετικός, χωρίς αλλαγή του υπάρχοντος μηχανισμού)', () => {
  it('ο base είναι ταυτόσημος με τον υπάρχοντα runSurvey· 0 κλήσεις API· δρομολόγηση δημοσιευμένου κύματος → T', async () => {
    const plan0 = planStudy({ text: 'Μέτρο επιδότησης ενοικίου για νέους' }).plan!;
    const plan = { ...plan0, sampleSize: 200, questions: [...plan0.questions, { id: 'dir', type: 'single_choice' as const, text: Q, options: OPTS }] };
    const direct = await runSurvey({ plan, populationId: DEFAULT_POPULATION_ID, seed: 7, save: false, stabilityRuns: 0 });
    const v = await runViewscope({ plan, seed: 7, study: { org: 'Metron Analysis', fieldworkStart: '2026-10-14' }, routes: { publishedWaves: true }, publishedWaveEntries: [wave('a', 'metron', '2026-07-02', [30, 67, 2, 1])] });
    expect(JSON.stringify(v.base.respondents)).toBe(JSON.stringify(direct.respondents));
    expect(v.apiCalls).toBe(0);
    const r = v.routes.find((x) => x.questionId === 'dir')!;
    expect(r.route).toBe('prev_wave_same_org');
    expect(r.class).toBe('T');
    const agg = v.aggregates.find((a) => a.questionId === 'dir')!;
    const wrong = agg.shares!.find((s) => s.option === 'Προς τη λάθος')!.share;
    expect(wrong).toBeGreaterThan(55);
    expect(wrong).toBeLessThan(79);
    expect(v.coverage.v2.empirical.n).toBeGreaterThanOrEqual(v.coverage.base.empirical.n);
    expect(v.base.respondents.every((x) => x.answers.find((a) => a.questionId === 'dir')!.rationale?.startsWith('vs2') !== true)).toBe(true);
  });
});
