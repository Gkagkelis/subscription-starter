import { mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { BASELINE_MESSAGE, rake } from '@/lib/synthetic-lab/population/calibration';
import { glopopRowCount, readGlopopFile } from '@/lib/synthetic-lab/population/glopop-reader';
import { GLOPOP_GREECE_TOTALS } from '@/lib/synthetic-lab/population/glopop-schema';
import { DEV_FIXTURE_ID } from '@/lib/synthetic-lab/population/fixture';
import { BASELINE_POPULATION_ID, CALIBRATED_POPULATION_ID, DEFAULT_POPULATION_ID, loadPopulation, marginals, matchesAudience, populationIntegrity, selectRespondents } from '@/lib/synthetic-lab/population/store';

/** Φτιάχνει μικρό αρχείο GLOPOP-S (int32 LE, column-major, gzip). */
function fakeGlopop(rows: number[][]): string {
  const n = rows.length;
  const buf = Buffer.alloc(n * 15 * 4);
  for (let c = 0; c < 15; c++) for (let r = 0; r < n; r++) buf.writeInt32LE(rows[r][c], (c * n + r) * 4);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'glopop-'));
  const f = path.join(dir, 'synthpop_TEST.dat.gz');
  writeFileSync(f, gzipSync(buf));
  return f;
}

describe('GLOPOP-S reader', () => {
  // HID, RELATE, INCOME, WEALTH, RURAL, AGE, GENDER, EDUC, HHTYPE, HHSIZE, AGRI, FLOOR, WALL, ROOF, SOURCE
  const rows = [
    [1, 1, 2, -1, 0, 4, 1, 5, 2, 2, -1, -1, -1, -1, 1],
    [1, 2, 2, -1, 0, 4, 0, 4, 2, 2, -1, -1, -1, -1, 1],
    [2, 1, 5, -1, 1, 8, 0, 2, 1, 1, -1, -1, -1, -1, 1],
    [3, 1, 1, -1, 1, 6, 1, 3, 3, 3, -1, -1, -1, -1, 1],
    [3, 3, 1, -1, 1, 2, 0, 1, 3, 3, -1, -1, -1, -1, 1]
  ];
  it('reads row count from gzip trailer and selected rows by column-major layout', async () => {
    const f = fakeGlopop(rows);
    expect(glopopRowCount(f)).toBe(5);
    const r = await readGlopopFile(f, [0, 2, 4]);
    expect(r.n).toBe(5);
    expect(r.households).toBe(3);
    expect(r.hidMonotonic).toBe(true);
    expect(r.rows.get(2)).toMatchObject({ HID: 2, INCOME: 5, AGE: 8, GENDER: 0, EDUC: 2, HHTYPE: 1 });
    expect(r.rows.get(4)).toMatchObject({ HID: 3, RELATE_HEAD: 3, AGE: 2 });
    expect(r.tallies.GENDER).toEqual({ '0': 3, '1': 2 });
    // επίπεδο νοικοκυριού: μόνο αρχηγοί (RELATE_HEAD = 1)
    expect(r.householdTallies.HHTYPE).toEqual({ '2': 1, '1': 1, '3': 1 });
  });
});

