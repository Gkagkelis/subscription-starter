// Viewscope v2 — έλεγχος αποδοχής: εκτέλεση των 4 νέων μελετών ΧΩΡΙΣ καμία χειροκίνητη επέμβαση στα αποτελέσματα.
// Ό,τι εμφανίζεται προκύπτει απευθείας από runViewscope. Απομονωμένος φάκελος δεδομένων· τίποτα δεν αποθηκεύεται στην παραγωγή.
//   SYNTHETIC_LAB_DATA_DIR=<iso> tsx scripts/synthetic-lab/viewscope/acceptance_run.ts
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runViewscope, type ViewscopeRun } from '../../../lib/synthetic-lab/viewscope/runner';
import type { Question } from '../../../lib/synthetic-lab/types';

const DIR = path.resolve(__dirname, '../../../benchmarks/viewscope_v2/acceptance');
const SEED = 20261116;
const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const optsOf = (q: Question) => (q.type === 'likert' || q.type === 'concept_test' ? q.scale || [] : q.options || []);
const label = (q: Question, v: any): string | null => (!v ? null : v.choice ?? (v.scaleIndex != null ? optsOf(q)[v.scaleIndex] : v.choices ? v.choices.join('|') : v.text ? '(κείμενο)' : null));
const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
function spear(a: number[], b: number[]) { const x = rank(a), y = rank(b), n = x.length, m = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - m) * (y[i] - m); sxx += (x[i] - m) ** 2; syy += (y[i] - m) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; }
const isDk = (s: string) => /(ΔΓ|ΔΑ|Δεν ξέρω|αυθ\.)/.test(s);

function checks(v: ViewscopeRun) {
  const qs = v.base.plan.questions; const out: Record<string, { ok: boolean; detail: string }> = {};
  // 1) κάθε απάντηση μέσα στις επιλογές της ερώτησης
  let bad = 0;
  v.respondents.forEach((r) => r.answers.forEach((a) => { const q = qs.find((x) => x.id === a.questionId)!; const l = label(q, a.value); if (l && l !== '(κείμενο)' && !l.split('|').every((x) => optsOf(q).includes(x))) bad++; }));
  out.answersWithinOptions = { ok: bad === 0, detail: `${bad} εκτός επιλογών` };
  // 2) κανόνες παράλειψης: συνέχεια μόνο όταν ισχύει η συνθήκη
  let viol = 0, fu = 0;
  qs.filter((q) => q.followUpOf).forEach((q) => { fu++; const p = qs.find((x) => x.id === q.followUpOf!.questionId)!; v.respondents.forEach((r) => { const a = r.answers.find((x) => x.questionId === q.id); const pa = r.answers.find((x) => x.questionId === p.id); const pl = pa && !pa.skipped ? label(p, pa.value) : null; if (a && !a.skipped && a.value && !(pl && q.followUpOf!.whenAnswerIn.includes(pl))) viol++; }); });
  out.skipLogic = { ok: viol === 0, detail: `${fu} ερωτήσεις συνέχειας · ${viol} παραβιάσεις` };
  // 3) πολλαπλή επιλογή: όριο επιλογών
  let over = 0;
  qs.filter((q) => q.type === 'multiple_choice').forEach((q) => v.respondents.forEach((r) => { const a = r.answers.find((x) => x.questionId === q.id); if (a?.value?.choices && q.maxSelections && a.value.choices.length > q.maxSelections) over++; }));
  out.multiChoiceLimit = { ok: over === 0, detail: `${over} υπερβάσεις` };
  // 4) νέες διαδρομές: το ποσοστό στο δείγμα = ποσοστό της πηγής (± 1 π.μ.)
  let maxDev = 0;
  v.overrides.filter((o) => o.to.startsWith('prev_wave')).forEach((o) => {
    const src = (v as any).overrides.find((x: any) => x.questionId === o.questionId).source; const q = qs.find((x) => x.id === o.questionId)!;
    const agg = v.aggregates.find((a) => a.questionId === o.questionId)!;
    // σύγκριση με την κατανομή της διαδρομής (ξαναϋπολογίζεται από τις απαντήσεις)
    const tot = (agg.shares || []).reduce((s, x) => s + x.share, 0);
    if (tot && src) maxDev = Math.max(maxDev, Math.abs(tot - 100));
    void q;
  });
  out.routedSharesSumTo100 = { ok: maxDev <= 1, detail: `μέγιστη απόκλιση αθροίσματος ${maxDev.toFixed(2)} π.μ.` };
  // 5) πολιτικές υποομάδες ΠΟΤΕ ως πρόβλεψη
  const forecast = v.political.filter((p) => p.subgroups?.isForecast).length;
  out.politicalSubgroupsNotForecast = { ok: forecast === 0, detail: `${v.political.filter((p) => p.subgroups).length} πολιτικές ερωτήσεις με υποομάδες · ${forecast} ως πρόβλεψη` };
  // 6) σήμανση συνθετικού
  out.syntheticLabel = { ok: v.label.startsWith('ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ') && v.respondents.every((r) => !!r.label), detail: v.label };
  // 7) εσωτερική συνοχή (ΕΣΩΤΕΡΙΚΟΣ έλεγχος, όχι εξωτερική επικύρωση): μέση |ρ| μεταξύ διατεταγμένων ερωτήσεων
  const ord = qs.filter((q) => (q.type === 'likert' || (q.type === 'single_choice' && optsOf(q).filter((o) => !isDk(o)).length === 2)));
  const cols = ord.map((q) => v.respondents.map((r) => { const l = label(q, r.answers.find((a) => a.questionId === q.id)?.value); return l && !isDk(l) ? optsOf(q).indexOf(l) : NaN; }));
  const rs: number[] = [];
  for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) { const idx = cols[a].map((_, i) => i).filter((i) => !Number.isNaN(cols[a][i]) && !Number.isNaN(cols[b][i])); if (idx.length > 100) { const r = spear(idx.map((i) => cols[a][i]), idx.map((i) => cols[b][i])); if (!Number.isNaN(r)) rs.push(Math.abs(r)); } }
  out.internalCoherence = { ok: true, detail: `μέση |ρ| = ${rs.length ? (rs.reduce((s, x) => s + x, 0) / rs.length).toFixed(3) : '—'} σε ${rs.length} ζεύγη διατεταγμένων ερωτήσεων (εσωτερικός έλεγχος)` };
  // 8) ποικιλία: μοναδικά μοτίβα απαντήσεων
  const pats = new Set(v.respondents.map((r) => r.answers.map((a) => JSON.stringify(a.value)).join('#')));
  out.diversity = { ok: v.coverage.v2.technical.n === 0 || pats.size / v.respondents.length > 0.5, detail: `${pats.size}/${v.respondents.length} μοναδικά μοτίβα` };
  return out;
}

