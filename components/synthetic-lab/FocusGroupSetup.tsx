'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AudienceFilter } from '@/lib/synthetic-lab/types';
import { AudienceEditor, usePopulations } from './AudienceEditor';
import { LiveKeyInput, liveKeyHeader } from './NewStudyWizard';
import { Banner, Button, Card, Help, inputCls, labelCls, Spinner } from './ui';

const DEFAULT_GUIDE = {
  consumer: ['Ποια είναι η πρώτη σας εντύπωση;', 'Τι θα σας έπειθε να το δοκιμάσετε και τι θα σας απέτρεπε;', 'Πώς συγκρίνεται με ό,τι χρησιμοποιείτε σήμερα;', 'Αν αλλάζατε ένα πράγμα, ποιο θα ήταν;'],
  social_policy: ['Ποια είναι η πρώτη σας αντίδραση στην πρόταση;', 'Ποιους θα ωφελούσε και ποιους θα επιβάρυνε;', 'Τι θα χρειαζόταν για να λειτουργήσει στην πράξη;', 'Τι θα αλλάζατε ώστε να είναι πιο δίκαιο;'],
  political: ['Ποια θέματα θα κρίνουν την ψήφο σας στις επόμενες εκλογές;', 'Τι εικόνα έχετε για τα κόμματα και τους αρχηγούς τους;', 'Τι θα σας έκανε να αλλάξετε γνώμη;', 'Ποιο μήνυμα σας πείθει περισσότερο και γιατί;']
};

export default function FocusGroupSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = usePopulations();
  const initialDomain = (params.get('domain') as 'consumer' | 'social_policy' | 'political') || 'consumer';
  const [topic, setTopic] = useState(params.get('topic') || '');
  const [domain, setDomain] = useState<'consumer' | 'social_policy' | 'political'>(initialDomain);
  const [guide, setGuide] = useState<string>(() => {
    try {
      const g = JSON.parse(params.get('guide') || '[]');
      if (Array.isArray(g) && g.length) return g.join('\n');
    } catch {
      /* αγνοείται */
    }
    return DEFAULT_GUIDE[initialDomain].join('\n');
  });
  const [participants, setParticipants] = useState(6);
  const [rounds, setRounds] = useState(1);
  const [populationId, setPopulationId] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>({ minAge: 15 });
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [model, setModel] = useState('');
  const [cap, setCap] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status && !populationId) setPopulationId(status.defaultPopulationId);
    if (status && !model) setModel(status.mode.limits.defaultModel);
  }, [status, populationId, model]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/synthetic-lab/focus-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(mode === 'live' ? liveKeyHeader() : {}) },
        body: JSON.stringify({
          topic,
          domain,
          guide: guide.split('\n').map((x) => x.trim()).filter(Boolean),
          participants,
          rounds,
          populationId,
          audience,
          mode,
          ...(mode === 'live' ? { model, costCapUsd: cap } : {})
        })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      router.push(`/synthetic-lab/focus-group/${d.id}`);
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
          <label className={labelCls} htmlFor="topic">
            Ερευνητικό θέμα
          </label>
          <input id="topic" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="π.χ. Νέο πρόγραμμα κινητής 25€/μήνα" />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['consumer', 'Καταναλωτικό'],
              ['social_policy', 'Κοινωνικό / δημόσια πολιτική'],
              ['political', 'Πολιτικό / εκλογικό']
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={domain === v}
                onChange={() => {
                  setDomain(v);
                  setGuide(DEFAULT_GUIDE[v].join('\n'));
                }}
              />
              {l}
            </label>
          ))}
        </div>
        <div>
          <label className={labelCls} htmlFor="guide">
            Οδηγός συζήτησης (μία ερώτηση ανά γραμμή, έως 8)
          </label>
          <textarea id="guide" className={`${inputCls} min-h-[120px]`} value={guide} onChange={(e) => setGuide(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Συμμετέχοντες: {participants}</label>
            <input type="range" min={3} max={8} value={participants} onChange={(e) => setParticipants(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className={labelCls}>Γύροι ανά ερώτηση: {rounds}</label>
            <input type="range" min={1} max={3} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="w-full" />
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Συμμετέχοντες</h2>
        <AudienceEditor populations={status?.populations || []} populationId={populationId} onPopulation={setPopulationId} audience={audience} onAudience={setAudience} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Μοντέλο & κόστος</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={mode === 'demo'} onChange={() => setMode('demo')} />
          <span>
            <strong>Demo</strong> — πρότυπα κειμένου βασισμένα στο προφίλ, χωρίς AI και χωρίς κόστος. Χρήσιμο για δοκιμή του οδηγού.
          </span>
        </label>
        <label className={`flex items-start gap-2 text-sm ${status?.mode.liveAvailable ? '' : 'opacity-50'}`}>
          <input type="radio" disabled={!status?.mode.liveAvailable} checked={mode === 'live'} onChange={() => setMode('live')} />
          <span>
            <strong>Live AI</strong> — {status?.mode.message}
          </span>
        </label>
        {mode === 'live' && status && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Μοντέλο AI</label>
              <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
                {status.mode.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Όριο κόστους ($)</label>
              <input type="number" className={inputCls} min={0.05} step={0.05} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
            </div>
            <LiveKeyInput />
          </div>
        )}
        <Help>
          Οι συνθετικοί συμμετέχοντες δεν είναι πραγματικοί καταναλωτές ή πολίτες. Δεν επιβάλλεται τεχνητή διαφωνία: αν όλοι συμφωνούν, το βλέπετε. Χρησιμοποιήστε τη
          συζήτηση για να βρείτε υποθέσεις και ερωτήσεις για πραγματική έρευνα.
        </Help>
        <div className="flex justify-end">
          <Button onClick={create} disabled={busy || topic.trim().length < 3 || !populationId}>
            {busy ? <Spinner label="Δημιουργία…" /> : 'Δημιουργία focus group'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
