// ============================================================
// Χρονική πρόβλεψη ποσοστών από προγενέστερα πραγματικά κύματα (φάση 2.2).
//
// Κάθε σειρά = παρατηρήσεις (έτος, ποσοστό, n) ενός κελιού (σύνολο ή ομάδα) μιας ερώτησης/δείκτη.
// Μέθοδοι (σε κλίμακα logit, ώστε να μένουν στο [0,1]):
//   locf     — τελευταία παρατήρηση (επιμονή)
//   mean     — ιστορικός μέσος
//   linear   — γραμμική τάση OLS (≥ 3 παρατηρήσεις, αλλιώς locf)
//   damped   — τάση με συρρίκνωση της κλίσης (empirical Bayes) και απόσβεση φ^h
//   kalman   — local level (random walk + θόρυβος δειγματοληψίας): φιλτραρισμένο επίπεδο, με προαιρετική
//              κλίση (local linear trend) με απόσβεση. Ο θόρυβος κάθε κύματος προκύπτει από το n (όπου δημοσιεύεται)
//              ή από παράμετρο ανά πηγή· η διακύμανση επιπέδου q ανά έτος εκτιμάται στο calibration.
// Επιστρέφει και διάστημα πρόβλεψης (sd στην κλίμακα ποσοστού), ώστε ανεπαρκές ιστορικό → υψηλή αβεβαιότητα.
// ============================================================

import type { PriorCell, PriorWave } from '../data/noraya-build';

export interface Obs {
  year: number;
  /** 0-100 */
  value: number;
  /** μέγεθος δείγματος του κελιού (null = άγνωστο, π.χ. Eurostat) */
  n: number | null;
}

export type ForecastMethod = 'locf' | 'mean' | 'linear' | 'damped' | 'kalman';

export interface ForecastParams {
  method: ForecastMethod;
  /** kalman: διακύμανση μεταβολής επιπέδου ανά έτος (logit²). */
  q?: number;
  /** kalman: διακύμανση κλίσης ανά έτος (logit²)· 0 = μόνο επίπεδο. */
  qSlope?: number;
  /** damped/kalman: απόσβεση κλίσης ανά έτος. */
  phi?: number;
  /** damped: συντελεστής συρρίκνωσης κλίσης (0..1). */
  slopeShrink?: number;
  /** θόρυβος δειγματοληψίας όταν το n είναι άγνωστο (logit²). */
  noiseUnknownN?: number;
  /** σχεδιαστικό φαινόμενο για τον θόρυβο από n. */
  deff?: number;
}

export interface Forecast {
  /** 0-100 */
  value: number;
  /** τυπική απόκλιση πρόβλεψης (π.μ.) — συνδυάζει αβεβαιότητα επιπέδου/κλίσης· ΟΧΙ τον θόρυβο του μελλοντικού δείγματος */
  sd: number;
  method: ForecastMethod;
  nObs: number;
  lastYear: number;
  horizon: number;
}

const EPS = 0.004;
const clampP = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
const lg = (v: number) => {
  const p = clampP(v / 100);
  return Math.log(p / (1 - p));
};
const inv = (x: number) => 100 / (1 + Math.exp(-x));

/** διακύμανση θορύβου μιας παρατήρησης στην κλίμακα logit (δέλτα μέθοδος) */
function obsVar(o: Obs, prm: ForecastParams): number {
  const p = clampP(o.value / 100);
  if (o.n && o.n > 0) return (prm.deff ?? 1.5) / (o.n * p * (1 - p));
  return prm.noiseUnknownN ?? 0.002;
}

/** sd στην κλίμακα ποσοστού από sd στην κλίμακα logit γύρω από το x */
function sdPct(x: number, sdLogit: number): number {
  const p = 1 / (1 + Math.exp(-x));
  return 100 * p * (1 - p) * sdLogit;
}

