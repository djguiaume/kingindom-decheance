/**
 * Content schemas (ADR-006). These Zod schemas are the single source of truth:
 * TypeScript types are inferred from them, and the same schemas validate JSON at load time.
 * Think of them as the JPA entities + Bean Validation annotations of the content layer.
 *
 * Units: distances are in map units, durations in seconds, speeds in units per second.
 * The core converts seconds to ticks; content never mentions ticks.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'ids are lower-case, digits, - or _');
const Vec2 = z.tuple([z.number(), z.number()]);
const Positive = z.number().positive();
const NonNegative = z.number().nonnegative();
/** Every file may point at its exported JSON Schema for editor autocomplete. */
const Meta = {
  $schema: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  notes: z.string().optional(),
};

export const TargetLayer = z.enum(['ground', 'air']);

/** What an enemy may choose to attack, in priority order (08 §5 `target_priority`). */
export const TargetCategory = z.enum(['wall', 'eco', 'building', 'unit', 'king', 'castle']);

export const Attack = z.object({
  damage: Positive,
  /** Seconds between two hits. */
  interval: Positive,
  range: Positive,
  /** Splash radius around the target; 0 = single target. */
  aoe: NonNegative.default(0),
  targets: z.array(TargetLayer).min(1),
});

export const BuildingClass = z.enum(['eco', 'tower', 'wall', 'military']);

export const Upgrade = z.object({
  to: Id,
  cost: NonNegative,
  /** Upgrades sharing a group are mutually exclusive branches. */
  exclusiveGroup: z.string().nullable().default(null),
});

export const Building = z.object({
  id: Id,
  name: z.string(),
  class: BuildingClass,
  cost: NonNegative,
  hp: Positive,
  /** Gold paid at dawn if the building survived the night. */
  income: NonNegative.default(0),
  radius: Positive.default(0.5),
  upgrades: z.array(Upgrade).default([]),
  attack: Attack.optional(),
  spawns: z.object({ unit: Id, count: z.number().int().positive() }).optional(),
});

export const Unit = z.object({
  id: Id,
  name: z.string(),
  hp: Positive,
  speed: Positive,
  radius: Positive.default(0.3),
  /** Distance from its post at which the unit notices an enemy. */
  aggroRange: Positive,
  attack: Attack,
});

export const EnemyArchetype = z.enum([
  'swarm',
  'tank',
  'siege',
  'flyer',
  'ranged',
  'fast',
  'exploder',
  'boss',
]);

export const Enemy = z.object({
  id: Id,
  name: z.string(),
  archetype: EnemyArchetype,
  hp: Positive,
  speed: Positive,
  radius: Positive.default(0.3),
  flying: z.boolean().default(false),
  /** Distance at which the enemy leaves its lane to go for a target. */
  aggroRange: Positive,
  attack: Attack,
  targetPriority: z.array(TargetCategory).min(1),
});

export const Weapon = z.object({
  id: Id,
  name: z.string(),
  hp: Positive,
  speed: Positive,
  radius: Positive.default(0.4),
  respawnSeconds: NonNegative,
  attack: Attack,
});

export const MapNode = z.object({
  id: Id,
  pos: Vec2,
  /** Present when a building can be placed here (fixed slots, ADR-001 / 03). */
  slot: z
    .object({
      options: z.array(Id).min(1),
    })
    .optional(),
});

export const Lane = z.object({
  id: Id,
  /** Node ids from spawn to castle, in walking order. */
  path: z.array(Id).min(2),
  air: z.boolean().default(false),
});

export const WaveGroup = z.object({
  lane: Id,
  enemy: Id,
  count: z.number().int().positive(),
  /** Seconds after night start before the first spawn. */
  delay: NonNegative.default(0),
  /** Seconds between two spawns of this group. */
  interval: NonNegative.default(1),
});

export const Wave = z.object({
  night: z.number().int().positive(),
  groups: z.array(WaveGroup).min(1),
});

export const GameMap = z.object({
  ...Meta,
  id: Id,
  name: z.string(),
  nights: z.number().int().positive(),
  startingGold: NonNegative,
  castle: z.object({ node: Id, hp: Positive, radius: Positive.default(1) }),
  /** Where the king appears at the start of each night and after respawning. */
  kingSpawn: Id,
  nodes: z.array(MapNode).min(1),
  lanes: z.array(Lane).min(1),
  waves: z.array(Wave).min(1),
});

export const BuildingCatalog = z.object({ ...Meta, buildings: z.array(Building) });
export const UnitCatalog = z.object({ ...Meta, units: z.array(Unit) });
export const EnemyCatalog = z.object({ ...Meta, enemies: z.array(Enemy) });
export const WeaponCatalog = z.object({ ...Meta, weapons: z.array(Weapon) });

export type TargetLayer = z.infer<typeof TargetLayer>;
export type TargetCategory = z.infer<typeof TargetCategory>;
export type Attack = z.infer<typeof Attack>;
export type BuildingClass = z.infer<typeof BuildingClass>;
export type Building = z.infer<typeof Building>;
export type Unit = z.infer<typeof Unit>;
export type Enemy = z.infer<typeof Enemy>;
export type Weapon = z.infer<typeof Weapon>;
export type MapNode = z.infer<typeof MapNode>;
export type Lane = z.infer<typeof Lane>;
export type WaveGroup = z.infer<typeof WaveGroup>;
export type GameMap = z.infer<typeof GameMap>;

/** Everything a run needs, after validation. */
export interface ContentBundle {
  buildings: Building[];
  units: Unit[];
  enemies: Enemy[];
  weapons: Weapon[];
  maps: GameMap[];
  /** Stable hash of the validated content, recorded in every run (ADR-006). */
  hash: string;
}

/** Raw, unvalidated file contents as read from disk or imported by Vite. */
export interface RawContent {
  buildings: unknown;
  units: unknown;
  enemies: unknown;
  weapons: unknown;
  maps: unknown[];
}
