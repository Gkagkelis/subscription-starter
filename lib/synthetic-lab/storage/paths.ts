// Ιδιωτικός χώρος δεδομένων του Lab (ΟΧΙ στον δημόσιο φάκελο public/).
// Προεπιλογή: <project>/.synthetic-lab-data (στο .gitignore).
// Σε read-only περιβάλλον (π.χ. serverless) γίνεται fallback σε os.tmpdir().

import { accessSync, constants, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let resolved: string | null = null;

export function dataRoot(): string {
  if (resolved) return resolved;
  const preferred = process.env.SYNTHETIC_LAB_DATA_DIR || path.join(process.cwd(), '.synthetic-lab-data');
  try {
    mkdirSync(preferred, { recursive: true });
    accessSync(preferred, constants.W_OK);
    resolved = preferred;
  } catch {
    resolved = path.join(os.tmpdir(), 'synthetic-lab-data');
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function dataPath(...parts: string[]): string {
  const p = path.join(dataRoot(), ...parts);
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

/** Για tests: επαναφορά της cache της διαδρομής. */
export function resetDataRootCache() {
  resolved = null;
}
