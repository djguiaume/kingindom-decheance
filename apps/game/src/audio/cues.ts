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
  /** True while the king rolls (his dash), and for the batch right after it ends. */
  kingRolling: boolean;
  /** The king's weapon id (spear, longbow). */
  kingWeapon: string;
  /** Must still answer for an enemy killed this tick (see EnemyTypes). */
  enemyType(id: number): string | undefined;
  unitType(id: number): string | undefined;
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

/** What an attacker strikes or shoots with: it decides the sound, not the attacker's side. */
export type Weapon =
  | 'spear'
  | 'roll'
  | 'sword'
  | 'axe'
  | 'club'
  | 'bow'
  | 'crossbow'
  | 'tower'
  | 'ballista'
  | 'boulder';

/** Each unit and enemy by the weapon its art carries (art-pipeline catalog). */
const WEAPONS: Record<string, Weapon> = {
  footman: 'sword',
  knight: 'sword',
  archer: 'bow',
  crossbowman: 'crossbow',
  raider: 'axe',
  harpy: 'axe',
  warlord: 'axe',
  brute: 'club',
  skirmisher: 'bow',
  catapult: 'boulder',
};

export function weaponOf(world: World, ref: Ref): Weapon {
  switch (ref.kind) {
    case 'king':
      if (world.kingRolling) return 'roll';
      return world.kingWeapon === 'longbow' ? 'bow' : 'spear';
    case 'castle':
      return 'tower';
    case 'building':
      return world.buildingType(ref.id) === 'ballista_tower' ? 'ballista' : 'tower';
    case 'unit':
      return WEAPONS[world.unitType(ref.id) ?? ''] ?? 'sword';
    case 'enemy':
      return WEAPONS[world.enemyType(ref.id) ?? ''] ?? 'axe';
  }
}

/** The sound of letting a shot go, when the attacker draws, loads or swings it. */
const RELEASE: Partial<Record<Weapon, SoundId>> = {
  bow: 'bowRelease',
  crossbow: 'crossbowRelease',
  boulder: 'catapultLaunch',
};

/** A shot that lands on nothing: it thuds into the ground instead of striking flesh or wood. */
const MISS: Partial<Record<Weapon, SoundId>> = {
  bow: 'arrowMiss',
  crossbow: 'arrowMiss',
  boulder: 'boulderLand',
};

const STRIKE: Record<Weapon, SoundId> = {
  spear: 'spearThrust',
  roll: 'rollHit',
  sword: 'swordHit',
  axe: 'axeHit',
  club: 'clubHit',
  bow: 'arrowHit',
  crossbow: 'boltHit',
  tower: 'towerShot',
  ballista: 'ballista',
  boulder: 'boulder',
};

const STONE = new Set(['stone_wall']);

/** The impact: the weapon on a body, or the struck material for a melee blow on a structure. */
function strikeSound(world: World, weapon: Weapon, target: Ref, projectile: boolean): SoundId {
  const melee = !projectile && RELEASE[weapon] === undefined;
  if (melee && target.kind === 'castle') return 'stoneHit';
  if (melee && target.kind === 'building')
    return STONE.has(world.buildingType(target.id) ?? '') ? 'stoneHit' : 'woodHit';
  return STRIKE[weapon];
}

const refKey = (ref: Ref) => ('id' in ref ? `${ref.kind}${ref.id}` : ref.kind);

export function cuesFor(
  events: readonly GameEvent[],
  world: World,
  shots: Shots = new Shots(),
): Cue[] {
  const cues: Cue[] = [];
  const near = (ref: Ref) => distanceGain(world.kingPos, world.posOf(ref));
  const add = (id: SoundId, gain = 1) => cues.push({ id, gain });
  // One attack that strikes three enemies (spear arc, volley tower) is one sound, not three.
  const struck = new Map<string, Cue>();
  const once = (by: Ref, id: SoundId, gain: number) => {
    const key = `${refKey(by)}:${id}`;
    const cue = struck.get(key);
    if (cue) cue.gain = Math.max(cue.gain, gain);
    else {
      const fresh = { id, gain };
      struck.set(key, fresh);
      cues.push(fresh);
    }
  };

  // A stomp also reports each one it hits as a hit: those are the stomp, not axe blows.
  const stompers = new Set(
    events.flatMap((e) => (e.type === 'stomp' ? [refKey({ kind: 'enemy', id: e.enemy })] : [])),
  );

  for (const e of events) {
    switch (e.type) {
      case 'built':
        add('build');
        break;
      case 'upgraded':
      case 'castleUpgraded':
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
      case 'fired': {
        const weapon = weaponOf(world, e.attacker);
        shots.fired(e.id, weapon);
        const release = RELEASE[weapon];
        if (release) once(e.attacker, release, near(e.attacker));
        break;
      }
      case 'missed': {
        const miss = MISS[shots.take(e.id) ?? 'bow'];
        if (miss) add(miss, distanceGain(world.kingPos, e.at));
        break;
      }
      case 'hit': {
        if (stompers.has(refKey(e.attacker))) {
          if (e.target.kind === 'king') add('kingHurt');
          break;
        }
        let weapon = weaponOf(world, e.attacker);
        // A shooter killed while its shot flew no longer answers: it still landed an arrow.
        if (e.projectile && !RELEASE[weapon]) weapon = 'bow';
        once(e.attacker, strikeSound(world, weapon, e.target, !!e.projectile), near(e.target));
        // The blow is heard first; the king's grunt rides on top so danger stays audible.
        if (e.target.kind === 'king') add('kingHurt');
        break;
      }
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
 * Remembers what each shot in flight is (arrow, bolt, boulder) from its `fired` event: a
 * `missed` event names only the shot, and the shooter may be dead by the time it lands.
 */
export class Shots {
  private weapons = new Map<number, Weapon>();

  fired(id: number, weapon: Weapon): void {
    this.weapons.set(id, weapon);
  }

  take(id: number): Weapon | undefined {
    const weapon = this.weapons.get(id);
    this.weapons.delete(id);
    return weapon;
  }

  /** Forgets shots that are no longer flying (hits do not name their shot). */
  keepOnly(flying: readonly { id: number }[]): void {
    const ids = new Set(flying.map((p) => p.id));
    for (const id of this.weapons.keys()) if (!ids.has(id)) this.weapons.delete(id);
  }

  clear(): void {
    this.weapons.clear();
  }
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
export function worldOf(
  state: GameState,
  enemies: EnemyTypes,
  wasRolling = false,
  rollAbility = true,
  kingWeapon = 'spear',
): World {
  return {
    kingPos: state.king.pos,
    // The dash's last tick both hits and ends it, so a roll seen just before still counts.
    kingRolling: (rollAbility && state.king.dash !== null) || wasRolling,
    kingWeapon,
    enemyType: (id) => enemies.get(id) ?? state.enemies.find((e) => e.id === id)?.type,
    unitType: (id) => state.units.find((u) => u.id === id)?.type,
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
