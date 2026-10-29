// PHASE4 B_pie04: αποφάσεις του λεξικού autolink-1 (runtime pie-0.4) για κάθε ερώτηση-στόχο, με την οικογένεια της ερώτησης κρυμμένη.
// tsx lex_export.ts <modelDir> <ref> <files,> <out>
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { suggestLink, buildIdf } from '../../../lib/synthetic-lab/persona/autolink';
import type { PersonaModel, PersonaItem } from '../../../lib/synthetic-lab/persona/model';
import type { Question } from '../../../lib/synthetic-lab/types';

const [dir, ref, filesArg, out, mode] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(path.join(dir, 'model.json'), 'utf8'));
const items = JSON.parse(readFileSync(path.join(dir, 'items.json'), 'utf8')) as PersonaItem[];
const vf = path.join(dir, 'vote.json');
const model: PersonaModel = { ...meta, items, vote: existsSync(vf) ? JSON.parse(readFileSync(vf, 'utf8')) : null };
const bank = JSON.parse(readFileSync(path.join(process.cwd(), '.synthetic-lab-data/persona/harmonized/item_bank.json'), 'utf8')) as any[];
const files = new Set(filesArg.split(','));
const res: Record<string, any> = {};
const idfAll = buildIdf(model);
for (const b of bank) {
  if (!files.has(b.file)) continue;
  const fam = b.family;
  const m: PersonaModel = mode === 'seen' ? model : { ...model, items: items.filter((it) => !fam || it.family !== fam) };
  const q: Question = { id: b.id, type: 'single_choice', text: b.text, options: b.options.map((o: any) => o.label) } as Question;
  const s = suggestLink(m, q, ref, { idf: idfAll });
  const link: any = s.link;
  res[b.id] = { accepted: s.accepted, confidence: s.confidence, target: s.target, itemId: link?.itemId || null, anchor: link?.anchor?.name || null, optionMap: link?.optionMap || {} };
}
writeFileSync(out, JSON.stringify(res));
const v = Object.values(res);
console.log('targets', v.length, 'accepted', v.filter((x: any) => x.accepted).length, 'item', v.filter((x: any) => x.accepted && x.itemId).length, 'anchor', v.filter((x: any) => x.anchor).length);
