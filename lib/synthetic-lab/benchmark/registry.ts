// ============================================================
// BENCHMARK REGISTRY — ιστορικό εκδόσεων, παραμέτρων και επιδόσεων (αναπαραγώγιμο).
//
// <dataRoot>/benchmarks/
//   suite.json            η τρέχουσα σουίτα (με hash)
//   models/<version>.json πειραματικές εκδόσεις μοντέλου (η παραγωγική είναι στον κώδικα)
//   runs/<runId>.json     πλήρη αποτελέσματα εκτελέσεων (ανά item/κελί)
//   history.jsonl         μία γραμμή ανά εκτέλεση/απόφαση (append-only)
//   decisions/<id>.json   αποφάσεις αποδοχής/απόρριψης με τα κριτήρια
// ============================================================

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { dataRoot } from '../storage/paths';
import { PRODUCTION_MODEL, type ModelConfig } from '../engine/model-config';
import type { BenchSuite } from './suite';
import type { ItemResult, RunConfig } from './runner';
import type { GapStat, Summary } from './score';

export function benchDir(...parts: string[]): string {
  const p = path.join(dataRoot(), 'benchmarks', ...parts);
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

function gitCommit(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

export interface StoredRun {
  id: string;
  createdAt: string;
  tag: string;
  commit: string | null;
  suiteVersion: string;
  suiteHash: string;
  model: ModelConfig;
  config: Omit<RunConfig, 'model' | 'itemFilter' | 'onProgress'> & { itemFilter?: string };
  durationMs: number;
  summary: Summary;
  bySplit: Record<string, Summary>;
  byFamily: Record<string, Summary>;
  gaps: GapStat[];
  items: ItemResult[];
}

export function saveSuite(s: BenchSuite) {
  writeFileSync(benchDir('suite.json'), JSON.stringify(s));
}

export function loadSuite(): BenchSuite | null {
  const p = benchDir('suite.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as BenchSuite) : null;
}

export function saveModel(m: ModelConfig) {
  if (m.version === PRODUCTION_MODEL.version) throw new Error('Η παραγωγική έκδοση δεν αποθηκεύεται/αλλάζει από το benchmark.');
  writeFileSync(benchDir('models', `${m.version}.json`), JSON.stringify(m, null, 1));
}

export function loadModel(version: string): ModelConfig | null {
  if (version === PRODUCTION_MODEL.version) return PRODUCTION_MODEL;
  const p = benchDir('models', `${version}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as ModelConfig) : null;
}

export function listModels(): ModelConfig[] {
  const dir = path.dirname(benchDir('models', 'x'));
  return [PRODUCTION_MODEL, ...readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ModelConfig)];
}

export function saveRun(r: Omit<StoredRun, 'commit'>): StoredRun {
  const full: StoredRun = { ...r, commit: gitCommit() };
  writeFileSync(benchDir('runs', `${r.id}.json`), JSON.stringify(full));
  appendHistory({ type: 'run', id: r.id, tag: r.tag, model: r.model.version, mode: r.config.mode, splits: r.config.splits, suiteHash: r.suiteHash, summary: r.summary, bySplit: r.bySplit, commit: full.commit, at: r.createdAt });
  return full;
}

export function loadRun(id: string): StoredRun | null {
  const p = benchDir('runs', `${id}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as StoredRun) : null;
}

export function appendHistory(entry: Record<string, unknown>) {
  appendFileSync(benchDir('history.jsonl'), JSON.stringify(entry) + '\n');
}

export function readHistory(): Record<string, unknown>[] {
  const p = benchDir('history.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function saveDecision(d: Record<string, unknown> & { id: string }) {
  writeFileSync(benchDir('decisions', `${d.id}.json`), JSON.stringify(d, null, 1));
  appendHistory({ type: 'decision', ...d });
}
