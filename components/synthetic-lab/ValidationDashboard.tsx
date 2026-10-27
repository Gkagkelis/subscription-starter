'use client';
import { useEffect, useState } from 'react';
import type { BacktestResult, ValidationSuite } from '@/lib/synthetic-lab/engine/validation';
import { usePopulations } from './AudienceEditor';
import { Banner, Button, Card, EvidenceBadge, Help, Spinner, Stat } from './ui';

interface Freshness {
  id: string;
  name: string;
  usage: string;
  ageYears: number | null;
  level: string;
  label: string;
}

const GROUP: Record<string, string> = {
  all: 'Σύνολο',
  male: 'Άνδρες',
  female: 'Γυναίκες',
  low_education: 'Βασική μόρφωση',
  medium_education: 'Μέση μόρφωση',
  high_education: 'Ανώτατη μόρφωση'
};

export default function ValidationDashboard() {
  const { status } = usePopulations();
  const [suite, setSuite] = useState<ValidationSuite | null>(null);
  const [fresh, setFresh] = useState<Freshness[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/synthetic-lab/validation')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setSuite(d.suite);
          setFresh(d.freshness);
        } else setError(d.error);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function run() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/synthetic-lab/validation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ populationId: status.defaultPopulationId, n: 1000 })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setSuite(d.suite);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const beats = suite ? suite.results.filter((r) => r.persistenceMaePp !== null && r.maePp < r.persistenceMaePp).length : 0;

  return (
    <div className="space-y-6">
      {error && <Banner tone="danger">{error}</Banner>}
      <Card className="space-y-3">
        <p className="text-sm text-stone-700">
          Ο έλεγχος «εκπαιδεύει» το μοντέλο σε ένα κύμα Eurobarometer, προσομοιώνει 1.000 συνθετικούς ερωτώμενους και συγκρίνει τα αποτελέσματα με το{' '}
          <strong>επόμενο κύμα</strong>, το οποίο δεν χρησιμοποιήθηκε. Συγκρίνεται επίσης με δύο απλές μεθόδους αναφοράς (baselines).
        </p>
        <Help>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>MAE</strong>: μέση απόλυτη απόκλιση σε ποσοστιαίες μονάδες (π.μ.) ανάμεσα στο προσομοιωμένο και στο παρατηρημένο ποσοστό κάθε ομάδας.
              Το «χωρίς θόρυβο» χρησιμοποιεί την αναμενόμενη τιμή του μοντέλου αντί για τυχαίες συνθετικές απαντήσεις — η διαφορά των δύο είναι ο θόρυβος της προσομοίωσης.
            </li>
            <li>
              <strong>Baseline «επιμονής»</strong>: «η επόμενη μέτρηση θα είναι ίδια με την προηγούμενη». Αν το μοντέλο δεν το ξεπερνά, τα δημογραφικά δεν προσθέτουν
              προβλεπτική αξία.
            </li>
            <li>
              <strong>Κάλυψη 95%</strong>: πόσο συχνά η παρατηρημένη τιμή βρίσκεται μέσα στο αναμενόμενο εύρος (θα έπρεπε ~95% αν το μοντέλο ήταν καλά βαθμονομημένο).
            </li>
            <li>Ο έλεγχος αφορά ΜΟΝΟ ερωτήσεις συνδεδεμένες με δείκτη. Για νέα προϊόντα και ανοιχτές ερωτήσεις δεν υπάρχει πραγματική μέτρηση σύγκρισης.</li>
            <li>Δεν υπάρχει «confidence score»: εμφανίζονται μόνο ορισμένα, μετρήσιμα σφάλματα.</li>
          </ul>
        </Help>
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={busy || !status}>
            {busy ? <Spinner label="Εκτέλεση ελέγχου (~20″)…" /> : suite ? 'Επανεκτέλεση ελέγχου' : 'Εκτέλεση ελέγχου αξιοπιστίας'}
          </Button>
          {suite && <span className="text-xs text-stone-500">Τελευταίος έλεγχος: {new Date(suite.createdAt).toLocaleString('el-GR')}</span>}
        </div>
      </Card>

      {!suite && !busy && <Banner tone="warning">Η συγκεκριμένη προσομοίωση δεν έχει ακόμη επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα.</Banner>}

      {suite && (
        <>
          <Card className="grid gap-4 sm:grid-cols-5">
            <Stat label="Δείκτες που ελέγχθηκαν" value={suite.summary.metrics} />
            <Stat label="Μέσο MAE μοντέλου" value={`${suite.summary.meanMaePp} π.μ.`} hint="με τον θόρυβο της προσομοίωσης" />
            <Stat label="MAE χωρίς θόρυβο" value={`${suite.summary.meanExpectedMaePp ?? '—'} π.μ.`} hint="αναμενόμενη τιμή μοντέλου" />
            <Stat label="Μέσο MAE «επιμονής»" value={`${suite.summary.meanPersistenceMaePp ?? '—'} π.μ.`} />
            <Stat label="Μέση κάλυψη 95%" value={`${suite.summary.meanCoverage95}%`} />
          </Card>
          <Banner tone={beats > suite.results.length / 2 ? 'ok' : 'warning'} title="Ερμηνεία">
            Το μοντέλο είχε μικρότερο σφάλμα από το baseline «επιμονής» σε {beats} από {suite.results.length} δείκτες.{' '}
            {beats <= suite.results.length / 2 &&
              'Συνεπώς, η δημογραφική προσομοίωση ΔΕΝ βελτιώνει την πρόβλεψη του επόμενου κύματος σε σχέση με την απλή χρήση της τελευταίας μέτρησης. Χρησιμοποιήστε τα αποτελέσματα ως περιγραφή υποθέσεων, όχι ως πρόβλεψη.'}{' '}
            Χωρίς τον θόρυβο της προσομοίωσης (αναμενόμενη τιμή) το μέσο σφάλμα είναι {suite.summary.meanExpectedMaePp ?? '—'} π.μ. έναντι{' '}
            {suite.summary.meanPersistenceMaePp ?? '—'} π.μ. του baseline. Η κάλυψη κάτω από 95% δείχνει ότι τα διαστήματα της προσομοίωσης είναι στενότερα από την
            πραγματική αβεβαιότητα (δεν περιλαμβάνουν τη μεταβολή της κοινής γνώμης μεταξύ κυμάτων).
          </Banner>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="px-4 py-2">Δείκτης</th>
                  <th>Fit → Έλεγχος</th>
                  <th>MAE</th>
                  <th>Χωρίς θόρυβο</th>
                  <th>Επιμονή</th>
                  <th>Μόνο σύνολο</th>
                  <th>Κάλυψη 95%</th>
                  <th>Σταθερότητα (sd)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suite.results.map((r) => (
                  <Row key={r.metric} r={r} open={open === r.metric} onToggle={() => setOpen(open === r.metric ? null : r.metric)} />
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Φρεσκάδα πηγών</h2>
        <ul className="space-y-1 text-sm">
          {fresh.map((f) => (
            <li key={f.id} className="flex flex-col sm:flex-row sm:justify-between">
              <span>{f.name}</span>
              <span className={f.level === 'stale' ? 'text-red-700' : f.level === 'aging' ? 'text-amber-700' : f.level === 'fresh' ? 'text-emerald-700' : 'text-stone-500'}>
                {f.label}
                {f.usage === 'excluded' ? ' · εκτός χρήσης' : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Row({ r, open, onToggle }: { r: BacktestResult; open: boolean; onToggle: () => void }) {
  const better = r.persistenceMaePp !== null && r.maePp < r.persistenceMaePp;
  return (
    <>
      <tr className="border-t border-stone-100">
        <td className="px-4 py-2">{r.metricLabel}</td>
        <td className="text-xs">
          {r.trainWave} → {r.testWave}
        </td>
        <td className={better ? 'text-emerald-700' : 'text-amber-700'}>{r.maePp}</td>
        <td>{r.expectedMaePp ?? '—'}</td>
        <td>{r.persistenceMaePp ?? '—'}</td>
        <td>{r.overallOnlyMaePp ?? '—'}</td>
        <td>{r.coverage95}%</td>
        <td>{r.stability.maeSd}</td>
        <td>
          <button type="button" className="px-2 text-xs underline" onClick={onToggle}>
            {open ? 'Κλείσιμο' : 'Λεπτομέρειες'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-stone-50">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 flex gap-2">
                  <EvidenceBadge kind="observed" />
                  <EvidenceBadge kind="simulation" />
                </div>
                <table className="w-full text-xs">
                  <thead className="text-left text-stone-500">
                    <tr>
                      <th>Ομάδα</th>
                      <th>Παρατηρ.</th>
                      <th>n</th>
                      <th>Προσομ.</th>
                      <th>95%</th>
                      <th>|σφάλμα|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.groups.map((g) => (
                      <tr key={g.dimension + g.group} className={g.lowSample ? 'text-stone-400' : ''}>
                        <td>{GROUP[g.group] || g.group}</td>
                        <td>{g.observed}%</td>
                        <td>{g.observedN}</td>
                        <td>{g.simulated}%</td>
                        <td>
                          {g.simCiLow}–{g.simCiHigh}
                        </td>
                        <td className={g.covered ? '' : 'text-red-700'}>{g.absError}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 text-xs">
                <div className="font-semibold">Ευαισθησία στις ρυθμίσεις μοντέλου (MAE π.μ.)</div>
                <ul className="list-disc pl-4">
                  {r.sensitivity.map((s) => (
                    <li key={s.setting}>
                      {s.setting}: {s.maePp}
                    </li>
                  ))}
                </ul>
                <div className="font-semibold">Δημογραφικός έλεγχος δείγματος (TVD %)</div>
                <p>{r.demographicCheck.map((d) => `${d.attribute}: ${d.tvd}`).join(' · ')}</p>
                <ul className="list-disc pl-4 text-stone-600">
                  {r.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
