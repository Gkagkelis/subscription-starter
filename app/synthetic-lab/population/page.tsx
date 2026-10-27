import { BarChart } from '@/components/synthetic-lab/charts';
import { Banner, Card, EvidenceBadge, PageTitle, Stat } from '@/components/synthetic-lab/ui';
import { describePersonaLong, EDU_LABEL, GENDER_LABEL, HH_LABEL, quintileLabel, SETTLEMENT_LABEL } from '@/lib/synthetic-lab/engine/persona-text';
import { defaultPopulationId, listPopulationSummaries, loadPopulation, marginals, populationAttribution, populationIntegrity } from '@/lib/synthetic-lab/population/store';
import { GLOPOP_GREECE_REGIONS } from '@/lib/synthetic-lab/population/glopop-schema';
import { createRng } from '@/lib/synthetic-lab/rng';

export const dynamic = 'force-dynamic';

const REGION = Object.fromEntries(GLOPOP_GREECE_REGIONS.map((r) => [r.code, r.nameEl]));
const LABELS: Record<string, { title: string; fmt: (k: string) => string }> = {
  ageBand: { title: 'Ηλικία', fmt: (k) => k },
  gender: { title: 'Φύλο', fmt: (k) => (GENDER_LABEL as any)[k] || k },
  regionCode: { title: 'Περιφέρεια', fmt: (k) => REGION[k] || k },
  education: { title: 'Εκπαίδευση', fmt: (k) => (EDU_LABEL as any)[k] || k },
  settlement: { title: 'Αστική / αγροτική', fmt: (k) => (SETTLEMENT_LABEL as any)[k] || k },
  incomeQuintile: { title: 'Εισοδηματικό πεμπτημόριο', fmt: (k) => (k === 'unknown' ? 'άγνωστο' : quintileLabel(Number(k))) },
  householdType: { title: 'Τύπος νοικοκυριού', fmt: (k) => (HH_LABEL as any)[k] || k }
};

export default function PopulationPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams.id || defaultPopulationId();
  const pop = loadPopulation(id);
  const all = listPopulationSummaries();
  if (!pop) return <Banner tone="danger">Ο πληθυσμός δεν βρέθηκε.</Banner>;
  const m = marginals(pop.personas);
  const integ = populationIntegrity(id) as any;
  const sample = createRng(7).shuffle([...pop.personas]).slice(0, 12);
  return (
    <div className="space-y-6">
      <PageTitle title="Πληθυσμός & Κοινά" subtitle="Τα συνθετικά προφίλ προέρχονται από εγγραφές του GLOPOP-S — όχι από φαντασία AI. Κάθε προφίλ έχει σταθερό ID, βάρος και προέλευση." />
      {all.length > 1 && (
        <Card>
          <div className="text-sm font-medium">Διαθέσιμοι πληθυσμοί</div>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {all.map((p) => (
              <li key={p.id}>
                <a className="underline" href={`/synthetic-lab/population?id=${p.id}`}>
                  {p.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Banner tone={pop.summary.isDevFixture ? 'danger' : pop.summary.updateStatus.calibrated ? 'ok' : 'warning'} title={pop.summary.name}>
        {pop.summary.updateStatus.message}
      </Banner>
      <Card className="grid gap-4 sm:grid-cols-4">
        <Stat label="Έτος αναφοράς" value={pop.summary.referenceYear || '—'} />
        <Stat label="Αντιπροσωπεύει" value={pop.summary.representedPopulation.toLocaleString('el-GR')} hint="άτομα (άθροισμα βαρών)" />
        <Stat label="Συνθετικά προφίλ" value={pop.summary.sampleSize.toLocaleString('el-GR')} hint={`seed ${pop.summary.seed}`} />
        <Stat label="Έλεγχοι ακεραιότητας" value={integ ? `${integ.regions.filter((r: any) => r.mismatches === 0 && r.rows === r.expectedRows).length}/${integ.regions.length} περιφέρειες` : '—'} hint="έναντι δημοσιευμένων στατιστικών GLOPOP-S" />
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Ποιότητα δεδομένων & γνωστά ζητήματα</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {pop.summary.qualityNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="text-xs text-stone-500">{populationAttribution(id)}</p>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {Object.entries(LABELS).map(([k, l]) => (
          <Card key={k} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{l.title}</h3>
              <EvidenceBadge kind="estimate" />
            </div>
            <BarChart
              title={l.title}
              max={Math.min(100, Math.ceil(Math.max(...Object.values(m[k])) / 10) * 10 + 10)}
              data={Object.entries(m[k])
                .sort((a, b) => (k === 'ageBand' ? a[0].localeCompare(b[0], 'el', { numeric: true }) : b[1] - a[1]))
                .map(([key, v]) => ({ label: l.fmt(key), value: v }))}
            />
          </Card>
        ))}
      </section>
      <p className="text-xs text-stone-500">Σταθμισμένες κατανομές του δείγματος (2015). Δεν είναι κατανομές του 2026.</p>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Παραδείγματα συνθετικών προφίλ</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sample.map((p) => (
            <div key={p.id} className="rounded-lg border border-stone-200 p-3 text-sm">
              <div className="font-mono text-xs text-stone-500">{p.id}</div>
              <div className="mt-1">{describePersonaLong(p)}</div>
              <div className="mt-2 text-xs text-stone-500">
                Βάρος: {p.weight.toFixed(0)} άτομα · Προέλευση: {p.provenance.sourceFile} #{p.provenance.sourceRecord} · νοικοκυριό {p.provenance.householdId} · έτος {p.dataVintage}
              </div>
              <div className="mt-1 text-xs text-amber-800">Άγνωστα: {p.unknownAttributes.join(', ')}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500">Τα προφίλ δεν περιέχουν απόψεις ή καταναλωτικές προτιμήσεις — αυτές δεν έχουν μετρηθεί σε αυτά τα δεδομένα.</p>
      </Card>
    </div>
  );
}
