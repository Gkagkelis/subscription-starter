// ============================================================
// SYNTHETIC FOCUS GROUP ENGINE
//
// Ιδέες (ανεξάρτητη υλοποίηση):
//  - MicroCrowd (MIT): moderator, ισορροπία συμμετοχής, έλεγχος ότι οι
//    αναφορές σε άλλους ομιλητές υπάρχουν πράγματι στο transcript.
//  - Althing (MIT): checkpoint μετά από κάθε βήμα -> pause/resume·
//    σύνθεση σε themes / agreements / disagreements / surprises.
//  - FocusGroup (MIT): οδηγός συζήτησης σε φάσεις, call-on σιωπηλών.
//  - Stanford GenAgents (MIT): σταθερή persona με μνήμη όσων έχει πει.
// Δεν επιβάλλεται τεχνητή διαφωνία: οι θέσεις προκύπτουν από το μοντέλο
// (demo: διαφανείς κανόνες· live: AI) και η διαφωνία εμφανίζεται μόνο αν
// υπάρχει.
// ============================================================

import { liveConfig, type LiveModelId } from '../ai/config';
import { BudgetExceededError, callJson, RunCancelledError, StudyBudget } from '../ai/live';
import { loadPopulation, selectRespondents } from '../population/store';
import { createRng, deriveSeed } from '../rng';
import { mean, round, sd } from '../stats';
import { loadDoc, newId, saveDoc } from '../storage/file-store';
import type { Assumption, AudienceFilter, CostRecord, EngineMode, Persona, ResearchDomain } from '../types';
import { SIMULATED_LABEL } from '../types';
import { defaultAssumptions } from './assumptions';
import { demoRespond } from './demo-responder';
import { checkQuestionnaire } from './guardrails';
import { describePersonaLong, describePersonaShort, participantAlias } from './persona-text';

export const FOCUS_ENGINE_VERSION = 'focus-1.0';

export interface FocusParticipant {
  alias: string;
  personaId: string;
  persona: Persona;
  description: string;
  /** Θέση ανά ερώτηση οδηγού (-2..2), όπως προέκυψε. */
  stances: Record<number, number>;
  turns: number;
}

export interface TranscriptEntry {
  id: string;
  index: number;
  speaker: string; // 'Συντονιστής' ή alias
  role: 'moderator' | 'participant';
  kind: 'question' | 'answer' | 'probe' | 'call_on' | 'closing';
  guideIndex: number;
  text: string;
  stance?: number | null;
  references?: string[];
  flags: { simulated: true; unsupported: boolean; invalidReference: boolean; novel?: boolean };
  basis: 'template' | 'llm' | 'guide';
}

export interface FocusSynthesis {
  themes: { theme: string; mentions: number; participants: string[] }[];
  convergence: string[];
  divergence: string[];
  surprises: string[];
  unsupportedShare: number;
  invalidReferences: number;
  evidenceKind: 'simulation' | 'ai';
}

export interface FocusSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'blocked';
  label: typeof SIMULATED_LABEL;
  topic: string;
  domain: ResearchDomain;
  guide: string[];
  rounds: number;
  mode: EngineMode;
  model: LiveModelId | null;
  engineVersion: string;
  seed: number;
  populationId: string;
  populationNote: string;
  audience: AudienceFilter;
  assumptions: Assumption[];
  participants: FocusParticipant[];
  transcript: TranscriptEntry[];
  /** Σειρά των βημάτων που απομένουν (σχέδιο συζήτησης). */
  plan: { guideIndex: number; kind: TranscriptEntry['kind']; speaker: string }[];
  cursor: number;
  cost: CostRecord;
  synthesis: FocusSynthesis | null;
  warnings: string[];
}

const MODERATOR = 'Συντονιστής';

