import type { TargetCategory } from '@kd/content';
import { req, type GameContext } from '../context.ts';
import type { GameState } from '../state.ts';
import { enemyTargets, gap, nearest, playerTargets, type Target } from './targets.ts';

/**
 * The order in which an enemy considers target categories. Two rules sit on top of content:
 * ground enemies are always stopped by walls first (walls block), flyers ignore walls entirely,
 * and every enemy will hit the castle once it reaches it.
 */
export function effectivePriority(
  priority: readonly TargetCategory[],
  flying: boolean,
): TargetCategory[] {
  const rest = priority.filter((c) => c !== 'wall');
  const ordered = flying ? rest : ['wall' as const, ...rest];
  if (!ordered.includes('castle')) ordered.push('castle');
  return ordered;
}

/** Chooses what each enemy and unit is going for this tick. */
export function targetingSystem(state: GameState, ctx: GameContext): void {
  const mine = playerTargets(state, ctx);
  for (const enemy of state.enemies) {
    const def = req(ctx.enemies, enemy.type);
    enemy.target = null;
    for (const category of effectivePriority(def.targetPriority, def.flying)) {
      const pick = nearest(
        enemy.pos,
        def.radius,
        def.aggroRange,
        def.attack.targets,
        mine.filter((t) => t.category === category),
      );
      if (pick) {
        enemy.target = pick.ref;
        break;
      }
    }
  }

  const theirs = enemyTargets(state, ctx);
  for (const unit of state.units) {
    const def = req(ctx.units, unit.type);
    // Units guard their post: they only engage enemies close to it, so they do not chase forever.
    const pick = nearestToPost(
      unit.post,
      def.aggroRange,
      def.attack.targets,
      theirs,
      unit.pos,
      def.radius,
    );
    unit.target = pick?.ref ?? null;
  }
}

function nearestToPost(
  post: { x: number; y: number },
  aggro: number,
  layers: readonly ('ground' | 'air')[],
  candidates: readonly Target[],
  pos: { x: number; y: number },
  radius: number,
): Target | null {
  const inZone = candidates.filter((c) => gap(post, 0, c) <= aggro);
  return nearest(pos, radius, Infinity, layers, inZone);
}
