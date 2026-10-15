/**
 * Night lighting (finding F12): the same buildings and enemies by night, lit differently. A cool
 * moonlit tint settles over the ground, scenery and buildings, warm glows light windows and
 * lanterns, and dusk and dawn ease in and out instead of switching. Actors stay bright so their
 * silhouettes, weapons and shots never get lost. View-only (ADR-004).
 */
import { colors } from '../theme.ts';

/** How long dusk and dawn take to settle, in ms (the time constant of the easing). */
export const DUSK_MS = 900;

/** Moves the night level (0 = full day, 1 = full night) toward the phase, frame-rate free. */
export function easeNight(level: number, night: boolean, deltaMs: number): number {
  const target = night ? 1 : 0;
  const next = level + (target - level) * (1 - Math.exp(-deltaMs / DUSK_MS));
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** Mixes two 0xRRGGBB colours, `t` of the way from `a` to `b`. */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

/** Strength of the moonlit wash over the ground at night `level`. */
export function groundShade(level: number): number {
  return 0.45 * level;
}

/**
 * The tint multiplied over painted scenery and buildings at night `level`: the same moonlight as
 * the ground's wash, so a building or cliff sits in the night instead of glowing out of it.
 */
export function sceneryTint(level: number): number {
  return mix(0xffffff, colors.night, groundShade(level));
}

/** Strength of the warm window and lantern glows at night `level`: they light up after dusk. */
export function glowStrength(level: number): number {
  return Math.max(0, (level - 0.25) / 0.75);
}
