// ============================================================
// LLM responder (live mode). Μία κλήση ανά συνθετικό ερωτώμενο για όλο το
// ερωτηματολόγιο (ιδέα audiencekit, Apache-2.0 — ανεξάρτητη υλοποίηση).
//  - Το προφίλ προέρχεται από εγγραφή GLOPOP-S (όχι επινοημένη persona).
//  - Όπου υπάρχει εμπειρικό prior, δίνεται ως πλαίσιο (ιδέα CivicSim).
//  - Η σειρά επιλογών ανακατεύεται ανά ερωτώμενο και αποκωδικοποιείται
//    (counterbalancing, ιδέα synthetic-society, MIT).
//  - Απαντήσεις εκτός λεξιλογίου «κουμπώνουν» στην πλησιέστερη επιλογή ή
//    σημειώνονται ως άκυρες.
// ============================================================

import { createRng, deriveSeed } from '../rng';
import type { Persona, Question, SyntheticAnswer } from '../types';
import { callJson, type StudyBudget } from '../ai/live';
import type { LiveModelId } from '../ai/config';
import { describePersonaLong } from './persona-text';
import type { PriorFit } from './prior-model';
import { getMetric } from '../data/noraya';

export const LLM_PROMPT_VERSION = 'llm-respondent-1.0';

const SYSTEM = `Προσομοιώνεις έναν ΣΥΝΘΕΤΙΚΟ ερωτώμενο για προκαταρκτική έρευνα. Δεν είσαι πραγματικό πρόσωπο και οι απαντήσεις σου ΔΕΝ είναι ανθρώπινα δεδομένα.
Κανόνες:
- Απάντησε όπως θα απαντούσε εύλογα κάποιος με το δοσμένο δημογραφικό προφίλ στην Ελλάδα. Μην υπερβάλλεις και μην επινοείς ακραία συμπεριφορά.
- Αν δίνονται εμπειρικά στοιχεία ομάδας, λάβε τα υπόψη ως συχνότητες ομάδας — όχι ως βεβαιότητα για το άτομο.
- Αν δεν έχεις βάση, προτίμησε μετριοπαθείς απαντήσεις και δήλωσέ το στο rationale.
- Χρησιμοποίησε ΑΚΡΙΒΩΣ τα κείμενα επιλογών που δίνονται.
- Γράψε στα ελληνικά, σύντομα.`;

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question_id', 'choice', 'choices', 'scale_index', 'ranking', 'text', 'accepted_prices', 'rationale'],
        properties: {
          question_id: { type: 'string' },
          choice: { type: ['string', 'null'] },
          choices: { type: ['array', 'null'], items: { type: 'string' } },
          scale_index: { type: ['integer', 'null'] },
          ranking: { type: ['array', 'null'], items: { type: 'string' } },
          text: { type: ['string', 'null'] },
          accepted_prices: { type: ['array', 'null'], items: { type: 'number' } },
          rationale: { type: 'string' }
        }
      }
    }
  }
} as const;

interface RawAnswer {
  question_id: string;
  choice: string | null;
  choices: string[] | null;
  scale_index: number | null;
  ranking: string[] | null;
  text: string | null;
  accepted_prices: number[] | null;
  rationale: string;
}

function snap(value: string | null | undefined, options: string[]): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === v);
  if (exact) return exact;
  const partial = options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase()));
  return partial || null;
}

function renderQuestion(q: Question, order: string[]): string {
  const lines = [`[${q.id}] (${q.type}) ${q.text}`];
  if (q.type === 'likert' || q.type === 'concept_test') {
    const sc = q.scale || ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'];
    lines.push(`Κλίμακα (scale_index 0..${sc.length - 1}): ${sc.map((s, i) => `${i}=${s}`).join(', ')}`);
  } else if (q.type === 'price_test') {
    lines.push(`Σημεία τιμής (€): ${(q.pricePoints || []).join(', ')} — στο accepted_prices βάλε όσες τιμές θα αγόραζες.`);
  } else if (q.type === 'product_comparison') {
    lines.push('Επιλογές (choice = μία, ranking = όλες με σειρά προτίμησης):');
    order.forEach((label) => {
      const pr = (q.products || []).find((x) => x.label === label);
      lines.push(`- ${label}${pr?.price != null ? ` — ${pr.price}€` : ''}${pr?.description ? ` — ${pr.description}` : ''}`);
    });
  } else if (order.length) {
    const field = q.type === 'multiple_choice' ? 'choices' : q.type === 'ranking' ? 'ranking' : 'choice';
    lines.push(`Επιλογές (${field}): ${order.map((o) => `«${o}»`).join(', ')}`);
  } else if (q.type === 'open_ended') {
    lines.push('Απάντηση σε 1-2 προτάσεις στο text.');
  }
  return lines.join('\n');
}

