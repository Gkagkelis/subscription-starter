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
    // σε πολιτική μελέτη, ΚΑΘΕ ερώτηση (π.χ. γνώμη για πρόσωπο χωρίς λέξη-κλειδί) έχει υποομάδες μόνο ως S
    const leader: Question = { id: 'l', type: 'single_choice', text: 'Έχετε θετική ή αρνητική γνώμη για τον Κυριάκο Μητσοτάκη;', options: ['Θετική', 'Αρνητική'] };
    expect(politicalSplit(leader, route({}))).toBeNull();
    expect(politicalSplit(leader, route({}), undefined, 'political')!.subgroups!.isForecast).toBe(false);
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

// ------------------------------------------------------------ Βήμα 2: κοινός συνθετικός άνθρωπος
import { coreAssign, loadCoreConfig } from '@/lib/synthetic-lab/viewscope/core';
import { eligibleAnswers } from '@/lib/synthetic-lab/viewscope/runner';

function fakePanel(n: number) {
  const item = { id: 'fake::fem', file: 'fake', wave: '2024-01', type: 'ordinal', text: 'x', options: [{ code: '1', label: 'Πολύ' }, { code: '2', label: 'Καθόλου' }], feats: ['female'], means: [0.5], n: 100, dkShare: 0, observed: [0.5, 0.5], model: { kind: 'ordinal', b: [3.0], tau: [0] }, lambda: 0, inSampleMaxErrPp: 0 };
  const states = new Map<string, any>();
  const rs: any[] = [];
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    states.set(id, { personaId: id, weight: 1, demographics: { age_band: '35-44', gender: i % 2 ? 'female' : 'male', edu3: 'medium', nuts1: 'attica', urban: 'urban' }, anchors: {}, pseed: 1000 + i });
    rs.push({ personaId: id, weight: 1, label: 'x', answers: [{ questionId: 'c1', value: null, skipped: false, basis: 'model_extrapolated' }] });
  }
  return { panel: { model: { version: 'pie-0.7', items: [item], constructLatent: null } as any, states, reproducedPie: false }, rs };
}

describe('Viewscope v2 — κοινός συνθετικός άνθρωπος (core)', () => {
  const q: Question = { id: 'c1', type: 'likert', text: 'Πόσο εμπιστεύεστε…', scale: ['Πολύ', 'Λίγο', 'Καθόλου', 'ΔΓ/ΔΑ'] };
  const links = (enabled: boolean, domain = 'social') => ({ version: 'vs-core-1.0', model: 'pie-0.7', atten: 0.9, links: { c1: { domain, enabled, analogs: [{ itemId: 'fake::fem', sim: 0.9, sign: 1, weight: 1 }], reason: 'ok' } } });
  it('διατηρεί ΑΚΡΙΒΩΣ το περιθώριο της διαδρομής και αλλάζει μόνο ποιος απαντά τι', () => {
    const { panel, rs } = fakePanel(1000);
    const p = [0.3, 0.4, 0.25, 0.05];
    const picks = coreAssign(q, q.scale!, p, rs, panel, 7, links(true))!;
    const share = (k: number) => picks.filter((x) => x === k).length / picks.length;
    expect(Math.abs(share(3) - 0.05)).toBeLessThan(0.03); // ΔΓ/ΔΑ ανεξάρτητα, στο ποσοστό της διαδρομής
    const subst = [0, 1, 2].map(share); const tot = subst.reduce((s, x) => s + x, 0);
    [0.3, 0.4, 0.25].forEach((x, k) => expect(Math.abs(subst[k] / tot - x / 0.95)).toBeLessThan(0.01));
    // η δομή προέρχεται από το συγγενικό item (εδώ: φύλο), όχι από επινόηση
    const fem = picks.filter((_, i) => i % 2 === 1 && picks[i] !== 3), mal = picks.filter((_, i) => i % 2 === 0 && picks[i] !== 3);
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(Math.abs(mean(fem) - mean(mal))).toBeGreaterThan(0.2);
    expect(coreAssign(q, q.scale!, p, rs, panel, 7, links(true))).toEqual(picks); // ντετερμινιστικό
  });
  it('χωρίς ενεργή σύνδεση ή σε τομέα που δεν πέρασε την αξιολόγηση → null (μένει ανεξάρτητη)', () => {
    const { panel, rs } = fakePanel(50);
    expect(coreAssign(q, q.scale!, [0.25, 0.25, 0.25, 0.25], rs, panel, 7, links(false))).toBeNull();
    const disabled = Object.keys(loadCoreConfig().disabledDomains)[0];
    if (disabled) expect(coreAssign(q, q.scale!, [0.25, 0.25, 0.25, 0.25], rs, panel, 7, links(true, disabled))).toBeNull();
  });
  it('ερώτηση στην οποία ο μηχανισμός απείχε: απαντούν όλοι, εκτός αν είναι συνέχεια άλλης ερώτησης', () => {
    const parent: Question = { id: 'p', type: 'single_choice', text: 'Έχετε αυτοκίνητο;', options: ['Ναι', 'Όχι'] };
    const child: Question = { id: 'c', type: 'single_choice', text: 'Πόσο ικανοποιημένος;', options: ['Πολύ', 'Λίγο'], followUpOf: { questionId: 'p', whenAnswerIn: ['Ναι'] } };
    const rs: any[] = ['Ναι', 'Όχι', 'Ναι'].map((v, i) => ({ personaId: `r${i}`, weight: 1, label: 'x', answers: [{ questionId: 'p', value: { choice: v }, skipped: false, basis: 'persona_model' }, { questionId: 'c', value: null, skipped: true, basis: 'not_estimable' }] }));
    expect(eligibleAnswers(child, [parent, child], rs).length).toBe(2);
    const solo: Question = { ...child, id: 'c', followUpOf: null };
    expect(eligibleAnswers(solo, [parent, solo], rs).length).toBe(3);
  });
});

