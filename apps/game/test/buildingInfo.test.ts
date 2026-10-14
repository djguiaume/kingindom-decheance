import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session } from '@kd/core';
import { describe, expect, it } from 'vitest';
import { buildingStats, offerInfo } from '../src/game/buildingInfo.ts';

const ctx = new Session(prototypeContent, { ...prototypeRun, seed: 1 }).ctx;

describe('building info on the buy buttons', () => {
  it('a new building shows its description and numbers', () => {
    expect(offerInfo(ctx, null, 'tower')).toEqual({
      description: 'Shoots arrows at ground and air enemies.',
      stats: 'Damage 8/s · Range 7',
    });
    expect(offerInfo(ctx, null, 'house').stats).toBe('Gold a dawn +10');
    expect(offerInfo(ctx, null, 'wall').stats).toBe('HP 500');
    expect(offerInfo(ctx, null, 'barracks').stats).toBe('Footmen 3');
  });

  it('an upgrade shows only what changes', () => {
    expect(offerInfo(ctx, 'tower', 'watchtower').stats).toBe('Damage 8 → 12/s · Range 7 → 8.5');
    expect(offerInfo(ctx, 'watchtower', 'ballista_tower').stats).toBe(
      "Damage 12 → 20/s · Range 8.5 → 10 · can't hit flyers · ×1.6 vs brutes",
    );
    expect(offerInfo(ctx, 'watchtower', 'volley_tower').stats).toBe(
      'Damage 12 → 8/s · Range 8.5 → 8 · Targets 3',
    );
    expect(offerInfo(ctx, 'wall', 'stone_wall').stats).toBe('HP 500 → 1200');
    expect(offerInfo(ctx, 'house', 'manor').stats).toBe('Gold a dawn +10 → +20');
  });

  it('the current building lists its numbers', () => {
    expect(buildingStats(ctx, 'watchtower')).toBe('Damage 12/s · Range 8.5');
  });
});
