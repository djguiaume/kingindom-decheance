/**
 * Commands: the only way intent enters the core (ADR-002). Keyboard, touch, gamepad and bots
 * all send the same device-neutral commands (design 11 §10.1, ADR-009), and a run is
 * reproducible from its command log.
 * Comparable to a command bus in front of a domain model: validate, then apply, or refuse.
 */
import type { CastleLevel, Perk } from '@kd/content';
import { BASE_RULES } from './modifiers.ts';
import { req, syncContext, type GameContext } from './context.ts';
import type { GameEvent } from './events.ts';
import type { BuildingState, GameState } from './state.ts';
import { startDash } from './systems/king.ts';
import { refitHealth, startNight } from './systems/phase.ts';
import { dist } from './vec.ts';

/**
 * Footmen within this many metres of the king answer a rally (design 11 §6). Perks can change
 * it for a run: the live value is `ctx.rules.rallyReach`.
 */
export const RALLY_REACH = BASE_RULES.rallyReach;
/** Flags planted together stand this far apart. */
const FLAG_GAP = 1.2;

export type Command =
  /** Day or night: where the king walks; a vector of length 0–1 (analog), held until changed. */
  | { type: 'move'; x: number; y: number }
  /**
   * Night: the weapon's ability (the spear's Charge), along `dir` if given, else along the
   * current movement or facing direction. Named generically: other weapons bring other abilities.
   */
  | { type: 'ability'; dir?: { x: number; y: number } }
  /** Day: buy option `option` at a slot: a building on an empty slot, an upgrade on a built one. */
  | { type: 'buy'; slot: string; option: number }
  /** Day: switch a military building's squad to its next rally gate. */
  | { type: 'cycleRally'; slot: string }
  /** Day: end the day and start the night. */
  | { type: 'startNight' }
  /**
   * Day: buy the castle's next level and pick one of its perks (13 §1). Gold only, no night
   * requirement; the pick is final for the run and is logged, so replays stay exact.
   */
  | { type: 'chooseCastleLevel'; level: number; perk: string }
  /**
   * Rally (design 11 §6, playtest 2).
   * Night: with no unit following, the king's own barracks squad (when he stands at one) and
   * every footman within RALLY_REACH start following him; otherwise the followers stop where
   * the king stands, guard that spot, and their flag moves there for the next nights.
   * Day: at a barracks, the king takes its flag; elsewhere he plants the flags he carries.
   * A squad whose flag he still carries at nightfall starts the night following him.
   */
  | { type: 'rally' };

export type CommandResult = { ok: true; events: GameEvent[] } | { ok: false; reason: string };

/** One thing that can be bought at a slot right now. */
export interface BuyOption {
  option: number;
  kind: 'build' | 'upgrade';
  building: string;
  cost: number;
  /** The castle level this needs, while the castle is below it; null when it can be bought. */
  needsCastle: number | null;
}

/** The castle's next level and its perk choices, or null at the top level. */
export interface CastleOffer {
  level: number;
  cost: number;
  perks: Perk[];
  def: CastleLevel;
}

export function castleOffer(state: GameState, ctx: GameContext): CastleOffer | null {
  const def = ctx.castleLevels[state.castleLevel - 1];
  if (!def) return null;
  return {
    level: def.level,
    cost: def.cost,
    perks: def.perks.map((id) => req(ctx.perks, id)),
    def,
  };
}

/** True when the living king stands at the castle (the reach used for buying at a slot). */
export function atCastle(state: GameState, ctx: GameContext): boolean {
  const king = state.king;
  return (
    king.alive &&
    dist(king.pos, state.castle.pos) <= ctx.king.buildReach + ctx.king.radius + ctx.castle.radius
  );
}

