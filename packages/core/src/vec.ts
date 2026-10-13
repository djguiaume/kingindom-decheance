/**
 * 2D vector helpers. Only +, -, *, / and Math.sqrt are used: these are exactly specified by
 * IEEE 754, so results match bit for bit across JavaScript engines (no sin/cos/exp here).
 */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });

export function dist(a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Moves `pos` in place toward `target` by at most `step`; returns true if it arrived.
 * Stops `stopAt` units short of the target (used to stop at attack range).
 */
export function moveToward(pos: Vec, target: Vec, step: number, stopAt = 0): boolean {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const remaining = d - stopAt;
  if (remaining <= step) {
    if (remaining > 0 && d > 0) {
      pos.x += (dx / d) * remaining;
      pos.y += (dy / d) * remaining;
    }
    return true;
  }
  pos.x += (dx / d) * step;
  pos.y += (dy / d) * step;
  return false;
}
