// PHASE4 B_pie04 για τα τελικά holdouts H1–H7: αποφάσεις του λεξικού autolink-1 (runtime pie-0.4) για κάθε ερώτηση,
// μόνο από κείμενο/επιλογές (questions.json) και μήνα αναφοράς = έναρξη πεδίου. Καμία απάντηση δεν διαβάζεται.
// npx tsx scripts/synthetic-lab/persona/lex_holdouts.ts <modelDir> <out>
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { buildIdf, suggestLink } from '../../../lib/synthetic-lab/persona/autolink';
import type { PersonaItem, PersonaModel } from '../../../lib/synthetic-lab/persona/model';
import type { Question } from '../../../lib/synthetic-lab/types';

const [dir, out] = process.argv.slice(2);
const HD = path.join(process.cwd(), '.synthetic-lab-data', 'persona', 'phase4', 'holdouts');
const HOLDOUTS = ['wellcome2020', 'tisp', 'covidistress', 'banksat', 'culture', 'qog2024', 'dinas'];
const FALLBACK: Record<string, string> = { dinas: '2021-06' };
const meta = JSON.parse(readFileSync(path.join(dir, 'model.json'), 'utf8'));
const items = JSON.parse(readFileSync(path.join(dir, 'items.json'), 'utf8')) as PersonaItem[];
const vf = path.join(dir, 'vote.json');
const model: PersonaModel = { ...meta, items, vote: existsSync(vf) ? JSON.parse(readFileSync(vf, 'utf8')) : null };
const idf = buildIdf(model);
const res: Record<string, unknown> = {};
for (const h of HOLDOUTS) {
  const m = JSON.parse(readFileSync(path.join(HD, h, 'meta.json'), 'utf8'));
  const fw = typeof m.fieldwork === 'string' ? m.fieldwork : m.fieldwork?.start;
  const ref = fw && /^\d{4}-\d{2}/.test(fw) ? fw.slice(0, 7) : FALLBACK[h] || '2023-12';
  const qs = JSON.parse(readFileSync(path.join(HD, h, 'questions.json'), 'utf8')) as { id: string; text: string; options: { label: string }[] }[];
  let acc = 0;
  for (const b of qs) {
    const q = { id: b.id, type: 'single_choice', text: b.text, options: b.options.map((o) => o.label) } as Question;
    const s = suggestLink(model, q, ref, { idf });
    const link = s.link as { itemId?: string; optionMap?: Record<string, string[]>; anchor?: { name: string } } | null;
    res[b.id] = { accepted: s.accepted, confidence: s.confidence, target: s.target, itemId: link?.itemId || null, anchor: link?.anchor?.name || null, optionMap: link?.optionMap || {} };
    if (s.accepted && link?.itemId) acc++;
  }
  console.log(h, ref, qs.length, 'accepted', acc);
}
writeFileSync(out, JSON.stringify(res));
