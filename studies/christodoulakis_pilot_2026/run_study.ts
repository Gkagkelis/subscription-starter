// Εκτέλεση της πιλοτικής μελέτης με τη Viewscope v2 (commit d01b571, χωρίς αλλαγές στην πλατφόρμα) + παραγωγή αρχείων ανάλυσης.
//   SYNTHETIC_LAB_DATA_DIR=<απομονωμένο αντίγραφο> tsx studies/christodoulakis_pilot_2026/run_study.ts
// Βασικός μηχανισμός: EGPS («Τεκμηριωμένη πρόβλεψη») — απέχει όπου δεν υπάρχει τεκμηρίωση (αντί για ουδέτερες κατανομές).
// Σημαίες v2: published-waves, crosswalks, core (+ συνδέσεις), xtab — εφαρμόζονται μόνο όπου είναι έγκυρες (καταγράφεται).
// Καμία δηλωμένη σχέση S. Καμία χειροκίνητη διόρθωση: όλα τα αρχεία προκύπτουν από την έξοδο του runner.
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runViewscope } from '../../lib/synthetic-lab/viewscope/runner';
import { corePanelFor } from '../../lib/synthetic-lab/viewscope/core-panel';
import { loadPopulation } from '../../lib/synthetic-lab/population/store';
import type { Question } from '../../lib/synthetic-lab/types';

const DIR = __dirname; const SEED = 20261116;
const d = JSON.parse(readFileSync(path.join(DIR, 'questionnaire', 'plan.json'), 'utf8'));
const links = JSON.parse(readFileSync(path.join(DIR, 'questionnaire', 'core_links.json'), 'utf8'));
const plan = { ...d.plan, engine: 'evidence' };
const csvEsc = (x: unknown) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const optsOf = (q: Question) => (q.type === 'likert' ? q.scale || [] : q.options || []);
const label = (q: Question, v: any): string => (!v ? '' : v.choice ?? (v.scaleIndex != null ? optsOf(q)[v.scaleIndex] : v.choices ? v.choices.join(' | ') : ''));

async function main() {
  const t0 = process.hrtime.bigint();
  const v = await runViewscope({ plan, seed: SEED, study: d.study, routes: { publishedWaves: true, crosswalks: true }, core: { enabled: true, links }, xtab: { enabled: true } } as any);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const v2 = await runViewscope({ plan, seed: SEED, study: d.study, routes: { publishedWaves: true, crosswalks: true }, core: { enabled: true, links }, xtab: { enabled: true } } as any);
  const fp = (x: typeof v) => createHash('sha256').update(JSON.stringify(x.respondents.map((r) => r.answers.map((a) => a.value)))).digest('hex');
  // χαρακτηριστικά προσώπων: δημογραφικά (πληθυσμός) + άγκυρες PIE (ίδια ντετερμινιστική παραγωγή με τον runner)
  const pop = loadPopulation(v.base.populationId)!; const byId = new Map(pop.personas.map((p) => [p.id, p]));
  const panel = corePanelFor(v.base, SEED);
  const qs: Question[] = plan.questions;
  const rows = v.respondents.map((r, i) => {
    const p = byId.get(r.personaId.split('~')[0])!; const st = panel.states.get(r.personaId)!; const a = st.anchors as any;
    const base: Record<string, unknown> = { respondent: `R${String(i + 1).padStart(3, '0')}`, persona_id: r.personaId, weight: r.weight, region: (p as any).regionName || p.regionCode, age_band: p.ageBand, gender: p.gender, education: p.education, settlement: p.settlement,
      anchor_pv2023: a.pv, anchor_lr7: a.lr7, anchor_econ4: a.econ4, anchor_polint4: a.polint4, label: 'ΣΥΝΘΕΤΙΚΟΣ ΕΡΩΤΩΜΕΝΟΣ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΟ ΠΡΟΣΩΠΟ' };
    qs.forEach((q) => { const ans = r.answers.find((x) => x.questionId === q.id); base[q.id] = ans && !ans.skipped && ans.value ? label(q, ans.value) : ans?.skipped ? (ans.basis === 'not_estimable' ? 'NA (μη εκτιμήσιμο)' : 'εκτός ροής') : 'NA'; });
    return base;
  });
  mkdirSync(path.join(DIR, 'run'), { recursive: true });
  const cols = Object.keys(rows[0]);
  writeFileSync(path.join(DIR, 'run', 'respondents_500.csv'), '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\n'));
  writeFileSync(path.join(DIR, 'run', 'viewscope_run.json'), JSON.stringify({ ...v, base: { id: v.base.id, engine: v.base.engine, populationId: v.base.populationId, warnings: v.base.warnings, cost: v.base.cost } }, null, 1));
  writeFileSync(path.join(DIR, 'run', 'run_meta.json'), JSON.stringify({ viewscopeVersion: v.version, platformCommit: 'd01b571', engine: v.base.engine.engineVersion, seed: SEED, n: v.respondents.length, seconds: +(ms / 1000).toFixed(2), apiCalls: v.apiCalls + v.base.cost.calls, reproducible: fp(v) === fp(v2), answersSha256: fp(v),
    flags: { publishedWaves: true, crosswalks: true, core: true, xtab: true, declared: false }, overrides: v.overrides, xtabReports: v.xtabReports, warnings: v.warnings, coverage: v.coverage }, null, 1));
  console.log(`n=${v.respondents.length} · ${(ms / 1000).toFixed(2)} δ · API ${v.apiCalls + v.base.cost.calls} · αναπαραγώγιμο ${fp(v) === fp(v2)} · κάλυψη v2 τεχν. ${v.coverage.v2.technical.n}/${v.coverage.v2.questions} E ${v.coverage.v2.empirical.E} T ${v.coverage.v2.empirical.T} S ${v.coverage.v2.scenarioS} αποχή ${v.coverage.v2.abstained}`);
  v.warnings.forEach((w) => console.log('  !', w.slice(0, 200)));
}
main().catch((e) => { console.error(e); process.exit(1); });
