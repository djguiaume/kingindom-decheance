import { secondsToTicks, perTick } from '../constants.ts';
import type { GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';

/** Respawns a dead king and moves a living one along its intent, inside the map bounds. */
export function kingSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const king = state.king;
  if (!king.alive) {
    king.respawnIn--;
    if (king.respawnIn <= 0) {
      king.alive = true;
      king.respawnIn = 0;
      king.hp = king.maxHp;
      king.pos = { ...ctx.kingSpawn };
      king.cooldown = 0;
      events.push({ type: 'kingRespawned' });
    }
    return;
  }
  const step = perTick(ctx.weapon.speed);
  const { minX, minY, maxX, maxY } = ctx.bounds;
  king.pos.x = Math.min(maxX, Math.max(minX, king.pos.x + king.intent.x * step));
  king.pos.y = Math.min(maxY, Math.max(minY, king.pos.y + king.intent.y * step));
}

export function killKing(state: GameState, ctx: GameContext): void {
  state.king.alive = false;
  state.king.hp = 0;
  state.king.respawnIn = secondsToTicks(ctx.weapon.respawnSeconds, 1);
}