/** What `buy` would offer at a slot: its building options if empty, else the upgrades. */
export function buyOptions(state: GameState, ctx: GameContext, slot: string): BuyOption[] {
  const node = ctx.map.nodes.find((n) => n.id === slot);
  if (!node?.slot) return [];
  // A building of a higher tier than the castle shows, but cannot be bought yet (13 §1.1).
  const needs = (id: string) => {
    const tier = req(ctx.buildings, id).castleLevel;
    return tier > state.castleLevel ? tier : null;
  };
  const built = state.buildings.find((b) => b.slot === slot);
  if (!built) {
    return node.slot.options.flatMap((id, option) =>
      closed(ctx, id)
        ? []
        : [
            {
              option,
              kind: 'build' as const,
              building: id,
              cost: req(ctx.buildings, id).cost,
              needsCastle: needs(id),
            },
          ],
    );
  }
  return req(ctx.buildings, built.type).upgrades.map((u, option) => ({
    option,
    kind: 'upgrade' as const,
    building: u.to,
    cost: u.cost,
    needsCastle: needs(u.to),
  }));
}

/** True when a mutator forbids this building (No Walls). */
const closed = (ctx: GameContext, building: string) =>
  ctx.closedClasses.has(req(ctx.buildings, building).class);

/** True when nothing can ever be built on this slot this run: the view hides it. */
export function slotClosed(ctx: GameContext, slot: string): boolean {
  const options = ctx.map.nodes.find((n) => n.id === slot)?.slot?.options ?? [];
  return options.length > 0 && options.every((id) => closed(ctx, id));
}

const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Validates and applies one command. A refused command leaves the state untouched. */
export function applyCommand(state: GameState, ctx: GameContext, cmd: Command): CommandResult {
  if (state.phase === 'won' || state.phase === 'lost') return fail('the run is over');
  syncContext(ctx, state);
  const events: GameEvent[] = [];
  const king = state.king;

  switch (cmd.type) {
    case 'move': {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return fail('invalid direction');
      const len = Math.sqrt(cmd.x * cmd.x + cmd.y * cmd.y);
      king.intent = len > 1 ? { x: cmd.x / len, y: cmd.y / len } : { x: cmd.x, y: cmd.y };
      if (len > 0) king.facing = { x: cmd.x / len, y: cmd.y / len };
      return { ok: true, events };
    }

    case 'ability': {
      if (state.phase !== 'night') return fail('abilities are for the night');
      if (!ctx.weapon.ability) return fail('this weapon has no ability');
      if (!king.alive) return fail('the king is down');
      if (king.dash || king.abilityCooldown > 0) return fail('ability is not ready');
      if (cmd.dir) {
        const { x, y } = cmd.dir;
        const len = Math.sqrt(x * x + y * y);
        if (!Number.isFinite(len)) return fail('invalid direction');
        if (len > 0) king.facing = { x: x / len, y: y / len };
      }
      startDash(state, ctx);
      return { ok: true, events };
    }

    case 'buy': {
      if (state.phase !== 'day') return fail('can only buy during the day');
      const node = ctx.map.nodes.find((n) => n.id === cmd.slot);
      if (!node?.slot) return fail(`"${cmd.slot}" is not a building slot`);
      const offer = buyOptions(state, ctx, cmd.slot).find((o) => o.option === cmd.option);
      if (!offer) return fail('nothing to buy with that option here');
      if (offer.needsCastle) return fail(`needs castle level ${offer.needsCastle}`);
      if (state.gold < offer.cost) return fail('not enough gold');
      const def = req(ctx.buildings, offer.building);
      state.gold -= offer.cost;
      if (offer.kind === 'build') {
        const id = state.nextId++;
        state.buildings.push({
          id,
          slot: cmd.slot,
          type: def.id,
          pos: { ...req(ctx.nodes, cmd.slot) },
          hp: def.hp,
          maxHp: def.hp,
          cooldown: 0,
          destroyed: false,
          rally: node.slot.rally?.[0] ?? null,
          banner: null,
          carried: false,
        });
        events.push({ type: 'built', slot: cmd.slot, building: def.id, id });
      } else {
        const b = state.buildings.find((x) => x.slot === cmd.slot)!;
        const from = b.type;
        Object.assign(b, { type: def.id, maxHp: def.hp, hp: def.hp, cooldown: 0 });
        events.push({ type: 'upgraded', slot: cmd.slot, from, to: def.id, id: b.id });
      }
      return { ok: true, events };
    }

    case 'cycleRally': {
      if (state.phase !== 'day') return fail('can only change rally gates during the day');
      const b = state.buildings.find((x) => x.slot === cmd.slot);
      const gates = ctx.map.nodes.find((n) => n.id === cmd.slot)?.slot?.rally ?? [];
      if (!b || !req(ctx.buildings, b.type).spawns || gates.length === 0)
        return fail('no military building with rally gates on this slot');
      b.rally = gates[(gates.indexOf(b.rally ?? '') + 1) % gates.length]!;
      // Choosing a gate takes the squad's flag back from wherever it was planted.
      b.banner = null;
      b.carried = false;
      return { ok: true, events };
    }

    case 'rally': {
      if (!king.alive) return fail('the king is down');
      return state.phase === 'day' ? dayRally(state, ctx) : nightRally(state, ctx);
    }

    case 'chooseCastleLevel': {
      if (state.phase !== 'day') return fail('the castle grows by day');
      const offer = castleOffer(state, ctx);
      if (!offer) return fail('the castle is at its highest level');
      if (cmd.level !== offer.level) return fail(`the next castle level is ${offer.level}`);
      if (!offer.def.perks.includes(cmd.perk)) return fail('that perk is not offered here');
      if (state.gold < offer.cost) return fail('not enough gold');
      state.gold -= offer.cost;
      state.castleLevel = offer.level;
      state.perks.push(cmd.perk);
      syncContext(ctx, state);
      refitHealth(state, ctx);
      events.push({ type: 'castleUpgraded', level: offer.level, perk: cmd.perk });
      return { ok: true, events };
    }

    case 'startNight': {
      if (state.phase !== 'day') return fail('it is already night');
      startNight(state, ctx, events);
      return { ok: true, events };
    }
  }
}

