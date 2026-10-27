/*
 * Πλαίσιο καταναλωτικών μελετών από ανοιχτές πηγές:
 *  - ECB Consumer Expectations Survey (Ελλάδα, συνολικά): αντιληπτός/αναμενόμενος
 *    πληθωρισμός και αναμενόμενη αύξηση δαπανών νοικοκυριών (σταθμισμένες διάμεσοι).
 *    Όροι ΕΚΤ: ελεύθερη χρήση με αναφορά πηγής.
 *  - Eurostat HBS (hbs_str_t223, Έρευνα Οικογενειακών Προϋπολογισμών ΕΛΣΤΑΤ):
 *    δομή δαπάνης νοικοκυριών ανά εισοδηματικό πεμπτημόριο και κατηγορία COICOP (‰).
 *
 *   npx tsx scripts/synthetic-lab/fetch-consumer-context.ts
 *
 * Γράφει lib/synthetic-lab/data/official/consumer-context.json.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EUROSTAT_LICENSE, eurostatUrl, jsonStatRows, type JsonStat } from '../../lib/synthetic-lab/data/eurostat';

const CES: Record<string, string> = {
  C1020: 'Αντιληπτός πληθωρισμός, τελευταίοι 12 μήνες (%)',
  C1120: 'Αναμενόμενος πληθωρισμός, επόμενοι 12 μήνες (%)',
  C1220: 'Αναμενόμενος πληθωρισμός σε 3 χρόνια (%)',
  C6120: 'Αναμενόμενη αύξηση δαπανών νοικοκυριού, επόμενοι 12 μήνες (%)'
};
const COICOP: Record<string, string> = {
  CP01: 'Τρόφιμα και μη αλκοολούχα ποτά',
  CP02: 'Αλκοολούχα ποτά και καπνός',
  CP03: 'Ένδυση και υπόδηση',
  CP04: 'Στέγαση, νερό, ρεύμα, καύσιμα',
  CP045: 'Ρεύμα, φυσικό αέριο και άλλα καύσιμα',
  CP05: 'Έπιπλα, οικιακός εξοπλισμός',
  CP06: 'Υγεία',
  CP07: 'Μεταφορές',
  CP08: 'Επικοινωνίες',
  CP083: 'Υπηρεσίες τηλεφωνίας και internet',
  CP09: 'Αναψυχή και πολιτισμός',
  CP10: 'Εκπαίδευση',
  CP11: 'Εστιατόρια και ξενοδοχεία',
  CP111: 'Υπηρεσίες εστίασης',
  CP12: 'Διάφορα αγαθά και υπηρεσίες'
};

async function ces() {
  const out: Record<string, { label: string; series: Record<string, number>; latest: number | null; latestMonth: string | null }> = {};
  for (const [code, label] of Object.entries(CES)) {
    const url = `https://data-api.ecb.europa.eu/service/data/CES/M.GR.ALL.T.${code}.NUM_VAR.WM?lastNObservations=24&format=csvdata`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ECB CES ${code}: HTTP ${res.status}`);
    const lines = (await res.text()).trim().split('\n');
    const head = lines[0].split(',');
    const iT = head.indexOf('TIME_PERIOD');
    const iV = head.indexOf('OBS_VALUE');
    const series: Record<string, number> = {};
    for (const l of lines.slice(1)) {
      const c = l.split(',');
      if (c[iV] !== '') series[c[iT]] = Number(c[iV]);
    }
    const months = Object.keys(series).sort();
    const last = months[months.length - 1] || null;
    out[code] = { label, series, latest: last ? series[last] : null, latestMonth: last };
  }
  return out;
}

async function hbs() {
  const url = eurostatUrl('hbs_str_t223', { geo: 'EL', unit: 'PM', coicop: Object.keys(COICOP), quant_inc: ['QU1', 'QU2', 'QU3', 'QU4', 'QU5'], lastTimePeriod: '1' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Eurostat hbs_str_t223: HTTP ${res.status}`);
  const js = (await res.json()) as JsonStat;
  const rows = jsonStatRows(js);
  const shares: Record<string, Record<string, number>> = {};
  let year = 0;
  for (const r of rows) {
    year = Number(r.time);
    (shares[String(r.coicop)] ||= {})[String(r.quant_inc).replace('QU', '')] = Number(r.value);
  }
  return { url, year, updated: js.updated || null, categories: Object.fromEntries(Object.entries(COICOP).filter(([k]) => shares[k]).map(([k, label]) => [k, { label, perMilleByQuintile: shares[k] }])) };
}

async function main() {
  const out = {
    datasetIds: { ces: 'ecb-ces-greece', hbs: 'eurostat-hbs_str_t223' },
    fetchedAt: new Date().toISOString(),
    ces: {
      source: 'ΕΚΤ — Consumer Expectations Survey, Ελλάδα (σύνολο· σταθμισμένες διάμεσοι), ECB Data Portal',
      url: 'https://data.ecb.europa.eu/data/datasets/CES',
      license: 'ΕΚΤ — ελεύθερη επαναχρησιμοποίηση με αναφορά πηγής (ECB website terms)',
      indicators: await ces()
    },
    hbs: {
      source: 'Eurostat hbs_str_t223 — Δομή δαπάνης κατανάλωσης ανά εισοδηματικό πεμπτημόριο (Έρευνα Οικογενειακών Προϋπολογισμών, ΕΛΣΤΑΤ)',
      license: EUROSTAT_LICENSE,
      unit: '‰ της συνολικής δαπάνης κατανάλωσης',
      ...(await hbs())
    }
  };
  const dir = path.resolve(__dirname, '../../lib/synthetic-lab/data/official');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'consumer-context.json'), JSON.stringify(out, null, 1) + '\n');
  for (const [k, v] of Object.entries(out.ces.indicators)) console.log(`✓ CES ${k} ${v.latestMonth}: ${v.latest}`);
  console.log(`✓ HBS ${out.hbs.year}: ${Object.keys(out.hbs.categories).length} κατηγορίες`, out.hbs.categories.CP083);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
