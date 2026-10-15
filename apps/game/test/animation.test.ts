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
  actAt,
  blowAt,
  bodyAt,
  STOMP_TIMING,
  tellAt,
  TIMING,
  type AttackStyle,
} from '../src/game/animation.ts';

const look = { sprite: 'footman', radius: 0.3 };

describe('animation curves', () => {
  it('bobs once per stride, feet down at each stride', () => {
    expect(bobAt(0)).toBe(0);
    expect(bobAt(STRIDE_M / 2)).toBeCloseTo(1);
    expect(bobAt(STRIDE_M)).toBeCloseTo(0);
  });

  it('snaps from the wind-up to the blow, holds it, then returns, and rests outside it', () => {
    const t = TIMING.chop;
    expect(blowAt(t, -1)).toBeNull();
    expect(blowAt(t, 0, -1)).toBe(-1);
    expect(blowAt(t, t.strike / 2, -1)).toBeGreaterThan(0);
    expect(blowAt(t, t.strike)).toBe(1);
    expect(blowAt(t, t.strike + t.hold - 1)).toBe(1);
    expect(blowAt(t, t.strike + t.hold + t.recover / 2)).toBeCloseTo(0.5);
    expect(blowAt(t, t.strike + t.hold + t.recover)).toBeNull();
  });

  it('winds up only over the last moments before a blow', () => {
    const t = TIMING.thrust;
    expect(tellAt(t, Infinity)).toBe(0);
    expect(tellAt(t, t.tell)).toBe(0);
    expect(tellAt(t, t.tell / 2)).toBeCloseTo(0.5);
    expect(tellAt(t, 0)).toBe(1);
    // A tell during the recovery of the last blow blends into it rather than jumping.
    const recovering = t.strike + t.hold + t.recover / 2;
    expect(actAt(t, recovering, 0, 0.2)).toBeCloseTo(0.3);
  });

  it('fits every tell and blow inside the attack interval it shows', () => {
    // Shortest intervals: king 0.6 s, raider and harpy 1 s, archer 1.2 s, skirmisher 1.5 s,
    // catapult 3 s, warlord stomp 10 s.
    const intervals: Record<AttackStyle, number> = {
      thrust: 600,
      chop: 1000,
      dive: 1000,
      shoot: 1200,
      throw: 3000,
    };
    for (const [style, interval] of Object.entries(intervals)) {
      const t = TIMING[style as AttackStyle];
      expect(t.tell + t.strike + t.hold).toBeLessThan(interval);
    }
    expect(STOMP_TIMING.tell + STOMP_TIMING.strike).toBeLessThan(10000);
  });

  it('keeps the body still at rest and moves it with every attack', () => {
    for (const style of Object.keys(TIMING) as AttackStyle[]) {
      expect(bodyAt(style, 0)).toEqual({ lean: 0, shift: 0, lift: 0, stretch: 1, squash: 1 });
      expect(bodyAt(style, 1)).not.toEqual(bodyAt(style, 0));
      expect(bodyAt(style, -1)).not.toEqual(bodyAt(style, 0));
    }
    expect(bodyAt('thrust', 1).shift).toBeGreaterThan(0); // lunges along the spear
    expect(bodyAt('shoot', 1).shift).toBeLessThan(0); // kicks back on release
    expect(bodyAt('dive', -1).lift).toBeGreaterThan(0); // climbs, then
    expect(bodyAt('dive', 1).lift).toBeLessThan(0); // swoops
    expect(bodyAt('chop', 0, -1).lift).toBeGreaterThan(0); // rises for the stomp, then
    expect(bodyAt('chop', 0, 1).squash).toBeLessThan(1); // slams down
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
    const striker = a.pose('u1', { x: 5, y: 5 }, look, 100 + TIMING.chop.strike);
    expect(striker.swing).toBeCloseTo(1);
    expect(striker.act).toBeCloseTo(1);
    expect(striker.target).toEqual({ x: 4, y: 5 });
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
  const pose = a.pose('e1', { x: 5.1, y: 5 }, archer, 100 + TIMING.shoot.strike);
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

describe('attack tells', () => {
  const king = { sprite: 'king', radius: 0.6 };
  const hit = (id: number) => ({
    type: 'hit' as const,
    attacker: { kind: 'king' as const },
    target: { kind: 'enemy' as const, id },
    damage: 18,
  });

  it('turns to its target and draws back before the blow, then strikes from there', () => {
    const a = new Animator();
    a.pose('king', { x: 5, y: 5 }, king, 0);
    const tell = { attack: TIMING.thrust.tell / 4, stomp: Infinity, at: { x: 3, y: 5 } };
    const drawn = a.pose('king', { x: 5, y: 5 }, king, 16, tell);
    expect(drawn.act).toBeLessThan(-0.5);
    expect(drawn.facing).toBe(-1);
    expect(drawn.target).toEqual({ x: 3, y: 5 });
    expect(drawn.blow).toBe(Infinity);
    a.onEvents([hit(1)], 32, () => ({ x: 3, y: 5 }));
    // The thrust starts from the wind-up, not from rest.
    expect(a.pose('king', { x: 5, y: 5 }, king, 32).act).toBeCloseTo(drawn.act);
    const struck = a.pose('king', { x: 5, y: 5 }, king, 32 + TIMING.thrust.strike);
    expect(struck.act).toBe(1);
    expect(struck.blow).toBe(TIMING.thrust.strike);
  });

  it('thrusts once at the first of several enemies hit in one tick', () => {
    const a = new Animator();
    a.pose('king', { x: 5, y: 5 }, king, 0);
    const where: Record<number, { x: number; y: number }> = {
      1: { x: 7, y: 5 },
      2: { x: 3, y: 5 },
    };
    a.onEvents([hit(1), hit(2)], 50, (ref) => (ref.kind === 'enemy' ? where[ref.id]! : null));
    const pose = a.pose('king', { x: 5, y: 5 }, king, 60);
    expect(pose.target).toEqual({ x: 7, y: 5 });
    expect(pose.facing).toBe(1);
    expect(pose.blow).toBe(10);
  });

  it('rests when no blow is coming', () => {
    const a = new Animator();
    a.pose('e1', { x: 0, y: 0 }, look, 0);
    const pose = a.pose('e1', { x: 0, y: 0 }, look, 500);
    expect(pose.act).toBe(0);
    expect(pose.stomp).toBe(0);
    expect(pose.target).toBeNull();
  });

  it('rises for the warlord stomp, then slams down when it lands', () => {
    const a = new Animator();
    const warlord = { sprite: 'warlord', radius: 0.9 };
    a.pose('e7', { x: 0, y: 0 }, warlord, 0);
    const rising = a.pose('e7', { x: 0, y: 0 }, warlord, 16, {
      attack: Infinity,
      stomp: 10,
      at: null,
    });
    expect(rising.stomp).toBeLessThan(-0.9);
    // The stomp reports its hits first; they are the stomp, not a second swing of the weapon.
    a.onEvents(
      [
        { type: 'hit', attacker: { kind: 'enemy', id: 7 }, target: { kind: 'king' }, damage: 20 },
        { type: 'stomp', enemy: 7, hits: 1 },
      ],
      32,
      () => ({ x: 1, y: 0 }),
    );
    const slam = a.pose('e7', { x: 0, y: 0 }, warlord, 32 + STOMP_TIMING.strike);
    expect(slam.stomp).toBe(1);
    expect(slam.act).toBe(0);
    expect(slam.blow).toBe(Infinity);
  });
});
