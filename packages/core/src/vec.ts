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

/** Distance from point p to the segment a–b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}

/** Distance from point p to a polyline. */
export function distToPolyline(p: Vec, points: readonly Vec[]): number {
  if (points.length === 1) return dist(p, points[0]!);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}

/**
 * Cosine of an angle in degrees, by Taylor series with + - * / only, so it is bit-exact across
 * engines (Math.cos is not). Used once per run to turn an attack arc into a dot-product threshold.
 */
export function cosDegrees(degrees: number): number {
  const x = (degrees * Math.PI) / 180;
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 30; n++) {
    term *= -x2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}
