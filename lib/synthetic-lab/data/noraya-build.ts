// ============================================================
// NORAYA adapter — μετατροπή του public_opinion.csv σε "empirical priors".
//
// Τι ΕΙΝΑΙ τα δεδομένα: συγκεντρωτικά σταθμισμένα ποσοστά (0-100) ανά
// ΜΙΑ διάσταση κάθε φορά (ηλικία Ή φύλο Ή μόρφωση ...), ανά κύμα έρευνας.
// Τι ΔΕΝ είναι: ατομικές απαντήσεις ή διασταυρώσεις (π.χ. ηλικία × φύλο).
//
// Κανόνες:
//  - Δεν δημιουργούμε ατομικές εγγραφές από τα ποσοστά.
//  - Διπλές μετρήσεις στο ίδιο κύμα (π.χ. δύο έρευνες στο ίδιο τρίμηνο)
//    συνδυάζονται με στάθμιση n· αν διαφέρουν πέρα από 3 τυπικά σφάλματα,
//    η ομάδα σημειώνεται "inconsistent" και δεν χρησιμοποιείται στην επικύρωση.
//  - Πολιτικός προσανατολισμός (left_right_placement) εξαιρείται πολιτικά.
// ============================================================

import { parseCsvObjects } from '../csv';

export interface PriorCell {
  value: number; // 0-100
  n: number; // σταθμισμένο έγκυρο n
  confidence: string;
  sources: number; // πόσες γραμμές συνδυάστηκαν
  inconsistent: boolean;
}

export interface PriorWave {
  key: string; // "2024-Q4"
  year: number;
  quarter: string;
  groups: Record<string, Record<string, PriorCell>>; // group_type -> group -> cell
}

export interface PriorMetric {
  metric: string;
  family: string;
  label: string;
  semanticsNote: string;
  waves: PriorWave[];
}

export interface NorayaPriors {
  meta: {
    datasetId: string;
    sourceFile: string;
    sourceSha256: string;
    rows: number;
    builtFromRows: number;
    excludedMetrics: Record<string, string>;
    notes: string[];
  };
  metrics: Record<string, PriorMetric>;
}

export const EXCLUDED_METRICS: Record<string, string> = {
  left_right_placement:
    'Πολιτικός αυτοπροσδιορισμός (αριστερά–δεξιά). Εξαιρείται: το Lab δεν μοντελοποιεί πολιτικό προσανατολισμό ατόμων.'
};

export const METRIC_LABELS: Record<string, string> = {
  democracy_satisfaction_country: 'Ικανοποίηση από τη λειτουργία της δημοκρατίας στην Ελλάδα',
  democracy_satisfaction_eu: 'Ικανοποίηση από τη λειτουργία της δημοκρατίας στην ΕΕ',
  expectation_national_economy: 'Προσδοκίες για την εθνική οικονομία',
  expectation_personal_job: 'Προσδοκίες για την προσωπική εργασιακή κατάσταση',
  trust_national_government: 'Εμπιστοσύνη στην εθνική κυβέρνηση',
  trust_national_parliament: 'Εμπιστοσύνη στο εθνικό κοινοβούλιο',
  trust_european_union: 'Εμπιστοσύνη στην Ευρωπαϊκή Ένωση',
  employment_country_situation: 'Θετική αξιολόγηση της απασχόλησης στη χώρα',
  national_economy_situation: 'Θετική αξιολόγηση της εθνικής οικονομίας',
  household_financial_situation: 'Θετική αξιολόγηση οικονομικής κατάστασης νοικοκυριού',
  issue_country_crime_security: 'Αναφέρει την εγκληματικότητα ως κύριο πρόβλημα της χώρας',
  issue_country_environment_climate: 'Αναφέρει περιβάλλον/κλίμα ως κύριο πρόβλημα της χώρας',
  issue_country_health: 'Αναφέρει την υγεία ως κύριο πρόβλημα της χώρας',
  issue_country_housing: 'Αναφέρει τη στέγαση ως κύριο πρόβλημα της χώρας',
  issue_country_immigration: 'Αναφέρει τη μετανάστευση ως κύριο πρόβλημα της χώρας',
  issue_country_inflation: 'Αναφέρει την ακρίβεια/πληθωρισμό ως κύριο πρόβλημα της χώρας',
  issue_country_unemployment: 'Αναφέρει την ανεργία ως κύριο πρόβλημα της χώρας'
};

