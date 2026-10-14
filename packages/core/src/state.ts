/**
 * GameState: the whole run as one plain, serializable object (ADR-002).
 * Like a DTO graph with no behaviour: entities are records in id-ordered arrays,
 * and systems (plain functions) read and change them. Because it is plain data,
 * `structuredClone(state)` is a full snapshot and `JSON.stringify` a save file.
 */
import type { RngState } from './rng.ts';
import type { Vec } from './vec.ts';

export type Phase = 'day' | 'night' | 'won' | 'lost';

/** Reference to any entity that can attack or be attacked. */
export type Ref =
  | { kind: 'king' }
  | { kind: 'castle' }
  | { kind: 'building'; id: number }
  | { kind: 'unit'; id: number }
  | { kind: 'enemy'; id: number };

export interface Combatant {
  pos: Vec;
  hp: number;
  maxHp: number;
  /** Ticks until this entity may attack again. */
  cooldown: number;
}

export interface CastleState extends Combatant {
  radius: number;
}

export interface DashState {
  /** Unit direction of the dash. */
  dir: Vec;
  ticksLeft: number;
  /** Enemies already hit by this dash (each is hit once). */
  hit: number[];
}

export interface KingState extends Combatant {
  alive: boolean;
  /** Ticks left before respawning; 0 while alive. */
  respawnIn: number;
  /** Desired movement direction from the latest move command, length ≤ 1. */
  intent: Vec;
  /** Last non-zero movement direction (unit vector); abilities aim along it. */
  facing: Vec;
  /** Ticks since the king last took damage; regeneration starts after a delay. */
  calm: number;
  /** Ticks before the weapon ability can be used again. */
  abilityCooldown: number;
  dash: DashState | null;
}

export interface BuildingState extends Combatant {
  id: number;
  /** Map node id of the slot this building stands on. */
  slot: string;
  /** Building content id (changes on upgrade). */
  type: string;
  destroyed: boolean;
  /** Military buildings: the rally gate node its squad guards. */
  rally: string | null;
  /**
   * Military buildings: where the king planted the squad's flag. Overrides the rally gate;
   * null means the squad guards its gate.
   */
  banner: Vec | null;
  /** By day, the king carries this squad's flag; it is planted where he next rallies. */
  carried: boolean;
}

export interface UnitState extends Combatant {
  id: number;
  type: string;
  /** The military building this unit belongs to. */
  home: number;
  /** The spot it guards (around its building's rally gate, or where the king dropped it). */
  post: Vec;
  /** At night, rallied units follow the king instead of guarding their post. */
  following: boolean;
  target: Ref | null;
}

export interface EnemyState extends Combatant {
  id: number;
  type: string;
  lane: string;
  /** Index of the next waypoint in the lane path. */
  waypoint: number;
  target: Ref | null;
  /** Ticks until its own ability (the boss's stomp) is ready; 0 for enemies without one. */
  abilityCooldown: number;
}

/** A shot in flight: it lands where its target stood when it was fired (dodgeable). */
export interface ProjectileState {
  id: number;
  attacker: Ref;
  target: Ref;
  from: Vec;
  to: Vec;
  /** Damage it deals if it lands on its target. */
  damage: number;
  /** Total flight time, and what is left of it, in ticks. */
  flight: number;
  ticksLeft: number;
}

export interface SpawnOrder {
  /** Night tick at which this enemy appears. */
  at: number;
  lane: string;
  enemy: string;
}

export interface NightStats {
  night: number;
  /** Gold paid at the dawn after this night. */
  income: number;
  buildingsLost: number;
  enemiesKilled: number;
  ticks: number;
}

export interface GameState {
  schemaVersion: number;
  contentHash: string;
  mapId: string;
  weaponId: string;
  seed: number;
  rng: RngState;
  phase: Phase;
  /** Current day/night number, 1-based. */
  day: number;
  /** Ticks simulated since the run began (day and night). Commands are logged against it. */
  tick: number;
  /** Ticks since the current night began. */
  nightTick: number;
  gold: number;
  /** The castle's level, 1 at the start; each level is bought by day (13 §1). */
  castleLevel: number;
  /** Ids of the perks picked so far, in the order they were picked. */
  perks: string[];
  nextId: number;
  castle: CastleState;
  king: KingState;
  buildings: BuildingState[];
  units: UnitState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  spawnQueue: SpawnOrder[];
  history: NightStats[];
  current: NightStats;
}
