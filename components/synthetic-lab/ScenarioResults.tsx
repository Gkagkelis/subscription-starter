'use client';
import Link from 'next/link';
import type { ScenarioComparison } from '@/lib/synthetic-lab/engine/scenarios';
import { BarChart, GroupedBars } from './charts';
import { Banner, Card, EvidenceBadge, SimulatedLabel } from './ui';

export default function ScenarioResults({ c }: { c: ScenarioComparison }) {
  const name = (id: string) => c.scenarios.find((s) => s.id === id)?.label || id;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SimulatedLabel />
        <h1 className="text-2xl font-semibold tracking-tight">Σύγκριση σεναρίων: {c.title}</h1>
        <p className="text-sm text-stone-600">
          {c.scenarios.length} σενάρια · ίδιο συνθετικό δείγμα (seed {c.seed}) · {c.mode === 'demo' ? 'demo' : 'live AI'} · κόστος ${c.costUsd.toFixed(4)}
        </p>
      </div>
      {c.status === 'blocked' && <Banner tone="danger">{c.warnings.join(' ')}</Banner>}
      <Banner tone="warning" title="Επικύρωση">
        {c.validationMessage}
      </Banner>

      <Card className="space-y-3">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {c.scenarios.map((s) => (
            <li key={s.id}>
              <strong>{s.label}</strong>: {s.description}
              {s.price != null ? ` — ${s.price}€` : ''}
              {s.quality != null ? ` — αξία ${s.quality}/5 (παραδοχή)` : ''}
            </li>
          ))}
        </ul>
      </Card>

      {c.table.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Βασικοί δείκτες ανά σενάριο</h2>
            <EvidenceBadge kind="simulation" />
          </div>
          <GroupedBars
            title="Σύγκριση σεναρίων"
            series={c.scenarios.map((s) => s.label)}
            groups={c.table.map((row) => ({ label: row.questionText, values: row.values.map((v) => v.headline) }))}
          />
          <p className="text-xs text-stone-500">Για κλίμακες: % στις δύο υψηλότερες θέσεις. Για επιλογές: % της συχνότερης επιλογής.</p>
        </Card>
      )}

      {c.pairwise.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Ζευγαρωτές διαφορές (ίδιοι συνθετικοί ερωτώμενοι)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1">Σύγκριση</th>
                <th>Διαφορά (π.μ.)</th>
                <th>95% διάστημα (bootstrap)</th>
                <th>Ερμηνεία</th>
              </tr>
            </thead>
            <tbody>
              {c.pairwise.map((p) => (
                <tr key={p.a + p.b} className="border-t border-stone-100">
                  <td className="py-1">
                    {name(p.a)} − {name(p.b)}
                  </td>
                  <td>{p.diff > 0 ? '+' : ''}{p.diff}</td>
                  <td>
                    {p.ciLow} έως {p.ciHigh}
                  </td>
                  <td className="text-stone-600">{p.ciLow > 0 || p.ciHigh < 0 ? 'Διαφορά πέρα από τον θόρυβο της προσομοίωσης' : 'Μέσα στον θόρυβο της προσομοίωσης'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500">Το διάστημα αφορά μόνο τη μεταβλητότητα της προσομοίωσης· δεν μετρά αν η διαφορά υπάρχει στην πραγματικότητα.</p>
        </Card>
      )}

      {c.preference?.shares && (
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">Άμεση σύγκριση: «ποιο θα προτιμούσατε;»</h2>
          <Banner tone="warning">Προσομοιωμένη προτίμηση — όχι μερίδιο αγοράς, όχι πρόβλεψη πωλήσεων.</Banner>
          <BarChart title="Προσομοιωμένη προτίμηση" data={c.preference.shares.map((s) => ({ label: s.option, value: s.share, low: s.ciLow, high: s.ciHigh }))} />
        </Card>
      )}

      {c.sensitivity.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Ευαισθησία στις παραδοχές</h2>
          <Banner tone={c.robustRanking ? 'ok' : 'warning'}>
            {c.robustRanking
              ? 'Η πρώτη θέση δεν αλλάζει (πέρα από τον θόρυβο της προσομοίωσης) σε καμία από τις εναλλακτικές παραδοχές που ελέγχθηκαν. Αυτό αφορά μόνο τις παραδοχές — όχι την πραγματική αγορά.'
              : 'Η πρώτη θέση ΑΛΛΑΖΕΙ ανάλογα με τις παραδοχές — το αποτέλεσμα εξαρτάται από υποθέσεις, όχι από δεδομένα.'}
          </Banner>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1">Ρύθμιση</th>
                <th>Κατάταξη</th>
              </tr>
            </thead>
            <tbody>
              {c.sensitivity.map((s) => (
                <tr key={s.setting} className="border-t border-stone-100">
                  <td className="py-1">{s.setting}</td>
                  <td>{s.ranking.map((r) => `${r} (${s.headlines[r]}%)`).join(' > ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {c.warnings.length > 0 && (
        <Banner tone="warning" title="Προειδοποιήσεις">
          <ul className="list-disc pl-4">
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Αναλυτικές μελέτες ανά σενάριο</h2>
        <ul className="list-disc pl-5 text-sm">
          {c.runIds.map((id, i) => (
            <li key={id}>
              <Link className="underline" href={`/synthetic-lab/studies/${id}`}>
                {i < c.scenarios.length ? c.scenarios[i].label : 'Άμεση σύγκριση'}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
