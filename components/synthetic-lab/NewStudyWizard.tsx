'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Assumption, AudienceFilter, Question, QuestionType, StudyPlan } from '@/lib/synthetic-lab/types';
import { AudienceEditor, usePopulations } from './AudienceEditor';
import { QuestionBank } from './QuestionBank';
import { EstimabilityPanel, QuestionEvidenceFields } from './EvidenceEngine';
import { Banner, Button, Card, EvidenceBadge, Help, inputCls, labelCls, Spinner } from './ui';

const STEPS = ['Τι θέλεις να ερευνήσεις;', 'Ποιο κοινό αφορά;', 'Τι τύπο έρευνας θέλεις;', 'Παραδοχές & δεδομένα', 'Εκτέλεση'];

const EXAMPLES = [
  'Θέλω να δοκιμάσω ένα νέο πρόγραμμα κινητής τηλεφωνίας που κοστίζει 25€ τον μήνα',
  'Συνδρομητική υπηρεσία παράδοσης φρέσκων λαχανικών από τοπικούς παραγωγούς στα 15€ την εβδομάδα',
  'Μέτρο επιδότησης ενοικίου για νέους έως 35 ετών',
  'Δημοτικό πρόγραμμα κοινόχρηστων ηλεκτρικών ποδηλάτων'
];

export const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: 'Μία επιλογή',
  multiple_choice: 'Πολλαπλές επιλογές',
  likert: 'Κλίμακα (Likert)',
  ranking: 'Κατάταξη',
  open_ended: 'Ανοιχτή ερώτηση',
  concept_test: 'Δοκιμή ιδέας (concept)',
  product_comparison: 'Σύγκριση προϊόντων',
  price_test: 'Δοκιμή τιμών'
};

export function liveKeyHeader(): Record<string, string> {
  try {
    const k = sessionStorage.getItem('synthetic-lab-key');
    return k ? { 'x-synthetic-lab-key': k } : {};
  } catch {
    return {};
  }
}

