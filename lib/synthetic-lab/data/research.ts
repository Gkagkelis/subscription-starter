// ============================================================
// Δεδομένα ερευνητικής βαθμίδας (research_only).
//
// Αρχεία που επιτρέπονται ΜΟΝΟ για μη εμπορική έρευνα (π.χ. μικροδεδομένα
// διαΝΕΟσις «Τι πιστεύουν οι Έλληνες»). Δεν μπαίνουν ποτέ στο repo: τα
// παράγουν τοπικά scripts στον ιδιωτικό φάκελο <dataRoot>/research/
// (gitignored) και φορτώνονται εδώ κατά την εκτέλεση, αν υπάρχουν.
//
// SYNTHETIC_LAB_LICENSE_MODE:
//   research   (προεπιλογή) -> φορτώνονται, με σήμανση «μόνο για έρευνα»
//   commercial              -> ΔΕΝ φορτώνονται (π.χ. σε εμπορικό προϊόν)
// ============================================================

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import type { PriorMetric } from './noraya-build';
import { dataRoot } from '../storage/paths';

export type LicenseMode = 'research' | 'commercial';

export function licenseMode(): LicenseMode {
  return process.env.SYNTHETIC_LAB_LICENSE_MODE === 'commercial' ? 'commercial' : 'research';
}

/** Ερώτηση πηγής με επιλογές, καθεμία συνδεδεμένη με δείκτη (ποσοστό επιλογής ανά ομάδα). */
export interface ResearchQuestion {
  id: string;
  datasetId: string;
  part?: string;
  variable?: string;
  text: string;
  options: string[];
  dkOptions: string[];
  optionMetrics: Record<string, string>;
  n: number;
  /** Κύματα (έτη) στα οποία τέθηκε η ίδια ερώτηση. */
  years?: number[];
  linked?: { year: number; part: string; var: string; text: string; score: number | null }[];
}

export interface ResearchDataset {
  datasetId: string;
  tier: 'research_only';
  source: string;
  license: string;
  importedAt: string;
  years?: number[];
  questions: ResearchQuestion[];
  metrics: PriorMetric[];
  excludedPolitical?: { var: string; label: string; reason: string }[];
}

interface Loaded {
  datasets: ResearchDataset[];
  metrics: Map<string, PriorMetric>;
  questions: Map<string, ResearchQuestion>;
}

let cache: { key: string; value: Loaded } | null = null;

function researchDir(): string {
  return path.join(dataRoot(), 'research');
}

function load(): Loaded {
  const empty: Loaded = { datasets: [], metrics: new Map(), questions: new Map() };
  if (licenseMode() === 'commercial') return empty;
  const dir = researchDir();
  if (!existsSync(dir)) return empty;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const key = `${dir}|${files.map((f) => `${f}:${statSync(path.join(dir, f)).mtimeMs}`).join(',')}`;
  if (cache?.key === key) return cache.value;
  const out: Loaded = { datasets: [], metrics: new Map(), questions: new Map() };
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ResearchDataset;
      if (d.tier !== 'research_only' || !Array.isArray(d.metrics)) continue;
      out.datasets.push({ ...d, metrics: [], questions: [] });
      for (const m of d.metrics) out.metrics.set(m.metric, { ...m, tier: 'research_only', datasetId: m.datasetId || d.datasetId });
      for (const q of d.questions || []) out.questions.set(q.id, { ...q, datasetId: d.datasetId });
    } catch {
      // κατεστραμμένο/μη έγκυρο αρχείο: αγνοείται
    }
  }
  cache = { key, value: out };
  return out;
}

export function researchMetric(metric: string): PriorMetric | null {
  return load().metrics.get(metric) || null;
}

export function researchMetrics(): PriorMetric[] {
  return Array.from(load().metrics.values());
}

export function researchQuestions(): ResearchQuestion[] {
  return Array.from(load().questions.values());
}

export function researchQuestion(id: string): ResearchQuestion | null {
  return load().questions.get(id) || null;
}

/** Πληροφορίες πηγών (χωρίς τα δεδομένα) για UI/αναφορές. */
export function researchDatasets(): Omit<ResearchDataset, 'metrics' | 'questions'>[] {
  return load().datasets.map(({ metrics: _m, questions: _q, ...rest }) => rest);
}

/** Για tests. */
export function resetResearchCache() {
  cache = null;
}
