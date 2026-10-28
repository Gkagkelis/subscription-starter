/*
 * Προκαταχωρισμένη αξιολόγηση πολιτικών προσομοιώσεων (docs/synthetic-lab/POLITICAL_PREREGISTRATION.md).
 *
 *   npx tsx scripts/synthetic-lab/political/eval_political.ts
 *
 * Είσοδοι (ιδιωτικά, εκτός repo): <dataRoot>/raw/political/tidy/{polls_toplines,election_results,party_map}.csv,
 * τα πολιτικά δεδομένα NORAYA και το ερευνητικό σύνολο cses-greece.
 * Έξοδος: <dataRoot>/benchmarks/political_eval.json + σύνοψη στην κονσόλα.
 *
 * Το S τρέχει τον πραγματικό engine (μηχανισμός «Τεκμηριωμένη πρόβλεψη»). Τα εθνικά επίπεδα και οι διαφορές
 * ομάδων γράφονται σε προσωρινό ερευνητικό σύνολο (research/zz-political-eval.json), που διαγράφεται στο τέλος.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { getMetric, norayaMembership } from '../../../lib/synthetic-lab/data/noraya';
import type { PriorMetric, PriorWave } from '../../../lib/synthetic-lab/data/noraya-build';
import { resetResearchCache } from '../../../lib/synthetic-lab/data/research';
import { planStudy } from '../../../lib/synthetic-lab/engine/planner';
import { runSurvey } from '../../../lib/synthetic-lab/engine/survey';
import { BASELINE_POPULATION_ID, DEFAULT_POPULATION_ID, loadPopulation } from '../../../lib/synthetic-lab/population/store';
import { dataRoot } from '../../../lib/synthetic-lab/storage/paths';
import type { Persona, Question } from '../../../lib/synthetic-lab/types';
import { collapse, DAY, ENGINE_KEY, inv, iso, loadPolls, logit, mean, normalize, pollAverage, profileSource, results, waveBefore, type Dist, type Poll, type ProfileChoice } from './polls_common';

const SEED = 20261028;
// Διερευνητικές παραλλαγές (ΜΗ προκαταχωρισμένες· γράφονται σε χωριστό αρχείο):
//   EVAL_N=<μέγεθος πάνελ>  EVAL_PROFILE=prereg (προεπιλογή, κύρια εκτέλεση)|auto|noraya|cses|undpolar|none
const EXPLORATORY = !!(process.env.EVAL_N || process.env.EVAL_PROFILE);
const N_PANEL = Number(process.env.EVAL_N || 2000);
const PROFILE = (process.env.EVAL_PROFILE || 'prereg') as ProfileChoice;
const EVAL_FILE = path.join(dataRoot(), 'research/zz-political-eval.json');

// ---------- βοηθητικά ----------
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mae(pred: Dist, truth: Dist): number {
  const keys = Object.keys(truth);
  return mean(keys.map((k) => Math.abs((pred[k] || 0) - truth[k])));
}

// ---------- δεδομένα ----------
// ---------- S: συνθετικό πάνελ ----------
const SCHEME_DIMS = { eurobarometer: ['gender', 'age_group', 'education_group'], dianeosis: ['age_gender', 'education_group'] } as const;

function evalMetrics(tag: string, level: Dist, T: number): { metrics: PriorMetric[]; source: string } {
  const src = profileSource(T, PROFILE);
  const y = new Date(T).getUTCFullYear();
  const metrics: PriorMetric[] = [];
  for (const [k, v] of Object.entries(level)) {
    const groups: PriorWave['groups'] = { all: { all: { value: v, n: N_PANEL, confidence: 'high', sources: 1, inconsistent: false } } };
    const ek = ENGINE_KEY[k];
    const sw = src && ek ? getMetric(`${src.prefix}${ek}`)?.waves.find((w) => w.key === src.waveKey) : undefined;
    const sall = sw?.groups.all?.all;
    if (sw && sall && sall.value > 0) {
      for (const dim of SCHEME_DIMS[src!.scheme]) {
        for (const [g, c] of Object.entries(sw.groups[dim] || {})) {
          groups[dim] = groups[dim] || {};
          groups[dim][g] = { ...c, value: 100 * inv(logit(c.value / 100) - logit(sall.value / 100) + logit(v / 100)) };
        }
      }
    }
    metrics.push({
      metric: `peval:${tag}:${k}`,
      family: 'political_eval',
      label: k,
      semanticsNote: 'προσωρινό (αξιολόγηση)',
      scheme: src?.scheme || 'eurobarometer',
      datasetId: 'political-eval',
      waves: [{ key: `${y}-Q1`, year: y, quarter: '', groups }]
    });
  }
  return { metrics, source: src ? `${src.prefix}${src.waveKey}` : 'καμία (μόνο εθνικό επίπεδο)' };
}

let personas: Map<string, Persona> | null = null;
function personaById(id: string): Persona | undefined {
  if (!personas) {
    personas = new Map();
    for (const pid of [DEFAULT_POPULATION_ID, BASELINE_POPULATION_ID]) loadPopulation(pid)?.personas.forEach((p) => personas!.set(p.id, p));
  }
  return personas.get(id);
}

async function runPanel(tag: string, level: Dist, year: number): Promise<{ national: Dist; respondents: { persona: Persona; weight: number; choice: string }[] }> {
  const keys = Object.keys(level);
  const q: Question = {
    id: 'v',
    type: 'single_choice',
    text: 'Ψήφος',
    options: keys,
    evidenceLink: { datasetId: 'political-eval', metric: `peval:${tag}:${keys[0]}`, positiveOption: keys[0], optionMetrics: Object.fromEntries(keys.map((k) => [k, `peval:${tag}:${k}`])) }
  };
  const base = planStudy({ text: 'Πρόθεση ψήφου', domain: 'political', sampleSize: N_PANEL }).plan!;
  const plan = { ...base, questions: [q], referenceYear: year, sampleSize: N_PANEL, engine: 'evidence' as const };
  const run = await runSurvey({ plan, populationId: DEFAULT_POPULATION_ID, seed: SEED, save: false, stabilityRuns: 0 });
  const agg = run.aggregates.find((a) => a.questionId === 'v')!;
  const national = normalize(Object.fromEntries((agg.shares || []).map((s) => [s.option, s.share])));
  const respondents = run.respondents
    .map((r) => ({ persona: personaById(r.personaId)!, weight: r.weight, choice: r.answers.find((a) => a.questionId === 'v')?.value?.choice || '' }))
    .filter((r) => r.persona && r.choice);
  return { national, respondents };
}

function bootstrapMean(diffs: number[], reps = 2000): [number, number] {
  const rnd = mulberry32(SEED);
  const ms: number[] = [];
  for (let b = 0; b < reps; b++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)];
    ms.push(s / diffs.length);
  }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(0.025 * reps)], ms[Math.floor(0.975 * reps)]];
}

// ---------- P1 ----------
async function p1(polls: Poll[], res: ReturnType<typeof results>) {
  const ELECTIONS = ['GR_parl_2012-06-17', 'GR_parl_2015-01-25', 'GR_parl_2015-09-20', 'GR_parl_2019-07-07', 'GR_parl_2023-05-21', 'GR_parl_2023-06-25'];
  const parl = Array.from(res.entries()).filter(([, e]) => e.type === 'parliament').sort((a, b) => a[1].date - b[1].date);
  const rows: any[] = [];
  const evalMs: PriorMetric[] = [];
  const prepared: any[] = [];
  for (const eid of ELECTIONS) {
    const e = res.get(eid);
    if (!e) {
      rows.push({ election: eid, excluded: 'χωρίς αποτέλεσμα' });
      continue;
    }
    const T = e.date - 14 * DAY;
    const in30 = polls.filter((p) => p.end <= T && p.end > T - 30 * DAY);
    if (in30.length < 3) {
      rows.push({ election: eid, excluded: `μόνο ${in30.length} δημοσκοπήσεις στις 30 ημέρες πριν από το T` });
      continue;
    }
    const keep = new Set(Object.entries(e.dist).filter(([k, v]) => v >= 1 && k !== 'OTHER').map(([k]) => k));
    const truth = collapse(e.dist, keep);
    const prev = parl.filter(([, x]) => x.date < e.date).pop();
    const B0 = collapse(prev ? prev[1].dist : {}, keep);
    const last = polls.filter((p) => p.end <= T).pop()!;
    const B1 = collapse(last.dist, keep);
    const avg = pollAverage(polls, T)!;
    const B2 = collapse(avg.dist, keep);
    const tag = eid.replace(/[^0-9a-z]/gi, '');
    const { metrics, source } = evalMetrics(tag, B2, T);
    evalMs.push(...metrics);
    prepared.push({ eid, e, T, keep, truth, B0, B1, B2, tag, source, avg, last, prev: prev?.[0] });
  }
  return { rows, evalMs, prepared };
}

// ---------- P2 ----------
function p2Prepare(polls: Poll[]) {
  const T = Date.parse('2022-09-30');
  const hiddenKey = '2022-Q4';
  const parties = Object.values(ENGINE_KEY).filter((k, i, a) => a.indexOf(k) === i);
  const hidden: Record<string, Dist> = {}; // "dim|group" -> party -> %
  const totals: Dist = {};
  for (const k of parties) {
    const w = getMetric(`pol:vote:${k}`)?.waves.find((x) => x.key === hiddenKey);
    if (!w) continue;
    totals[k] = w.groups.all.all.value;
    for (const dim of ['gender', 'age_group', 'education_group']) {
      for (const [g, c] of Object.entries(w.groups[dim] || {})) {
        if (c.n < 100) continue;
        (hidden[`${dim}|${g}`] = hidden[`${dim}|${g}`] || {})[k] = c.value;
      }
    }
  }
  const cats = new Set(Object.entries(totals).filter(([k, v]) => v >= 3 && k !== 'other').map(([k]) => k));
  const toEngine = (d: Dist): Dist => {
    const o: Dist = {};
    for (const [k, v] of Object.entries(d)) {
      const ek = ENGINE_KEY[k] || 'other';
      o[ek] = (o[ek] || 0) + v;
    }
    return o;
  };
  const truth: Record<string, Dist> = Object.fromEntries(Object.entries(hidden).map(([cell, d]) => [cell, collapse(d, cats, 'other')]));
  const avg = pollAverage(polls, T)!;
  const B2 = collapse(toEngine(avg.dist), cats, 'other');
  // G1: τελευταίο κύμα NORAYA πριν από το T, χωρίς προσαρμογή
  const g1Key = (getMetric('pol:vote:nd')?.waves || []).filter((w) => waveBefore(w, T)).pop()!.key;
  const G1: Record<string, Dist> = {};
  for (const cell of Object.keys(truth)) {
    const [dim, g] = cell.split('|');
    const d: Dist = {};
    for (const k of parties) {
      const c = getMetric(`pol:vote:${k}`)?.waves.find((x) => x.key === g1Key)?.groups[dim]?.[g];
      if (c) d[k] = c.value;
    }
    G1[cell] = collapse(d, cats, 'other');
  }
  // S: επίπεδο B2 στο T + διαφορές ομάδων από την πιο πρόσφατη μέτρηση πριν από το T
  const levelForEngine: Dist = {};
  for (const [k, v] of Object.entries(avg.dist)) {
    const L = ENGINE_KEY[k] ? k : 'OTHER';
    levelForEngine[L] = (levelForEngine[L] || 0) + v;
  }
  const { metrics, source } = evalMetrics('p2', normalize(levelForEngine), T);
  return { T, hiddenKey, cats, truth, B2, G1, g1Key, metrics, source, avg };
}

function cellsFromPanel(resp: { persona: Persona; weight: number; choice: string }[], cats: Set<string>): Record<string, Dist> {
  const acc: Record<string, Dist> = {};
  for (const r of resp) {
    const mem = norayaMembership(r.persona, 'eurobarometer');
    if (!mem) continue;
    const ek = ENGINE_KEY[r.choice] || 'other';
    for (const dim of ['gender', 'age_group', 'education_group']) {
      for (const [g, share] of Object.entries(mem[dim] || {})) {
        const d = (acc[`${dim}|${g}`] = acc[`${dim}|${g}`] || {});
        d[ek] = (d[ek] || 0) + r.weight * share;
      }
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([c, d]) => [c, collapse(d, cats, 'other')]));
}

async function main() {
  const polls = loadPolls();
  const res = results();
  console.log(`Δημοσκοπήσεις: ${polls.length} (${iso(polls[0].end)}…${iso(polls[polls.length - 1].end)}), εκλογές: ${res.size}`);
  const P1 = await p1(polls, res);
  const P2 = p2Prepare(polls);
  mkdirSync(path.dirname(EVAL_FILE), { recursive: true });
  writeFileSync(
    EVAL_FILE,
    JSON.stringify({ datasetId: 'political-eval', tier: 'research_only', source: 'προσωρινό', license: '—', importedAt: new Date().toISOString(), questions: [], metrics: [...P1.evalMs, ...P2.metrics] })
  );
  resetResearchCache();
  try {
    // ----- P1 -----
    const p1rows = [...P1.rows];
    const perElection: { B0: number; B1: number; B2: number; S: number }[] = [];
    for (const x of P1.prepared) {
      const panel = await runPanel(x.tag, x.B2, new Date(x.T).getUTCFullYear());
      const S = collapse(panel.national, x.keep);
      const m = { B0: mae(x.B0, x.truth), B1: mae(x.B1, x.truth), B2: mae(x.B2, x.truth), S: mae(S, x.truth) };
      const top2 = (Object.entries(x.truth as Dist) as [string, number][]).filter(([k]) => k !== 'OTHER').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
      const lead = (d: Dist) => (d[top2[0]] || 0) - (d[top2[1]] || 0);
      perElection.push(m);
      p1rows.push({
        election: x.eid,
        T: iso(x.T),
        polls: x.avg.n,
        pollsters: x.avg.pollsters,
        lastPoll: `${x.last.pollster} ${iso(x.last.end)}`,
        previous: x.prev,
        groupSource: x.source,
        mae: m,
        leadError: { B0: lead(x.B0) - lead(x.truth), B1: lead(x.B1) - lead(x.truth), B2: lead(x.B2) - lead(x.truth), S: lead(S) - lead(x.truth) },
        truth: x.truth,
        pred: { B0: x.B0, B1: x.B1, B2: x.B2, S }
      });
    }
    const avgM = (k: 'B0' | 'B1' | 'B2' | 'S') => mean(perElection.map((m) => m[k]));
    const p1Summary = {
      elections: perElection.length,
      mae: { B0: avgM('B0'), B1: avgM('B1'), B2: avgM('B2'), S: avgM('S') },
      'S-B0': { diff: avgM('S') - avgM('B0'), ci95: bootstrapMean(perElection.map((m) => m.S - m.B0)) },
      'S-B2': { diff: avgM('S') - avgM('B2'), ci95: bootstrapMean(perElection.map((m) => m.S - m.B2)) },
      rules: { 'P1-a': avgM('S') < avgM('B0'), 'P1-b': avgM('S') - avgM('B2') <= 0.5 }
    };
    // ----- P2 -----
    const panel2 = await runPanel('p2', Object.fromEntries(P2.metrics.map((m) => [m.label, m.waves[0].groups.all.all.value])), 2022);
    const S2 = cellsFromPanel(panel2.respondents, P2.cats);
    const cellErr = (pred: (cell: string) => Dist) =>
      Object.entries(P2.truth).flatMap(([cell, t]) => Object.keys(t).map((k) => Math.abs((pred(cell)[k] || 0) - t[k])));
    const eG0 = cellErr(() => P2.B2);
    const eG1 = cellErr((c) => P2.G1[c]);
    const eS = cellErr((c) => S2[c] || {});
    const p2Summary = {
      hidden: `NORAYA ${P2.hiddenKey}`,
      T: iso(P2.T),
      cells: eS.length,
      categories: Array.from(P2.cats).concat('other'),
      groupSourceS: P2.source,
      g1Wave: P2.g1Key,
      pollsAtT: P2.avg.n,
      mae: { G0: mean(eG0), G1: mean(eG1), S: mean(eS) },
      'S-G0': { diff: mean(eS) - mean(eG0), ci95: bootstrapMean(eS.map((x, i) => x - eG0[i])) },
      'S-G1': { diff: mean(eS) - mean(eG1), ci95: bootstrapMean(eS.map((x, i) => x - eG1[i])) },
      cellsDetail: Object.fromEntries(Object.keys(P2.truth).map((c) => [c, { truth: P2.truth[c], G0: P2.B2, G1: P2.G1[c], S: S2[c] }]))
    };
    const p2Accepted = p2Summary['S-G0'].ci95[1] < 0 && p2Summary['S-G1'].ci95[1] < 0;
    const out = {
      preregistration: 'docs/synthetic-lab/POLITICAL_PREREGISTRATION.md',
      runAt: new Date().toISOString(),
      seed: SEED,
      P1: { summary: p1Summary, elections: p1rows },
      P2: { summary: p2Summary, accepted: p2Accepted },
      P3: { status: 'NOT_ESTIMABLE', reason: 'Δεν υπάρχουν εθνικές μετρήσεις αρχηγών (καταλληλότερος/έγκριση) πριν από το T στα ανοιχτά δεδομένα δημοσκοπήσεων.' }
    };
    const outPath = path.join(dataRoot(), EXPLORATORY ? `benchmarks/political_eval_explore_n${N_PANEL}_${PROFILE}.json` : 'benchmarks/political_eval.json');
    if (EXPLORATORY) (out as any).exploratory = { n: N_PANEL, profile: PROFILE, note: 'Διερευνητική παραλλαγή — δεν αλλάζει την προκαταχωρισμένη απόφαση.' };
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(out, null, 1));
    const f = (x: number) => x.toFixed(2);
    console.log('\nP1 — εθνικά ποσοστά (MAE, π.μ.)');
    for (const r of p1rows) console.log(r.excluded ? `  ${r.election}: εκτός (${r.excluded})` : `  ${r.election} T=${r.T} δημ.=${r.polls}: B0 ${f(r.mae.B0)} · B1 ${f(r.mae.B1)} · B2 ${f(r.mae.B2)} · S ${f(r.mae.S)} (ομάδες: ${r.groupSource})`);
    console.log(`  Μέσος: B0 ${f(p1Summary.mae.B0)} · B1 ${f(p1Summary.mae.B1)} · B2 ${f(p1Summary.mae.B2)} · S ${f(p1Summary.mae.S)}`);
    console.log(`  S−B0 ${f(p1Summary['S-B0'].diff)} [${p1Summary['S-B0'].ci95.map(f).join(', ')}] · S−B2 ${f(p1Summary['S-B2'].diff)} [${p1Summary['S-B2'].ci95.map(f).join(', ')}] · κανόνες ${JSON.stringify(p1Summary.rules)}`);
    console.log(`\nP2 — διαφορές ομάδων, κρυφό ${p2Summary.hidden}, ${p2Summary.cells} κελιά, ομάδες S από ${p2Summary.groupSourceS}`);
    console.log(`  MAE: G0 ${f(p2Summary.mae.G0)} · G1 ${f(p2Summary.mae.G1)} · S ${f(p2Summary.mae.S)}`);
    console.log(`  S−G0 ${f(p2Summary['S-G0'].diff)} [${p2Summary['S-G0'].ci95.map(f).join(', ')}] · S−G1 ${f(p2Summary['S-G1'].diff)} [${p2Summary['S-G1'].ci95.map(f).join(', ')}] → ${p2Accepted ? 'ΔΕΚΤΗ' : 'ΑΠΟΡΡΙΠΤΕΑ'}`);
    console.log(`\nP3: ${out.P3.status}\n→ ${outPath}`);
  } finally {
    if (existsSync(EVAL_FILE)) rmSync(EVAL_FILE);
    resetResearchCache();
  }
}

main().catch((e) => {
  if (existsSync(EVAL_FILE)) rmSync(EVAL_FILE);
  console.error(e);
  process.exit(1);
});
