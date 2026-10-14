import { describe, expect, it } from 'vitest';
import {
  Animator,
  KingActions,
  KING_STRIDE_M,
  bobAt,
  FADE_MS,
  FALL_MS,
  fallAt,
  FLASH_MS,
  flashAt,
  STRIDE_M,
  SWING_MS,
  swingAt,
} from '../src/game/animation.ts';

const look = { sprite: 'footman', radius: 0.3 };

describe('animation curves', () => {
  it('bobs once per stride, feet down at each stride', () => {
    expect(bobAt(0)).toBe(0);
    expect(bobAt(STRIDE_M / 2)).toBeCloseTo(1);
    expect(bobAt(STRIDE_M)).toBeCloseTo(0);
  });

  it('swings fast to the blow, then returns, and rests outside the swing', () => {
    expect(swingAt(-1)).toBe(0);
    expect(swingAt(SWING_MS * 0.35)).toBeCloseTo(1);
    expect(swingAt(SWING_MS * 0.7)).toBeGreaterThan(0);
    expect(swingAt(SWING_MS)).toBe(0);
  });

  it('flashes at once and fades out', () => {
    expect(flashAt(0)).toBe(1);
    expect(flashAt(FLASH_MS / 2)).toBeCloseTo(0.5);
    expect(flashAt(FLASH_MS)).toBe(0);
  });

  it('tips a body over, then fades it, then drops it', () => {
    expect(fallAt(0)).toEqual({ tip: 0, alpha: 1 });
    expect(fallAt(FALL_MS)!.tip).toBe(1);
    expect(fallAt(FALL_MS + FADE_MS / 2)!.alpha).toBeCloseTo(0.5);
    expect(fallAt(FALL_MS + FADE_MS)).toBeNull();
  });
});

describe('Animator', () => {
  it('bobs while walking and settles when standing', () => {
    const a = new Animator();
    a.pose('u1', { x: 0, y: 0 }, look, 0);
    const walking = a.pose('u1', { x: STRIDE_M / 2, y: 0 }, look, 16);
    expect(walking.bob).toBeGreaterThan(0.9);
    expect(walking.facing).toBe(1);
    let still = walking;
    for (let i = 0; i < 20; i++) still = a.pose('u1', { x: STRIDE_M / 2, y: 0 }, look, 32 + i * 16);
    expect(still.bob).toBeCloseTo(0);
  });

  it('faces left when walking left, and does not count a respawn jump as steps', () => {
    const a = new Animator();
    a.pose('king', { x: 5, y: 5 }, look, 0);
    expect(a.pose('king', { x: 4.9, y: 5 }, look, 16).facing).toBe(-1);
    expect(a.pose('king', { x: 20, y: 20 }, look, 32).bob).toBeCloseTo(bobAt(0.1));
  });

  it('swings the attacker toward its target and flashes the one hit', () => {
    const a = new Animator();
    a.pose('u1', { x: 5, y: 5 }, look, 0);
    a.pose('e2', { x: 4, y: 5 }, look, 0);
    a.onEvents(
      [
        {
          type: 'hit',
          attacker: { kind: 'unit', id: 1 },
          target: { kind: 'enemy', id: 2 },
          damage: 5,
        },
      ],
      100,
      () => ({ x: 4, y: 5 }),
    );
    const striker = a.pose('u1', { x: 5, y: 5 }, look, 100 + SWING_MS * 0.35);
    expect(striker.swing).toBeCloseTo(1);
    expect(striker.facing).toBe(-1);
    expect(a.pose('e2', { x: 4, y: 5 }, look, 100).flash).toBe(1);
  });

  it('leaves a falling body where an actor died, until it fades', () => {
    const a = new Animator();
    a.pose('e3', { x: 2, y: 3 }, { sprite: 'raider', radius: 0.35 }, 0);
    a.onEvents([{ type: 'killed', target: { kind: 'enemy', id: 3 } }], 50, () => null);
    expect(a.corpses).toEqual([
      { pos: { x: 2, y: 3 }, sprite: 'raider', radius: 0.35, facing: 1, start: 50 },
    ]);
    a.prune(new Set(), 50 + FALL_MS + FADE_MS);
    expect(a.corpses).toEqual([]);
  });

  it('flashes buildings, which never walk', () => {
    const a = new Animator();
    a.still('b4', { x: 1, y: 1 });
    a.onEvents(
      [
        {
          type: 'hit',
          attacker: { kind: 'enemy', id: 1 },
          target: { kind: 'building', id: 4 },
          damage: 3,
        },
      ],
      10,
      () => null,
    );
    expect(a.flash('b4', 10)).toBe(1);
    expect(a.flash('b4', 10 + FLASH_MS)).toBe(0);
  });
});

describe('king action presentation', () => {
  it('rolls only during an actual accepted dash, then uncurls, and clears on death', () => {
    const a = new KingActions();
    expect(a.update(false, true, 0)).toBeNull();
    expect(a.update(true, true, 10)?.phase).toBe('anticipate');
    expect(a.update(true, true, 50)?.phase).toBe('roll');
    expect(a.update(false, true, 310)?.phase).toBe('uncurl');
    expect(a.update(false, true, 471)).toBeNull();
    a.update(true, true, 500);
    expect(a.update(false, false, 510)).toBeNull();
    expect(a.update(false, true, 900)).toBeNull();
  });

  it('settles the king at the same pace at 30, 60 and 120 FPS', () => {
    for (const fps of [30, 60, 120]) {
      const a = new Animator();
      const king = { sprite: 'king', radius: 0.6 };
      a.pose('king', { x: 0, y: 0 }, king, 0);
      const moving = a.pose('king', { x: KING_STRIDE_M / 4, y: 0 }, king, 16);
      expect(moving.bob).toBeGreaterThan(0);
      let pose = moving;
      for (let t = 1000 / fps; t <= 160 + 0.01; t += 1000 / fps)
        pose = a.pose('king', { x: KING_STRIDE_M / 4, y: 0 }, king, 16 + t);
      expect(pose.bob).toBeCloseTo(0);
    }
  });
});

it('faces a ranged attacker at release, keeps that facing through its recoil, and does not attack again on impact', () => {
  const a = new Animator();
  const archer = { sprite: 'skirmisher', radius: 0.3 };
  a.pose('e1', { x: 5, y: 5 }, archer, 0);
  a.onEvents(
    [{ type: 'fired', id: 2, attacker: { kind: 'enemy', id: 1 } }],
    100,
    () => null,
    () => ({ x: 0, y: 5 }),
  );
  const pose = a.pose('e1', { x: 5.1, y: 5 }, archer, 100 + SWING_MS * 0.35);
  expect(pose.swing).toBeCloseTo(1);
  expect(pose.facing).toBe(-1); // small movement cannot turn the weapon away during recoil
  a.onEvents(
    [
      {
        type: 'hit',
        attacker: { kind: 'enemy', id: 1 },
        target: { kind: 'king' },
        damage: 1,
        projectile: true,
      },
    ],
    500,
    () => null,
  );
  expect(a.pose('e1', { x: 5.1, y: 5 }, archer, 500).swing).toBe(0);
});
