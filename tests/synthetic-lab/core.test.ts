import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects, toCsv } from '@/lib/synthetic-lab/csv';
import { createRng, deriveSeed, stableId } from '@/lib/synthetic-lab/rng';
import { effectiveN, logit, mae, sigmoid, totalVariationDistance, wilson } from '@/lib/synthetic-lab/stats';
import { largestRemainder, sampleIndices } from '@/lib/synthetic-lab/population/sampling';

describe('stats', () => {
  it('wilson interval contains p and is bounded', () => {
    const [lo, hi] = wilson(0.3, 100);
    expect(lo).toBeLessThan(0.3);
    expect(hi).toBeGreaterThan(0.3);
    expect(lo).toBeGreaterThan(0.2);
    expect(hi).toBeLessThan(0.41);
    const [lo0] = wilson(0, 10);
    expect(lo0).toBe(0);
  });
  it('effective n equals n for equal weights and shrinks for unequal', () => {
    expect(effectiveN([2, 2, 2, 2])).toBeCloseTo(4);
    expect(effectiveN([1, 1, 1, 10])).toBeLessThan(4);
  });
  it('mae / tvd / logit', () => {
    expect(mae([{ predicted: 10, observed: 12 }, { predicted: 5, observed: 1 }])).toBe(3);
    expect(totalVariationDistance({ a: 1, b: 1 }, { a: 1, b: 1 })).toBe(0);
    expect(totalVariationDistance({ a: 1 }, { b: 1 })).toBe(1);
    expect(sigmoid(logit(0.37))).toBeCloseTo(0.37, 6);
  });
});

describe('csv', () => {
  it('handles quotes, commas, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsvObjects('k,v\n1,2\n')).toEqual([{ k: '1', v: '2' }]);
    expect(toCsv(['a'], [['x,y']])).toBe('a\n"x,y"\n');
  });
});

describe('rng & sampling', () => {
  it('is deterministic per seed', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect([a.next(), a.next(), a.normal()]).toEqual([b.next(), b.next(), b.normal()]);
    expect(deriveSeed(1, 'x')).not.toBe(deriveSeed(1, 'y'));
    expect(stableId('gp', 'r', 1)).toBe(stableId('gp', 'r', 1));
    expect(stableId('gp', 'r', 1)).not.toBe(stableId('gp', 'r', 2));
  });
  it('sampleIndices returns k distinct sorted indices in range', () => {
    const idx = sampleIndices(1000, 200, 3);
    expect(idx).toHaveLength(200);
    expect(new Set(idx).size).toBe(200);
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    expect(Math.max(...idx)).toBeLessThan(1000);
    expect(() => sampleIndices(5, 6, 1)).toThrow();
  });
  it('largestRemainder allocates exactly n proportionally', () => {
    const a = largestRemainder({ a: 3824799, b: 293863, c: 183667 }, 100);
    expect(a.a + a.b + a.c).toBe(100);
    expect(a.a).toBeGreaterThan(a.b);
  });
});