const SEMANTICS_NOTE =
  'Η ακριβής διατύπωση και κωδικοποίηση της ερώτησης δεν τεκμηριώνεται μέσα στο repository· η ερμηνεία ως «ποσοστό θετικής/καταφατικής απάντησης» προκύπτει από το όνομα του δείκτη και πρέπει να επιβεβαιωθεί με την πρωτογενή πηγή (Eurobarometer).';

export function buildNorayaPriors(csvText: string, sourceSha256: string): NorayaPriors {
  const rows = parseCsvObjects(csvText);
  type Acc = { values: number[]; ns: number[]; conf: string[] };
  const acc = new Map<string, Acc>();
  const familyOf: Record<string, string> = {};
  let used = 0;

  for (const r of rows) {
    if (EXCLUDED_METRICS[r.metric]) continue;
    if (r.data_status && r.data_status !== 'ok') continue;
    const value = Number(r.value_weighted_0_100);
    const n = Number(r.n_valid_weighted);
    const year = Number(r.survey_year);
    if (!Number.isFinite(value) || !Number.isFinite(n) || !Number.isFinite(year) || n <= 0) continue;
    familyOf[r.metric] = r.metric_family;
    const key = [r.metric, year, r.survey_quarter, r.group_type, r.group].join('\u0001');
    const a = acc.get(key) || { values: [], ns: [], conf: [] };
    a.values.push(value);
    a.ns.push(n);
    a.conf.push(r.sample_confidence);
    acc.set(key, a);
    used++;
  }

  const metrics: Record<string, PriorMetric> = {};
  acc.forEach((a, key) => {
    const [metric, yearS, quarter, groupType, group] = key.split('\u0001');
    const year = Number(yearS);
    const nTot = a.ns.reduce((s, x) => s + x, 0);
    const value = a.values.reduce((s, v, i) => s + v * a.ns[i], 0) / nTot;
    let inconsistent = false;
    if (a.values.length > 1) {
      // έλεγχος συμβατότητας: διαφορά από τον συνδυασμένο μέσο > 3 SE ;
      for (let i = 0; i < a.values.length; i++) {
        const p = value / 100;
        const se = Math.sqrt((p * (1 - p)) / a.ns[i]) * 100;
        if (Math.abs(a.values[i] - value) > 3 * Math.max(se, 0.5)) inconsistent = true;
      }
    }
    const m =
      metrics[metric] ||
      (metrics[metric] = {
        metric,
        family: familyOf[metric] || 'unknown',
        label: METRIC_LABELS[metric] || metric,
        semanticsNote: SEMANTICS_NOTE,
        waves: []
      });
    const wkey = `${year}-${quarter}`;
    let w = m.waves.find((x) => x.key === wkey);
    if (!w) {
      w = { key: wkey, year, quarter, groups: {} };
      m.waves.push(w);
    }
    (w.groups[groupType] = w.groups[groupType] || {})[group] = {
      value: Math.round(value * 100) / 100,
      n: Math.round(nTot),
      confidence: a.conf[0],
      sources: a.values.length,
      inconsistent
    };
  });

  Object.values(metrics).forEach((m) => m.waves.sort((x, y) => x.key.localeCompare(y.key)));

  return {
    meta: {
      datasetId: 'noraya-public-opinion',
      sourceFile: 'public/noraya-data/public_opinion.csv',
      sourceSha256,
      rows: rows.length,
      builtFromRows: used,
      excludedMetrics: EXCLUDED_METRICS,
      notes: [
        'Συγκεντρωτικά ποσοστά ανά μία διάσταση· όχι ατομικές απαντήσεις, όχι διασταυρώσεις.',
        'Διπλές μετρήσεις ίδιου κύματος συνδυάζονται με στάθμιση n· ασυμβατότητες > 3 SE σημειώνονται.',
        SEMANTICS_NOTE
      ]
    },
    metrics
  };
}
