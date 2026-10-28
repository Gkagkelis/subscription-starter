// Σύνοψη του benchmark για το UI/API (χωρίς τα πλήρη αποτελέσματα ανά κελί).
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { PRODUCTION_MODEL, describeModel } from '../engine/model-config';
import { benchDir, listModels, loadSuite, readHistory } from './registry';

function latestFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .sort();
}

export function benchmarkOverview() {
  const suite = loadSuite();
  const counts: Record<string, Record<string, number>> = {};
  suite?.items.forEach((i) => {
    counts[i.family] ||= {};
    counts[i.family][i.split] = (counts[i.family][i.split] || 0) + 1;
  });
  const samples: Record<string, number> = {};
  if (suite) for (const sp of ['calibration', 'validation', 'holdout']) samples[sp] = new Set(suite.items.filter((i) => i.split === sp).map((i) => i.sampleKey)).size;

  const expDir = path.dirname(benchDir('experiments', 'x'));
  const byId = new Map<string, string>();
  latestFiles(expDir)
    .filter((f) => !f.startsWith('T-'))
    .forEach((f) => byId.set(f.replace(/-\d{4}-\d{2}-\d{2}T.*$/, ''), f));
  const experiments = Array.from(byId.entries()).map(([id, f]) => {
    const e = JSON.parse(readFileSync(path.join(expDir, f), 'utf8'));
    return {
      id,
      hypothesis: e.hypothesis,
      createdAt: e.createdAt,
      variants: e.variants.map((v: any) => ({ label: v.label, mode: v.mode, summary: v.summary, gaps: v.gaps })),
      paired: e.paired
    };
  });
  const history = readHistory();
  const decisions = history.filter((h) => h.type === 'select' || h.type === 'holdout').slice(-10);
  const assocPath = benchDir('assoc_results.json');
  const assoc = existsSync(assocPath) ? JSON.parse(readFileSync(assocPath, 'utf8')) : null;
  // ---------------- Φάση 2 ----------------
  const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const temporalFile = latestFiles(expDir, 'T-temporal-validation').pop();
  const temporal = temporalFile
    ? (() => {
        const t = readJson(path.join(expDir, temporalFile));
        return { file: temporalFile, variants: t.variants.map((v: any) => ({ label: v.label, summary: v.summary, familyBalanced: v.familyBalanced, byFamily: Object.fromEntries(Object.entries(v.byFamily || {}).map(([k, x]: any) => [k, { samples: x.samples, sampleMeanMae: x.sampleMeanMae }])) })) };
      })()
    : null;
  const factors = readJson(benchDir('item_factors.json'));
  const weights = readJson(benchDir('weights_audit_dianeosis.json'));
  const splitCounts: Record<string, { items: number; samples: number }> = {};
  suite?.items.forEach((i) => {
    splitCounts[i.split] ||= { items: 0, samples: 0 };
    splitCounts[i.split].items++;
  });
  if (suite) for (const sp of Object.keys(splitCounts)) splitCounts[sp].samples = new Set(suite.items.filter((i) => i.split === sp).map((i) => i.sampleKey)).size;
  const phase2 = {
    splits: splitCounts,
    temporal,
    factors: factors ? { chosen: factors.chosen, validation2022: factors.validation2022, revealed2024: factors.revealed2024 } : null,
    weightsAudit: weights?.waves || null,
    comparisons: history.filter((h) => h.type === 'p2_compare').slice(-12).map((h: any) => ({ at: h.at, label: h.label, ref: h.ref?.version, alt: h.alt?.version, refScore: h.ref?.summary?.sampleMeanMae, altScore: h.alt?.summary?.sampleMeanMae, paired: h.paired, familyDelta: h.familyDelta, accepted: h.accepted, reasons: h.reasons })),
    final2: readJson(benchDir('final2_results.json'))
  };
  return {
    phase2,
    production: { version: PRODUCTION_MODEL.version, description: describeModel(PRODUCTION_MODEL) },
    suite: suite ? { version: suite.version, hash: suite.hash, generatedAt: suite.generatedAt, items: suite.items.length, counts, samples, rules: suite.rules } : null,
    models: listModels().map((m) => ({ version: m.version, label: m.label, description: describeModel(m), batteryRho: m.batteryRho || 0, structureTransfer: !!m.structureTransfer, notes: m.notes || [] })),
    experiments,
    decisions,
    assoc,
    runs: history.filter((h) => h.type === 'run').slice(-20)
  };
}