// ------------------------------------------------------------ vs-xtab: πίνακες υποομάδων ως πιθανοτικές συνθήκες
import { declaredAssign, matchCrosstabs, personaGroup, xtabAssign, type Crosstab } from '@/lib/synthetic-lab/viewscope/xtab';

function people(n: number) {
  const states = new Map<string, any>(); const rs: any[] = [];
  const ages = ['17-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  for (let i = 0; i < n; i++) {
    const id = `x${i}`;
    states.set(id, { personaId: id, weight: 1, demographics: { age_band: ages[i % 6], gender: i % 2 ? 'female' : 'male', edu3: 'medium', nuts1: 'attica', urban: 'urban' }, anchors: { pv: i % 3 === 0 ? 'nd' : 'syriza', lr7: (i % 7) + 1, econ4: (i % 4) + 1 }, pseed: 7 + i });
    rs.push({ personaId: id, weight: 1, label: 'x', answers: [] });
  }
  return { states, rs };
}
const XT = (o: Partial<Crosstab>): Crosstab => ({ id: 'xt1', org: 'opinion_poll', orgLabel: 'Opinion Poll', question: 'Πόσο πιθανό να ψηφίσετε ένα κόμμα Τσίπρα;', options: ['ΠΟΛΥ', 'ΛΙΓΟ', 'ΚΑΘΟΛΟΥ', 'ΔΓ/ΔΑ'], groups: { 'age:17-34': [30, 30, 40, 0], 'age:35-54': [10, 20, 70, 0], 'age:55-99': [5, 10, 85, 0] }, dims: { age: 3 }, partyBase: null, availableAt: '2026-03-06', fieldworkEnd: '2026-03-06', doc: { docId: 'd1', page: 1, url: null, title: null }, verification: {}, ...o });

