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
export const TargetCategory = z.enum([
  'wall',
  'eco',
  'tower',
  'building',
  'unit',
  'king',
  'castle',
]);

export const Attack = z.object({
  damage: Positive,
  /** Seconds between two hits. */
  interval: Positive,
  range: Positive,
  /** Splash radius around the target; 0 = single target. */
  aoe: NonNegative.default(0),
  /** How many enemies one attack hits (the nearest ones in range). */
  maxTargets: z.number().int().positive().default(1),
  /**
   * Extra targets must lie within this cone (degrees) around the direction of the first one.
   * 360 = any direction.
   */
  arc: z.number().positive().max(360).default(360),
  /** Damage multiplier per enemy archetype, e.g. { "tank": 1.6 } (08 §3.2 counters). */
  bonus: z.record(z.string(), Positive).default({}),
  targets: z.array(TargetLayer).min(1),
  /**
   * The attack fires a projectile that flies to where the target stood when it was fired and
   * only hits if the target is still there, so a moving target can dodge it. Without it the
   * hit lands at once. Single-target attacks only (no maxTargets or aoe).
   */
  projectile: z.object({ speed: Positive }).optional(),
});

export const BuildingClass = z.enum(['eco', 'tower', 'wall', 'military']);

/**
 * When a catalogue entry becomes available through XP levels (13 §6.4). Absent means available
 * from the start, which is every entry in Stage A; the app's progression service decides.
 */
export const Unlock = z.object({ level: z.number().int().positive() });

/**
 * One stat change, the shape shared by castle perks and later starting perks, mutators and
 * weapons (13 §6.2). `stat` is a path into the content:
 *   building|unit|enemy . (* | id | class:<class or archetype>) . field[.field]
 *   king|weapon|castle|rules . field[.field]
 * e.g. "building.class:wall.hp", "castle.attack.range", "enemy.*.hp", "rules.rallyReach".
 * `nights` limits it to those nights (the run's day number).
 */
export const Modifier = z.object({
  stat: z
    .string()
    .regex(
      /^((building|unit|enemy)\.(\*|class:[a-z]+|[a-z0-9][a-z0-9_-]*)|king|weapon|castle|rules)(\.[a-zA-Z]+)+$/,
      'stat is kind.selector.field (building, unit, enemy) or kind.field (king, weapon, castle, rules)',
    ),
  op: z.enum(['add', 'mul']),
  value: z.number(),
  nights: z.array(z.number().int().positive()).optional(),
});

export const Upgrade = z.object({
  to: Id,
  cost: NonNegative,
  /** Upgrades sharing a group are mutually exclusive branches. */
  exclusiveGroup: z.string().nullable().default(null),
});

export const Building = z.object({
  id: Id,
  name: z.string(),
  /** One short line for the buy button: what the building is for. */
  description: z.string().default(''),
  class: BuildingClass,
  cost: NonNegative,
  /** Castle level needed to build it or upgrade into it: its tier (13 §1.1). */
  castleLevel: z.number().int().positive().default(1),
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
  /** Share of incoming damage the unit does not take (a knight's 0.3 takes 30% less). */
  armor: z.number().min(0).max(0.9).default(0),
  /** The unit engages enemies within this distance of its post (rally gate). */
  guardRadius: Positive,
  /** It gives up a chase beyond this distance from its post and walks back. */
  leash: Positive,
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
  /** Flyers ignore lanes and walls and fly straight to their target. */
  flying: z.boolean().default(false),
  /** Distance at which a ground enemy leaves its lane to go for a target. */
  aggroRange: Positive.default(3),
  /** A ground enemy never goes for a target farther than this from its lane. */
  leash: Positive.default(5),
  attack: Attack,
  targetPriority: z.array(TargetCategory).min(1),
  /** A ground enemy's own ability; only the boss's stomp exists so far. */
  ability: z
    .object({
      id: Id,
      kind: z.literal('stomp'),
      /** Everyone of the player's side (units and king) within this many metres is hit. */
      radius: Positive,
      damage: Positive,
      cooldown: Positive,
    })
    .optional(),
});

/** The king's active ability. Only dashes exist so far. */
export const Ability = z.object({
  id: Id,
  name: z.string(),
  kind: z.literal('dash'),
  /** Metres covered by the dash. */
  distance: Positive,
  /** Seconds the dash lasts. */
  duration: Positive,
  /** Damage dealt once to every enemy the king touches during the dash. */
  damage: NonNegative,
  cooldown: Positive,
});

/**
 * A king weapon. The run's weapon is chosen in RunConfig (later from a starter or bonus pick),
 * so adding a weapon means adding an entry here, never changing king code.
 */
