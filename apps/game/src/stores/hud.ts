/**
 * HUD store (ADR-005): holds a read-only *copy* of what the HUD shows, refreshed ~10 times per
 * second, plus view-only UI state (device, pause, zoom, holds). Vue's reactivity never wraps the
 * live GameState (that would put proxies on hot simulation data).
 */
import { buyOptions, telegraph, type GameContext, type GameState, type Phase } from '@kd/core';
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { dist } from '@kd/core';

export interface SlotOffer {
  option: number;
  kind: 'build' | 'upgrade';
  building: string;
  name: string;
  cost: number;
  affordable: boolean;
}

export interface NearbySlot {
  id: string;
  current: string | null;
  offers: SlotOffer[];
  /** Military building with rally gates: which gate it guards now. */
  rally: string | null;
}

export interface LaneThreat {
  lane: string;
  total: number;
  enemies: { id: string; name: string; count: number }[];
}

export interface HudSnapshot {
  phase: Phase;
  day: number;
  nights: number;
  gold: number;
  castleHp: number;
  castleMaxHp: number;
  kingHp: number;
  kingMaxHp: number;
  kingAlive: boolean;
  kingRespawnSeconds: number;
  enemiesLeft: number;
  /** 0 = ready, 1 = just used. */
  abilityCooldown: number;
  abilityName: string | null;
  nearby: NearbySlot | null;
  threats: LaneThreat[];
  lastIncome: number | null;
  /** A standing military building (the Rally button shows only then). */
  hasBarracks: boolean;
  /** Footmen on the field tonight, and how many follow the king. */
  units: number;
  followers: number;
  /** The living boss, for the bar at the top of the screen. */
  boss: { name: string; hp: number; maxHp: number } | null;
}

export interface NightPlan {
  night: number;
  lanes: { lane: string; enemies: { id: string; name: string; count: number }[] }[];
  boss: string | null;
}

/** Every night of the map, lane by lane (the waves panel, design 11 §8.3). */
export function nightPlans(ctx: GameContext): NightPlan[] {
  const plans: NightPlan[] = [];
  for (let night = 1; night <= ctx.map.nights; night++) {
    const lanes: NightPlan['lanes'] = [];
    let boss: string | null = null;
    for (const t of telegraph(ctx, night)) {
      const def = ctx.enemies.get(t.enemy)!;
      if (def.archetype === 'boss') boss = t.enemy;
      let lane = lanes.find((l) => l.lane === t.lane);
      if (!lane) lanes.push((lane = { lane: t.lane, enemies: [] }));
      lane.enemies.push({ id: t.enemy, name: def.name, count: t.count });
    }
    plans.push({ night, lanes, boss });
  }
  return plans;
}

/** The slot the king stands at, if any (within build reach). */
export function nearbySlotId(state: GameState, ctx: GameContext): string | null {
  if (!state.king.alive) return null;
  let best: string | null = null;
  let bestD = ctx.king.buildReach + ctx.king.radius;
  for (const n of ctx.map.nodes) {
    if (!n.slot) continue;
    const d = dist(state.king.pos, { x: n.pos[0], y: n.pos[1] });
    if (d <= bestD) {
      best = n.id;
      bestD = d;
    }
  }
  return best;
}

export function snapshot(state: GameState, ctx: GameContext): HudSnapshot {
  const slotId = state.phase === 'day' ? nearbySlotId(state, ctx) : null;
  let nearby: NearbySlot | null = null;
  if (slotId) {
    const built = state.buildings.find((b) => b.slot === slotId);
    nearby = {
      id: slotId,
      current: built ? ctx.buildings.get(built.type)!.name : null,
      rally: built?.rally ?? null,
      offers: buyOptions(state, ctx, slotId).map((o) => ({
        ...o,
        name: ctx.buildings.get(o.building)!.name,
        affordable: o.cost <= state.gold,
      })),
    };
  }
  const threats: LaneThreat[] = [];
  for (const t of telegraph(ctx, state.day)) {
    let lane = threats.find((x) => x.lane === t.lane);
    if (!lane) threats.push((lane = { lane: t.lane, total: 0, enemies: [] }));
    lane.total += t.count;
    lane.enemies.push({ id: t.enemy, name: ctx.enemies.get(t.enemy)!.name, count: t.count });
  }
  const ability = ctx.weapon.ability;
  return {
    phase: state.phase,
    day: state.day,
    nights: ctx.map.nights,
    gold: state.gold,
    castleHp: Math.ceil(state.castle.hp),
    castleMaxHp: state.castle.maxHp,
    kingHp: Math.ceil(state.king.hp),
    kingMaxHp: state.king.maxHp,
    kingAlive: state.king.alive,
    kingRespawnSeconds: Math.ceil(state.king.respawnIn / 30),
    enemiesLeft: state.enemies.length + state.spawnQueue.length,
    abilityCooldown: ability ? state.king.abilityCooldown / (ability.cooldown * 30) : 0,
    abilityName: ability?.name ?? null,
    nearby,
    threats,
    lastIncome: state.history.at(-1)?.income ?? null,
    hasBarracks: state.buildings.some((b) => !b.destroyed && !!ctx.buildings.get(b.type)!.spawns),
    units: state.units.length,
    followers: state.units.filter((u) => u.following).length,
    boss: bossOf(state, ctx),
  };
}

function bossOf(state: GameState, ctx: GameContext): HudSnapshot['boss'] {
  const e = state.enemies.find((x) => ctx.enemies.get(x.type)!.archetype === 'boss');
  if (!e) return null;
  return { name: ctx.enemies.get(e.type)!.name, hp: Math.ceil(e.hp), maxHp: e.maxHp };
}

export type Device = 'keyboard' | 'touch';

export const useHudStore = defineStore('hud', () => {
  const hud = shallowRef<HudSnapshot | null>(null);
  const message = ref('');
  /** The last device used decides which controls and hints show (ADR-009). */
  const device = ref<Device>(
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      ? 'touch'
      : 'keyboard',
  );
  const paused = ref(false);
  const waveOpen = ref(false);
  const zoomClose = ref(true);
  /** A keyboard hold in progress ("buy-0", "buy-1", "night"), mirrored on the on-screen buttons. */
  const keyHold = ref<string | null>(null);
  return { hud, message, device, paused, waveOpen, zoomClose, keyHold };
});
