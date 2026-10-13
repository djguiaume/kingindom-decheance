import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { describe, expect, it } from 'vitest';
import { defensivePolicy, greedyPolicy, idlePolicy } from '../src/policies.ts';
import { runHeadless } from '../src/runner.ts';

const config = (seed: number) => ({ ...prototypeRun, seed });

describe('headless runner', () => {
  it('produces identical summaries for identical inputs', () => {
    const a = runHeadless(prototypeContent, config(5), defensivePolicy).summary;
    const b = runHeadless(prototypeContent, config(5), defensivePolicy).summary;
    expect(b).toEqual(a);
  });

  it('runs every policy to a finished outcome', () => {
    for (const policy of [idlePolicy, greedyPolicy, defensivePolicy]) {
      const { summary } = runHeadless(prototypeContent, config(1), policy);
      expect(['won', 'lost']).toContain(summary.outcome);
      expect(summary.contentHash).toBe(prototypeContent.hash);
      expect(summary.goldPerNight.length).toBe(summary.nightReached);
    }
  });
});
