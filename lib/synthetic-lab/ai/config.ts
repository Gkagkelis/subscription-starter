// ============================================================
// Live mode (κλήσεις AI) — ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟ από προεπιλογή.
//
// Ενεργοποιείται ΜΟΝΟ αν ισχύουν όλα:
//   SYNTHETIC_LAB_LIVE_AI=true
//   ANTHROPIC_API_KEY (κλειδί development, με όριο δαπάνης στο Console)
//   SYNTHETIC_LAB_LIVE_KEY (μυστικό που στέλνει ο χρήστης στο header
//     x-synthetic-lab-key — ώστε ανώνυμοι επισκέπτες να μη δημιουργούν κόστος)
// Όρια: agents ανά μελέτη, ταυτόχρονες κλήσεις, κόστος ανά μελέτη,
// ημερήσιο κόστος, ρυθμός εκτελέσεων ανά ώρα.
// ============================================================

export const LIVE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (προεπιλογή)', inputPerM: 4, outputPerM: 20 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPerM: 2, outputPerM: 10 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (φθηνότερο)', inputPerM: 0.1, outputPerM: 0.5 }
] as const;
export type LiveModelId = (typeof LIVE_MODELS)[number]['id'];
export const DEFAULT_LIVE_MODEL: LiveModelId = 'claude-opus-5-5';

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export interface LiveConfig {
  enabledByEnv: boolean;
  hasApiKey: boolean;
  hasAccessKey: boolean;
  maxAgents: number;
  maxConcurrency: number;
  costCapUsd: number;
  dailyCapUsd: number;
  runsPerHour: number;
  defaultModel: LiveModelId;
}

export function liveConfig(): LiveConfig {
  const model = (process.env.SYNTHETIC_LAB_MODEL || DEFAULT_LIVE_MODEL) as LiveModelId;
  return {
    enabledByEnv: process.env.SYNTHETIC_LAB_LIVE_AI === 'true',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    hasAccessKey: !!process.env.SYNTHETIC_LAB_LIVE_KEY,
    maxAgents: Math.min(200, num('SYNTHETIC_LAB_MAX_AGENTS', 30)),
    maxConcurrency: Math.min(8, num('SYNTHETIC_LAB_MAX_CONCURRENCY', 3)),
    costCapUsd: num('SYNTHETIC_LAB_COST_CAP_USD', 1),
    dailyCapUsd: num('SYNTHETIC_LAB_DAILY_CAP_USD', 5),
    runsPerHour: num('SYNTHETIC_LAB_RUNS_PER_HOUR', 10),
    defaultModel: LIVE_MODELS.some((m) => m.id === model) ? model : DEFAULT_LIVE_MODEL
  };
}

export function liveAvailable(): boolean {
  const c = liveConfig();
  return c.enabledByEnv && c.hasApiKey && c.hasAccessKey;
}

/** Ελέγχει αν ένα αίτημα δικαιούται live mode. */
export function liveAuthorized(req: Request): boolean {
  if (!liveAvailable()) return false;
  const k = req.headers.get('x-synthetic-lab-key') || '';
  const expected = process.env.SYNTHETIC_LAB_LIVE_KEY || '';
  if (!k || k.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function modelPricing(model: string) {
  return LIVE_MODELS.find((m) => m.id === model) || LIVE_MODELS[0];
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPricing(model);
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

export function liveStatusMessage(): string {
  const c = liveConfig();
  if (!c.enabledByEnv) return 'Demo mode: οι εξωτερικές κλήσεις AI είναι απενεργοποιημένες (SYNTHETIC_LAB_LIVE_AI≠true).';
  if (!c.hasApiKey) return 'Live mode ζητήθηκε αλλά λείπει το ANTHROPIC_API_KEY — λειτουργία demo.';
  if (!c.hasAccessKey) return 'Live mode ζητήθηκε αλλά λείπει το SYNTHETIC_LAB_LIVE_KEY — λειτουργία demo.';
  return `Live mode διαθέσιμο: έως ${c.maxAgents} agents, ${c.maxConcurrency} ταυτόχρονες κλήσεις, όριο $${c.costCapUsd.toFixed(2)} ανά μελέτη, $${c.dailyCapUsd.toFixed(2)} ημερησίως.`;
}
