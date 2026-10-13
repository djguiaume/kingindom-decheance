import type { Attack } from '@kd/content';
import { secondsToTicks } from '../constants.ts';
import { req, type GameContext } from '../context.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, Ref } from '../state.ts';
import { cosDegrees, dist, type Vec } from '../vec.ts';
import { enemyTargets, gap, nearest, playerTargets, resolve, type Target } from './targets.ts';

/**
 * Every attacker whose cooldown is over hits if a target is in range.
 * Fixed order: king, castle, buildings, units, enemies (each in id order). Damage lands
 * immediately; an attacker killed earlier in the same tick no longer attacks (hp is checked).
 */
export function combatSystem(state: GameState, ctx: GameContext, events: GameEvent[]): void {
  const enemies = enemyTargets(state, ctx);
  const mine = playerTargets(state, ctx);

  const king = state.king;
  if (king.alive && !king.dash) {
    tickDown(king);
    const atk = ctx.weapon.attack;
    if (king.cooldown <= 0) {
      const first = nearest(king.pos, ctx.king.radius, atk.range, atk.targets, enemies);
      if (first) strike(state, { kind: 'king' }, king, king.pos, ctx.king.radius, atk, first, enemies, events);
    }
  }

  const castleAtk = ctx.map.castle.attack;
  const castle = state.castle;
  if (castleAtk && castle.hp > 0) {
    tickDown(castle);
    if (castle.cooldown <= 0) {
      const first = nearest(castle.pos, castle.radius, castleAtk.range, castleAtk.targets, enemies);
      if (first) strike(state, { kind: 'castle' }, castle, castle.pos, castle.radius, castleAtk, first, enemies, events);
    }
  }

  for (const b of state.buildings) {
    const def = req(ctx.buildings, b.type);
    const atk = def.attack;
    if (b.destroyed || !atk) continue;
    tickDown(b);
    if (b.cooldown > 0) continue;
    const first = nearest(b.pos, def.radius, atk.range, atk.targets, enemies);
    if (first) strike(state, { kind: 'building', id: b.id }, b, b.pos, def.radius, atk, first, enemies, events);
  }

  for (const u of state.units) {
    if (u.hp <= 0) continue;
    const def = req(ctx.units, u.type);
    tickDown(u);
    if (u.cooldown > 0 || !u.target) continue;
    const target = resolve(state, ctx, u.target);
    if (target && gap(u.pos, def.radius, target) <= def.attack.range) {
      strike(state, { kind: 'unit', id: u.id }, u, u.pos, def.radius, def.attack, target, enemies, events);
    }
  }

  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = req(ctx.enemies, e.type);
    tickDown(e);
    if (e.cooldown > 0 || !e.target) continue;
    const target = resolve(state, ctx, e.target);
    if (target && gap(e.pos, def.radius, target) <= def.attack.range) {
      strike(state, { kind: 'enemy', id: e.id }, e, e.pos, def.radius, def.attack, target, mine, events);
    }
  }
}

function tickDown(attacker: { cooldown: number }): void {
  if (attacker.cooldown > 0) attacker.cooldown--;
}

/**
 * One attack: hits `first`, then up to `maxTargets - 1` more of the nearest targets in range
 * that lie within the attack's arc around the direction of `first`, then splash (aoe).
 */
function strike(
  state: GameState,
  ref: Ref,
  attacker: { cooldown: number },
  pos: Vec,
  radius: number,
  atk: Attack,
  first: Target,
  pool: readonly Target[],
  events: GameEvent[],
): void {
  attacker.cooldown = secondsToTicks(atk.interval, 1);
  const struck: Target[] = [first];

  if (atk.maxTargets > 1) {
    const minDot = atk.arc >= 360 ? -Infinity : cosDegrees(atk.arc / 2);
    const fx = first.pos.x - pos.x;
    const fy = first.pos.y - pos.y;
    const fLen = Math.sqrt(fx * fx + fy * fy) || 1;
    const extras = pool
      .filter((t) => t !== first && t.body.hp > 0 && atk.targets.includes(t.layer))
      .map((t) => ({ t, g: gap(pos, radius, t) }))
      .filter(({ t, g }) => {
        if (g > atk.range) return false;
        const tx = t.pos.x - pos.x;
        const ty = t.pos.y - pos.y;
        const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
        return (fx * tx + fy * ty) / (fLen * tLen) >= minDot;
      })
      .sort((a, b) => a.g - b.g) // stable: ties keep id order
      .slice(0, atk.maxTargets - 1);
    struck.push(...extras.map((e) => e.t));
  }

  for (const target of struck) hit(state, ref, target, damageFor(atk, target), events);

  if (atk.aoe > 0) {
    for (const other of pool) {
      if (struck.includes(other) || other.body.hp <= 0 || !atk.targets.includes(other.layer)) continue;
      if (dist(first.pos, other.pos) - other.radius <= atk.aoe) hit(state, ref, other, damageFor(atk, other), events);
    }
  }
}

function damageFor(atk: Attack, target: Target): number {
  const bonus = target.archetype ? atk.bonus[target.archetype] : undefined;
  return atk.damage * (bonus ?? 1);
}

export function hit(state: GameState, attacker: Ref, target: Target, damage: number, events: GameEvent[]): void {
  target.body.hp = Math.max(0, target.body.hp - damage);
  if (target.ref.kind === 'king') state.king.calm = 0;
  events.push({ type: 'hit', attacker, target: target.ref, damage });
}