export default function NewStudyWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, error: popError } = usePopulations();
  const [step, setStep] = useState(0);
  const [text, setText] = useState(params.get('q') || '');
  const [domain, setDomain] = useState<'auto' | 'consumer' | 'social_policy'>('auto');
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [guide, setGuide] = useState<string[]>([]);
  const [populationId, setPopulationId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [engine, setEngine] = useState<'evidence' | 'standard'>('evidence');
  const [model, setModel] = useState('');
  const [cap, setCap] = useState(1);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 100000));

  useEffect(() => {
    if (status && !populationId) setPopulationId(status.defaultPopulationId);
    if (status && !model) setModel(status.mode.limits.defaultModel);
  }, [status, populationId, model]);

  async function propose() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/synthetic-lab/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...(domain !== 'auto' ? { domain } : {}) })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setPlan(d.plan);
      setGuide(d.suggestions?.guide || []);
      setStep(1);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/synthetic-lab/studies', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(mode === 'live' ? liveKeyHeader() : {}) },
        body: JSON.stringify({ plan: { ...plan, engine }, populationId, seed, mode, ...(mode === 'live' ? { model, costCapUsd: cap } : {}) })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      router.push(`/synthetic-lab/studies/${d.id}`);
    } catch (e: any) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  const updatePlan = (p: Partial<StudyPlan>) => setPlan((x) => (x ? { ...x, ...p } : x));
  const pop = useMemo(() => status?.populations.find((p) => p.id === populationId), [status, populationId]);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Βήματα">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > 0 && !plan}
              onClick={() => setStep(i)}
              className={`rounded-full px-3 py-1 text-sm ${i === step ? 'bg-stone-900 text-white' : i < step ? 'bg-stone-200 text-stone-800' : 'bg-white text-stone-500 ring-1 ring-stone-200'} disabled:opacity-50`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {error && <Banner tone="danger" title="Δεν ήταν δυνατή η ενέργεια">{error}</Banner>}
      {popError && <Banner tone="danger">{popError}</Banner>}

      {step === 0 && (
        <Card className="space-y-4">
          <div>
            <label htmlFor="q" className={labelCls}>
              Περιγράψτε με απλά λόγια τι θέλετε να ερευνήσετε
            </label>
            <textarea id="q" className={`${inputCls} min-h-[110px]`} value={text} onChange={(e) => setText(e.target.value)} placeholder="π.χ. Θέλω να δοκιμάσω ένα νέο πρόγραμμα κινητής τηλεφωνίας που κοστίζει 25€ τον μήνα" />
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 hover:bg-stone-100">
                {e}
              </button>
            ))}
          </div>
          <fieldset>
            <legend className={labelCls}>Ερευνητικός τομέας</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {[
                ['auto', 'Αυτόματος εντοπισμός'],
                ['consumer', 'Καταναλωτική έρευνα'],
                ['social_policy', 'Κοινωνική έρευνα & δημόσιες πολιτικές']
              ].map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-2">
                  <input type="radio" name="domain" checked={domain === v} onChange={() => setDomain(v as any)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          <Help>
            Υποστηρίζονται και πολιτικές/εκλογικές μελέτες (πρόθεση ψήφου, κόμματα, πρόσωπα, μηνύματα). Τα αποτελέσματα είναι συνθετική προσομοίωση
            και δεν δημοσιεύονται ως δημοσκόπηση.
          </Help>
          <div className="flex justify-end">
            <Button onClick={propose} disabled={busy || text.trim().length < 5}>
              {busy ? <Spinner label="Σχεδιασμός…" /> : 'Πρότεινε σχέδιο έρευνας →'}
            </Button>
          </div>
        </Card>
      )}

      {plan && step === 1 && (
        <Card className="space-y-4">
          <AudienceEditor
            populations={status?.populations || []}
            populationId={populationId}
            onPopulation={setPopulationId}
            audience={plan.audience}
            onAudience={(a: AudienceFilter) => updatePlan({ audience: a })}
          />
          <div>
            <label htmlFor="n" className={labelCls}>
              Αριθμός συνθετικών ερωτώμενων: <strong>{plan.sampleSize}</strong>
            </label>
            <input id="n" type="range" min={50} max={2000} step={50} value={plan.sampleSize} onChange={(e) => updatePlan({ sampleSize: Number(e.target.value) })} className="w-full" />
            <p className="text-xs text-stone-500">Περισσότεροι συνθετικοί ερωτώμενοι μειώνουν μόνο τον θόρυβο της προσομοίωσης — δεν κάνουν το αποτέλεσμα πιο «αληθινό».</p>
          </div>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </Card>
      )}

      {plan && step === 2 && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="text-sm font-medium">Τύπος έρευνας</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border-2 border-stone-900 p-3 text-sm">
                <div className="font-semibold">Συνθετική έρευνα (ερωτηματολόγιο)</div>
                <div className="text-stone-600">Πολλοί συνθετικοί ερωτώμενοι απαντούν στο ίδιο ερωτηματολόγιο.</div>
              </div>
              <a className="rounded-lg border border-stone-200 p-3 text-sm hover:border-stone-400" href={`/synthetic-lab/focus-group?topic=${encodeURIComponent(plan.researchQuestion)}&domain=${plan.domain}&guide=${encodeURIComponent(JSON.stringify(guide))}`}>
                <div className="font-semibold">Focus group →</div>
                <div className="text-stone-600">Συζήτηση λίγων συνθετικών συμμετεχόντων με συντονιστή.</div>
              </a>
              <a className="rounded-lg border border-stone-200 p-3 text-sm hover:border-stone-400" href={`/synthetic-lab/scenarios?topic=${encodeURIComponent(plan.researchQuestion)}`}>
                <div className="font-semibold">Σύγκριση σεναρίων →</div>
                <div className="text-stone-600">Δύο ή περισσότερες εκδοχές στο ίδιο δείγμα.</div>
              </a>
            </div>
          </Card>
          <QuestionEditor questions={plan.questions} onChange={(questions) => updatePlan({ questions })} />
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {plan && step === 3 && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Δεδομένα που θα χρησιμοποιηθούν</h2>
            {pop && (
              <Banner tone={pop.isDevFixture ? 'danger' : 'warning'} title={pop.name}>
                {pop.updateStatus.message}. Αντιπροσωπεύει {pop.representedPopulation.toLocaleString('el-GR')} άτομα (έτος αναφοράς {pop.referenceYear || '—'}).
              </Banner>
            )}
            {engine !== 'evidence' && (
              <>
            <ul className="space-y-2 text-sm">
              {plan.questions.map((q) => (
                <li key={q.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong>{q.id}</strong> {q.text}
                  </span>
                  {q.evidenceLink ? <EvidenceBadge kind="estimate" /> : <EvidenceBadge kind="simulation" />}
                </li>
              ))}
            </ul>
            <Help>
              <p>
                «Στατιστική εκτίμηση»: η ερώτηση συνδέεται με πραγματική μέτρηση (Eurobarometer μέσω NORAYA)· οι πιθανότητες απάντησης εκτιμώνται ανά ηλικία, φύλο
                και μόρφωση. «Συνθετική προσομοίωση»: καμία μέτρηση δεν υπάρχει — οι απαντήσεις ακολουθούν τις παραδοχές παρακάτω ή είναι ουδέτερες.
              </p>
            </Help>
              </>
            )}
          </Card>
          {engine === 'evidence' && populationId && <EstimabilityPanel plan={plan} populationId={populationId} />}
          <AssumptionsEditor assumptions={plan.assumptions} onChange={(assumptions) => updatePlan({ assumptions })} />
          {plan.warnings.length > 0 && (
            <Banner tone="warning" title="Προειδοποιήσεις">
              <ul className="list-disc pl-4">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Banner>
          )}
          <Nav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Συνέχεια στην εκτέλεση →" />
        </div>
      )}

      {plan && step === 4 && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Εκτέλεση</h2>
          <fieldset className="space-y-2 text-sm">
            <legend className={labelCls}>Μηχανισμός απαντήσεων</legend>
            <label className="flex items-start gap-2">
              <input type="radio" checked={engine === 'evidence'} onChange={() => setEngine('evidence')} />
              <span>
                <strong>Τεκμηριωμένη πρόβλεψη (προτείνεται)</strong> — κάθε ερώτηση χαρακτηρίζεται «εμπειρικά τεκμηριωμένη», «πρόβλεψη μοντέλου» (με διάστημα) ή «μη
                εκτιμήσιμη» (χωρίς συνθετικές απαντήσεις). Οι σχετιζόμενες ερωτήσεις έχουν εξαρτήσεις μαθημένες από πραγματικά δεδομένα.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={engine === 'standard'} onChange={() => setEngine('standard')} />
              <span>
                <strong>Τυπικός (prod-1)</strong> — όπου λείπουν δεδομένα, ουδέτερες ομοιόμορφες απαντήσεις· ανεξάρτητες ερωτήσεις.
              </span>
            </label>
          </fieldset>
          <fieldset className="space-y-2 text-sm">
            <legend className={labelCls}>Λειτουργία</legend>
            <label className="flex items-start gap-2">
              <input type="radio" checked={mode === 'demo'} onChange={() => setMode('demo')} />
              <span>
                <strong>Demo (προτείνεται)</strong> — χωρίς AI, μηδενικό κόστος, πλήρως διαφανείς κανόνες.
              </span>
            </label>
            <label className={`flex items-start gap-2 ${status?.mode.liveAvailable ? '' : 'opacity-50'}`}>
              <input type="radio" disabled={!status?.mode.liveAvailable} checked={mode === 'live'} onChange={() => setMode('live')} />
              <span>
                <strong>Live (AI)</strong> — {status?.mode.message}
              </span>
            </label>
          </fieldset>
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
                <input type="number" className={inputCls} min={0.05} max={status.mode.limits.costCapUsd} step={0.05} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
              </div>
              <LiveKeyInput />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="seed">
                Sampling seed (για αναπαραγωγή)
              </label>
              <input id="seed" type="number" className={inputCls} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>Κατανοώ ότι τα αποτελέσματα είναι συνθετική προσομοίωση και όχι απαντήσεις πραγματικών ανθρώπων.</span>
          </label>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>
              ← Πίσω
            </Button>
            <Button onClick={run} disabled={!confirmed || busy}>
              {busy ? <Spinner label="Εκτέλεση έρευνας…" /> : 'Εκτέλεση έρευνας'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = 'Επόμενο →' }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>
        ← Πίσω
      </Button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

export function LiveKeyInput() {
  const [v, setV] = useState('');
  useEffect(() => {
    try {
      setV(sessionStorage.getItem('synthetic-lab-key') || '');
    } catch {
      /* αγνοείται */
    }
  }, []);
  return (
    <div>
      <label className={labelCls}>Κλειδί πρόσβασης live</label>
      <input
        type="password"
        className={inputCls}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          try {
            sessionStorage.setItem('synthetic-lab-key', e.target.value);
          } catch {
            /* αγνοείται */
          }
        }}
        placeholder="SYNTHETIC_LAB_LIVE_KEY"
      />
    </div>
  );
}

