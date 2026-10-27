import Link from 'next/link';
import { liveStatusMessage } from '@/lib/synthetic-lab/ai/config';
import { latestSuite } from '@/lib/synthetic-lab/engine/validation';
import { defaultPopulationId, loadPopulation } from '@/lib/synthetic-lab/population/store';
import { listDocs } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';
import { Banner, Card } from '@/components/synthetic-lab/ui';

export const dynamic = 'force-dynamic';

const FEATURES = [
  { href: '/synthetic-lab/new', n: '1', title: 'Νέα Έρευνα', text: 'Περιγράψτε τι θέλετε να ερευνήσετε. Το Lab προτείνει ερωτηματολόγιο, κοινό και μεθοδολογία· εσείς εγκρίνετε πριν την εκτέλεση.' },
  { href: '/synthetic-lab/focus-group', n: '2', title: 'Focus Group', text: 'Συζήτηση συνθετικών συμμετεχόντων με συντονιστή, ζωντανό transcript, παύση/συνέχεια και σύνθεση θεμάτων.' },
  { href: '/synthetic-lab/scenarios', n: '3', title: 'Σύγκριση Σεναρίων', text: 'Συγκρίνετε προϊόντα, τιμές ή υποθετικές πολιτικές στο ίδιο δείγμα, με έλεγχο ευαισθησίας στις παραδοχές.' },
  { href: '/synthetic-lab/population', n: '4', title: 'Πληθυσμός & Κοινά', text: 'Δείτε τα συνθετικά προφίλ (GLOPOP-S), την ημερομηνία βάσης και την ποιότητα των δεδομένων.' },
  { href: '/synthetic-lab/data', n: '5', title: 'Τα Δεδομένα μου', text: 'Πηγές, χρονολογίες, άδειες και περιορισμοί κάθε dataset. Εισαγωγή νέων στοιχείων για επικαιροποίηση.' },
  { href: '/synthetic-lab/validation', n: '6', title: 'Έλεγχος Αξιοπιστίας', text: 'Σύγκριση της προσομοίωσης με πραγματικές μετρήσεις που δεν χρησιμοποιήθηκαν (held-out), με απλά baselines.' }
];

export default function LabHome() {
  const pop = loadPopulation(defaultPopulationId());
  const suite = latestSuite();
  const recent = listDocs<StudyRun>('studies', '.json', 5);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Greek Synthetic Research Lab</h1>
        <p className="mt-2 max-w-3xl text-stone-600">
          Προκαταρκτική έρευνα αγοράς και κοινωνικών ζητημάτων με συνθετικούς ερωτώμενους, θεμελιωμένους σε πραγματικά δημογραφικά δεδομένα. Κάθε αποτέλεσμα
          δείχνει τι είναι μετρημένο, τι είναι εκτίμηση και τι είναι προσομοίωση.
        </p>
      </section>

      <div className="grid gap-3">
        {pop && (
          <Banner tone={pop.summary.isDevFixture ? 'danger' : pop.summary.updateStatus.calibrated ? 'ok' : 'warning'} title="Πληθυσμός βάσης">
            {pop.summary.name}. {pop.summary.updateStatus.message}.
          </Banner>
        )}
        <Banner tone="info" title="Λειτουργία">
          {liveStatusMessage()}
        </Banner>
        <Banner tone={suite ? 'info' : 'warning'} title="Επικύρωση">
          {suite
            ? `Τελευταίος έλεγχος ${new Date(suite.createdAt).toLocaleString('el-GR')}: μέσο σφάλμα ${suite.summary.meanMaePp} π.μ. σε ${suite.summary.metrics} δείκτες (baseline «επιμονής»: ${suite.summary.meanPersistenceMaePp ?? '—'} π.μ.). Ισχύει μόνο για ερωτήσεις με εμπειρική σύνδεση.`
            : 'Δεν έχει εκτελεστεί ακόμη έλεγχος αξιοπιστίας. Οι προσομοιώσεις δεν έχουν επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα.'}
        </Banner>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="group">
            <Card className="h-full transition group-hover:border-stone-400 group-hover:shadow">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">{f.n}</span>
                <h2 className="text-lg font-semibold">{f.title}</h2>
              </div>
              <p className="mt-3 text-sm text-stone-600">{f.text}</p>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Πρόσφατες μελέτες</h2>
        {recent.length ? (
          <Card className="divide-y divide-stone-100 p-0">
            {recent.map((s) => (
              <Link key={s.id} href={`/synthetic-lab/studies/${s.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{s.plan.title}</span>
                <span className="text-xs text-stone-500">
                  {new Date(s.createdAt).toLocaleString('el-GR')} · {s.respondentCount} συνθετικοί ερωτώμενοι · {s.engine.mode === 'demo' ? 'demo' : 'live'}
                </span>
              </Link>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-stone-500">Καμία μελέτη ακόμη. Ξεκινήστε από τη «Νέα Έρευνα».</p>
        )}
      </section>
    </div>
  );
}
