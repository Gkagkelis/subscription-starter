'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusSession } from '@/lib/synthetic-lab/engine/focus-group';
import { liveKeyHeader } from './NewStudyWizard';
import { Banner, Button, Card, EvidenceBadge, SimulatedLabel, Spinner } from './ui';

const STATUS: Record<FocusSession['status'], string> = {
  ready: 'Έτοιμο',
  running: 'Σε εξέλιξη',
  paused: 'Σε παύση',
  completed: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
  blocked: 'Μπλοκαρίστηκε'
};

export default function FocusGroupSessionView({ initial }: { initial: FocusSession }) {
  const [s, setS] = useState<FocusSession>(initial);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const step = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch(`/api/synthetic-lab/focus-groups/${s.id}/step?n=${s.mode === 'live' ? 1 : 3}`, { method: 'POST', headers: s.mode === 'live' ? liveKeyHeader() : {} });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setS(d.session);
      if (['completed', 'cancelled', 'paused', 'blocked'].includes(d.session.status)) setAuto(false);
    } catch (e: any) {
      setError(e.message || String(e));
      setAuto(false);
    } finally {
      busy.current = false;
    }
  }, [s.id, s.mode]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(step, s.mode === 'live' ? 400 : 700);
    return () => clearInterval(t);
  }, [auto, step, s.mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [s.transcript.length]);

  async function control(action: 'pause' | 'resume' | 'cancel') {
    const r = await fetch(`/api/synthetic-lab/focus-groups/${s.id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const d = await r.json();
    if (d.ok) setS(d.session);
    if (action === 'resume') setAuto(true);
    if (action !== 'resume') setAuto(false);
  }

  const done = s.status === 'completed' || s.status === 'cancelled' || s.status === 'blocked';
  const progress = Math.round((s.cursor / Math.max(1, s.plan.length)) * 100);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SimulatedLabel />
        <h1 className="text-2xl font-semibold tracking-tight">{s.topic}</h1>
        <p className="text-sm text-stone-600">
          {STATUS[s.status]} · {s.mode === 'demo' ? 'Demo (πρότυπα κειμένου)' : `Live AI (${s.model})`} · κόστος ${s.cost.usd.toFixed(4)} · seed {s.seed}
        </p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {s.warnings.length > 0 && (
        <Banner tone={s.status === 'blocked' ? 'danger' : 'warning'}>
          <ul className="list-disc pl-4">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      {!done && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <div className="mb-1 text-xs text-stone-500">Πρόοδος συζήτησης: {progress}%</div>
            <div className="h-2 w-full overflow-hidden rounded bg-stone-200">
              <div className="h-2 bg-stone-800" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.status === 'paused' ? (
              <Button onClick={() => control('resume')}>▶ Συνέχεια</Button>
            ) : auto ? (
              <Button variant="secondary" onClick={() => control('pause')}>
                ❚❚ Παύση
              </Button>
            ) : (
              <Button onClick={() => setAuto(true)}>▶ {s.transcript.length ? 'Συνέχεια' : 'Έναρξη συζήτησης'}</Button>
            )}
            <Button variant="secondary" onClick={step} disabled={auto || s.status === 'paused'}>
              Ένα βήμα
            </Button>
            <Button variant="danger" onClick={() => control('cancel')}>
              Τερματισμός
            </Button>
            {auto && <Spinner label="Συζήτηση…" />}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Transcript</h2>
          <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {s.transcript.length === 0 && <p className="text-sm text-stone-500">Πατήστε «Έναρξη συζήτησης».</p>}
            {s.transcript.map((t) => (
              <div key={t.id} className={`rounded-lg p-3 text-sm ${t.role === 'moderator' ? 'bg-stone-100' : 'border border-amber-200 bg-amber-50/40'}`}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <strong>{t.speaker}</strong>
                  {t.role === 'participant' && <span className="text-amber-800">συνθετικός συμμετέχων</span>}
                  {t.flags.unsupported && t.role === 'participant' && <span className="text-stone-500">· ατεκμηρίωτο</span>}
                  {t.flags.invalidReference && <span className="text-red-700">· ⚠ αναφορά σε ομιλητή που δεν μίλησε</span>}
                  {t.flags.novel && <span className="text-violet-700">· νέα οπτική</span>}
                </div>
                {t.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Συμμετέχοντες</h2>
            <ul className="space-y-2 text-sm">
              {s.participants.map((p) => (
                <li key={p.alias}>
                  <strong>{p.alias}</strong> <span className="text-stone-600">{p.description}</span>
                  <div className="text-xs text-stone-400">{p.personaId}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">{s.populationNote}</p>
          </Card>
          {s.synthesis && (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Σύνθεση</h2>
                <EvidenceBadge kind={s.synthesis.evidenceKind} />
              </div>
              <Block title="Θέματα" items={s.synthesis.themes.map((t) => `${t.theme} — ${t.mentions} αναφορές (${t.participants.join(', ')})`)} />
              <Block title="Σημεία σύγκλισης" items={s.synthesis.convergence} />
              <Block title="Σημεία απόκλισης" items={s.synthesis.divergence} />
              <Block title="Απρόσμενες υποθέσεις" items={s.synthesis.surprises} />
              <p className="text-xs text-stone-500">
                Ατεκμηρίωτες απαντήσεις: {s.synthesis.unsupportedShare}% · μη έγκυρες αναφορές: {s.synthesis.invalidReferences}
              </p>
            </Card>
          )}
          <Card className="space-y-2">
            <h2 className="text-lg font-semibold">Εξαγωγή</h2>
            <div className="flex flex-wrap gap-2">
              <a className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50" href={`/api/synthetic-lab/focus-groups/${s.id}/export?format=md`}>
                Transcript (Markdown)
              </a>
              <a className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50" href={`/api/synthetic-lab/focus-groups/${s.id}/export?format=json`}>
                JSON
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm font-medium">{title}</div>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">—</p>
      )}
    </div>
  );
}