/**
 * The standing military building the king is at, if any: the same reach as for buying at its
 * slot, so the HUD and the rules agree on "at a barracks".
 */
export function militaryAt(state: GameState, ctx: GameContext): BuildingState | null {
  const king = state.king;
  if (!king.alive) return null;
  let best: BuildingState | null = null;
  let bestD = ctx.king.buildReach + ctx.king.radius;
  for (const b of state.buildings) {
    if (b.destroyed || !req(ctx.buildings, b.type).spawns) continue;
    const d = dist(king.pos, b.pos);
    if (d <= bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function dayRally(state: GameState, ctx: GameContext): CommandResult {
  const events: GameEvent[] = [];
  const king = state.king;
  const at = militaryAt(state, ctx);
  if (at && !at.carried) {
    at.carried = true;
    events.push({ type: 'flagTaken', building: at.id });
    return { ok: true, events };
  }
  const carried = state.buildings.filter((b) => b.carried);
  if (carried.length === 0) return fail('stand at a barracks to take its flag');
  // Several flags planted together stand one behind the other, so the squads do not overlap.
  carried.forEach((b, i) => {
    b.carried = false;
    b.banner = { x: king.pos.x, y: king.pos.y + i * FLAG_GAP };
  });
  events.push({ type: 'flagPlanted', buildings: carried.length });
  return { ok: true, events };
}

function nightRally(state: GameState, ctx: GameContext): CommandResult {
  const events: GameEvent[] = [];
  const king = state.king;
  const followers = state.units.filter((u) => u.following);
  if (followers.length > 0) {
    followers.forEach((u, i) => {
      u.following = false;
      // Spread the squad in a short row where the king stands.
      const r = req(ctx.units, u.type).radius;
      u.post = { x: king.pos.x + (i - (followers.length - 1) / 2) * r * 2.5, y: king.pos.y };
    });
    // Their flags move here too, so they guard this spot again on the next nights.
    const homes = [...new Set(followers.map((u) => u.home))];
    homes.forEach((id, i) => {
      const b = state.buildings.find((x) => x.id === id);
      if (b) b.banner = { x: king.pos.x, y: king.pos.y + i * FLAG_GAP };
    });
    events.push({ type: 'unitsDropped', units: followers.length });
    return { ok: true, events };
  }
  const at = militaryAt(state, ctx);
  const grabbed = state.units.filter(
    (u) => (at && u.home === at.id) || dist(u.pos, king.pos) <= ctx.rules.rallyReach,
  );
  if (grabbed.length === 0) return fail('no footmen near the king');
  for (const u of grabbed) u.following = true;
  events.push({ type: 'rallied', units: grabbed.length });
  return { ok: true, events };
}
