/**
 * Two-stage content validation (ADR-006):
 *  1. shape: each file is parsed by its Zod schema (path-precise messages);
 *  2. semantics: cross-references between files are checked (ids exist, graphs are sane).
 * A bundle with any error is refused, so no run can start on broken content.
 */
import type { z } from 'zod';
import {
  BuildingCatalog,
  EnemyCatalog,
  GameMap,
  KingSettings,
  UnitCatalog,
  WeaponCatalog,
  type ContentBundle,
  type RawContent,
} from './schemas.ts';
import { canonicalJson, cyrb53 } from './hash.ts';

export interface ContentError {
  file: string;
  path: string;
  message: string;
}

export type LoadResult =
  { ok: true; bundle: ContentBundle } | { ok: false; errors: ContentError[] };

export function loadContent(raw: RawContent): LoadResult {
  const errors: ContentError[] = [];

  const parse = <T extends z.ZodType>(schema: T, data: unknown, file: string) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ file, path: issue.path.join('.'), message: issue.message });
      }
      return undefined;
    }
    return result.data as z.output<T>;
  };

  const buildings = parse(BuildingCatalog, raw.buildings, 'buildings.json');
  const units = parse(UnitCatalog, raw.units, 'units.json');
  const enemies = parse(EnemyCatalog, raw.enemies, 'enemies.json');
  const weapons = parse(WeaponCatalog, raw.weapons, 'weapons.json');
  const king = parse(KingSettings, raw.king, 'king.json');
  const maps = raw.maps.map((m, i) => {
    const id =
      m !== null && typeof m === 'object' && 'id' in m && typeof m.id === 'string'
        ? m.id
        : String(i);
    return parse(GameMap, m, `maps/${id}.json`);
  });

  if (errors.length > 0 || !buildings || !units || !enemies || !weapons || !king) {
    return { ok: false, errors };
  }

  const bundle = {
    buildings: buildings.buildings,
    units: units.units,
    enemies: enemies.enemies,
    weapons: weapons.weapons,
    king,
    maps: maps.filter((m) => m !== undefined),
  };
  errors.push(...checkSemantics(bundle));
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, bundle: { ...bundle, hash: cyrb53(canonicalJson(bundle)) } };
}

