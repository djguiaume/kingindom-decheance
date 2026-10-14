/**
 * What a building does, in a line a player can read on a buy button (playtest 2): its stats
 * when building, or what changes when upgrading ("Damage 8 → 12/s · Range 7 → 8.5").
 * Pure functions of the content, so they are testable without a browser.
 */
import type { Building } from '@kd/content';
import type { GameContext } from '@kd/core';

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

/** Extra notes that are not numbers: what it hits, and its counters. */
function notes(def: Building): string[] {
  const atk = def.attack;
  if (!atk) return [];
  const out: string[] = [];
  if (!atk.targets.includes('air')) out.push("can't hit flyers");
  for (const [kind, factor] of Object.entries(atk.bonus)) out.push(`×${factor} vs ${plural(kind)}`);
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
    parts.push(...notes(next));
  } else {
    const prev = ctx.buildings.get(from)!;
    const before = stats(prev, ctx);
    for (const [label, stat] of after) {
      const was = before.get(label);
      if (!was) parts.push(`${label} ${show(stat)}`);
      else if (was.value !== stat.value) parts.push(`${label} ${was.value} → ${show(stat)}`);
    }
    const old = new Set(notes(prev));
    parts.push(...notes(next).filter((n) => !old.has(n)));
  }
  return { description: next.description, stats: parts.join(' · ') };
}

/** The current building's numbers, for the title above the buttons ("Tower · Damage 8/s"). */
export function buildingStats(ctx: GameContext, id: string): string {
  const def = ctx.buildings.get(id)!;
  return [...[...stats(def, ctx)].map(([l, s]) => `${l} ${show(s)}`), ...notes(def)].join(' · ');
}
