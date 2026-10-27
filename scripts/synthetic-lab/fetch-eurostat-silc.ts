/*
 * EU-SILC (Έρευνα Εισοδήματος & Συνθηκών Διαβίωσης, ΕΛΣΤΑΤ/Eurostat):
 * δείκτες οικονομικής δυσκολίας νοικοκυριών για την Ελλάδα, ανά τύπο
 * νοικοκυριού × κίνδυνο φτώχειας (κάτω/πάνω από το 60% του διάμεσου εισοδήματος).
 *
 *   npx tsx scripts/synthetic-lab/fetch-eurostat-silc.ts
 *
 * Γράφει lib/synthetic-lab/data/official/eurostat-silc.json (Eurostat CC BY 4.0).
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EUROSTAT_LICENSE, eurostatUrl, jsonStatRows, type JsonStat } from '../../lib/synthetic-lab/data/eurostat';
import type { PriorCell, PriorMetric, PriorWave } from '../../lib/synthetic-lab/data/noraya-build';

const BINARY: { dataset: string; metric: string; label: string; question: string; options: [string, string]; positiveOption: string }[] = [
  { dataset: 'ilc_mdes04', metric: 'silc_unexpected_expense', label: 'Αδυναμία αντιμετώπισης απρόβλεπτης δαπάνης', question: 'Μπορεί το νοικοκυριό σας να αντιμετωπίσει μια απρόβλεπτη αλλά αναγκαία δαπάνη (περίπου 600€) με δικά του μέσα;', options: ['Ναι', 'Όχι'], positiveOption: 'Όχι' },
  { dataset: 'ilc_mdes02', metric: 'silc_no_holiday', label: 'Αδυναμία μιας εβδομάδας διακοπών τον χρόνο εκτός σπιτιού', question: 'Μπορεί το νοικοκυριό σας να πληρώσει μία εβδομάδα διακοπές τον χρόνο μακριά από το σπίτι;', options: ['Ναι', 'Όχι'], positiveOption: 'Όχι' },
  { dataset: 'ilc_mdes01', metric: 'silc_cold_home', label: 'Αδυναμία να διατηρείται το σπίτι επαρκώς ζεστό', question: 'Μπορεί το νοικοκυριό σας να διατηρεί το σπίτι επαρκώς ζεστό;', options: ['Ναι', 'Όχι'], positiveOption: 'Όχι' },
  { dataset: 'ilc_mdes03', metric: 'silc_no_protein_meal', label: 'Αδυναμία γεύματος με κρέας/κοτόπουλο/ψάρι (ή χορτοφαγικό ισοδύναμο) κάθε δεύτερη μέρα', question: 'Μπορεί το νοικοκυριό σας να έχει γεύμα με κρέας, κοτόπουλο ή ψάρι (ή χορτοφαγικό ισοδύναμο) κάθε δεύτερη μέρα;', options: ['Ναι', 'Όχι'], positiveOption: 'Όχι' },
  { dataset: 'ilc_mdes05', metric: 'silc_arrears_any', label: 'Οφειλές (ενοίκιο/δάνειο κατοικίας, λογαριασμοί ή δόσεις) τους τελευταίους 12 μήνες', question: 'Τους τελευταίους 12 μήνες, καθυστέρησε το νοικοκυριό σας πληρωμή ενοικίου/στεγαστικού, λογαριασμών ή δόσεων λόγω οικονομικών δυσκολιών;', options: ['Ναι', 'Όχι'], positiveOption: 'Ναι' },
  { dataset: 'ilc_mdes06', metric: 'silc_arrears_housing', label: 'Οφειλές σε ενοίκιο ή στεγαστικό δάνειο', question: 'Τους τελευταίους 12 μήνες, καθυστέρησε το νοικοκυριό σας την πληρωμή ενοικίου ή στεγαστικού δανείου λόγω οικονομικών δυσκολιών;', options: ['Ναι', 'Όχι'], positiveOption: 'Ναι' },
  { dataset: 'ilc_mdes07', metric: 'silc_arrears_utilities', label: 'Οφειλές σε λογαριασμούς κοινής ωφέλειας', question: 'Τους τελευταίους 12 μήνες, καθυστέρησε το νοικοκυριό σας την πληρωμή λογαριασμών (ρεύμα, νερό, θέρμανση) λόγω οικονομικών δυσκολιών;', options: ['Ναι', 'Όχι'], positiveOption: 'Ναι' },
  { dataset: 'ilc_mdes08', metric: 'silc_arrears_loans', label: 'Οφειλές σε δόσεις ή άλλα δάνεια', question: 'Τους τελευταίους 12 μήνες, καθυστέρησε το νοικοκυριό σας δόσεις αγορών ή άλλων δανείων λόγω οικονομικών δυσκολιών;', options: ['Ναι', 'Όχι'], positiveOption: 'Ναι' }
];
const ENDS_MEET: Record<string, string> = {
  GRT: 'Με μεγάλη δυσκολία',
  DIF: 'Με δυσκολία',
  SOME: 'Με κάποια δυσκολία',
  FEASY: 'Αρκετά εύκολα',
  EASY: 'Εύκολα',
  VEASY: 'Πολύ εύκολα'
};
const HH = ['TOTAL', 'M1', 'F1', 'A1', 'A1_DCH', 'A2', 'A2_DCH1', 'A2_DCH2', 'A2_DCH_GE3', 'A_GE3', 'A_GE3_DCH'];
const POV: Record<string, string> = { A_60: 'above', B_60: 'below' };

type Cell = PriorCell & { nUnknown: true; flag: string };

async function fetchTable(dataset: string, extra: Record<string, string | string[]> = {}) {
  const url = eurostatUrl(dataset, { geo: 'EL', unit: 'PC', hhcomp: HH, rskpovth: ['TOTAL', 'A_60', 'B_60'], sinceTimePeriod: '2019', ...extra });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${dataset}: HTTP ${res.status}`);
  const js = (await res.json()) as JsonStat & { status?: Record<string, string> };
  const flags = js.status || {};
  const posOf = (r: Record<string, string | number>) =>
    js.id.reduce((flat, d, k) => flat * js.size[k] + js.dimension[d].category.index[String(r[d])], 0);
  return { url, updated: js.updated || null, rows: jsonStatRows(js).map((r) => ({ ...r, flag: flags[String(posOf(r))] || '' }) as Record<string, string | number> & { flag: string }) };
}

function toWaves(rows: (Record<string, string | number> & { flag: string })[]): PriorWave[] {
  const waves = new Map<string, PriorWave>();
  for (const r of rows) {
    const year = Number(r.time);
    const w = waves.get(String(year)) || { key: String(year), year, quarter: 'Q2', groups: {} };
    const flag = r.flag;
    const cell: Cell = { value: Number(r.value), n: 0, nUnknown: true, confidence: flag.includes('u') ? 'low' : 'official', sources: 1, inconsistent: flag.includes('u'), flag };
    const hh = String(r.hhcomp);
    const pov = String(r.rskpovth);
    if (hh === 'TOTAL' && pov === 'TOTAL') (w.groups.all ||= {}).all = cell;
    else if (hh === 'TOTAL') (w.groups.poverty ||= {})[POV[pov]] = cell;
    else if (pov === 'TOTAL') (w.groups.household ||= {})[hh] = cell;
    else (w.groups.hh_pov ||= {})[`${hh}|${POV[pov]}`] = cell;
    waves.set(String(year), w);
  }
  return Array.from(waves.values()).filter((w) => w.groups.all?.all).sort((a, b) => a.key.localeCompare(b.key));
}

async function main() {
  const metrics: PriorMetric[] = [];
  const sources: { dataset: string; url: string; updated: string | null }[] = [];
  for (const b of BINARY) {
    const t = await fetchTable(b.dataset);
    sources.push({ dataset: b.dataset, url: t.url, updated: t.updated });
    const waves = toWaves(t.rows);
    metrics.push({
      metric: b.metric,
      family: 'household_finances',
      label: b.label,
      semanticsNote: `Eurostat ${b.dataset} (EU-SILC, ΕΛΣΤΑΤ). % ατόμων που ζουν σε νοικοκυριά με αυτή την κατάσταση, ανά τύπο νοικοκυριού × κίνδυνο φτώχειας. Έτος = έτος έρευνας (εισόδημα προηγούμενου έτους). n ανά κελί δεν δημοσιεύεται.`,
      waves,
      scheme: 'eurostat_silc',
      datasetId: 'eurostat-silc',
      question: b.question,
      answerOptions: b.options,
      positiveOption: b.positiveOption
    } as PriorMetric);
    console.log(`✓ ${b.metric}: ${waves.map((w) => `${w.key}=${w.groups.all.all.value}%`).join(' ')}`);
  }
  // «Τα βγάζετε πέρα;» — κατανομή 6 επιλογών
  const t = await fetchTable('ilc_mdes09', { lev_diff: Object.keys(ENDS_MEET) });
  sources.push({ dataset: 'ilc_mdes09', url: t.url, updated: t.updated });
  const optionMetrics: Record<string, string> = {};
  for (const [code, label] of Object.entries(ENDS_MEET)) {
    const metric = `silc_ends_meet__${code.toLowerCase()}`;
    optionMetrics[label] = metric;
    const waves = toWaves(t.rows.filter((r) => r.lev_diff === code));
    metrics.push({
      metric,
      family: 'household_finances',
      label: `Το νοικοκυριό τα βγάζει πέρα — «${label}»`,
      semanticsNote: 'Eurostat ilc_mdes09 (EU-SILC, ΕΛΣΤΑΤ). % ατόμων ανά βαθμό δυσκολίας, ανά τύπο νοικοκυριού × κίνδυνο φτώχειας.',
      waves,
      scheme: 'eurostat_silc',
      datasetId: 'eurostat-silc',
      question: 'Με το συνολικό μηνιαίο εισόδημα του νοικοκυριού σας, πώς τα βγάζετε πέρα;'
    } as PriorMetric);
    console.log(`✓ ${metric}: ${waves.map((w) => `${w.key}=${w.groups.all.all.value}%`).join(' ')}`);
  }
  const out = {
    datasetId: 'eurostat-silc',
    source: 'Eurostat — EU-SILC, υλική στέρηση και οικονομική δυσκολία νοικοκυριών (ilc_mdes01–09), δεδομένα ΕΛΣΤΑΤ',
    license: EUROSTAT_LICENSE,
    universe: 'Άτομα σε ιδιωτικά νοικοκυριά',
    fetchedAt: new Date().toISOString(),
    sources,
    questions: [
      {
        id: 'silc_ends_meet',
        text: 'Με το συνολικό μηνιαίο εισόδημα του νοικοκυριού σας, πώς τα βγάζετε πέρα;',
        options: Object.values(ENDS_MEET),
        dkOptions: [],
        optionMetrics,
        n: 0
      }
    ],
    metrics
  };
  const dir = path.resolve(__dirname, '../../lib/synthetic-lab/data/official');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'eurostat-silc.json'), JSON.stringify(out) + '\n');
  console.log(`✓ ${metrics.length} δείκτες -> lib/synthetic-lab/data/official/eurostat-silc.json`);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