function buildPlan(guide: string[], participants: FocusParticipant[], rounds: number, seed: number): FocusSession['plan'] {
  const plan: FocusSession['plan'] = [];
  const rng = createRng(deriveSeed(seed, 'turns'));
  guide.forEach((_, gi) => {
    plan.push({ guideIndex: gi, kind: 'question', speaker: MODERATOR });
    for (let r = 0; r < rounds; r++) {
      // Διαφορετική σειρά σε κάθε γύρο ώστε να μη μιλά πάντα πρώτος ο ίδιος.
      const order = rng.shuffle(participants.map((p) => p.alias));
      if (r > 0) plan.push({ guideIndex: gi, kind: 'probe', speaker: MODERATOR });
      order.forEach((alias) => plan.push({ guideIndex: gi, kind: 'answer', speaker: alias }));
    }
  });
  plan.push({ guideIndex: guide.length - 1, kind: 'closing', speaker: MODERATOR });
  return plan;
}

export interface CreateFocusOptions {
  topic: string;
  domain: ResearchDomain;
  guide: string[];
  participants?: number;
  rounds?: number;
  populationId: string;
  audience?: AudienceFilter;
  mode?: EngineMode;
  model?: LiveModelId;
  costCapUsd?: number;
  seed?: number;
  assumptions?: Assumption[];
  price?: number | null;
}

export function createFocusGroup(o: CreateFocusOptions): FocusSession {
  const id = newId('fg');
  const seed = o.seed ?? (Date.now() % 1_000_000);
  const cfg = liveConfig();
  const mode = o.mode || 'demo';
  const pop = loadPopulation(o.populationId);
  if (!pop) throw new Error('Ο πληθυσμός δεν βρέθηκε.');
  const guide = o.guide.map((g) => g.trim()).filter(Boolean).slice(0, 8);
  const now = new Date().toISOString();
  const base: FocusSession = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    label: SIMULATED_LABEL,
    topic: o.topic,
    domain: o.domain,
    guide,
    rounds: Math.max(1, Math.min(3, o.rounds ?? 1)),
    mode,
    model: mode === 'live' ? o.model || cfg.defaultModel : null,
    engineVersion: FOCUS_ENGINE_VERSION,
    seed,
    populationId: o.populationId,
    populationNote: pop.summary.isDevFixture ? pop.summary.updateStatus.message : `${pop.summary.name} — ${pop.summary.updateStatus.message}`,
    audience: o.audience || { minAge: 15 },
    assumptions: o.assumptions || defaultAssumptions(o.domain, o.price ?? null),
    participants: [],
    transcript: [],
    plan: [],
    cursor: 0,
    cost: { mode, model: mode === 'live' ? o.model || cfg.defaultModel : null, inputTokens: 0, outputTokens: 0, usd: 0, capUsd: mode === 'live' ? o.costCapUsd ?? cfg.costCapUsd : 0, calls: 0 },
    synthesis: null,
    warnings: []
  };

  const guard = checkQuestionnaire(o.topic, guide.map((g) => ({ text: g })));
  if (!guard.allowed) {
    base.status = 'blocked';
    base.warnings.push(...guard.blockedReasons);
    saveDoc('focus-groups', id, base);
    return base;
  }
  base.warnings.push(...guard.warnings);
  if (!guide.length) throw new Error('Χρειάζεται τουλάχιστον μία ερώτηση στον οδηγό συζήτησης.');

  const n = Math.max(3, Math.min(8, o.participants ?? 6));
  // Ενήλικοι/έφηβοι 15+ με ποικιλία: στρωματοποιημένη επιλογή.
  const sel = selectRespondents(pop, base.audience, n, deriveSeed(seed, 'fg-sample'));
  base.warnings.push(...sel.warnings);
  base.participants = sel.respondents.map((p, i) => ({
    alias: participantAlias(i),
    personaId: p.id,
    persona: p,
    description: describePersonaLong(p),
    stances: {},
    turns: 0
  }));
  base.plan = buildPlan(guide, base.participants, base.rounds, seed);
  if (base.mode === 'live') {
    const est = base.plan.filter((x) => x.kind === 'answer').length;
    base.warnings.push(`Live mode: έως ${est} κλήσεις AI, όριο κόστους $${base.cost.capUsd.toFixed(2)}.`);
  }
  base.warnings.push('Οι συμμετέχοντες είναι ΣΥΝΘΕΤΙΚΑ προφίλ — δεν είναι πραγματικοί καταναλωτές ή πολίτες.');
  saveDoc('focus-groups', id, base);
  return base;
}