export function QuestionEditor({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const set = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const [bank, setBank] = useState(false);
  const nextIdWith = (prefix: string) => {
    let k = 1;
    while (questions.some((q) => q.id === `${prefix}${k}`)) k++;
    return `${prefix}${k}`;
  };
  const nextId = () => {
    let k = questions.length + 1;
    while (questions.some((q) => q.id === `q${k}`)) k++;
    return `q${k}`;
  };
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ερωτηματολόγιο</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setBank((b) => !b)} disabled={questions.length >= 25}>
            + Ερώτηση με εμπειρική βάση
          </Button>
          <Button variant="secondary" onClick={() => onChange([...questions, { id: nextId(), type: 'likert', text: 'Νέα ερώτηση', scale: ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ'] }])}>
            + Ερώτηση
          </Button>
        </div>
      </div>
      {bank && (
        <QuestionBank
          nextId={() => nextIdWith('src')}
          onAdd={(q) => {
            onChange([...questions, q].slice(0, 25));
            setBank(false);
          }}
          onClose={() => setBank(false)}
        />
      )}
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-stone-200 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-8 text-sm font-semibold text-stone-500">{q.id}</span>
            <input aria-label={`Κείμενο ${q.id}`} className={inputCls} value={q.text} readOnly={!!q.evidenceLink?.optionMetrics} onChange={(e) => set(i, { text: e.target.value })} />
            <select aria-label={`Τύπος ${q.id}`} className={`${inputCls} sm:w-56`} value={q.type} onChange={(e) => set(i, { type: e.target.value as QuestionType })} disabled={!!q.evidenceLink}>
              {Object.entries(TYPE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => onChange(questions.filter((_, j) => j !== i))}>
              Διαγραφή
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
            {q.evidenceLink ? (
              <>
                <EvidenceBadge kind="estimate" />{' '}
                {q.evidenceLink.optionMetrics
                  ? `Ερώτηση πραγματικής έρευνας (${q.evidenceLink.datasetId}) — επιλογές: ${(q.options || []).join(' / ')}. Δεν αλλάζουν.`
                  : `Συνδεδεμένη με δείκτη «${q.evidenceLink.metric}» — οι επιλογές δεν αλλάζουν.`}
              </>
            ) : (
              <EvidenceBadge kind="simulation" />
            )}
            {q.followUpOf && (
              <span>
                Ακολουθεί την {q.followUpOf.questionId} όταν η απάντηση είναι: {q.followUpOf.whenAnswerIn.join(', ')}
              </span>
            )}
          </div>
          {['single_choice', 'multiple_choice', 'ranking'].includes(q.type) && !q.evidenceLink && (
            <textarea
              aria-label={`Επιλογές ${q.id}`}
              className={`${inputCls} mt-2 min-h-[70px]`}
              value={(q.options || []).join('\n')}
              onChange={(e) => set(i, { options: e.target.value.split('\n').filter((x) => x.trim()) })}
              placeholder="Μία επιλογή ανά γραμμή"
            />
          )}
          {(q.type === 'likert' || q.type === 'concept_test') && (
            <input
              aria-label={`Κλίμακα ${q.id}`}
              className={`${inputCls} mt-2`}
              value={(q.scale || ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πολύ']).join(' | ')}
              onChange={(e) => set(i, { scale: e.target.value.split('|').map((x) => x.trim()).filter(Boolean) })}
            />
          )}
          <QuestionEvidenceFields q={q} onChange={(patch) => set(i, patch)} />
          {q.type === 'price_test' && (
            <input
              aria-label={`Τιμές ${q.id}`}
              className={`${inputCls} mt-2`}
              value={(q.pricePoints || []).join(', ')}
              onChange={(e) => set(i, { pricePoints: e.target.value.split(',').map((x) => Number(x.trim().replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0) })}
              placeholder="π.χ. 15, 20, 25, 30"
            />
          )}
        </div>
      ))}
    </Card>
  );
}

export function AssumptionsEditor({ assumptions, onChange }: { assumptions: Assumption[]; onChange: (a: Assumption[]) => void }) {
  const set = (i: number, patch: Partial<Assumption>) => onChange(assumptions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Ερευνητικές παραδοχές</h2>
      <p className="text-sm text-stone-600">Καμία από αυτές δεν προκύπτει από δεδομένα. Εμφανίζονται αυτούσιες στην τελική αναφορά.</p>
      {assumptions.map((a, i) => (
        <div key={a.id} className="rounded-lg border border-stone-200 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={a.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />
            <span>
              <strong>{a.title}</strong> <span className="text-xs text-stone-500">({a.source === 'researcher' ? 'δική σας τιμή' : 'προεπιλεγμένη παραδοχή'})</span>
              <br />
              <span className="text-stone-600">{a.description}</span>
            </span>
          </label>
          {a.enabled && (
            <div className="mt-2 flex flex-wrap items-center gap-4 pl-6">
              {a.value !== undefined && (
                <label className="flex items-center gap-2">
                  Τιμή:
                  <input type="number" className={`${inputCls} w-28`} value={a.value ?? ''} onChange={(e) => set(i, { value: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
              )}
              {a.value === undefined && (
                <label className="flex items-center gap-2">
                  Ένταση: {a.strength.toFixed(1)}
                  <input type="range" min={0} max={2} step={0.5} value={a.strength} onChange={(e) => set(i, { strength: Number(e.target.value) })} />
                </label>
              )}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
