/**
 * Bot policies (08 §6.1) decide the day's commands. These are deliberately naive stand-ins
 * to exercise the runner; the real baselines come with the balancing simulator (ADR-001).
 */
import type { Command, GameContext, GameState } from '@kd/core';

export interface Policy {
  id: string;
  /** Commands to send during one day, before the night starts. */
  day(state: GameState, ctx: GameContext): Command[];
  /**
   * Optional king control at night, asked every `KING_DECISION_TICKS` ticks.
   * Returns the commands to send now (empty to keep the current direction).
   */
  night?(state: GameState, ctx: GameContext): Command[];
}

/** Bots re-decide the king's direction a few times per second, like a human would. */
export const KING_DECISION_TICKS = 6;

/**
 * Walks the king toward the nearest enemy, stands still once in reach, and uses the weapon's
 * ability when an enemy is within its dash distance.
 */
export function chaseNearestEnemy(state: GameState, ctx: GameContext): Command[] {
  const king = state.king;
  if (!king.alive || king.dash) return [];
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.sqrt((e.pos.x - king.pos.x) ** 2 + (e.pos.y - king.pos.y) ** 2);
    if (d < bestD) {
      bestD = d;
      best = e.pos;
    }
  }
  const reach = ctx.weapon.attack.range + ctx.king.radius;
  if (!best || bestD <= reach) {
    return king.intent.x === 0 && king.intent.y === 0 ? [] : [{ type: 'moveKing', x: 0, y: 0 }];
  }
  // Rounded so the command log stays readable; the core normalises the vector.
  const round = (v: number) => Math.round(v * 100) / 100;
  const commands: Command[] = [
    { type: 'moveKing', x: round((best.x - king.pos.x) / bestD), y: round((best.y - king.pos.y) / bestD) },
  ];
  const ability = ctx.weapon.ability;
  if (ability && king.abilityCooldown === 0 && bestD <= ability.distance) commands.push({ type: 'useAbility' });
  return commands;
}

/** Builds nothing. Useful as a lower bound. */
export const idlePolicy: Policy = {
  id: 'idle',
  day: () => [],
};

/** Fills empty slots in map order with the first option it can afford. */
export const greedyPolicy: Policy = {
  id: 'greedy',
  day(state, ctx) {
    const commands: Command[] = [];
    let gold = state.gold;
    for (const node of ctx.map.nodes) {
      if (!node.slot || state.buildings.some((b) => b.slot === node.id)) continue;
      const option = node.slot.options.find(
        (o) => (ctx.buildings.get(o)?.cost ?? Infinity) <= gold,
      );
      if (!option) continue;
      gold -= ctx.buildings.get(option)!.cost;
      commands.push({ type: 'build', slot: node.id, building: option });
    }
    return commands;
  },
};

const CLASS_ORDER = ['tower', 'wall', 'military', 'eco'] as const;

/**
 * Like greedy, but buys towers, then walls, then military, then eco, and upgrades with
 * leftovers. At night the king chases the nearest enemy.
 */
export const defensivePolicy: Policy = {
  id: 'defensive',
  day(state, ctx) {
    const commands: Command[] = [];
    let gold = state.gold;
    for (const cls of CLASS_ORDER) {
      for (const node of ctx.map.nodes) {
        if (!node.slot || state.buildings.some((b) => b.slot === node.id)) continue;
        const option = node.slot.options.find((o) => {
          const def = ctx.buildings.get(o);
          return def?.class === cls && def.cost <= gold;
        });
        if (!option) continue;
        gold -= ctx.buildings.get(option)!.cost;
        commands.push({ type: 'build', slot: node.id, building: option });
      }
    }
    for (const b of state.buildings) {
      const upgrade = ctx.buildings.get(b.type)?.upgrades.find((u) => u.cost <= gold);
      if (!upgrade) continue;
      gold -= upgrade.cost;
      commands.push({ type: 'upgrade', slot: b.slot, to: upgrade.to });
    }
    return commands;
  },
  night: chaseNearestEnemy,
};

/** Builds nothing; the king fights alone. Measures what the king can hold by himself. */
export const kingOnlyPolicy: Policy = {
  id: 'king-only',
  day: () => [],
  night: chaseNearestEnemy,
};

export const policies: Record<string, Policy> = {
  [idlePolicy.id]: idlePolicy,
  [kingOnlyPolicy.id]: kingOnlyPolicy,
  [greedyPolicy.id]: greedyPolicy,
  [defensivePolicy.id]: defensivePolicy,
};