export async function llmRespond(opts: {
  runId: string;
  persona: Persona;
  questions: Question[];
  priorFits: Record<string, PriorFit>;
  stimulus?: string | null;
  model: LiveModelId;
  budget: StudyBudget;
  signal: AbortSignal;
  seed: number;
}): Promise<{ answers: SyntheticAnswer[]; usd: number }> {
  const { persona: p, questions } = opts;
  const rng = createRng(deriveSeed(opts.seed, p.id, 'order'));
  const orders = new Map<string, string[]>();
  questions.forEach((q) => {
    const base = q.type === 'product_comparison' ? (q.products || []).map((x) => x.label) : q.options || [];
    orders.set(q.id, rng.shuffle([...base]));
  });

  const evidence = questions
    .filter((q) => q.evidenceLink && opts.priorFits[q.evidenceLink.metric]?.p.has(p.id))
    .map((q) => {
      const fit = opts.priorFits[q.evidenceLink!.metric];
      const m = getMetric(fit.metric);
      return `- ${m?.label || fit.metric}: σε άτομα με παρόμοια χαρακτηριστικά, εκτιμάται ότι περίπου ${(fit.p.get(p.id)! * 100).toFixed(0)}% απαντούν «${q.evidenceLink!.positiveOption}» (εκτίμηση από Eurobarometer ${fit.waveKey}).`;
    });

  const user = [
    `ΠΡΟΦΙΛ (από συνθετικό πληθυσμό GLOPOP-S, έτος αναφοράς ${p.dataVintage}): ${describePersonaLong(p)}.`,
    'Άγνωστα χαρακτηριστικά: απασχόληση/επάγγελμα — μην τα υποθέτεις ως γεγονός.',
    evidence.length ? `ΕΜΠΕΙΡΙΚΑ ΣΤΟΙΧΕΙΑ ΟΜΑΔΑΣ:\n${evidence.join('\n')}` : 'Δεν υπάρχουν εμπειρικά στοιχεία ομάδας για αυτές τις ερωτήσεις.',
    opts.stimulus ? `ΥΠΟ ΑΞΙΟΛΟΓΗΣΗ:\n${opts.stimulus}` : '',
    'ΕΡΩΤΗΣΕΙΣ:',
    ...questions.map((q) => renderQuestion(q, orders.get(q.id) || [])),
    'Επέστρεψε μία εγγραφή ανά question_id. Πεδία που δεν αφορούν την ερώτηση = null.'
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await callJson<{ answers: RawAnswer[] }>({
    runId: opts.runId,
    purpose: 'survey_respondent',
    model: opts.model,
    system: SYSTEM,
    user,
    schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500 + 250 * questions.length,
    budget: opts.budget,
    signal: opts.signal
  });

  const byId = new Map((res.data?.answers || []).map((a) => [a.question_id, a]));
  const answers: SyntheticAnswer[] = questions.map((q) => {
    const raw = byId.get(q.id);
    if (!raw || res.refused) return { questionId: q.id, value: null, skipped: true, basis: 'llm', unsupported: true, rationale: res.refused ? 'Άρνηση μοντέλου' : 'Χωρίς έγκυρη απάντηση' };
    const opts2 = q.type === 'product_comparison' ? (q.products || []).map((x) => x.label) : q.options || [];
    const base: SyntheticAnswer = { questionId: q.id, value: null, skipped: false, basis: 'llm', rationale: raw.rationale, unsupported: !q.evidenceLink };
    switch (q.type) {
      case 'single_choice': {
        const c = snap(raw.choice, opts2);
        return c ? { ...base, value: { choice: c } } : { ...base, skipped: true };
      }
      case 'product_comparison': {
        const ranking = (raw.ranking || []).map((r) => snap(r, opts2)).filter((x): x is string => !!x);
        const c = snap(raw.choice, opts2) || ranking[0] || null;
        return c ? { ...base, value: { choice: c, ranking } } : { ...base, skipped: true };
      }
      case 'multiple_choice': {
        const cs = Array.from(new Set((raw.choices || []).map((c) => snap(c, opts2)).filter((x): x is string => !!x)));
        return { ...base, value: { choices: cs.slice(0, q.maxSelections || cs.length) } };
      }
      case 'ranking': {
        const r = Array.from(new Set((raw.ranking || []).map((c) => snap(c, opts2)).filter((x): x is string => !!x)));
        opts2.forEach((o) => !r.includes(o) && r.push(o));
        return { ...base, value: { ranking: r } };
      }
      case 'likert':
      case 'concept_test': {
        const k = (q.scale || [1, 2, 3, 4, 5]).length;
        const s = raw.scale_index;
        return typeof s === 'number' && s >= 0 && s < k ? { ...base, value: { scaleIndex: Math.round(s) } } : { ...base, skipped: true };
      }
      case 'price_test': {
        const acc: Record<string, boolean> = {};
        const set = new Set((raw.accepted_prices || []).map(Number));
        (q.pricePoints || []).forEach((pp) => (acc[String(pp)] = set.has(pp)));
        return { ...base, value: { priceAcceptance: acc } };
      }
      case 'open_ended':
        return raw.text ? { ...base, value: { text: raw.text }, unsupported: true } : { ...base, skipped: true };
    }
  });
  return { answers, usd: res.usd };
}
