// Περιθώρια του βαθμονομημένου πληθυσμού (15+) για επαναστάθμιση (raking)
// δειγμάτων πηγών, π.χ. διαΝΕΟσις: ηλικία×φύλο, μόρφωση, περιφέρεια.
// Χρήση: npx tsx scripts/synthetic-lab/export-population-margins.ts [out.json]
import { writeFileSync } from 'fs';
import { norayaMembership } from '../../lib/synthetic-lab/data/noraya';
import { CALIBRATED_POPULATION_ID, loadPopulation } from '../../lib/synthetic-lab/population/store';
import { dataPath } from '../../lib/synthetic-lab/storage/paths';

const pop = loadPopulation(CALIBRATED_POPULATION_ID);
if (!pop) throw new Error('Δεν βρέθηκε ο βαθμονομημένος πληθυσμός');
const margins: Record<string, Record<string, number>> = {};
let total = 0;
for (const p of pop.personas) {
  const m = norayaMembership(p, 'dianeosis');
  if (!m) continue;
  total += p.weight;
  for (const [dim, groups] of Object.entries(m)) {
    for (const [g, frac] of Object.entries(groups)) {
      margins[dim] ||= {};
      margins[dim][g] = (margins[dim][g] || 0) + p.weight * frac;
    }
  }
}
for (const dim of Object.keys(margins)) {
  const s = Object.values(margins[dim]).reduce((a, b) => a + b, 0);
  for (const g of Object.keys(margins[dim])) margins[dim][g] = Math.round((margins[dim][g] / s) * 1e6) / 1e6;
}
const out = process.argv[2] || dataPath('raw', 'population-margins-15plus.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      populationId: CALIBRATED_POPULATION_ID,
      note: 'Μερίδια 15+ (ηλικία×φύλο, περιφέρεια: Eurostat 2025· μόρφωση: δομή GLOPOP-S 2015 μετά τη βαθμονόμηση).',
      represented: Math.round(total),
      margins
    },
    null,
    1
  )
);
console.log(`✓ ${out}`, Object.fromEntries(Object.entries(margins).map(([d, g]) => [d, Object.keys(g).length])));
console.log(margins.education_group);
