/**
 * Terrain (rework of Greyhollow): cliffs and water nobody on the ground walks through, and
 * bridges that open water to walking. The map draws them as strips (a polyline with a width);
 * the core turns them once per run into round-ended segments ("capsules") and pushes ground
 * bodies out of them, the same way wall wings push the king out (walls.ts).
 *
 * Steering: when a straight walk is blocked, head for the next map node (a pass, a lane
 * waypoint, a slot) on the shortest walk round the terrain. Map nodes sit in the passes, so
 * this finds the way through them.
 */
import type { GameMap } from '@kd/content';
import { dist, type Vec } from '../vec.ts';

/** A segment a–b thickened by `r` on every side, with round ends. a = b makes a disc. */
export interface Capsule {
  a: Vec;
  b: Vec;
  r: number;
  /** Bounding box, for a cheap first test. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Water is cut into pieces this long, so a bridge can open a gap of the right width. */
const WATER_PIECE = 0.5;

function capsule(a: Vec, b: Vec, r: number): Capsule {
  return {
    a,
    b,
    r,
    minX: Math.min(a.x, b.x) - r,
    minY: Math.min(a.y, b.y) - r,
    maxX: Math.max(a.x, b.x) + r,
    maxY: Math.max(a.y, b.y) + r,
  };
}

const pt = (p: readonly [number, number]): Vec => ({ x: p[0], y: p[1] });

/** A strip's polyline as segments no longer than `piece`; one point gives one zero-length segment. */
function strip(points: readonly (readonly [number, number])[], piece = Infinity): [Vec, Vec][] {
  const out: [Vec, Vec][] = [];
  if (points.length === 1) {
    const p = pt(points[0]!);
    return [[p, p]];
  }
  for (let i = 1; i < points.length; i++) {
    const a = pt(points[i - 1]!);
    const b = pt(points[i]!);
    const n = Math.max(1, Math.ceil(dist(a, b) / piece));
    for (let k = 0; k < n; k++) {
      out.push([
        { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n },
        { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n },
      ]);
    }
  }
  return out;
}

/**
 * The capsules that block ground walking on a map. Water pieces closer to a bridge's axis than
 * the bridge's half width plus the water's half width are left out, so the deck is walkable
 * edge to edge and the water either side of it still blocks.
 */
export function terrainBlockers(map: GameMap): Capsule[] {
  const out: Capsule[] = [];
  for (const c of map.terrain.cliffs) {
    for (const [a, b] of strip(c.points)) out.push(capsule(a, b, c.width / 2));
  }
  const bridges = map.terrain.bridges.map((b) => ({
    a: pt(b.from),
    b: pt(b.to),
    half: b.width / 2,
  }));
  for (const w of map.terrain.water) {
    const r = w.width / 2;
    for (const [a, b] of strip(w.points, WATER_PIECE)) {
      const open = bridges.some((br) => segmentDistance(a, b, br.a, br.b) < br.half + r);
      if (!open) out.push(capsule(a, b, r));
    }
  }
  return out;
}

/** Pushes a round ground body out of every blocker it overlaps. */
export function blockByTerrain(blockers: readonly Capsule[], pos: Vec, radius: number): void {
  for (const c of blockers) {
    if (
      pos.x + radius <= c.minX ||
      pos.x - radius >= c.maxX ||
      pos.y + radius <= c.minY ||
      pos.y - radius >= c.maxY
    )
      continue;
    const q = closestOnSegment(pos, c.a, c.b);
    const dx = pos.x - q.x;
    const dy = pos.y - q.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const reach = c.r + radius;
    if (d >= reach) continue;
    if (d > 1e-9) {
      pos.x = q.x + (dx / d) * reach;
      pos.y = q.y + (dy / d) * reach;
    } else {
      // Exactly on the axis: step out square to the segment (or straight down for a disc).
      const sx = c.b.x - c.a.x;
      const sy = c.b.y - c.a.y;
      const len = Math.sqrt(sx * sx + sy * sy);
      pos.x = q.x + (len > 1e-9 ? -sy / len : 0) * reach;
      pos.y = q.y + (len > 1e-9 ? sx / len : 1) * reach;
    }
  }
}

/** True when a body of `radius` can walk the straight line from → to without touching terrain. */
export function walkable(
  blockers: readonly Capsule[],
  from: Vec,
  to: Vec,
  radius: number,
): boolean {
  const minX = Math.min(from.x, to.x) - radius;
  const maxX = Math.max(from.x, to.x) + radius;
  const minY = Math.min(from.y, to.y) - radius;
  const maxY = Math.max(from.y, to.y) + radius;
  for (const c of blockers) {
    if (maxX <= c.minX || minX >= c.maxX || maxY <= c.minY || minY >= c.maxY) continue;
    if (segmentDistance(from, to, c.a, c.b) < c.r + radius) return false;
  }
  return true;
}

/** The radius the waypoint graph is checked for: about the biggest walker. */
const GRAPH_RADIUS = 0.6;

/**
 * Shortest walking distances between map nodes round the terrain, computed once per run:
 * the nodes form a graph whose edges are straight walks clear of every blocker.
 */
export interface WayGraph {
  points: readonly Vec[];
  /** dist[i][j]: shortest walk from node i to node j, Infinity when there is none. */
  dist: readonly (readonly number[])[];
}

export function wayGraph(blockers: readonly Capsule[], points: readonly Vec[]): WayGraph {
  const n = points.length;
  const d: number[][] = points.map((a, i) =>
    points.map((b, j) =>
      i === j ? 0 : walkable(blockers, a, b, GRAPH_RADIUS) ? dist(a, b) : Infinity,
    ),
  );
  // Floyd–Warshall: a few dozen nodes, once per run.
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const dik = d[i]![k]!;
      if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const via = dik + d[k]![j]!;
        if (via < d[i]![j]!) d[i]![j] = via;
      }
    }
  }
  return { points, dist: d };
}

