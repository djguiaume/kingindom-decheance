import { perTick } from '../constants.ts';
import { req, type GameContext } from '../context.ts';
import { nextFloat } from '../rng.ts';
import type { GameState } from '../state.ts';
import { dist, moveToward, type Vec } from '../vec.ts';
import { holdAtGate, resolve, wallAt, wallGate } from './targets.ts';
import { blockByTerrain, walkAim } from './terrain.ts';
import { blockByWalls, throughGate } from './walls.ts';

/** Stop slightly inside attack range so floating-point rounding never leaves us just outside. */
const RANGE_SLACK = 0.05;
/**
 * Waypoints count as reached within this radius: crowds pushed apart by separation could
 * otherwise never touch the exact point and would mill around it forever.
 */
const WAYPOINT_RADIUS = 1;
/** How close rallied units keep to the king. */
const FOLLOW_GAP = 0.8;

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
      // Round cliffs and water through the passes (flyers go straight).
      const aim = def.flying
        ? target.pos
        : walkAim(ctx.blockers, ctx.ways, enemy.pos, target.pos, def.radius);
      moveToward(
        enemy.pos,
        aim,
        step,
        aim === target.pos ? def.radius + target.radius + def.attack.range - RANGE_SLACK : 0,
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
    // Footmen find their way round cliffs and water, and go through wall gates (playtest 2).
    const via = (to: Vec) =>
      throughGate(
        state,
        ctx,
        unit.pos,
        walkAim(ctx.blockers, ctx.ways, unit.pos, to, def.radius),
        def.radius,
      );
    if (target) {
      const aim = via(target.pos);
      const stop = def.radius + target.radius + def.attack.range - RANGE_SLACK;
      moveToward(unit.pos, aim, step, aim === target.pos ? stop : 0);
    } else if (unit.following) {
      // Walk with the king, a step behind him.
      const aim = via(state.king.pos);
      const stop = ctx.king.radius + def.radius + FOLLOW_GAP;
      moveToward(unit.pos, aim, step, aim === state.king.pos ? stop : 0);
    } else {
      moveToward(unit.pos, via(unit.post), step);
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
  // Footmen walk through wall gates, never through the wings.
  for (const u of state.units) blockByWalls(state, ctx, u.pos, req(ctx.units, u.type).radius);
  // Nobody on the ground walks over cliffs or water.
  if (ctx.blockers.length > 0) {
    for (const u of state.units) blockByTerrain(ctx.blockers, u.pos, req(ctx.units, u.type).radius);
    for (const e of state.enemies) {
      const def = req(ctx.enemies, e.type);
      if (!def.flying) blockByTerrain(ctx.blockers, e.pos, def.radius);
    }
  }
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
