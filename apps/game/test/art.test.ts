import { describe, expect, it } from 'vitest';
import { prototypeContent } from '@kd/content/prototype';
import {
  Art,
  atlasFiles,
  RIGS,
  textureFiles,
  tipReach,
  weaponAngle,
  weaponReach,
} from '../src/game/art.ts';
import { seenFromBehind, STRIDE_M, KING_STRIDE_M } from '../src/game/animation.ts';

const art = new Art([
  ['art:friendly', ['footman', 'footman.back', 'footman_weapon', 'archer', 'archer_weapon']],
  [
    'art:kings',
    [
      'king_roll_idle',
      'king_roll_idle.back',
      'king_roll_anticipate',
      ...[1, 2, 3, 4].map((n) => `king_roll_roll.f${n}`),
      ...[1, 2].map((n) => `king_roll_uncurl.f${n}`),
      ...[1, 2, 3, 4].map((n) => `king_roll_walk.f${n}`),
      ...[1, 2, 3, 4].map((n) => `king_roll_walk.back.f${n}`),
      'king_wolf_idle',
      ...[1, 2, 3, 4].map((n) => `king_wolf_walk.f${n}`),
      ...[1, 2, 3].map((n) => `king_wolf_lunge.f${n}`),
    ],
  ],
  ['art:enemies', ['harpy.f1', 'harpy.f2', 'harpy.f3', 'catapult_chassis']],
  ['art:structures', ['gate_wood.f1', 'gate_wood.f2']],
  ['art:buildings', ['castle_1', 'house']],
]);
const still = { back: false, walked: 0, moving: false };
const roll = prototypeContent.kings.find((king) => king.id === 'roll')!.art;
const wolf = prototypeContent.kings.find((king) => king.id === 'wolf')!.art;

describe('atlas files', () => {
  it('pairs each image with its JSON and skips the index', () => {
    expect(
      atlasFiles({
        '/a/friendly.webp': 'f.webp',
        '/a/friendly.json': 'f.json',
        '/a/index.json': 'i.json',
        '/a/lonely.json': 'l.json',
      }),
    ).toEqual([{ key: 'art:friendly', image: 'f.webp', json: 'f.json' }]);
  });

  it('loads standalone terrain textures separately from atlas pages', () => {
    expect(
      textureFiles({
        '/a/friendly.webp': 'f.webp',
        '/a/friendly.json': 'f.json',
        '/a/tile_grass.webp': 'grass.webp',
        '/a/map_background.webp': 'map.webp',
      }),
    ).toEqual([
      { key: 'art:map_background', image: 'map.webp' },
      { key: 'art:tile_grass', image: 'grass.webp' },
    ]);
  });
});

describe('art frames', () => {
  it('draws an id without art in code (null)', () => {
    expect(art.body('raider', still, STRIDE_M, 0)).toBeNull();
    expect(art.still('tower')).toBeNull();
    expect(new Art([]).empty).toBe(true);
  });

  it('shows the back view walking up, the front one otherwise', () => {
    expect(art.body('footman', still, STRIDE_M, 0)).toBe('footman');
    expect(art.body('footman', { ...still, back: true }, STRIDE_M, 0)).toBe('footman.back');
    // No back view painted: the front one.
    expect(art.body('archer', { ...still, back: true }, STRIDE_M, 0)).toBe('archer');
  });

  it('walks the king through his four frames once per stride', () => {
    expect(art.body('king', still, STRIDE_M, 0, null, roll)).toBe('king_roll_idle');
    const walk = (m: number, back = false) =>
      art.body('king', { back, walked: m, moving: true }, STRIDE_M, 0, null, roll);
    expect(walk(0)).toBe('king_roll_walk.f1');
    expect(walk(STRIDE_M * 0.5)).toBe('king_roll_walk.f3');
    expect(walk(STRIDE_M * 1.25)).toBe('king_roll_walk.f2');
    expect(walk(0, true)).toBe('king_roll_walk.back.f1');
  });

  it('uses the selected king art and ability sequence', () => {
    expect(art.body('king', still, STRIDE_M, 0, null, wolf)).toBe('king_wolf_idle');
    expect(art.body('king', still, STRIDE_M, 0, { phase: 'roll', elapsed: 70 }, wolf)).toBe(
      'king_wolf_lunge.f2',
    );
  });

  it('beats a flyer’s wings up and down', () => {
    const at = (ms: number) => art.body('harpy', still, STRIDE_M, ms);
    expect([0, 110, 220, 330, 440].map(at)).toEqual([
      'harpy.f1',
      'harpy.f2',
      'harpy.f3',
      'harpy.f2',
      'harpy.f1',
    ]);
  });

  it('maps the castle and catapult to their painted names, and sequences by progress', () => {
    expect(art.still('castle')).toBe('castle_1');
    expect(art.body('catapult', still, STRIDE_M, 0)).toBe('catapult_chassis');
    expect(art.at('gate_wood', 0)).toBe('gate_wood.f1');
    expect(art.at('gate_wood', 0.99)).toBe('gate_wood.f2');
    expect(art.at('gate_wood.side', 0)).toBeNull();
  });

  it('gives a weapon layer only when it is painted', () => {
    expect(art.rig('footman')?.frame).toBe('footman_weapon');
    expect(art.rig('knight')).toBeNull();
  });
});

