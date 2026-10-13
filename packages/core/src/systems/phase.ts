/**
 * The run's state machine (08 §4):
 *   DAY(d) --startNight--> NIGHT(d) --no enemies left--> DAWN(d) --> DAY(d+1) | WON
 *   NIGHT(d) --castle hp 0--> LOST
 * DAWN is instantaneous: income, then everything is restored ([U] assumption in 08).
 */
import { secondsToTicks } from '../constants.ts';
import { req, type GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, NightStats, SpawnOrder } from '../state.ts';

export function newNightStats(night: number): NightStats {
  return { night, income: 0, buildingsLost: 0, enemiesKilled: 0, ticks: 0 };
}

export function startNight(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  state.phase = 'night';
  state.nightTick = 0;
  state.spawnQueue = buildSpawnQueue(ctx, state.day);

  // Military buildings field their full squad at the start of each night.
  state.units = [];
  for (const b of state.buildings) {
    const spawns = req(ctx.buildings, b.type).spawns;
    if (!spawns) continue;
    const def = req(ctx.units, spawns.unit);
    for (let i = 0; i < spawns.count; i++) {
      const id = state.nextId++;
      // Spread the squad in a short row in front of the building.
      const post = { x: b.pos.x + (i - (spawns.count - 1) / 2) * def.radius * 2.5, y: b.pos.y + 1 };
      state.units.push({
        id,
        type: def.id,
        home: b.id,
        post,
        pos: { ...post },
        hp: def.hp,
        maxHp: def.hp,
        cooldown: 0,
        target: null,
      });
      events.push({ type: 'unitSpawned', id, unit: def.id });
    }
  }
  events.push({ type: 'nightStarted', night: state.day });
}

export function buildSpawnQueue(ctx: GameContext, night: number): SpawnOrder[] {
  const wave = ctx.map.waves.find((w) => w.night === night);
  if (!wave) return [];
  const orders: SpawnOrder[] = [];
  for (const g of wave.groups) {
    for (let k = 0; k < g.count; k++) {
      orders.push({ at: secondsToTicks(g.delay + k * g.interval), lane: g.lane, enemy: g.enemy });
    }
  }
  // Array.prototype.sort is stable, so equal times keep the content order.
  return orders.sort((a, b) => a.at - b.at);
}

/** Ends the night when the castle falls or the wave is cleared. */
export function phaseSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  if (state.castle.hp <= 0) {
    state.phase = 'lost';
    state.current.ticks = state.nightTick;
    state.history.push(state.current);
    events.push({ type: 'lost' });
    return;
  }
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) dawn(state, ctx, events);
}

function dawn(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  // Income only from eco buildings that survived the night (00 fact sheet).
  let income = 0;
  for (const b of state.buildings) {
    if (!b.destroyed) income += req(ctx.buildings, b.type).income;
  }
  state.gold += income;
  state.current.income = income;
  state.current.ticks = state.nightTick;
  state.history.push(state.current);
  events.push({ type: 'dawn', night: state.day, income });

  for (const b of state.buildings) {
    b.destroyed = false;
    b.hp = b.maxHp;
    b.cooldown = 0;
  }
  state.units = [];
  state.castle.hp = state.castle.maxHp;
  const king = state.king;
  if (!king.alive) {
    king.alive = true;
    king.pos = { ...ctx.kingSpawn };
  }
  king.hp = king.maxHp;
  king.respawnIn = 0;
  king.cooldown = 0;

  if (state.day >= ctx.map.nights) {
    state.phase = 'won';
    events.push({ type: 'won' });
    return;
  }
  state.day++;
  state.nightTick = 0;
  state.phase = 'day';
  state.current = newNightStats(state.day);
}
