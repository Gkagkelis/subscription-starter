// Εξαγωγή δυαδικών δεικτών Έρευνας ΤΠΕ (Eurostat, Ελλάδα, % ατόμων) με διασπάσεις ομάδων, για τη Δοκιμή Α του EGPS.
// Χρήση: npx tsx scripts/synthetic-lab/egps/export_ict.ts .synthetic-lab-data/egps/ict.json
import { writeFileSync } from 'fs';
import { lakeQuestions } from '../../../lib/synthetic-lab/data/lake';
import { getMetric } from '../../../lib/synthetic-lab/data/noraya';
const out: any[] = [];
for (const q of lakeQuestions() as any[]) {
  if (!q.studyId.startsWith('eurostat:isoc') || q.kind !== 'binary' || q.universe?.unitCode !== 'PC_IND') continue;
  const metric = Object.values(q.optionMetrics)[0] as string; const m: any = getMetric(metric); if (!m) continue;
  const waves = m.waves.map((w: any) => ({ year: w.year, flag: w.flag || null, groups: Object.fromEntries(Object.entries(w.groups).map(([d, g]: any) => [d, Object.fromEntries(Object.entries(g).map(([k, c]: any) => [k, c.value]))])) }));
  out.push({ id: q.id, study: q.studyId, text: q.text, waves });
}
writeFileSync(process.argv[2], JSON.stringify(out)); console.log(out.length);
const c: Record<string, number> = {}; out.forEach((o) => (c[o.study] = (c[o.study] || 0) + 1)); console.log(c);
