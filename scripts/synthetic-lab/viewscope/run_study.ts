// Viewscope v2 — ενεργοποίηση της νέας, ΠΡΟΑΙΡΕΤΙΚΗΣ έκδοσης για μία μελέτη (η παραγωγική προεπιλογή δεν αλλάζει).
//   tsx scripts/synthetic-lab/viewscope/run_study.ts --plan <study.json | plan.json> [--n 500] [--seed 20261105]
//        [--org "Metron Analysis" --fieldwork-start 2026-11-20 --published-waves] [--crosswalks] [--other-org]
//        [--core --core-links <links.json> [--apply-scenario]]   (links: build_core_links.py)
//        [--xtab [--xtab-links <q→πίνακες.json>]] [--declared <σχέσεις-S.json>]   (vs-xtab-1.0: πίνακες υποομάδων · δηλωμένες σχέσεις S)
//        [--out <αρχείο.json>] [--save]
// Χωρίς σημαίες νέων διαδρομών: εκτελεί τον υπάρχοντα μηχανισμό και προσθέτει μόνο ταξινόμηση E/T/S, 3 δείκτες κάλυψης
// και πολιτικό διαχωρισμό. 0 κλήσεις API.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runViewscope } from '../../../lib/synthetic-lab/viewscope/runner';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); if (i < 0) return d; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : 'true'; };
async function main() {
  const file = arg('plan');
  if (!file) { console.error('Χρήση: run_study.ts --plan <study.json|plan.json> [επιλογές]'); process.exit(2); }
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const plan = { ...(doc.plan || doc) };
  if (arg('n')) plan.sampleSize = Number(arg('n'));
  const t0 = Date.now();
  const v = await runViewscope({
    plan, populationId: doc.populationId, seed: Number(arg('seed', '20261105')),
    study: { org: arg('org') || null, fieldworkStart: arg('fieldwork-start') },
    routes: { publishedWaves: arg('published-waves') === 'true', crosswalks: arg('crosswalks') === 'true', allowOtherOrg: arg('other-org') === 'true' },
    core: { enabled: arg('core') === 'true', links: arg('core-links') ? JSON.parse(readFileSync(arg('core-links')!, 'utf8')) : null, applyToScenario: arg('apply-scenario') === 'true' },
    xtab: { enabled: arg('xtab') === 'true', links: arg('xtab-links') ? JSON.parse(readFileSync(arg('xtab-links')!, 'utf8')) : undefined },
    declaredRelations: arg('declared') ? JSON.parse(readFileSync(arg('declared')!, 'utf8')) : undefined,
    save: arg('save') === 'true'
  });
  const c = (x: typeof v.coverage.base) => `τεχνική ${x.technical.n}/${x.questions} · εμπειρική (E/T) ${x.empirical.n} · επικυρωμένη ${x.validated.n}${x.validated.meanExpectedMAE != null ? ` (αναμ. σφάλμα ${x.validated.meanExpectedMAE.toFixed(1)} π.μ.)` : ''} · S ${x.scenarioS} · αποχή ${x.abstained}`;
  console.log(`${v.label}\n${v.version} · ${v.base.engine.engineVersion} · ${v.respondents.length} ερωτώμενοι σε ${((Date.now() - t0) / 1000).toFixed(2)} δ · κλήσεις API: ${v.apiCalls}`);
  console.log(`Κάλυψη υπάρχοντος: ${c(v.coverage.base)}\nΚάλυψη v2:         ${c(v.coverage.v2)}`);
  v.overrides.forEach((o) => console.log(`  ${o.questionId}: ${o.from ?? 'αποχή'} → ${o.to} (${o.class}) — ${o.reason}`));
  v.political.forEach((p) => console.log(`  [πολιτική] ${p.questionId}: εθνικό ${p.national.class ?? '—'} (${p.national.route ?? 'αποχή'}) · υποομάδες ${p.subgroups ? `${p.subgroups.class} — ${p.subgroups.label}` : '—'}`));
  v.xtabReports.forEach((x) => console.log(`  [πίνακες υποομάδων] ${x.questionId}: ${x.dimsUsed.map((d) => `${d.dim} (απόκλιση συμφιλίωσης ${d.reconcileDevPp} π.μ.)`).join(', ') || '—'}${x.dimsDropped.length ? ` · απορρίφθηκαν: ${x.dimsDropped.map((d) => `${d.dim}: ${d.reason}`).join('; ')}` : ''} · απόκλιση συνόλου ${x.maxMarginalDevPp} π.μ.`));
  v.declared.forEach((d) => console.log(`  [σχέση S] ${d.questionId} ~ ${d.driver} (${d.strength}) · ευαισθησία «${Object.values(d.sensitivity)[0]?.option}» χαμηλή/υψηλή ομάδα: ${Object.entries(d.sensitivity).map(([k, x]) => `${k} ${x.lowGroupShare}/${x.highGroupShare}%`).join(' · ')}`));
  v.warnings.forEach((w) => console.log(`  ! ${w}`));
  const out = arg('out');
  if (out) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ ...v, base: { id: v.base.id, engine: v.base.engine, warnings: v.base.warnings } }, null, 1)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