/**
 * Where a ground body should head to reach `to`: `to` itself when the straight way is clear,
 * otherwise the first node of the shortest walk round the terrain (from → node a, nodes to
 * node b, b → to). Distances are true walking distances, so the choice does not flip between
 * two nodes from one step to the next. Falls back to `to` when nothing is reachable.
 */
export function walkAim(
  blockers: readonly Capsule[],
  graph: WayGraph,
  from: Vec,
  to: Vec,
  radius: number,
): Vec {
  if (blockers.length === 0 || walkable(blockers, from, to, radius)) return to;
  // A little slack, so a body grazing a ridge still sees the node it is walking to.
  const slack = radius * 0.5;
  const { points } = graph;
  const fromD: number[] = [];
  const toD: number[] = [];
  for (const p of points) {
    fromD.push(walkable(blockers, from, p, slack) ? dist(from, p) : Infinity);
    toD.push(walkable(blockers, p, to, slack) ? dist(p, to) : Infinity);
  }
  let best = to;
  let bestCost = Infinity;
  for (let a = 0; a < points.length; a++) {
    if (fromD[a] === Infinity) continue;
    const row = graph.dist[a]!;
    for (let b = 0; b < points.length; b++) {
      if (toD[b] === Infinity) continue;
      const cost = fromD[a]! + row[b]! + toD[b]!;
      if (cost < bestCost) {
        bestCost = cost;
        best = points[a]!;
      }
    }
  }
  return best;
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

const pointSegment = (p: Vec, a: Vec, b: Vec) => dist(p, closestOnSegment(p, a, b));

/** Shortest distance between segments p1–p2 and q1–q2 (0 when they cross). */
export function segmentDistance(p1: Vec, p2: Vec, q1: Vec, q2: Vec): number {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = q2.x - q1.x;
  const d2y = q2.y - q1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (cross !== 0) {
    const ox = q1.x - p1.x;
    const oy = q1.y - p1.y;
    const t = (ox * d2y - oy * d2x) / cross;
    const u = (ox * d1y - oy * d1x) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegment(p1, q1, q2),
    pointSegment(p2, q1, q2),
    pointSegment(q1, p1, p2),
    pointSegment(q2, p1, p2),
  );
}
