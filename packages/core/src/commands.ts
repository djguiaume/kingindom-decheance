/**
 * Commands: the only way intent enters the core (ADR-002). The UI, the keyboard adapter and
 * bots all send the same commands, and a run is reproducible from its command log.
 * Comparable to a command bus in front of a domain model: validate, then apply, or refuse.
 */
import { req, type GameContext } from './context.ts';
import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';
import { startNight } from './systems/phase.ts';

export type Command =
  /** Day: place a building on an empty slot. */
  | { type: 'build'; slot: string; building: string }
  /** Day: replace the building on a slot by one of its upgrades. */
  | { type: 'upgrade'; slot: string; to: string }
  /** Day: end the day and start the night. */
  | { type: 'startNight' }
  /** Any phase: the direction the king should walk (held until the next move command). */
  | { type: 'moveKing'; x: number; y: number };

export type CommandResult = { ok: true; events: GameEvent[] } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Validates and applies one command. A refused command leaves the state untouched. */
export function applyCommand(state: GameState, ctx: GameContext, cmd: Command): CommandResult {
  if (state.phase === 'won' || state.phase === 'lost') return fail('the run is over');
  const events: GameEvent[] = [];

  switch (cmd.type) {
    case 'moveKing': {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return fail('invalid direction');
      const len = Math.sqrt(cmd.x * cmd.x + cmd.y * cmd.y);
      state.king.intent = len > 1 ? { x: cmd.x / len, y: cmd.y / len } : { x: cmd.x, y: cmd.y };
      return { ok: true, events };
    }

    case 'build': {
      if (state.phase !== 'day') return fail('can only build during the day');
      const node = ctx.map.nodes.find((n) => n.id === cmd.slot);
      if (!node?.slot) return fail(`"${cmd.slot}" is not a building slot`);
      if (state.buildings.some((b) => b.slot === cmd.slot)) return fail('slot is already built');
      if (!node.slot.options.includes(cmd.building))
        return fail(`"${cmd.building}" cannot be built on this slot`);
      const def = req(ctx.buildings, cmd.building);
      if (state.gold < def.cost) return fail('not enough gold');
      state.gold -= def.cost;
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
      });
      events.push({ type: 'built', slot: cmd.slot, building: def.id, id });
      return { ok: true, events };
    }

    case 'upgrade': {
      if (state.phase !== 'day') return fail('can only upgrade during the day');
      const b = state.buildings.find((x) => x.slot === cmd.slot);
      if (!b) return fail('nothing is built on this slot');
      const option = req(ctx.buildings, b.type).upgrades.find((u) => u.to === cmd.to);
      if (!option) return fail(`"${b.type}" cannot be upgraded to "${cmd.to}"`);
      if (state.gold < option.cost) return fail('not enough gold');
      const def = req(ctx.buildings, cmd.to);
      state.gold -= option.cost;
      const from = b.type;
      b.type = def.id;
      b.maxHp = def.hp;
      b.hp = def.hp;
      b.cooldown = 0;
      events.push({ type: 'upgraded', slot: cmd.slot, from, to: def.id, id: b.id });
      return { ok: true, events };
    }

    case 'startNight': {
      if (state.phase !== 'day') return fail('it is already night');
      startNight(state, ctx, events);
      return { ok: true, events };
    }
  }
}