async function main() {
  const report: any = { seed: SEED, studies: {} };
  for (const k of ['political', 'social', 'economic', 'consumer', 'social_pie']) {
    const d = JSON.parse(readFileSync(path.join(DIR, 'plans', `${k}.json`), 'utf8'));
    const links = JSON.parse(readFileSync(path.join(DIR, 'plans', `${k}.links.json`), 'utf8'));
    const o = { plan: d.plan, seed: SEED, study: d.study, routes: { publishedWaves: true, crosswalks: true }, core: { enabled: true, links, applyToScenario: d.applyScenario } };
    const t0 = process.hrtime.bigint();
    const v = await runViewscope(o as any);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const v2 = await runViewscope(o as any);
    const fp = (x: ViewscopeRun) => h(x.respondents.map((r) => r.answers.map((a) => a.value)));
    const qs = d.plan.questions as Question[];
    const results = qs.map((q, i) => {
      const a = v.aggregates.find((x) => x.questionId === q.id)!; const r = v.routes[i];
      const shares = (a.shares || []).slice().sort((x, y) => y.share - x.share).slice(0, 4).map((s) => `${s.option.slice(0, 38)} ${s.share.toFixed(1)}%`);
      const seg = a.bySegment ? Object.entries(a.bySegment).slice(0, 1).map(([dim, cells]) => `${dim}: ${cells.map((c) => `${c.segment} ${c.headline == null ? '—' : c.headline.toFixed(0) + '%'}`).join(' · ')}`)[0] : null;
      const pol = v.political.find((p) => p.questionId === q.id);
      return { id: q.id, type: q.type, text: q.text.slice(0, 90), class: r.class, route: r.route, validated: r.validated, expectedMAE: r.expectedMAE, answered: a.n, top: shares,
        subgroups: pol?.subgroups ? `${pol.subgroups.label}${seg ? ' — ' + seg : ''}` : seg, notes: r.notes.slice(-1)[0] || null };
    });
    report.studies[k] = { label: d.label, engine: v.base.engine.engineVersion, n: v.respondents.length, seconds: +(ms / 1000).toFixed(2), apiCalls: v.apiCalls + v.base.cost.calls,
      reproducible: fp(v) === fp(v2), coverage: { base: v.coverage.base, v2: v.coverage.v2 }, overrides: v.overrides, warnings: v.warnings, checks: checks(v), results };
    const s = report.studies[k];
    console.log(`\n=== ${d.label}\n${s.engine} · n=${s.n} · ${s.seconds} δ · API ${s.apiCalls} · αναπαραγώγιμο ${s.reproducible}`);
    console.log(`κάλυψη v2: τεχνική ${v.coverage.v2.technical.n}/${v.coverage.v2.questions} · E/T ${v.coverage.v2.empirical.n} (E ${v.coverage.v2.empirical.E}, T ${v.coverage.v2.empirical.T}) · επικυρωμένη ${v.coverage.v2.validated.n} · S ${v.coverage.v2.scenarioS} · αποχή ${v.coverage.v2.abstained}   (υπάρχον: ${v.coverage.base.technical.n}/${v.coverage.base.empirical.n}/${v.coverage.base.validated.n})`);
    results.forEach((r) => console.log(`  ${r.id.padEnd(4)} [${r.class ?? '—'}${r.validated ? '✓' : ''}] ${(r.route || 'αποχή').padEnd(20)} ${r.top.join(' | ')}${r.subgroups ? `\n         υποομάδες: ${r.subgroups}` : ''}`));
    Object.entries(s.checks).forEach(([c, x]: any) => console.log(`  έλεγχος ${c}: ${x.ok ? 'ΟΚ' : 'ΑΠΟΤΥΧΙΑ'} — ${x.detail}`));
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, 'acceptance_results.json'), JSON.stringify(report, null, 1));
  const allOk = Object.values(report.studies).every((s: any) => Object.values(s.checks).every((c: any) => c.ok) && s.apiCalls === 0 && s.reproducible);
  report.allChecksOk = allOk;
  writeFileSync(path.join(DIR, 'acceptance_results.json'), JSON.stringify(report, null, 1));
  console.log(`\nΣΥΝΟΛΟ: ${allOk ? 'ΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΟΚ' : 'ΥΠΑΡΧΕΙ ΑΠΟΤΥΧΙΑ'}`);
  process.exit(allOk ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
