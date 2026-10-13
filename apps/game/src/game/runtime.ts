/**
 * GameRuntime: the bridge between the browser's frame clock and the fixed-tick core (ADR-002).
 * Frames arrive at any rate (60, 144 Hz, or stalls); the core advances in exact 1/30 s ticks.
 * An accumulator converts one into the other, and the view interpolates between the last two
 * ticks so motion stays smooth. Nothing here changes rules: it only calls `step` and `submit`.
 */
import type { ContentBundle } from '@kd/content';
import {
  Session,
  TICK_RATE,
  type Command,
  type CommandResult,
  type GameEvent,
  type RunConfig,
  type Vec,
} from '@kd/core';

const TICK_MS = 1000 / TICK_RATE;
/** After a long stall (tab in background), drop time rather than fast-forwarding minutes. */
const MAX_TICKS_PER_FRAME = 5;

export class GameRuntime {
  session: Session;
  private accumulator = 0;
  private previous = new Map<string, Vec>();
  private listeners: ((events: GameEvent[]) => void)[] = [];
  /** While paused the clock is ignored: no ticks run (view-only, never reaches the core). */
  paused = false;

  constructor(
    private readonly content: ContentBundle,
    private readonly config: RunConfig,
  ) {
    this.session = new Session(content, config);
  }

  get state() {
    return this.session.state;
  }

  get ctx() {
    return this.session.ctx;
  }

  onEvents(listener: (events: GameEvent[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  submit(command: Command): CommandResult {
    const result = this.session.submit(command);
    if (result.ok && result.events.length > 0) this.emit(result.events);
    return result;
  }

  /** Called once per rendered frame with the elapsed wall-clock time. */
  advance(deltaMs: number): void {
    if (this.paused) return;
    this.accumulator += deltaMs;
    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.remember();
      const events = this.session.step();
      if (events.length > 0) this.emit(events);
      this.accumulator -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.accumulator = 0;
  }

  /** Where to draw an entity now: between its previous and current tick positions. */
  drawPos(key: string, current: Vec): Vec {
    const prev = this.previous.get(key);
    if (!prev) return current;
    const t = Math.min(1, this.accumulator / TICK_MS);
    return { x: prev.x + (current.x - prev.x) * t, y: prev.y + (current.y - prev.y) * t };
  }

  restart(): void {
    this.session = new Session(this.content, this.config);
    this.previous.clear();
    this.accumulator = 0;
  }

  private remember(): void {
    const s = this.session.state;
    this.previous.clear();
    this.previous.set('king', { ...s.king.pos });
    for (const e of s.enemies) this.previous.set(`e${e.id}`, { ...e.pos });
    for (const u of s.units) this.previous.set(`u${u.id}`, { ...u.pos });
  }

  private emit(events: GameEvent[]): void {
    for (const l of this.listeners) l(events);
  }
}
