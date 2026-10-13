/**
 * Who goes for whom this tick (design 11 §8.2).
 * - Ground enemies look for a target within `aggroRange` of themselves, by their priority list
 *   then distance, but only targets within `leash` of their lane. A standing wall on the lane
 *   blocks them and hides everything behind it: if nothing else is in reach, they attack it.
 * - Flyers ignore lanes and walls: the nearest standing target of their first available
 *   priority category, anywhere on the map.
 * - Units engage enemies near their post and drop chases that stray beyond their leash.
 */
import type { TargetCategory } from '@kd/content';
import { req, type GameContext } from '../context.ts';
import type { EnemyState, GameState, UnitState } from '../state.ts';
import { dist, distToPolyline, type Vec } from '../vec.ts';
import {
  enemyTargets,
  gap,
  nearest,
  pastGate,
  playerTargets,
  wallGate,
  type Target,
} from './targets.ts';

/**
 * The order in which an enemy considers target categories: the content's priority list,
 * minus walls for flyers (they fly over them), plus the castle at the end if missing.
 */
export function effectivePriority(
  priority: readonly TargetCategory[],
  flying: boolean,
): TargetCategory[] {
  const ordered = flying ? priority.filter((c) => c !== 'wall') : [...priority];
  if (!ordered.includes('castle')) ordered.push('castle');
  return ordered;
}

export function targetingSystem(state: GameState, ctx: GameContext): void {
  const mine = playerTargets(state, ctx);
  for (const enemy of state.enemies) {
    const def = req(ctx.enemies, enemy.type);
    const priority = effectivePriority(def.targetPriority, def.flying);
    enemy.target = def.flying
      ? flyerTarget(enemy, def.radius, def.attack.targets, priority, mine)
      : groundTarget(state, ctx, enemy, mine);
  }

  const theirs = enemyTargets(state, ctx);
  for (const unit of state.units) {
    const def = req(ctx.units, unit.type);
    // A rallied unit whose king fell stays where it is and guards that spot.
    if (unit.following && !state.king.alive) {
      unit.following = false;
      unit.post = { ...unit.pos };
    }
    const anchor = unitAnchor(state, unit);
    const current = unit.target && theirs.find((t) => sameRef(t, unit.target!));
    // Keep a chase going until the enemy leaves the leash; otherwise pick near the post.
    if (current && gap(anchor, 0, current) <= def.leash) continue;
    const inZone = theirs.filter((c) => gap(anchor, 0, c) <= def.guardRadius);
    unit.target = nearest(unit.pos, def.radius, Infinity, def.attack.targets, inZone)?.ref ?? null;
  }
}

function flyerTarget(
  enemy: EnemyState,
  radius: number,
  layers: readonly ('ground' | 'air')[],
  priority: TargetCategory[],
  mine: Target[],
) {
  for (const category of priority) {
    const pick = nearest(
      enemy.pos,
      radius,
      Infinity,
      layers,
      mine.filter((t) => t.category === category),
    );
    if (pick) return pick.ref;
  }
  return null;
}

function groundTarget(state: GameState, ctx: GameContext, enemy: EnemyState, mine: Target[]) {
  const def = req(ctx.enemies, enemy.type);
  const lane = req(ctx.lanes, enemy.lane);
  // Too far from the lane (a long chase): give up and walk back first.
  if (distToPolyline(enemy.pos, lane.points) > def.leash) return null;

  // Behind a standing wall is out of reach until the wall falls, except for siege engines,
  // which lob over it.
  const gate = wallGate(state, ctx, enemy);
  const overWalls = def.archetype === 'siege';
  const reachable = mine.filter(
    (t) =>
      distToPolyline(t.pos, lane.points) - t.radius <= def.leash &&
      (!gate || overWalls || pastGate(gate, t.pos) < 0),
  );
  for (const category of effectivePriority(def.targetPriority, false)) {
    const pick = nearest(
      enemy.pos,
      def.radius,
      def.aggroRange,
      def.attack.targets,
      reachable.filter((t) => t.category === category),
    );
    if (pick) return pick.ref;
  }

  // Blocked by a wall on the way: attack it even if walls are not on the priority list.
  if (gate && dist(enemy.pos, gate.wall.pos) - gate.depth - def.radius <= def.aggroRange) {
    return { kind: 'building' as const, id: gate.wall.id };
  }
  return null;
}

/** What a unit guards: its post, or the king while it follows him. */
export function unitAnchor(state: GameState, unit: UnitState): Vec {
  return unit.following ? state.king.pos : unit.post;
}

function sameRef(t: Target, ref: NonNullable<EnemyState['target']>): boolean {
  return (
    t.ref.kind === ref.kind && ('id' in t.ref ? t.ref.id === (ref as { id: number }).id : true)
  );
}
