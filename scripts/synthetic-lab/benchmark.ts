/*
 * Benchmark → Διάγνωση → Βελτίωση του Synthetic Research Lab απέναντι σε πραγματικές ελληνικές έρευνες.
 *
 *   npx tsx scripts/synthetic-lab/benchmark.ts suite
 *   npx tsx scripts/synthetic-lab/benchmark.ts run --model prod-1 --mode blind --splits calibration [--families eb_trend] [--seeds 1,2] [--n 2000] [--max-groups 20] [--tag x]
 *   npx tsx scripts/synthetic-lab/benchmark.ts experiment E1-structure|all [--max-groups 25]
 *   npx tsx scripts/synthetic-lab/benchmark.ts tune     (calibration: πλέγμα υποψήφιων εκδόσεων)
 *   npx tsx scripts/synthetic-lab/benchmark.ts select   (validation: σύγκριση παραγωγής vs υποψηφίων, κανόνες αποδοχής)
 *   npx tsx scripts/synthetic-lab/benchmark.ts holdout --model <version>   (ΜΙΑ φορά, μετά την οριστικοποίηση)
 *   npx tsx scripts/synthetic-lab/benchmark.ts history
 *   npx tsx scripts/synthetic-lab/benchmark.ts analyze <run.json|experiment.json> [--variant 0]   (σφάλμα ανά χρονικό κενό/τύπο έρευνας/θέμα/έτος)
 *
 * Τα αποτελέσματα αποθηκεύονται στο <dataRoot>/benchmarks (ιδιωτικά). Η παραγωγική έκδοση δεν αλλάζει από εδώ.
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildSuite, type Family, type Split } from '../../lib/synthetic-lab/benchmark/suite';
import { runBenchmark } from '../../lib/synthetic-lab/benchmark/runner';
import { gapStats, summarize, summarizeBy } from '../../lib/synthetic-lab/benchmark/score';
import { EXPERIMENTS, breakdownAnalysis, runExperiment } from '../../lib/synthetic-lab/benchmark/experiments';
import { benchDir, loadModel, loadSuite, readHistory, saveRun, saveSuite } from '../../lib/synthetic-lab/benchmark/registry';
import { holdoutEvaluate, selectOnValidation, tuneOnCalibration } from '../../lib/synthetic-lab/benchmark/improve';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const list = (k: string, d: string) => (opt(k, d) as string).split(',').filter(Boolean);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

function suiteOrBuild() {
  let s = loadSuite();
  if (!s) {
    s = buildSuite();
    saveSuite(s);
  }
  return s;
}

async function main() {
  if (cmd === 'analyze') {
    const data = JSON.parse(readFileSync(args[1], 'utf8'));
    const items = data.variants ? data.variants[Number(opt('variant', '0'))].items : data.items;
    const b = breakdownAnalysis(items);
    for (const [dim, groups] of Object.entries(b)) {
      console.log(`— ${dim}`);
      for (const [k, s] of Object.entries(groups)) console.log(`   ${k.padEnd(44)} items ${s.okItems} δείγματα ${s.samples} | σύνολο ${s.overallMae} (επιμονή ${s.persistOverallMae}) | ομάδες ${s.groupMae}`);
    }
    return;
  }
  if (cmd === 'suite') {
    const s = buildSuite();
    saveSuite(s);
    const c: Record<string, number> = {};
    s.items.forEach((i) => (c[`${i.family}/${i.split}`] = (c[`${i.family}/${i.split}`] || 0) + 1));
    log(`σουίτα ${s.hash}: ${s.items.length} items, ${new Set(s.items.map((i) => i.sampleKey)).size} ανεξάρτητα δείγματα`);
    console.log(c, s.excluded);
    return;
  }
  const suite = suiteOrBuild();
  if (cmd === 'run') {
    const model = loadModel(opt('model', 'prod-1')!);
    if (!model) throw new Error('Άγνωστη έκδοση μοντέλου');
    const splits = list('splits', 'calibration') as Split[];
    if (splits.includes('holdout')) throw new Error('Το final holdout αξιολογείται μόνο με την εντολή «holdout».');
    if (splits.includes('holdout2' as Split)) throw new Error('Το holdout2 αξιολογείται μόνο με την εντολή «final2» (μία φορά).');
    const cfg = {
      model,
      mode: (opt('mode', 'blind') as 'blind' | 'oracle'),
      splits,
      families: opt('families') ? (list('families', '') as Family[]) : undefined,
      seeds: list('seeds', '1,2').map(Number),
      n: Number(opt('n', '2000')),
      maxGroups: opt('max-groups') ? Number(opt('max-groups')) : undefined,
      onProgress: (d: number, t: number) => d % 10 === 0 && log(`${d}/${t} δείγματα`)
    };
    const r = await runBenchmark(suite, cfg);
    const { onProgress: _p, ...stored } = cfg;
    const run = saveRun({
      id: `${opt('tag', 'run')}-${stamp()}`, createdAt: new Date().toISOString(), tag: opt('tag', 'run')!, suiteVersion: suite.version, suiteHash: suite.hash,
      model, config: stored, durationMs: r.durationMs, summary: summarize(r.items), bySplit: summarizeBy(r.items, (x) => x.split),
      byFamily: summarizeBy(r.items, (x) => x.family), gaps: gapStats(r.items), items: r.items
    });
    log(`αποθηκεύτηκε ${run.id}`);
    console.log(JSON.stringify({ summary: run.summary, byFamily: run.byFamily, gaps: run.gaps }, null, 1));
    return;
  }
  if (cmd === 'experiment') {
    const which = args[1] || 'all';
    const wanted = which.split(',');
    const defs = which === 'all' ? EXPERIMENTS : EXPERIMENTS.filter((e) => wanted.includes(e.id));
    for (const def of defs) {
      const res = await runExperiment(suite, def, {
        maxGroups: opt('max-groups') ? Number(opt('max-groups')) : undefined,
        seeds: opt('seeds') ? list('seeds', '').map(Number) : undefined,
        onProgress: log
      });
      const file = benchDir('experiments', `${def.id}-${stamp()}.json`);
      writeFileSync(file, JSON.stringify(res));
      log(`${def.id} → ${file}`);
      for (const v of res.variants) {
        const s = v.summary;
        console.log(
          `  ${v.label.padEnd(44)} items ${s.okItems}/${s.items} δείγματα ${s.samples} | σύνολο ${s.overallMae} (επιμονή ${s.persistOverallMae}, θόρυβος ${s.noiseFloor}) | ομάδες ${s.groupMae} (επιμονή ${s.persistGroupMae}) | ανά δείγμα ${s.sampleMeanMae}`
        );
        console.log(`      επιδράσεις: ${v.gaps.map((g) => `${g.factor} κλίση ${g.slope} (πραγμ. ${g.meanAbsRealGap} / προσ. ${g.meanAbsSimGap})`).join(' · ')}`);
      }
      for (const p of res.paired) console.log(`  Δ[${p.label}] σύνολο ${p.meanDeltaOverall} ομάδες ${p.meanDeltaGroup} βελτίωση ${p.improvedShare}% CI95 ${JSON.stringify(p.ci95)}`);
    }
    return;
  }
  if (cmd === 'tune') {
    const rho = opt('battery-rho') ? Number(opt('battery-rho')) : undefined;
    return void (await tuneOnCalibration(suite, {
      maxGroups: opt('max-groups') ? Number(opt('max-groups')) : undefined,
      log,
      extra: rho ? { batteryRho: rho } : undefined,
      extraNote: rho ? `batteryRho=${rho}: επιλέχθηκε στις συσχετίσεις calibration (μικροδεδομένα 2017–2020), ανεξάρτητα από τα ποσοστά.` : undefined
    }));
  }
  if (cmd === 'assoc') {
    const { associationBenchmark } = await import('../../lib/synthetic-lab/benchmark/assoc');
    const { PRODUCTION_MODEL } = await import('../../lib/synthetic-lab/engine/model-config');
    const rows = [];
    for (const rho of list('rhos', '0,0.1,0.2,0.3,0.45').map(Number)) {
      const r = await associationBenchmark({ model: { ...PRODUCTION_MODEL, version: `rho-${rho}`, batteryRho: rho }, splits: ['calibration'] });
      rows.push({ rho, ...r.bySplit.calibration });
      log(`ρ=${rho}: ${JSON.stringify(r.bySplit.calibration)}`);
    }
    const best = [...rows].sort((a: any, b: any) => (a.withinMae ?? 9) - (b.withinMae ?? 9))[0];
    writeFileSync(benchDir('assoc_results.json'), JSON.stringify({ at: new Date().toISOString(), split: 'calibration', rows, chosenRho: best.rho }, null, 1));
    log(`επιλογή στο calibration: ρ=${best.rho}`);
    return;
  }
  if (cmd === 'temporal' || cmd === 'temporal-tune') {
    const { runTemporal } = await import('../../lib/synthetic-lab/benchmark/temporal');
    const { familyBalanced, pairedCompareStrat } = await import('../../lib/synthetic-lab/benchmark/score');
    const splits = list('splits', cmd === 'temporal-tune' ? 'calibration' : 'validation') as Split[];
    if (splits.includes('holdout2' as Split) && !args.includes('--i-understand-this-is-final')) throw new Error('Το holdout2 αξιολογείται μόνο στο τέλος (--i-understand-this-is-final).');
    const families = opt('families') ? list('families', '') : undefined;
    type V = { label: string; cfg: import('../../lib/synthetic-lab/engine/forecast').ForecastConfig };
    const baselines: V[] = [
      { label: 'επιμονή (LOCF)', cfg: { params: { method: 'locf' } } },
      { label: 'ιστορικός μέσος', cfg: { params: { method: 'mean' } } },
      { label: 'γραμμική τάση', cfg: { params: { method: 'linear' } } }
    ];
    const { reliableView } = await import('../../lib/synthetic-lab/benchmark/suite');
    const show = (label: string, items0: any[], ref0: any[]) => {
      const items = reliableView(items0, suite);
      const ref = reliableView(ref0, suite);
      const s = summarize(items);
      const p = pairedCompareStrat(ref, items);
      console.log(`  ${label.padEnd(58)} ανά συστάδα ${s.sampleMeanMae} · οικογ. ${familyBalanced(items)} · σύνολο ${s.overallMae} · ομάδες ${s.groupMae} | Δ vs LOCF ${p.meanDelta} CI ${JSON.stringify(p.ci95)} (${p.clusters} συστάδες)`);
      return s;
    };
    const suiteT = { ...suite, items: suite.items };
    if (cmd === 'temporal-tune') {
      // πλέγμα ανά οικογένεια στο calibration (προκαθορισμένο)· επιλογή με την κύρια μετρική
      const grid: V[] = [];
      for (const q of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3])
        for (const qSlope of [0, 0.0005, 0.002])
          for (const phi of qSlope ? [0.6, 0.9] : [1])
            for (const noiseUnknownN of [0.0003, 0.001, 0.003, 0.01]) grid.push({ label: `kalman q=${q} qs=${qSlope} φ=${phi} ε=${noiseUnknownN}`, cfg: { params: { method: 'kalman', q, qSlope, phi, noiseUnknownN } } });
      for (const slopeShrink of [0.25, 0.5, 0.75, 1]) for (const phi of [0.5, 0.8, 1]) grid.push({ label: `damped κ=${slopeShrink} φ=${phi}`, cfg: { params: { method: 'damped', slopeShrink, phi } } });
      const fams = families || Array.from(new Set(suite.items.filter((i) => splits.includes(i.split)).map((i) => i.family)));
      const chosen: Record<string, any> = {};
      for (const f of fams) {
        const res = runTemporal(suiteT, [...baselines, ...grid], { splits, families: [f] });
        const locf = res[0].items;
        const { reliableView: rv } = await import('../../lib/synthetic-lab/benchmark/suite');
        const scored = res.map((r) => ({ label: r.label, cfg: r.cfg, score: summarize(rv(r.items, suite)).sampleMeanMae ?? 1e9 }));
        const best = [...scored].slice(3).sort((a, b) => a.score - b.score)[0];
        log(`${f}: LOCF ${scored[0].score} · μέσος ${scored[1].score} · τάση ${scored[2].score} · καλύτερο ${best.label} ${best.score}`);
        show(`${f} καλύτερο`, res.find((r) => r.label === best.label)!.items, locf);
        chosen[f] = { ...best, baselines: scored.slice(0, 3), gridSize: grid.length, items: locf.filter((x) => x.status === 'ok').length };
      }
      writeFileSync(benchDir('temporal_params.json'), JSON.stringify({ at: new Date().toISOString(), suiteHash: suite.hash, split: splits, chosen }, null, 1));
      log(`→ ${benchDir('temporal_params.json')}`);
      return;
    }
    const tuned = JSON.parse(require('fs').readFileSync(benchDir('temporal_params.json'), 'utf8'));
    const fams = families || Array.from(new Set(suite.items.filter((i) => splits.includes(i.split)).map((i) => i.family)));
    const all: Record<string, any[]> = {};
    for (const f of fams) {
      const tv: V[] = tuned.chosen[f] ? [{ label: `συντονισμένο (${tuned.chosen[f].label})`, cfg: tuned.chosen[f].cfg }] : [];
      const res = runTemporal(suiteT, [...baselines, ...tv], { splits, families: [f] });
      console.log(`— ${f}`);
      res.forEach((r) => show(r.label, r.items, res[0].items));
      res.forEach((r, i) => (all[i === 3 ? 'tuned' : r.label] = [...(all[i === 3 ? 'tuned' : r.label] || []), ...r.items]));
    }
    console.log('— όλες οι οικογένειες');
    for (const [k, v] of Object.entries(all)) show(k, v, all['επιμονή (LOCF)']);
    const file = benchDir('experiments', `T-temporal-${splits.join('+')}-${stamp()}.json`);
    writeFileSync(file, JSON.stringify({ id: 'T-temporal', splits, suiteHash: suite.hash, tuned: tuned.chosen, variants: Object.entries(all).map(([label, items]) => ({ label, summary: summarize(items), familyBalanced: familyBalanced(items), byGap: summarizeBy(items, (x) => String(x.evidence?.gapYears ?? 'na')), byFamily: summarizeBy(items, (x) => x.family), items })) }));
    log(`→ ${file}`);
    return;
  }
  if (cmd === 'factors') {
    // Φάση 2.4: εκτίμηση φορτίσεων από ΠΡΟΗΓΟΥΜΕΝΑ κύματα, έλεγχος στο επόμενο (ποτέ από το ίδιο κύμα)
    const A = await import('../../lib/synthetic-lab/benchmark/assoc');
    const { PRODUCTION_MODEL } = await import('../../lib/synthetic-lab/engine/model-config');
    const base = { ...PRODUCTION_MODEL, version: 'rho-0.3', batteryRho: 0.3 };
    const report: any = { at: new Date().toISOString(), steps: [] };
    const demoCache = new Map<number, any[]>();
    const demo = async (y: number) => {
      if (!demoCache.has(y)) demoCache.set(y, await A.linkedPairs({ model: PRODUCTION_MODEL, years: [y] }));
      return demoCache.get(y)!;
    };
    // 1) επιλογή K, μ μέσα στο calibration: εκπαίδευση ≤ 2018, έλεγχος 2020
    const grid: [number, number][] = [[1, 0.5], [2, 0.5], [3, 0.5], [3, 2], [5, 2], [5, 5]];
    const tr18 = [...(await demo(2017)), ...(await demo(2018))];
    let best: any = null;
    for (const [K, mu] of grid) {
      const fit = A.fitItemFactors(tr18, K, mu);
      const m = { ...base, version: `f${K}-${mu}`, itemFactors: { K, fittedOnYears: [2017, 2018], loadings: fit.loadings } };
      const res = A.summarizePairs(await A.linkedPairs({ model: m, years: [2020] }));
      log(`calibration (εκπ. ≤2018 → 2020) K=${K} μ=${mu}: ${JSON.stringify(res)} (rmse εκπ. ${fit.rmseTrain})`);
      report.steps.push({ stage: 'calibration', K, mu, res });
      const score = (res.withinMae ?? 0) * res.withinPairs + (res.acrossMae ?? 0) * res.acrossPairs;
      if (!best || score < best.score) best = { K, mu, score };
    }
    const r0 = A.summarizePairs(await demo(2020));
    const rb = A.summarizePairs(await A.linkedPairs({ model: base, years: [2020] }));
    log(`calibration 2020: παραγωγή ${JSON.stringify(r0)} · ρ=0.3 ${JSON.stringify(rb)} · επιλογή K=${best.K} μ=${best.mu}`);
    // 2) validation: εκπαίδευση ≤ 2020 → 2022
    const tr20 = [...tr18, ...(await demo(2020))];
    const fit20 = A.fitItemFactors(tr20, best.K, best.mu);
    const m20 = { ...base, version: 'factors-le2020', itemFactors: { K: best.K, fittedOnYears: [2017, 2018, 2020], loadings: fit20.loadings } };
    const v = { prod: A.summarizePairs(await demo(2022)), rho: A.summarizePairs(await A.linkedPairs({ model: base, years: [2022] })), factors: A.summarizePairs(await A.linkedPairs({ model: m20, years: [2022] })) };
    log(`validation 2022: ${JSON.stringify(v)}`);
    // 3) 2024 (ήδη αποκαλυμμένο στη φάση 1 — όχι «άγνωστο»): εκπαίδευση ≤ 2022
    const tr22 = [...tr20, ...(await demo(2022))];
    const fit22 = A.fitItemFactors(tr22, best.K, best.mu);
    const m22 = { ...base, version: 'factors-le2022', itemFactors: { K: best.K, fittedOnYears: [2017, 2018, 2020, 2022], loadings: fit22.loadings } };
    const h = { prod: A.summarizePairs(await demo(2024)), rho: A.summarizePairs(await A.linkedPairs({ model: base, years: [2024] })), factors: A.summarizePairs(await A.linkedPairs({ model: m22, years: [2024] })) };
    log(`2024 (προηγουμένως αποκαλυμμένο): ${JSON.stringify(h)}`);
    Object.assign(report, { chosen: best, validation2022: v, revealed2024: h, loadings: { le2020: m20.itemFactors, le2022: m22.itemFactors } });
    writeFileSync(benchDir('item_factors.json'), JSON.stringify(report));
    log(`→ ${benchDir('item_factors.json')}`);
    return;
  }
  if (cmd === 'final2') {
    // PHASE2_PREREGISTRATION.md §6: ΜΙΑ εκτέλεση στο holdout2 με όλες τις εκδόσεις και τα baselines μαζί.
    if (!args.includes('--i-understand-this-is-final')) throw new Error('Το holdout2 χρησιμοποιείται μία φορά. Πρόσθεσε --i-understand-this-is-final.');
    if (readHistory().some((h) => h.type === 'final2')) throw new Error('Το holdout2 έχει ήδη αξιολογηθεί — δεν επαναλαμβάνεται.');
    const versions = list('models', 'prod-1,exp-20261028-a');
    if (versions.length > 4) throw new Error('Έως prod-1, exp-20261028-a και 2 νέες υποψήφιες (προκαταχώριση §6).');
    const { runTemporal } = await import('../../lib/synthetic-lab/benchmark/temporal');
    const { familyBalanced, pairedCompareStrat } = await import('../../lib/synthetic-lab/benchmark/score');
    const { saveDecision } = await import('../../lib/synthetic-lab/benchmark/registry');
    const split = ['holdout2' as Split];
    const out: Record<string, any[]> = {};
    for (const r of runTemporal(suite, [
      { label: 'baseline: επιμονή (LOCF)', cfg: { params: { method: 'locf' } } },
      { label: 'baseline: ιστορικός μέσος', cfg: { params: { method: 'mean' } } },
      { label: 'baseline: γραμμική τάση', cfg: { params: { method: 'linear' } } }
    ], { splits: split })) out[r.label] = r.items;
    for (const v of versions) {
      const model = loadModel(v);
      if (!model) throw new Error(`Άγνωστη έκδοση ${v}`);
      log(`holdout2: ${v}`);
      const r = await runBenchmark(suite, { model, mode: 'blind', splits: split, seeds: [1, 2], n: 2000, onProgress: (d, t) => d % 20 === 0 && log(`  ${d}/${t}`) });
      out[v] = r.items;
      saveRun({ id: `final2-${v}-${Date.now()}`, createdAt: new Date().toISOString(), tag: 'final2', suiteVersion: suite.version, suiteHash: suite.hash, model, config: { mode: 'blind', splits: split, seeds: [1, 2], n: 2000 }, durationMs: r.durationMs, summary: summarize(r.items), bySplit: summarizeBy(r.items, (x) => x.split), byFamily: summarizeBy(r.items, (x) => x.family), gaps: gapStats(r.items), items: r.items });
    }
    const { reliableView } = await import('../../lib/synthetic-lab/benchmark/suite');
    for (const k of Object.keys(out)) out[k] = reliableView(out[k], suite);
    const ref = out['baseline: επιμονή (LOCF)'];
    const prod = out['prod-1'];
    const rows = Object.entries(out).map(([label, items]) => ({
      label,
      summary: summarize(items),
      familyBalanced: familyBalanced(items),
      vsLOCF: pairedCompareStrat(ref, items),
      vsProd: prod ? pairedCompareStrat(prod, items) : null,
      byFamily: summarizeBy(items, (x) => x.family),
      byTopic: summarizeBy(items, (x) => x.topics[0] || 'other'),
      byYear: summarizeBy(items, (x) => String(x.year)),
      byHorizon: summarizeBy(items, (x) => String(x.evidence?.gapYears ?? 'na')),
      gaps: gapStats(items)
    }));
    for (const r of rows) console.log(`${r.label.padEnd(34)} ανά συστάδα ${r.summary.sampleMeanMae} · οικογ. ${r.familyBalanced} · σύνολο ${r.summary.overallMae} · ομάδες ${r.summary.groupMae} | vs LOCF ${r.vsLOCF.meanDelta} ${JSON.stringify(r.vsLOCF.ci95)} | vs prod ${r.vsProd?.meanDelta} ${JSON.stringify(r.vsProd?.ci95)}`);
    const rec = { id: `final2-${Date.now()}`, type: 'final2', at: new Date().toISOString(), suiteHash: suite.hash, versions, rows };
    saveDecision(rec);
    writeFileSync(benchDir('final2_results.json'), JSON.stringify(rec));
    log(`→ ${benchDir('final2_results.json')}`);
    return;
  }
  if (cmd === 'compare') {
    // Κανόνες αποδοχής της φάσης 2 (PHASE2_PREREGISTRATION.md §5) για δύο εκτελέσεις στα ίδια items.
    const { familyBalanced, pairedCompareStrat } = await import('../../lib/synthetic-lab/benchmark/score');
    const { saveDecision } = await import('../../lib/synthetic-lab/benchmark/registry');
    const { reliableView } = await import('../../lib/synthetic-lab/benchmark/suite');
    const ref = JSON.parse(readFileSync(args[1], 'utf8'));
    const alt = JSON.parse(readFileSync(args[2], 'utf8'));
    ref.items = reliableView(ref.items, suite);
    alt.items = reliableView(alt.items, suite);
    const ids = new Set(alt.items.filter((i: any) => i.status === 'ok').map((i: any) => i.itemId));
    const refItems = ref.items.filter((i: any) => ids.has(i.itemId));
    const altItems = alt.items.filter((i: any) => refItems.some((r: any) => r.itemId === i.itemId));
    const p = pairedCompareStrat(refItems, altItems);
    const sr = summarize(refItems);
    const sa = summarize(altItems);
    const famR = summarizeBy(refItems, (x) => x.family);
    const famA = summarizeBy(altItems, (x) => x.family);
    const topR = summarizeBy(refItems, (x) => x.topics[0] || 'other');
    const topA = summarizeBy(altItems, (x) => x.topics[0] || 'other');
    const reasons: string[] = [];
    const gain = (sr.sampleMeanMae ?? 0) - (sa.sampleMeanMae ?? 0);
    if (!(gain >= 0.1)) reasons.push(`κύρια μετρική: βελτίωση ${gain.toFixed(2)} < 0,10`);
    if (!p.ci95 || !((p.ci95[1] ?? 1) < 0)) reasons.push(`95% διάστημα ${JSON.stringify(p.ci95)} όχι αυστηρά < 0`);
    for (const f of Object.keys(famA)) {
      const d = (famA[f].sampleMeanMae ?? 0) - (famR[f]?.sampleMeanMae ?? 0);
      if (d > 0.25) reasons.push(`οικογένεια ${f}: +${d.toFixed(2)}`);
    }
    if ((sa.groupMae ?? 0) - (sr.groupMae ?? 0) > 0.25) reasons.push(`ομάδες: ${sr.groupMae} → ${sa.groupMae}`);
    for (const t of Object.keys(topA)) {
      if (topA[t].samples < 5) continue;
      const d = (topA[t].sampleMeanMae ?? 0) - (topR[t]?.sampleMeanMae ?? 0);
      if (d > 0.5) reasons.push(`θέμα ${t}: +${d.toFixed(2)}`);
    }
    const rec = {
      id: `p2-compare-${Date.now()}`, type: 'p2_compare', at: new Date().toISOString(), suiteHash: suite.hash, label: opt('label', ''),
      ref: { file: args[1], version: ref.model?.version, summary: sr, familyBalanced: familyBalanced(refItems) },
      alt: { file: args[2], version: alt.model?.version, summary: sa, familyBalanced: familyBalanced(altItems) },
      paired: p, familyDelta: Object.fromEntries(Object.keys(famA).map((f) => [f, Math.round(((famA[f].sampleMeanMae ?? 0) - (famR[f]?.sampleMeanMae ?? 0)) * 100) / 100])),
      accepted: reasons.length === 0, reasons
    };
    saveDecision(rec);
    console.log(JSON.stringify({ ref: [sr.sampleMeanMae, sr.overallMae, sr.groupMae, sr.persistOverallMae, sr.persistGroupMae], alt: [sa.sampleMeanMae, sa.overallMae, sa.groupMae], familyBalanced: [rec.ref.familyBalanced, rec.alt.familyBalanced], paired: p, familyDelta: rec.familyDelta, accepted: rec.accepted, reasons }, null, 1));
    return;
  }
  if (cmd === 'select') return void (await selectOnValidation(suite, { log, note: opt('note'), versions: opt('models') ? list('models', '') : undefined }));
  if (cmd === 'holdout') return void (await holdoutEvaluate(suite, opt('model')!, { log, confirm: args.includes('--i-understand-this-is-final') }));
  if (cmd === 'history') {
    for (const h of readHistory()) console.log(JSON.stringify(h).slice(0, 400));
    return;
  }
  console.log('Εντολές: suite | run | experiment | tune | assoc | select | holdout | history | analyze');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