export function loadFocusGroup(id: string): FocusSession | null {
  return loadDoc<FocusSession>('focus-groups', id);
}

// ------------------------------------------------------------
// Demo κείμενα
// ------------------------------------------------------------

const STANCE_OPENERS: Record<number, string[]> = {
  2: ['Μου αρέσει αρκετά.', 'Το βλέπω θετικά.', 'Ειλικρινά, θα με ενδιέφερε.'],
  1: ['Έχει ενδιαφέρον, με κάποιες επιφυλάξεις.', 'Κατά βάση θετικά, αλλά θέλω να δω λεπτομέρειες.'],
  0: ['Δεν έχω καταλήξει.', 'Εξαρτάται από το πώς θα εφαρμοστεί.', 'Ούτε θετικά ούτε αρνητικά, για την ώρα.'],
  [-1]: ['Έχω αρκετές αμφιβολίες.', 'Δεν είμαι πεπεισμένος/η.'],
  [-2]: ['Δεν με βρίσκει σύμφωνο/η.', 'Δεν νομίζω ότι είναι για μένα.']
};

function featureRemark(p: Persona, domain: ResearchDomain, rng: ReturnType<typeof createRng>): string {
  const opts: string[] = [];
  if (p.incomeQuintile !== null && p.incomeQuintile <= 2) opts.push(domain === 'consumer' ? 'Με τον προϋπολογισμό που έχω, κάθε ευρώ μετράει.' : 'Με απασχολεί αν θα βοηθήσει όσους δυσκολεύονται οικονομικά.');
  if (p.incomeQuintile !== null && p.incomeQuintile >= 4) opts.push(domain === 'consumer' ? 'Για μένα η ποιότητα μετράει περισσότερο από τη διαφορά στην τιμή.' : 'Θέλω να ξέρω πόσο θα κοστίσει συνολικά και ποιος θα το πληρώσει.');
  if (p.householdType.includes('children')) opts.push('Σκέφτομαι πρώτα τι σημαίνει για την οικογένεια.');
  if (p.settlement === 'rural') opts.push('Στην περιοχή μου τέτοια πράγματα συχνά φτάνουν αργότερα ή δεν φτάνουν καθόλου.');
  if (p.ageBand === '65+') opts.push('Θα ήθελα να είναι απλό και να μπορώ να ρωτήσω κάποιον αν χρειαστώ βοήθεια.');
  if (p.ageBand === '15-24' || p.ageBand === '25-34') opts.push('Θα το σύγκρινα πρώτα με εναλλακτικές online.');
  if (p.education === 'tertiary') opts.push('Θα ήθελα να δω στοιχεία ότι λειτουργεί.');
  if (!opts.length) opts.push('Θα ήθελα να το δω στην πράξη πριν πω κάτι οριστικό.');
  return rng.pick(opts);
}

function stanceFor(s: FocusSession, part: FocusParticipant, gi: number): number {
  if (part.stances[gi] !== undefined) return part.stances[gi];
  // Θέση = απάντηση σε κρυφή ερώτηση ενδιαφέροντος/στήριξης (demo μοντέλο),
  // με μικρή συσχέτιση μεταξύ ερωτήσεων του οδηγού (σταθερή persona).
  const q = { id: `fg-${gi}`, type: 'concept_test' as const, text: s.guide[gi] };
  const a = demoRespond(part.persona, [q], { seed: deriveSeed(s.seed, 'stance', gi), assumptions: s.assumptions, priorFits: {} })[0];
  const raw = (a.value?.scaleIndex ?? 2) - 2;
  const prevVals = Object.values(part.stances);
  const anchored = prevVals.length ? Math.round(0.5 * raw + 0.5 * mean(prevVals)) : raw;
  part.stances[gi] = Math.max(-2, Math.min(2, anchored));
  return part.stances[gi];
}

