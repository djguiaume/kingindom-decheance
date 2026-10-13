/**
 * Commands: the only way intent enters the core (ADR-002). Keyboard, touch, gamepad and bots
 * all send the same device-neutral commands (design 11 §10.1, ADR-009), and a run is
 * reproducible from its command log.
 * Comparable to a command bus in front of a domain model: validate, then apply, or refuse.
 */
import { req, type GameContext } from './context.ts';
import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';
import { startDash } from './systems/king.ts';
import { startNight } from './systems/phase.ts';

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
  | { type: 'startNight' };

export type CommandResult = { ok: true; events: GameEvent[] } | { ok: false; reason: string };

/** One thing that can be bought at a slot right now. */
export interface BuyOption {
  option: number;
  kind: 'build' | 'upgrade';
  building: string;
  cost: number;
}

/** What `buy` would offer at a slot: its building options if empty, else the upgrades. */
export function buyOptions(state: GameState, ctx: GameContext, slot: string): BuyOption[] {
  const node = ctx.map.nodes.find((n) => n.id === slot);
  if (!node?.slot) return [];
  const built = state.buildings.find((b) => b.slot === slot);
  if (!built) {
    return node.slot.options.map((id, option) => ({
      option,
      kind: 'build' as const,
      building: id,
      cost: req(ctx.buildings, id).cost,
    }));
  }
  return req(ctx.buildings, built.type).upgrades.map((u, option) => ({
    option,
    kind: 'upgrade' as const,
    building: u.to,
    cost: u.cost,
  }));
}

const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Validates and applies one command. A refused command leaves the state untouched. */
export function applyCommand(state: GameState, ctx: GameContext, cmd: Command): CommandResult {
  if (state.phase === 'won' || state.phase === 'lost') return fail('the run is over');
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
      return { ok: true, events };
    }

    case 'startNight': {
      if (state.phase !== 'day') return fail('it is already night');
      startNight(state, ctx, events);
      return { ok: true, events };
    }
  }
}
