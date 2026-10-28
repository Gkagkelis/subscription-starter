// ============================================================
// PIE — Στάδιο Α: δημιουργία συνθετικού panel ΠΡΙΝ από οποιαδήποτε ερώτηση.
//
// σκελετός (βαθμονομημένος πληθυσμός: ηλικία, φύλο, μόρφωση, περιοχή, αστικότητα)
//   → άγκυρες με την αλυσίδα του μοντέλου (απασχόληση → εισόδημα → «τα βγάζω πέρα» → τάξη →
//     αυτοτοποθέτηση → προηγούμενη ψήφος → θρησκευτικότητα → ενδιαφέρον για πολιτική)
//   → προσωπικός σπόρος για λανθάνοντα χαρακτηριστικά (θ ανά «μπαταρία» ερωτήσεων).
// Κάθε panel αποθηκεύεται (id, σπόρος, έκδοση μοντέλου, πληθυσμός) και ξαναχρησιμοποιείται χωρίς επαναδημιουργία.
// Δεν αντιγράφεται καμία πραγματική εγγραφή: τα πρόσωπα παράγονται από παραμετρικά μοντέλα.
// ============================================================

import { createRng, deriveSeed, hashString } from '../rng';
import { loadPopulation, selectRespondents } from '../population/store';
import { loadDoc, newId, saveDoc } from '../storage/file-store';
import type { AudienceFilter, Persona } from '../types';
import { demographicsOf, featureVector, loadPersonaModel, nodeProbs, type PersonaAnchors, type PersonaDemographics, type PersonaModel } from './model';

export interface PersonaState {
  personaId: string;
  weight: number;
  demographics: PersonaDemographics;
  anchors: PersonaAnchors;
  /** Προσωπικός σπόρος: από αυτόν παράγονται ντετερμινιστικά τα λανθάνοντα χαρακτηριστικά. */
  pseed: number;
}

export interface SyntheticPanel {
  id: string;
  createdAt: string;
  modelVersion: string;
  modelSnapshot: string;
  populationId: string;
  audience: AudienceFilter;
  size: number;
  seed: number;
  /**
   * Τρόπος επιλογής από τον βαθμονομημένο πληθυσμό. 'pps' (προεπιλογή από pie-runtime-2): πιθανότητα ανάλογη του βάρους
   * βαθμονόμησης, ίσα βάρη — η σύνθεση ακολουθεί τον δηλωμένο πληθυσμό. 'region_srs': απλή τυχαία ανά περιφέρεια
   * (pie-runtime-1· αγνοούσε τα βάρη ηλικίας × φύλου × μόρφωσης — π.χ. πτυχιούχοι ~19% αντί για 23%).
   */
  sampling?: 'pps' | 'region_srs';
  /** Ποιες άγκυρες παράχθηκαν και από ποια δεδομένα (για την αναφορά προέλευσης). */
  anchorSources: { node: string; trainFiles: string[]; wave: string; n: number; pvElection: string | null }[];
  personas: PersonaState[];
  label: 'SYNTHETIC PERSONAS — NOT REAL PEOPLE';
}

const EMPTY: PersonaAnchors = { emp: null, inc6: null, econ4: null, class3: null, lr7: null, lr_none: null, pv: null, believer: null, polint4: null, incq5: null, hhsize5: null };

/** Χαρακτηριστικά νοικοκυριού από τον πληθυσμό (GLOPOP-S, Level B), όταν το μοντέλο δεν έχει αντίστοιχο κόμβο. */
export function householdFromPopulation(p: Persona): { incq5: number | null; hhsize5: number | null } {
  const size = p.householdSize == null ? null : p.householdSize === '1' ? 1 : p.householdSize === '2' ? 2 : p.householdSize === '3-4' ? 3.5 : 5;
  return { incq5: p.incomeQuintile ?? null, hhsize5: size };
}

function sample(p: number[], u: number): number {
  let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i];
    if (u < c) return i;
  }
  return p.length - 1;
}

