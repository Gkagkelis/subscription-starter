// Φάση 2: πρόβλεψη, πληθυσμός αναφοράς, PPS, απομόνωση NORAYA.
import { describe, expect, it } from 'vitest';
import { forecastSeries, forecastWave } from '@/lib/synthetic-lab/engine/forecast';
import { band65Comparable, overallComparable, universeFraction } from '@/lib/synthetic-lab/data/universe';
import { latestWaveFor, getMetric } from '@/lib/synthetic-lab/data/noraya';
import { CALIBRATED_POPULATION_ID, loadPopulation, marginals, selectRespondents } from '@/lib/synthetic-lab/population/store';
import type { Persona } from '@/lib/synthetic-lab/types';

const cell = (value: number, n = 500) => ({ value, n, confidence: 'survey', sources: 1, inconsistent: false });

describe('Χρονική πρόβλεψη', () => {
  const series = [
    { year: 2016, value: 30, n: 1000 },
    { year: 2018, value: 34, n: 1000 },
    { year: 2020, value: 38, n: 1000 },
    { year: 2022, value: 42, n: 1000 }
  ];
  it('επιμονή = τελευταία μέτρηση· καμία χρήση μελλοντικών ετών', () => {
    expect(forecastSeries(series, 2024, { method: 'locf' })!.value).toBeCloseTo(42, 1);
    expect(forecastSeries([...series, { year: 2024, value: 90, n: 1000 }], 2024, { method: 'locf' })!.value).toBeCloseTo(42, 1);
  });
  it('γραμμική τάση συνεχίζει την τάση· ο μέσος δεν την ακολουθεί', () => {
    expect(forecastSeries(series, 2024, { method: 'linear' })!.value).toBeGreaterThan(44);
    expect(forecastSeries(series, 2024, { method: 'mean' })!.value).toBeLessThan(38);
  });
  it('kalman: μεγάλος θόρυβος → εξομάλυνση, μικρός θόρυβος → τελευταία τιμή', () => {
    const noisy = [{ year: 2020, value: 30, n: 50 }, { year: 2021, value: 40, n: 50 }, { year: 2022, value: 30, n: 50 }];
    const smooth = forecastSeries(noisy, 2023, { method: 'kalman', q: 0.001 })!.value;
    const sharp = forecastSeries(noisy.map((o) => ({ ...o, n: 100000 })), 2023, { method: 'kalman', q: 0.5 })!.value;
    expect(smooth).toBeGreaterThan(31);
    expect(smooth).toBeLessThan(37);
    expect(Math.abs(sharp - 30)).toBeLessThan(0.5);
  });
  it('λίγες μετρήσεις → μεγαλύτερη αβεβαιότητα', () => {
    const one = forecastSeries(series.slice(-1), 2026, { method: 'kalman', q: 0.02 })!;
    const many = forecastSeries(series, 2023, { method: 'kalman', q: 0.02 })!;
    expect(one.sd).toBeGreaterThan(many.sd);
  });
  it('αποσύνθεση: ομάδα χωρίς πρόσφατη μέτρηση παίρνει τη διαφορά της από παλαιότερο κύμα (συρρικνωμένη)', () => {
    const waves = [
      { key: '2018', year: 2018, quarter: '', groups: { all: { all: cell(40) }, gender: { female: cell(50, 250), male: cell(30, 250) } } },
      { key: '2022', year: 2022, quarter: '', groups: { all: { all: cell(60) } } }
    ];
    const ws = waves as unknown as Parameters<typeof forecastWave>[0];
    const noShrink = forecastWave(ws, 2023, { params: { method: 'locf' }, decompose: true })!;
    const shrunk = forecastWave(ws, 2023, { params: { method: 'locf' }, decompose: true, effectTau2: 0.02 })!;
    expect(noShrink.groups.gender.female.value).toBeGreaterThan(65);
    expect(noShrink.groups.gender.male.value).toBeLessThan(55);
    expect(shrunk.groups.gender.female.value - shrunk.groups.gender.male.value).toBeLessThan(noShrink.groups.gender.female.value - noShrink.groups.gender.male.value);
    expect(noShrink.groups.all.all.value).toBeCloseTo(60, 1);
  });
});

describe('Πληθυσμός αναφοράς (universe)', () => {
  const p = (ageBand: Persona['ageBand'], gender: Persona['gender'] = 'female') => ({ ageBand, gender } as Persona);
  it('16-74: η 15-24 κατά 9/10, η 65+ κατά τον λόγο 65-74/65+', () => {
    const u = { kind: 'individuals' as const, ageMin: 16, ageMax: 74, band65: '65-74' as const };
    expect(universeFraction(p('15-24'), u)).toBeCloseTo(0.9, 5);
    expect(universeFraction(p('35-44'), u)).toBe(1);
    const f = universeFraction(p('65+'), u);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
    expect(band65Comparable(u)).toBe(false);
  });
  it('νοικοκυριά, υποσύνολα και «όλες οι ηλικίες» δεν συγκρίνονται στο σύνολο', () => {
    expect(overallComparable({ kind: 'households', ageMin: null })).toBe(false);
    expect(overallComparable({ kind: 'subpopulation', ageMin: 16 })).toBe(false);
    expect(overallComparable({ kind: 'individuals', ageMin: 0 })).toBe(false);
    expect(overallComparable({ kind: 'individuals', ageMin: 16, ageMax: 74 })).toBe(true);
  });
});

describe('Επιλογή ερωτώμενων PPS', () => {
  it('η σύνθεση ακολουθεί τον βαθμονομημένο πληθυσμό, ίσα βάρη, μοναδικά id', () => {
    const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
    const target = marginals(pop.personas.filter((x) => x.ageBand !== '0-4' && x.ageBand !== '5-14'), true).education;
    const srs = marginals(selectRespondents(pop, { minAge: 15 }, 2000, 7, { weighting: 'region_srs' }).respondents, true).education;
    const sel = selectRespondents(pop, { minAge: 15 }, 2000, 7, { weighting: 'pps' }).respondents;
    const pps = marginals(sel, true).education;
    const dev = (m: Record<string, number>) => Math.max(...Object.keys(target).map((k) => Math.abs((m[k] || 0) - target[k])));
    expect(dev(pps)).toBeLessThan(dev(srs));
    expect(new Set(sel.map((r) => r.id)).size).toBe(sel.length);
    expect(sel.length).toBe(2000);
  });
});

describe('NORAYA: απομόνωση κυμάτων μείγματος ερευνών', () => {
  it('κύμα με qualityFlag δεν χρησιμοποιείται ως τεκμηρίωση', () => {
    const m = getMetric('trust_national_government')!;
    const flagged = m.waves.find((w) => w.qualityFlag === 'mixed_surveys')!;
    expect(flagged).toBeTruthy();
    const got = latestWaveFor('trust_national_government', { asOfYear: flagged.year }).wave!;
    expect(got.qualityFlag).toBeUndefined();
  });
});
