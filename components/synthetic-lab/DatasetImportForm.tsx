'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, Card, Help, inputCls, labelCls, Spinner } from './ui';

const TEMPLATES = {
  calibration_targets: 'attribute,category,value\ngender,female,5400000\ngender,male,5080000\nageBand,65+,2400000',
  aggregate_survey: 'metric,group_type,group,value_0_100,n,survey_year,survey_quarter\nmy_metric,all,all,42.5,1000,2025,Q2'
};

export default function DatasetImportForm() {
  const router = useRouter();
  const [kind, setKind] = useState<'calibration_targets' | 'aggregate_survey'>('calibration_targets');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [collectionYear, setCollectionYear] = useState(new Date().getFullYear() - 1);
  const [license, setLicense] = useState('');
  const [commercialUse, setCommercialUse] = useState<'allowed' | 'allowed_with_attribution' | 'unclear' | 'not_allowed'>('unclear');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) {
      setMsg({ tone: 'danger', text: 'Το αρχείο ξεπερνά τα 2 MB.' });
      return;
    }
    setCsv(await f.text());
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/synthetic-lab/datasets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, name, organization, sourceUrl: sourceUrl || null, collectionYear, license, commercialUse, csv })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setMsg({ tone: 'ok', text: `Εισήχθη: ${d.meta.name} (${d.meta.recordCount} γραμμές).${d.issues.length ? ' Προειδοποιήσεις: ' + d.issues.slice(0, 3).join(' ') : ''}` });
      router.refresh();
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Εισαγωγή δεδομένων</h2>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={kind === 'calibration_targets'} onChange={() => setKind('calibration_targets')} /> Στόχοι επικαιροποίησης πληθυσμού (π.χ. ΕΛΣΤΑΤ)
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={kind === 'aggregate_survey'} onChange={() => setKind('aggregate_survey')} /> Συγκεντρωτικά αποτελέσματα έρευνας (για επικύρωση)
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Όνομα dataset</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Οργανισμός προέλευσης</label>
          <input className={inputCls} value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>URL πηγής</label>
          <input className={inputCls} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className={labelCls}>Έτος συλλογής (όχι δημοσίευσης)</label>
          <input type="number" className={inputCls} value={collectionYear} onChange={(e) => setCollectionYear(Number(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Άδεια χρήσης</label>
          <input className={inputCls} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="π.χ. CC BY 4.0" />
        </div>
        <div>
          <label className={labelCls}>Εμπορική χρήση</label>
          <select className={inputCls} value={commercialUse} onChange={(e) => setCommercialUse(e.target.value as any)}>
            <option value="allowed">Επιτρέπεται</option>
            <option value="allowed_with_attribution">Με αναφορά πηγής</option>
            <option value="unclear">Ασαφής</option>
            <option value="not_allowed">Δεν επιτρέπεται</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Αρχείο CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <textarea className={`${inputCls} mt-2 min-h-[100px] font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={TEMPLATES[kind]} />
      </div>
      <Help>
        {kind === 'calibration_targets' ? (
          <p>
            Στήλες: <code>attribute,category,value</code>. Χαρακτηριστικά: <code>ageBand</code> (0-4, 5-14, 15-24, 25-34, 35-44, 45-54, 55-64, 65+), <code>gender</code>{' '}
            (male/female), <code>regionCode</code> (GRCr101…GRCr113), <code>education</code>, <code>settlement</code>, <code>householdSize</code>. Οι στόχοι εφαρμόζονται
            με raking μόνο αν το έτος είναι το τρέχον ή το προηγούμενο· τότε το banner «baseline 2015» αλλάζει σε «βαθμονομημένο». Οι κοινές κατανομές παραμένουν του 2015.
          </p>
        ) : (
          <p>
            Στήλες: <code>metric,group_type,group,value_0_100,n,survey_year,survey_quarter</code> (ίδια μορφή με τα δεδομένα NORAYA). Μόνο συγκεντρωτικά ποσοστά —
            ατομικά ή προσωπικά δεδομένα απορρίπτονται.
          </p>
        )}
        <p className="mt-1">Τα αρχεία αποθηκεύονται ιδιωτικά στον server (όχι στον δημόσιο φάκελο, όχι στο git).</p>
      </Help>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy || !csv || name.length < 3 || organization.length < 2 || license.length < 2}>
          {busy ? <Spinner label="Εισαγωγή…" /> : 'Εισαγωγή'}
        </Button>
      </div>
    </Card>
  );
}
