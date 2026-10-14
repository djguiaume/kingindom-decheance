/**
 * Bot policies (08 §6.1) decide the day's commands. These are deliberately naive stand-ins
 * to exercise the runner; the real baselines come with the balancing simulator (ADR-001).
 */
import {
  buyOptions,
  castleOffer,
  throughGate,
  type BuyOption,
  type Command,
  type GameContext,
  type GameState,
} from '@kd/core';

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

/** What can be bought at a slot now: options the castle level does not lock. */
function offers(state: GameState, ctx: GameContext, slot: string): BuyOption[] {
  return buyOptions(state, ctx, slot).filter((o) => o.needsCastle === null);
}

/**
 * Buys the castle's next level if `gold` allows and the day has come, picking the perk at
 * `picks[level - 2]` (default the first). Returns the gold left.
 */
function buyCastle(
  state: GameState,
  ctx: GameContext,
  gold: number,
  fromDay: Record<number, number>,
  picks: readonly number[],
  commands: Command[],
): number {
  const offer = castleOffer(state, ctx);
  if (!offer || offer.cost > gold || state.day < (fromDay[offer.level] ?? Infinity)) return gold;
  const perk = offer.perks[picks[offer.level - 2] ?? 0] ?? offer.perks[0]!;
  commands.push({ type: 'chooseCastleLevel', level: offer.level, perk: perk.id });
  return gold - offer.cost;
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
      const offer = offers(state, ctx, node.id).find((o) => o.cost <= gold);
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
    const offer = offers(state, ctx, node.id).find(
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
    const offer = offers(state, ctx, b.slot).find((o) => o.cost <= gold);
    if (!offer) continue;
    gold -= offer.cost;
    commands.push({ type: 'buy', slot: b.slot, option: offer.option });
  }
}

/**
 * Castle perk picks by level, as indexes into each level's three perks: `[0, 2]` takes the
 * first perk at level 2 and the third at level 3. Bots take the first ones by default; the
 * CLI's `--perks` measures the others (13 §6.3).
 */
export type PerkPicks = readonly number[];

/** The day from which a bot buys each castle level (when it has the gold). */
const CASTLE_DAYS: Record<number, number> = { 2: 2, 3: 4 };

/**
 * Like greedy, but buys towers, then walls, then military, then eco, and upgrades with
 * leftovers. It buys castle levels from day 2 and day 4. At night the king chases the nearest
 * enemy.
 */
export function makeDefensive(picks: PerkPicks = []): Policy {
  return {
    id: 'defensive',
    day(state, ctx) {
      const commands: Command[] = [];
      const gold = buyCastle(state, ctx, state.gold, CASTLE_DAYS, picks, commands);
      defend(state, ctx, gold, commands);
      return commands;
    },
    night: chaseNearestEnemy,
  };
}

/**
 * A rough stand-in for a sensible player: invests up to half its gold in eco buildings on the
 * first three days, buys castle levels from day 2 and day 4, then spends like `defensive`.
 * The balance target is that this bot usually wins while the others do not.
 */
export function makeBalanced(picks: PerkPicks = []): Policy {
  return {
    id: 'balanced',
    day(state, ctx) {
      const commands: Command[] = [];
      let gold = state.gold;
      if (state.day <= 3) {
        const ecoBudget = Math.floor(gold / 2);
        gold -= ecoBudget - buyClass(state, ctx, 'eco', ecoBudget, commands);
      }
      gold = buyCastle(state, ctx, gold, CASTLE_DAYS, picks, commands);
      defend(state, ctx, gold, commands);
      return commands;
    },
    night: chaseNearestEnemy,
  };
}

export const defensivePolicy = makeDefensive();
export const balancedPolicy = makeBalanced();

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
