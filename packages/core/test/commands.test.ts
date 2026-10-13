import { describe, expect, it } from 'vitest';
import { stateHash } from '../src/index.ts';
import { newSession } from './helpers.ts';

describe('day commands', () => {
  it('build places a building and spends gold', () => {
    const s = newSession();
    const result = s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' });
    expect(result).toMatchObject({ ok: true, events: [{ type: 'built', slot: 'slot-tower-w' }] });
    expect(s.state.gold).toBe(12 - 5);
    expect(s.state.buildings).toHaveLength(1);
    expect(s.log).toHaveLength(1);
  });

  it.each([
    [{ type: 'build', slot: 'castle', building: 'tower' }, 'not a building slot'],
    [{ type: 'build', slot: 'slot-tower-w', building: 'house' }, 'cannot be built on this slot'],
    [{ type: 'upgrade', slot: 'slot-tower-w', to: 'tower-heavy' }, 'nothing is built'],
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
    s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' });
    expect(s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' })).toMatchObject({
      ok: false,
    });
    s.submit({ type: 'build', slot: 'slot-tower-e', building: 'tower' });
    expect(s.state.gold).toBe(2);
    expect(s.submit({ type: 'build', slot: 'slot-house-1', building: 'house' })).toEqual({
      ok: false,
      reason: 'not enough gold',
    });
  });

  it('upgrades follow the upgrade graph, so exclusive branches cannot both be taken', () => {
    const s = newSession();
    s.state.gold = 100;
    s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' });
    expect(s.submit({ type: 'upgrade', slot: 'slot-tower-w', to: 'tower-heavy' }).ok).toBe(true);
    expect(s.state.buildings[0]).toMatchObject({ type: 'tower-heavy', hp: 60, maxHp: 60 });
    expect(s.submit({ type: 'upgrade', slot: 'slot-tower-w', to: 'tower-swift' }).ok).toBe(false);
  });

  it('startNight switches phase; building is refused at night', () => {
    const s = newSession();
    expect(s.submit({ type: 'startNight' })).toMatchObject({ ok: true });
    expect(s.state.phase).toBe('night');
    expect(s.state.spawnQueue.length).toBe(4);
    expect(s.submit({ type: 'build', slot: 'slot-house-1', building: 'house' })).toMatchObject({
      ok: false,
    });
    expect(s.submit({ type: 'startNight' })).toMatchObject({ ok: false });
  });

  it('moveKing normalises long vectors and rejects NaN', () => {
    const s = newSession();
    s.submit({ type: 'moveKing', x: 3, y: 4 });
    expect(s.state.king.intent).toEqual({ x: 0.6, y: 0.8 });
    expect(s.submit({ type: 'moveKing', x: Number.NaN, y: 0 }).ok).toBe(false);
  });

  it('the king walks during the day without anything else happening', () => {
    const s = newSession();
    s.submit({ type: 'moveKing', x: 1, y: 0 });
    for (let i = 0; i < 30; i++) s.step();
    expect(s.state.king.pos.x).toBeCloseTo(20 + 5, 6); // speed 5 units/s for one second
    expect(s.state.nightTick).toBe(0);
    expect(s.state.phase).toBe('day');
  });

  it('the king stays inside the map bounds', () => {
    const s = newSession();
    s.submit({ type: 'moveKing', x: 0, y: -1 });
    for (let i = 0; i < 30 * 10; i++) s.step();
    expect(s.state.king.pos.y).toBe(s.ctx.bounds.minY);
  });
});
