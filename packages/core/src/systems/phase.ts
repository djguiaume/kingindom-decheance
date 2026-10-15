/**
 * The run's state machine (08 §4):
 *   DAY(d) --startNight--> NIGHT(d) --no enemies left--> DAWN(d) --> DAY(d+1) | WON
 *   NIGHT(d) --castle hp 0--> LOST
 * DAWN is instantaneous: income, then free rebuild of everything destroyed, full HP for the
 * castle, buildings and king, and fallen units return the next night (design 11 §8.1).
 */
import { secondsToTicks } from '../constants.ts';
import { req, rulesOn, syncContext, type GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { BuildingState, GameState, NightStats, SpawnOrder } from '../state.ts';
import type { Vec } from '../vec.ts';

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
    // A squad whose flag the king carries starts the night following him.
    const following = b.carried && state.king.alive;
    b.carried = false;
    const gate = guardSpot(ctx, b);
    for (let i = 0; i < spawns.count; i++) {
      const id = state.nextId++;
      // Spread the squad in a short row across the gate.
      const post = { x: gate.x + (i - (spawns.count - 1) / 2) * def.radius * 2.5, y: gate.y };
      state.units.push({
        id,
        type: def.id,
        home: b.id,
        post,
        pos: { x: b.pos.x, y: b.pos.y },
        hp: def.hp,
        maxHp: def.hp,
        cooldown: 0,
        following,
        target: null,
      });
      events.push({ type: 'unitSpawned', id, unit: def.id });
    }
  }
  events.push({ type: 'nightStarted', night: state.day });
}

/**
 * Where a military building's squad stands guard: its planted flag, else its rally gate, else
 * the front of the building.
 */
export function guardSpot(ctx: GameContext, b: BuildingState): Vec {
  if (b.banner) return b.banner;
  return b.rally ? req(ctx.nodes, b.rally) : { x: b.pos.x, y: b.pos.y - 2 };
}

export function buildSpawnQueue(ctx: GameContext, night: number): SpawnOrder[] {
  const wave = ctx.map.waves.find((w) => w.night === night);
  if (!wave) return [];
  const orders: SpawnOrder[] = [];
  const size = rulesOn(ctx, night).waveSize;
  for (const g of wave.groups) {
    for (let k = 0; k < groupCount(g.count, size); k++) {
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
  // Income from the castle, and from eco buildings that survived the night (00 fact sheet).
  let income = ctx.castle.income;
  for (const b of state.buildings) {
    if (!b.destroyed) income += req(ctx.buildings, b.type).income;
  }
  income = Math.round(income * ctx.rules.incomeRate);
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
  state.projectiles = [];
  state.castle.hp = state.castle.maxHp;
  state.castle.cooldown = 0;
  const king = state.king;
  if (!king.alive) {
    king.alive = true;
    king.pos = { ...ctx.kingSpawn };
  }
  king.hp = king.maxHp;
  king.respawnIn = 0;
  king.cooldown = 0;
  king.dash = null;
  king.abilityCooldown = 0;

  if (state.day >= ctx.map.nights) {
    state.phase = 'won';
    events.push({ type: 'won' });
    return;
  }
  state.day++;
  state.nightTick = 0;
  state.phase = 'day';
  state.current = newNightStats(state.day);
  // A modifier may be limited to some nights, so the new day can change stats.
  syncContext(ctx, state);
  refitHealth(state, ctx);
}

/**
 * Sets the castle's, the king's and every building's max HP from the (re-derived) content and
 * heals them to full. Only called by day, when everything is at full health anyway.
 */
export function refitHealth(state: GameState, ctx: GameContext): void {
  state.castle.maxHp = state.castle.hp = ctx.castle.hp;
  state.king.maxHp = ctx.king.hp;
  if (state.king.alive) state.king.hp = state.king.maxHp;
  for (const b of state.buildings) b.maxHp = b.hp = req(ctx.buildings, b.type).hp;
}

/** Tonight's wave per lane, for the HUD telegraph (design 11 §8.3). */
export function telegraph(
  ctx: GameContext,
  night: number,
): { lane: string; enemy: string; count: number }[] {
  const wave = ctx.map.waves.find((w) => w.night === night);
  const out: { lane: string; enemy: string; count: number }[] = [];
  const size = rulesOn(ctx, night).waveSize;
  for (const g of wave?.groups ?? []) {
    const count = groupCount(g.count, size);
    const same = out.find((o) => o.lane === g.lane && o.enemy === g.enemy);
    if (same) same.count += count;
    else out.push({ lane: g.lane, enemy: g.enemy, count });
  }
  return out;
}

/** A wave group's size after the run's wave size rule: rounded, never below one. */
const groupCount = (count: number, size: number) => Math.max(1, Math.round(count * size));
