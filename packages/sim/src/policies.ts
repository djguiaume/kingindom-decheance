/**
 * Bot policies (08 §6.1) decide the day's commands. These are deliberately naive stand-ins
 * to exercise the runner; the real baselines come with the balancing simulator (ADR-001).
 */
import { buyOptions, throughGate, type Command, type GameContext, type GameState } from '@kd/core';

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
    return king.intent.x === 0 && king.intent.y === 0 ? [] : [{ type: 'move', x: 0, y: 0 }];
  }
  // Through a wall's gate if a wing is in the way; rounded so the command log stays readable
  // (the core normalises the vector).
  const aim = throughGate(state, ctx, king.pos, best, ctx.king.radius);
  const aimD = Math.sqrt((aim.x - king.pos.x) ** 2 + (aim.y - king.pos.y) ** 2) || 1;
  const round = (v: number) => Math.round(v * 100) / 100;
  const commands: Command[] = [
    {
      type: 'move',
      x: round((aim.x - king.pos.x) / aimD),
      y: round((aim.y - king.pos.y) / aimD),
    },
  ];
  const ability = ctx.weapon.ability;
  if (ability && king.abilityCooldown === 0 && bestD <= ability.distance)
    commands.push({ type: 'ability' });
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
      const offer = buyOptions(state, ctx, node.id).find((o) => o.cost <= gold);
      if (!offer) continue;
      gold -= offer.cost;
      commands.push({ type: 'buy', slot: node.id, option: offer.option });
    }
    return commands;
  },
};

type BuildingClass = 'tower' | 'wall' | 'military' | 'eco';

/** Buys empty slots of one class in map order while `budget` allows; returns what is left. */
function buyClass(
  state: GameState,
  ctx: GameContext,
  cls: BuildingClass,
  budget: number,
  commands: Command[],
): number {
  for (const node of ctx.map.nodes) {
    if (!node.slot || state.buildings.some((b) => b.slot === node.id)) continue;
    if (commands.some((c) => c.type === 'buy' && c.slot === node.id)) continue;
    const offer = buyOptions(state, ctx, node.id).find(
      (o) => ctx.buildings.get(o.building)?.class === cls && o.cost <= budget,
    );
    if (!offer) continue;
    budget -= offer.cost;
    commands.push({ type: 'buy', slot: node.id, option: offer.option });
  }
  return budget;
}

/** Spends gold on defences first (towers, walls, military), then eco, then upgrades. */
function defend(state: GameState, ctx: GameContext, gold: number, commands: Command[]): void {
  for (const cls of ['tower', 'wall', 'military', 'eco'] as const) {
    gold = buyClass(state, ctx, cls, gold, commands);
  }
  for (const b of state.buildings) {
    const offer = buyOptions(state, ctx, b.slot).find((o) => o.cost <= gold);
    if (!offer) continue;
    gold -= offer.cost;
    commands.push({ type: 'buy', slot: b.slot, option: offer.option });
  }
}

/**
 * Like greedy, but buys towers, then walls, then military, then eco, and upgrades with
 * leftovers. At night the king chases the nearest enemy.
 */
export const defensivePolicy: Policy = {
  id: 'defensive',
  day(state, ctx) {
    const commands: Command[] = [];
    defend(state, ctx, state.gold, commands);
    return commands;
  },
  night: chaseNearestEnemy,
};

/**
 * A rough stand-in for a sensible player: invests up to half its gold in eco buildings on the
 * first three days, then spends like `defensive`. The balance target is that this bot usually
 * wins while the others do not.
 */
export const balancedPolicy: Policy = {
  id: 'balanced',
  day(state, ctx) {
    const commands: Command[] = [];
    let gold = state.gold;
    if (state.day <= 3) {
      const ecoBudget = Math.floor(gold / 2);
      gold -= ecoBudget - buyClass(state, ctx, 'eco', ecoBudget, commands);
    }
    defend(state, ctx, gold, commands);
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
  [balancedPolicy.id]: balancedPolicy,
};
