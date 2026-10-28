import { Card } from './ui';

const fmt = (x: unknown) => (x === null || x === undefined ? '—' : String(x));
const FAMILY: Record<string, string> = {
  eb_trend: 'Eurobarometer',
  eurostat_ts: 'Eurostat/ΕΛΣΤΑΤ',
  findex_ts: 'Findex',
  dianeosis_ts: 'διαΝΕΟσις',
  noraya_ts: 'NORAYA'
};
const SPLIT: Record<string, string> = {
  calibration: 'calibration (≤ 2022)',
  validation: 'validation (2023–2024)',
  holdout2: 'νέο holdout (2025–2026, νέα items)'
};

/** Φάση 2: διόρθωση σφαλμάτων, χρονική πρόβλεψη, ομάδες, συσχετίσεις — μετρήσεις από το benchmark (benchmarkOverview().phase2). */
export default function Phase2Panel({ p2 }: { p2: any }) {
  if (!p2) return null;
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-semibold">Φάση 2: συστηματική διόρθωση σφαλμάτων και χρονική πρόβλεψη</h2>
        <p className="text-sm text-stone-700">
          Χρονικοί χωρισμοί (προκαταχώριση στο docs/synthetic-lab/PHASE2_PREREGISTRATION.md). Το προηγούμενο final holdout έχει αποκαλυφθεί και χρησιμοποιείται πλέον μόνο για ρύθμιση/επιλογή.
        </p>
        <ul className="grid gap-1 text-xs text-stone-600 sm:grid-cols-3">
          {Object.entries(p2.splits || {}).map(([k, v]: any) => (
            <li key={k}>
              {SPLIT[k] || k}: {v.items.toLocaleString('el-GR')} items · {v.samples} ανεξάρτητα δείγματα
            </li>
          ))}
        </ul>
      </Card>

      {p2.temporal && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Χρονική πρόβλεψη — validation (2023–2024), μόνο προγενέστερα κύματα</h3>
          <p className="text-xs text-stone-600">
            MAE ανά ανεξάρτητο δείγμα (π.μ.). «Συντονισμένο» = local-level Kalman με θόρυβο δειγματοληψίας, παράμετροι ανά πηγή από το calibration. Κελιά που η πηγή σημαίνει αναξιόπιστα
            («u») ή με διακοπή σειράς («b») δεν βαθμολογούνται.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 pr-2">Μέθοδος</th>
                  <th className="pr-2">Όλες</th>
                  {['eb_trend', 'eurostat_ts'].map((f) => (
                    <th key={f} className="pr-2">
                      {FAMILY[f]}
                    </th>
                  ))}
                  <th>Ομάδες</th>
                </tr>
              </thead>
              <tbody>
                {p2.temporal.variants.map((v: any) => (
                  <tr key={v.label} className="border-t border-stone-100">
                    <td className="py-1 pr-2">{v.label === 'tuned' ? 'συντονισμένο (Kalman)' : v.label}</td>
                    <td className="pr-2">{fmt(v.summary?.sampleMeanMae)}</td>
                    {['eb_trend', 'eurostat_ts'].map((f) => (
                      <td key={f} className="pr-2">
                        {fmt(v.byFamily?.[f]?.sampleMeanMae)}
                      </td>
                    ))}
                    <td>{fmt(v.summary?.groupMae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {p2.comparisons?.length > 0 && (
        <Card className="space-y-1">
          <h3 className="text-sm font-semibold">Ελεγχόμενες συγκρίσεις στο validation (κανόνες αποδοχής)</h3>
          {p2.comparisons.map((c: any) => (
            <p key={c.at} className="text-xs text-stone-700">
              {c.ref} → {c.alt}: {fmt(c.refScore)} → {fmt(c.altScore)} π.μ. · Δ {fmt(c.paired?.meanDelta)} [{fmt(c.paired?.ci95?.[0])}, {fmt(c.paired?.ci95?.[1])}] ·{' '}
              {c.accepted ? 'αποδεκτή' : `όχι: ${(c.reasons || []).join('· ')}`}
            </p>
          ))}
        </Card>
      )}

      {(p2.factors || p2.weightsAudit) && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Δεδομένα και συσχετίσεις</h3>
          {p2.weightsAudit && (
            <p className="text-xs text-stone-600">
              Βάρη διαΝΕΟσις: η παλιά επαναστάθμιση όλων των κυμάτων στο 2025 μείωνε το αποτελεσματικό δείγμα (π.χ.{' '}
              {p2.weightsAudit.map((w: any) => `${w.year}/${w.part}: ${Math.round(w.effectiveNSource)}→${Math.round(w.effectiveNRaked2025)}`).slice(-3).join(', ')}) και μετατόπιζε τις
              εκτιμήσεις κατά μέσο όρο {fmt(Math.min(...p2.weightsAudit.map((w: any) => w.meanAbsDiffAllPp)))}–{fmt(Math.max(...p2.weightsAudit.map((w: any) => w.meanAbsDiffAllPp)))} π.μ. Χρησιμοποιείται πλέον το
              βάρος της πηγής κάθε κύματος.
            </p>
          )}
          {p2.factors && (
            <p className="text-xs text-stone-600">
              Παράγοντες ερωτήσεων από μικροδεδομένα προηγούμενων κυμάτων (K={p2.factors.chosen?.K}): validation 2022 MAE phi εκτός συστοιχίας {fmt(p2.factors.validation2022?.rho?.acrossMae)} →{' '}
              {fmt(p2.factors.validation2022?.factors?.acrossMae)}, εντός {fmt(p2.factors.validation2022?.rho?.withinMae)} → {fmt(p2.factors.validation2022?.factors?.withinMae)}· 2024 (ήδη
              αποκαλυμμένο): {fmt(p2.factors.revealed2024?.rho?.withinMae)} → {fmt(p2.factors.revealed2024?.factors?.withinMae)} — η βελτίωση δεν επαναλήφθηκε.
            </p>
          )}
        </Card>
      )}

      {p2.final2 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Νέο ανεξάρτητο holdout (2025–2026) — μία αξιολόγηση</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 pr-2">Έκδοση / baseline</th>
                  <th className="pr-2">MAE ανά δείγμα</th>
                  <th className="pr-2">σύνολο</th>
                  <th className="pr-2">ομάδες</th>
                  <th>Δ vs επιμονή (95%)</th>
                </tr>
              </thead>
              <tbody>
                {p2.final2.rows.map((r: any) => (
                  <tr key={r.label} className="border-t border-stone-100">
                    <td className="py-1 pr-2">{r.label}</td>
                    <td className="pr-2">{fmt(r.summary?.sampleMeanMae)}</td>
                    <td className="pr-2">{fmt(r.summary?.overallMae)}</td>
                    <td className="pr-2">{fmt(r.summary?.groupMae)}</td>
                    <td>
                      {fmt(r.vsLOCF?.meanDelta)} [{fmt(r.vsLOCF?.ci95?.[0])}, {fmt(r.vsLOCF?.ci95?.[1])}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
