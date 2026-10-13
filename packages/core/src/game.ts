import { STATE_SCHEMA_VERSION } from './constants.ts';
import type { GameContext, RunConfig } from './context.ts';
import type { GameEvent } from './events.ts';
import { canonicalJson, cyrb53 } from './hash.ts';
import { seedRng } from './rng.ts';
import type { GameState } from './state.ts';
import { combatSystem } from './systems/combat.ts';
import { deathSystem } from './systems/death.ts';
import { kingSystem } from './systems/king.ts';
import { movementSystem, separationSystem } from './systems/movement.ts';
import { newNightStats, phaseSystem } from './systems/phase.ts';
import { spawnSystem } from './systems/spawning.ts';
import { targetingSystem } from './systems/targeting.ts';

/** Builds the state for day 1 of a run. */
export function createGame(ctx: GameContext, config: RunConfig): GameState {
  const map = ctx.map;
  const castlePos = ctx.nodes.get(map.castle.node)!;
  const king = ctx.king;
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    contentHash: ctx.contentHash,
    mapId: map.id,
    weaponId: ctx.weapon.id,
    seed: config.seed,
    rng: seedRng(config.seed),
    phase: 'day',
    day: 1,
    tick: 0,
    nightTick: 0,
    gold: map.startingGold,
    nextId: 1,
    castle: {
      pos: { ...castlePos },
      hp: map.castle.hp,
      maxHp: map.castle.hp,
      radius: map.castle.radius,
      cooldown: 0,
    },
    king: {
      pos: { ...ctx.kingSpawn },
      hp: king.hp,
      maxHp: king.hp,
      cooldown: 0,
      alive: true,
      respawnIn: 0,
      intent: { x: 0, y: 0 },
      facing: { x: 0, y: -1 },
      calm: 0,
      abilityCooldown: 0,
      dash: null,
    },
    buildings: [],
    units: [],
    enemies: [],
    spawnQueue: [],
    history: [],
    current: newNightStats(1),
  };
}

/**
 * Advances the run by one fixed tick (1/30 s) and returns what happened.
 * During the day only the king moves (time has no rule effect); during the night every system
 * runs in this documented order:
 *   king → spawning → targeting → movement → separation → combat → death → phase
 */
export function step(state: GameState, ctx: GameContext): GameEvent[] {
  if (state.phase === 'won' || state.phase === 'lost') return [];
  const events: GameEvent[] = [];
  state.tick++;
  kingSystem(state, ctx, events);
  if (state.phase !== 'night') return events;

  state.nightTick++;
  spawnSystem(state, ctx, events);
  targetingSystem(state, ctx);
  movementSystem(state, ctx);
  separationSystem(state, ctx);
  combatSystem(state, ctx, events);
  deathSystem(state, ctx, events);
  phaseSystem(state, ctx, events);
  return events;
}

/** Fingerprint of the full state; equal hashes mean equal runs (determinism tests, replays). */
export function stateHash(state: GameState): string {
  return cyrb53(canonicalJson(state));
}
