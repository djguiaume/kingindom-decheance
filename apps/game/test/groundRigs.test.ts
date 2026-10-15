import { describe, expect, it } from 'vitest';
import {
  decomposeAffine,
  gatePlacement,
  gateView,
  GATE_UPRIGHT_SCALE,
  GATE_RIGS,
  groundOrigin,
  GATE_WIDTH_RANGE,
  GROUND_ANCHORS,
  SEGMENT_RIGS,
  SEGMENT_WIDTH_RANGE,
  segmentPlacement,
} from '../src/game/groundRigs.ts';
import { GATE_HALF_WIDTH, wallLine, Session } from '@kd/core';
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { SCALE, SQUASH } from '../src/game/camera.ts';
import buildingAtlas from '../../../art/runtime/buildings.json';
import structureAtlas from '../../../art/runtime/structures.json';

function atlas(group: string) {
  return (group === 'buildings' ? buildingAtlas : structureAtlas).frames as Record<
    string,
    {
      sourceSize: { w: number; h: number };
      spriteSourceSize: { x: number; y: number; w: number; h: number };
    }
  >;
}

describe('building ground anchors', () => {
  it('calibrates every implemented building and castle tier in the actual atlas source canvas', () => {
    const frames = atlas('buildings');
    const ids = prototypeContent.buildings.filter((b) => b.class !== 'wall').map((b) => b.id);
    for (const id of [...ids, 'castle_1', 'castle_2', 'castle_3']) {
      expect(GROUND_ANCHORS[id], id).toBeDefined();
      const f = frames[id]!;
      const [x, y] = GROUND_ANCHORS[id]!;
      expect(x).toBeGreaterThan(f.spriteSourceSize.x);
      expect(x).toBeLessThan(f.spriteSourceSize.x + f.spriteSourceSize.w);
      expect(y).toBeGreaterThan(f.spriteSourceSize.y);
      expect(y).toBeLessThan(f.spriteSourceSize.y + f.spriteSourceSize.h);
      const [ox, oy] = groundOrigin(id, f.sourceSize.w, f.sourceSize.h);
      expect(ox * f.sourceSize.w).toBe(x);
      expect(oy * f.sourceSize.h).toBeCloseTo(y);
    }
  });

  it('uses the untrimmed canvas, so packing/trim changes cannot shift a building', () => {
    expect(groundOrigin('house', 256, 256)).toEqual([0.5, 198 / 256]);
    expect(groundOrigin('unpainted', 256, 256)).toEqual([0.5, 0.9]);
  });

  it('stands each building ruin on its building footing, inside the painted ruin', () => {
    const frames = atlas('buildings');
    for (const id of Object.keys(frames).filter((f) => f.startsWith('ruin_'))) {
      const f = frames[id]!;
      const [ox, oy] = groundOrigin(id, f.sourceSize.w, f.sourceSize.h);
      expect([ox, oy], id).toEqual(
        groundOrigin(id.slice('ruin_'.length), f.sourceSize.w, f.sourceSize.h),
      );
      expect(ox * f.sourceSize.w).toBeGreaterThan(f.spriteSourceSize.x);
      expect(ox * f.sourceSize.w).toBeLessThan(f.spriteSourceSize.x + f.spriteSourceSize.w);
      expect(oy * f.sourceSize.h).toBeLessThan(f.spriteSourceSize.y + f.spriteSourceSize.h);
    }
  });
});

