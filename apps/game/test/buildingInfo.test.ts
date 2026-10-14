import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session } from '@kd/core';
import { describe, expect, it } from 'vitest';
import { buildingStats, castleLevelInfo, offerInfo } from '../src/game/buildingInfo.ts';
import { awardRun, isUnlocked, loadProfile } from '../src/progression.ts';

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

  it('military buildings describe their soldiers', () => {
    const show = (from: string | null, to: string) => offerInfo(ctx, from, to).stats;
    expect(show(null, 'archery_range')).toBe('Archers 3 · shoot 6 m · hit flyers');
    expect(show('barracks', 'knight_hall')).toBe('Knights 3 · take 30% less damage');
    expect(show('barracks', 'garrison')).toBe('Footmen 3 → 5');
    expect(show('archery_range', 'marksmen')).toBe('Archers 3 → 5');
    expect(show('archery_range', 'crossbow_range')).toBe(
      'Crossbowmen 3 · shoot 7.5 m · ×1.5 vs brutes',
    );
  });

  it('the current building lists its numbers', () => {
    expect(buildingStats(ctx, 'watchtower')).toBe('Damage 12/s · Range 8.5');
  });
});

describe('castle level card', () => {
  it('shows what the next level changes and unlocks, perks included', () => {
    const s = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
    expect(castleLevelInfo(s.ctx, s.state, 2)).toEqual({
      stats: 'HP 1500 → 2000 · Damage 5 → 8/s · Range 8 → 9',
      unlocks:
        'Unlocks Manor, Watchtower, Stone wall, Garrison, Knight hall, Marksmen, Crossbow range.',
    });
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'royal_archers' });
    expect(castleLevelInfo(s.ctx, s.state, 3).stats).toBe(
      'HP 2000 → 2500 · Damage 16 → 24/s · Range 12 → 13',
    );
  });
});

describe('progression (all open in Stage A)', () => {
  it('unlocks everything, awards nothing and survives bad storage', () => {
    const profile = loadProfile({ getItem: () => '{not json' });
    expect(profile).toEqual({ schemaVersion: 1, xp: 0, level: 1, unlocked: [] });
    expect(isUnlocked(profile, { unlock: { level: 9 } })).toBe(true);
    const run = { mapId: 'greyhollow', won: true, nightsSurvived: 6, score: 0 };
    expect(awardRun(profile, run)).toMatchObject({ xpGained: 0, newUnlocks: [] });
  });
});
