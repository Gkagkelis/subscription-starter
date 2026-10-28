'use client';
import type { StudyReport } from '@/lib/synthetic-lab/engine/report';
import type { Question, QuestionAggregate, StudyRun } from '@/lib/synthetic-lab/types';
import { BarChart, PriceCurve } from './charts';
import { Banner, Card, EvidenceBadge, SimulatedLabel, Stat } from './ui';
import { EvidenceClassBadge, EvidenceDetails } from './EvidenceEngine';

const BASIS_LABEL: Record<string, string> = {
  empirical_prior: 'εμπειρική βάση',
  assumption: 'παραδοχές',
  uninformed: 'χωρίς βάση',
  llm: 'AI',
  model_extrapolated: 'πρόβλεψη από συγγενικά δεδομένα / παραδοχή',
  not_estimable: 'μη εκτιμήσιμο',
  persona_model: 'συνθετικά πρόσωπα (μοντέλο σε μικροδεδομένα)'
};

const SEG_LABEL: Record<string, string> = { ageBand: 'Ηλικία', gender: 'Φύλο', education: 'Εκπαίδευση', incomeQuintile: 'Εισόδημα', settlement: 'Περιοχή' };

export function ExportBar({ id }: { id: string }) {
  const base = `/api/synthetic-lab/studies/${id}/export?format=`;
  const link = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50';
  return (
    <div className="flex flex-wrap gap-2" data-lab-noprint>
      <button type="button" className={link} onClick={() => window.print()}>
        PDF (εκτύπωση)
      </button>
      <a className={link} href={`${base}csv`}>
        CSV απαντήσεων
      </a>
      <a className={link} href={`${base}aggregates-csv`}>
        CSV αποτελεσμάτων
      </a>
      <a className={link} href={`${base}json`}>
        JSON
      </a>
      <a className={link} href={`${base}md`}>
        Markdown
      </a>
      <a className={link} href={`${base}doc`}>
        Word
      </a>
    </div>
  );
}

function QuestionResult({ q, a }: { q: Question; a: QuestionAggregate }) {
  const mix = Object.entries(a.basisMix)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${BASIS_LABEL[k]} ${v}%`)
    .join(' · ');
  return (
    <Card className="break-inside-avoid space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{q.id}</div>
          <h3 className="font-semibold">{q.text}</h3>
        </div>
        {a.evidence ? <EvidenceClassBadge c={a.evidence.evidenceClass} /> : <EvidenceBadge kind={a.evidenceKind} />}
      </div>
      {a.evidence && <EvidenceDetails e={a.evidence} />}
      <div className="text-xs text-stone-500">
        {a.n} απαντήσεις · effective n {a.effectiveN} · βάση: {mix || '—'}
        {q.followUpOf ? ` · ακολουθεί την ${q.followUpOf.questionId}` : ''}
      </div>
      {a.n === 0 && a.evidence?.evidenceClass === 'NOT_ESTIMABLE' && (
        <p className="text-sm text-stone-600">Μη εκτιμήσιμο: δεν παράχθηκαν συνθετικές απαντήσεις (καμία κατασκευασμένη κατανομή).</p>
      )}
      {a.n === 0 && a.evidence?.evidenceClass !== 'NOT_ESTIMABLE' && <p className="text-sm text-stone-500">Καμία απάντηση (π.χ. η συνθήκη follow-up δεν ικανοποιήθηκε).</p>}
      {a.shares && a.n > 0 && (
        <BarChart
          title={q.text}
          data={a.shares.map((s) => (a.evidence?.evidenceClass === 'MODEL_EXTRAPOLATED' ? { label: s.option, value: s.share } : { label: s.option, value: s.share, low: s.ciLow, high: s.ciHigh }))}
        />
      )}
      {a.meanScore != null && a.evidence?.evidenceClass === 'MODEL_EXTRAPOLATED' && (
        <p className="text-sm text-stone-700">
          Μέση τιμή κλίμακας: <strong>{a.meanScore}</strong> (πρόβλεψη μοντέλου· η αβεβαιότητα είναι αυτή που αναφέρεται παραπάνω, όχι το διάστημα της προσομοίωσης)
        </p>
      )}
      {a.meanScore != null && a.evidence?.evidenceClass !== 'MODEL_EXTRAPOLATED' && (
        <p className="text-sm text-stone-700">
          Μέση τιμή κλίμακας: <strong>{a.meanScore}</strong> (95% διάστημα προσομοίωσης {a.meanScoreCi?.[0]}–{a.meanScoreCi?.[1]})
        </p>
      )}
      {a.priceCurve && <PriceCurve title={q.text} points={a.priceCurve} />}
      {a.rankingScores && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="py-1">Επιλογή</th>
              <th>Μέση θέση</th>
              <th>% πρώτη θέση</th>
            </tr>
          </thead>
          <tbody>
            {[...a.rankingScores]
              .sort((x, y) => x.meanRank - y.meanRank)
              .map((r) => (
                <tr key={r.option} className="border-t border-stone-100">
                  <td className="py-1">{r.option}</td>
                  <td>{r.meanRank}</td>
                  <td>{r.firstPlaceShare}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {a.openThemes && (
        <div className="space-y-2">
          <Banner tone="warning">Τα κείμενα είναι συνθετικά και δεν στηρίζονται σε εμπειρικά δεδομένα — χρησιμοποιήστε τα μόνο ως υποθέσεις.</Banner>
          <ul className="space-y-1 text-sm">
            {a.openThemes.map((t) => (
              <li key={t.theme}>
                <strong>{t.theme}</strong> ({t.count}) {t.examples[0] && <span className="text-stone-600">— «{t.examples[0]}»</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.bySegment && q.type !== 'open_ended' && a.n > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-700">Ανάλυση ανά ομάδα</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {Object.entries(a.bySegment).map(([k, rows]) => (
              <table key={k} className="w-full text-xs">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th className="py-1">{SEG_LABEL[k] || k}</th>
                    <th>n</th>
                    <th>Βασικός δείκτης</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.segment} className="border-t border-stone-100">
                      <td className="py-1">{r.segment}</td>
                      <td className={r.n < 30 ? 'text-amber-700' : ''}>{r.n}</td>
                      <td>{r.headline === null ? '—' : `${r.headline}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">Ομάδες με n&lt;30 (πορτοκαλί) έχουν πολύ μεγάλη αβεβαιότητα.</p>
        </details>
      )}
    </Card>
  );
}