describe('gate placement', () => {
  it('mirrors side views as well as diagonal views, consistently when lane direction reverses', () => {
    for (const across of [
      { x: 0.2, y: 0.98 },
      { x: 0.8, y: 0.6 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]) {
      expect(gateView(across, SQUASH)).toEqual(gateView({ x: -across.x, y: -across.y }, SQUASH));
    }
    expect(gateView({ x: 0.2, y: 0.98 }, SQUASH)).toEqual({ view: '.side', mirror: true });
    expect(gateView({ x: 0.2, y: -0.98 }, SQUASH)).toEqual({ view: '.side', mirror: false });
  });

  it('meets the core passage on every Greyhollow lane and both tiers, keeping the painted depth', () => {
    const session = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
    const frames = atlas('structures');
    for (const slot of ['ww', 'we', 'wn']) {
      const line = wallLine(session.ctx, slot)!;
      for (const base of ['gate_wood', 'gate_stone']) {
        const { view, mirror } = gateView(line.across, SQUASH);
        const name = `${base}${view}`;
        const rig = GATE_RIGS[name]!;
        for (const state of ['f1', 'f2'])
          expect(frames[`${name}.${state}`], `${name}.${state}`).toBeDefined();
        expectFits(gatePlacement(rig, line.across, mirror, 2 * GATE_HALF_WIDTH, SCALE, SQUASH), {
          x: line.across.x * GATE_HALF_WIDTH * SCALE,
          y: line.across.y * GATE_HALF_WIDTH * SCALE * SQUASH,
        });
      }
    }
  });

  it('keeps a vertical gate its painted width (no edge-on sliver), the same both lane ways', () => {
    for (const base of ['gate_wood', 'gate_stone']) {
      const rig = GATE_RIGS[`${base}.side`]!;
      const p = gatePlacement(rig, { x: 0, y: 1 }, false, 2.2, SCALE, SQUASH);
      expect(Math.abs(p.matrix.a)).toBeCloseTo(GATE_WIDTH_RANGE[0] * WIDTH);
      expect(p.matrix.d).toBe(WIDTH);
      expect(p).toEqual(gatePlacement(rig, { x: 0, y: -1 }, false, 2.2, SCALE, SQUASH));
    }
  });

  it('keeps the larger apparent height stable when each painted gate opens', () => {
    for (const rig of Object.values(GATE_RIGS)) {
      const closed = gatePlacement(rig, { x: 1, y: 0 }, false, 2.2, SCALE, SQUASH);
      const open = gatePlacement(rig, { x: 1, y: 0 }, false, 2.2, SCALE, SQUASH, true);
      expect(closed.matrix.d * rig.visibleHeights[0]).toBeCloseTo(
        open.matrix.d * rig.visibleHeights[1],
      );
      expect(closed.matrix.d).toBeGreaterThan(SCALE / 64);
    }
  });

  it('keeps open and closed hinges fixed on future-map passages at every angle', () => {
    for (let degree = 0; degree < 360; degree++) {
      const radians = (degree * Math.PI) / 180;
      const across = { x: Math.cos(radians), y: Math.sin(radians) };
      for (const base of ['gate_wood', 'gate_stone']) {
        const { view, mirror } = gateView(across, SQUASH);
        const rig = GATE_RIGS[`${base}${view}`]!;
        const placements = [false, true].map((open) =>
          gatePlacement(rig, across, mirror, 2.2, SCALE, SQUASH, open),
        );
        const hinges = placements.map((placement) =>
          rig.hinges.map(([x, y]) => ({
            x:
              placement.matrix.a * (x - placement.anchor[0]) +
              placement.matrix.c * (y - placement.anchor[1]),
            y:
              placement.matrix.b * (x - placement.anchor[0]) +
              placement.matrix.d * (y - placement.anchor[1]),
          })),
        );
        for (let i = 0; i < 2; i++) {
          expect(hinges[1]![i]!.x).toBeCloseTo(hinges[0]![i]!.x);
          expect(hinges[1]![i]!.y).toBeCloseTo(hinges[0]![i]!.y);
        }
      }
    }
  });
});

describe('stone wall sections', () => {
  const width = (SCALE / 64) * GATE_UPRIGHT_SCALE;

  it('has a calibrated run for every painted view, inside the painted section', () => {
    const frames = atlas('structures');
    for (const [name, [a, b]] of Object.entries(SEGMENT_RIGS)) {
      const f = frames[name]!;
      expect(f, name).toBeDefined();
      for (const [x, y] of [a, b]) {
        expect(x).toBeGreaterThan(f.spriteSourceSize.x);
        expect(x).toBeLessThan(f.spriteSourceSize.x + f.spriteSourceSize.w);
        expect(y).toBeLessThanOrEqual(f.spriteSourceSize.y + f.spriteSourceSize.h);
      }
      expect(b[0]).toBeGreaterThan(a[0]);
    }
  });

  it('lays a continuous, upright, never-flattened wall at every angle, both lane directions', () => {
    for (let angle = 0; angle < 360; angle += 3) {
      const r = (angle * Math.PI) / 180;
      const across = { x: Math.cos(r), y: Math.sin(r) };
      const { view, mirror } = gateView(across, SQUASH);
      const rig = SEGMENT_RIGS[`stone_wall_segment${view}`]!;
      const step = { x: across.x * 1.2 * SCALE, y: across.y * 1.2 * SCALE * SQUASH };
      let cursor = { x: 0, y: 0 };
      for (let i = 1; i <= 3; i++) {
        const to = { x: step.x * i, y: step.y * i };
        const p = segmentPlacement(rig, cursor, to, mirror, SCALE);
        const m = p.matrix;
        expect(m.c).toBe(0);
        expect(m.d).toBe(width);
        expect(Math.abs(m.a)).toBeGreaterThanOrEqual(SEGMENT_WIDTH_RANGE[0] * width - 1e-9);
        // The painted run, mapped, goes from `cursor` to `end` through `at`.
        const [a, b] = rig;
        const half = {
          x: (m.a * (b[0] - a[0])) / 2,
          y: (m.b * (b[0] - a[0]) + m.d * (b[1] - a[1])) / 2,
        };
        const ends = [
          { x: p.at.x - half.x, y: p.at.y - half.y },
          { x: p.at.x + half.x, y: p.at.y + half.y },
        ];
        const near = (u: { x: number; y: number }, v: { x: number; y: number }) =>
          Math.hypot(u.x - v.x, u.y - v.y) < 1e-6;
        expect(ends.some((e) => near(e, cursor)) && ends.some((e) => near(e, p.end))).toBe(true);
        expect(p.end.y).toBeCloseTo(to.y);
        cursor = p.end;
      }
      // A whole wing drifts at most half a metre sideways from its true end.
      expect(Math.abs(cursor.x - step.x * 3)).toBeLessThan(SCALE / 2);
    }
  });
});

it('reconstructs the affine projection with ordinary parent and child transforms, including mirrored views', () => {
  for (const m of [
    { a: 0.3, b: 0.5, c: 0, d: 0.5 },
    { a: -0.8, b: -0.4, c: 0, d: 0.5 },
    { a: 1, b: -0.1, c: 0, d: 0.5 },
  ]) {
    const t = decomposeAffine(m);
    const co = Math.cos(t.outer),
      so = Math.sin(t.outer),
      ci = Math.cos(t.inner),
      si = Math.sin(t.inner);
    expect(co * t.scaleX * ci - so * t.scaleY * si).toBeCloseTo(m.a);
    expect(so * t.scaleX * ci + co * t.scaleY * si).toBeCloseTo(m.b);
    expect(-co * t.scaleX * si - so * t.scaleY * ci).toBeCloseTo(m.c);
    expect(-so * t.scaleX * si + co * t.scaleY * ci).toBeCloseTo(m.d);
  }
});

it('fits future maps at every degree without flattening the painting, both lane directions', () => {
  for (let angle = 0; angle < 360; angle++) {
    const across = { x: Math.cos((angle * Math.PI) / 180), y: Math.sin((angle * Math.PI) / 180) };
    if (angle % 90 === 0) {
      across.x = Math.round(across.x);
      across.y = Math.round(across.y);
    }
    for (const base of ['gate_wood', 'gate_stone']) {
      const { view, mirror } = gateView(across, SQUASH);
      const rig = GATE_RIGS[`${base}${view}`]!;
      const p = gatePlacement(rig, across, mirror, 2.2, SCALE, SQUASH);
      expectFits(p, { x: across.x * 1.1 * SCALE, y: across.y * 1.1 * SCALE * SQUASH });
      expect(p).toEqual(
        gatePlacement(rig, { x: -across.x, y: -across.y }, mirror, 2.2, SCALE, SQUASH),
      );
    }
  }
});

const WIDTH = (SCALE / 64) * GATE_UPRIGHT_SCALE;

/**
 * The painted gate stays as painted: upright, never narrower than GATE_WIDTH_RANGE allows, tilted
 * only a little; its hinges land within a third of a metre of the passage ends.
 */
function expectFits(p: ReturnType<typeof gatePlacement>, end: { x: number; y: number }): void {
  const m = p.matrix;
  expect(m.c).toBe(0);
  expect(m.d).toBe(WIDTH);
  expect(Math.abs(m.a)).toBeGreaterThanOrEqual(GATE_WIDTH_RANGE[0] * WIDTH - 1e-9);
  expect(Math.abs(m.a)).toBeLessThanOrEqual(GATE_WIDTH_RANGE[1] * WIDTH + 1e-9);
  expect(Math.abs(m.b / m.a)).toBeLessThan(0.4);
  const [h0, h1] = p.hinges;
  const sign = Math.sign(h0!.x * end.x + h0!.y * end.y) || 1;
  expect(Math.hypot(h0!.x - sign * end.x, h0!.y - sign * end.y)).toBeLessThan(SCALE / 3);
  expect(Math.hypot(h1!.x + sign * end.x, h1!.y + sign * end.y)).toBeLessThan(SCALE / 3);
}
