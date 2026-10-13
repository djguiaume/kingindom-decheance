/**
 * The Phaser scene: draws the core's state every frame in a 3/4 view (design 11 §9). It never
 * writes to GameState (ADR-004); input lives in the adapters (input/), not here.
 * Rules use the flat 2D plane; the 3/4 look is only a vertical squash plus shapes that stand up
 * from the ground, drawn back to front.
 */
import Phaser from 'phaser';
import { telegraph, type Ref } from '@kd/core';
import { nearbySlotId } from '../stores/hud.ts';
import { colors } from '../theme.ts';
import type { CameraView } from './camera.ts';
import { SCALE, SQUASH } from './camera.ts';
import type { GameRuntime } from './runtime.ts';
import { shadow, spriteFor } from './sprites.ts';

const HIT_FLASH_MS = 90;
const SHOT_MS = 180;
const DOUBLE_TAP_MS = 300;
/** How far the camera looks ahead of a moving king, and how quickly it gets there. */
const LEAD_PX = 2.5 * SCALE;
const LEAD_EASE_MS = 300;

export interface ViewOptions {
  zoomClose: () => boolean;
  toggleZoom: () => void;
  /** Updated every frame for the DOM overlays (edge arrows). */
  camera: CameraView;
}

/** How long the ring of a boss stomp stays visible. */
const STOMP_MS = 350;

interface Flash {
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  /** Towers and the castle fire a visible bolt; everyone else shows a short strike line. */
  shot: boolean;
}

