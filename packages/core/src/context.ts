/**
 * GameContext: read-only lookups derived from the validated content for one run.
 * It is not part of GameState, so snapshots stay small. Comparable to an application-scoped
 * bean built once at startup.
 *
 * The tunable part (buildings, units, enemies, weapon, king, castle, rules) is the content
 * after the run's mutators, then the castle level and the perks picked so far (13 §6.2). It is
 * a pure function of (content, run config, castle level, perks, night), all of which are in the state, and is
 * rebuilt by `syncContext` whenever one of them changes. So the rules read plain stats and
 * never check a perk id, and any state, restored or replayed, gets the same context.
 */
import type {
  Building,
  BuildingClass,
  CastleLevel,
  ContentBundle,
  Enemy,
  GameMap,
  KingSettings,
  Mutator,
  Perk,
  Unit,
  Weapon,
} from '@kd/content';
import { clone } from './hash.ts';
import {
  applyModifier,
  BASE_RULES,
  checkModifiers,
  type CastleStats,
  type Rules,
  type Tunables,
} from './modifiers.ts';
import type { GameState } from './state.ts';
import {
  terrainBlockers,
  walkable,
  wayGraph,
  type Capsule,
  type WayGraph,
} from './systems/terrain.ts';
import type { Vec } from './vec.ts';

export interface LaneInfo {
  id: string;
  air: boolean;
  /** Path node ids; the first is the spawn. */
  nodes: string[];
  points: Vec[];
}

export interface GameContext {
  contentHash: string;
  map: GameMap;
  /** The run's weapon, picked in RunConfig: the king never hard-codes one. */
  weapon: Weapon;
  king: KingSettings;
  /** Stable id selected in RunConfig and recorded in the run state/replay. */
  kingId: string;
  buildings: ReadonlyMap<string, Building>;
  units: ReadonlyMap<string, Unit>;
  enemies: ReadonlyMap<string, Enemy>;
  /** The castle at its current level, after perks. */
  castle: CastleStats;
  rules: Rules;
  /** Castle levels above the first, in order (level 2 first). */
  castleLevels: readonly CastleLevel[];
  perks: ReadonlyMap<string, Perk>;
  /** The run's mutators, from RunConfig, in the order picked. */
  mutators: readonly Mutator[];
  /** Building classes no slot may hold this run (No Walls). */
  closedClasses: ReadonlySet<BuildingClass>;
  /** The content the tunable fields are rebuilt from, and what they were last built for. */
  base: {
    bundle: ContentBundle;
    weapon: Weapon;
    king: KingSettings;
    derivedFor: string;
    level: number;
    perks: readonly string[];
    /** Rules per night for the current level and perks (wave previews of later nights). */
    rulesByNight: Map<number, Rules>;
  };
  nodes: ReadonlyMap<string, Vec>;
  lanes: ReadonlyMap<string, LaneInfo>;
  kingSpawn: Vec;
  /** The map area; the king stays inside it. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Cliffs and water as capsules nobody on the ground walks through (systems/terrain.ts). */
  blockers: readonly Capsule[];
  /** Every map node and the walks between them: how ground bodies find their way round terrain. */
  ways: WayGraph;
}

export interface RunConfig {
  mapId: string;
  weaponId: string;
  /** Defaults to the catalog's default king for old replays and direct callers. */
  kingId?: string;
  seed: number;
  /** Mutator ids (13 §3); none when absent. The app checks unlocks before a run starts. */
  mutatorIds?: string[];
}

