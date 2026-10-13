import { req, type GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import { nextRange } from '../rng.ts';
import type { GameState } from '../state.ts';

/** Turns due spawn orders into enemies at their lane's first node (with a little seeded jitter). */
export function spawnSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  while (state.spawnQueue.length > 0 && state.spawnQueue[0]!.at <= state.nightTick) {
    const order = state.spawnQueue.shift()!;
    const def = req(ctx.enemies, order.enemy);
    const start = req(ctx.lanes, order.lane).points[0]!;
    const id = state.nextId++;
    state.enemies.push({
      id,
      type: order.enemy,
      lane: order.lane,
      waypoint: 1,
      pos: {
        x: start.x + nextRange(state.rng, -0.5, 0.5),
        y: start.y + nextRange(state.rng, -0.5, 0.5),
      },
      hp: def.hp,
      maxHp: def.hp,
      cooldown: 0,
      target: null,
    });
    events.push({ type: 'enemySpawned', id, enemy: order.enemy, lane: order.lane });
  }
}