function demoUtterance(s: FocusSession, part: FocusParticipant, gi: number, kind: TranscriptEntry['kind']): Omit<TranscriptEntry, 'id' | 'index'> {
  const rng = createRng(deriveSeed(s.seed, part.alias, gi, s.transcript.length));
  const stance = stanceFor(s, part, gi);
  const parts: string[] = [];
  const refs: string[] = [];
  // Αναφορά σε προηγούμενο ομιλητή της ίδιας ερώτησης (μόνο αν υπάρχει).
  const earlier = s.transcript.filter((t) => t.role === 'participant' && t.guideIndex === gi && t.speaker !== part.alias);
  if (earlier.length && rng.next() < 0.45) {
    const ref = rng.pick(earlier);
    const diff = Math.abs((ref.stance ?? 0) - stance);
    parts.push(diff <= 1 ? `Συμφωνώ με ${ref.speaker} σε αυτό.` : `Το βλέπω διαφορετικά από ${ref.speaker}.`);
    refs.push(ref.speaker);
  }
  parts.push(rng.pick(STANCE_OPENERS[stance]));
  parts.push(featureRemark(part.persona, s.domain, rng));
  return {
    speaker: part.alias,
    role: 'participant',
    kind,
    guideIndex: gi,
    text: parts.join(' '),
    stance,
    references: refs,
    flags: { simulated: true, unsupported: true, invalidReference: false },
    basis: 'template'
  };
}

function moderatorText(s: FocusSession, gi: number, kind: TranscriptEntry['kind']): string {
  if (kind === 'question') return gi === 0 ? `Καλησπέρα σε όλους. Θέμα μας: «${s.topic}». ${s.guide[gi]}` : s.guide[gi];
  if (kind === 'closing') return 'Σας ευχαριστώ. Πριν κλείσουμε: υπάρχει κάτι που δεν ειπώθηκε και θεωρείτε σημαντικό;';
  // probe: απευθύνεται στον λιγότερο ενεργό ή στην πιο απομακρυσμένη θέση
  const quiet = [...s.participants].sort((a, b) => a.turns - b.turns)[0];
  return `${quiet.alias}, θα ήθελα να ακούσω λίγο περισσότερο τη δική σας οπτική. Και οι υπόλοιποι: αλλάξατε γνώμη από όσα ακούσατε;`;
}

// ------------------------------------------------------------
// Live κείμενα
// ------------------------------------------------------------

const LIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'stance', 'references', 'new_idea'],
  properties: {
    text: { type: 'string' },
    stance: { type: 'integer' },
    references: { type: 'array', items: { type: 'string' } },
    new_idea: { type: 'boolean' }
  }
} as const;