/** Like `loadContent` but throws one readable error listing every problem. */
export function loadContentOrThrow(raw: RawContent): ContentBundle {
  const result = loadContent(raw);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.file} ${e.path || '(root)'}: ${e.message}`);
    throw new Error(`Invalid content:\n${lines.join('\n')}`);
  }
  return result.bundle;
}

export function checkSemantics(bundle: Omit<ContentBundle, 'hash'>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, path: string, message: string) => errors.push({ file, path, message });

  const unique = (file: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) err(file, `${i}.id`, `duplicate id "${id}"`);
      seen.add(id);
    });
    return seen;
  };
  const buildingIds = unique(
    'buildings.json',
    bundle.buildings.map((b) => b.id),
  );
  const unitIds = unique(
    'units.json',
    bundle.units.map((u) => u.id),
  );
  const enemyIds = unique(
    'enemies.json',
    bundle.enemies.map((e) => e.id),
  );
  unique(
    'weapons.json',
    bundle.weapons.map((w) => w.id),
  );
  unique(
    'maps',
    bundle.maps.map((m) => m.id),
  );

  // Buildings: upgrade targets exist, spawned units exist, upgrade graph is acyclic.
  const upgradesOf = new Map<string, string[]>();
  bundle.buildings.forEach((b, i) => {
    upgradesOf.set(
      b.id,
      b.upgrades.map((u) => u.to),
    );
    b.upgrades.forEach((u, j) => {
      if (!buildingIds.has(u.to))
        err('buildings.json', `buildings.${i}.upgrades.${j}.to`, `unknown building "${u.to}"`);
    });
    if (b.spawns && !unitIds.has(b.spawns.unit))
      err('buildings.json', `buildings.${i}.spawns.unit`, `unknown unit "${b.spawns.unit}"`);
    if (b.class === 'military' && !b.spawns)
      err('buildings.json', `buildings.${i}`, 'military buildings must declare "spawns"');
  });
  // An upgrade-only building repeats its upgrade edge's cost: the edge is authoritative.
  bundle.buildings.forEach((b) =>
    b.upgrades.forEach((u, j) => {
      const target = bundle.buildings.find((x) => x.id === u.to);
      if (target && target.cost !== u.cost)
        err('buildings.json', `buildings.${bundle.buildings.indexOf(b)}.upgrades.${j}.cost`,
          `upgrade cost ${u.cost} differs from "${u.to}" cost ${target.cost}`);
    }),
  );
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = (upgradesOf.get(id) ?? []).some(visit);
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const id of upgradesOf.keys()) {
    if (visit(id)) {
      err('buildings.json', '', `upgrade graph has a cycle through "${id}"`);
      break;
    }
  }

  for (const map of bundle.maps) {
    const file = `maps/${map.id}.json`;
    const nodeIds = unique(
      file,
      map.nodes.map((n) => n.id),
    );
    if (!nodeIds.has(map.castle.node))
      err(file, 'castle.node', `unknown node "${map.castle.node}"`);
    if (map.nodes.find((n) => n.id === map.castle.node)?.slot)
      err(file, 'castle.node', 'the castle node cannot also be a building slot');
    if (!nodeIds.has(map.kingSpawn)) err(file, 'kingSpawn', `unknown node "${map.kingSpawn}"`);

    map.nodes.forEach((n, i) => {
      n.slot?.options.forEach((o, j) => {
        if (!buildingIds.has(o))
          err(file, `nodes.${i}.slot.options.${j}`, `unknown building "${o}"`);
      });
      n.slot?.rally?.forEach((r, j) => {
        if (!nodeIds.has(r)) err(file, `nodes.${i}.slot.rally.${j}`, `unknown node "${r}"`);
      });
      const [x, y] = n.pos;
      if (x < 0 || y < 0 || x > map.size[0] || y > map.size[1])
        err(file, `nodes.${i}.pos`, 'node is outside the map');
    });

    const laneIds = unique(
      file,
      map.lanes.map((l) => l.id),
    );
    map.lanes.forEach((lane, i) => {
      lane.path.forEach((p, j) => {
        if (!nodeIds.has(p)) err(file, `lanes.${i}.path.${j}`, `unknown node "${p}"`);
      });
      if (!lane.air && (lane.path.length < 2 || lane.path[lane.path.length - 1] !== map.castle.node))
        err(file, `lanes.${i}.path`, 'a ground lane must end at the castle node');
    });

    const nights = new Set<number>();
    map.waves.forEach((wave, i) => {
      if (wave.night > map.nights)
        err(file, `waves.${i}.night`, `night ${wave.night} is after the last night`);
      if (nights.has(wave.night)) err(file, `waves.${i}.night`, `duplicate night ${wave.night}`);
      nights.add(wave.night);
      wave.groups.forEach((g, j) => {
        if (!laneIds.has(g.lane)) err(file, `waves.${i}.groups.${j}.lane`, `unknown lane`);
        if (!enemyIds.has(g.enemy)) err(file, `waves.${i}.groups.${j}.enemy`, `unknown enemy`);
        const lane = map.lanes.find((l) => l.id === g.lane);
        const enemy = bundle.enemies.find((e) => e.id === g.enemy);
        if (lane && enemy && lane.air !== enemy.flying)
          err(
            file,
            `waves.${i}.groups.${j}`,
            lane.air ? 'ground enemy on an air lane' : 'flying enemy on a ground lane',
          );
      });
    });
    for (let night = 1; night <= map.nights; night++) {
      if (!nights.has(night)) err(file, 'waves', `no wave for night ${night}`);
    }
  }
  return errors;
}
