import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextUint32, seedRng } from '../src/rng.ts';

describe('seeded RNG', () => {
  it('replays the same sequence for the same seed', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    const seqA = Array.from({ length: 100 }, () => nextUint32(a));
    const seqB = Array.from({ length: 100 }, () => nextUint32(b));
    expect(seqA).toEqual(seqB);
  });

  it('diverges for neighbouring seeds', () => {
    const a = seedRng(1);
    const b = seedRng(2);
    const same = Array.from({ length: 50 }, () => nextUint32(a) === nextUint32(b)).filter(Boolean);
    expect(same.length).toBe(0);
  });

  it('continues identically from a copied state (snapshot)', () => {
    const a = seedRng(7);
    for (let i = 0; i < 10; i++) nextUint32(a);
    const copy = [...a] as typeof a;
    expect(nextUint32(copy)).toBe(nextUint32(a));
  });

  it('produces floats in [0, 1) that look uniform', () => {
    const rng = seedRng(3);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      buckets[Math.floor(f * 10)]!++;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(1800);
    for (let i = 0; i < 1000; i++) expect(nextInt(rng, 6)).toBeLessThan(6);
  });

  it('is pinned: a known seed gives known numbers', () => {
    // Changing the algorithm breaks every replay; this test makes that a deliberate act.
    const rng = seedRng(12345);
    expect(Array.from({ length: 3 }, () => nextUint32(rng))).toMatchInlineSnapshot(`
      [
        2345461488,
        1344865159,
        2974739204,
      ]
    `);
  });
});