async function liveUtterance(
  s: FocusSession,
  part: FocusParticipant,
  gi: number,
  kind: TranscriptEntry['kind'],
  budget: StudyBudget,
  signal: AbortSignal
): Promise<Omit<TranscriptEntry, 'id' | 'index'>> {
  const window = s.transcript.slice(-12).map((t) => `${t.speaker}: ${t.text}`).join('\n');
  const own = s.transcript.filter((t) => t.speaker === part.alias).slice(-3).map((t) => t.text).join(' | ');
  const system = `Υποδύεσαι ΣΥΝΘΕΤΙΚΟ συμμετέχοντα (${part.alias}) σε προσομοιωμένο focus group για προκαταρκτική έρευνα. Δεν είσαι πραγματικό πρόσωπο.
Μίλα φυσικά, σε 1-3 προτάσεις, στα ελληνικά. Μην συμφωνείς ή διαφωνείς τεχνητά — πες ό,τι θα έλεγε εύλογα κάποιος με αυτό το προφίλ. Μην επινοείς προσωπικά γεγονότα ως βέβαια· μην αναφέρεσαι σε κόμματα ή πολιτικά πρόσωπα.
Αν αναφέρεσαι σε άλλο συμμετέχοντα, χρησιμοποίησε ΜΟΝΟ ονόματα που εμφανίζονται στη συζήτηση (π.χ. Σ2) και βάλε τα στο references.
stance: -2 (πολύ αρνητικά) έως 2 (πολύ θετικά). new_idea: true αν φέρνεις οπτική που δεν έχει ειπωθεί.`;
  const user = [
    `Προφίλ: ${part.description}. Άγνωστα: επάγγελμα/απασχόληση.`,
    own ? `Όσα έχεις πει ήδη: ${own}` : '',
    `Θέμα: ${s.topic}`,
    `Τρέχουσα ερώτηση συντονιστή: ${s.guide[gi]}`,
    window ? `Πρόσφατη συζήτηση:\n${window}` : 'Είσαι από τους πρώτους που μιλούν.'
  ]
    .filter(Boolean)
    .join('\n\n');
  const res = await callJson<{ text: string; stance: number; references: string[]; new_idea: boolean }>({
    runId: s.id,
    purpose: 'focus_participant',
    model: s.model as LiveModelId,
    system,
    user,
    schema: LIVE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1200,
    budget,
    signal
  });
  const spoken = new Set(s.transcript.map((t) => t.speaker));
  const refs = (res.data?.references || []).filter((r) => r !== part.alias);
  const invalid = refs.some((r) => !spoken.has(r)) || /Σ\d+/.test(res.data?.text || '') && (res.data?.text.match(/Σ\d+/g) || []).some((r) => r !== part.alias && !spoken.has(r));
  const stance = Math.max(-2, Math.min(2, Math.round(res.data?.stance ?? 0)));
  part.stances[gi] = stance;
  return {
    speaker: part.alias,
    role: 'participant',
    kind,
    guideIndex: gi,
    text: res.refused ? '[Το μοντέλο αρνήθηκε να απαντήσει]' : res.data?.text || '[Μη έγκυρη απάντηση]',
    stance,
    references: refs.filter((r) => spoken.has(r)),
    flags: { simulated: true, unsupported: true, invalidReference: invalid, novel: !!res.data?.new_idea },
    basis: 'llm'
  };
}

// ------------------------------------------------------------
// Βήματα
// ------------------------------------------------------------

export async function stepFocusGroup(id: string, maxSteps = 1): Promise<FocusSession> {
  const s = loadFocusGroup(id);
  if (!s) throw new Error('Το focus group δεν βρέθηκε.');
  if (s.status === 'completed' || s.status === 'cancelled' || s.status === 'blocked' || s.status === 'paused') return s;
  s.status = 'running';
  const budget = new StudyBudget(s.cost.capUsd, s.plan.filter((x) => x.kind === 'answer').length, (s.model || 'claude-opus-5-5') as LiveModelId);
  budget.spent = s.cost.usd;
  budget.inputTokens = s.cost.inputTokens;
  budget.outputTokens = s.cost.outputTokens;
  budget.calls = s.cost.calls;
  budget.completedUnits = s.transcript.filter((t) => t.role === 'participant').length;
  const ctrl = new AbortController();

  for (let k = 0; k < maxSteps && s.cursor < s.plan.length; k++) {
    const step = s.plan[s.cursor];
    let entry: Omit<TranscriptEntry, 'id' | 'index'>;
    if (step.speaker === MODERATOR) {
      entry = {
        speaker: MODERATOR,
        role: 'moderator',
        kind: step.kind,
        guideIndex: step.guideIndex,
        text: moderatorText(s, step.guideIndex, step.kind),
        flags: { simulated: true, unsupported: false, invalidReference: false },
        basis: 'guide'
      };
    } else {
      const part = s.participants.find((p) => p.alias === step.speaker)!;
      if (s.mode === 'live') {
        try {
          entry = await liveUtterance(s, part, step.guideIndex, step.kind, budget, ctrl.signal);
          budget.completedUnits++;
        } catch (e) {
          if (e instanceof BudgetExceededError || e instanceof RunCancelledError) {
            s.status = 'paused';
            s.warnings.push(`${(e as Error).message} Το focus group τέθηκε σε παύση.`);
            break;
          }
          s.warnings.push(`Σφάλμα AI στη σειρά του ${part.alias}: ${String((e as Error)?.message || e).slice(0, 140)}`);
          s.cursor++;
          continue;
        }
      } else {
        entry = demoUtterance(s, part, step.guideIndex, step.kind);
      }
      part.turns++;
    }
    s.transcript.push({ ...entry, id: `${s.id}-t${s.transcript.length}`, index: s.transcript.length });
    s.cursor++;
  }

  s.cost = { ...s.cost, usd: round(budget.spent, 4), inputTokens: budget.inputTokens, outputTokens: budget.outputTokens, calls: budget.calls };
  if (s.cursor >= s.plan.length) {
    s.status = 'completed';
    s.synthesis = synthesize(s);
  } else if (s.status === 'running') {
    s.synthesis = synthesize(s);
  }
  s.updatedAt = new Date().toISOString();
  saveDoc('focus-groups', s.id, s);
  return s;
}

