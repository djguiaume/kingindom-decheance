/**
 * Target lookup shared by the systems: turns a Ref into a uniform view
 * (position, radius, layer, category), and lists who can be attacked by whom.
 */
import type { EnemyArchetype, TargetCategory, TargetLayer } from '@kd/content';
import { req, type GameContext } from '../context.ts';
import type { BuildingState, EnemyState, GameState, Ref } from '../state.ts';
import type { Vec } from '../vec.ts';
import { dist } from '../vec.ts';

export interface Target {
  ref: Ref;
  pos: Vec;
  radius: number;
  layer: TargetLayer;
  /** How enemies classify this target (player side only). */
  category: TargetCategory | null;
  /** Enemy archetype, for damage bonuses (enemy side only). */
  archetype: EnemyArchetype | null;
  /** The live record whose `hp` is changed by damage. */
  body: { hp: number };
}

export function resolve(state: GameState, ctx: GameContext, ref: Ref): Target | null {
  switch (ref.kind) {
    case 'king':
      return state.king.alive ? kingTarget(state, ctx) : null;
    case 'castle':
      return state.castle.hp > 0 ? castleTarget(state) : null;
    case 'building': {
      const b = state.buildings.find((x) => x.id === ref.id);
      return b && !b.destroyed ? buildingTarget(ctx, b) : null;
    }
    case 'unit': {
      const u = state.units.find((x) => x.id === ref.id);
      if (!u || u.hp <= 0) return null;
      return {
        ref,
        pos: u.pos,
        radius: req(ctx.units, u.type).radius,
        layer: 'ground',
        category: 'unit',
        archetype: null,
        body: u,
      };
    }
    case 'enemy': {
      const e = state.enemies.find((x) => x.id === ref.id);
      if (!e || e.hp <= 0) return null;
      const def = req(ctx.enemies, e.type);
      return {
        ref,
        pos: e.pos,
        radius: def.radius,
        layer: def.flying ? 'air' : 'ground',
        category: null,
        archetype: def.archetype,
        body: e,
      };
    }
  }
}

function kingTarget(state: GameState, ctx: GameContext): Target {
  const k = state.king;
  return {
    ref: { kind: 'king' },
    pos: k.pos,
    radius: ctx.king.radius,
    layer: 'ground',
    category: 'king',
    archetype: null,
    body: k,
  };
}

function castleTarget(state: GameState): Target {
  const c = state.castle;
  return {
    ref: { kind: 'castle' },
    pos: c.pos,
    radius: c.radius,
    layer: 'ground',
    category: 'castle',
    archetype: null,
    body: c,
  };
}

export function buildingCategory(cls: string): TargetCategory {
  return cls === 'eco' ? 'eco' : cls === 'wall' ? 'wall' : cls === 'tower' ? 'tower' : 'building';
}

function buildingTarget(ctx: GameContext, b: BuildingState): Target {
  const def = req(ctx.buildings, b.type);
  return {
    ref: { kind: 'building', id: b.id },
    pos: b.pos,
    radius: def.radius,
    layer: 'ground',
    category: buildingCategory(def.class),
    archetype: null,
    body: b,
  };
}

/** Everything enemies may attack, in a deterministic order. */
export function playerTargets(state: GameState, ctx: GameContext): Target[] {
  const out: Target[] = [];
  if (state.castle.hp > 0) out.push(castleTarget(state));
  if (state.king.alive) out.push(kingTarget(state, ctx));
  for (const b of state.buildings) if (!b.destroyed) out.push(buildingTarget(ctx, b));
  for (const u of state.units) {
    if (u.hp > 0) out.push(resolve(state, ctx, { kind: 'unit', id: u.id })!);
  }
  return out;
}

/** Every living enemy, in id order. */
export function enemyTargets(state: GameState, ctx: GameContext): Target[] {
  const out: Target[] = [];
  for (const e of state.enemies) {
    if (e.hp > 0) out.push(resolve(state, ctx, { kind: 'enemy', id: e.id })!);
  }
  return out;
}

/** Distance between the edges of two round bodies. */
export function gap(a: Vec, aRadius: number, b: Target): number {
  return dist(a, b.pos) - aRadius - b.radius;
}

/**
 * Nearest candidate whose edge is within `range` of (pos, radius) and whose layer is allowed.
 * Ties are broken by list order, which is deterministic.
 */
export function nearest(
  pos: Vec,
  radius: number,
  range: number,
  layers: readonly TargetLayer[],
  candidates: readonly Target[],
): Target | null {
  let best: Target | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    if (c.body.hp <= 0 || !layers.includes(c.layer)) continue;
    const g = gap(pos, radius, c);
    if (g <= range && g < bestGap) {
      best = c;
      bestGap = g;
    }
  }
  return best;
}

/** The standing wall on a lane node, if that node is a wall slot with a wall on it. */
export function wallAt(state: GameState, ctx: GameContext, nodeId: string): BuildingState | null {
  const b = state.buildings.find((x) => x.slot === nodeId);
  if (!b || b.destroyed) return null;
  return req(ctx.buildings, b.type).class === 'wall' ? b : null;
}

/**
 * A standing wall on an enemy's next waypoint acts as a gate line across its lane: the line
 * through the wall, square to the lane. The enemy stays on its own side and only sees targets
 * on that side, so it cannot walk around the wall to reach what is behind it.
 */
export interface WallGate {
  wall: BuildingState;
  /** Centre of the wall, on the lane. */
  at: Vec;
  /** Unit vector along the lane, pointing through the wall towards the castle. */
  dir: Vec;
  /** Half the wall's thickness along the lane. */
  depth: number;
}

export function wallGate(state: GameState, ctx: GameContext, enemy: EnemyState): WallGate | null {
  const lane = req(ctx.lanes, enemy.lane);
  const nodeId = lane.nodes[enemy.waypoint];
  const wall = nodeId ? wallAt(state, ctx, nodeId) : null;
  if (!wall) return null;
  const at = lane.points[enemy.waypoint]!;
  const from = enemy.waypoint > 0 ? lane.points[enemy.waypoint - 1]! : enemy.pos;
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return null;
  return {
    wall,
    at,
    dir: { x: dx / len, y: dy / len },
    depth: req(ctx.buildings, wall.type).radius,
  };
}

/** Signed distance along the lane from the gate line: negative is the enemy's side. */
export function pastGate(gate: WallGate, p: Vec): number {
  return (p.x - gate.at.x) * gate.dir.x + (p.y - gate.at.y) * gate.dir.y;
}

/** Pushes a body back to its side of the gate if it has crossed the wall's face. */
export function holdAtGate(gate: WallGate, pos: Vec, radius: number): void {
  const over = pastGate(gate, pos) + gate.depth + radius;
  if (over <= 0) return;
  pos.x -= gate.dir.x * over;
  pos.y -= gate.dir.y * over;
}
