import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session, type Vec } from '@kd/core';
import { describe, expect, it } from 'vitest';
import {
  buildArrows,
  enemyGroups,
  MAX_ARROWS,
  placeArrow,
  type ArrowLayout,
  type Projection,
} from '../src/game/indicators.ts';

const layout: ArrowLayout = { inset: { top: 40, right: 40, bottom: 40, left: 40 }, avoid: [] };
const view = { width: 800, height: 400 };

/** A camera showing world metres [x0, x0 + 25] × [y0, y0 + 12.5] on an 800 × 400 view. */
function camera(x0: number, y0: number): Projection {
  return {
    width: 800,
    height: 400,
    toScreen: (p: Vec) => ({ x: (p.x - x0) * 32, y: (p.y - y0) * 32 }),
  };
}

function nightSession(): Session {
  const s = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
  s.submit({ type: 'startNight' });
  s.state.spawnQueue = [];
  return s;
}

function enemy(s: Session, type: string, lane: string, x: number, y: number) {
  s.state.enemies.push({
    id: s.state.nextId++,
    type,
    lane,
    waypoint: 1,
    pos: { x, y },
    hp: 10,
    maxHp: 10,
    cooldown: 0,
    target: null,
    abilityCooldown: 0,
  });
}

describe('edge arrows', () => {
  it('shows nothing for a point on screen', () => {
    expect(placeArrow({ x: 400, y: 200 }, view, layout)).toBeNull();
  });

  it('sits on the inset frame, on the line from the centre to the target', () => {
    expect(placeArrow({ x: 2000, y: 200 }, view, layout)).toEqual({ x: 760, y: 200, angle: 0 });
    const up = placeArrow({ x: 400, y: -1000 }, view, layout)!;
    expect(up.x).toBeCloseTo(400);
    expect(up.y).toBe(40);
  });

  it('slides out of areas it must avoid (joystick, buttons)', () => {
    const avoid = { left: 600, top: 150, right: 800, bottom: 400 };
    const at = placeArrow({ x: 2000, y: 300 }, view, { ...layout, avoid: [avoid] })!;
    expect(at.x).toBe(760);
    expect(at.y).toBe(150);
  });

  it('keeps a wide marker inside the screen', () => {
    const at = placeArrow({ x: 2000, y: 200 }, view, layout, { w: 70, h: 20 })!;
    expect(at.x).toBe(800 - 40 - 70);
  });

  it('slides along its own edge out of an area, never inwards', () => {
    // A joystick corner on the left: a marker on the left edge moves up, staying on the edge.
    const avoid = { left: 0, top: 250, right: 240, bottom: 400 };
    const at = placeArrow({ x: -2000, y: 900 }, view, { ...layout, avoid: [avoid] })!;
    expect(at.x).toBe(40);
    expect(at.y).toBe(250);
  });

  it('groups enemies of one lane that are close together', () => {
    const s = nightSession();
    enemy(s, 'raider', 'west', 1, 27);
    enemy(s, 'raider', 'west', 3, 27);
    enemy(s, 'skirmisher', 'west', 5, 27);
    enemy(s, 'raider', 'west', 20, 27); // far behind: its own group
    enemy(s, 'raider', 'east', 4, 27); // other lane: its own group
    const groups = enemyGroups(s.state).sort((a, b) => b.count - a.count);
    expect(groups.map((g) => [g.lane, g.count, g.main])).toEqual([
      ['west', 3, 'raider'],
      ['west', 1, 'raider'],
      ['east', 1, 'raider'],
    ]);
  });

  it('by day, points at the spawns of tonight’s lanes', () => {
    const s = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
    const arrows = buildArrows(s.state, s.ctx, camera(20, 20), layout, new Map(), 0);
    expect(arrows.map((a) => a.key)).toEqual(['spawn-west']);
    expect(arrows[0]!.label).toBe('🪓8');
    expect(arrows[0]!.onScreen).toBe(false);
  });

  it('by day, a spawn on screen keeps its marker, standing over it', () => {
    const s = new Session(prototypeContent, { ...prototypeRun, seed: 1 });
    const spawn = s.ctx.lanes.get('west')!.points[0]!;
    const cam = camera(spawn.x - 5, spawn.y - 5);
    const [pin] = buildArrows(s.state, s.ctx, cam, layout, new Map(), 0);
    expect(pin).toMatchObject({ key: 'spawn-west', onScreen: true, angle: Math.PI / 2 });
    expect(pin!.x).toBeCloseTo(5 * 32);
    expect(pin!.y).toBeLessThan(5 * 32);
  });

  it('by night: castle under attack first, then the boss, then the biggest groups; at most six', () => {
    const s = nightSession();
    enemy(s, 'warlord', 'west', 2, 27);
    for (let i = 0; i < 9; i++) enemy(s, 'raider', 'north', 31 + i * 10, 0);
    for (let i = 0; i < 4; i++) enemy(s, 'raider', 'east', 62, 19 + i * 0.5);
    const cam = camera(0, 34); // looking at the far south edge: everything is off-screen
    const arrows = buildArrows(s.state, s.ctx, cam, layout, new Map([['castle', 1000]]), 1500);
    expect(arrows).toHaveLength(MAX_ARROWS);
    expect(arrows.map((a) => a.kind).slice(0, 3)).toEqual(['castle', 'boss', 'group']);
    expect(arrows[2]!.label).toBe('🪓4');
    // An old hit no longer counts as an attack.
    const later = buildArrows(s.state, s.ctx, cam, layout, new Map([['castle', 1000]]), 4000);
    expect(later[0]!.kind).toBe('boss');
  });
});