export function createContext(bundle: ContentBundle, config: RunConfig): GameContext {
  const map = bundle.maps.find((m) => m.id === config.mapId);
  if (!map) throw new Error(`Unknown map "${config.mapId}"`);
  const weapon = bundle.weapons.find((w) => w.id === config.weaponId);
  if (!weapon) throw new Error(`Unknown weapon "${config.weaponId}"`);
  const kingId = config.kingId ?? bundle.defaultKing;
  const king = bundle.kings.find((k) => k.id === kingId);
  if (!king) throw new Error(`Unknown king "${kingId}"`);
  const mutators = (config.mutatorIds ?? []).map((id) => {
    const m = bundle.mutators.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown mutator "${id}"`);
    return m;
  });
  if (new Set(config.mutatorIds).size !== mutators.length)
    throw new Error('A mutator is picked twice');

  const nodes = new Map<string, Vec>(map.nodes.map((n) => [n.id, { x: n.pos[0], y: n.pos[1] }]));
  const at = (id: string): Vec => {
    const p = nodes.get(id);
    if (!p) throw new Error(`Unknown node "${id}"`);
    return p;
  };

  const blockers = terrainBlockers(map);
  const ctx: GameContext = {
    contentHash: bundle.hash,
    map,
    weapon,
    king,
    kingId,
    buildings: new Map(),
    units: new Map(),
    enemies: new Map(),
    castle: { hp: 0, radius: 0, income: 0 },
    rules: { ...BASE_RULES },
    castleLevels: bundle.castle.levels,
    perks: new Map(bundle.castle.perks.map((p) => [p.id, p])),
    mutators,
    closedClasses: new Set(mutators.flatMap((m) => m.closesClasses)),
    base: { bundle, weapon, king, derivedFor: '', level: 1, perks: [], rulesByNight: new Map() },
    nodes,
    lanes: new Map(
      map.lanes.map((l) => [l.id, { id: l.id, air: l.air, nodes: l.path, points: l.path.map(at) }]),
    ),
    kingSpawn: at(map.kingSpawn),
    bounds: { minX: 0, minY: 0, maxX: map.size[0], maxY: map.size[1] },
    blockers,
    ways: wayGraph(blockers, [...nodes.values()]),
  };
  const blocked = checkTerrain(ctx);
  if (blocked.length > 0) throw new Error(`Terrain in the way: ${blocked.join(', ')}`);
  const wrong = checkModifiers(tunablesFor(ctx, 1, [], 1), [
    ...bundle.castle.perks,
    ...bundle.mutators,
  ]);
  if (wrong.length > 0)
    throw new Error(`Perk or mutator stats that reach nothing: ${wrong.join(', ')}`);
  derive(ctx, 1, [], 1);
  return ctx;
}

const keyOf = (level: number, perks: readonly string[], night: number) =>
  `${level}|${perks.join(',')}|${night}`;

/**
 * Brings the tunable fields up to date with the state's castle level, perks and night.
 * Cheap when nothing changed (one string compare); the core calls it before every tick and
 * command.
 */
export function syncContext(ctx: GameContext, state: GameState): void {
  if (keyOf(state.castleLevel, state.perks, state.day) !== ctx.base.derivedFor)
    derive(ctx, state.castleLevel, state.perks, state.day);
}

/**
 * The content after the mutators, `level` and `perks`, on `night`: a fresh copy, the base is
 * untouched. Mutators come first, so a castle perk that multiplies (Gambler's Oath) applies to
 * the mutators' summed score bonus.
 */
function tunablesFor(
  ctx: GameContext,
  level: number,
  perks: readonly string[],
  night: number,
): Tunables {
  const { bundle, weapon, king } = ctx.base;
  const mapCastle = ctx.map.castle;
  const atLevel = level > 1 ? ctx.castleLevels[level - 2] : undefined;
  const attack = atLevel?.attack ?? mapCastle.attack;
  const t: Tunables = clone({
    buildings: bundle.buildings,
    units: bundle.units,
    enemies: bundle.enemies,
    weapon,
    king,
    castle: {
      hp: atLevel?.hp ?? mapCastle.hp,
      radius: mapCastle.radius,
      income: mapCastle.income,
      ...(attack ? { attack } : {}),
    },
    rules: { ...BASE_RULES },
  });
  for (const m of ctx.mutators) {
    t.rules.scoreMultiplier += m.scoreBonus;
    for (const mod of m.modifiers) applyModifier(t, mod, night);
  }
  for (const id of perks) {
    for (const m of req(ctx.perks, id).modifiers) applyModifier(t, m, night);
  }
  return t;
}

/** The castle's stats at another level with the run's perks: what buying a level would give. */
export function castleStatsAt(ctx: GameContext, state: GameState, level: number): CastleStats {
  return tunablesFor(ctx, level, state.perks, state.day).castle;
}

function derive(ctx: GameContext, level: number, perks: readonly string[], night: number): void {
  const t = tunablesFor(ctx, level, perks, night);
  Object.assign(ctx, {
    weapon: t.weapon,
    king: t.king,
    buildings: new Map(t.buildings.map((b) => [b.id, b])),
    units: new Map(t.units.map((u) => [u.id, u])),
    enemies: new Map(t.enemies.map((e) => [e.id, e])),
    castle: t.castle,
    rules: t.rules,
  });
  if (ctx.base.level !== level || ctx.base.perks.join(',') !== perks.join(','))
    ctx.base.rulesByNight.clear();
  Object.assign(ctx.base, { derivedFor: keyOf(level, perks, night), level, perks: [...perks] });
  ctx.base.rulesByNight.set(night, t.rules);
}

/**
 * The rules on another night with the current castle level and perks: a modifier may be
 * limited to some nights (Swarm), and the waves panel previews every night.
 */
export function rulesOn(ctx: GameContext, night: number): Rules {
  let rules = ctx.base.rulesByNight.get(night);
  if (!rules) {
    rules = tunablesFor(ctx, ctx.base.level, ctx.base.perks, night).rules;
    ctx.base.rulesByNight.set(night, rules);
  }
  return rules;
}

/** Lookup that fails loudly: content was validated, so a miss is a core bug. */
export function req<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing content entry "${String(key)}"`);
  return value;
}

/**
 * Terrain must leave the map playable: every node clear of cliffs and water, and every ground
 * lane walkable from node to node by the biggest enemy. Returns what is in the way.
 */
export function checkTerrain(ctx: GameContext): string[] {
  const out: string[] = [];
  const biggest = Math.max(
    0,
    ...ctx.base.bundle.enemies.filter((e) => !e.flying).map((e) => e.radius),
  );
  for (const [id, p] of ctx.nodes) {
    if (!walkable(ctx.blockers, p, p, 0.3)) out.push(`node ${id}`);
  }
  for (const lane of ctx.lanes.values()) {
    if (lane.air) continue;
    for (let i = 1; i < lane.points.length; i++) {
      if (!walkable(ctx.blockers, lane.points[i - 1]!, lane.points[i]!, biggest))
        out.push(`lane ${lane.id} ${lane.nodes[i - 1]}→${lane.nodes[i]}`);
    }
  }
  return out;
}
