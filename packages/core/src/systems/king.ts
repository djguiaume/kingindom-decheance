/**
 * The king: respawn, regeneration, walking along the move intent, and the weapon's dash ability.
 * Everything weapon-specific is read from ctx.weapon (content), never hard-coded.
 */
import { perTick, secondsToTicks } from '../constants.ts';
import type { GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';
import { enemyTargets, gap } from './targets.ts';
import { hit } from './combat.ts';
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
}

/** Starts the weapon's dash along the facing direction. Validation is done by the command. */
export function startDash(state: GameState, ctx: GameContext): void {
  const ability = ctx.weapon.ability!;
  state.king.dash = {
    dir: { ...state.king.facing },
    ticksLeft: secondsToTicks(ability.duration, 1),
    hit: [],
  };
  state.king.abilityCooldown = secondsToTicks(ability.cooldown, 1);
}

function dashStep(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const ability = ctx.weapon.ability!;
  const dash = state.king.dash!;
  const step = ability.distance / secondsToTicks(ability.duration, 1);
  moveBy(state, ctx, dash.dir.x * step, dash.dir.y * step);
  for (const t of enemyTargets(state, ctx)) {
    const id = (t.ref as { id: number }).id;
    if (dash.hit.includes(id) || gap(state.king.pos, ctx.king.radius, t) > 0) continue;
    dash.hit.push(id);
    hit(state, { kind: 'king' }, t, ability.damage, events);
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
