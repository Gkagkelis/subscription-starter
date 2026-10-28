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
 *
 * Τα αποτελέσματα αποθηκεύονται στο <dataRoot>/benchmarks (ιδιωτικά). Η παραγωγική έκδοση δεν αλλάζει από εδώ.
 */
import { writeFileSync } from 'fs';
import { buildSuite, type Family, type Split } from '../../lib/synthetic-lab/benchmark/suite';
import { runBenchmark } from '../../lib/synthetic-lab/benchmark/runner';
import { gapStats, summarize, summarizeBy } from '../../lib/synthetic-lab/benchmark/score';
import { EXPERIMENTS, runExperiment } from '../../lib/synthetic-lab/benchmark/experiments';
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
  if (cmd === 'tune') return void (await tuneOnCalibration(suite, { maxGroups: opt('max-groups') ? Number(opt('max-groups')) : undefined, log }));
  if (cmd === 'select') return void (await selectOnValidation(suite, { log }));
  if (cmd === 'holdout') return void (await holdoutEvaluate(suite, opt('model')!, { log, confirm: args.includes('--i-understand-this-is-final') }));
  if (cmd === 'history') {
    for (const h of readHistory()) console.log(JSON.stringify(h).slice(0, 400));
    return;
  }
  console.log('Εντολές: suite | run | experiment | tune | select | holdout | history');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
