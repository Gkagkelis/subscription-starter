import { Card } from './ui';
import { benchmarkOverview } from '@/lib/synthetic-lab/benchmark/overview';
import Phase2Panel from './Phase2Panel';

const FAMILY: Record<string, string> = {
  eb_trend: 'Eurobarometer (επαναλαμβανόμενες ερωτήσεις)',
  eurostat_ts: 'Eurostat/ΕΛΣΤΑΤ (χρονοσειρές)',
  findex_ts: 'World Bank Findex',
  dianeosis_ts: 'διαΝΕΟσις',
  noraya_ts: 'NORAYA'
};

const fmt = (x: unknown) => (x === null || x === undefined ? '—' : String(x));

/** Benchmark πραγματικών ελληνικών ερευνών: σουίτα, πειράματα διάγνωσης, εκδόσεις και αποφάσεις. */
export default function BenchmarkPanel() {
  const o = benchmarkOverview();
  if (!o.suite) {
    return (
      <Card className="space-y-2">
        <h2 className="font-semibold">Benchmark πραγματικών ελληνικών ερευνών</h2>
        <p className="text-sm text-stone-600">
          Δεν έχει δημιουργηθεί σουίτα. Τρέξε <code>npx tsx scripts/synthetic-lab/benchmark.ts suite</code> (απαιτεί το τοπικό Research Data Lake).
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Phase2Panel p2={o.phase2} />
      <Card className="space-y-2">
        <h2 className="font-semibold">Benchmark πραγματικών ελληνικών ερευνών</h2>
        <p className="text-sm text-stone-700">
          Σουίτα {o.suite.hash}: {o.suite.items.toLocaleString('el-GR')} πραγματικά στοιχεία από ανεξάρτητα δείγματα — calibration {o.suite.samples.calibration}, validation{' '}
          {o.suite.samples.validation}, final holdout {o.suite.samples.holdout}. Τυφλή αναπαραγωγή: το engine βλέπει μόνο δεδομένα πριν από το έτος πεδίου, χωρίς την
          έρευνα-στόχο, τα διπλότυπά της και ό,τι μοιράζεται το ίδιο δείγμα.
        </p>
        <ul className="grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
          {Object.entries(o.suite.counts).map(([f, c]) => (
            <li key={f}>
              {FAMILY[f] || f}: {Object.entries(c).map(([s, n]) => `${s} ${n}`).join(' · ')}
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-500">Παραγωγική έκδοση: {o.production.version} — {o.production.description}. Δεν αλλάζει χωρίς αποδεδειγμένη βελτίωση και έγκριση.</p>
      </Card>
      {o.experiments.map((e) => (
        <Card key={e.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{e.id}</h3>
          <p className="text-xs text-stone-600">{e.hypothesis}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 pr-2">Παραλλαγή</th>
                  <th className="pr-2">items</th>
                  <th className="pr-2">MAE σύνολο</th>
                  <th className="pr-2">επιμονή</th>
                  <th className="pr-2">MAE ομάδες</th>
                  <th className="pr-2">θόρυβος</th>
                  <th>επιδράσεις (κλίση, 1 = σωστό)</th>
                </tr>
              </thead>
              <tbody>
                {e.variants.map((v: any) => (
                  <tr key={v.label} className="border-t border-stone-100">
                    <td className="py-1 pr-2">{v.label}</td>
                    <td className="pr-2">{v.summary.okItems}</td>
                    <td className="pr-2">{fmt(v.summary.overallMae)}</td>
                    <td className="pr-2">{fmt(v.summary.persistOverallMae)}</td>
                    <td className="pr-2">{fmt(v.summary.groupMae)}</td>
                    <td className="pr-2">{fmt(v.summary.noiseFloor)}</td>
                    <td>{v.gaps.map((g: any) => `${g.factor} ${fmt(g.slope)}`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {e.paired.map((p: any) => (
            <p key={p.label} className="text-xs text-stone-600">
              Δ «{p.label}» έναντι πρώτης: σύνολο {fmt(p.meanDeltaOverall)} π.μ., ομάδες {fmt(p.meanDeltaGroup)} π.μ., 95% διάστημα (ανά δείγμα) {p.ci95 ? `[${p.ci95.join(', ')}]` : '—'}
            </p>
          ))}
        </Card>
      ))}
      {o.assoc && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Συσχετίσεις μεταξύ ερωτήσεων (μικροδεδομένα διαΝΕΟσις, {o.assoc.split})</h3>
          <p className="text-xs text-stone-600">
            Phi μεταξύ ζευγών ερωτήσεων: πραγματικά έναντι συνθετικών. «Συστοιχία» = ερωτήσεις του ίδιου μπλοκ. ρ = ισχύς του κοινού λανθάνοντα παράγοντα ανά συστοιχία
            (0 = παραγωγή, ανεξάρτητες απαντήσεις). Επιλογή ρ = {fmt(o.assoc.chosenRho)}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 pr-2">ρ</th>
                  <th className="pr-2">phi πραγμ. (συστοιχία)</th>
                  <th className="pr-2">phi συνθ. (συστοιχία)</th>
                  <th className="pr-2">MAE συστοιχία</th>
                  <th>MAE εκτός συστοιχίας</th>
                </tr>
              </thead>
              <tbody>
                {o.assoc.rows.map((r: any) => (
                  <tr key={r.rho} className="border-t border-stone-100">
                    <td className="py-1 pr-2">{r.rho}</td>
                    <td className="pr-2">{fmt(r.withinRealMean)}</td>
                    <td className="pr-2">{fmt(r.withinSimMean)}</td>
                    <td className="pr-2">{fmt(r.withinMae)}</td>
                    <td>{fmt(r.acrossMae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {o.models.length > 0 && (
        <Card className="space-y-1">
          <h3 className="text-sm font-semibold">Πειραματικές εκδόσεις (δεν είναι παραγωγικές)</h3>
          {o.models.map((m) => (
            <div key={m.version} className="text-xs text-stone-700">
              <p>
                <span className="font-medium">{m.version}</span>: {m.description}
              </p>
              <ul className="list-disc pl-5 text-stone-500">
                {m.notes.map((n: string) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
      {o.decisions.length > 0 && (
        <Card className="space-y-1">
          <h3 className="text-sm font-semibold">Αποφάσεις (validation / final holdout)</h3>
          {o.decisions.map((d: any) => (
            <div key={`${d.type}-${d.at}`} className="text-xs text-stone-700">
              <p>
                {d.type === 'select'
                  ? `Validation ${String(d.at).slice(0, 10)} (σουίτα ${d.suiteHash}): παραγωγή ${fmt(d.production?.score)} π.μ. — επιλέχθηκε ${d.selected || 'καμία υποψήφια'}.`
                  : `Final holdout ${String(d.at).slice(0, 10)} (${d.version}): παραγωγή ${fmt(d.production?.score)} → υποψήφια ${fmt(d.candidate?.score)} π.μ. ${d.recommendation}`}
              </p>
              {d.type === 'select' &&
                (d.outcomes || []).map((x: any) => (
                  <p key={x.version} className="pl-3 text-stone-500">
                    {x.version}: {fmt(x.score)} π.μ. (ομάδες {fmt(x.group)}) — {x.accepted ? 'πέρασε τους κανόνες' : x.reasons.join(' ')}
                    {x.priorValidationLooks ? ` · ${x.priorValidationLooks + 1}η αξιολόγηση στο validation` : ''}
                  </p>
                ))}
              {d.note && <p className="pl-3 text-stone-500">Σημείωση: {d.note}</p>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
