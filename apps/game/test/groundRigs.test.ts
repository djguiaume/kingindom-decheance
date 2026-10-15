import { describe, expect, it } from 'vitest';
import {
  decomposeAffine,
  gatePlacement,
  gateView,
  GATE_RIGS,
  groundOrigin,
  GROUND_ANCHORS,
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

  it('fits the painted hinge endpoints to the core passage on every Greyhollow lane and both tiers', () => {
    const session = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
    const frames = atlas('structures');
    for (const slot of ['ww', 'we', 'wn']) {
      const line = wallLine(session.ctx, slot)!;
      for (const base of ['gate_wood', 'gate_stone']) {
        const { view, mirror } = gateView(line.across, SQUASH);
        const name = `${base}${view}`;
        const rig = GATE_RIGS[name]!;
        const p = gatePlacement(rig, line.across, mirror, 2 * GATE_HALF_WIDTH, SCALE, SQUASH);
        for (const state of ['f1', 'f2'])
          expect(frames[`${name}.${state}`], `${name}.${state}`).toBeDefined();
        const points = rig.hinges.map(([x, y]) => {
          const dx = x - p.anchor[0],
            dy = y - p.anchor[1];
          return { x: p.matrix.a * dx + p.matrix.c * dy, y: p.matrix.b * dx + p.matrix.d * dy };
        });
        const expected = {
          x: line.across.x * GATE_HALF_WIDTH * SCALE,
          y: line.across.y * GATE_HALF_WIDTH * SCALE * SQUASH,
        };
        const sign = Math.sign(points[0]!.x * expected.x + points[0]!.y * expected.y) || 1;
        expect(points[0]!.x).toBeCloseTo(sign * expected.x);
        expect(points[0]!.y).toBeCloseTo(sign * expected.y);
        expect(points[1]!.x).toBeCloseTo(-sign * expected.x);
        expect(points[1]!.y).toBeCloseTo(-sign * expected.y);
        expect(p.matrix.c).toBeCloseTo(0);
        expect(p.matrix.d).toBe(SCALE / 64);
      }
    }
  });

  it('keeps vertical gates upright enough and gives identical placement when axis direction reverses', () => {
    const rig = GATE_RIGS['gate_wood.side']!;
    const p = gatePlacement(rig, { x: 0, y: 1 }, false, 2.2, SCALE, SQUASH);
    expect(p.matrix.c).toBeGreaterThan(0);
    expect(p.matrix.d).toBe(SCALE / 64);
    expect(p).toEqual(gatePlacement(rig, { x: 0, y: -1 }, false, 2.2, SCALE, SQUASH));
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

it('fits future maps at every degree, through view boundaries, exact verticals and both lane directions', () => {
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
      const points = rig.hinges.map(([x, y]) => ({
        x: p.matrix.a * (x - p.anchor[0]) + p.matrix.c * (y - p.anchor[1]),
        y: p.matrix.b * (x - p.anchor[0]) + p.matrix.d * (y - p.anchor[1]),
      }));
      const expected = { x: across.x * 1.1 * SCALE, y: across.y * 1.1 * SCALE * SQUASH };
      const sign = Math.sign(points[0]!.x * expected.x + points[0]!.y * expected.y) || 1;
      expect(points[0]!.x).toBeCloseTo(sign * expected.x);
      expect(points[0]!.y).toBeCloseTo(sign * expected.y);
      expect(points[1]!.x).toBeCloseTo(-sign * expected.x);
      expect(points[1]!.y).toBeCloseTo(-sign * expected.y);
      const m = p.matrix;
      const t = decomposeAffine(m);
      const co = Math.cos(t.outer),
        so = Math.sin(t.outer),
        ci = Math.cos(t.inner),
        si = Math.sin(t.inner);
      expect(co * t.scaleX * ci - so * t.scaleY * si).toBeCloseTo(m.a);
      expect(so * t.scaleX * ci + co * t.scaleY * si).toBeCloseTo(m.b);
      expect(-co * t.scaleX * si - so * t.scaleY * ci).toBeCloseTo(m.c);
      expect(-so * t.scaleX * si + co * t.scaleY * ci).toBeCloseTo(m.d);
      expect(Math.abs(m.a * m.d - m.b * m.c)).toBeGreaterThan(0.001);
      expect(Math.abs(Math.atan2(m.c, m.d))).toBeLessThan(0.041);
      expect(p).toEqual(
        gatePlacement(rig, { x: -across.x, y: -across.y }, mirror, 2.2, SCALE, SQUASH),
      );
    }
  }
});