export default function StudyResults({ study, report }: { study: StudyRun; report: StudyReport }) {
  const qs = study.plan.questions;
  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: `@media print { body > nav, body > footer, [data-lab-noprint], header, details > summary { display: none !important; } details { display:block } details > * { display:block !important } body { background: white !important } }` }} />
      <div className="space-y-3">
        <SimulatedLabel />
        <h1 className="text-2xl font-semibold tracking-tight">{study.plan.title}</h1>
        <p className="text-sm text-stone-600">{study.plan.researchQuestion}</p>
        <ExportBar id={study.id} />
      </div>

      {study.status === 'blocked' && (
        <Banner tone="danger" title="Η μελέτη δεν εκτελέστηκε">
          {study.warnings.join(' ')}
        </Banner>
      )}

      <Card className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Συνθετικοί ερωτώμενοι" value={study.respondentCount} />
        <Stat label="Λειτουργία" value={study.engine.mode === 'demo' ? 'Demo' : 'Live AI'} hint={study.engine.model || 'χωρίς AI'} />
        <Stat label="Πληθυσμός" value={study.populationSummary.referenceYear || 'ΤΕΧΝΗΤΟ'} hint="έτος αναφοράς" />
        <Stat label="Seed" value={study.seed} />
        <Stat label="Κόστος" value={`$${study.cost.usd.toFixed(4)}`} hint={study.cost.capUsd ? `όριο $${study.cost.capUsd}` : 'demo'} />
        <Stat label="Χρόνος" value={`${(study.durationMs / 1000).toFixed(1)}s`} />
      </Card>

      <Banner tone={study.validation.status === 'partially_validated' ? 'info' : 'warning'} title="Επικύρωση">
        {study.validation.message}
      </Banner>

      {study.warnings.length > 0 && study.status !== 'blocked' && (
        <Banner tone="warning" title="Προειδοποιήσεις & περιορισμοί">
          <ul className="list-disc pl-4">
            {study.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Αποτελέσματα ανά ερώτηση</h2>
        {study.aggregates.map((a) => {
          const q = qs.find((x) => x.id === a.questionId);
          return q ? <QuestionResult key={a.questionId} q={q} a={a} /> : null;
        })}
      </section>

      {study.stability && (
        <Card>
          <h2 className="text-lg font-semibold">Σταθερότητα επαναλαμβανόμενων εκτελέσεων</h2>
          <p className="mt-1 text-sm text-stone-600">
            {study.stability.runs} εκτελέσεις με διαφορετικά seeds. Μέγιστη τυπική απόκλιση ποσοστού: <strong>{study.stability.maxSd} π.μ.</strong> Δείχνει πόσο «θόρυβο»
            έχει η προσομοίωση — όχι πόσο κοντά είναι στην πραγματικότητα.
          </p>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Ερευνητική αναφορά</h2>
        {report.sections.map((s) => (
          <Card key={s.id} className="break-inside-avoid space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold">{s.title}</h3>
              {s.evidence && <EvidenceBadge kind={s.evidence} />}
            </div>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-stone-700 [overflow-wrap:anywhere]">
                {p}
              </p>
            ))}
            {s.bullets && s.bullets.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700 [overflow-wrap:anywhere]">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </section>

      <details className="rounded-xl border border-stone-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold">Δείγμα συνθετικών απαντήσεων (10 πρώτοι)</summary>
        <div className="mt-3 space-y-3 text-sm">
          {study.respondents.slice(0, 10).map((r) => (
            <div key={r.personaId} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="font-mono text-[11px] text-amber-900">{r.label}</div>
              <div className="text-xs text-stone-500">
                {r.personaId} · βάρος {r.weight.toFixed(0)}
              </div>
              <ul className="mt-1 list-disc pl-5">
                {r.answers
                  .filter((x) => !x.skipped && x.value)
                  .map((x) => (
                    <li key={x.questionId}>
                      {x.questionId}:{' '}
                      {x.value!.choice ??
                        x.value!.choices?.join(', ') ??
                        x.value!.ranking?.join(' > ') ??
                        (x.value!.scaleIndex !== undefined ? (qs.find((q) => q.id === x.questionId)?.scale || [])[x.value!.scaleIndex] ?? x.value!.scaleIndex : undefined) ??
                        (x.value!.priceAcceptance ? Object.entries(x.value!.priceAcceptance).filter(([, v]) => v).map(([p]) => `${p}€`).join(', ') || 'καμία τιμή' : undefined) ??
                        x.value!.text}{' '}
                      <span className="text-xs text-stone-500">({BASIS_LABEL[x.basis]})</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
