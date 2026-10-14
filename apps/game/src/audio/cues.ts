/**
 * Which sound each game event makes (pure, no Web Audio, so it is unit-tested in Node).
 * The core reports what happened (ADR-004); this table decides how it sounds. Sounds far from
 * the king, who is always on screen, play quieter so the fight around him stays readable.
 */
import { dist, type GameEvent, type GameState, type Ref, type Vec } from '@kd/core';
import type { SoundId } from './sounds.ts';

export interface Cue {
  id: SoundId;
  /** 0–1, multiplies the sound's own volume. */
  gain: number;
}

/** The little the cue table needs to know about the world, read at the moment events arrive. */
export interface World {
  kingPos: Vec;
  /** Must still answer for an enemy killed this tick (see EnemyTypes). */
  enemyType(id: number): string | undefined;
  buildingType(id: number): string | undefined;
  /** Where an entity stands, if it still exists. */
  posOf(ref: Ref): Vec | undefined;
}

/** Full volume within this many metres of the king, fading to FAR_GAIN at FAR_M and beyond. */
const NEAR_M = 9;
const FAR_M = 30;
const FAR_GAIN = 0.2;

export function distanceGain(from: Vec, to: Vec | undefined): number {
  if (!to) return 1;
  const d = dist(from, to);
  if (d <= NEAR_M) return 1;
  if (d >= FAR_M) return FAR_GAIN;
  return 1 - ((d - NEAR_M) / (FAR_M - NEAR_M)) * (1 - FAR_GAIN);
}

const BOSS = 'warlord';

function hitSound(world: World, attacker: Ref, target: Ref): SoundId {
  switch (attacker.kind) {
    case 'king':
      return 'spearHit';
    case 'unit':
      return 'swordHit';
    case 'building':
      return world.buildingType(attacker.id) === 'ballista_tower' ? 'ballista' : 'arrowHit';
    case 'castle':
      return 'arrowHit';
    case 'enemy': {
      if (world.enemyType(attacker.id) === 'catapult') return 'boulder';
      if (target.kind === 'king') return 'kingHurt';
      if (target.kind === 'castle') return 'castleHit';
      if (target.kind === 'building') return 'woodHit';
      return world.enemyType(attacker.id) === 'skirmisher' ? 'arrowHit' : 'swordHit';
    }
  }
}

export function cuesFor(events: readonly GameEvent[], world: World): Cue[] {
  const cues: Cue[] = [];
  const near = (ref: Ref) => distanceGain(world.kingPos, world.posOf(ref));
  const add = (id: SoundId, gain = 1) => cues.push({ id, gain });

  for (const e of events) {
    switch (e.type) {
      case 'built':
        add('build');
        break;
      case 'upgraded':
        add('upgrade');
        break;
      case 'nightStarted':
        add('horn');
        break;
      case 'dawn':
        add('dawn');
        if (e.income > 0) add('coins');
        break;
      case 'enemySpawned':
        if (e.enemy === BOSS) add('bossRoar');
        break;
      case 'hit':
        add(hitSound(world, e.attacker, e.target), near(e.target));
        break;
      case 'killed':
        if (e.target.kind === 'king') add('kingDown');
        else if (e.target.kind === 'unit') add('unitDie', near(e.target));
        else if (e.target.kind === 'enemy')
          add(world.enemyType(e.target.id) === BOSS ? 'bossDie' : 'enemyDie', near(e.target));
        break;
      case 'buildingDestroyed':
        add('collapse', near({ kind: 'building', id: e.id }));
        break;
      case 'stomp':
        add('stomp', near({ kind: 'enemy', id: e.enemy }));
        break;
      case 'kingRespawned':
        add('respawn');
        break;
      case 'rallied':
        add('rally');
        break;
      case 'unitsDropped':
        add('drop');
        break;
      case 'won':
        add('victory');
        break;
      case 'lost':
        add('defeat');
        break;
      case 'unitSpawned':
        // Footmen appear together with the night horn: no sound of their own.
        break;
    }
  }
  return cues;
}

/**
 * Remembers each enemy's type from its spawn event: by the time a `killed` event arrives the
 * enemy has already left the state, and the boss's death still needs its own sound.
 */
export class EnemyTypes {
  private types = new Map<number, string>();

  /** Call with each batch before `cuesFor`; forget the dead with `forget` after it. */
  learn(events: readonly GameEvent[]): void {
    for (const e of events) if (e.type === 'enemySpawned') this.types.set(e.id, e.enemy);
  }

  forget(events: readonly GameEvent[]): void {
    for (const e of events)
      if (e.type === 'killed' && e.target.kind === 'enemy') this.types.delete(e.target.id);
  }

  get(id: number): string | undefined {
    return this.types.get(id);
  }

  clear(): void {
    this.types.clear();
  }
}

/** A World view of the live state (read-only). */
export function worldOf(state: GameState, enemies: EnemyTypes): World {
  return {
    kingPos: state.king.pos,
    enemyType: (id) => enemies.get(id) ?? state.enemies.find((e) => e.id === id)?.type,
    buildingType: (id) => state.buildings.find((b) => b.id === id)?.type,
    posOf: (ref) => {
      switch (ref.kind) {
        case 'king':
          return state.king.pos;
        case 'castle':
          return state.castle.pos;
        case 'building':
          return state.buildings.find((b) => b.id === ref.id)?.pos;
        case 'unit':
          return state.units.find((u) => u.id === ref.id)?.pos;
        case 'enemy':
          return state.enemies.find((x) => x.id === ref.id)?.pos;
      }
    },
  };
}

/** Keeps a sound from restarting more often than its minimum gap allows. */
export class Limiter {
  private last = new Map<SoundId, number>();

  allow(id: SoundId, nowMs: number, minGapMs: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && nowMs - prev < minGapMs) return false;
    this.last.set(id, nowMs);
    return true;
  }
}
