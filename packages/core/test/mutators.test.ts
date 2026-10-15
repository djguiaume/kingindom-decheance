import { describe, expect, it } from 'vitest';
import {
  buildSpawnQueue,
  buyOptions,
  scoreOf,
  Session,
  slotClosed,
  telegraph,
} from '../src/index.ts';
import { newNightStats } from '../src/systems/phase.ts';
import { config, content, emptyNight, stepUntil } from './helpers.ts';

const withMutators = (...mutatorIds: string[]) => new Session(content, { ...config, mutatorIds });

describe('mutators (13 §3)', () => {
  it('no mutators leaves the content as it is', () => {
    const plain = new Session(content, config);
    const none = withMutators();
    expect(none.ctx.enemies).toEqual(plain.ctx.enemies);
    expect(none.ctx.rules).toEqual(plain.ctx.rules);
  });

  it('refuses an unknown or repeated mutator', () => {
    expect(() => withMutators('nope')).toThrow('Unknown mutator "nope"');
    expect(() => withMutators('swarm', 'swarm')).toThrow('picked twice');
  });

  it('Ironhide, Swift Foe and Mercy change every enemy', () => {
    const base = new Session(content, config).ctx.enemies.get('raider')!;
    expect(withMutators('ironhide').ctx.enemies.get('raider')!.hp).toBeCloseTo(base.hp * 1.5);
    expect(withMutators('mercy').ctx.enemies.get('raider')!.hp).toBeCloseTo(base.hp * 0.75);
    expect(withMutators('swift_foe').ctx.enemies.get('raider')!.speed).toBeCloseTo(
      base.speed * 1.3,
    );
  });

  it('Swarm doubles nights 1 and 2 only, in the spawns and the wave preview', () => {
    const plain = new Session(content, config);
    const s = withMutators('swarm');
    const count = (ctx: Session['ctx'], night: number) =>
      telegraph(ctx, night).reduce((n, t) => n + t.count, 0);
    expect(count(s.ctx, 1)).toBe(2 * count(plain.ctx, 1));
    expect(count(s.ctx, 2)).toBe(2 * count(plain.ctx, 2));
    expect(count(s.ctx, 3)).toBe(count(plain.ctx, 3));
    expect(buildSpawnQueue(s.ctx, 1)).toHaveLength(2 * buildSpawnQueue(plain.ctx, 1).length);
  });

  it('Lean Years cuts all dawn income by 30%', () => {
    const s = withMutators('lean_years');
    s.submit({ type: 'buy', slot: 'h1', option: 0 });
    const gold = s.state.gold;
    emptyNight(s);
    stepUntil(s, () => s.state.phase === 'day');
    const full = s.ctx.castle.income + s.ctx.buildings.get('house')!.income;
    expect(s.state.gold - gold).toBe(Math.round(full * 0.7));
  });

  it('Glass Crown halves the king and stops his regeneration', () => {
    const s = withMutators('glass_crown');
    const plain = new Session(content, config);
    expect(s.state.king.maxHp).toBe(plain.state.king.maxHp / 2);
    expect(s.ctx.king.regen).toBe(0);
  });

  it('No Walls closes the wall slots and nothing else', () => {
    const s = withMutators('no_walls');
    expect(slotClosed(s.ctx, 'ww')).toBe(true);
    expect(slotClosed(s.ctx, 'tw')).toBe(false);
    expect(buyOptions(s.state, s.ctx, 'ww')).toEqual([]);
    const result = s.submit({ type: 'buy', slot: 'ww', option: 0 });
    expect(result.ok).toBe(false);
    expect(slotClosed(new Session(content, config).ctx, 'ww')).toBe(false);
  });

  it('bonuses add up, then Gambler’s Oath multiplies them, on a won run', () => {
    const s = withMutators('ironhide', 'no_walls', 'mercy');
    expect(s.ctx.rules.scoreMultiplier).toBeCloseTo(1 + 0.4 + 0.4 - 0.3);
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'gamblers_oath' });
    expect(s.ctx.rules.scoreMultiplier).toBeCloseTo(1.5 * 1.25);
    s.state.history = [newNightStats(1)];
    s.state.phase = 'won';
    s.state.gold = 0;
    const score = scoreOf(s.state, s.ctx);
    expect(score.multiplier).toBeCloseTo(1.875);
    expect(score.total).toBe(281);
  });

  it('Mercy alone lowers the score of a win', () => {
    const s = withMutators('mercy');
    s.state.history = [newNightStats(1)];
    s.state.phase = 'won';
    s.state.gold = 0;
    const score = scoreOf(s.state, s.ctx);
    expect(score.multiplier).toBeCloseTo(0.7);
    expect(score.total).toBe(105);
  });
});
