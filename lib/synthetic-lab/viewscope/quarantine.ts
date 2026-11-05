// Viewscope v2 — Π2: καραντίνα συνόλων δεδομένων με μη επιβεβαιωμένη δομή (π.χ. BankSat).
import { readFileSync } from 'fs';
import path from 'path';

export type DataUse = 'individual_training' | 'individual_validation' | 'correlation_estimation' | 'subgroup_validation' | 'marginal_validation';
interface Q { status: string; forbidden: DataUse[]; allowedWithFlag?: DataUse[]; findings: string[] }
let cfg: Record<string, Q> | null = null;
function load(): Record<string, Q> {
  if (!cfg) cfg = JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'synthetic-lab', 'viewscope', 'dataset-quarantine.json'), 'utf8')).datasets;
  return cfg!;
}
/** Επιστρέφει {allowed, flag} για μια χρήση· οι νέοι κώδικες ΠΡΕΠΕΙ να το καλούν πριν χρησιμοποιήσουν ένα σύνολο δεδομένων. */
export function datasetUse(datasetId: string, use: DataUse): { allowed: boolean; flagged: boolean; reason: string | null } {
  const d = load()[datasetId.toLowerCase()];
  if (!d) return { allowed: true, flagged: false, reason: null };
  if (d.forbidden.includes(use)) return { allowed: false, flagged: true, reason: `${datasetId}: ${d.status} — απαγορεύεται η χρήση «${use}»` };
  return { allowed: true, flagged: !!d.allowedWithFlag?.includes(use), reason: `${datasetId}: ${d.status}` };
}
export function assertDatasetUse(datasetId: string, use: DataUse): void {
  const r = datasetUse(datasetId, use);
  if (!r.allowed) throw new Error(r.reason || 'απαγορευμένη χρήση');
}
export function quarantinedIds(): string[] { return Object.keys(load()); }
