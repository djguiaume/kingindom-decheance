/**
 * Modifiers (13 §6.2): perks, mutators, and later weapons, change content numbers through
 * one shape, `{ stat, op, value, nights? }`. This file resolves a stat path to the numbers it
 * names and applies a modifier to them. The content schema checks a path's shape; whether it
 * reaches a number is checked here, when a run's context is built (`checkModifiers`). Nothing
 * here knows a perk by its id.
 */
import type {
  Attack,
  Building,
  Enemy,
  KingSettings,
  Modifier,
  Perk,
  Unit,
  Weapon,
} from '@kd/content';

/**
 * Rules that are not a stat of any one entity, with their base values. Perks change them
 * through `rules.<field>` paths.
 */
export interface Rules {
  /** Metres around the king within which units answer a night rally (design 11 §6). */
  rallyReach: number;
  /** Damage multiplier for units following the king. */
  rallyDamage: number;
  /** Multiplies the run's score (Stage A score). Mutator bonuses are added to it first. */
  scoreMultiplier: number;
  /** Multiplies the number of enemies in each wave group (rounded). */
  waveSize: number;
  /** Multiplies all gold paid at dawn, castle and buildings (rounded). */
  incomeRate: number;
}

export const BASE_RULES: Readonly<Rules> = {
  rallyReach: 6,
  rallyDamage: 1,
  scoreMultiplier: 1,
  waveSize: 1,
  incomeRate: 1,
};

/** The castle's numbers for the current level, before or after modifiers. */
export interface CastleStats {
  hp: number;
  radius: number;
  income: number;
  attack?: Attack;
}

/** Everything a modifier can reach. Applying modifiers changes these objects in place. */
export interface Tunables {
  buildings: Building[];
  units: Unit[];
  enemies: Enemy[];
  weapon: Weapon;
  king: KingSettings;
  castle: CastleStats;
  rules: Rules;
}

type Bag = Record<string, unknown>;

/** The objects a stat path selects, and the field path inside each. */
function select(t: Tunables, stat: string): { objects: Bag[]; field: string[] } {
  const parts = stat.split('.');
  const kind = parts[0]!;
  if (kind === 'building' || kind === 'unit' || kind === 'enemy') {
    const sel = parts[1]!;
    const list: (Building | Unit | Enemy)[] =
      kind === 'building' ? t.buildings : kind === 'unit' ? t.units : t.enemies;
    const objects = list.filter((o) => {
      if (sel === '*') return true;
      if (sel.startsWith('class:')) {
        const cls = sel.slice(6);
        return ('class' in o && o.class === cls) || ('archetype' in o && o.archetype === cls);
      }
      return o.id === sel;
    });
    return { objects: objects as unknown as Bag[], field: parts.slice(2) };
  }
  // Compatibility for PR #63 content authored while abilities still belonged to weapons.
  if (kind === 'weapon' && parts[1] === 'ability')
    return { objects: [t.king as unknown as Bag], field: parts.slice(1) };
  const one = { king: t.king, weapon: t.weapon, castle: t.castle, rules: t.rules }[kind];
  return { objects: one ? [one as unknown as Bag] : [], field: parts.slice(1) };
}

/** The object holding the last field of the path, if the whole path leads to a number. */
function holder(obj: Bag, field: string[]): Bag | null {
  let cur: Bag = obj;
  for (const key of field.slice(0, -1)) {
    const next = cur[key];
    if (next === null || typeof next !== 'object') return null;
    cur = next as Bag;
  }
  return typeof cur[field.at(-1)!] === 'number' ? cur : null;
}

/** How many numbers a stat path reaches; 0 means the path is wrong. */
export function countTargets(t: Tunables, stat: string): number {
  const { objects, field } = select(t, stat);
  return objects.filter((o) => holder(o, field) !== null).length;
}

/**
 * Applies one modifier to `t` in place, if it is active on `night`. Entries the path does not
 * fit (a building without an attack, say) are skipped.
 */
export function applyModifier(t: Tunables, m: Modifier, night: number): void {
  if (m.nights && !m.nights.includes(night)) return;
  const { objects, field } = select(t, m.stat);
  const key = field.at(-1)!;
  for (const o of objects) {
    const h = holder(o, field);
    if (!h) continue;
    const v = h[key] as number;
    h[key] = m.op === 'add' ? v + m.value : v * m.value;
  }
}

/** "id: stat" for every modifier of `perks` (or mutators) whose path reaches no number in `t`. */
export function checkModifiers(
  t: Tunables,
  perks: readonly Pick<Perk, 'id' | 'modifiers'>[],
): string[] {
  return perks.flatMap((p) =>
    p.modifiers.filter((m) => countTargets(t, m.stat) === 0).map((m) => `${p.id}: ${m.stat}`),
  );
}
