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
    const show = (label: string, items: any[], ref: any[]) => {
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
        const scored = res.map((r) => ({ label: r.label, cfg: r.cfg, score: summarize(r.items).sampleMeanMae ?? 1e9 }));
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
