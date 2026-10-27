'use client';
import { useEffect, useState } from 'react';
import type { Question } from '@/lib/synthetic-lab/types';
import { Banner, Button, inputCls, Spinner } from './ui';

interface Entry {
  id: string;
  kind: 'distribution' | 'binary';
  text: string;
  options: string[];
  source: string;
  tier: 'open' | 'research_only';
  waveKey: string | null;
  years?: number[];
  n: number | null;
  observed: { option: string; value: number }[];
}

/** Αναζήτηση και προσθήκη ερωτήσεων πραγματικών ερευνών (με εμπειρική βάση). */
export function QuestionBank({ nextId, onAdd, onClose }: { nextId: () => string; onAdd: (q: Question) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/synthetic-lab/question-bank?q=${encodeURIComponent(query)}`, { signal: ctl.signal });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        setEntries(d.entries);
        setError(null);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e.message || String(e));
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  async function add(id: string) {
    try {
      const r = await fetch(`/api/synthetic-lab/question-bank?build=${encodeURIComponent(id)}&as=${nextId()}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      onAdd(d.question);
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Ερωτήσεις πραγματικών ερευνών</h3>
        <Button variant="ghost" onClick={onClose}>
          Κλείσιμο
        </Button>
      </div>
      <p className="text-xs text-stone-600">
        Οι απαντήσεις αυτών των ερωτήσεων ακολουθούν τις μετρημένες κατανομές της πηγής ανά ηλικία, φύλο, μόρφωση (και περιφέρεια όπου υπάρχει). Είναι
        εκτίμηση από την πηγή — όχι νέα μέτρηση.
      </p>
      <input aria-label="Αναζήτηση ερωτήσεων" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="π.χ. κλιματική αλλαγή, εμπιστοσύνη, τεχνητή νοημοσύνη, streaming" />
      {error && <Banner tone="danger">{error}</Banner>}
      {!entries && !error && <Spinner />}
      {entries && !entries.length && <p className="text-sm text-stone-500">Δεν βρέθηκαν ερωτήσεις.</p>}
      <ul className="max-h-96 space-y-2 overflow-y-auto">
        {entries?.map((e) => (
          <li key={e.id} className="rounded border border-stone-200 bg-white p-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                {e.text}
                <span className="mt-0.5 block text-xs text-stone-500">Επιλογές: {e.options.slice(0, 6).join(' / ')}{e.options.length > 6 ? ' / …' : ''}</span>
              </button>
              <Button variant="secondary" onClick={() => add(e.id)}>
                Προσθήκη
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span>{e.source}</span>
              {e.waveKey && <span>· {e.waveKey.slice(0, 4)}</span>}
              {e.years && e.years.length > 1 && <span>· κύματα {e.years.join(', ')}</span>}
              {e.n ? <span>· n={e.n}</span> : null}
              {e.tier === 'research_only' ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-900">Μόνο για έρευνα</span>
              ) : (
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900">Ανοιχτά δεδομένα</span>
              )}
            </div>
            {open === e.id && (
              <ul className="mt-2 space-y-0.5 text-xs text-stone-700">
                {e.observed.map((o) => (
                  <li key={o.option}>
                    «{o.option}»: {o.value}%
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
