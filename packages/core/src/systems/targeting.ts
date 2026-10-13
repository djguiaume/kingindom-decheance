/**
 * Who goes for whom this tick (design 11 §8.2).
 * - Ground enemies look for a target within `aggroRange` of themselves, by their priority list
 *   then distance, but only targets within `leash` of their lane. A standing wall on the lane
 *   blocks them: if nothing else is in reach, they attack it.
 * - Flyers ignore lanes and walls: the nearest standing target of their first available
 *   priority category, anywhere on the map.
 * - Units engage enemies near their post and drop chases that stray beyond their leash.
 */
import type { TargetCategory } from '@kd/content';
import { req, type GameContext } from '../context.ts';
import type { EnemyState, GameState } from '../state.ts';
import { dist, distToPolyline } from '../vec.ts';
import { enemyTargets, gap, nearest, playerTargets, wallAt, type Target } from './targets.ts';

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
    const current = unit.target && theirs.find((t) => sameRef(t, unit.target!));
    // Keep a chase going until the enemy leaves the leash; otherwise pick near the post.
    if (current && gap(unit.post, 0, current) <= def.leash) continue;
    const inZone = theirs.filter((c) => gap(unit.post, 0, c) <= def.guardRadius);
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

  const reachable = mine.filter((t) => distToPolyline(t.pos, lane.points) - t.radius <= def.leash);
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
  const nodeId = lane.nodes[enemy.waypoint];
  const wall = nodeId ? wallAt(state, ctx, nodeId) : null;
  if (wall) {
    const wallRadius = req(ctx.buildings, wall.type).radius;
    if (dist(enemy.pos, wall.pos) - wallRadius - def.radius <= def.aggroRange) {
      return { kind: 'building' as const, id: wall.id };
    }
  }
  return null;
}

function sameRef(t: Target, ref: NonNullable<EnemyState['target']>): boolean {
  return (
    t.ref.kind === ref.kind && ('id' in t.ref ? t.ref.id === (ref as { id: number }).id : true)
  );
}
