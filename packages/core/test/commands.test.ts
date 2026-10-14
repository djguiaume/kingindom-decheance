import { describe, expect, it } from 'vitest';
import { buyOptions, stateHash, TICK_RATE } from '../src/index.ts';
import { newSession } from './helpers.ts';

describe('day commands', () => {
  it('build places a building and spends gold', () => {
    const s = newSession();
    const result = s.submit({ type: 'buy', slot: 'tw', option: 0 });
    expect(result).toMatchObject({ ok: true, events: [{ type: 'built', slot: 'tw' }] });
    expect(s.state.gold).toBe(75 - 25);
    expect(s.state.buildings).toHaveLength(1);
    expect(s.log).toHaveLength(1);
  });

  it.each([
    [{ type: 'buy', slot: 'castle', option: 0 }, 'not a building slot'],
    [{ type: 'buy', slot: 'tw', option: -1 }, 'nothing to buy'],
    [{ type: 'cycleRally', slot: 'b1' }, 'no military building'],
    [{ type: 'buy', slot: 'tw', option: 1 }, 'nothing to buy'],
  ] as const)('refuses %j without changing anything', (cmd, reason) => {
    const s = newSession();
    const before = stateHash(s.state);
    const result = s.submit(cmd);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(reason);
    expect(stateHash(s.state)).toBe(before);
    expect(s.log).toHaveLength(0);
  });

  it('refuses to build on an occupied slot or without gold', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'm1', option: 0 }); // a gold mine has no upgrade
    expect(s.submit({ type: 'buy', slot: 'm1', option: 0 })).toMatchObject({ ok: false });
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    expect(s.state.gold).toBe(75 - 30 - 25);
    expect(s.submit({ type: 'buy', slot: 'te', option: 0 })).toEqual({
      ok: false,
      reason: 'not enough gold',
    });
  });

  it('upgrades follow the upgrade graph, so the T3 branches exclude each other', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.state.castleLevel = 3; // every tier unlocked
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    expect(s.submit({ type: 'buy', slot: 'tw', option: 0 }).ok).toBe(true);
    expect(s.submit({ type: 'buy', slot: 'tw', option: 0 }).ok).toBe(true);
    expect(s.state.buildings[0]).toMatchObject({ type: 'ballista_tower', hp: 500, maxHp: 500 });
    expect(s.submit({ type: 'buy', slot: 'tw', option: 1 }).ok).toBe(false);
    expect(s.state.gold).toBe(1000 - 25 - 35 - 50);
  });

  it('barracks guard their first rally gate until told otherwise', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    expect(s.state.buildings[0]!.rally).toBe('gate_w');
    const gates = [1, 2, 3].map(() => {
      s.submit({ type: 'cycleRally', slot: 'b1' });
      return s.state.buildings[0]!.rally;
    });
    expect(gates).toEqual(['gate_e', 'gate_n', 'gate_w']);
  });

  it('startNight switches phase; building is refused at night', () => {
    const s = newSession();
    expect(s.submit({ type: 'startNight' })).toMatchObject({ ok: true });
    expect(s.state.phase).toBe('night');
    expect(s.state.spawnQueue.length).toBe(8);
    expect(s.submit({ type: 'buy', slot: 'h1', option: 0 })).toMatchObject({ ok: false });
    expect(s.submit({ type: 'startNight' })).toMatchObject({ ok: false });
  });
});

describe('king commands', () => {
  it('moveKing normalises long vectors, remembers the facing, rejects NaN', () => {
    const s = newSession();
    s.submit({ type: 'move', x: 3, y: 4 });
    expect(s.state.king.intent).toEqual({ x: 0.6, y: 0.8 });
    s.submit({ type: 'move', x: 0, y: 0 });
    expect(s.state.king.facing).toEqual({ x: 0.6, y: 0.8 });
    expect(s.submit({ type: 'move', x: Number.NaN, y: 0 }).ok).toBe(false);
  });

  it('the king walks during the day without anything else happening', () => {
    const s = newSession();
    s.submit({ type: 'move', x: 1, y: 0 });
    for (let i = 0; i < TICK_RATE; i++) s.step();
    expect(s.state.king.pos.x).toBeCloseTo(32 + 7, 6); // 7 m/s for one second
    expect(s.state.nightTick).toBe(0);
    expect(s.state.phase).toBe('day');
  });

  it('the king stays inside the map', () => {
    const s = newSession();
    s.submit({ type: 'move', x: 0, y: -1 });
    for (let i = 0; i < TICK_RATE * 10; i++) s.step();
    expect(s.state.king.pos.y).toBe(0);
  });

  it('the ability is for the night only', () => {
    const s = newSession();
    expect(s.submit({ type: 'ability' })).toEqual({
      ok: false,
      reason: 'abilities are for the night',
    });
  });

  it('the ability dashes along the facing direction, then cools down', () => {
    const s = newSession();
    s.submit({ type: 'startNight' });
    s.state.spawnQueue = [{ at: 100_000, lane: 'west', enemy: 'raider' }];
    s.submit({ type: 'move', x: 1, y: 0 });
    s.submit({ type: 'move', x: 0, y: 0 });
    expect(s.submit({ type: 'ability' }).ok).toBe(true);
    expect(s.submit({ type: 'ability' })).toEqual({ ok: false, reason: 'ability is not ready' });
    for (let i = 0; i < 9; i++) s.step(); // 0.3 s
    expect(s.state.king.dash).toBeNull();
    expect(s.state.king.pos.x).toBeCloseTo(32 + 6, 6);
    expect(s.state.king.pos.y).toBeCloseTo(27, 6);
    for (let i = 0; i < TICK_RATE * 8; i++) s.step();
    expect(s.submit({ type: 'ability', dir: { x: 0, y: 1 } }).ok).toBe(true);
    for (let i = 0; i < 9; i++) s.step();
    expect(s.state.king.pos.y).toBeCloseTo(27 + 6, 6);
  });

  it('buy lists building options on an empty slot and upgrades on a built one', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.state.castleLevel = 3; // every tier unlocked
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    expect(buyOptions(s.state, s.ctx, 'tw').map((o) => o.building)).toEqual([
      'ballista_tower',
      'volley_tower',
    ]);
    expect(buyOptions(s.state, s.ctx, 'h1')).toEqual([
      { option: 0, kind: 'build', building: 'house', cost: 15, needsCastle: null },
    ]);
  });
});
