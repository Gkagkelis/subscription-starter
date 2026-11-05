// Viewscope v2 — ρητοί πίνακες αντιστοίχισης ερώτησης → άγκυρα PIE (κατηγορία B του benchmark).
// Ενεργοί μόνο με approved=true. Κατηγορία ανά απάντηση: T όπου η αντιστοίχιση είναι 1:1, S όπου μια κατηγορία της άγκυρας
// μοιράζεται σε περισσότερες επιλογές (ο διαχωρισμός είναι δηλωμένη παραδοχή με ανάλυση ευαισθησίας).
import { readFileSync } from 'fs';
import path from 'path';
import { createRng, deriveSeed } from '../rng';
import type { PersonaState } from '../persona/panel';
import { trigramJaccard } from './text';

export interface Crosswalk {
  id: string;
  approved: boolean;
  matchText?: string;
  anchor?: string;
  optionMap?: { anchorValue: string; options: string[]; split?: number[]; splitSensitivity?: number[][] }[] | Record<string, string>;
  dkOption?: string;
}

export function loadCrosswalks(): Crosswalk[] {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'synthetic-lab', 'viewscope', 'crosswalks.json'), 'utf8')).crosswalks;
}

export function findCrosswalk(text: string, options: string[]): Crosswalk | null {
  for (const c of loadCrosswalks()) {
    if (!c.approved || !c.matchText || !Array.isArray(c.optionMap)) continue;
    if (trigramJaccard(c.matchText, text) < 0.85) continue;
    const need = c.optionMap.flatMap((m) => m.options);
    if (need.every((o) => options.includes(o))) return c;
  }
  return null;
}

/** Απάντηση ενός προσώπου από την άγκυρά του· split = παραδοχή διαχωρισμού (προεπιλογή του πίνακα ή παραλλαγή ευαισθησίας). */
export function answerFromCrosswalk(c: Crosswalk, ps: PersonaState, seed: number, splitOverride?: number[]): { option: string | null; cls: 'T' | 'S' | null } {
  const v = (ps.anchors as unknown as Record<string, number | string | null>)[c.anchor!];
  if (v == null) return { option: null, cls: null };
  const m = (c.optionMap as { anchorValue: string; options: string[]; split?: number[] }[]).find((x) => x.anchorValue === String(v));
  if (!m) return { option: null, cls: null };
  if (m.options.length === 1) return { option: m.options[0], cls: 'T' };
  const split = splitOverride || m.split || m.options.map(() => 1 / m.options.length);
  const u = createRng(deriveSeed(seed, 'vs2-xw', c.id, ps.personaId)).next();
  let acc = 0;
  for (let i = 0; i < m.options.length; i++) { acc += split[i]; if (u < acc) return { option: m.options[i], cls: 'S' }; }
  return { option: m.options[m.options.length - 1], cls: 'S' };
}