export function forecastSeries(series: Obs[], targetYear: number, prm: ForecastParams): Forecast | null {
  const obs = series.filter((o) => Number.isFinite(o.value) && o.year < targetYear).sort((a, b) => a.year - b.year);
  if (!obs.length) return null;
  const last = obs[obs.length - 1];
  const h = Math.max(0, targetYear - last.year);
  const base = { method: prm.method, nObs: obs.length, lastYear: last.year, horizon: h };
  const ys = obs.map((o) => lg(o.value));
  const vLast = obsVar(last, prm);

  if (prm.method === 'locf' || obs.length === 1) {
    // αβεβαιότητα: θόρυβος της τελευταίας μέτρησης + μεταβολή h ετών (με q αν δίνεται, αλλιώς προεπιλογή)
    const x = ys[ys.length - 1];
    return { ...base, method: obs.length === 1 && prm.method !== 'locf' ? 'locf' : prm.method, value: inv(x), sd: sdPct(x, Math.sqrt(vLast + (prm.q ?? 0.02) * Math.max(1, h))) };
  }
  if (prm.method === 'mean') {
    const x = ys.reduce((a, b) => a + b, 0) / ys.length;
    const v = ys.reduce((a, b) => a + (b - x) ** 2, 0) / Math.max(1, ys.length - 1);
    return { ...base, value: inv(x), sd: sdPct(x, Math.sqrt(v + v / ys.length)) };
  }
  if (prm.method === 'linear' || prm.method === 'damped') {
    if (obs.length < 3) return forecastSeries(series, targetYear, { ...prm, method: 'locf' });
    const xs = obs.map((o) => o.year);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    let b = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
    const resid = ys.map((y, i) => y - (my + b * (xs[i] - mx)));
    const s2 = resid.reduce((a, r) => a + r * r, 0) / Math.max(1, ys.length - 2);
    if (prm.method === 'damped') {
      b *= prm.slopeShrink ?? 0.5;
      const phi = prm.phi ?? 0.8;
      // επίπεδο στο τελευταίο έτος από τη γραμμή, μετά απόσβεση της κλίσης για h έτη
      const level = my + b * (last.year - mx);
      const damp = phi === 1 ? h : (phi * (1 - phi ** h)) / (1 - phi);
      const x = level + b * damp;
      return { ...base, value: inv(x), sd: sdPct(x, Math.sqrt(s2 * (1 + 1 / ys.length) + (prm.q ?? 0.02) * Math.max(1, h))) };
    }
    const x = my + b * (targetYear - mx);
    const se = Math.sqrt(s2 * (1 + 1 / ys.length + (targetYear - mx) ** 2 / Math.max(sxx, 1e-9)));
    return { ...base, value: inv(x), sd: sdPct(x, se) };
  }
  // kalman: local level ή local linear trend με απόσβεση, χρόνος σε έτη (ακανόνιστα διαστήματα)
  const q = prm.q ?? 0.02;
  const qs = prm.qSlope ?? 0;
  const phi = prm.phi ?? 1;
  let m = ys[0];
  let s = 0;
  // διάχυτη αρχικοποίηση επιπέδου, κλίση 0 με διακύμανση qs*10
  let P11 = obsVar(obs[0], prm);
  let P12 = 0;
  let P22 = qs > 0 ? qs * 10 : 0;
  for (let i = 1; i < obs.length; i++) {
    const dt = Math.max(0.25, obs[i].year - obs[i - 1].year);
    // πρόβλεψη: m' = m + s*D, s' = φ^dt s
    const D = qs > 0 ? (phi === 1 ? dt : (phi * (1 - phi ** dt)) / (1 - phi)) : 0;
    const F = qs > 0 ? phi ** dt : 0;
    m = m + s * D;
    s = s * F;
    const n11 = P11 + 2 * D * P12 + D * D * P22 + q * dt;
    const n12 = F * (P12 + D * P22);
    const n22 = F * F * P22 + qs * dt;
    // ενημέρωση με y
    const R = obsVar(obs[i], prm);
    const S = n11 + R;
    const K1 = n11 / S;
    const K2 = n12 / S;
    const e = ys[i] - m;
    m += K1 * e;
    s += K2 * e;
    P11 = (1 - K1) * n11;
    P12 = (1 - K1) * n12;
    P22 = n22 - K2 * n12;
  }
  const D = qs > 0 ? (phi === 1 ? h : (phi * (1 - phi ** h)) / (1 - phi)) : 0;
  const x = m + s * D;
  const v = P11 + 2 * D * P12 + D * D * P22 + q * h;
  return { ...base, value: inv(x), sd: sdPct(x, Math.sqrt(Math.max(v, 0))) };
}

// ---------------- Πρόβλεψη ολόκληρου κύματος (σύνολο + ομάδες) για τον engine ----------------