describe('weapons', () => {
  it('swing from raised to struck forward, whatever way they were painted', () => {
    // A sword painted pointing right and an axe painted pointing up end up the same way.
    const sword = RIGS.knight!;
    const axe = RIGS.raider!;
    for (const act of [-1, 0, 1])
      expect(weaponAngle(sword, act) + sword.points).toBeCloseTo(
        weaponAngle(axe, act) + axe.points,
      );
    // Raised back over the head on the tell, struck through to forward and down.
    expect(weaponAngle(sword, -1)).toBeLessThan(-Math.PI / 2);
    expect(weaponAngle(sword, 1)).toBeGreaterThan(0);
    expect(weaponAngle(RIGS.archer!, 1)).toBe(0);
  });

  it('levels the spear at its target and drives it well past the body', () => {
    const spear = RIGS.king!;
    expect(weaponAngle(spear, 0, 0.4)).toBeLessThan(-0.3); // at the slope at rest
    expect(weaponAngle(spear, 1, 0.4)).toBeCloseTo(0.4);
    expect(weaponAngle(spear, -1, -0.6)).toBeCloseTo(-0.6);
    expect(weaponReach(spear, -1)).toBeLessThan(0); // drawn back
    expect(weaponReach(spear, 1)).toBeGreaterThan(0.5); // thrust
    expect(tipReach(spear)).toBeCloseTo(0.58);
  });

  it('tilts a bow toward its target as it draws, and kicks it back on release', () => {
    const bow = RIGS.skirmisher!;
    expect(weaponAngle(bow, 0, 0.5)).toBe(0);
    expect(weaponAngle(bow, -1, 0.5)).toBeCloseTo(0.5);
    expect(weaponReach(bow, 1)).toBeLessThan(0);
  });
});

describe('back view', () => {
  it('turns its back walking up, its front walking down or sideways, keeps it near 45°', () => {
    expect(seenFromBehind(0, -1, false)).toBe(true);
    expect(seenFromBehind(0, 1, true)).toBe(false);
    expect(seenFromBehind(1, 0, true)).toBe(false);
    expect(seenFromBehind(1, -1, true)).toBe(true);
    expect(seenFromBehind(1, -1, false)).toBe(false);
  });
});

describe('king art actions', () => {
  it('uses the roll sequence during charge, uncurls afterwards, and can fall back without it', () => {
    expect(
      art.body('king', still, KING_STRIDE_M, 0, { phase: 'anticipate', elapsed: 0 }, roll),
    ).toBe('king_roll_anticipate');
    expect(art.body('king', still, KING_STRIDE_M, 0, { phase: 'roll', elapsed: 120 }, roll)).toBe(
      'king_roll_roll.f3',
    );
    expect(art.body('king', still, KING_STRIDE_M, 0, { phase: 'uncurl', elapsed: 100 }, roll)).toBe(
      'king_roll_uncurl.f2',
    );
    const old = new Art([['kings', ['king_roll_idle']]]);
    expect(old.body('king', still, KING_STRIDE_M, 0, { phase: 'roll', elapsed: 60 }, roll)).toBe(
      'king_roll_idle',
    );
  });

  it('advances about ten walk frames per second at the current 7 m/s speed', () => {
    const walk = (seconds: number) =>
      art.body(
        'king',
        { ...still, moving: true, walked: 7 * seconds },
        KING_STRIDE_M,
        0,
        null,
        roll,
      );
    expect(walk(0)).toBe('king_roll_walk.f1');
    expect(walk(0.1)).toBe('king_roll_walk.f2');
    expect(walk(0.2)).toBe('king_roll_walk.f3');
    expect(walk(0.4)).toBe('king_roll_walk.f1');
  });
});
