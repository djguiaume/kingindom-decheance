import { describe, expect, it } from 'vitest';
import { Art } from '../src/game/art.ts';
import { SCALE, SQUASH } from '../src/game/camera.ts';
import { CLIFF_HEIGHT, cliffPieces } from '../src/game/cliffs.ts';
import {
  bridgeFrame,
  bridgeRotation,
  paintedPropFrame,
  propNeedsDepth,
} from '../src/game/terrain.ts';

describe('painted terrain orientation', () => {
  it('selects bridge perspectives from geometry in either direction', () => {
    const cases = [
      { from: [0, 0] as const, to: [10, 1] as const, frame: 'bridge' },
      { from: [0, 0] as const, to: [1, 10] as const, frame: 'bridge.side' },
      { from: [0, 0] as const, to: [10, 8] as const, frame: 'bridge.diag' },
    ];
    for (const { from, to, frame } of cases) {
      expect(bridgeFrame(from, to)).toBe(frame);
      expect(bridgeFrame(to, from)).toBe(frame);
    }
  });

  it('covers every future-map angle without a direction gap', () => {
    for (let degree = 0; degree < 360; degree++) {
      const radians = (degree * Math.PI) / 180;
      expect(
        ['bridge', 'bridge.diag', 'bridge.side'].includes(
          bridgeFrame([0, 0], [Math.cos(radians), Math.sin(radians)]),
        ),
      ).toBe(true);
    }
  });

  it('treats bridge endpoints as an undirected axis instead of turning art upside down', () => {
    const from = [61.2, 18.6] as const;
    const to = [54.9, 17.2] as const;
    expect(bridgeRotation(from, to)).toBeCloseTo(bridgeRotation(to, from));
    expect(Math.abs(bridgeRotation(from, to))).toBeLessThan(Math.PI / 2);
  });
});

describe('painted cliffs', () => {
  type P = { x: number; y: number };
  /** Point in a convex polygon (either winding). */
  const inside = (q: P, poly: P[]) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const c = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      if (Math.abs(c) < 1e-6) continue;
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };
  const screen = (x: number, y: number) => ({ x: x * SCALE, y: y * SCALE * SQUASH });

  it('cover the whole blocked strip and its raised top, at every angle and around bends', () => {
    for (let degree = 0; degree < 360; degree += 15) {
      const r = (degree * Math.PI) / 180;
      const turn = r + 1;
      const points: [number, number][] = [
        [20, 20],
        [20 + Math.cos(r) * 7, 20 + Math.sin(r) * 7],
        [20 + Math.cos(r) * 7 + Math.cos(turn) * 5, 20 + Math.sin(r) * 7 + Math.sin(turn) * 5],
      ];
      const pieces = cliffPieces(points, 2);
      // Sample the capsules the core blocks: every point within 1 m of the line.
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1]!;
        const [bx, by] = points[i]!;
        for (let t = 0; t <= 1; t += 0.05)
          for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8)
            for (const d of [0, 0.5, 0.95]) {
              const x = ax + (bx - ax) * t + Math.cos(a) * d;
              const y = ay + (by - ay) * t + Math.sin(a) * d;
              const ground = screen(x, y);
              const top = { x: ground.x, y: ground.y - CLIFF_HEIGHT * SCALE };
              expect(pieces.some((p) => inside(ground, p.outline))).toBe(true);
              expect(pieces.some((p) => inside(top, p.outline))).toBe(true);
            }
      }
    }
  });

  it('are cut short so actors sort in front of and behind them', () => {
    const pieces = cliffPieces(
      [
        [0, 0],
        [0, 12],
        [12, 12],
      ],
      2,
    );
    expect(pieces.length).toBeGreaterThanOrEqual(16);
    // Along the vertical run the sort lines climb steadily down the screen.
    const run = pieces.slice(0, 8).map((p) => p.sortY);
    for (let i = 1; i < run.length; i++) expect(run[i]!).toBeGreaterThan(run[i - 1]!);
  });
});

describe('scenery depth', () => {
  it('uses corrected painted scenery instead of an obsolete procedural fallback', () => {
    const art = new Art([['art:environment', ['grass_patch']]]);
    expect(paintedPropFrame(art, 'grass_patch')).toBe('grass_patch');
    expect(paintedPropFrame(art, 'missing')).toBeNull();
  });

  it('sorts tall occluders while leaving ground decoration static', () => {
    expect(propNeedsDepth('tree')).toBe(true);
    expect(propNeedsDepth('bamboo_large')).toBe(true);
    expect(propNeedsDepth('lantern_post')).toBe(true);
    expect(propNeedsDepth('grass')).toBe(false);
    expect(propNeedsDepth('flowers')).toBe(false);
    expect(propNeedsDepth('rock_large')).toBe(false);
  });
});
