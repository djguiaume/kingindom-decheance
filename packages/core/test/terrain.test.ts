import { describe, expect, it } from 'vitest';
import { TICK_RATE, walkAim, walkable } from '../src/index.ts';
import { contentWith, emptyNight, newSession } from './helpers.ts';

describe('terrain (Greyhollow rework)', () => {
  it('the king cannot walk over the rim of the hollow, but leaves through a pass', () => {
    const s = newSession();
    s.state.king.pos = { x: 32, y: 36 };
    s.submit({ type: 'move', x: 0, y: 1 }); // south, into the cliff
    for (let i = 0; i < TICK_RATE * 4; i++) s.step();
    expect(s.state.king.pos.y).toBeLessThan(39);
    s.state.king.pos = { x: 20, y: 26 };
    s.submit({ type: 'move', x: -1, y: 0 }); // west, through the open pass
    for (let i = 0; i < TICK_RATE * 2; i++) s.step();
    expect(s.state.king.pos.x).toBeLessThan(14);
  });

  it('the river blocks walking except over the bridge', () => {
    const s = newSession();
    s.state.king.pos = { x: 52, y: 30 };
    s.submit({ type: 'move', x: 1, y: 0 });
    for (let i = 0; i < TICK_RATE * 3; i++) s.step();
    expect(s.state.king.pos.x).toBeLessThan(54);
    const { blockers } = s.ctx;
    expect(walkable(blockers, { x: 53, y: 17 }, { x: 62, y: 19 }, 0.6)).toBe(true);
    expect(walkable(blockers, { x: 52, y: 30 }, { x: 62, y: 30 }, 0.6)).toBe(false);
  });

  it('a body behind the rim heads for a pass instead of pressing against the cliff', () => {
    const s = newSession();
    const aim = walkAim(s.ctx.blockers, s.ctx.ways, { x: 32, y: 36 }, { x: 32, y: 44 }, 0.6);
    // Out of the hollow: through the west pass (17, 26) or the east one (47, 20), never south.
    expect(aim.y).toBeLessThan(30);
  });

  it('footmen and enemies are kept off the water too', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.king.alive = false;
    s.state.king.respawnIn = 1_000_000;
    const e = s.state.enemies;
    s.state.enemies.push({
      id: s.state.nextId++,
      type: 'raider',
      lane: 'west',
      waypoint: 1,
      pos: { x: 8, y: 41 }, // in the lake
      hp: 10,
      maxHp: 10,
      cooldown: 999,
      target: null,
      abilityCooldown: 0,
    });
    s.step();
    const p = e[0]!.pos;
    const inLake = Math.abs(p.y - 41) < 3.8 + 0.4 && p.x > 5.5 - 0.1 && p.x < 10.5 + 0.1;
    expect(inLake).toBe(false);
  });

  it('refuses a map whose lane runs into terrain', () => {
    expect(() =>
      newSession(
        1,
        contentWith((raw) => {
          const map = raw.maps[0] as { terrain: { cliffs: unknown[] } };
          map.terrain.cliffs.push({
            points: [
              [17, 20],
              [17, 32],
            ],
            width: 2,
          });
        }),
      ),
    ).toThrow(/Terrain in the way: .*lane west/);
  });
});
