import { placeholderContent } from '@kd/content/placeholder';
import { describe, expect, it } from 'vitest';
import { defensivePolicy, greedyPolicy, idlePolicy } from '../src/policies.ts';
import { runHeadless } from '../src/runner.ts';

const config = (seed: number) => ({ mapId: 'placeholder', weaponId: 'sword', seed });

describe('headless runner', () => {
  it('produces identical summaries for identical inputs', () => {
    const a = runHeadless(placeholderContent, config(5), defensivePolicy).summary;
    const b = runHeadless(placeholderContent, config(5), defensivePolicy).summary;
    expect(b).toEqual(a);
  });

  it('runs every policy to a finished outcome', () => {
    for (const policy of [idlePolicy, greedyPolicy, defensivePolicy]) {
      const { summary } = runHeadless(placeholderContent, config(1), policy);
      expect(['won', 'lost']).toContain(summary.outcome);
      expect(summary.contentHash).toBe(placeholderContent.hash);
      expect(summary.goldPerNight.length).toBe(summary.nightReached);
    }
  });
});
