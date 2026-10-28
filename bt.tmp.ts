import { buildSuite } from '@/lib/synthetic-lab/benchmark/suite';
import { runBenchmark } from '@/lib/synthetic-lab/benchmark/runner';
import { summarize, gapStats, scoreItem } from '@/lib/synthetic-lab/benchmark/score';
import { PRODUCTION_MODEL } from '@/lib/synthetic-lab/engine/model-config';
(async () => {
  const suite = buildSuite();
  for (const fam of ['eb_trend', 'eurostat_ts', 'findex_ts', 'dianeosis_ts', 'noraya_ts'] as const) {
    const t0 = Date.now();
    const r = await runBenchmark(suite, { model: PRODUCTION_MODEL, mode: 'blind', splits: ['calibration'], families: [fam], seeds: [1, 2], n: 2000, maxGroups: 3 });
    console.log(fam, 'groups', r.groups, 'items', r.items.length, 'ms', Date.now() - t0, JSON.stringify(summarize(r.items)));
    const ok = r.items.find((i) => i.status === 'ok');
    if (ok) console.log('  e.g.', ok.itemId, JSON.stringify(scoreItem(ok)), JSON.stringify(ok.cells.slice(0, 3)), JSON.stringify(ok.evidence));
    console.log('  gaps', JSON.stringify(gapStats(r.items)));
  }
})();
