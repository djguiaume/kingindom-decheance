import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session, type GameEvent, type Ref } from '@kd/core';
import { describe, expect, it } from 'vitest';
import { trackFor } from '../src/audio/attach.ts';
import {
  cuesFor,
  distanceGain,
  EnemyTypes,
  Limiter,
  Shots,
  worldOf,
  type World,
} from '../src/audio/cues.ts';
import { SFX_DIR, SOUNDS } from '../src/audio/sounds.ts';

const run = { ...prototypeRun, seed: 1 };

const hit = (attacker: Ref, target: Ref, projectile?: true): GameEvent => ({
  type: 'hit',
  attacker,
  target,
  damage: 1,
  ...(projectile ? { projectile } : {}),
});

const world = (
  types: Record<number, string> = {},
  buildings: Record<number, string> = {},
  units: Record<number, string> = {},
  kingRolling = false,
  kingWeapon = 'spear',
): World => ({
  kingPos: { x: 0, y: 0 },
  kingRolling,
  kingWeapon,
  enemyType: (id) => types[id],
  unitType: (id) => units[id],
  buildingType: (id) => buildings[id],
  posOf: (ref) => (ref.kind === 'enemy' && ref.id === 99 ? { x: 100, y: 0 } : undefined),
});

describe('audio cues', () => {
  it('gives each kind of hit its own sound', () => {
    const hits: GameEvent[] = [
      { type: 'hit', attacker: { kind: 'king' }, target: { kind: 'enemy', id: 1 }, damage: 1 },
      {
        type: 'hit',
        attacker: { kind: 'building', id: 5 },
        target: { kind: 'enemy', id: 1 },
        damage: 1,
      },
      {
        type: 'hit',
        attacker: { kind: 'building', id: 6 },
        target: { kind: 'enemy', id: 1 },
        damage: 1,
      },
      {
        type: 'hit',
        attacker: { kind: 'enemy', id: 2 },
        target: { kind: 'building', id: 5 },
        damage: 1,
      },
      { type: 'hit', attacker: { kind: 'enemy', id: 3 }, target: { kind: 'king' }, damage: 1 },
      { type: 'hit', attacker: { kind: 'enemy', id: 1 }, target: { kind: 'castle' }, damage: 1 },
    ];
    const cues = cuesFor(
      hits,
      world({ 2: 'catapult', 1: 'raider' }, { 5: 'tower', 6: 'ballista_tower' }),
    );
    expect(cues.map((c) => c.id)).toEqual([
      'spearThrust',
      'towerShot',
      'ballista',
      'boulder',
      'axeHit',
      'kingHurt',
      'stoneHit',
    ]);
  });

  it('sounds each melee weapon, and the struck material for blows on structures', () => {
    const w = world(
      { 1: 'raider', 2: 'brute', 3: 'harpy' },
      { 7: 'stone_wall', 8: 'house' },
      {
        4: 'footman',
        5: 'knight',
      },
    );
    const ids = cuesFor(
      [
        hit({ kind: 'unit', id: 4 }, { kind: 'enemy', id: 1 }),
        hit({ kind: 'enemy', id: 1 }, { kind: 'unit', id: 5 }),
        hit({ kind: 'enemy', id: 2 }, { kind: 'unit', id: 4 }),
        hit({ kind: 'enemy', id: 2 }, { kind: 'building', id: 7 }),
        hit({ kind: 'enemy', id: 3 }, { kind: 'building', id: 8 }),
      ],
      w,
    ).map((c) => c.id);
    expect(ids).toEqual(['swordHit', 'axeHit', 'clubHit', 'stoneHit', 'woodHit']);
  });

  it('gives the roll its own impact, not a spear hit', () => {
    const e = [hit({ kind: 'king' }, { kind: 'enemy', id: 1 })];
    expect(cuesFor(e, world({}, {}, {}, true))[0]!.id).toBe('rollHit');
    expect(cuesFor(e, world())[0]!.id).toBe('spearThrust');
  });

  it('gives the Longbow king an arrow impact, not a spear thrust', () => {
    const e = [hit({ kind: 'king' }, { kind: 'enemy', id: 1 })];
    expect(cuesFor(e, world({}, {}, {}, false, 'longbow'))[0]!.id).toBe('arrowHit');
  });

  it('plays the release when a shot leaves, then the impact or the miss when it lands', () => {
    const w = world({ 2: 'catapult', 3: 'skirmisher' }, {}, { 4: 'archer', 5: 'crossbowman' });
    const shots = new Shots();
    const fired = cuesFor(
      [
        { type: 'fired', id: 10, attacker: { kind: 'unit', id: 4 } },
        { type: 'fired', id: 11, attacker: { kind: 'unit', id: 5 } },
        { type: 'fired', id: 12, attacker: { kind: 'enemy', id: 2 } },
        { type: 'fired', id: 13, attacker: { kind: 'enemy', id: 3 } },
      ],
      w,
      shots,
    ).map((c) => c.id);
    expect(fired).toEqual(['bowRelease', 'crossbowRelease', 'catapultLaunch', 'bowRelease']);

    const landed = cuesFor(
      [
        hit({ kind: 'unit', id: 4 }, { kind: 'enemy', id: 1 }, true),
        hit({ kind: 'unit', id: 5 }, { kind: 'enemy', id: 1 }, true),
        { type: 'missed', id: 12, at: { x: 1, y: 1 } },
        hit({ kind: 'enemy', id: 3 }, { kind: 'king' }, true),
      ],
      w,
      shots,
    ).map((c) => c.id);
    expect(landed).toEqual(['arrowHit', 'boltHit', 'boulderLand', 'arrowHit', 'kingHurt']);
    shots.keepOnly([]);
    expect(shots.take(13)).toBeUndefined();
  });

  it('hears a stomp as a stomp, not as axe blows on everyone it hits', () => {
    const ids = cuesFor(
      [
        { type: 'stomp', enemy: 9, hits: 2 },
        hit({ kind: 'enemy', id: 9 }, { kind: 'unit', id: 4 }),
        hit({ kind: 'enemy', id: 9 }, { kind: 'king' }),
      ],
      world({ 9: 'warlord' }),
    ).map((c) => c.id);
    expect(ids).toEqual(['stomp', 'kingHurt']);
  });

  it('plays one attack that strikes several targets once', () => {
    const cues = cuesFor(
      [
        hit({ kind: 'king' }, { kind: 'enemy', id: 1 }),
        hit({ kind: 'king' }, { kind: 'enemy', id: 2 }),
        hit({ kind: 'king' }, { kind: 'enemy', id: 3 }),
      ],
      world(),
    );
    expect(cues.map((c) => c.id)).toEqual(['spearThrust']);
  });

  it('plays far-away fights quieter', () => {
    const [cue] = cuesFor(
      [
        {
          type: 'hit',
          attacker: { kind: 'unit', id: 1 },
          target: { kind: 'enemy', id: 99 },
          damage: 1,
        },
      ],
      world(),
    );
    expect(cue!.gain).toBeLessThan(0.5);
    expect(distanceGain({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(1);
    expect(distanceGain({ x: 0, y: 0 }, undefined)).toBe(1);
  });

  it('knows the boss died even though it already left the state', () => {
    const types = new EnemyTypes();
    const spawn: GameEvent[] = [{ type: 'enemySpawned', id: 7, enemy: 'warlord', lane: 'west' }];
    types.learn(spawn);
    const state = new Session(prototypeContent, run).state;
    expect(cuesFor(spawn, worldOf(state, types)).map((c) => c.id)).toEqual(['bossRoar']);
    const death: GameEvent[] = [{ type: 'killed', target: { kind: 'enemy', id: 7 } }];
    types.learn(death);
    expect(cuesFor(death, worldOf(state, types)).map((c) => c.id)).toEqual(['bossDie']);
    types.forget(death);
    expect(types.get(7)).toBeUndefined();
  });

  it('has a sound for every event a real night produces', () => {
    const session = new Session(prototypeContent, run);
    const events: GameEvent[] = [];
    const r = session.submit({ type: 'startNight' });
    if (r.ok) events.push(...r.events);
    for (let i = 0; i < 30 * 60 && session.state.phase === 'night'; i++)
      events.push(...session.step());
    const cues = cuesFor(events, worldOf(session.state, new EnemyTypes()));
    expect(cues.length).toBeGreaterThan(0);
    for (const c of cues) expect(SOUNDS[c.id]).toBeDefined();
  });

  it('ships every recorded take a sound lists', () => {
    const shipped = Object.keys(import.meta.glob('../public/sfx/*.mp3')).map((p) =>
      p.replace('../public/', ''),
    );
    const files = Object.values(SOUNDS).flatMap((def) => def.files ?? []);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(shipped, f).toContain(SFX_DIR + f);
  });

  it('limits how often one sound restarts', () => {
    const l = new Limiter();
    expect(l.allow('swordHit', 0, 60)).toBe(true);
    expect(l.allow('swordHit', 30, 60)).toBe(false);
    expect(l.allow('arrowHit', 30, 60)).toBe(true);
    expect(l.allow('swordHit', 70, 60)).toBe(true);
  });

  it('picks the music from the phase, with finale drums on the last night', () => {
    const state = new Session(prototypeContent, run).state;
    expect(trackFor(state, 6, false)).toBe('day');
    expect(trackFor(state, 6, true)).toBeNull();
    expect(trackFor({ ...state, phase: 'night', day: 2 }, 6, false)).toBe('night');
    expect(trackFor({ ...state, phase: 'night', day: 6 }, 6, false)).toBe('finale');
    expect(trackFor({ ...state, phase: 'won' }, 6, false)).toBeNull();
  });
});
