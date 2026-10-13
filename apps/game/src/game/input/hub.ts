/**
 * InputHub: the single place where every input adapter (keyboard, touch, later gamepad) turns
 * intent into core commands (ADR-009). Adapters never call the core directly, so the rules
 * never know which device was used.
 */
import type { Command } from '@kd/core';
import type { GameRuntime } from '../runtime.ts';
import { nearbySlotId, useHudStore, type Device } from '../../stores/hud.ts';

/** Hold durations from design 11 §10 (hold-to-confirm on every device). */
export const HOLD_BUY_MS = 400;
export const HOLD_NIGHT_MS = 1000;

export class InputHub {
  private lastMove = { x: 0, y: 0 };
  private readonly store = useHudStore();

  constructor(private readonly runtime: GameRuntime) {}

  used(device: Device): void {
    if (this.store.device !== device) this.store.device = device;
  }

  /** Analog movement, length 0–1. Rounded so replays stay compact; sent only on change. */
  move(x: number, y: number, device: Device): void {
    this.used(device);
    const len = Math.sqrt(x * x + y * y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const rx = Math.round(x * 20) / 20;
    const ry = Math.round(y * 20) / 20;
    if (rx === this.lastMove.x && ry === this.lastMove.y) return;
    this.lastMove = { x: rx, y: ry };
    this.send({ type: 'move', x: rx, y: ry });
  }

  ability(device: Device, dir?: { x: number; y: number }): void {
    this.used(device);
    this.send(dir && (dir.x !== 0 || dir.y !== 0) ? { type: 'ability', dir } : { type: 'ability' });
  }

  /** Buy option `option` at the slot the king stands at (after a completed hold). */
  buy(option: number): void {
    const slot = nearbySlotId(this.runtime.state, this.runtime.ctx);
    if (slot) this.send({ type: 'buy', slot, option });
  }

  /** At a military slot, the main action cycles the rally gate (design 11 §10.2). */
  mainAction(): void {
    const s = this.runtime.state;
    const slot = nearbySlotId(s, this.runtime.ctx);
    if (!slot) return;
    const b = s.buildings.find((x) => x.slot === slot);
    const def = b && this.runtime.ctx.buildings.get(b.type);
    if (def?.spawns && b?.rally) this.send({ type: 'cycleRally', slot });
    else this.buy(0);
  }

  /** Second action: the other T3 branch, or the upgrade at a military slot (E cycles its gate). */
  secondAction(): void {
    const s = this.runtime.state;
    const slot = nearbySlotId(s, this.runtime.ctx);
    if (!slot) return;
    const b = s.buildings.find((x) => x.slot === slot);
    const def = b && this.runtime.ctx.buildings.get(b.type);
    this.buy(def?.spawns && b?.rally ? 0 : 1);
  }

  startNight(): void {
    this.send({ type: 'startNight' });
  }

  togglePause(): void {
    this.store.paused = !this.store.paused;
  }

  private send(command: Command): void {
    const result = this.runtime.submit(command);
    // Movement refusals are silent; the rest is worth a short message.
    if (command.type !== 'move') this.store.message = result.ok ? '' : result.reason;
  }
}
