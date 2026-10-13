/**
 * GameContext: read-only lookups derived from the validated content for one run.
 * It is not part of GameState (it never changes), so snapshots stay small.
 * Comparable to an application-scoped bean built once at startup.
 */
import type { Building, ContentBundle, Enemy, GameMap, Unit, Weapon } from '@kd/content';
import type { Vec } from './vec.ts';

export interface LaneInfo {
  id: string;
  air: boolean;
  points: Vec[];
}

export interface GameContext {
  contentHash: string;
  map: GameMap;
  weapon: Weapon;
  buildings: ReadonlyMap<string, Building>;
  units: ReadonlyMap<string, Unit>;
  enemies: ReadonlyMap<string, Enemy>;
  nodes: ReadonlyMap<string, Vec>;
  lanes: ReadonlyMap<string, LaneInfo>;
  kingSpawn: Vec;
  /** Area the king may walk in: the bounding box of all nodes plus a margin. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface RunConfig {
  mapId: string;
  weaponId: string;
  seed: number;
}

export function createContext(bundle: ContentBundle, config: RunConfig): GameContext {
  const map = bundle.maps.find((m) => m.id === config.mapId);
  if (!map) throw new Error(`Unknown map "${config.mapId}"`);
  const weapon = bundle.weapons.find((w) => w.id === config.weaponId);
  if (!weapon) throw new Error(`Unknown weapon "${config.weaponId}"`);

  const nodes = new Map<string, Vec>(map.nodes.map((n) => [n.id, { x: n.pos[0], y: n.pos[1] }]));
  const at = (id: string): Vec => {
    const p = nodes.get(id);
    if (!p) throw new Error(`Unknown node "${id}"`);
    return p;
  };
  const xs = map.nodes.map((n) => n.pos[0]);
  const ys = map.nodes.map((n) => n.pos[1]);
  const margin = 2;

  return {
    contentHash: bundle.hash,
    map,
    weapon,
    buildings: new Map(bundle.buildings.map((b) => [b.id, b])),
    units: new Map(bundle.units.map((u) => [u.id, u])),
    enemies: new Map(bundle.enemies.map((e) => [e.id, e])),
    nodes,
    lanes: new Map(map.lanes.map((l) => [l.id, { id: l.id, air: l.air, points: l.path.map(at) }])),
    kingSpawn: at(map.kingSpawn),
    bounds: {
      minX: Math.min(...xs) - margin,
      minY: Math.min(...ys) - margin,
      maxX: Math.max(...xs) + margin,
      maxY: Math.max(...ys) + margin,
    },
  };
}

/** Lookup that fails loudly: content was validated, so a miss is a core bug. */
export function req<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing content entry "${String(key)}"`);
  return value;
}