export function controlFocusGroup(id: string, action: 'pause' | 'resume' | 'cancel'): FocusSession {
  const s = loadFocusGroup(id);
  if (!s) throw new Error('Το focus group δεν βρέθηκε.');
  if (s.status === 'completed' || s.status === 'blocked') return s;
  if (action === 'pause' && (s.status === 'running' || s.status === 'ready')) s.status = 'paused';
  if (action === 'resume' && s.status === 'paused') s.status = 'running';
  if (action === 'cancel') {
    s.status = 'cancelled';
    s.synthesis = synthesize(s);
  }
  s.updatedAt = new Date().toISOString();
  saveDoc('focus-groups', s.id, s);
  return s;
}

// ------------------------------------------------------------
// Σύνθεση
// ------------------------------------------------------------

const THEMES: { theme: string; re: RegExp }[] = [
  { theme: 'Κόστος / τιμή', re: /τιμ|κόστ|ευρώ|προϋπολογισμ|πληρώσ|φθην|ακριβ/i },
  { theme: 'Οικογένεια', re: /οικογέν|παιδι/i },
  { theme: 'Πρόσβαση / περιφέρεια', re: /περιοχή μου|φτάνουν|πρόσβασ|επαρχ|χωρι/i },
  { theme: 'Απλότητα / υποστήριξη', re: /απλό|βοήθεια|υποστήριξ|εύκολ/i },
  { theme: 'Σύγκριση με εναλλακτικές', re: /σύγκρ|εναλλακτικ|online|ανταγων/i },
  { theme: 'Τεκμήρια / αξιοπιστία', re: /στοιχεία|λειτουργεί|στην πράξη|αξιόπιστ|εμπιστ/i },
  { theme: 'Δικαιοσύνη / ποιος ωφελείται', re: /δυσκολεύονται|δίκαι|ωφελ|επιβαρ/i },
  { theme: 'Ποιότητα', re: /ποιότητ/i }
];

