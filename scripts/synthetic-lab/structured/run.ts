// Εκτέλεση δομημένης μελέτης με τον γρήγορο στατιστικό μηχανισμό (χωρίς AI, χωρίς δίκτυο).
//   node_modules/.bin/tsx scripts/synthetic-lab/structured/run.ts --spec <spec.json> --out <run.json> [--n 500] [--seed 20261105]
//        [--effect-scale 1] [--base-shift 0] [--ablate buy3,elec] [--ablate-pie]
//   Παραλλαγές στην ίδια διεργασία (ευαισθησία / σταθερότητα / δοκιμή επίδρασης πηγών):
//        --variants <variants.json> --out-dir <dir>      ([{name, n?, seed?, effectScale?, baseShift?, ablate?, ablatePie?}])
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { runStructuredStudy } from '../../../lib/synthetic-lab/structured/engine';
import type { RunOptions, StructuredStudySpec } from '../../../lib/synthetic-lab/structured/types';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

const specPath = arg('spec');
if (!specPath) {
  console.error('Χρήση: run.ts --spec <spec.json> (--out <run.json> | --variants <v.json> --out-dir <dir>) [επιλογές]');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as StructuredStudySpec;
const base: RunOptions = {
  n: Number(arg('n', '500')),
  seed: Number(arg('seed', '20261105')),
  effectScale: Number(arg('effect-scale', '1')),
  baseShift: Number(arg('base-shift', '0')),
  ablateMetrics: (arg('ablate', '') || '').split(',').filter(Boolean),
  ablatePie: arg('ablate-pie') === 'true'
};

function once(o: RunOptions, out: string, label: string) {
  const t0 = process.hrtime.bigint();
  const run = runStructuredStudy(spec, o);
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ...run, variant: label, wallClockMs: Math.round(wallMs) }));
  const unresolved = run.respondents.filter((r) => r.flags.some((f) => f.startsWith('unresolved'))).length;
  console.log(`[${label}] ${run.respondents.length} ερωτώμενοι σε ${(wallMs / 1000).toFixed(2)} δευτ. (παραγωγή ${run.timingsMs.generation_ms} ms) · ανεπίλυτοι κανόνες: ${unresolved}`);
}

const variants = arg('variants');
if (variants) {
  const dir = arg('out-dir') || '.';
  const list = JSON.parse(readFileSync(variants, 'utf8')) as ({ name: string; ablate?: string[] } & Partial<RunOptions>)[];
  for (const v of list) {
    once({ ...base, ...v, ablateMetrics: v.ablate ?? v.ablateMetrics ?? [] }, path.join(dir, `${v.name}.json`), v.name);
  }
} else {
  const out = arg('out');
  if (!out) { console.error('Λείπει --out'); process.exit(2); }
  once(base, out, 'main');
}
