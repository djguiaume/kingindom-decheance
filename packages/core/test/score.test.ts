import { describe, expect, it } from 'vitest';
import { scoreOf, SCORE } from '../src/index.ts';
import { newNightStats } from '../src/systems/phase.ts';
import { newSession } from './helpers.ts';

/** A session whose history holds nights with these building losses. */
function withNights(lost: number[], phase: 'won' | 'lost' | 'day', gold = 0) {
  const s = newSession();
  s.state.history = lost.map((n, i) => ({ ...newNightStats(i + 1), buildingsLost: n }));
  s.state.phase = phase;
  s.state.gold = gold;
  return s;
}

describe('score (13 §2)', () => {
  it('a won run: night points, gold bonus, the worked example without mutators', () => {
    // Six nights, 3 buildings lost in all, 40 gold left: 900 − 75 + 200.
    const s = withNights([0, 1, 0, 2, 0, 0], 'won', 40);
    expect(scoreOf(s.state, s.ctx)).toEqual({
      won: true,
      nightsHeld: 6,
      buildingsLost: 3,
      lostPoints: 75,
      nightPoints: 825,
      goldLeft: 40,
      goldPoints: 200,
      multiplier: 1,
      total: 1025,
    });
  });

  it('a lost run scores the nights held only: no gold bonus, no multiplier', () => {
    // Fell on night 5: the fifth entry is the night that was lost.
    const s = withNights([0, 0, 1, 0, 4], 'lost', 90);
    s.state.perks = ['gamblers_oath'];
    const score = scoreOf(s.state, s.ctx);
    expect(score).toMatchObject({ won: false, nightsHeld: 4, goldPoints: 0, multiplier: 1 });
    expect(score.total).toBe(4 * SCORE.perNight - SCORE.perBuildingLost);
  });

  it('a night never costs more than its own points', () => {
    const s = withNights([9, 0], 'won');
    expect(scoreOf(s.state, s.ctx)).toMatchObject({ nightPoints: 150, lostPoints: 150 });
  });

  it("Gambler's Oath multiplies a won run by 1.25", () => {
    const s = withNights([0, 0, 0, 0, 0, 0], 'day', 1000);
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'gamblers_oath' });
    s.state.phase = 'won';
    s.state.gold = 20;
    expect(scoreOf(s.state, s.ctx)).toMatchObject({
      multiplier: 1.25,
      total: Math.round((900 + 100) * 1.25),
    });
  });
});
