import { perTick } from '../constants.ts';
import { req, type GameContext } from '../context.ts';
import { nextFloat } from '../rng.ts';
import type { GameState } from '../state.ts';
import { dist, moveToward, type Vec } from '../vec.ts';
import { holdAtGate, resolve, wallAt, wallGate } from './targets.ts';

/** Stop slightly inside attack range so floating-point rounding never leaves us just outside. */
const RANGE_SLACK = 0.05;
/**
 * Waypoints count as reached within this radius: crowds pushed apart by separation could
 * otherwise never touch the exact point and would mill around it forever.
 */
const WAYPOINT_RADIUS = 1;

/**
 * Enemies close in on their target, or walk their lane (stopping at standing walls);
 * flyers without a target hover. Units close in on their target or return to their post.
 */
export function movementSystem(state: GameState, ctx: GameContext): void {
  for (const enemy of state.enemies) {
    const def = req(ctx.enemies, enemy.type);
    const step = perTick(def.speed);
    const target = enemy.target && resolve(state, ctx, enemy.target);
    // Ground enemies never get past a standing wall, whatever they are chasing.
    const gate = def.flying ? null : wallGate(state, ctx, enemy);
    if (target) {
      moveToward(
        enemy.pos,
        target.pos,
        step,
        def.radius + target.radius + def.attack.range - RANGE_SLACK,
      );
      if (gate) holdAtGate(gate, enemy.pos, def.radius);
      continue;
    }
    if (def.flying) continue;

    const lane = req(ctx.lanes, enemy.lane);
    const last = lane.points.length - 1;
    const wall = wallAt(state, ctx, lane.nodes[enemy.waypoint]!);
    if (
      !wall &&
      enemy.waypoint < last &&
      dist(enemy.pos, lane.points[enemy.waypoint]!) <= WAYPOINT_RADIUS
    ) {
      enemy.waypoint++;
    }
    const blocker = wallAt(state, ctx, lane.nodes[enemy.waypoint]!);
    // Stop at a standing wall's face, or at the castle's wall at the end of the lane.
    const stopAt = blocker
      ? req(ctx.buildings, blocker.type).radius + def.radius
      : enemy.waypoint === last
        ? state.castle.radius + def.radius
        : 0;
    moveToward(enemy.pos, lane.points[enemy.waypoint]!, step, stopAt);
    if (gate) holdAtGate(gate, enemy.pos, def.radius);
  }

  for (const unit of state.units) {
    const def = req(ctx.units, unit.type);
    const step = perTick(def.speed);
    const target = unit.target && resolve(state, ctx, unit.target);
    if (target) {
      moveToward(
        unit.pos,
        target.pos,
        step,
        def.radius + target.radius + def.attack.range - RANGE_SLACK,
      );
    } else {
      moveToward(unit.pos, unit.post, step);
    }
  }
}

interface Body {
  pos: Vec;
  radius: number;
}

/**
 * Simple local steering: overlapping bodies on the same layer push each other apart.
 * Pushes are computed from the positions before any push is applied, so the result does not
 * depend on the order bodies are visited in.
 */
export function separationSystem(state: GameState, ctx: GameContext): void {
  const ground: Body[] = [];
  const air: Body[] = [];
  for (const e of state.enemies) {
    const def = req(ctx.enemies, e.type);
    (def.flying ? air : ground).push({ pos: e.pos, radius: def.radius });
  }
  for (const u of state.units) ground.push({ pos: u.pos, radius: req(ctx.units, u.type).radius });
  separate(ground, state);
  separate(air, state);
}

function separate(bodies: Body[], state: GameState): void {
  const push = bodies.map(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const minDist = a.radius + b.radius;
      const d = dist(a.pos, b.pos);
      if (d >= minDist) continue;
      let nx: number;
      let ny: number;
      if (d > 1e-9) {
        nx = (b.pos.x - a.pos.x) / d;
        ny = (b.pos.y - a.pos.y) / d;
      } else {
        // Exactly on top of each other: pick a seeded direction (no trigonometry needed).
        const rx = nextFloat(state.rng) - 0.5;
        const ry = nextFloat(state.rng) - 0.5;
        const len = Math.sqrt(rx * rx + ry * ry) || 1;
        nx = rx / len;
        ny = ry / len;
      }
      const overlap = (minDist - d) / 2;
      push[i]!.x -= nx * overlap;
      push[i]!.y -= ny * overlap;
      push[j]!.x += nx * overlap;
      push[j]!.y += ny * overlap;
    }
  }
  bodies.forEach((body, i) => {
    body.pos.x += push[i]!.x;
    body.pos.y += push[i]!.y;
  });
}
