'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ScenarioInput } from '@/lib/synthetic-lab/engine/scenarios';
import type { AudienceFilter } from '@/lib/synthetic-lab/types';
import { AudienceEditor, usePopulations } from './AudienceEditor';
import { LiveKeyInput, liveKeyHeader } from './NewStudyWizard';
import { Banner, Button, Card, Help, inputCls, labelCls, Spinner } from './ui';

const CONSUMER_EXAMPLE: ScenarioInput[] = [
  { id: 'A', label: 'Πρόγραμμα Α', description: '19€ με περιορισμένα δεδομένα', price: 19, quality: 2 },
  { id: 'B', label: 'Πρόγραμμα Β', description: '25€ με απεριόριστα δεδομένα', price: 25, quality: 4 },
  { id: 'C', label: 'Πρόγραμμα Γ', description: '29€ με επιπλέον παροχές', price: 29, quality: 5 }
];
const POLICY_EXAMPLE: ScenarioInput[] = [
  { id: 'A', label: 'Πολιτική Α', description: 'Επιδότηση ενοικίου 20% για νέους έως 35 ετών', price: null, quality: null },
  { id: 'B', label: 'Πολιτική Β', description: 'Κατασκευή κοινωνικών κατοικιών με χαμηλό ενοίκιο', price: null, quality: null }
];
const IDS = ['A', 'B', 'C', 'D', 'E'];

export default function ScenarioForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = usePopulations();
  const [topic, setTopic] = useState(params.get('topic') || 'Νέο πρόγραμμα κινητής τηλεφωνίας');
  const [domain, setDomain] = useState<'consumer' | 'social_policy'>('consumer');
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(CONSUMER_EXAMPLE);
  const [refPrice, setRefPrice] = useState<number | ''>(25);
  const [n, setN] = useState(500);
  const [populationId, setPopulationId] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>({ minAge: 15 });
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status && !populationId) setPopulationId(status.defaultPopulationId);
  }, [status, populationId]);

  const setSc = (i: number, p: Partial<ScenarioInput>) => setScenarios((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const pr = await fetch('/api/synthetic-lab/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: topic, domain, kind: 'scenario_comparison', audience, sampleSize: n })
      });
      const pd = await pr.json();
      if (!pd.ok) throw new Error(pd.error);
      const basePlan = pd.plan;
      basePlan.assumptions = basePlan.assumptions.map((a: any) => (a.id === 'reference_price' ? { ...a, value: refPrice === '' ? null : refPrice } : a));
      const r = await fetch('/api/synthetic-lab/scenarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(mode === 'live' ? liveKeyHeader() : {}) },
        body: JSON.stringify({ basePlan, scenarios, populationId, mode, seed: Math.floor(Math.random() * 100000) })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      router.push(`/synthetic-lab/scenarios/${d.id}`);
    } catch (e: any) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Banner tone="danger">{error}</Banner>}
      <Card className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="t">
            Τι συγκρίνουμε;
          </label>
          <input id="t" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['consumer', 'Προϊόντα / υπηρεσίες'],
              ['social_policy', 'Δημόσιες πολιτικές']
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={domain === v}
                onChange={() => {
                  setDomain(v);
                  setScenarios(v === 'consumer' ? CONSUMER_EXAMPLE : POLICY_EXAMPLE);
                }}
              />
              {l}
            </label>
          ))}
        </div>
        <div className="space-y-3">
          {scenarios.map((s, i) => (
            <div key={s.id} className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-12">
              <input aria-label="Όνομα σεναρίου" className={`${inputCls} sm:col-span-3`} value={s.label} onChange={(e) => setSc(i, { label: e.target.value })} />
              <input aria-label="Περιγραφή" className={`${inputCls} sm:col-span-5`} value={s.description} onChange={(e) => setSc(i, { description: e.target.value })} />
              {domain === 'consumer' && (
                <>
                  <input
                    aria-label="Τιμή €"
                    type="number"
                    className={`${inputCls} sm:col-span-2`}
                    value={s.price ?? ''}
                    placeholder="€"
                    onChange={(e) => setSc(i, { price: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <select aria-label="Αξία/ποιότητα (παραδοχή)" className={`${inputCls} sm:col-span-2`} value={s.quality ?? ''} onChange={(e) => setSc(i, { quality: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Αξία: —</option>
                    {[1, 2, 3, 4, 5].map((q) => (
                      <option key={q} value={q}>
                        Αξία {q}/5
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {scenarios.length < 5 && (
              <Button variant="secondary" onClick={() => setScenarios([...scenarios, { id: IDS[scenarios.length], label: `Σενάριο ${IDS[scenarios.length]}`, description: '', price: null, quality: null }])}>
                + Σενάριο
              </Button>
            )}
            {scenarios.length > 2 && (
              <Button variant="ghost" onClick={() => setScenarios(scenarios.slice(0, -1))}>
                − Αφαίρεση τελευταίου
              </Button>
            )}
          </div>
        </div>
        {domain === 'consumer' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Τιμή αναφοράς αγοράς (€) — παραδοχή</label>
              <input type="number" className={inputCls} value={refPrice} onChange={(e) => setRefPrice(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>
        )}
        <Help>
          Η «αξία/ποιότητα» και η τιμή αναφοράς είναι <strong>δικές σας παραδοχές</strong>, όχι δεδομένα. Όλα τα σενάρια απαντώνται από το ίδιο συνθετικό δείγμα ώστε
          οι διαφορές να αφορούν το σενάριο. Το Lab ελέγχει επίσης αν η κατάταξη αλλάζει όταν αλλάζουν οι παραδοχές.
        </Help>
      </Card>
      <Card className="space-y-4">
        <AudienceEditor populations={status?.populations || []} populationId={populationId} onPopulation={setPopulationId} audience={audience} onAudience={setAudience} />
        <div>
          <label className={labelCls}>Συνθετικοί ερωτώμενοι ανά σενάριο: {n}</label>
          <input type="range" min={100} max={1500} step={50} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
        </div>
        <label className={`flex items-start gap-2 text-sm ${status?.mode.liveAvailable ? '' : 'opacity-50'}`}>
          <input type="checkbox" disabled={!status?.mode.liveAvailable} checked={mode === 'live'} onChange={(e) => setMode(e.target.checked ? 'live' : 'demo')} />
          <span>Live AI ({status?.mode.message})</span>
        </label>
        {mode === 'live' && <LiveKeyInput />}
        <div className="flex justify-end">
          <Button onClick={run} disabled={busy || scenarios.length < 2 || !populationId}>
            {busy ? <Spinner label="Σύγκριση σεναρίων…" /> : 'Σύγκριση σεναρίων'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
