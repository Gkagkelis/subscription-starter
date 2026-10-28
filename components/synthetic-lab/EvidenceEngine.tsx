'use client';
// Μηχανισμός «Τεκμηριωμένη πρόβλεψη» (EGPS): σήμανση κατηγορίας, έλεγχος εκτιμησιμότητας, μητρώο μαρκών, πεδία ερώτησης.
import { useEffect, useState } from 'react';
import type { ConstructKind, EvidenceClass, Question, QuestionEvidence, StudyPlan } from '@/lib/synthetic-lab/types';
import { Banner, Button, Card, Help, inputCls, labelCls, Spinner } from './ui';

export const CLASS_INFO: Record<EvidenceClass, { label: string; cls: string; help: string }> = {
  EMPIRICALLY_ANCHORED: { label: 'Εμπειρικά τεκμηριωμένο', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', help: 'Στηρίζεται σε άμεση μέτρηση της ίδιας μεταβλητής ή μάρκας.' },
  MODEL_EXTRAPOLATED: { label: 'Πρόβλεψη μοντέλου', cls: 'border-sky-300 bg-sky-50 text-sky-900', help: 'Μεταφορά από συγγενικές μετρήσεις ή ρητό σενάριο· δίνεται με διάστημα.' },
  NOT_ESTIMABLE: { label: 'Μη εκτιμήσιμο', cls: 'border-stone-300 bg-stone-100 text-stone-700', help: 'Δεν υπάρχει επαρκής τεκμηρίωση· δεν παράγονται συνθετικές απαντήσεις.' }
};

export function EvidenceClassBadge({ c }: { c: EvidenceClass }) {
  const i = CLASS_INFO[c];
  return (
    <span title={i.help} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${i.cls}`}>
      {i.label}
    </span>
  );
}

export function EvidenceDetails({ e }: { e: QuestionEvidence }) {
  return (
    <div className="space-y-1 text-xs text-stone-600">
      <p>{e.reason}</p>
      {e.point != null && e.int80 && (
        <p>
          Πρόβλεψη: <strong>{e.point}%</strong> · διάστημα 80%: {e.int80[0]}–{e.int80[1]}% {e.int95 ? `· 95%: ${e.int95[0]}–${e.int95[1]}%` : ''} (από σφάλματα σε δοκιμές απόκρυψης — όχι περιθώριο
          δειγματοληπτικού σφάλματος)
        </p>
      )}
      {e.distribution && e.distribution.length > 0 && (
        <p>
          Σενάριο (σημείο · διάστημα 80%): {e.distribution.map((d) => `${d.option}: ${d.point}% (${d.int80[0]}–${d.int80[1]}%)`).join(' · ')}
        </p>
      )}
      {e.upperBound && (
        <p>
          Λογικό άνω όριο από την κατηγορία: {e.upperBound.value}% ({e.upperBound.source}).
        </p>
      )}
      {e.dependence && e.dependence.length > 0 && (
        <p>
          Εξαρτήσεις: {e.dependence.map((d) => `${d.with} (${d.cls}, ρ=${d.rho}${d.rho === 0 ? ', μη εκτιμήσιμη → ανεξάρτητες' : ''})`).join(' · ')}
        </p>
      )}
      {e.sources.length > 0 && <p>Πηγές: {e.sources.slice(0, 6).join(' · ')}{e.sources.length > 6 ? ` (+${e.sources.length - 6})` : ''}</p>}
    </div>
  );
}

type Estimability = { counts: Record<EvidenceClass, number>; rows: (QuestionEvidence & { id: string; text: string })[]; engineVersion: string };

/** Έλεγχος εκτιμησιμότητας πριν από την εκτέλεση. */
export function EstimabilityPanel({ plan, populationId }: { plan: StudyPlan; populationId: string }) {
  const [data, setData] = useState<Estimability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function check() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/synthetic-lab/estimability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan, populationId }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (populationId) void check();
  }, [populationId, JSON.stringify(plan.questions), plan.referenceYear]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Τι μπορεί να εκτιμηθεί</h2>
        <Button variant="secondary" onClick={check} disabled={busy}>
          {busy ? <Spinner label="Έλεγχος…" /> : 'Επανέλεγχος'}
        </Button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(CLASS_INFO) as EvidenceClass[]).map((c) => (
              <span key={c} className="flex items-center gap-1">
                <EvidenceClassBadge c={c} /> {data.counts[c]}
              </span>
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-stone-200 p-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong>{r.id}</strong> {r.text}
                  </span>
                  <EvidenceClassBadge c={r.evidenceClass} />
                </div>
                <EvidenceDetails e={r} />
              </li>
            ))}
          </ul>
          {data.counts.NOT_ESTIMABLE > 0 && (
            <Banner tone="warning" title="Μη εκτιμήσιμες ερωτήσεις">
              Για αυτές δεν θα παραχθούν συνθετικές απαντήσεις. Γίνονται εκτιμήσιμες με μέτρηση της μάρκας (σελίδα «Δεδομένα» → «Μάρκες»), συγγενικούς δείκτες, ή ρητό
              σενάριο ερευνητή.
            </Banner>
          )}
        </>
      )}
      <Help>
        <p>
          Ο μηχανισμός «Τεκμηριωμένη πρόβλεψη» δεν συμπληρώνει κενά με ομοιόμορφες τυχαίες απαντήσεις. Αξιολογήθηκε σε κρυμμένες πραγματικές μετρήσεις
          (docs/synthetic-lab/EGPS_RESULTS.md).
        </p>
      </Help>
    </Card>
  );
}

type Registry = { categories: { id: string; label: string }[]; measures: Record<string, string> };
let registryCache: Promise<Registry> | null = null;
function useRegistry() {
  const [reg, setReg] = useState<Registry | null>(null);
  useEffect(() => {
    registryCache ||= fetch('/api/synthetic-lab/brands').then((r) => r.json());
    registryCache.then((d) => setReg((d as Registry & { ok?: boolean }).ok === false ? null : d)).catch(() => setReg(null));
  }, []);
  return reg;
}

const KINDS: Record<ConstructKind, string> = { evaluation: 'Αξιολόγηση', intention: 'Πρόθεση / σύσταση', usage: 'Χρήση του ίδιου', general_usage: 'Γενική χρήση κατηγορίας', other: 'Άλλο' };

/** Πεδία τεκμηρίωσης μιας ερώτησης: σύνδεση με μάρκα και τι μετρά η ερώτηση (για τις εξαρτήσεις). */
export function QuestionEvidenceFields({ q, onChange }: { q: Question; onChange: (patch: Partial<Question>) => void }) {
  const reg = useRegistry();
  const binary = q.type === 'single_choice' && (q.options || []).length === 2;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-stone-600">Τεκμηρίωση για τον μηχανισμό «Τεκμηριωμένη πρόβλεψη»</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Μάρκα</label>
          <input
            className={inputCls}
            placeholder={binary ? 'π.χ. όνομα μάρκας' : 'μόνο για ερωτήσεις Όχι/Ναι'}
            disabled={!binary}
            value={q.brandLink?.brand || ''}
            onChange={(e) => onChange({ brandLink: e.target.value ? { category: q.brandLink?.category || reg?.categories[0]?.id || 'svod', measure: q.brandLink?.measure || 'awareness_aided', brand: e.target.value } : null })}
          />
        </div>
        <div>
          <label className={labelCls}>Κατηγορία</label>
          <select className={inputCls} disabled={!q.brandLink} value={q.brandLink?.category || ''} onChange={(e) => q.brandLink && onChange({ brandLink: { ...q.brandLink, category: e.target.value } })}>
            {(reg?.categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Μέτρηση</label>
          <select className={inputCls} disabled={!q.brandLink} value={q.brandLink?.measure || ''} onChange={(e) => q.brandLink && onChange({ brandLink: { ...q.brandLink, measure: e.target.value } })}>
            {Object.entries(reg?.measures || {}).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Τι μετρά η ερώτηση</label>
          <select
            className={inputCls}
            value={q.construct?.kind || ''}
            onChange={(e) => onChange({ construct: e.target.value ? { object: q.construct?.object || q.brandLink?.brand || 'αντικείμενο', kind: e.target.value as ConstructKind } : null })}
          >
            <option value="">—</option>
            {Object.entries(KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Για ποιο αντικείμενο</label>
          <input className={inputCls} disabled={!q.construct} value={q.construct?.object || ''} onChange={(e) => q.construct && onChange({ construct: { ...q.construct, object: e.target.value } })} />
        </div>
      </div>
      <p className="mt-1 text-stone-500">Οι επιλογές πρέπει να είναι με σειρά «χαμηλό → υψηλό» (π.χ. Όχι → Ναι, 1 → 5) ώστε οι εξαρτήσεις να έχουν σωστή κατεύθυνση.</p>
    </details>
  );
}

type Summary = {
  categories: { id: string; label: string }[];
  measures: Record<string, string>;
  brands: { category: string; brand: string; brandId: string }[];
  measurements: number;
  validations: { category: string; measure: string; nBrands: number; status: string; looMaePp: number | null; uniformMaePp: number | null; medianWidth80Pp: number | null; message: string }[];
};

const STATUS: Record<string, string> = {
  validated: 'Επικυρώθηκε — πρόβλεψη για μάρκες χωρίς μέτρηση',
  insufficient_brands: 'Λίγες μάρκες — μόνο οι μετρημένες',
  not_better_than_uniform: 'Δεν ξεπερνά την ομοιόμορφη — μόνο οι μετρημένες',
  too_uncertain: 'Πολύ αβέβαιο — μόνο οι μετρημένες',
  poor_coverage: 'Κακή κάλυψη διαστημάτων — μόνο οι μετρημένες'
};

/** Μητρώο μαρκών: εισαγωγή πραγματικών μετρήσεων και αυτόματη επικύρωση ανά κατηγορία. */
export function BrandDataPanel() {
  const [s, setS] = useState<Summary | null>(null);
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const load = () => fetch('/api/synthetic-lab/brands').then((r) => r.json()).then((d) => d.ok !== false && setS(d));
  useEffect(() => {
    void load();
  }, []);
  async function upload() {
    setMsg(null);
    const r = await fetch('/api/synthetic-lab/brands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv }) });
    const d = await r.json();
    if (!d.ok) return setMsg({ tone: 'danger', text: d.error });
    setMsg({ tone: 'ok', text: `Εισήχθησαν ${d.imported} μετρήσεις.${d.errors.length ? ` Προειδοποιήσεις: ${d.errors.slice(0, 5).join(' ')}` : ''}` });
    setS(d.summary);
    setCsv('');
  }
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Μάρκες: πραγματικές μετρήσεις για τον μηχανισμό «Τεκμηριωμένη πρόβλεψη»</h2>
      <p className="text-sm text-stone-600">
        Για οποιαδήποτε μάρκα: εισάγετε μετρήσεις από πραγματικές έρευνες (με πηγή και άδεια χρήσης). Μάρκα με μέτρηση → εμπειρικά τεκμηριωμένη. Όταν μια κατηγορία έχει ≥ 6
        μετρημένες μάρκες, η πλατφόρμα ελέγχει αυτόματα (leave-one-brand-out) αν μπορεί να προβλέψει μάρκες χωρίς μέτρηση· αλλιώς αυτές μένουν μη εκτιμήσιμες. Τα δεδομένα
        αποθηκεύονται ιδιωτικά (εκτός repo).
      </p>
      {s && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1">Κατηγορία</th>
                <th>Μέτρηση</th>
                <th>Μάρκες</th>
                <th>Σφάλμα LOO / ομοιόμορφη</th>
                <th>Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {s.validations.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-stone-500">
                    Δεν υπάρχουν ακόμη μετρήσεις μαρκών· όλες οι ερωτήσεις μάρκας είναι μη εκτιμήσιμες.
                  </td>
                </tr>
              )}
              {s.validations.map((v) => (
                <tr key={`${v.category}-${v.measure}`} className="border-t border-stone-100" title={v.message}>
                  <td className="py-1">{s.categories.find((c) => c.id === v.category)?.label || v.category}</td>
                  <td>{s.measures[v.measure] || v.measure}</td>
                  <td>{v.nBrands}</td>
                  <td>{v.looMaePp == null ? '—' : `${v.looMaePp} / ${v.uniformMaePp} π.μ.`}</td>
                  <td>{STATUS[v.status] || v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="brandcsv">
          Εισαγωγή CSV
        </label>
        <textarea
          id="brandcsv"
          className={`${inputCls} min-h-[110px] font-mono text-xs`}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={'category,brand,measure,year,group_dim,group,value,n,source,license\nsvod,Παράδειγμα,awareness_aided,2026,all,all,42,1000,Έρευνα Χ 2026,Άδεια χρήσης Υ\nsvod,Παράδειγμα,awareness_aided,2026,age_band,15-24,61,,Έρευνα Χ 2026,Άδεια χρήσης Υ'}
        />
        <p className="mt-1 text-xs text-stone-500">
          group_dim: all · age_band (15-24 … 65+) · gender (female/male) · education_group (low_education/medium_education/high_education). Τιμές = % ενηλίκων.
        </p>
      </div>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      <Button onClick={upload} disabled={csv.trim().length < 10}>
        Εισαγωγή μετρήσεων
      </Button>
    </Card>
  );
}
