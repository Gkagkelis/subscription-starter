// Viewscope v2 — κατάσταση προσώπου (δημογραφικά + άγκυρες PIE) για τους ερωτώμενους ΟΠΟΙΑΣΔΗΠΟΤΕ εκτέλεσης.
// Για εκτελέσεις PIE αναπαράγεται ακριβώς το panel του μηχανισμού (ίδιος σπόρος/παραγωγή)· για τις υπόλοιπες, οι άγκυρες
// παράγονται ντετερμινιστικά με την ίδια αλυσίδα PIE πάνω στα πρόσωπα του δείγματος. Καμία αλλαγή στην PIE.
import { deriveSeed, hashString } from '../rng';
import { loadPopulation } from '../population/store';
import { demographicsOf, loadPersonaModel, type PersonaModel } from '../persona/model';
import { buildPanel, generateAnchors, householdFromPopulation, type PersonaState } from '../persona/panel';
import type { Persona, StudyRun } from '../types';

export const CORE_MODEL_VERSION = 'pie-0.7';

export function corePanelFor(run: StudyRun, seed: number, modelVersion = CORE_MODEL_VERSION): { model: PersonaModel; states: Map<string, PersonaState>; reproducedPie: boolean } {
  const model = loadPersonaModel(run.personaRun?.modelVersion || modelVersion);
  if (!model) throw new Error(`Το μοντέλο ${modelVersion} δεν βρέθηκε.`);
  const states = new Map<string, PersonaState>();
  if (run.personaRun) {
    const panel = buildPanel({ modelVersion: model.version, populationId: run.populationId, size: run.plan.sampleSize, seed: deriveSeed(seed, 'panel'), audience: run.plan.audience, save: false });
    panel.personas.forEach((ps) => states.set(ps.personaId, ps));
    const same = run.respondents.every((r) => states.has(r.personaId));
    if (same) return { model, states, reproducedPie: true };
    states.clear();
  }
  const pop = loadPopulation(run.populationId);
  const byId = new Map<string, Persona>((pop?.personas || []).map((p) => [p.id, p]));
  run.respondents.forEach((r, i) => {
    const p = byId.get(r.personaId.split('~')[0]);
    if (!p) return;
    const d = demographicsOf(p);
    const s = deriveSeed(seed, 'vs2-core', r.personaId, i);
    states.set(r.personaId, { personaId: r.personaId, weight: r.weight, demographics: d, anchors: generateAnchors(model, d, s, householdFromPopulation(p)), pseed: hashString(`pseed|${s}`) });
  });
  return { model, states, reproducedPie: false };
}
