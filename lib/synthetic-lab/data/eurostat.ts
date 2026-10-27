// ============================================================
// Eurostat adapter (JSON-stat 2.0, Statistics API 1.0).
// Άδεια: Eurostat — Commission Decision 2011/833/EU / CC BY 4.0
// (επαναχρησιμοποίηση και εμπορικά, με αναφορά πηγής).
// ============================================================

export const EUROSTAT_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
export const EUROSTAT_LICENSE = 'Eurostat — CC BY 4.0 (Commission Decision 2011/833/EU), επαναχρησιμοποίηση με αναφορά πηγής';

/** NUTS 2021 (Eurostat) -> GDL (GLOPOP-S). */
export const NUTS2_TO_GDL: Record<string, string> = {
  EL30: 'GRCr101', // Αττική
  EL41: 'GRCr102', // Βόρειο Αιγαίο
  EL42: 'GRCr103', // Νότιο Αιγαίο
  EL43: 'GRCr104', // Κρήτη
  EL51: 'GRCr105', // Ανατολική Μακεδονία & Θράκη
  EL52: 'GRCr106', // Κεντρική Μακεδονία
  EL53: 'GRCr107', // Δυτική Μακεδονία
  EL54: 'GRCr108', // Ήπειρος
  EL61: 'GRCr109', // Θεσσαλία
  EL62: 'GRCr110', // Ιόνια Νησιά
  EL63: 'GRCr111', // Δυτική Ελλάδα
  EL64: 'GRCr112', // Στερεά Ελλάδα
  EL65: 'GRCr113' // Πελοπόννησος
};

export interface JsonStat {
  value: Record<string, number> | number[];
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number>; label?: Record<string, string> } }>;
  updated?: string;
  label?: string;
}

/** Μετατρέπει JSON-stat σε γραμμές { διάσταση: κωδικός, ..., value }. */
export function jsonStatRows(js: JsonStat): Record<string, string | number>[] {
  const dims = js.id;
  const cats = dims.map((d) => {
    const idx = js.dimension[d].category.index;
    const arr: string[] = [];
    Object.entries(idx).forEach(([code, i]) => (arr[i] = code));
    return arr;
  });
  const strides = dims.map((_, k) => js.size.slice(k + 1).reduce((a, b) => a * b, 1));
  const out: Record<string, string | number>[] = [];
  const entries: [number, number][] = Array.isArray(js.value)
    ? js.value.map((v, i) => [i, v] as [number, number]).filter(([, v]) => v !== null && v !== undefined)
    : Object.entries(js.value).map(([k, v]) => [Number(k), v]);
  for (const [flat, v] of entries) {
    const row: Record<string, string | number> = { value: v };
    let rem = flat;
    dims.forEach((d, k) => {
      const pos = Math.floor(rem / strides[k]);
      rem -= pos * strides[k];
      row[d] = cats[k][pos];
    });
    out.push(row);
  }
  return out;
}

export function eurostatUrl(dataset: string, params: Record<string, string | string[]>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x)));
  return `${EUROSTAT_API}/${dataset}?${q.toString()}`;
}

/** Ζώνες Eurostat (5ετίες) -> ζώνες GLOPOP-S. */
export const EUROSTAT_AGE_TO_GLOPOP: Record<string, string> = {
  Y_LT5: '0-4',
  'Y5-9': '5-14',
  'Y10-14': '5-14',
  'Y15-19': '15-24',
  'Y20-24': '15-24',
  'Y25-29': '25-34',
  'Y30-34': '25-34',
  'Y35-39': '35-44',
  'Y40-44': '35-44',
  'Y45-49': '45-54',
  'Y50-54': '45-54',
  'Y55-59': '55-64',
  'Y60-64': '55-64',
  'Y65-69': '65+',
  'Y70-74': '65+',
  'Y_GE75': '65+'
};