export const Weapon = z.object({
  id: Id,
  name: z.string(),
  attack: Attack,
  ability: Ability.optional(),
  unlock: Unlock.optional(),
});

/** A perk: a named bundle of modifiers. Castle perks are picked when the castle levels up. */
export const Perk = z.object({
  id: Id,
  name: z.string(),
  /** One line saying exactly what changes, shown on the perk card. */
  description: z.string(),
  modifiers: z.array(Modifier).min(1),
  unlock: Unlock.optional(),
});

/**
 * A mutator (13 §3): a run-wide handicap, picked on the setup screen, that strains one part of
 * the game and raises the score of a won run. An easier mutator has a negative bonus.
 */
export const Mutator = z.object({
  id: Id,
  name: z.string(),
  /** One line saying exactly what changes, shown on the mutator card. */
  description: z.string(),
  /** Added to the run's score multiplier, e.g. 0.3 for +30%. Bonuses of several mutators add up. */
  scoreBonus: z.number().min(-0.9).max(5),
  modifiers: z.array(Modifier).default([]),
  /** Building classes that cannot be built during the run (No Walls closes the wall slots). */
  closesClasses: z.array(BuildingClass).default([]),
  unlock: Unlock.optional(),
});

/**
 * A castle level above the first (the map's castle is level 1). Each is bought with gold by
 * day, makes the castle stronger, unlocks buildings of its tier and offers a pick of one perk.
 */
export const CastleLevel = z.object({
  level: z.number().int().min(2),
  cost: Positive,
  hp: Positive,
  attack: Attack.optional(),
  /** Perk ids offered when buying this level; the player picks one. */
  perks: z.array(Id).min(1),
});

/** King settings shared by every weapon. */
export const KingSettings = z.object({
  ...Meta,
  hp: Positive,
  speed: Positive,
  radius: Positive.default(0.5),
  /** HP per second regained after `regenDelay` seconds without taking damage. */
  regen: NonNegative.default(0),
  regenDelay: NonNegative.default(0),
  respawnSeconds: NonNegative,
  /** How close the king must stand to a slot to build there (used by the input layer). */
  buildReach: Positive,
});

export const MapNode = z.object({
  id: Id,
  pos: Vec2,
  /** Present when a building can be placed here (fixed slots, ADR-001 / 03). */
  slot: z
    .object({
      options: z.array(Id).min(1),
      /** For military slots: rally gate node ids the squad can guard, the first is the default. */
      rally: z.array(Id).optional(),
    })
    .optional(),
});

export const Lane = z.object({
  id: Id,
  /**
   * Node ids from spawn to castle, in walking order; the first is the spawn. A wall slot on the
   * path blocks the lane while its wall stands. Air lanes only need the spawn node.
   */
  path: z.array(Id).min(1),
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
  /** Width and height of the playable area in metres; the king stays inside it. */
  size: Vec2,
  nights: z.number().int().positive(),
  startingGold: NonNegative,
  castle: z.object({
    node: Id,
    hp: Positive,
    radius: Positive.default(1),
    /** Gold paid at every dawn while the castle stands. */
    income: NonNegative.default(0),
    attack: Attack.optional(),
  }),
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
export const MutatorCatalog = z.object({ ...Meta, mutators: z.array(Mutator) });
export const CastleCatalog = z.object({
  ...Meta,
  levels: z.array(CastleLevel),
  perks: z.array(Perk),
});

export type TargetLayer = z.infer<typeof TargetLayer>;
export type TargetCategory = z.infer<typeof TargetCategory>;
export type Attack = z.infer<typeof Attack>;
export type BuildingClass = z.infer<typeof BuildingClass>;
export type Building = z.infer<typeof Building>;
export type Unit = z.infer<typeof Unit>;
export type Enemy = z.infer<typeof Enemy>;
export type EnemyArchetype = z.infer<typeof EnemyArchetype>;
export type Weapon = z.infer<typeof Weapon>;
export type Unlock = z.infer<typeof Unlock>;
export type Modifier = z.infer<typeof Modifier>;
export type Perk = z.infer<typeof Perk>;
export type Mutator = z.infer<typeof Mutator>;
export type CastleLevel = z.infer<typeof CastleLevel>;
export type CastleCatalog = z.infer<typeof CastleCatalog>;
export type Ability = z.infer<typeof Ability>;
export type KingSettings = z.infer<typeof KingSettings>;
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
  king: KingSettings;
  castle: { levels: CastleLevel[]; perks: Perk[] };
  mutators: Mutator[];
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
  king: unknown;
  castle: unknown;
  mutators: unknown;
  maps: unknown[];
}
