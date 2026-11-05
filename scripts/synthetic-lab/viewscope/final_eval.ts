// Viewscope v2 — Βήμα 3: ταχύτητα, μηδενικές κλήσεις API, αναπαραγωγιμότητα και κάλυψη (3 δείκτες) σε μελέτες όλων των τομέων.
// Εκτελείται σε απομονωμένο φάκελο δεδομένων. Δεν αποθηκεύει τίποτα στην παραγωγή.
//   SYNTHETIC_LAB_DATA_DIR=<iso> tsx scripts/synthetic-lab/viewscope/final_eval.ts <scratch-dir-with-links>
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { runViewscope } from '../../../lib/synthetic-lab/viewscope/runner';

const REPO = path.resolve(__dirname, '../../..');
const S = process.argv[2];
const OUT = path.join(REPO, 'benchmarks/viewscope_v2/results');
const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const cases = [
  { name: 'prod-1 (καταναλωτική/οικονομική)', file: '.synthetic-lab-data/studies/study-mvr0mtz8-1srzsi.json', links: 'links_prod1.json', study: { org: null, fieldworkStart: '2026-11-10' }, applyScenario: true },
  { name: 'PIE pie-0.2 (πολιτική)', file: '.synthetic-lab-data/studies/study-mvslb843-v7hait.json', links: null, study: { org: null, fieldworkStart: '2026-11-10' } },
  { name: 'PIE βαρόμετρο (κοινωνική/πολιτική)', file: '.synthetic-lab-data/studies/study-mvsjkfa5-5medyu.json', links: null, study: { org: null, fieldworkStart: '2026-11-10' } },
  { name: 'PIE Cinobo (καταναλωτική)', file: '.synthetic-lab-data/studies/study-mvsjt73p-5czv7q.json', links: null, study: { org: null, fieldworkStart: '2026-11-10' } },
  { name: 'Metron POL-01 (πολιτική, αναδρομικά 10/2026)', file: path.join(S, 'plan_pol01.json'), links: 'links_pol01.json', study: { org: 'Metron Analysis', fieldworkStart: '2026-10-14' } }
];
async function main() {
  const rows: any[] = [];
  for (const c of cases) {
    const doc = JSON.parse(readFileSync(path.isAbsolute(c.file) ? c.file : path.join(REPO, c.file), 'utf8'));
    const links = c.links && existsSync(path.join(S, c.links)) ? JSON.parse(readFileSync(path.join(S, c.links), 'utf8')) : null;
    for (const n of [500, 1000]) {
      const plan = { ...(doc.plan || doc), sampleSize: n };
      const opts = { plan, populationId: doc.populationId || undefined, seed: 20261105, study: c.study, routes: { publishedWaves: true, crosswalks: true }, core: { enabled: true, links, applyToScenario: !!(c as any).applyScenario } };
      const t0 = process.hrtime.bigint();
      const a = await runViewscope(opts as any);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const b = await runViewscope(opts as any); // αναπαραγωγιμότητα: ίδιος σπόρος → ίδιες απαντήσεις
      const fp = (v: typeof a) => h(v.respondents.map((r) => [r.personaId, r.answers.map((x) => [x.questionId, x.value])]));
      rows.push({ case: c.name, n, ms: Math.round(ms), apiCalls: a.apiCalls + a.base.cost.calls, usd: a.base.cost.usd, reproducible: fp(a) === fp(b),
        coverageBase: a.coverage.base, coverageV2: a.coverage.v2, overrides: a.overrides.length, coreApplied: a.warnings.find((w) => w.startsWith('Κοινός')) || null,
        politicalSubgroupsAsScenario: a.political.filter((p) => p.subgroups && !p.subgroups.isForecast).length, politicalSubgroupsAsForecast: a.political.filter((p) => p.subgroups?.isForecast).length });
      const r = rows[rows.length - 1];
      console.log(`${c.name} n=${n}: ${(ms / 1000).toFixed(2)} δ · API ${r.apiCalls} · αναπαραγώγιμο ${r.reproducible} · κάλυψη τεχν. ${a.coverage.base.technical.n}→${a.coverage.v2.technical.n} εμπ. ${a.coverage.base.empirical.n}→${a.coverage.v2.empirical.n} επικ. ${a.coverage.base.validated.n}→${a.coverage.v2.validated.n} /${a.coverage.v2.questions}`);
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'final_eval.json'), JSON.stringify({ seed: 20261105, rows }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
