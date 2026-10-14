/**
 * What a building does, in a line a player can read on a buy button (playtest 2): its stats
 * when building, or what changes when upgrading ("Damage 8 → 12/s · Range 7 → 8.5").
 * Pure functions of the content, so they are testable without a browser.
 */
import type { Building } from '@kd/content';
import { castleStatsAt, type GameContext, type GameState } from '@kd/core';

/** The numbers worth showing for one building, by label, in display order. */
function stats(def: Building, ctx: GameContext): Map<string, Stat> {
  const out = new Map<string, Stat>();
  if (def.income > 0) out.set('Gold a dawn', { value: `+${def.income}`, unit: '' });
  const atk = def.attack;
  if (atk) {
    out.set('Damage', { value: `${round(atk.damage / atk.interval)}`, unit: '/s' });
    out.set('Range', { value: `${round(atk.range)}`, unit: '' });
    if (atk.maxTargets > 1) out.set('Targets', { value: `${atk.maxTargets}`, unit: '' });
  }
  if (def.class === 'wall') out.set('HP', { value: `${def.hp}`, unit: '' });
  if (def.spawns) {
    const name = ctx.units.get(def.spawns.unit)?.name ?? def.spawns.unit;
    const many = name.endsWith('man') ? `${name.slice(0, -3)}men` : `${name}s`;
    out.set(many, { value: `${def.spawns.count}`, unit: '' });
  }
  return out;
}

interface Stat {
  value: string;
  unit: string;
}

const show = (s: Stat) => `${s.value}${s.unit}`;

/**
 * Extra notes that are not numbers: what it hits and its counters, and for a military building
 * the same about its soldiers ("knights take 30% less damage", "archers hit flyers").
 */
function notes(def: Building, ctx: GameContext): string[] {
  const out: string[] = [];
  const atk = def.attack;
  if (atk) {
    if (!atk.targets.includes('air')) out.push("can't hit flyers");
    for (const [kind, factor] of Object.entries(atk.bonus))
      out.push(`×${factor} vs ${plural(kind)}`);
  }
  const unit = def.spawns && ctx.units.get(def.spawns.unit);
  if (unit) {
    if (unit.armor > 0) out.push(`take ${Math.round(unit.armor * 100)}% less damage`);
    if (unit.attack.range > 2) out.push(`shoot ${round(unit.attack.range)} m`);
    if (unit.attack.targets.includes('air')) out.push('hit flyers');
    for (const [kind, factor] of Object.entries(unit.attack.bonus))
      out.push(`×${factor} vs ${plural(kind)}`);
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;
const plural = (archetype: string) =>
  ({ tank: 'brutes', flyer: 'flyers', swarm: 'raiders', boss: 'bosses' })[archetype] ?? archetype;

export interface OfferInfo {
  /** One sentence from the content: what the building is for. */
  description: string;
  /** Its numbers, or for an upgrade only the ones that change. */
  stats: string;
}

/** Info for buying `to`, either on an empty plot (`from` null) or as an upgrade of `from`. */
export function offerInfo(ctx: GameContext, from: string | null, to: string): OfferInfo {
  const next = ctx.buildings.get(to)!;
  const after = stats(next, ctx);
  const parts: string[] = [];
  if (!from) {
    for (const [label, stat] of after) parts.push(`${label} ${show(stat)}`);
    parts.push(...notes(next, ctx));
  } else {
    const prev = ctx.buildings.get(from)!;
    const before = stats(prev, ctx);
    for (const [label, stat] of after) {
      const was = before.get(label);
      if (!was) parts.push(`${label} ${show(stat)}`);
      else if (was.value !== stat.value) parts.push(`${label} ${was.value} → ${show(stat)}`);
    }
    const old = new Set(notes(prev, ctx));
    parts.push(...notes(next, ctx).filter((n) => !old.has(n)));
  }
  return { description: next.description, stats: parts.join(' · ') };
}

/** The current building's numbers, for the title above the buttons ("Tower · Damage 8/s"). */
export function buildingStats(ctx: GameContext, id: string): string {
  const def = ctx.buildings.get(id)!;
  return [...[...stats(def, ctx)].map(([l, s]) => `${l} ${show(s)}`), ...notes(def, ctx)].join(
    ' · ',
  );
}

/**
 * What the castle's next level changes, for its card (13 §1.4: the castle level is an upgrade
 * like the others): "HP 1500 → 2000 · Damage 5 → 8/s · Range 8 → 9", and the buildings it
 * unlocks. Uses the run's perks, so a perk that boosts the castle shows in both numbers.
 */
export function castleLevelInfo(
  ctx: GameContext,
  state: GameState,
  level: number,
): { stats: string; unlocks: string } {
  const now = ctx.castle;
  const next = castleStatsAt(ctx, state, level);
  const parts: string[] = [];
  const change = (label: string, a: number, b: number, unit = '') => {
    if (a !== b) parts.push(`${label} ${round(a)} → ${round(b)}${unit}`);
  };
  change('HP', now.hp, next.hp);
  if (now.attack && next.attack) {
    change(
      'Damage',
      now.attack.damage / now.attack.interval,
      next.attack.damage / next.attack.interval,
      '/s',
    );
    change('Range', now.attack.range, next.attack.range);
  }
  const names = [...ctx.buildings.values()]
    .filter((b) => b.castleLevel === level)
    .map((b) => b.name);
  return {
    stats: parts.join(' · '),
    unlocks: names.length > 0 ? `Unlocks ${names.join(', ')}.` : '',
  };
}
