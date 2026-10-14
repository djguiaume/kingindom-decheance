/** Night simulation rate. Content speaks in seconds; the core in ticks (ADR-002). */
export const TICK_RATE = 30;
export const STATE_SCHEMA_VERSION = 3;

/** Converts a content duration to a whole number of ticks (at least one for intervals). */
export function secondsToTicks(seconds: number, min = 0): number {
  return Math.max(min, Math.round(seconds * TICK_RATE));
}

/** Converts a content speed (units per second) to units per tick. */
export function perTick(perSecond: number): number {
  return perSecond / TICK_RATE;
}
