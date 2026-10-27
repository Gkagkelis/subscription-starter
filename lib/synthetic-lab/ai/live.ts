// ============================================================
// Ελεγχόμενες κλήσεις AI για live mode.
//  - Όριο κόστους ανά μελέτη: πριν από κάθε κλήση ελέγχεται ότι
//    spent + εκτίμηση κλήσης ≤ cap, και ότι η προβολή (spent/ολοκληρωμένα ×
//    σύνολο) δεν ξεπερνά το cap (ιδέα CostGate από το Althing, MIT).
//  - Ημερήσιο όριο κόστους (αποθηκεύεται στον ιδιωτικό φάκελο).
//  - Όριο ταυτόχρονων κλήσεων (semaphore), retries από το SDK.
//  - Ακύρωση μέσω AbortController (registry ανά run id).
//  - Καταγραφή κάθε κλήσης (χωρίς περιεχόμενο προσωπικών δεδομένων).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dataPath } from '../storage/paths';
import { appendLog } from '../storage/file-store';
import { costUsd, liveConfig, type LiveModelId } from './config';

export class BudgetExceededError extends Error {}
export class RunCancelledError extends Error {}

const controllers = new Map<string, AbortController>();

export function registerRun(runId: string): AbortController {
  const c = new AbortController();
  controllers.set(runId, c);
  return c;
}

export function cancelRun(runId: string): boolean {
  const c = controllers.get(runId);
  if (!c) return false;
  c.abort();
  return true;
}

export function finishRun(runId: string) {
  controllers.delete(runId);
}

// ---------------- Ρυθμός εκτελέσεων ----------------
const runStarts: number[] = [];
export function checkRateLimit(): { ok: boolean; message?: string } {
  const now = Date.now();
  while (runStarts.length && now - runStarts[0] > 3600_000) runStarts.shift();
  const cfg = liveConfig();
  if (runStarts.length >= cfg.runsPerHour) {
    return { ok: false, message: `Όριο ${cfg.runsPerHour} live εκτελέσεων ανά ώρα. Δοκίμασε αργότερα.` };
  }
  runStarts.push(now);
  return { ok: true };
}

// ---------------- Ημερήσια δαπάνη ----------------
function spendFile() {
  return dataPath('logs', `spend-${new Date().toISOString().slice(0, 10)}.json`);
}
export function spentToday(): number {
  const f = spendFile();
  if (!existsSync(f)) return 0;
  try {
    return Number(JSON.parse(readFileSync(f, 'utf8')).usd) || 0;
  } catch {
    return 0;
  }
}
function addSpend(usd: number) {
  writeFileSync(spendFile(), JSON.stringify({ usd: spentToday() + usd }));
}

// ---------------- Budget ανά μελέτη ----------------
export class StudyBudget {
  spent = 0;
  inputTokens = 0;
  outputTokens = 0;
  calls = 0;
  completedUnits = 0;
  constructor(
    public capUsd: number,
    public totalUnits: number,
    public model: LiveModelId
  ) {}

  /** Έλεγχος πριν από κλήση. estimateUsd = εκτίμηση κόστους της επόμενης κλήσης. */
  check(estimateUsd: number) {
    const cfg = liveConfig();
    if (spentToday() + estimateUsd > cfg.dailyCapUsd) {
      throw new BudgetExceededError(`Ξεπερνιέται το ημερήσιο όριο $${cfg.dailyCapUsd.toFixed(2)}.`);
    }
    if (this.spent + estimateUsd > this.capUsd) {
      throw new BudgetExceededError(`Ξεπερνιέται το όριο κόστους μελέτης $${this.capUsd.toFixed(2)}.`);
    }
    if (this.completedUnits >= 2) {
      const projected = (this.spent / this.completedUnits) * this.totalUnits;
      if (projected > this.capUsd * 1.05) {
        throw new BudgetExceededError(
          `Η προβλεπόμενη δαπάνη ($${projected.toFixed(2)}) ξεπερνά το όριο $${this.capUsd.toFixed(2)} — η εκτέλεση σταματά με μερικά αποτελέσματα.`
        );
      }
    }
  }

  record(inputTokens: number, outputTokens: number) {
    const usd = costUsd(this.model, inputTokens, outputTokens);
    this.spent += usd;
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.calls++;
    addSpend(usd);
    return usd;
  }
}

// ---------------- Semaphore ----------------
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------- Κλήση ----------------
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  return client;
}

/** Για tests: αντικατάσταση client. */
export function setClientForTests(c: unknown) {
  client = c as Anthropic;
}

export interface JsonCallResult<T> {
  data: T | null;
  refused: boolean;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  model: string;
}

/** Εκτίμηση κόστους κλήσης από μήκος κειμένου (~3,5 χαρακτήρες/token για ελληνικά, συντηρητικά). */
export function estimateCallUsd(model: LiveModelId, promptChars: number, maxOutputTokens: number) {
  return costUsd(model, Math.ceil(promptChars / 2.5), maxOutputTokens);
}

export async function callJson<T>(opts: {
  runId: string;
  purpose: string;
  model: LiveModelId;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  budget: StudyBudget;
  signal: AbortSignal;
}): Promise<JsonCallResult<T>> {
  if (opts.signal.aborted) throw new RunCancelledError('Η εκτέλεση ακυρώθηκε.');
  opts.budget.check(estimateCallUsd(opts.model, opts.system.length + opts.user.length, opts.maxTokens));
  const started = Date.now();
  const supportsFallback = opts.model === 'claude-opus-5-5' || opts.model === 'claude-sonnet-5-5';
  try {
    const res = await getClient().beta.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: opts.schema } },
        ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {})
      } as any,
      { signal: opts.signal }
    );
    const msg = res as any;
    const inTok = Number(msg.usage?.input_tokens || 0) + Number(msg.usage?.cache_creation_input_tokens || 0);
    const outTok = Number(msg.usage?.output_tokens || 0);
    const usd = opts.budget.record(inTok, outTok);
    const refused = msg.stop_reason === 'refusal';
    let data: T | null = null;
    if (!refused) {
      const text = (msg.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    appendLog({
      kind: 'live_call',
      runId: opts.runId,
      purpose: opts.purpose,
      model: msg.model || opts.model,
      inputTokens: inTok,
      outputTokens: outTok,
      usd,
      ms: Date.now() - started,
      stop: msg.stop_reason,
      parsed: data !== null
    });
    return { data, refused, inputTokens: inTok, outputTokens: outTok, usd, model: msg.model || opts.model };
  } catch (e: any) {
    if (opts.signal.aborted) throw new RunCancelledError('Η εκτέλεση ακυρώθηκε.');
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    appendLog({ kind: 'live_call_error', runId: opts.runId, purpose: opts.purpose, status, error: String(e?.message || e).slice(0, 300) });
    throw e;
  }
}
