import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session, type GameEvent } from '@kd/core';
import { describe, expect, it } from 'vitest';
import { trackFor } from '../src/audio/attach.ts';
import {
  cuesFor,
  distanceGain,
  EnemyTypes,
  Limiter,
  worldOf,
  type World,
} from '../src/audio/cues.ts';
import { SOUNDS } from '../src/audio/sounds.ts';

const run = { ...prototypeRun, seed: 1 };

const world = (
  types: Record<number, string> = {},
  buildings: Record<number, string> = {},
): World => ({
  kingPos: { x: 0, y: 0 },
  enemyType: (id) => types[id],
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
      'spearHit',
      'arrowHit',
      'ballista',
      'boulder',
      'kingHurt',
      'castleHit',
    ]);
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