/** Παράγει τις άγκυρες ενός προσώπου με την αλυσίδα του μοντέλου. */
export function generateAnchors(model: PersonaModel, d: PersonaDemographics, seed: number, household?: { incq5: number | null; hhsize5: number | null }): PersonaAnchors {
  const rng = createRng(seed);
  const a: PersonaAnchors = { ...EMPTY };
  if (household && !model.anchorNodes.some((n) => n.node === 'incq5')) a.incq5 = household.incq5;
  if (household && !model.anchorNodes.some((n) => n.node === 'hhsize5')) a.hhsize5 = household.hhsize5;
  for (const node of model.anchorNodes) {
    const fv = featureVector(d, a);
    const k = sample(nodeProbs(node, fv), rng.next());
    const v = node.categories[k];
    switch (node.node) {
      case 'lr7':
        a.lr_none = v === 'none' ? 1 : 0;
        a.lr7 = v === 'none' ? null : Number(v);
        break;
      case 'inc6':
      case 'econ4':
      case 'class3':
      case 'believer':
      case 'polint4':
      case 'incq5':
      case 'hhsize5':
        (a as unknown as Record<string, number>)[node.node] = Number(v);
        break;
      default:
        (a as unknown as Record<string, string>)[node.node] = v;
    }
  }
  return a;
}

/** Ελάχιστη ηλικία συνθετικού ερωτώμενου PIE: τα μοντέλα εκτιμήθηκαν σε ενήλικες (17+)· παιδιά δεν δημιουργούνται ποτέ. */
export const PIE_MIN_AGE = 17;

/** Κοινό χωρίς ανηλίκους: αν λείπει ή είναι μικρότερο, η ελάχιστη ηλικία γίνεται PIE_MIN_AGE. */
export function adultAudience(a: AudienceFilter | undefined): AudienceFilter {
  const aud = { ...(a || {}) };
  if (aud.minAge == null || aud.minAge < PIE_MIN_AGE) aud.minAge = PIE_MIN_AGE;
  return aud;
}

export function buildPanel(o: {
  modelVersion: string;
  populationId: string;
  size: number;
  seed: number;
  audience?: AudienceFilter;
  save?: boolean;
  personas?: Persona[];
  sampling?: 'pps' | 'region_srs';
}): SyntheticPanel {
  const model = loadPersonaModel(o.modelVersion);
  if (!model) throw new Error(`Το μοντέλο ${o.modelVersion} δεν βρέθηκε.`);
  let selected: { p: Persona; weight: number }[];
  if (o.personas) {
    selected = o.personas.map((p) => ({ p, weight: p.weight }));
  } else {
    const pop = loadPopulation(o.populationId);
    if (!pop) throw new Error(`Ο πληθυσμός ${o.populationId} δεν βρέθηκε.`);
    const sel = selectRespondents(pop, adultAudience(o.audience), o.size, deriveSeed(o.seed, 'pie-sample'), { weighting: o.sampling || 'pps' });
    selected = sel.respondents.map((p) => ({ p, weight: p.weight }));
  }
  const personas = selected.map(({ p, weight }, i) => {
    const d = demographicsOf(p);
    const s = deriveSeed(o.seed, 'pie-persona', p.id, i);
    return { personaId: p.id, weight, demographics: d, anchors: generateAnchors(model, d, s, householdFromPopulation(p)), pseed: hashString(`pseed|${s}`) };
  });
  const panel: SyntheticPanel = {
    id: newId('panel'),
    createdAt: new Date().toISOString(),
    modelVersion: model.version,
    modelSnapshot: model.dataSnapshot,
    populationId: o.populationId,
    audience: o.personas ? o.audience || {} : adultAudience(o.audience),
    sampling: o.personas ? undefined : o.sampling || 'pps',
    size: personas.length,
    seed: o.seed,
    anchorSources: model.anchorNodes.map((n) => ({ node: n.node, trainFiles: n.trainFiles, wave: n.wave, n: n.n, pvElection: n.pvElection })),
    personas,
    label: 'SYNTHETIC PERSONAS — NOT REAL PEOPLE'
  };
  if (o.save !== false) saveDoc('panels', panel.id, panel);
  return panel;
}

export function loadPanel(id: string): SyntheticPanel | null {
  return loadDoc<SyntheticPanel>('panels', id);
}

/** Λανθάνον χαρακτηριστικό θ ~ N(0,1) για ένα κλειδί «μπαταρίας»: ίδιο πρόσωπο + ίδιο κλειδί → ίδια τιμή. */
export function theta(pseed: number, key: string): number {
  return createRng(hashString(`theta|${pseed}|${key}`)).normal();
}
