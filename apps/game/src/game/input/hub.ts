/**
 * InputHub: the single place where every input adapter (keyboard, touch, later gamepad) turns
 * intent into core commands (ADR-009). Adapters never call the core directly, so the rules
 * never know which device was used.
 */
import { atCastle, castleOffer, type Command } from '@kd/core';
import type { GameRuntime } from '../runtime.ts';
import { nearbySlotId, useHudStore, type Device } from '../../stores/hud.ts';

/** Hold durations from design 11 §10 (hold-to-confirm on every device). */
export const HOLD_BUY_MS = 400;
export const HOLD_NIGHT_MS = 1000;
/** How long a refusal ("ability is not ready") stays on screen. */
export const MESSAGE_MS = 1500;

export class InputHub {
  private lastMove = { x: 0, y: 0 };
  private messageTimer: number | undefined;
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

  /**
   * At a military slot, the main action cycles the rally gate (design 11 §10.2); at the castle
   * it opens the perk picker, and in the picker it confirms the selected perk.
   */
  mainAction(): void {
    if (this.store.pickerOpen) return this.choosePerk();
    const s = this.runtime.state;
    const slot = nearbySlotId(s, this.runtime.ctx);
    if (!slot) {
      if (atCastle(s, this.runtime.ctx)) this.openCastle();
      return;
    }
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

  /** Opens the castle's perk picker, if its next level exists. Backing out costs nothing. */
  openCastle(): void {
    const offer = castleOffer(this.runtime.state, this.runtime.ctx);
    if (!offer) return this.say('the castle is at its highest level');
    if (offer.cost > this.runtime.state.gold) return this.say('not enough gold');
    this.store.pick = null;
    this.store.pickerOpen = true;
  }

  closePicker(): void {
    this.store.pickerOpen = false;
    this.store.pick = null;
  }

  /** Selects perk card `index` (0-2), or moves the selection by `step` cards. */
  selectPerk(index: number | null, step = 0): void {
    const count = castleOffer(this.runtime.state, this.runtime.ctx)?.perks.length ?? 0;
    if (count === 0) return;
    const from = this.store.pick ?? (step > 0 ? -1 : count);
    this.store.pick = index ?? (from + step + count) % count;
  }

  /** Buys the castle's next level with the selected perk (after a completed hold). */
  choosePerk(): void {
    const offer = castleOffer(this.runtime.state, this.runtime.ctx);
    const perk = offer && this.store.pick !== null ? offer.perks[this.store.pick] : undefined;
    if (!offer || !perk) return this.say('pick a perk first');
    if (this.send({ type: 'chooseCastleLevel', level: offer.level, perk: perk.id }))
      this.closePicker();
  }

  /** Rally: by night, pick up or drop footmen; by day, take or plant a barracks flag. */
  rally(device: Device): void {
    this.used(device);
    this.send({ type: 'rally' });
  }

  startNight(): void {
    this.send({ type: 'startNight' });
  }

  togglePause(): void {
    this.store.paused = !this.store.paused;
  }

  /** Sends a command; true when the core accepted it. */
  private send(command: Command): boolean {
    const result = this.runtime.submit(command);
    // Movement refusals are silent; the rest is worth a short message, which fades on its own.
    if (command.type === 'move') return result.ok;
    if (result.ok) this.say('');
    else this.say(result.reason);
    return result.ok;
  }

  /** Shows a short message that fades on its own (an empty one clears it). */
  private say(text: string): void {
    this.store.message = text;
    window.clearTimeout(this.messageTimer);
    if (text) this.messageTimer = window.setTimeout(() => (this.store.message = ''), MESSAGE_MS);
  }
}