describe('Viewscope v2 — vs-xtab (πίνακες υποομάδων)', () => {
  const q: Question = { id: 'tq', type: 'single_choice', text: 'Πόσο πιθανό να ψηφίσετε ένα κόμμα Τσίπρα;', options: ['ΠΟΛΥ', 'ΛΙΓΟ', 'ΚΑΘΟΛΟΥ', 'ΔΓ/ΔΑ'] };
  const p = [0.15, 0.2, 0.62, 0.03];
  it('διατηρεί το συνολικό ποσοστό, ακολουθεί τη διαφορά ομάδων του πίνακα, κρατά ατομική μεταβλητότητα', () => {
    const { states, rs } = people(1200);
    const r = xtabAssign(q, q.options!, p, rs, states, [XT({})], 3)!;
    expect(r.picks).not.toBeNull();
    const picks = r.picks!; const share = (idx: number[], k: number) => idx.filter((i) => picks[i] === k).length / idx.length;
    const all = picks.map((_, i) => i); const subst = all.filter((i) => picks[i] !== 3);
    expect(Math.abs(share(subst, 2) - 0.62 / 0.97)).toBeLessThan(0.02);
    expect(r.report.maxMarginalDevPp).toBeLessThan(2);
    const young = subst.filter((i) => ['17-24', '25-34'].includes(states.get(rs[i].personaId).demographics.age_band));
    const old = subst.filter((i) => ['55-64', '65+'].includes(states.get(rs[i].personaId).demographics.age_band));
    expect(share(old, 2) - share(young, 2)).toBeGreaterThan(0.25);
    expect(new Set(young.map((i) => picks[i])).size).toBeGreaterThan(1); // ίδια ομάδα → διαφορετικές απαντήσεις
    expect(r.report.residual).toMatch(/ανεξαρτησία υπό συνθήκη/);
  });
  it('παλιός πίνακας ή μεγάλη απόκλιση συμφιλίωσης → η διάσταση απορρίπτεται και καταγράφεται', () => {
    const { states, rs } = people(600);
    expect(matchCrosstabs(q, q.options!, { org: 'Opinion Poll', fieldworkStart: '2026-11-16' }, [XT({ availableAt: '2023-01-10', fieldworkEnd: '2023-01-10' })]).length).toBe(0);
    const far = XT({ groups: { 'age:17-34': [90, 5, 5, 0], 'age:35-54': [90, 5, 5, 0], 'age:55-99': [90, 5, 5, 0] } });
    const r = xtabAssign(q, q.options!, p, rs, states, [far], 3)!;
    expect(r.picks).toBeNull();
    expect(r.report.dimsDropped[0].reason).toMatch(/απόκλιση συμφιλίωσης/);
  });
  it('πίνακας ανά κόμμα: μόνο με βάση την ψήφο 2023 (ίδια με την άγκυρα του προσώπου)', () => {
    const { states } = people(3);
    const ps = states.get('x0');
    expect(personaGroup(ps, 'party', ['party:nd', 'party:syriza'], 'unknown')).toBeNull();
    expect(personaGroup(ps, 'party', ['party:nd', 'party:syriza'], 'pastvote_2023-06')).toBe('party:nd');
  });
  it('ίδιο έγγραφο: ο πίνακας πηγαίνει μόνο στην ίδια ερώτηση (οντότητες)', () => {
    const tabs = [XT({ id: 'ts', question: '...Τσίπρα' }), XT({ id: 'sm', question: '...Σαμαρά' })];
    expect(matchCrosstabs(q, q.options!, { org: 'Opinion Poll', fieldworkStart: '2026-11-16', sourceDocId: 'd1' }, tabs).map((t) => t.id)).toEqual(['ts']);
  });
  it('δηλωμένη σχέση S: ίδιο συνολικό ποσοστό, ένταση ήπια < μέτρια', () => {
    const { states, rs } = people(1500);
    const sq: Question = { id: 'sq', type: 'likert', text: 'Πρόθεση αγοράς', scale: ['Όχι', 'Ίσως', 'Ναι'] };
    const pp = [0.3, 0.4, 0.3];
    const diff = (s: number) => { const pk = declaredAssign(sq, sq.scale!, pp, rs, states, { questionId: 'sq', driver: 'econ4', direction: 1, strength: 'mild' }, s, 5)!;
      const hi = pk.filter((_, i) => states.get(rs[i].personaId).anchors.econ4 === 4), lo = pk.filter((_, i) => states.get(rs[i].personaId).anchors.econ4 === 1);
      expect(Math.abs(pk.filter((x) => x === 2).length / pk.length - 0.3)).toBeLessThan(0.01);
      return hi.filter((x) => x === 2).length / hi.length - lo.filter((x) => x === 2).length / lo.length; };
    const d0 = diff(0), d1 = diff(0.15), d2 = diff(0.3);
    expect(Math.abs(d0)).toBeLessThan(0.1); // χωρίς σχέση: μόνο θόρυβος δείγματος
    expect(d2).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThan(d0);
  });
});
