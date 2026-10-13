/**
 * HUD store (ADR-005): holds a read-only *copy* of what the HUD shows, refreshed at most
 * ~10 times per second. Vue's reactivity never wraps the live GameState (that would put
 * proxies on hot simulation data); the HUD only reads snapshots and sends commands.
 */
import type { GameContext, GameState, Phase } from '@kd/core';
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export interface SlotView {
  id: string;
  building: string | null;
  destroyed: boolean;
  build: { id: string; name: string; cost: number }[];
  upgrades: { to: string; name: string; cost: number }[];
}

export interface HudSnapshot {
  phase: Phase;
  day: number;
  nights: number;
  gold: number;
  castleHp: number;
  castleMaxHp: number;
  kingAlive: boolean;
  kingRespawnSeconds: number;
  enemiesLeft: number;
  slots: SlotView[];
  lastIncome: number | null;
}

export function snapshot(state: GameState, ctx: GameContext): HudSnapshot {
  const slots = ctx.map.nodes
    .filter((n) => n.slot)
    .map((n): SlotView => {
      const b = state.buildings.find((x) => x.slot === n.id);
      const def = b ? ctx.buildings.get(b.type)! : null;
      return {
        id: n.id,
        building: def?.name ?? null,
        destroyed: b?.destroyed ?? false,
        build: b
          ? []
          : n.slot!.options.map((o) => {
              const d = ctx.buildings.get(o)!;
              return { id: d.id, name: d.name, cost: d.cost };
            }),
        upgrades: (def?.upgrades ?? []).map((u) => ({
          to: u.to,
          name: ctx.buildings.get(u.to)!.name,
          cost: u.cost,
        })),
      };
    });
  return {
    phase: state.phase,
    day: state.day,
    nights: ctx.map.nights,
    gold: state.gold,
    castleHp: Math.ceil(state.castle.hp),
    castleMaxHp: state.castle.maxHp,
    kingAlive: state.king.alive,
    kingRespawnSeconds: Math.ceil(state.king.respawnIn / 30),
    enemiesLeft: state.enemies.length + state.spawnQueue.length,
    slots,
    lastIncome: state.history.at(-1)?.income ?? null,
  };
}

export const useHudStore = defineStore('hud', () => {
  const hud = shallowRef<HudSnapshot | null>(null);
  const message = shallowRef<string>('');
  return { hud, message };
});
