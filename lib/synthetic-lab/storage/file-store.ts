// Απλό, ασφαλές JSON store στον ιδιωτικό φάκελο δεδομένων του Lab.
// Ατομικές εγγραφές (tmp + rename). Δεν αγγίζει τη βάση της NORAYA.
// Για παραγωγή: βλ. docs/synthetic-lab/sql/synthetic_lab_schema.sql (ΔΕΝ εφαρμόζεται αυτόματα).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { dataRoot } from './paths';

export type Collection = 'studies' | 'focus-groups' | 'scenarios' | 'validations' | 'datasets' | 'calibration-targets' | 'logs' | 'panels';

const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;

function dir(c: Collection) {
  const d = path.join(dataRoot(), c);
  mkdirSync(d, { recursive: true });
  return d;
}

export function assertSafeId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error('Μη έγκυρο αναγνωριστικό.');
}

export function saveDoc<T>(c: Collection, id: string, doc: T, suffix = '.json'): void {
  assertSafeId(id);
  const file = path.join(dir(c), id + suffix);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc));
  renameSync(tmp, file);
}

export function loadDoc<T>(c: Collection, id: string, suffix = '.json'): T | null {
  if (!SAFE_ID.test(id)) return null;
  const file = path.join(dir(c), id + suffix);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function listDocs<T>(c: Collection, suffix = '.json', limit = 100): T[] {
  const d = dir(c);
  return readdirSync(d)
    .filter((f) => f.endsWith(suffix) && !f.endsWith('.tmp'))
    .map((f) => ({ f, t: statSync(path.join(d, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ f }) => {
      try {
        return JSON.parse(readFileSync(path.join(d, f), 'utf8')) as T;
      } catch {
        return null;
      }
    })
    .filter((x): x is Awaited<T> => x !== null) as T[];
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** Γραμμή καταγραφής (logging) για live κλήσεις AI κ.λπ. */
export function appendLog(entry: Record<string, unknown>) {
  const file = path.join(dir('logs'), `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  try {
    writeFileSync(file, line, { flag: 'a' });
  } catch {
    /* logging δεν πρέπει να σπάει τη ροή */
  }
}
