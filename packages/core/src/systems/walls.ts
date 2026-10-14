/**
 * Wall geometry (playtest 2, like Thronefall): a wall is a line across its lane, square to the
 * lane, with a gate in the middle. Enemies are held on their side of the whole line (see
 * `wallGate` in targets.ts); the king and footmen are stopped by the two wings but walk through
 * the gate, which opens for them.
 */
import { req, type GameContext } from '../context.ts';
import type { BuildingState, GameState } from '../state.ts';
import { dist, type Vec } from '../vec.ts';

/** Half the wall's length across the lane, gate included. */
export const WALL_HALF_SPAN = 4.5;
/** Half the gate's width: the gap the king and footmen walk through. */
export const GATE_HALF_WIDTH = 1.1;
/** Half the wall's thickness. */
export const WALL_HALF_THICKNESS = 0.35;

export interface WallLine {
  /** Centre of the wall (the slot, on the lane). */
  at: Vec;
  /** Unit vector along the lane, towards the castle. */
  along: Vec;
  /** Unit vector across the lane: the wall runs from at − across·span to at + across·span. */
  across: Vec;
}

/**
 * The line a wall on `nodeId` stands on: square to the lane segment that arrives at the node,
 * the same line enemies are held behind. Null if the node is not on a ground lane.
 */
export function wallLine(ctx: GameContext, nodeId: string): WallLine | null {
  for (const lane of ctx.lanes.values()) {
    if (lane.air) continue;
    const i = lane.nodes.indexOf(nodeId);
    if (i <= 0) continue;
    const at = lane.points[i]!;
    const from = lane.points[i - 1]!;
    const len = dist(at, from);
    if (len < 1e-9) continue;
    const along = { x: (at.x - from.x) / len, y: (at.y - from.y) / len };
    return { at, along, across: { x: -along.y, y: along.x } };
  }
  return null;
}

/** The two wings of a wall, as segments either side of the gate. */
export function wallWings(line: WallLine): [Vec, Vec][] {
  const p = (k: number) => ({ x: line.at.x + line.across.x * k, y: line.at.y + line.across.y * k });
  return [
    [p(-WALL_HALF_SPAN), p(-GATE_HALF_WIDTH)],
    [p(GATE_HALF_WIDTH), p(WALL_HALF_SPAN)],
  ];
}

/** The standing walls, each with its line. */
export function standingWalls(
  state: GameState,
  ctx: GameContext,
): { wall: BuildingState; line: WallLine }[] {
  const out: { wall: BuildingState; line: WallLine }[] = [];
  for (const b of state.buildings) {
    if (b.destroyed || req(ctx.buildings, b.type).class !== 'wall') continue;
    const line = wallLine(ctx, b.slot);
    if (line) out.push({ wall: b, line });
  }
  return out;
}

/** Pushes a round body (king or footman) out of every standing wall's wings. */
export function blockByWalls(state: GameState, ctx: GameContext, pos: Vec, radius: number): void {
  for (const { line } of standingWalls(state, ctx)) {
    for (const [a, b] of wallWings(line)) pushOut(pos, radius + WALL_HALF_THICKNESS, a, b, line);
  }
}

function pushOut(pos: Vec, reach: number, a: Vec, b: Vec, line: WallLine): void {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((pos.x - a.x) * abx + (pos.y - a.y) * aby) / (abx * abx + aby * aby)),
  );
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= reach) return;
  // Exactly on the wall's centre line: step back towards the field side (against the lane).
  const nx = d > 1e-9 ? dx / d : -line.along.x;
  const ny = d > 1e-9 ? dy / d : -line.along.y;
  pos.x = cx + nx * reach;
  pos.y = cy + ny * reach;
}

/**
 * Where a body on the player's side should head to reach `to`: `to` itself, or the gate of the
 * first standing wall whose wings lie across the straight path. Simple local steering, so
 * footmen (and bots' kings) walk through gates instead of pressing against a wing.
 */
export function throughGate(
  state: GameState,
  ctx: GameContext,
  from: Vec,
  to: Vec,
  radius: number,
): Vec {
  let best: Vec = to;
  let bestD = Infinity;
  for (const { line } of standingWalls(state, ctx)) {
    const sFrom = (from.x - line.at.x) * line.along.x + (from.y - line.at.y) * line.along.y;
    const sTo = (to.x - line.at.x) * line.along.x + (to.y - line.at.y) * line.along.y;
    if (sFrom * sTo > 0) continue; // both on the same side
    const k = sFrom === sTo ? 0 : sFrom / (sFrom - sTo);
    const cross = {
      x: from.x + (to.x - from.x) * k - line.at.x,
      y: from.y + (to.y - from.y) * k - line.at.y,
    };
    const lateral = Math.abs(cross.x * line.across.x + cross.y * line.across.y);
    const reach = radius + WALL_HALF_THICKNESS;
    if (lateral > WALL_HALF_SPAN + reach || lateral < GATE_HALF_WIDTH - radius) continue;
    const d = dist(from, line.at);
    if (d < bestD) {
      best = line.at;
      bestD = d;
    }
  }
  return best;
}
