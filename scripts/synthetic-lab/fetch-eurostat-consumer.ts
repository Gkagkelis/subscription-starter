/*
 * Καταναλωτικές συμπεριφορές Ελλάδας από την Έρευνα ΤΠΕ νοικοκυριών
 * (ΕΛΣΤΑΤ/Eurostat, άτομα 16-74) -> empirical priors για το Lab.
 *
 *   npx tsx scripts/synthetic-lab/fetch-eurostat-consumer.ts
 *
 * Γράφει lib/synthetic-lab/data/official/eurostat-ict.json
 * (Eurostat CC BY 4.0 — επιτρέπεται αναδιανομή με αναφορά πηγής).
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EUROSTAT_LICENSE, eurostatUrl, jsonStatRows, type JsonStat } from '../../lib/synthetic-lab/data/eurostat';
import type { PriorCell, PriorMetric, PriorWave } from '../../lib/synthetic-lab/data/noraya-build';

interface Indicator {
  dataset: string;
  code: string;
  metric: string;
  label: string;
  question: string;
}

// Επιλεγμένοι δείκτες με καταναλωτική αξία (ποσοστό ατόμων 16-74).
const INDICATORS: Indicator[] = [
  { dataset: 'isoc_ec_ib20', code: 'I_BLT12', metric: 'ict_online_purchase_12m', label: 'Αγόρασε online τους τελευταίους 12 μήνες', question: 'Έχετε αγοράσει κάτι μέσω internet τους τελευταίους 12 μήνες;' },
  { dataset: 'isoc_ec_ib20', code: 'I_BUY3', metric: 'ict_online_purchase_3m', label: 'Αγόρασε online τους τελευταίους 3 μήνες', question: 'Έχετε αγοράσει κάτι μέσω internet τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ib20', code: 'I_BF_HI', metric: 'ict_online_frequent', label: 'Συχνές online αγορές (6+ φορές σε 3 μήνες)', question: 'Αγοράσατε online 6 ή περισσότερες φορές τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BFLMS2', metric: 'ict_sub_video_streaming', label: 'Πληρωμένη συνδρομή σε streaming ταινιών/σειρών/αθλητικών', question: 'Έχετε πληρωμένη συνδρομή σε υπηρεσία streaming ταινιών, σειρών ή αθλητικών;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BMUSS2', metric: 'ict_sub_music_streaming', label: 'Πληρωμένη συνδρομή σε streaming μουσικής', question: 'Έχετε πληρωμένη συνδρομή σε υπηρεσία streaming μουσικής;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BBOOKNLS2', metric: 'ict_sub_news', label: 'Πληρωμένη συνδρομή σε ειδησεογραφικό site/e-paper', question: 'Έχετε πληρωμένη συνδρομή σε ειδησεογραφικό site ή ψηφιακή εφημερίδα;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BHLFTS2', metric: 'ict_sub_health_app', label: 'Πληρωμένη συνδρομή σε εφαρμογή υγείας/γυμναστικής', question: 'Έχετε πληρωμένη συνδρομή σε εφαρμογή υγείας ή γυμναστικής;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BSIMC', metric: 'ict_buy_telecom_online', label: 'Αγόρασε online συνδρομή internet ή κινητής (3 μήνες)', question: 'Αγοράσατε ή ανανεώσατε online συνδρομή internet ή κινητής τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BSUTIL', metric: 'ict_buy_utilities_online', label: 'Αγόρασε online συνδρομή ρεύματος/νερού/θέρμανσης (3 μήνες)', question: 'Αγοράσατε online συνδρομή ρεύματος, νερού ή θέρμανσης τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BFDR', metric: 'ict_food_delivery', label: 'Παρήγγειλε online φαγητό από εστιατόριο (3 μήνες)', question: 'Παραγγείλατε online φαγητό από εστιατόριο ή fast-food τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BFDS', metric: 'ict_groceries_online', label: 'Αγόρασε online τρόφιμα από καταστήματα (3 μήνες)', question: 'Αγοράσατε online τρόφιμα ή ποτά από κατάστημα τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BCLOT1', metric: 'ict_clothes_online', label: 'Αγόρασε online ρούχα/παπούτσια (3 μήνες)', question: 'Αγοράσατε online ρούχα, παπούτσια ή αξεσουάρ τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BHARD1', metric: 'ict_electronics_online', label: 'Αγόρασε online υπολογιστή/κινητό/αξεσουάρ (3 μήνες)', question: 'Αγοράσατε online υπολογιστή, tablet, κινητό ή αξεσουάρ τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BCBW', metric: 'ict_cosmetics_online', label: 'Αγόρασε online καλλυντικά/ευεξία (3 μήνες)', question: 'Αγοράσατε online καλλυντικά ή προϊόντα ευεξίας τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BTICK2', metric: 'ict_tickets_online', label: 'Αγόρασε online εισιτήρια εκδηλώσεων (3 μήνες)', question: 'Αγοράσατε online εισιτήρια για εκδηλώσεις τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BRA', metric: 'ict_accommodation_online', label: 'Έκλεισε online διαμονή (3 μήνες)', question: 'Κλείσατε online διαμονή (ξενοδοχείο, κατάλυμα) τους τελευταίους 3 μήνες;' },
  { dataset: 'isoc_ec_ibgs', code: 'I_BMED1', metric: 'ict_medicine_online', label: 'Αγόρασε online φάρμακα/συμπληρώματα (3 μήνες)', question: 'Αγοράσατε online φάρμακα ή συμπληρώματα διατροφής τους τελευταίους 3 μήνες;' }
];

const AGE = { Y16_24: '15-24', Y25_34: '25-34', Y35_44: '35-44', Y45_54: '45-54', Y55_64: '55-64', Y65_74: '65+' } as Record<string, string>;
const SEX = { M: 'male', F: 'female' } as Record<string, string>;
const EDU = { I0_2: 'low_education', I3_4: 'medium_education', I5_8: 'high_education' } as Record<string, string>;
const URB = { IND_DEG1: 'cities', IND_DEG2: 'towns_suburbs', IND_DEG3: 'rural' } as Record<string, string>;

function indTypes(): string[] {
  const t = ['IND_TOTAL', ...Object.keys(AGE), ...Object.keys(EDU), ...Object.keys(URB), 'M_Y16_74', 'F_Y16_74'];
  Object.keys(AGE).forEach((a) => Object.keys(SEX).forEach((s) => t.push(`${s}_${a}`)));
  return t;
}

function classify(ind: string): { dim: string; group: string } | null {
  if (ind === 'IND_TOTAL') return { dim: 'all', group: 'all' };
  if (AGE[ind]) return { dim: 'age_band', group: AGE[ind] };
  if (EDU[ind]) return { dim: 'education_group', group: EDU[ind] };
  if (URB[ind]) return { dim: 'urbanisation', group: URB[ind] };
  if (ind === 'M_Y16_74') return { dim: 'gender', group: 'male' };
  if (ind === 'F_Y16_74') return { dim: 'gender', group: 'female' };
  const m = ind.match(/^([MF])_(Y\d+_\d+)$/);
  if (m && AGE[m[2]]) return { dim: 'age_gender', group: `${AGE[m[2]]}|${SEX[m[1]]}` };
  return null;
}

async function main() {
  const metrics: PriorMetric[] = [];
  const sources: { dataset: string; url: string; updated: string | null }[] = [];
  for (const dataset of Array.from(new Set(INDICATORS.map((i) => i.dataset)))) {
    const inds = INDICATORS.filter((i) => i.dataset === dataset);
    const url = eurostatUrl(dataset, { geo: 'EL', unit: 'PC_IND', indic_is: inds.map((i) => i.code), ind_type: indTypes(), sinceTimePeriod: '2021' });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${dataset}: HTTP ${res.status}`);
    const js = (await res.json()) as JsonStat & { status?: Record<string, string> };
    sources.push({ dataset, url, updated: js.updated || null });
    // status flags (π.χ. 'u' = χαμηλή αξιοπιστία) ανά θέση
    const flags = js.status || {};
    const rows = jsonStatRows(js);
    const sizes = js.size;
    const ids = js.id;
    const posOf = (r: Record<string, string | number>) => {
      let flat = 0;
      ids.forEach((d, k) => {
        const idx = js.dimension[d].category.index[String(r[d])];
        flat = flat * sizes[k] + idx;
      });
      return flat;
    };
    for (const ind of inds) {
      const waves = new Map<string, PriorWave>();
      rows
        .filter((r) => r.indic_is === ind.code)
        .forEach((r) => {
          const c = classify(String(r.ind_type));
          if (!c) return;
          const year = Number(r.time);
          const key = `${year}`;
          const w = waves.get(key) || { key, year, quarter: 'Q2', groups: {} };
          const flag = flags[String(posOf(r))] || '';
          const cell: PriorCell & { nUnknown: true; flag: string } = {
            value: Number(r.value),
            n: 0,
            nUnknown: true,
            confidence: flag.includes('u') ? 'low' : 'official',
            sources: 1,
            // κελιά χαμηλής αξιοπιστίας (Eurostat flag 'u') εξαιρούνται από fit/επικύρωση
            inconsistent: flag.includes('u'),
            flag
          };
          (w.groups[c.dim] = w.groups[c.dim] || {})[c.group] = cell;
          waves.set(key, w);
        });
      const ws = Array.from(waves.values()).filter((w) => w.groups.all?.all).sort((a, b) => a.key.localeCompare(b.key));
      if (!ws.length) {
        console.warn(`! ${ind.metric}: χωρίς δεδομένα για την Ελλάδα`);
        continue;
      }
      metrics.push({
        metric: ind.metric,
        family: 'consumer_digital',
        label: ind.label,
        semanticsNote: `Eurostat ${dataset} / ${ind.code} (Έρευνα ΤΠΕ νοικοκυριών ΕΛΣΤΑΤ). % ατόμων 16-74. Ερώτηση: «${ind.question}». Το n των κελιών δεν δημοσιεύεται.`,
        waves: ws,
        scheme: 'eurostat_ict',
        datasetId: 'eurostat-isoc-ict',
        question: ind.question
      } as PriorMetric);
      console.log(`✓ ${ind.metric}: ${ws.map((w) => `${w.key}=${w.groups.all.all.value}%`).join(' ')}`);
    }
  }
  const out = {
    datasetId: 'eurostat-isoc-ict',
    source: 'Eurostat — ICT usage in households and by individuals (isoc_ec_ib20, isoc_ec_ibgs), δεδομένα ΕΛΣΤΑΤ',
    license: EUROSTAT_LICENSE,
    universe: 'Άτομα 16-74 ετών',
    fetchedAt: new Date().toISOString(),
    sources,
    metrics
  };
  const dir = path.resolve(__dirname, '../../lib/synthetic-lab/data/official');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'eurostat-ict.json'), JSON.stringify(out) + '\n');
  console.log(`✓ ${metrics.length} δείκτες -> lib/synthetic-lab/data/official/eurostat-ict.json`);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
