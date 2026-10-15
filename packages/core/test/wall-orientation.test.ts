import { describe, expect, it } from 'vitest';
import type { GameMap } from '@kd/content';
import { TICK_RATE, wallLine, type Vec } from '../src/index.ts';
import { movementSystem } from '../src/systems/movement.ts';
import { contentWith, emptyNight, newSession, placeEnemy } from './helpers.ts';

/** Rotate a complete incoming lane in validated map content; no Greyhollow angle assumptions. */
function oriented(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const along = { x: Math.cos(radians), y: Math.sin(radians) };
  const bundle = contentWith((raw) => {
    const map = raw.maps[0] as GameMap;
    map.terrain = { water: [], bridges: [], cliffs: [], props: [] };
    const offsets: Record<string, number> = {
      sp_w: -12,
      w0: -9,
      w1: -6,
      ww: 0,
      w3: 4,
      castle: 8,
      king_start: 3,
    };
    for (const node of map.nodes)
      if (node.id in offsets) {
        const t = offsets[node.id]!;
        node.pos = [32 + along.x * t, 24 + along.y * t];
      }
  });
  const s = newSession(1, bundle);
  s.state.gold = 1000;
  expect(s.submit({ type: 'buy', slot: 'ww', option: 0 }).ok).toBe(true);
  const line = wallLine(s.ctx, 'ww')!;
  const position = (forward: number, side = 0): Vec => ({
    x: line.at.x + line.along.x * forward + line.across.x * side,
    y: line.at.y + line.along.y * forward + line.across.y * side,
  });
  const forward = (p: Vec) => (p.x - line.at.x) * line.along.x + (p.y - line.at.y) * line.along.y;
  return { s, line, position, forward };
}

// Includes both castle directions on each axis, diagonal and shallow/steep paths.
for (const degrees of Array.from({ length: 24 }, (_, i) => i * 15)) {
  describe(`gate mechanics with a ${degrees}° incoming path`, () => {
    it('passes the king through the central opening from either side, and stops him at either wing', () => {
      for (const side of [-1, 1])
        for (const lateral of [-3, 0, 3]) {
          const { s, line, position, forward } = oriented(degrees);
          s.state.king.pos = position(side * 2, lateral);
          s.submit({ type: 'move', x: -side * line.along.x, y: -side * line.along.y });
          for (let i = 0; i < TICK_RATE; i++) s.step();
          if (lateral === 0) expect(forward(s.state.king.pos) * side).toBeLessThan(-1);
          else expect(forward(s.state.king.pos) * side).toBeGreaterThan(0);
        }
    });

    it('routes following footmen through the opening rather than through a wing', () => {
      const { s, position, forward } = oriented(degrees);
      s.submit({ type: 'buy', slot: 'b1', option: 0 });
      emptyNight(s, 10000);
      for (const u of s.state.units) {
        u.pos = position(-2, 3);
        u.following = true;
        u.target = null;
      }
      s.state.king.pos = position(4);
      for (let i = 0; i < TICK_RATE * 6; i++) movementSystem(s.state, s.ctx);
      expect(s.state.units.length).toBe(3);
      for (const u of s.state.units) expect(forward(u.pos)).toBeGreaterThan(0.5);
    });

    it('holds a ground enemy outside the standing wall even when it chases the king behind it', () => {
      const { s, line, position, forward } = oriented(degrees);
      s.state.king.pos = position(4);
      const at = position(-3);
      const raider = placeEnemy(s, 'raider', at.x, at.y, {
        lane: 'west',
        waypoint: s.ctx.lanes.get('west')!.nodes.indexOf('ww'),
        target: { kind: 'king' },
      });
      const flyer = placeEnemy(s, 'harpy', at.x, at.y, { target: { kind: 'king' } });
      for (let i = 0; i < TICK_RATE * 3; i++) movementSystem(s.state, s.ctx);
      expect(forward(raider.pos)).toBeLessThan(-1);
      expect(forward(flyer.pos)).toBeGreaterThan(0);
      expect(Math.abs(line.along.x * line.across.x + line.along.y * line.across.y)).toBeLessThan(
        1e-10,
      );
    });
  });
}
