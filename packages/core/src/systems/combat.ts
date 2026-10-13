import type { Attack } from '@kd/content';
import { secondsToTicks } from '../constants.ts';
import { req, type GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, Ref } from '../state.ts';
import type { Vec } from '../vec.ts';
import { dist } from '../vec.ts';
import { enemyTargets, gap, nearest, playerTargets, resolve, type Target } from './targets.ts';

/**
 * Every attacker whose cooldown is over hits its target if it is in range.
 * Fixed order: king, buildings, units, enemies (each in id order). Damage lands immediately;
 * an attacker killed earlier in the same tick no longer attacks (hp is checked first).
 */
export function combatSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const enemies = enemyTargets(state, ctx);
  const mine = playerTargets(state, ctx);

  const king = state.king;
  if (king.alive) {
    tickDown(king);
    const atk = ctx.weapon.attack;
    if (king.cooldown <= 0) {
      const target = nearest(king.pos, ctx.weapon.radius, atk.range, atk.targets, enemies);
      if (target) strike({ kind: 'king' }, king, atk, target, enemies, events);
    }
  }

  for (const b of state.buildings) {
    const atk = req(ctx.buildings, b.type).attack;
    if (b.destroyed || !atk) continue;
    tickDown(b);
    if (b.cooldown > 0) continue;
    const target = nearest(
      b.pos,
      req(ctx.buildings, b.type).radius,
      atk.range,
      atk.targets,
      enemies,
    );
    if (target) strike({ kind: 'building', id: b.id }, b, atk, target, enemies, events);
  }

  for (const u of state.units) {
    if (u.hp <= 0) continue;
    const def = req(ctx.units, u.type);
    tickDown(u);
    if (u.cooldown > 0 || !u.target) continue;
    const target = resolve(state, ctx, u.target);
    if (target && gap(u.pos, def.radius, target) <= def.attack.range) {
      strike({ kind: 'unit', id: u.id }, u, def.attack, target, enemies, events);
    }
  }

  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = req(ctx.enemies, e.type);
    tickDown(e);
    if (e.cooldown > 0 || !e.target) continue;
    const target = resolve(state, ctx, e.target);
    if (target && gap(e.pos, def.radius, target) <= def.attack.range) {
      strike({ kind: 'enemy', id: e.id }, e, def.attack, target, mine, events);
    }
  }
}

function tickDown(attacker: { cooldown: number }): void {
  if (attacker.cooldown > 0) attacker.cooldown--;
}

function strike(
  ref: Ref,
  attacker: { cooldown: number },
  atk: Attack,
  target: Target,
  splashPool: readonly Target[],
  events: GameEvent[],
): void {
  attacker.cooldown = secondsToTicks(atk.interval, 1);
  hit(ref, target, atk.damage, events);
  if (atk.aoe > 0) {
    for (const other of splashPool) {
      if (other === target || other.body.hp <= 0 || !atk.targets.includes(other.layer)) continue;
      if (within(target.pos, other, atk.aoe)) hit(ref, other, atk.damage, events);
    }
  }
}

function within(center: Vec, other: Target, radius: number): boolean {
  return dist(center, other.pos) - other.radius <= radius;
}

function hit(attacker: Ref, target: Target, damage: number, events: GameEvent[]): void {
  target.body.hp = Math.max(0, target.body.hp - damage);
  events.push({ type: 'hit', attacker, target: target.ref, damage });
}