export function synthesize(s: FocusSession): FocusSynthesis {
  const answers = s.transcript.filter((t) => t.role === 'participant');
  const themes = THEMES.map((t) => {
    const hits = answers.filter((a) => t.re.test(a.text));
    return { theme: t.theme, mentions: hits.length, participants: Array.from(new Set(hits.map((h) => h.speaker))) };
  })
    .filter((t) => t.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions);

  const convergence: string[] = [];
  const divergence: string[] = [];
  const surprises: string[] = [];
  s.guide.forEach((g, gi) => {
    const st = s.participants.map((p) => p.stances[gi]).filter((x): x is number => typeof x === 'number');
    if (st.length < 3) return;
    const pos = st.filter((x) => x > 0).length / st.length;
    const neg = st.filter((x) => x < 0).length / st.length;
    const label = `«${g.length > 70 ? g.slice(0, 67) + '…' : g}»`;
    if (sd(st) <= 0.8 && (pos >= 0.6 || neg >= 0.6)) convergence.push(`${label}: οι περισσότεροι συνθετικοί συμμετέχοντες κινούνται ${pos >= 0.6 ? 'θετικά' : 'αρνητικά'} (${Math.round(Math.max(pos, neg) * 100)}%).`);
    else if (pos >= 0.25 && neg >= 0.25) divergence.push(`${label}: διχασμένες θέσεις (${Math.round(pos * 100)}% θετικά, ${Math.round(neg * 100)}% αρνητικά).`);
    else convergence.push(`${label}: κυρίως ουδέτερες/μετριοπαθείς θέσεις.`);
    // Απρόσμενο: θέση αντίθετη στην πλειονότητα της ίδιας ηλικιακής ζώνης ή εισοδήματος
    s.participants.forEach((p) => {
      const mine = p.stances[gi];
      if (mine === undefined) return;
      const peers = s.participants.filter((q) => q !== p && (q.persona.ageBand === p.persona.ageBand || q.persona.incomeQuintile === p.persona.incomeQuintile)).map((q) => q.stances[gi]).filter((x): x is number => x !== undefined);
      if (peers.length >= 1 && Math.abs(mean(peers) - mine) >= 2.5) surprises.push(`${p.alias} (${describePersonaShort(p.persona)}) διαφοροποιείται έντονα από προφίλ με παρόμοια χαρακτηριστικά στο ${label}.`);
    });
  });
  answers.filter((a) => a.flags.novel).forEach((a) => surprises.push(`${a.speaker}: νέα οπτική — «${a.text.slice(0, 120)}»`));

  return {
    themes,
    convergence,
    divergence,
    surprises: Array.from(new Set(surprises)).slice(0, 10),
    unsupportedShare: answers.length ? round((answers.filter((a) => a.flags.unsupported).length / answers.length) * 100, 0) : 0,
    invalidReferences: answers.filter((a) => a.flags.invalidReference).length,
    evidenceKind: s.mode === 'live' ? 'ai' : 'simulation'
  };
}

export function transcriptMarkdown(s: FocusSession): string {
  const lines = [
    `# Προσομοιωμένο focus group — ${s.topic}`,
    '',
    `> **${SIMULATED_LABEL}**. Οι συμμετέχοντες είναι συνθετικά προφίλ (${s.populationNote}). Δεν πρόκειται για πραγματικούς ανθρώπους ή συνεντεύξεις.`,
    '',
    `- Λειτουργία: ${s.mode === 'demo' ? 'demo (πρότυπα κειμένου, χωρίς AI)' : `live (${s.model})`}`,
    `- Seed: ${s.seed} · Έκδοση: ${s.engineVersion} · Κόστος: $${s.cost.usd.toFixed(4)}`,
    `- Κατάσταση: ${s.status}`,
    '',
    '## Συμμετέχοντες',
    ...s.participants.map((p) => `- **${p.alias}** — ${p.description} (συνθετικό ID ${p.personaId})`),
    '',
    '## Transcript',
    ...s.transcript.map((t) => `**${t.speaker}**${t.role === 'participant' ? ' _(συνθετικό)_' : ''}: ${t.text}${t.flags.invalidReference ? ' ⚠ μη έγκυρη αναφορά' : ''}`),
    ''
  ];
  if (s.synthesis) {
    lines.push('## Σύνθεση (αυτόματη, μη επικυρωμένη)', '', '### Θέματα', ...s.synthesis.themes.map((t) => `- ${t.theme}: ${t.mentions} αναφορές (${t.participants.join(', ')})`));
    lines.push('', '### Σημεία σύγκλισης', ...s.synthesis.convergence.map((x) => `- ${x}`));
    lines.push('', '### Σημεία απόκλισης', ...(s.synthesis.divergence.length ? s.synthesis.divergence.map((x) => `- ${x}`) : ['- Δεν εντοπίστηκαν.']));
    lines.push('', '### Απρόσμενες υποθέσεις', ...(s.synthesis.surprises.length ? s.synthesis.surprises.map((x) => `- ${x}`) : ['- Δεν εντοπίστηκαν.']));
    lines.push('', `Ατεκμηρίωτες απαντήσεις (χωρίς εμπειρική βάση): ${s.synthesis.unsupportedShare}%.`);
  }
  if (s.warnings.length) lines.push('', '## Προειδοποιήσεις', ...s.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
