// P4.5: βαθμονόμηση της μηνιαίας ανανέωσης ψήφου (h) ώστε η ακαθάριστη μετακίνηση 1 μήνα μεταξύ αποφασισμένων
// να ταιριάζει με το πραγματικό panel MAPLE 2019 (Ιούνιος→Ιούλιος). Επίσης: καθαρή μεταβολή (πρέπει ~0 χωρίς αλλαγή σεναρίου).
import { buildPanel } from '../../../lib/synthetic-lab/persona/panel';
import { loadPersonaModel } from '../../../lib/synthetic-lab/persona/model';
import { prepareVote, answerVote } from '../../../lib/synthetic-lab/persona/vote';
import { CALIBRATED_POPULATION_ID } from '../../../lib/synthetic-lab/population/store';
import { createRng } from '../../../lib/synthetic-lab/rng';
import type { Question } from '../../../lib/synthetic-lab/types';
import { readFileSync } from 'fs';

const MODEL = process.argv[2] || 'pie-0.4';
const TARGET = Number(process.argv[3] || 0.09);
const sc = JSON.parse(readFileSync(process.cwd() + '/config/synthetic-lab/persona/vote-scenarios/2026-10.json', 'utf8'));
const optionParty: Record<string, string> = Object.fromEntries(sc.parties.map((p: any) => [p.label, p.key]));
const q: Question = { id: 'V', type: 'single_choice', text: 'Πρόθεση ψήφου', options: [...Object.keys(optionParty), 'Αποχή', 'Αναποφάσιστος'] } as Question;
const link: any = { kind: 'equivalent', optionMap: {}, vote: { scenario: '2026-10', optionParty, abstainOption: 'Αποχή', undecidedOption: 'Αναποφάσιστος' } };
const model = loadPersonaModel(MODEL)!;
const panel = buildPanel({ modelVersion: MODEL, populationId: CALIBRATED_POPULATION_ID, size: 4000, seed: 7, audience: { minAge: 18 }, save: false });
const res: any[] = [];
for (const h of [0, 0.9995, 0.999, 0.998, 0.997, 0.995, 0.99, 0.98]) {
  const m = { ...model, vote: { ...model.vote!, dynamics: h ? { monthlyRho: h, stayerShare: 0.256, source: 'calib', notes: [] } : undefined } };
  const r = prepareVote(m as any, q, link);
  if (!r.ok) throw new Error(r.reason);
  const p1 = r.prepared;
  const p2 = { ...p1, scenario: { ...p1.scenario, referenceMonth: '2026-11' } };
  const p12 = { ...p1, scenario: { ...p1.scenario, referenceMonth: '2027-10' } };
  const p48 = { ...p1, scenario: { ...p1.scenario, referenceMonth: '2030-08' } };
  let n = 0, sw = 0, n12 = 0, sw12 = 0, n48 = 0, sw48 = 0;
  const c1: Record<string, number> = {}, c2: Record<string, number> = {};
  for (const ps of panel.personas) {
    const a = answerVote(p1, ps, createRng(1));
    const b = answerVote(p2, ps, createRng(1));
    const c = answerVote(p12, ps, createRng(1));
    const e = answerVote(p48, ps, createRng(1));
    const dec = (x: string | null) => x && x !== 'Αποχή' && x !== 'Αναποφάσιστος';
    if (dec(a) && dec(b)) {
      n++;
      if (a !== b) sw++;
      c1[a!] = (c1[a!] || 0) + 1;
      c2[b!] = (c2[b!] || 0) + 1;
    }
    if (dec(a) && dec(e)) {
      n48++;
      if (a !== e) sw48++;
    }
    if (dec(a) && dec(c)) {
      n12++;
      if (a !== c) sw12++;
    }
  }
  const keys = new Set([...Object.keys(c1), ...Object.keys(c2)]);
  let tvd = 0;
  keys.forEach((k) => (tvd += Math.abs((c1[k] || 0) - (c2[k] || 0)) / n));
  res.push({ h, gross1m: +(sw / n).toFixed(4), net1m: +(tvd / 2).toFixed(4), gross12m: +(sw12 / n12).toFixed(4), gross46m: +(sw48 / n48).toFixed(4), n });
}
console.log(JSON.stringify(res));
// γραμμική παρεμβολή για στόχο
for (let i = 1; i < res.length; i++) {
  if (res[i].gross1m >= TARGET && res[i - 1].gross1m < TARGET && i > 0) {
    const h = res[i - 1].h + ((TARGET - res[i - 1].gross1m) / (res[i].gross1m - res[i - 1].gross1m)) * (res[i].h - res[i - 1].h);
    console.log('h*', h.toFixed(3));
  }
}
