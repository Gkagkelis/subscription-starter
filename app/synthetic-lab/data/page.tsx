import DatasetImportForm from '@/components/synthetic-lab/DatasetImportForm';
import { BrandDataPanel } from '@/components/synthetic-lab/EvidenceEngine';
import { Card, PageTitle } from '@/components/synthetic-lab/ui';
import { allDatasets, freshness } from '@/lib/synthetic-lab/data/registry';
import { lakeDir, lakeMeta } from '@/lib/synthetic-lab/data/lake';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const USAGE: Record<string, { label: string; cls: string }> = {
  used: { label: 'Χρησιμοποιείται', cls: 'bg-emerald-100 text-emerald-900' },
  validation_only: { label: 'Μόνο για επικύρωση', cls: 'bg-sky-100 text-sky-900' },
  excluded: { label: 'Σκόπιμα εκτός χρήσης', cls: 'bg-stone-200 text-stone-800' },
  not_connected: { label: 'Δεν έχει συνδεθεί', cls: 'bg-red-100 text-red-900' }
};
const COMMERCIAL: Record<string, string> = {
  allowed: 'Επιτρέπεται',
  allowed_with_attribution: 'Επιτρέπεται με αναφορά πηγής',
  unclear: 'Ασαφής — απαιτείται έλεγχος',
  not_allowed: 'Δεν επιτρέπεται'
};
const TIER: Record<string, { label: string; cls: string }> = {
  open: { label: 'Ανοιχτά δεδομένα', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  research_only: { label: 'Μόνο για έρευνα', cls: 'border-amber-300 bg-amber-50 text-amber-900' },
  registration: { label: 'Απαιτεί εγγραφή', cls: 'border-sky-300 bg-sky-50 text-sky-900' },
  cite_only: { label: 'Μόνο για σύγκριση', cls: 'border-stone-300 bg-stone-50 text-stone-800' },
  paid: { label: 'Επί πληρωμή', cls: 'border-red-300 bg-red-50 text-red-900' }
};
const FRESH: Record<string, string> = { fresh: 'text-emerald-700', aging: 'text-amber-700', stale: 'text-red-700', unknown: 'text-stone-500' };

const SOURCE_LABEL: Record<string, string> = {
  eurostat: 'Eurostat (ΕΛΣΤΑΤ)',
  eurobarometer: 'Eurobarometer',
  worldbank: 'World Bank Findex',
  zenodo: 'Zenodo',
  figshare: 'Figshare',
  harvard_dataverse: 'Harvard Dataverse',
  dataverse_nl: 'DataverseNL'
};

/** Σύνοψη του Greek Research Data Lake (αν υπάρχει τοπικά): αριθμοί από την εξαγωγή και την αναφορά κάλυψης. */
function LakeCard() {
  const meta = lakeMeta();
  let report: { statusTotals?: Record<string, number>; studiesTotal?: number; variablesTotal?: number; distributionsTotal?: number; generatedAt?: string } | null = null;
  const rp = path.join(lakeDir(), 'reports', 'coverage_report.json');
  try {
    if (existsSync(rp)) report = JSON.parse(readFileSync(rp, 'utf8'));
  } catch {
    report = null;
  }
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Greek Research Data Lake (2012–2026)</h2>
      {!meta.available ? (
        <p className="text-sm text-stone-600">
          Δεν υπάρχει τοπικό lake. Χτίζεται με <code>scripts/synthetic-lab/lake/run_all.sh</code> (βλ. docs/synthetic-lab/DATA_LAKE.md) σε ιδιωτικό φάκελο — τα δεδομένα δεν
          μπαίνουν στο repo.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-700">
            {meta.studies.toLocaleString('el-GR')} μελέτες και {meta.questions.toLocaleString('el-GR')} ερωτήσεις/δείκτες διαθέσιμα στο simulation engine
            (εξαγωγή {meta.generatedAt?.slice(0, 10)}). Κάθε παράμετρος μιας προσομοίωσης φέρει την προέλευσή της· ισχύει χρονικό όριο (έτος αναφοράς) και holdout.
          </p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {Object.entries(meta.bySource).map(([k, v]) => (
              <li key={k} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-900">
                {SOURCE_LABEL[k] || k}: {v}
              </li>
            ))}
          </ul>
          {report?.statusTotals && (
            <p className="text-xs text-stone-600">
              Κατάλογος: {report.studiesTotal?.toLocaleString('el-GR')} έρευνες/σύνολα ·{' '}
              {Object.entries(report.statusTotals)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => `${k} ${v.toLocaleString('el-GR')}`)
                .join(' · ')}{' '}
              · {report.variablesTotal?.toLocaleString('el-GR')} μεταβλητές · {report.distributionsTotal?.toLocaleString('el-GR')} κελιά κατανομών (αναφορά{' '}
              {report.generatedAt?.slice(0, 10)}).
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export default function DataPage() {
  const ds = allDatasets();
  return (
    <div className="space-y-6">
      <PageTitle title="Τα Δεδομένα μου" subtitle="Κάθε πηγή με οργανισμό, έτη συλλογής (όχι δημοσίευσης), άδεια, περιορισμούς και τρόπο χρήσης. Δημόσια διαθέσιμο δεν σημαίνει ελεύθερο για εμπορική χρήση." />
      <LakeCard />
      <BrandDataPanel />
      <div className="space-y-4">
        {ds.map((d) => {
          const f = freshness(d);
          return (
            <Card key={d.id} className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold">{d.name}</h2>
                  <div className="text-sm text-stone-600">{d.organization}</div>
                </div>
                <div className="flex flex-wrap gap-2 self-start">
                  {d.tier && <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TIER[d.tier].cls}`}>{TIER[d.tier].label}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${USAGE[d.usage].cls}`}>{USAGE[d.usage].label}</span>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-stone-500">Έτη συλλογής</dt>
                  <dd>{d.collectionYears ? d.collectionYears.join('–') : 'Άγνωστα'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Δημοσίευση</dt>
                  <dd>{d.publicationDate || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Εισαγωγή στο Lab</dt>
                  <dd>{d.importedAt ? new Date(d.importedAt).toLocaleDateString('el-GR') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Εγγραφές</dt>
                  <dd>
                    {d.recordCount?.toLocaleString('el-GR') ?? '—'} <span className="text-stone-500">{d.recordUnit}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Άδεια</dt>
                  <dd>
                    {d.license} {d.licenseVerified ? '(επαληθευμένη)' : '(μη επαληθευμένη)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Εμπορική χρήση</dt>
                  <dd>{COMMERCIAL[d.commercialUse]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Φρεσκάδα</dt>
                  <dd className={FRESH[f.level]}>{f.label}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Βάρη</dt>
                  <dd>{d.weights}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Πηγή</dt>
                  <dd className="break-all">{d.sourceUrl ? <a className="underline" href={d.sourceUrl}>{d.sourceUrl}</a> : '—'}</dd>
                </div>
              </dl>
              <p className="text-sm text-stone-700">
                <strong>Χρήση στο Lab:</strong> {d.usageNote}
              </p>
              {d.howToConnect && d.usage === 'not_connected' && (
                <p className="text-sm text-sky-900">
                  <strong>Πώς συνδέεται:</strong> {d.howToConnect}
                </p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-stone-700">Μεταβλητές, περιορισμοί, αποθήκευση</summary>
                <ul className="mt-2 list-disc pl-5 text-stone-700">
                  {d.variables.map((v) => (
                    <li key={v.name}>
                      <code>{v.name}</code> {v.description && `— ${v.description}`}
                    </li>
                  ))}
                </ul>
                <ul className="mt-2 list-disc pl-5 text-amber-900">
                  {d.restrictions.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-stone-500">
                  Αποθήκευση: {d.storage}
                  {d.sourceHash ? ` · sha256 ${d.sourceHash.slice(0, 16)}…` : ''}
                </p>
              </details>
            </Card>
          );
        })}
      </div>
      <DatasetImportForm />
    </div>
  );
}
