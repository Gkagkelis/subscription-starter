/*
 * Μορφωτικό επίπεδο πληθυσμού Ελλάδας από Eurostat (Έρευνα Εργατικού
 * Δυναμικού, edat_lfs_9901: χιλιάδες άτομα σε ιδιωτικά νοικοκυριά) ανά
 * ηλικιακή ζώνη × φύλο × ISCED (0-2 / 3-4 / 5-8), και πληθυσμός 65-74 / 75+
 * (demo_pjangroup) για βαθμονόμηση της μόρφωσης του GLOPOP-S 2015.
 *
 *   npx tsx scripts/synthetic-lab/fetch-eurostat-education.ts [--year 2025]
 *
 * Γράφει lib/synthetic-lab/data/official/eurostat-education-<έτος>.json
 * (Eurostat CC BY 4.0 — επιτρέπεται η αναδιανομή με αναφορά πηγής).
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EUROSTAT_LICENSE, eurostatUrl, jsonStatRows, type JsonStat } from '../../lib/synthetic-lab/data/eurostat';

const yearArg = process.argv.indexOf('--year');
const year = yearArg > 0 ? process.argv[yearArg + 1] : '2025';

const AGES: Record<string, string> = { 'Y15-24': '15-24', 'Y25-34': '25-34', 'Y35-44': '35-44', 'Y45-54': '45-54', 'Y55-64': '55-64', 'Y55-74': '55-74' };
const ISCED: Record<string, string> = { 'ED0-2': 'ED0-2', ED3_4: 'ED3_4', 'ED5-8': 'ED5-8' };

async function get(dataset: string, params: Record<string, string | string[]>): Promise<{ rows: Record<string, string | number>[]; url: string; updated?: string }> {
  const url = eurostatUrl(dataset, params);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Eurostat ${dataset} HTTP ${res.status}`);
  const js = (await res.json()) as JsonStat;
  return { rows: jsonStatRows(js), url, updated: js.updated };
}

async function main() {
  const edu = await get('edat_lfs_9901', { geo: 'EL', sex: ['M', 'F'], isced11: Object.keys(ISCED), age: Object.keys(AGES), unit: 'THS_PER', time: year });
  const raw: Record<string, number> = {};
  for (const r of edu.rows) raw[`${AGES[String(r.age)]}|${r.sex === 'M' ? 'male' : 'female'}|${ISCED[String(r.isced11)]}`] = Number(r.value) * 1000;
  // 65-74 = 55-74 − 55-64
  const cells: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const [age, sex, isc] = k.split('|');
    if (age === '55-74') {
      const v64 = raw[`55-64|${sex}|${isc}`];
      if (v64 !== undefined) cells[`65-74|${sex}|${isc}`] = Math.max(0, v - v64);
    } else cells[k] = v;
  }
  // Πληθυσμός 65-74 και 75+ ανά φύλο (για τη ζώνη GLOPOP 65+)
  const pop = await get('demo_pjangroup', { geo: 'EL', sex: ['M', 'F'], age: ['Y65-69', 'Y70-74', 'Y75-79', 'Y80-84', 'Y_GE85'], unit: 'NR', time: year });
  const old: Record<string, number> = {};
  for (const r of pop.rows) {
    const sex = r.sex === 'M' ? 'male' : 'female';
    const grp = ['Y65-69', 'Y70-74'].includes(String(r.age)) ? '65-74' : '75+';
    old[`${grp}|${sex}`] = (old[`${grp}|${sex}`] || 0) + Number(r.value);
  }
  const out = {
    datasetId: `eurostat-edat_lfs_9901-${year}`,
    source: 'Eurostat, edat_lfs_9901 (Population in private households by educational attainment level, LFS) — δεδομένα ΕΛΣΤΑΤ· demo_pjangroup για 65-74/75+',
    urls: [edu.url, pop.url],
    license: EUROSTAT_LICENSE,
    year: Number(year),
    updated: edu.updated,
    fetchedAt: new Date().toISOString(),
    note: 'Άτομα σε ιδιωτικά νοικοκυριά 15-74 (ISCED 0-2 = έως γυμνάσιο, 3-4 = λύκειο/μεταλυκειακή, 5-8 = ανώτατη). Οι 75+ δεν καλύπτονται.',
    cells,
    population65: old
  };
  const dir = path.join(process.cwd(), 'lib/synthetic-lab/data/official');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `eurostat-education-${year}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`✓ ${Object.keys(cells).length} κελιά -> ${file}`);
  for (const age of ['15-24', '25-34', '35-44', '45-54', '55-64', '65-74']) {
    const t = ['ED0-2', 'ED3_4', 'ED5-8'].map((i) => (cells[`${age}|male|${i}`] || 0) + (cells[`${age}|female|${i}`] || 0));
    const s = t.reduce((a, b) => a + b, 0);
    console.log(age, t.map((x) => `${((100 * x) / s).toFixed(1)}%`).join(' / '));
  }
  console.log('65-74 / 75+:', old);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