export interface ForecastConfig {
  /** μέθοδος για το σύνολο (και για τις ομάδες όταν decompose = false) */
  params: ForecastParams;
  /**
   * Αποσύνθεση επίπεδο + επιδράσεις ομάδων (ιεραρχικό δυναμικό μοντέλο):
   *   ομάδα_t = logit⁻¹( επίπεδο_t + επίδραση_ομάδας )
   * Η επίδραση (logit ομάδας − logit συνόλου του ΙΔΙΟΥ κύματος) εκτιμάται από όσα κύματα έχουν τη διάσπαση,
   * ως σταθμισμένος μέσος (ακρίβεια × χρονική απόσβεση) με συρρίκνωση προς 0 (prior N(0, τ²)).
   * Έτσι οι ομάδες ΧΩΡΙΣ πρόσφατη μέτρηση παίρνουν τη διαφορά τους από παλαιότερα κύματα της ίδιας ερώτησης,
   * συρρικνωμένη ανάλογα με την αβεβαιότητα — όχι από άλλες ομάδες ή άλλες ερωτήσεις.
   */
  decompose?: boolean;
  /** διασπορά prior των επιδράσεων (logit²)· Infinity = χωρίς συρρίκνωση */
  effectTau2?: number;
  /** χρονική απόσβεση βάρους επιδράσεων (half-life σε έτη)· Infinity = ίσα βάρη */
  effectHalfLife?: number;
}

function cellVar(c: PriorCell, prm: ForecastParams): number {
  return obsVar({ year: 0, value: c.value, n: c.nUnknown ? null : c.n }, prm);
}

/**
 * Συνθετικό κύμα-πρόβλεψη για το targetYear από τα επιτρεπτά (προγενέστερα) κύματα ενός δείκτη.
 * Τα κελιά φέρουν confidence «forecast» και n = n του πιο πρόσφατου κελιού (για τους ελέγχους μεγέθους).
 */
export function forecastWave(waves: PriorWave[], targetYear: number, cfg: ForecastConfig): PriorWave | null {
  const ws = waves.filter((w) => w.groups.all?.all && w.year < targetYear + 1).sort((a, b) => a.year - b.year || a.key.localeCompare(b.key));
  if (!ws.length) return null;
  const last = ws[ws.length - 1];
  const prm = cfg.params;
  const allObs: Obs[] = ws.map((w) => ({ year: w.year, value: w.groups.all.all.value, n: w.groups.all.all.nUnknown ? null : w.groups.all.all.n }));
  const fAll = forecastSeries(allObs, targetYear, prm);
  if (!fAll) return null;
  const mk = (value: number, ref: PriorCell | undefined): PriorCell => ({
    value: Math.round(value * 100) / 100,
    n: ref?.n ?? 0,
    ...(ref?.nUnknown || !ref ? { nUnknown: true } : {}),
    confidence: 'forecast',
    sources: ws.length,
    inconsistent: false
  });
  const groups: PriorWave['groups'] = { all: { all: mk(fAll.value, last.groups.all.all) } };
  const dims = new Set<string>();
  ws.forEach((w) => Object.keys(w.groups).forEach((d) => d !== 'all' && dims.add(d)));
  const L = lg(fAll.value);
  for (const d of Array.from(dims)) {
    const gnames = new Set<string>();
    ws.forEach((w) => Object.keys(w.groups[d] || {}).forEach((g) => gnames.add(g)));
    for (const g of Array.from(gnames)) {
      const ref = [...ws].reverse().find((w) => w.groups[d]?.[g] && !w.groups[d][g].inconsistent)?.groups[d][g];
      if (!ref) continue;
      if (!cfg.decompose) {
        const obs: Obs[] = ws.filter((w) => w.groups[d]?.[g] && !w.groups[d][g].inconsistent).map((w) => ({ year: w.year, value: w.groups[d][g].value, n: w.groups[d][g].nUnknown ? null : w.groups[d][g].n }));
        const f = forecastSeries(obs, targetYear, prm);
        if (f) (groups[d] ||= {})[g] = mk(f.value, ref);
        continue;
      }
      let num = 0;
      let den = 0;
      for (const w of ws) {
        const c = w.groups[d]?.[g];
        if (!c || c.inconsistent) continue;
        const e = lg(c.value) - lg(w.groups.all.all.value);
        const v = cellVar(c, prm) + cellVar(w.groups.all.all, prm);
        const hl = cfg.effectHalfLife ?? Infinity;
        const decay = Number.isFinite(hl) ? 0.5 ** ((targetYear - w.year) / hl) : 1;
        num += (decay / v) * e;
        den += decay / v;
      }
      if (den <= 0) continue;
      const tau2 = cfg.effectTau2 ?? Infinity;
      const eff = num / (den + (Number.isFinite(tau2) ? 1 / tau2 : 0));
      (groups[d] ||= {})[g] = mk(inv(L + eff), ref);
    }
  }
  return { key: `forecast-${targetYear}`, year: targetYear, quarter: '', datasetId: last.datasetId, groups };
}
