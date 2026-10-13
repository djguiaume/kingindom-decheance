import type { GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';
import { killKing } from './king.ts';

/** Removes dead enemies and units, marks destroyed buildings, starts the king's respawn timer. */
export function deathSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => {
    if (e.hp > 0) return true;
    events.push({ type: 'killed', target: { kind: 'enemy', id: e.id } });
    return false;
  });
  state.current.enemiesKilled += before - state.enemies.length;

  state.units = state.units.filter((u) => {
    if (u.hp > 0) return true;
    events.push({ type: 'killed', target: { kind: 'unit', id: u.id } });
    return false;
  });

  for (const b of state.buildings) {
    if (!b.destroyed && b.hp <= 0) {
      b.destroyed = true;
      b.cooldown = 0;
      state.current.buildingsLost++;
      events.push({ type: 'buildingDestroyed', id: b.id, slot: b.slot });
    }
  }

  if (state.king.alive && state.king.hp <= 0) {
    killKing(state, ctx);
    events.push({ type: 'killed', target: { kind: 'king' } });
  }
}
