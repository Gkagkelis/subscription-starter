// PHASE 8 (demo ΠΑΣΟΚ): το βήμα του Lab. Φτιάχνει πάνελ 500 συνθετικών προσώπων από τον βαθμονομημένο πληθυσμό
// (GLOPOP-S + Eurostat/ΕΛΣΤΑΤ) και, για καθένα, τις «άγκυρες» του PIE (ψήφος 2023, αυτοτοποθέτηση, οικονομική κατάσταση,
// απασχόληση, πολιτικό ενδιαφέρον) και τις ποσότητες του μοντέλου εκλογικής επιλογής (σενάριο 2026-10, ΧΩΡΙΣ δημοσκοπήσεις):
// πιθανότητα αποχής/αναποφασιστικότητας, χρησιμότητα ανά κόμμα και η απάντηση που θα έδινε το Lab μόνο του.
// Δεν αλλάζει τίποτα στην παραγωγή: διαβάζει staged μοντέλο, save:false.
//   tsx scripts/synthetic-lab/pasok/p8_lab_panel.ts <out.json> [size] [seed]
import { writeFileSync } from 'fs';
import { createRng, hashString } from '../../../lib/synthetic-lab/rng';
import { featureVector, linear, loadPersonaModel, softmax } from '../../../lib/synthetic-lab/persona/model';
import { buildPanel } from '../../../lib/synthetic-lab/persona/panel';
import { answerVote, loadScenario, partyUtilities, type PreparedVote } from '../../../lib/synthetic-lab/persona/vote';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../../../lib/synthetic-lab/population/store';

const out = process.argv[2];
const size = Number(process.argv[3] || 500);
const seed = Number(process.argv[4] || 20261030);
const VERSION = 'pie-0.7';
const model = loadPersonaModel(VERSION)!;
const sc = loadScenario('2026-10')!;
const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
const byId = new Map(pop.personas.map((p) => [p.id, p]));
const panel = buildPanel({ modelVersion: VERSION, populationId: CALIBRATED_POPULATION_ID, size, seed, audience: { minAge: 17 }, save: false });

const optionOf = new Map(sc.parties.map((p) => [p.key, p.key]));
const prep: PreparedVote = { scenario: sc, beta: model.vote!.beta, optionOf, abstainOption: 'abstain', undecidedOption: 'undecided', model: model.vote!, features: [], assumptions: [] };

// ίδια λογική με resolvePrev του vote.ts: ο κωδικός «λοιπά» της ψήφου 2023 μοιράζεται με το επίσημο αποτέλεσμα και την εγγύτητα
function resolvePrev(pv: string | null, lr: number | null, rng: ReturnType<typeof createRng>): string | null {
  if (pv !== 'other') return pv;
  const keys = Object.keys(sc.otherSplit);
  const b = prep.beta;
  const w = keys.map((k) => {
    const p = sc.parties.find((x) => x.key === k);
    const d = lr == null || !p ? 0 : Math.abs(lr - p.position);
    return Math.log(Math.max(sc.otherSplit[k], 1e-6)) + (b.dist || 0) * d + (b.dist2 || 0) * d * d;
  });
  const p = softmax(w);
  const u = rng.next();
  let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i];
    if (u < c) return keys[i];
  }
  return keys[keys.length - 1];
}

const rows = panel.personas.map((ps) => {
  const p = byId.get(ps.personaId)!;
  const fv = featureVector(ps.demographics, ps.anchors);
  const m = model.vote!;
  const pa = m.abstain ? 1 / (1 + Math.exp(-(m.abstain.a + linear(m.abstain.feats, m.abstain.means, m.abstain.b, fv)))) : null;
  const pu = m.undecided ? 1 / (1 + Math.exp(-(m.undecided.a + linear(m.undecided.feats, m.undecided.means, m.undecided.b, fv)))) : null;
  const lr = ps.anchors.lr_none === 1 ? null : ps.anchors.lr7;
  const prev = resolvePrev(ps.anchors.pv, lr, createRng(hashString(`p8prev|${ps.pseed}`)));
  return {
    personaId: ps.personaId,
    weight: ps.weight,
    region: p.regionName,
    regionCode: p.regionCode,
    settlement: p.settlement,
    ageBand: ps.demographics.age_band,
    gender: ps.demographics.gender,
    edu3: ps.demographics.edu3,
    nuts1: ps.demographics.nuts1,
    incomeQuintile: p.incomeQuintile,
    householdType: p.householdType,
    anchors: ps.anchors,
    prev2023: prev,
    pAbstain: pa,
    pUndecided: pu,
    utilities: Object.fromEntries(sc.parties.map((x, i) => [x.key, partyUtilities(prep, prev, lr)[i]])),
    labVoteNoPolls: answerVote(prep, ps, createRng(1))
  };
});
// περιθώρια του βαθμονομημένου πληθυσμού (ενήλικες ηλικιακές ομάδες) για τη στάθμιση του δείγματος των 500
const margins: Record<string, Record<string, number>> = { ageGender: {}, region: {}, edu3: {}, settlement: {} };
for (const p of pop.personas) {
  if (p.ageBand === '0-4' || p.ageBand === '5-14') continue;
  const age = p.ageBand === '15-24' ? '17-24' : p.ageBand;
  const edu = p.education === 'tertiary' ? 'high' : p.education === 'upper_secondary' || p.education === 'lower_secondary' ? 'medium' : p.education === 'unknown' ? 'unknown' : 'low';
  const add = (k: string, v: string) => (margins[k][v] = (margins[k][v] || 0) + p.weight);
  add('ageGender', `${age}|${p.gender}`);
  add('region', p.regionName);
  add('edu3', edu);
  add('settlement', p.settlement);
}
writeFileSync(out, JSON.stringify({ margins, modelVersion: VERSION, modelSnapshot: model.dataSnapshot, cutoff: model.cutoff, populationId: CALIBRATED_POPULATION_ID,
  populationName: pop.summary.name, seed, size, scenario: sc.id, scenarioParties: sc.parties, anchorSources: panel.anchorSources, beta: prep.beta, rows }, null, 1));
console.log(`panel ${rows.length} personas, model ${VERSION} (${model.dataSnapshot}), scenario ${sc.id}`);
