/**
 * The king: respawn, regeneration, walking and the selected king's active ability (a roll, a
 * lunge or a volley of arrows).
 */
import { perTick, secondsToTicks } from '../constants.ts';
import type { GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';
import { cosDegrees, dist } from '../vec.ts';
import { enemyTargets, gap } from './targets.ts';
import { hit } from './combat.ts';
import { blockByTerrain } from './terrain.ts';
import { blockByWalls } from './walls.ts';

export function kingSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const king = state.king;
  if (king.abilityCooldown > 0) king.abilityCooldown--;

  if (!king.alive) {
    king.respawnIn--;
    if (king.respawnIn <= 0) {
      Object.assign(king, {
        alive: true,
        respawnIn: 0,
        hp: king.maxHp,
        pos: { ...ctx.kingSpawn },
        cooldown: 0,
        calm: 0,
        dash: null,
      });
      events.push({ type: 'kingRespawned' });
    }
    return;
  }

  // Regeneration after a quiet spell.
  king.calm++;
  if (king.calm >= secondsToTicks(ctx.king.regenDelay) && king.hp < king.maxHp) {
    king.hp = Math.min(king.maxHp, king.hp + perTick(ctx.king.regen));
  }

  if (king.dash) {
    dashStep(state, ctx, events);
    return;
  }
  moveBy(
    state,
    ctx,
    king.intent.x * perTick(ctx.king.speed),
    king.intent.y * perTick(ctx.king.speed),
  );
}

function moveBy(state: GameState, ctx: GameContext, dx: number, dy: number): void {
  const { minX, minY, maxX, maxY } = ctx.bounds;
  const pos = state.king.pos;
  pos.x = Math.min(maxX, Math.max(minX, pos.x + dx));
  pos.y = Math.min(maxY, Math.max(minY, pos.y + dy));
  // The king walks through wall gates, never through the wings.
  blockByWalls(state, ctx, pos, ctx.king.radius);
  // Nor over cliffs or water.
  blockByTerrain(ctx.blockers, pos, ctx.king.radius);
}

type Ability = GameContext['king']['ability'];
type DashAbility = Exclude<Ability, { kind: 'volley' }>;
type VolleyAbility = Extract<Ability, { kind: 'volley' }>;

/** Uses the selected king's ability along his facing. Validation is done by the command. */
export function useAbility(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const ability = ctx.king.ability;
  if (ability.kind === 'volley') {
    volley(state, ctx, ability, events);
    state.king.abilityCooldown = secondsToTicks(ability.cooldown, 1);
  } else startDash(state, ability);
}

/**
 * Looses the volley: one arrow at each of the nearest enemies inside the cone ahead, up to
 * `arrows`. Like the king's other shots, the arrows always land (only enemy shots can miss).
 */
function volley(
  state: GameState,
  ctx: GameContext,
  ability: VolleyAbility,
  events: GameEvent[],
): void {
  const king = state.king;
  // Inside the cone: the direction to the target is within cone/2 of the facing (a dot
  // product, as for weapon arcs, so it stays bit-exact).
  const minDot = cosDegrees(ability.cone / 2);
  const inCone = enemyTargets(state, ctx).filter((t) => {
    if (!ability.targets.includes(t.layer)) return false;
    if (gap(king.pos, ctx.king.radius, t) > ability.range) return false;
    const dx = t.pos.x - king.pos.x;
    const dy = t.pos.y - king.pos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    return len === 0 || (dx * king.facing.x + dy * king.facing.y) / len >= minDot;
  });
  // Nearest first; ids break ties so replays stay exact.
  inCone.sort(
    (a, b) =>
      dist(king.pos, a.pos) - dist(king.pos, b.pos) ||
      (a.ref as { id: number }).id - (b.ref as { id: number }).id,
  );
  events.push({
    type: 'volley',
    from: { ...king.pos },
    dir: { ...king.facing },
    cone: ability.cone,
    range: ability.range,
    arrows: ability.arrows,
  });
  for (const t of inCone.slice(0, ability.arrows))
    hit(state, { kind: 'king' }, t, ability.damage, events);
}

/** Starts the king's roll or lunge. */
function startDash(state: GameState, ability: DashAbility): void {
  state.king.dash = {
    dir: { ...state.king.facing },
    ticksLeft: secondsToTicks(ability.duration, 1),
    hit: [],
  };
  state.king.abilityCooldown = secondsToTicks(ability.cooldown, 1);
}

function dashStep(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const ability = ctx.king.ability as DashAbility;
  const dash = state.king.dash!;
  const step = ability.distance / secondsToTicks(ability.duration, 1);
  moveBy(state, ctx, dash.dir.x * step, dash.dir.y * step);
  for (const t of enemyTargets(state, ctx)) {
    const id = (t.ref as { id: number }).id;
    if (dash.hit.includes(id) || gap(state.king.pos, ctx.king.radius, t) > 0) continue;
    dash.hit.push(id);
    hit(state, { kind: 'king' }, t, ability.damage, events);
    // A lunge is a focused bite: it ends on the first target instead of rolling through a crowd.
    if (ability.kind === 'lunge') {
      dash.ticksLeft = 0;
      break;
    }
  }
  dash.ticksLeft--;
  if (dash.ticksLeft <= 0) state.king.dash = null;
}

export function killKing(state: GameState, ctx: GameContext): void {
  Object.assign(state.king, {
    alive: false,
    hp: 0,
    dash: null,
    respawnIn: secondsToTicks(ctx.king.respawnSeconds, 1),
  });
}
