/**
 * The Phaser scene: draws the core's state every frame and turns keys into commands.
 * It never writes to GameState (ADR-004). Placeholder look: flat shapes, one colour per role.
 */
import Phaser from 'phaser';
import type { Ref } from '@kd/core';
import { colors } from '../theme.ts';
import type { GameRuntime } from './runtime.ts';

/** Pixels per map unit. */
export const SCALE = 20;
const HIT_FLASH_MS = 90;

interface Flash {
  from: { x: number; y: number };
  to: { x: number; y: number };
  until: number;
}

export class PlayScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Graphics;
  private keys!: Record<
    'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd',
    Phaser.Input.Keyboard.Key
  >;
  private lastIntent = { x: 0, y: 0 };
  private flashes: Flash[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly runtime: GameRuntime) {
    super('play');
  }

  create(): void {
    this.drawStatic();
    this.dynamic = this.add.graphics();
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      w: kb.addKey(K.W),
      a: kb.addKey(K.A),
      s: kb.addKey(K.S),
      d: kb.addKey(K.D),
    };
    // Cosmetic only: hit events become short flashes.
    this.unsubscribe = this.runtime.onEvents((events) => {
      for (const e of events) {
        if (e.type !== 'hit') continue;
        const from = this.refPos(e.attacker);
        const to = this.refPos(e.target);
        if (from && to) this.flashes.push({ from, to, until: this.time.now + HIT_FLASH_MS });
      }
    });
    this.events.once('shutdown', () => this.unsubscribe?.());
  }

  override update(_time: number, delta: number): void {
    this.readInput();
    this.runtime.advance(delta);
    this.drawDynamic();
  }

  private readInput(): void {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    // Only send a command when the direction changes: keeps the command log small.
    if (x !== this.lastIntent.x || y !== this.lastIntent.y) {
      this.lastIntent = { x, y };
      this.runtime.submit({ type: 'moveKing', x, y });
    }
  }

  private px(p: { x: number; y: number }) {
    const b = this.runtime.ctx.bounds;
    return { x: (p.x - b.minX) * SCALE, y: (p.y - b.minY) * SCALE };
  }

  private drawStatic(): void {
    const ctx = this.runtime.ctx;
    const g = this.add.graphics();
    for (const lane of ctx.lanes.values()) {
      g.lineStyle(lane.air ? 3 : 10, lane.air ? colors.airLane : colors.lane, lane.air ? 0.6 : 1);
      for (let i = 1; i < lane.points.length; i++) {
        const a = this.px(lane.points[i - 1]!);
        const b = this.px(lane.points[i]!);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    for (const node of ctx.map.nodes) {
      if (!node.slot) continue;
      const p = this.px({ x: node.pos[0], y: node.pos[1] });
      g.lineStyle(1, colors.slot, 1);
      g.strokeCircle(p.x, p.y, SCALE * 0.7);
      this.add
        .text(p.x, p.y + SCALE * 0.9, node.id.replace('slot-', ''), {
          fontSize: '10px',
          color: '#8a99b3',
        })
        .setOrigin(0.5, 0);
    }
  }

  private drawDynamic(): void {
    const { state, ctx } = this.runtime;
    const g = this.dynamic;
    g.clear();

    const castle = this.px(state.castle.pos);
    g.fillStyle(colors.castle, 1);
    g.fillRect(
      castle.x - state.castle.radius * SCALE,
      castle.y - state.castle.radius * SCALE,
      state.castle.radius * 2 * SCALE,
      state.castle.radius * 2 * SCALE,
    );
    this.hpBar(castle, state.castle.radius, state.castle.hp, state.castle.maxHp);

    for (const b of state.buildings) {
      const def = ctx.buildings.get(b.type)!;
      const p = this.px(b.pos);
      const r = def.radius * SCALE;
      g.fillStyle(colors.buildings[def.class], b.destroyed ? 0.25 : 1);
      if (def.class === 'wall') g.fillRect(p.x - r, p.y - r * 0.5, r * 2, r);
      else g.fillCircle(p.x, p.y, r);
      if (def.attack && state.phase === 'day') {
        g.lineStyle(1, colors.buildings.tower, 0.25);
        g.strokeCircle(p.x, p.y, (def.attack.range + def.radius) * SCALE);
      }
      if (!b.destroyed && b.hp < b.maxHp) this.hpBar(p, def.radius, b.hp, b.maxHp);
    }

    for (const u of state.units) {
      const def = ctx.units.get(u.type)!;
      const p = this.px(this.runtime.drawPos(`u${u.id}`, u.pos));
      g.fillStyle(colors.unit, 1);
      g.fillCircle(p.x, p.y, def.radius * SCALE);
    }

    for (const e of state.enemies) {
      const def = ctx.enemies.get(e.type)!;
      const p = this.px(this.runtime.drawPos(`e${e.id}`, e.pos));
      g.fillStyle(colors.enemies[def.archetype], 1);
      if (def.flying)
        g.fillTriangle(
          p.x,
          p.y - def.radius * SCALE * 1.3,
          p.x - def.radius * SCALE,
          p.y + def.radius * SCALE,
          p.x + def.radius * SCALE,
          p.y + def.radius * SCALE,
        );
      else g.fillCircle(p.x, p.y, def.radius * SCALE);
      if (e.hp < e.maxHp) this.hpBar(p, def.radius, e.hp, e.maxHp);
    }

    const king = state.king;
    if (king.alive) {
      const p = this.px(this.runtime.drawPos('king', king.pos));
      g.fillStyle(colors.king, 1);
      g.fillCircle(p.x, p.y, ctx.weapon.radius * SCALE);
      g.lineStyle(2, colors.castle, 1);
      g.strokeCircle(p.x, p.y, ctx.weapon.radius * SCALE);
      if (king.hp < king.maxHp) this.hpBar(p, ctx.weapon.radius, king.hp, king.maxHp);
    }

    const now = this.time.now;
    this.flashes = this.flashes.filter((f) => f.until > now);
    g.lineStyle(2, colors.hit, 0.8);
    for (const f of this.flashes) g.lineBetween(f.from.x, f.from.y, f.to.x, f.to.y);
  }

  private hpBar(p: { x: number; y: number }, radius: number, hp: number, max: number): void {
    const g = this.dynamic;
    const w = Math.max(16, radius * 2 * SCALE);
    const y = p.y - radius * SCALE - 6;
    g.fillStyle(colors.hpBack, 0.6);
    g.fillRect(p.x - w / 2, y, w, 3);
    g.fillStyle(colors.hpBar, 1);
    g.fillRect(p.x - w / 2, y, (w * hp) / max, 3);
  }

  private refPos(ref: Ref): { x: number; y: number } | null {
    const s = this.runtime.state;
    switch (ref.kind) {
      case 'king':
        return this.px(s.king.pos);
      case 'castle':
        return this.px(s.castle.pos);
      case 'building': {
        const b = s.buildings.find((x) => x.id === ref.id);
        return b ? this.px(b.pos) : null;
      }
      case 'unit': {
        const u = s.units.find((x) => x.id === ref.id);
        return u ? this.px(u.pos) : null;
      }
      case 'enemy': {
        const e = s.enemies.find((x) => x.id === ref.id);
        return e ? this.px(e.pos) : null;
      }
    }
  }
}