describe('bundled GLOPOP-S Greece sample', () => {
  const pop = loadPopulation(BASELINE_POPULATION_ID)!;
  it('loads 5000 personas representing the full 2015 population', () => {
    expect(pop.personas).toHaveLength(5000);
    expect(pop.summary.representedPopulation).toBe(GLOPOP_GREECE_TOTALS.individuals);
    const w = pop.personas.reduce((s, p) => s + p.weight, 0);
    expect(Math.abs(w - GLOPOP_GREECE_TOTALS.individuals)).toBeLessThan(1);
    expect(pop.summary.referenceYear).toBe(2015);
    expect(pop.summary.updateStatus.calibrated).toBe(false);
    expect(pop.summary.updateStatus.message).toBe(BASELINE_MESSAGE);
  });
  it('every persona has stable id, provenance, vintage and explicit unknowns', () => {
    const ids = new Set(pop.personas.map((p) => p.id));
    expect(ids.size).toBe(5000);
    for (const p of pop.personas.slice(0, 50)) {
      expect(p.id).toMatch(/^gp-/);
      expect(p.provenance.sourceFile).toMatch(/^synthpop_GRCr1\d\d\.dat\.gz$/);
      expect(p.dataVintage).toBe(2015);
      expect(p.unknownAttributes).toContain('employment');
      expect(p.wealthQuintile).toBeNull();
    }
  });
  it('integrity checks against published GLOPOP-S statistics passed for all 13 regions', () => {
    const integ = populationIntegrity(BASELINE_POPULATION_ID) as any;
    expect(integ.regions).toHaveLength(13);
    for (const r of integ.regions) {
      expect(r.rows).toBe(r.expectedRows);
      expect(r.households).toBe(r.expectedHouseholds);
      expect(r.mismatches).toBe(0);
      expect(r.publishedChecked).toBeGreaterThan(30);
    }
  });
  it('audience selection respects filters and reweights to the filtered population', () => {
    const f = { minAge: 25, genders: ['female' as const], regions: ['GRCr101'] };
    const sel = selectRespondents(pop, f, 100, 1);
    expect(sel.respondents.length).toBe(100);
    expect(sel.respondents.every((p) => matchesAudience(p, f))).toBe(true);
    const w = sel.respondents.reduce((s, p) => s + p.weight, 0);
    expect(Math.abs(w - sel.representedPopulation) / sel.representedPopulation).toBeLessThan(1e-9);
    // ίδιο seed => ίδιο δείγμα
    expect(selectRespondents(pop, f, 100, 1).respondents.map((p) => p.id)).toEqual(sel.respondents.map((p) => p.id));
  });
  it('dev fixture is clearly flagged', () => {
    const fx = loadPopulation(DEV_FIXTURE_ID)!;
    expect(fx.summary.isDevFixture).toBe(true);
    expect(fx.summary.qualityNotes[0]).toMatch(/ΤΕΧΝΗΤΟ/);
  });
});

describe('official 2025 calibration (Eurostat)', () => {
  it('is the default population and matches official 2025 totals by region, age and sex', () => {
    expect(DEFAULT_POPULATION_ID).toBe(CALIBRATED_POPULATION_ID);
    const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
    expect(pop.summary.representedPopulation).toBe(10372335);
    expect(pop.summary.updateStatus.calibrated).toBe(true);
    expect(pop.summary.updateStatus.targetYear).toBe(2025);
    expect(pop.summary.updateStatus.message).toMatch(/παραμένουν του 2015/);
    const byRegion = (code: string) => pop.personas.filter((p) => p.regionCode === code).reduce((s, p) => s + p.weight, 0);
    expect(Math.abs(byRegion('GRCr101') - 3764272) / 3764272).toBeLessThan(0.002);
    // διορθωμένη αντιστροφή Βορείου (EL41) / Νοτίου (EL42) Αιγαίου
    expect(byRegion('GRCr103')).toBeGreaterThan(byRegion('GRCr102'));
    const old65 = marginals(loadPopulation(BASELINE_POPULATION_ID)!.personas).ageBand['65+'];
    expect(marginals(pop.personas).ageBand['65+']).toBeGreaterThan(old65);
  });

  it('calibrates education by age and sex to the 2025 Labour Force Survey (ISCED 5-8)', () => {
    const pop = loadPopulation(CALIBRATED_POPULATION_ID)!;
    expect(pop.summary.updateStatus.message).toMatch(/εκπαίδευση/);
    const share = (band: string, sex: string, lvl: string) => {
      const cell = pop.personas.filter((p) => p.ageBand === band && p.gender === sex);
      const tot = cell.reduce((s, p) => s + p.weight, 0);
      return cell.filter((p) => p.education === lvl).reduce((s, p) => s + p.weight, 0) / tot;
    };
    // Eurostat edat_lfs_9901 2025: τριτοβάθμια 25-34 ≈ 43% (σύνολο φύλων)· γυναίκες > άνδρες
    expect(share('25-34', 'female', 'tertiary')).toBeGreaterThan(0.4);
    expect(share('25-34', 'female', 'tertiary')).toBeGreaterThan(share('25-34', 'male', 'tertiary'));
    const adults = (ps: typeof pop.personas) => ps.filter((p) => !['0-4', '5-14'].includes(p.ageBand));
    const before = marginals(adults(loadPopulation(BASELINE_POPULATION_ID)!.personas)).education.tertiary;
    expect(marginals(adults(pop.personas)).education.tertiary).toBeGreaterThan(before + 2);
  });
});

describe('raking (calibration)', () => {
  it('matches target margins and reports convergence', () => {
    const pop = loadPopulation(BASELINE_POPULATION_ID)!;
    const before = marginals(pop.personas).gender;
    const res = rake(pop.personas, pop.personas.map((p) => p.weight), [{ attribute: 'gender', totals: { female: 60, male: 40 } }]);
    expect(res.converged).toBe(true);
    expect(res.after.gender.female).toBeCloseTo(60, 1);
    expect(before.female).not.toBeCloseTo(60, 0);
  });
});
