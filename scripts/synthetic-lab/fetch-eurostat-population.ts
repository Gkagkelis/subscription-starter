/*
 * Επίσημος πληθυσμός Ελλάδας από Eurostat (demo_r_pjangroup) ανά
 * περιφέρεια NUTS2 × 5ετή ηλικία × φύλο, για επικαιροποίηση του GLOPOP-S 2015.
 *
 *   npx tsx scripts/synthetic-lab/fetch-eurostat-population.ts [--year 2025]
 *
 * Γράφει lib/synthetic-lab/data/official/eurostat-population-<έτος>.json
 * (Eurostat CC BY 4.0 — επιτρέπεται η αναδιανομή με αναφορά πηγής).
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EUROSTAT_AGE_TO_GLOPOP, EUROSTAT_LICENSE, eurostatUrl, jsonStatRows, NUTS2_TO_GDL, type JsonStat } from '../../lib/synthetic-lab/data/eurostat';

const yearArg = process.argv.indexOf('--year');
const year = yearArg > 0 ? process.argv[yearArg + 1] : '2025';

async function main() {
  const url = eurostatUrl('demo_r_pjangroup', { geo: Object.keys(NUTS2_TO_GDL), sex: ['M', 'F'], unit: 'NR', time: year });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}`);
  const js = (await res.json()) as JsonStat;
  const rows = jsonStatRows(js);
  // κελιά περιφέρεια × ζώνη GLOPOP × φύλο
  const cells: Record<string, number> = {};
  let unknownAge = 0;
  for (const r of rows) {
    const age = String(r.age);
    if (age === 'UNK') {
      unknownAge += Number(r.value);
      continue;
    }
    const band = EUROSTAT_AGE_TO_GLOPOP[age];
    if (!band) continue; // TOTAL, επικαλυπτόμενα (Y_GE80, Y75-79 κ.λπ.)
    const gdl = NUTS2_TO_GDL[String(r.geo)];
    const sex = r.sex === 'M' ? 'male' : 'female';
    const key = `${gdl}|${band}|${sex}`;
    cells[key] = (cells[key] || 0) + Number(r.value);
  }
  const total = Object.values(cells).reduce((a, b) => a + b, 0);
  const out = {
    datasetId: `eurostat-demo_r_pjangroup-${year}`,
    source: 'Eurostat, demo_r_pjangroup (Population on 1 January by age group, sex and NUTS 2 region) — δεδομένα ΕΛΣΤΑΤ',
    url,
    license: EUROSTAT_LICENSE,
    referenceDate: `${year}-01-01`,
    year: Number(year),
    updated: js.updated || null,
    fetchedAt: new Date().toISOString(),
    total,
    unknownAge,
    cells
  };
  const dir = path.resolve(__dirname, '../../lib/synthetic-lab/data/official');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `eurostat-population-${year}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`✓ ${Object.keys(cells).length} κελιά, σύνολο ${total.toLocaleString('el-GR')} (1/1/${year}) -> ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