export class PlayScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Graphics;
  private flashes: Flash[] = [];
  private unsubscribe: (() => void) | null = null;
  private lastTap = 0;
  private lead = { x: 0, y: 0 };
  private stomps: { at: { x: number; y: number }; radius: number; start: number }[] = [];

  constructor(
    private readonly runtime: GameRuntime,
    private readonly view: ViewOptions,
  ) {
    super('play');
  }

  create(): void {
    this.drawStatic();
    this.dynamic = this.add.graphics();
    const [w, h] = this.runtime.ctx.map.size;
    this.cameras.main.setBounds(0, 0, w * SCALE, h * SCALE * SQUASH);
    this.cameras.main.setBackgroundColor(colors.background);

    // View-only gestures: double-tap / double-click the map or use the wheel to switch zoom.
    this.input.on('pointerup', () => {
      const now = this.time.now;
      if (now - this.lastTap < DOUBLE_TAP_MS) this.view.toggleZoom();
      this.lastTap = now;
    });
    this.input.on('wheel', () => this.view.toggleZoom());

    this.unsubscribe = this.runtime.onEvents((events) => {
      for (const e of events) {
        if (e.type === 'stomp') {
          const enemy = this.runtime.state.enemies.find((x) => x.id === e.enemy);
          const ability = enemy && this.runtime.ctx.enemies.get(enemy.type)?.ability;
          if (enemy && ability)
            this.stomps.push({
              at: { ...enemy.pos },
              radius: ability.radius,
              start: this.time.now,
            });
          continue;
        }
        if (e.type !== 'hit') continue;
        const from = this.refPos(e.attacker);
        const to = this.refPos(e.target);
        if (!from || !to) continue;
        const shot = e.attacker.kind === 'building' || e.attacker.kind === 'castle';
        this.flashes.push({ from, to, start: this.time.now, shot });
      }
    });
    this.events.once('shutdown', () => this.unsubscribe?.());
  }

  override update(_time: number, delta: number): void {
    this.runtime.advance(delta);
    this.updateCamera(delta);
    const cam = this.cameras.main;
    Object.assign(this.view.camera, {
      left: cam.worldView.x,
      top: cam.worldView.y,
      zoom: cam.zoom,
      width: cam.width,
      height: cam.height,
    });
    this.drawDynamic();
  }

  /** Ground point of a world position, in scene pixels. */
  private px(p: { x: number; y: number }) {
    return { x: p.x * SCALE, y: p.y * SCALE * SQUASH };
  }

  private updateCamera(deltaMs: number): void {
    const cam = this.cameras.main;
    const [w, h] = this.runtime.ctx.map.size;
    const fit = Math.min(cam.width / (w * SCALE), cam.height / (h * SCALE * SQUASH));
    // Close zoom: 1 m = 32 CSS px, but never so close that a small phone shows almost nothing.
    const close = Math.max(fit, Math.min(1, cam.height / (16 * SCALE * SQUASH)));
    const target = this.view.zoomClose() ? close : fit;
    cam.setZoom(cam.zoom + (target - cam.zoom) * 0.15);
    const king = this.runtime.state.king;
    const k = this.px(this.runtime.drawPos('king', king.pos));
    // A small lead in the movement direction shows more of what is ahead. It eases in and out
    // so starting or releasing the stick never makes the view (and the king on it) jump.
    const ease = 1 - Math.exp(-deltaMs / LEAD_EASE_MS);
    this.lead.x += (king.intent.x * LEAD_PX - this.lead.x) * ease;
    this.lead.y += (king.intent.y * LEAD_PX * SQUASH - this.lead.y) * ease;
    cam.centerOn(k.x + this.lead.x, k.y + this.lead.y);
  }

  private drawStatic(): void {
    const ctx = this.runtime.ctx;
    const [w, h] = ctx.map.size;
    const g = this.add.graphics();
    g.fillStyle(colors.grass, 1);
    g.fillRect(0, 0, w * SCALE, h * SCALE * SQUASH);
    for (const lane of ctx.lanes.values()) {
      if (lane.air) continue;
      g.lineStyle(SCALE * 1.4, colors.lane, 1);
      for (let i = 1; i < lane.points.length; i++) {
        const a = this.px(lane.points[i - 1]!);
        const b = this.px(lane.points[i]!);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.fillStyle(colors.lane, 1);
        g.fillCircle(b.x, b.y, SCALE * 0.7);
      }
    }
    for (const lane of ctx.lanes.values()) {
      const s = this.px(lane.points[0]!);
      g.fillStyle(lane.air ? colors.enemies.flyer : colors.enemies.swarm, 0.6);
      g.fillCircle(s.x, s.y, SCALE * 0.8);
    }
    for (const node of ctx.map.nodes) {
      if (!node.slot) continue;
      const p = this.px({ x: node.pos[0], y: node.pos[1] });
      g.lineStyle(2, colors.slot, 0.9);
      g.strokeEllipse(p.x, p.y, SCALE * 1.8, SCALE * 1.8 * SQUASH);
    }
  }

  private drawDynamic(): void {
    const { state, ctx } = this.runtime;
    const g = this.dynamic;
    g.clear();

    if (state.phase === 'night') {
      // Moonlit, never black (design 11 §9): tint the ground, keep actors bright.
      const [w, h] = ctx.map.size;
      g.fillStyle(colors.night, 0.35);
      g.fillRect(0, 0, w * SCALE, h * SCALE * SQUASH);
    }

    // By day, the spawns of tonight's lanes glow (off-screen ones get edge arrows instead).
    if (state.phase === 'day') {
      const pulse = 0.35 + 0.25 * Math.sin(this.time.now / 250);
      for (const lane of new Set(telegraph(ctx, state.day).map((t) => t.lane))) {
        const p = this.px(ctx.lanes.get(lane)!.points[0]!);
        g.fillStyle(colors.enemies.swarm, pulse);
        g.fillEllipse(p.x, p.y, SCALE * 3, SCALE * 3 * SQUASH);
      }
    }

    // Range circle at the slot the king stands at, during the day.
    const slot = state.phase === 'day' ? nearbySlotId(state, ctx) : null;
    if (slot) {
      const built = state.buildings.find((b) => b.slot === slot);
      const node = ctx.map.nodes.find((n) => n.id === slot)!;
      const def = ctx.buildings.get(built?.type ?? node.slot!.options[0]!);
      const p = this.px(ctx.nodes.get(slot)!);
      g.lineStyle(3, colors.castle, 0.9);
      g.strokeEllipse(p.x, p.y, SCALE * 2, SCALE * 2 * SQUASH);
      if (def?.attack) {
        const r = (def.attack.range + def.radius) * SCALE;
        g.lineStyle(2, colors.buildings.tower, 0.5);
        g.strokeEllipse(p.x, p.y, r * 2, r * 2 * SQUASH);
      }
    }

    // Everything that stands up is drawn back to front (painter's order by ground y).
    const items: { y: number; draw: () => void }[] = [];
    const add = (
      pos: { x: number; y: number },
      radius: number,
      id: string,
      alpha = 1,
      hp?: [number, number],
    ) => {
      const p = this.px(pos);
      const s = radius * SCALE;
      items.push({
        y: p.y,
        draw: () => {
          shadow(g, p.x, p.y, s);
          spriteFor(id)(g, p.x, p.y, s, alpha);
          if (hp && hp[0] < hp[1]) this.hpBar(p.x, p.y - s * 3.2, s, hp[0], hp[1]);
        },
      });
    };

    add(state.castle.pos, state.castle.radius, 'castle', 1, [state.castle.hp, state.castle.maxHp]);
    for (const b of state.buildings) {
      const def = ctx.buildings.get(b.type)!;
      add(
        b.pos,
        def.radius,
        b.type,
        b.destroyed ? 0.3 : 1,
        b.destroyed ? undefined : [b.hp, b.maxHp],
      );
    }
    for (const u of state.units) {
      add(this.runtime.drawPos(`u${u.id}`, u.pos), ctx.units.get(u.type)!.radius, u.type, 1, [
        u.hp,
        u.maxHp,
      ]);
    }
    for (const e of state.enemies) {
      add(this.runtime.drawPos(`e${e.id}`, e.pos), ctx.enemies.get(e.type)!.radius, e.type, 1, [
        e.hp,
        e.maxHp,
      ]);
    }
    if (state.king.alive) {
      add(this.runtime.drawPos('king', state.king.pos), ctx.king.radius, 'king', 1, [
        state.king.hp,
        state.king.maxHp,
      ]);
    }
    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();

    const now = this.time.now;
    this.stomps = this.stomps.filter((st) => now - st.start < STOMP_MS);
    for (const st of this.stomps) {
      const t = (now - st.start) / STOMP_MS;
      const p = this.px(st.at);
      const r = st.radius * SCALE * (0.4 + 0.6 * t);
      g.lineStyle(4, colors.enemies.boss, 1 - t);
      g.strokeEllipse(p.x, p.y, r * 2, r * 2 * SQUASH);
    }
    this.flashes = this.flashes.filter((f) => now - f.start < (f.shot ? SHOT_MS : HIT_FLASH_MS));
    for (const f of this.flashes) {
      if (!f.shot) {
        g.lineStyle(3, colors.hit, 0.85);
        g.lineBetween(f.from.x, f.from.y - SCALE * 0.6, f.to.x, f.to.y - SCALE * 0.6);
        continue;
      }
      // A bolt flies from the top of the tower to the target. The damage is already dealt in
      // the core; this only shows where it came from.
      const t = (now - f.start) / SHOT_MS;
      const ax = f.from.x;
      const ay = f.from.y - SCALE * 1.8;
      const bx = f.to.x;
      const by = f.to.y - SCALE * 0.5;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1;
      const tail = SCALE * 0.6;
      g.lineStyle(3, colors.shot, 1);
      g.lineBetween(x - ((bx - ax) / len) * tail, y - ((by - ay) / len) * tail, x, y);
    }
  }

  private hpBar(x: number, y: number, s: number, hp: number, max: number): void {
    const g = this.dynamic;
    const w = Math.max(24, s * 2);
    g.fillStyle(colors.hpBack, 0.6);
    g.fillRect(x - w / 2, y, w, 4);
    g.fillStyle(colors.hpBar, 1);
    g.fillRect(x - w / 2, y, (w * hp) / max, 4);
  }

  private refPos(ref: Ref): { x: number; y: number } | null {
    const s = this.runtime.state;
    const at = (p: { x: number; y: number } | undefined) => (p ? this.px(p) : null);
    switch (ref.kind) {
      case 'king':
        return at(s.king.pos);
      case 'castle':
        return at(s.castle.pos);
      case 'building':
        return at(s.buildings.find((x) => x.id === ref.id)?.pos);
      case 'unit':
        return at(s.units.find((x) => x.id === ref.id)?.pos);
      case 'enemy':
        return at(s.enemies.find((x) => x.id === ref.id)?.pos);
    }
  }
}
