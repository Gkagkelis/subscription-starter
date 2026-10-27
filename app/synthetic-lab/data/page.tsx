import DatasetImportForm from '@/components/synthetic-lab/DatasetImportForm';
import { Card, PageTitle } from '@/components/synthetic-lab/ui';
import { allDatasets, freshness } from '@/lib/synthetic-lab/data/registry';

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
const FRESH: Record<string, string> = { fresh: 'text-emerald-700', aging: 'text-amber-700', stale: 'text-red-700', unknown: 'text-stone-500' };

export default function DataPage() {
  const ds = allDatasets();
  return (
    <div className="space-y-6">
      <PageTitle title="Τα Δεδομένα μου" subtitle="Κάθε πηγή με οργανισμό, έτη συλλογής (όχι δημοσίευσης), άδεια, περιορισμούς και τρόπο χρήσης. Δημόσια διαθέσιμο δεν σημαίνει ελεύθερο για εμπορική χρήση." />
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
                <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${USAGE[d.usage].cls}`}>{USAGE[d.usage].label}</span>
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
