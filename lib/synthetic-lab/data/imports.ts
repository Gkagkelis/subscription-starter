// ============================================================
// Εισαγωγή datasets από τον χρήστη (ιδιωτικός φάκελος, όχι public/).
//  - calibration_targets: περιθωριακές κατανομές για επικαιροποίηση
//    πληθυσμού (π.χ. ΕΛΣΤΑΤ 2025). Στήλες: attribute,category,value
//  - aggregate_survey: συγκεντρωτικά ποσοστά για επικύρωση.
//    Στήλες: metric,group_type,group,value_0_100,n,survey_year,survey_quarter
// Δεν επιτρέπεται εισαγωγή ατομικών προσωπικών δεδομένων.
// ============================================================

import { createHash } from 'crypto';
import { z } from 'zod';
import { parseCsvObjects } from '../csv';
import { clearPopulationCache } from '../population/store';
import { CALIBRATABLE_ATTRIBUTES, type CalibrationTargets, type MarginTarget } from '../population/calibration';
import { saveDoc } from '../storage/file-store';
import type { DatasetMeta } from '../types';

export const ImportSchema = z.object({
  kind: z.enum(['calibration_targets', 'aggregate_survey']),
  name: z.string().trim().min(3).max(200),
  organization: z.string().trim().min(2).max(200),
  sourceUrl: z.string().trim().url().max(500).nullable().optional(),
  collectionYear: z.number().int().min(1990).max(2100),
  publicationDate: z.string().trim().max(40).nullable().optional(),
  license: z.string().trim().min(2).max(200),
  commercialUse: z.enum(['allowed', 'allowed_with_attribution', 'unclear', 'not_allowed']),
  restrictions: z.string().trim().max(1000).optional(),
  csv: z.string().min(10).max(2_000_000)
});
export type ImportRequest = z.infer<typeof ImportSchema>;

const PERSONAL_COLUMNS = /^(name|όνομα|onoma|email|phone|τηλέφωνο|afm|αφμ|amka|αμκα|address|διεύθυνση|id_number)$/i;

export interface ImportResult {
  meta: DatasetMeta;
  issues: string[];
}

export function importDataset(req: ImportRequest): ImportResult {
  const rows = parseCsvObjects(req.csv);
  if (!rows.length) throw new Error('Το CSV είναι κενό.');
  const cols = Object.keys(rows[0]);
  const personal = cols.filter((c) => PERSONAL_COLUMNS.test(c));
  if (personal.length) throw new Error(`Το αρχείο φαίνεται να περιέχει προσωπικά δεδομένα (${personal.join(', ')}). Η εισαγωγή απορρίφθηκε.`);
  const issues: string[] = [];
  const hash = createHash('sha256').update(req.csv).digest('hex');
  const id = `user-${req.kind === 'calibration_targets' ? 'targets' : 'survey'}-${hash.slice(0, 12)}`;

  if (req.kind === 'calibration_targets') {
    for (const c of ['attribute', 'category', 'value']) if (!cols.includes(c)) throw new Error(`Λείπει η στήλη «${c}».`);
    const byAttr = new Map<string, Record<string, number>>();
    rows.forEach((r, i) => {
      if (!(CALIBRATABLE_ATTRIBUTES as readonly string[]).includes(r.attribute)) {
        issues.push(`Γραμμή ${i + 2}: άγνωστο χαρακτηριστικό «${r.attribute}» (επιτρέπονται: ${CALIBRATABLE_ATTRIBUTES.join(', ')}).`);
        return;
      }
      const v = Number(r.value);
      if (!Number.isFinite(v) || v < 0) {
        issues.push(`Γραμμή ${i + 2}: μη έγκυρη τιμή.`);
        return;
      }
      const m = byAttr.get(r.attribute) || {};
      m[r.category] = (m[r.category] || 0) + v;
      byAttr.set(r.attribute, m);
    });
    if (!byAttr.size) throw new Error('Δεν βρέθηκαν έγκυροι στόχοι.');
    const margins: MarginTarget[] = Array.from(byAttr.entries()).map(([attribute, totals]) => ({ attribute: attribute as MarginTarget['attribute'], totals }));
    const targets: CalibrationTargets = { datasetId: id, year: req.collectionYear, source: req.organization, license: req.license, margins };
    saveDoc('calibration-targets', id, targets);
    clearPopulationCache();
  } else {
    const need = ['metric', 'group_type', 'group', 'value_0_100', 'n', 'survey_year'];
    for (const c of need) if (!cols.includes(c)) throw new Error(`Λείπει η στήλη «${c}».`);
    rows.forEach((r, i) => {
      const v = Number(r.value_0_100);
      if (!Number.isFinite(v) || v < 0 || v > 100) issues.push(`Γραμμή ${i + 2}: τιμή εκτός 0-100.`);
    });
    saveDoc('datasets', id, { rows }, '.data.json');
  }

  const meta: DatasetMeta = {
    id,
    name: req.name,
    organization: req.organization,
    sourceUrl: req.sourceUrl || null,
    collectionYears: [req.collectionYear, req.collectionYear],
    publicationDate: req.publicationDate || null,
    importedAt: new Date().toISOString(),
    kind: req.kind,
    recordCount: rows.length,
    recordUnit: req.kind === 'calibration_targets' ? 'περιθωριακοί στόχοι' : 'συγκεντρωτικές γραμμές',
    variables: cols.map((c) => ({ name: c, description: '' })),
    weights: req.kind === 'calibration_targets' ? 'Πληθυσμιακά σύνολα/ποσοστά' : 'Όπως δηλώνει η πηγή',
    license: req.license,
    licenseVerified: false,
    commercialUse: req.commercialUse,
    restrictions: [req.restrictions || '', 'Η άδεια δηλώθηκε από τον χρήστη και δεν έχει επαληθευτεί.'].filter(Boolean),
    usage: req.kind === 'calibration_targets' ? 'used' : 'validation_only',
    usageNote:
      req.kind === 'calibration_targets'
        ? 'Στόχοι βαθμονόμησης: εφαρμόζονται μόνο αν το έτος είναι πρόσφατο (τρέχον ή προηγούμενο).'
        : 'Διαθέσιμο για σύγκριση/επικύρωση.',
    validationStatus: 'not_applicable',
    sourceHash: hash,
    storage: `.synthetic-lab-data/${req.kind === 'calibration_targets' ? 'calibration-targets' : 'datasets'}/${id}`
  };
  saveDoc('datasets', id, meta, '.meta.json');
  return { meta, issues };
}
