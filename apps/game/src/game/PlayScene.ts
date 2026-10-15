/**
 * The Phaser scene: draws the core's state every frame in a 3/4 view (design 11 §9). It never
 * writes to GameState (ADR-004); input lives in the adapters (input/), not here.
 * Rules use the flat 2D plane; the 3/4 look is only a vertical squash plus shapes that stand up
 * from the ground, drawn back to front.
 */
import Phaser from 'phaser';
import {
  atCastle,
  GATE_HALF_WIDTH,
  guardSpot,
  telegraph,
  WALL_HALF_SPAN,
  wallLine,
  type BuildingState,
  type Ref,
  type Vec,
} from '@kd/core';
import { nearbySlotId } from '../stores/hud.ts';
import { colors } from '../theme.ts';
import type { CameraView } from './camera.ts';
import { SCALE, SQUASH } from './camera.ts';
import type { GameRuntime } from './runtime.ts';
import {
  Animator,
  fallAt,
  keyOf,
  STRIDE_M,
  strideFor,
  KingActions,
  type Pose,
} from './animation.ts';
import { Art, ART_PX_PER_M, CATAPULT_ARM, HAND, loadArt, weaponAngle } from './art.ts';
import { Painter } from './painter.ts';
import { addCliffs, CLIFF_TEXTURE, type CliffSprite } from './cliffs.ts';
import { bobHeight, shadow, spriteFor } from './sprites.ts';
import { addPaintedTerrain, drawTerrain, paintedPropFrame, propNeedsDepth } from './terrain.ts';
import { emptyPlotIds, gateIsOpen, projectileFrame, ruinFrame } from './presentation.ts';
import { gatePlacement, gateView, GATE_RIGS, groundOrigin } from './groundRigs.ts';

const HIT_FLASH_MS = 160;
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
  /** Canvas offset below the night toolbar, in CSS pixels. */
  topInset: () => number;
}

/** Scene pixels per art pixel at the art's own scale (1 m = 64 px). */
const ART_SCALE = SCALE / ART_PX_PER_M;
/**
 * How big the art is drawn, relative to its painted size: characters a little smaller so crowds
 * stay readable, buildings so neighbouring slots (3 m apart) do not overlap much.
 */
const ACTOR_SIZE = 0.85;
const BUILDING_SIZE = 0.85;
/** A painted building the king walks behind turns see-through, so he never disappears. */
const SEE_THROUGH = 0.45;

/** How long the ring of a boss stomp stays visible. */
const STOMP_MS = 350;
/** Length of a drawn arrow, in ticks of its flight (it looks about 1 m long at archer speed). */
const ARROW_LENGTH = 4;
/** How long the dust of a shot that missed stays visible. */
const PUFF_MS = 300;
/** Shots by these enemies are lobbed high, with a shadow where they will land. */
const LOBBED = new Set(['catapult']);

interface Flash {
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  /** Towers and the castle fire a visible bolt; everyone else shows a short strike line. */
  shot: boolean;
  source: string;
}

export class PlayScene extends Phaser.Scene {
  /** Draws each frame back to front, shapes and art mixed. */
  private painter!: Painter;
  /** The panda art that loaded; ids without art keep their code-drawn shapes. */
  private art = new Art([]);
  private flashes: Flash[] = [];
  private unsubscribe: (() => void) | null = null;
  private lastTap = 0;
  private lead = { x: 0, y: 0 };
  private stomps: { at: { x: number; y: number }; radius: number; start: number }[] = [];
  private puffs: { at: { x: number; y: number }; start: number }[] = [];
  /** Who fired each shot in flight (the shooter may die before it lands). */
  private shooters = new Map<number, string>();
  /** Types before the current tick: a shooter can die in the same tick it fires. */
  private sourceTypes = new Map<string, string>();
  /** Walk bob, swings, hit flashes and falling bodies (view-only). */
  private animator = new Animator();
  private kingActions = new KingActions();
  private animationNow = 0;
  private session: GameRuntime['session'] | null = null;
  private paintedPropKinds = new Set<string>();
  private paintedCliffs = false;
  /** The painted cliffs, cut into pieces that sort with everything standing up. */
  private cliffPieces: CliffSprite[] = [];

  constructor(
    private readonly runtime: GameRuntime,
    private readonly view: ViewOptions,
  ) {
    super('play');
  }

  preload(): void {
    loadArt(this.load);
  }

  create(): void {
    this.art = Art.fromTextures(this.textures);
    this.painter = new Painter(this);
    this.drawStatic();
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
        if (e.type === 'enemySpawned') this.sourceTypes.set(`e${e.id}`, e.enemy);
        if (e.type === 'unitSpawned') this.sourceTypes.set(`u${e.id}`, e.unit);
      }
      this.animator.onEvents(
        events,
        this.animationNow,
        (ref) => this.refWorld(ref),
        (id) => this.runtime.state.projectiles.find((p) => p.id === id)?.to ?? null,
      );
      for (const e of events) {
        if (e.type === 'stomp') {
          const enemy = this.runtime.state.enemies.find((x) => x.id === e.enemy);
          const ability = enemy && this.runtime.ctx.enemies.get(enemy.type)?.ability;
          if (enemy && ability)
            this.stomps.push({
              at: { ...enemy.pos },
              radius: ability.radius,
              start: this.animationNow,
            });
          continue;
        }
        if (e.type === 'fired') {
          this.shooters.set(e.id, this.sourceType(e.attacker));
          continue;
        }
        if (e.type === 'missed') {
          this.shooters.delete(e.id);
          this.puffs.push({ at: this.px(e.at), start: this.animationNow });
          continue;
        }
        // A shot that flew has already been drawn in flight.
        if (e.type !== 'hit' || e.projectile) continue;
        const from = this.refPos(e.attacker);
        const to = this.refPos(e.target);
        if (!from || !to) continue;
        const shot = e.attacker.kind === 'building' || e.attacker.kind === 'castle';
        this.flashes.push({
          from,
          to,
          start: this.animationNow,
          shot,
          source: this.sourceType(e.attacker),
        });
      }
    });
    this.events.once('shutdown', () => this.unsubscribe?.());
  }

  override update(_time: number, delta: number): void {
    if (this.session !== this.runtime.session) {
      this.session = this.runtime.session;
      this.animator = new Animator();
      this.kingActions = new KingActions();
      this.flashes = [];
      this.stomps = [];
      this.puffs = [];
      this.shooters.clear();
      this.animationNow = 0;
    }
    if (!this.runtime.paused) this.animationNow += delta;
    this.sourceTypes.clear();
    for (const e of this.runtime.state.enemies) this.sourceTypes.set(`e${e.id}`, e.type);
    for (const u of this.runtime.state.units) this.sourceTypes.set(`u${u.id}`, u.type);
    for (const b of this.runtime.state.buildings) this.sourceTypes.set(`b${b.id}`, b.type);
    this.runtime.advance(delta);
    this.updateCamera(delta);
    const cam = this.cameras.main;
    Object.assign(this.view.camera, {
      left: cam.worldView.x,
      top: cam.worldView.y,
      zoom: cam.zoom,
      width: cam.width,
      height: cam.height + this.view.topInset(),
      offsetTop: this.view.topInset(),
    });
    this.drawDynamic();
  }

  private sourceType(ref: Ref): string {
    const state = this.runtime.state;
    switch (ref.kind) {
      case 'enemy':
        return (
          state.enemies.find((e) => e.id === ref.id)?.type ??
          this.sourceTypes.get(`e${ref.id}`) ??
          ''
        );
      case 'unit':
        return (
          state.units.find((u) => u.id === ref.id)?.type ?? this.sourceTypes.get(`u${ref.id}`) ?? ''
        );
      case 'building':
        return (
          state.buildings.find((b) => b.id === ref.id)?.type ??
          this.sourceTypes.get(`b${ref.id}`) ??
          ''
        );
      default:
        return ref.kind;
    }
  }

  /** Shapes drawn now go above every image placed so far this frame. */
  private get dynamic(): Phaser.GameObjects.Graphics {
    return this.painter.g();
  }

  /** Places an atlas frame (known to exist) with its pivot on (x, y). */
  private image(frame: string, x: number, y: number, scale: number): Phaser.GameObjects.Image {
    return this.painter.image(this.art.atlas(frame)!, frame).setPosition(x, y).setScale(scale);
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
    const painted = addPaintedTerrain(this, ctx.map, ctx.lanes.values(), this.art);
    const g = this.add.graphics().setDepth(0);
    if (!painted.ground) {
      g.fillStyle(colors.grass, 1);
      g.fillRect(0, 0, w * SCALE, h * SCALE * SQUASH);
    }
    if (!painted.paths) {
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
    }
    this.paintedPropKinds = new Set(
      ctx.map.terrain.props
        .filter((prop) => paintedPropFrame(this.art, prop.kind))
        .map((prop) => prop.kind),
    );
    this.cliffPieces = addCliffs(this, ctx.map, this.art) ?? [];
    this.paintedCliffs = this.cliffPieces.length > 0 || ctx.map.terrain.cliffs.length === 0;
    drawTerrain(g, ctx.map, {
      water: !painted.water,
      bridges: !painted.bridges,
      cliffs: !this.paintedCliffs,
      paintedProps: this.paintedPropKinds,
    });
    // Ground decoration never occludes an actor. Keep it static; only tall scenery joins the
    // per-frame ground-y sort below.
    for (const prop of ctx.map.terrain.props) {
      if (!this.paintedPropKinds.has(prop.kind) || propNeedsDepth(prop.kind)) continue;
      const frame = paintedPropFrame(this.art, prop.kind)!;
      const p = this.px({ x: prop.pos[0], y: prop.pos[1] });
      this.add
        .image(p.x, p.y, this.art.atlas(frame)!, frame)
        .setDepth(1)
        .setScale(ART_SCALE * prop.scale)
        .setFlipX(Boolean(prop.flip));
    }
    for (const lane of ctx.lanes.values()) {
      const s = this.px(lane.points[0]!);
      g.fillStyle(lane.air ? colors.enemies.flyer : colors.enemies.swarm, 0.6);
      g.fillCircle(s.x, s.y, SCALE * 0.8);
    }
  }

  private drawDynamic(): void {
    const { state, ctx } = this.runtime;
    this.painter.begin();
    let g = this.dynamic;

    const plot = this.art.still('slot_empty');
    const empty = emptyPlotIds(
      ctx.map.nodes.filter((n) => n.slot).map((n) => n.id),
      state.buildings,
    );
    for (const node of ctx.map.nodes) {
      if (!node.slot || !empty.has(node.id)) continue;
      const p = this.px({ x: node.pos[0], y: node.pos[1] });
      if (plot) {
        // Only empty plots have a foundation marker; buildings carry their own base.
        this.image(plot, p.x, p.y, ART_SCALE * BUILDING_SIZE);
        continue;
      }
      g.lineStyle(2, colors.slot, 0.9);
      g.strokeEllipse(p.x, p.y, SCALE * 1.8, SCALE * 1.8 * SQUASH);
    }

    if (state.phase === 'night') {
      // Moonlit, never black (design 11 §9): tint the ground, keep actors bright.
      const [w, h] = ctx.map.size;
      g.fillStyle(colors.night, 0.35);
      g.fillRect(0, 0, w * SCALE, h * SCALE * SQUASH);
    }

    // By day, the spawns of tonight's lanes glow (off-screen ones get edge arrows instead).
    if (state.phase === 'day') {
      const pulse = 0.35 + 0.25 * Math.sin(this.animationNow / 250);
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
    } else if (state.phase === 'day' && atCastle(state, ctx) && ctx.castle.attack) {
      // At the castle: the reach of its shot, which grows with its level and perks.
      const p = this.px(state.castle.pos);
      const r = (ctx.castle.attack.range + ctx.castle.radius) * SCALE;
      g.lineStyle(2, colors.buildings.tower, 0.5);
      g.strokeEllipse(p.x, p.y, r * 2, r * 2 * SQUASH);
    }

    // Everything that stands up is drawn back to front (painter's order by ground y).
    const items: { y: number; draw: () => void }[] = [];
    // The king's body (a little above his feet), to see him through buildings in front of him.
    const kingAt = state.king.alive ? this.px(this.runtime.drawPos('king', state.king.pos)) : null;
    if (kingAt) kingAt.y -= SCALE * 0.6;
    for (const piece of this.cliffPieces) {
      // The cliff turns see-through where the king walks behind it, as buildings do.
      const hides =
        kingAt !== null &&
        kingAt.y < piece.sortY &&
        kingAt.x >= piece.x &&
        kingAt.x <= piece.x + piece.w &&
        kingAt.y >= piece.y &&
        kingAt.y <= piece.y + piece.h;
      items.push({
        y: piece.sortY,
        draw: () =>
          this.painter
            .image(CLIFF_TEXTURE, piece.frame)
            .setOrigin(0, 0)
            .setPosition(piece.x, piece.y)
            .setAlpha(hides ? SEE_THROUGH : 1),
      });
    }
    for (const prop of ctx.map.terrain.props) {
      if (this.paintedPropKinds.has(prop.kind) && propNeedsDepth(prop.kind)) {
        const frame = paintedPropFrame(this.art, prop.kind)!;
        const p = this.px({ x: prop.pos[0], y: prop.pos[1] });
        items.push({
          y: p.y,
          draw: () =>
            this.image(frame, p.x, p.y, ART_SCALE * prop.scale).setFlipX(Boolean(prop.flip)),
        });
      }
    }
    /** Health bars go over everything, after the sorted items. */
    const bars: (() => void)[] = [];
    const now = this.animationNow;
    /** Animation keys drawn this frame; the animator forgets the others. */
    const seen = new Set<string>();
    /**
     * `key` animates the entity: actors (`actor`) walk, swing, flash and fall; buildings only
     * flash when hit.
     */
    const add = (
      pos: { x: number; y: number },
      radius: number,
      id: string,
      alpha = 1,
      hp?: [number, number],
      key?: string,
      actor = false,
    ) => {
      const p = this.px(pos);
      const s = radius * SCALE;
      let pose: Pose | null = null;
      let flash = 0;
      if (key) {
        seen.add(key);
        if (actor) {
          pose = this.animator.pose(key, pos, { sprite: id, radius }, now);
          flash = pose.flash;
        } else {
          this.animator.still(key, pos);
          flash = this.animator.flash(key, now);
        }
      }
      // Shadows lie on the ground, under everything that stands (painted buildings have
      // their own footing).
      if (pose || !this.art.still(id)) shadow(g, p.x, p.y, s);
      items.push({
        y: p.y,
        draw: () => {
          if (pose) this.drawActor(id, p.x, p.y, s, alpha, pose);
          else this.drawStill(id, p.x, p.y, s, alpha, flash, kingAt);
        },
      });
      if (hp && hp[0] < hp[1]) {
        const top = pose ? s * 3.2 : this.stillHeight(id, s);
        bars.push(() => this.hpBar(p.x, p.y - top, s, hp[0], hp[1]));
      }
    };

    // The castle is drawn bigger at each level (13 §1.1); its footprint in the rules is the same.
    const level = state.castleLevel;
    add(
      state.castle.pos,
      state.castle.radius * (1 + 0.15 * (level - 1)),
      level > 1 ? `castle_${level}` : 'castle',
      1,
      [state.castle.hp, state.castle.maxHp],
    );
    for (const b of state.buildings) {
      const def = ctx.buildings.get(b.type)!;
      if (def.class === 'wall' && this.addWall(items, b)) continue;
      // A destroyed building is a ruin until it is rebuilt.
      const ruin = b.destroyed ? ruinFrame(b.type, (f) => this.art.has(f)) : null;
      add(
        b.pos,
        def.radius,
        ruin ?? b.type,
        b.destroyed && !ruin ? 0.3 : 1,
        b.destroyed ? undefined : [b.hp, b.maxHp],
        `b${b.id}`,
      );
    }
    for (const u of state.units) {
      const key = `u${u.id}`;
      const def = ctx.units.get(u.type)!;
      add(this.runtime.drawPos(key, u.pos), def.radius, u.type, 1, [u.hp, u.maxHp], key, true);
    }
    for (const e of state.enemies) {
      const key = `e${e.id}`;
      const def = ctx.enemies.get(e.type)!;
      add(this.runtime.drawPos(key, e.pos), def.radius, e.type, 1, [e.hp, e.maxHp], key, true);
    }
    if (!state.king.alive) this.kingActions.update(false, false, this.animationNow);
    if (state.king.alive) {
      const hp: [number, number] = [state.king.hp, state.king.maxHp];
      add(
        this.runtime.drawPos('king', state.king.pos),
        ctx.king.radius,
        'king',
        1,
        hp,
        'king',
        true,
      );
    }
    this.animator.prune(seen, now);
    for (const c of this.animator.corpses) {
      const fall = fallAt(now - c.start);
      if (!fall) continue;
      const p = this.px(c.pos);
      const s = c.radius * SCALE;
      items.push({ y: p.y, draw: () => this.drawCorpse(c.sprite, p.x, p.y, s, c.facing, fall) });
    }
    this.addFlags(items);
    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();
    for (const bar of bars) bar();
    this.drawProjectiles();
    g = this.dynamic;

    this.stomps = this.stomps.filter((st) => now - st.start < STOMP_MS);
    for (const st of this.stomps) {
      const t = (now - st.start) / STOMP_MS;
      const p = this.px(st.at);
      const r = st.radius * SCALE * (0.4 + 0.6 * t);
      g.lineStyle(4, colors.enemies.boss, 1 - t);
      g.strokeEllipse(p.x, p.y, r * 2, r * 2 * SQUASH);
    }
    this.puffs = this.puffs.filter((p) => now - p.start < PUFF_MS);
    for (const p of this.puffs) {
      const t = (now - p.start) / PUFF_MS;
      g.fillStyle(0xd8cfb8, 0.6 * (1 - t));
      g.fillEllipse(p.at.x, p.at.y, SCALE * (0.4 + 0.8 * t), SCALE * (0.4 + 0.8 * t) * SQUASH);
    }
    this.flashes = this.flashes.filter((f) => now - f.start < (f.shot ? SHOT_MS : HIT_FLASH_MS));
    for (const f of this.flashes) {
      g = this.dynamic;
      if (!f.shot) {
        // A melee blow: a short slash on the one hit, not a line from the attacker (which read
        // as a projectile that could not be dodged).
        const t = (now - f.start) / HIT_FLASH_MS;
        const cx = f.to.x;
        const cy = f.to.y - SCALE * 0.7;
        const r = SCALE * 0.45;
        const dir = Math.atan2(f.to.y - f.from.y, f.to.x - f.from.x);
        g.lineStyle(3, colors.hit, 0.9 * (1 - t));
        g.beginPath();
        g.arc(cx, cy, r, dir - 1.1, dir + 1.1);
        g.strokePath();
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
      const bolt = this.art.still(projectileFrame(f.source));
      if (bolt) {
        this.image(bolt, x, y, ART_SCALE).setRotation(Math.atan2(by - ay, bx - ax));
        continue;
      }
      const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1;
      const tail = SCALE * 0.6;
      g.lineStyle(3, colors.shot, 1);
      g.lineBetween(x - ((bx - ax) / len) * tail, y - ((by - ay) / len) * tail, x, y);
    }
    this.painter.end();
  }

  /**
   * A wall across its lane (playtest 2, like Thronefall): two wings and a gate in the middle
   * that opens while the king or a footman is near it. Drawn in short pieces so units and
   * enemies on either side sort correctly in front of or behind it. False if the slot is not on
   * a lane (then the plain sprite is drawn).
   */
  private addWall(items: { y: number; draw: () => void }[], b: BuildingState): boolean {
    const { state, ctx } = this.runtime;
    const line = wallLine(ctx, b.slot);
    if (!line) return false;
    const stone = b.type === 'stone_wall';
    const height = (stone ? 1.6 : 1.4) * SCALE;
    const color = stone ? 0x9a9a9a : 0x9b6a3c;
    const alpha = b.destroyed ? 0.3 : 1;
    const at = (k: number, a = 0): Vec => ({
      x: line.at.x + line.across.x * k + line.along.x * a,
      y: line.at.y + line.across.y * k + line.along.y * a,
    });
    const open = gateIsOpen(line.at, b.destroyed, state.king, state.units);

    // Painted walls: a row of stakes (or stone posts) on each wing, and the gate in the view
    // closest to the wall's angle. Each piece is sorted on its own like the slabs.
    const post = this.art.still(stone ? 'stone_wall_post' : 'wall_post');
    const gate = this.gateFrame(stone ? 'gate_stone' : 'gate_wood', line.across, open);
    if (post) {
      const width = this.textures.getFrame(this.art.atlas(post)!, post).cutWidth;
      const step = ((width * ART_SCALE) / SCALE) * 0.85;
      const span = WALL_HALF_SPAN - GATE_HALF_WIDTH;
      const count = Math.max(1, Math.round(span / step));
      for (const sign of [-1, 1])
        for (let i = 0; i < count; i++) {
          const p = this.px(at(sign * (GATE_HALF_WIDTH + (span * (i + 0.5)) / count)));
          items.push({ y: p.y, draw: () => this.image(post, p.x, p.y, ART_SCALE).setAlpha(alpha) });
        }
    }
    if (gate) {
      const p = this.px(line.at);
      const size = this.textures.getFrame(this.art.atlas(gate.frame)!, gate.frame);
      const placement = gatePlacement(
        gate.rig,
        line.across,
        gate.mirror,
        2 * GATE_HALF_WIDTH,
        SCALE,
        SQUASH,
      );
      items.push({
        y: p.y,
        draw: () =>
          this.painter
            .projectedImage(this.art.atlas(gate.frame)!, gate.frame, p.x, p.y, placement.matrix)
            .setOrigin(placement.anchor[0] / size.realWidth, placement.anchor[1] / size.realHeight)
            .setAlpha(alpha),
      });
    }

    const PIECES = 4;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < PIECES && !post; i++) {
        const k0 = sign * (GATE_HALF_WIDTH + ((WALL_HALF_SPAN - GATE_HALF_WIDTH) * i) / PIECES);
        const k1 =
          sign * (GATE_HALF_WIDTH + ((WALL_HALF_SPAN - GATE_HALF_WIDTH) * (i + 1)) / PIECES);
        const a = this.px(at(k0));
        const c = this.px(at(k1));
        items.push({
          y: (a.y + c.y) / 2,
          draw: () => this.slab(at(k0), at(k1), height, color, alpha, stone),
        });
      }
      if (gate) continue;
      // Gate posts, a little taller than the wall.
      const gatePost = at(sign * GATE_HALF_WIDTH);
      items.push({
        y: this.px(gatePost).y + 0.01,
        draw: () =>
          this.slab(
            at(sign * (GATE_HALF_WIDTH - 0.25)),
            at(sign * (GATE_HALF_WIDTH + 0.25)),
            height * 1.25,
            stone ? 0x7d7d7d : 0x7a5230,
            alpha,
            false,
          ),
      });
      // Gate leaves: across the gap when shut, swung in towards the castle when open.
      const hinge = at(sign * (GATE_HALF_WIDTH - 0.25));
      const tip = open ? at(sign * (GATE_HALF_WIDTH - 0.25), GATE_HALF_WIDTH * 0.85) : at(0);
      items.push({
        y: (this.px(hinge).y + this.px(tip).y) / 2,
        draw: () => this.slab(hinge, tip, height * 0.9, 0x6b4423, alpha, false, 0.15),
      });
    }
    if (!b.destroyed && b.hp < b.maxHp) {
      const p = this.px(line.at);
      items.push({
        y: p.y + 0.02,
        draw: () => this.hpBar(p.x, p.y - height * 1.5, SCALE, b.hp, b.maxHp),
      });
    }
    return true;
  }

  /**
   * The painted gate for a wall whose line runs along `across` (metres): face-on when it runs
   * across the screen, the side view when it runs up the screen, the diagonal view (painted
   * running bottom-left to top-right, mirrored for the other diagonal) in between. Null when
   * that view is not painted yet; the gate is then drawn in code.
   */
  private gateFrame(
    base: string,
    across: Vec,
    open: boolean,
  ): { frame: string; mirror: boolean; rig: (typeof GATE_RIGS)[string] } | null {
    const { view, mirror } = gateView(across, SQUASH);
    const name = `${base}${view}`;
    const frame = this.art.at(name, open ? 0.99 : 0);
    const rig = GATE_RIGS[name];
    return frame && rig ? { frame, mirror, rig } : null;
  }

  /** Fills a polygon with the current fill style. */
  private quad(points: { x: number; y: number }[]): void {
    const g = this.dynamic;
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
  }

  /**
   * An upright box standing on the ground segment a→b, `thickness` metres either side of it:
   * the sides that face the viewer, then a lighter top (a cheap 3/4 view of a block).
   */
  private slab(
    a: Vec,
    b: Vec,
    height: number,
    color: number,
    alpha: number,
    battlements: boolean,
    thickness = 0.5,
  ): void {
    const g = this.dynamic;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const n = { x: (-dy / len) * thickness, y: (dx / len) * thickness };
    // Footprint corners in order around the box.
    const foot = [
      { x: a.x + n.x, y: a.y + n.y },
      { x: b.x + n.x, y: b.y + n.y },
      { x: b.x - n.x, y: b.y - n.y },
      { x: a.x - n.x, y: a.y - n.y },
    ].map((p) => this.px(p));
    const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - height });
    g.fillStyle(0x000000, 0.18 * alpha);
    this.quad(foot.map((p) => ({ x: p.x + 3, y: p.y + 3 })));
    // A side faces the viewer when the ground below it is lower on screen than the box centre.
    const cy = foot.reduce((t, p) => t + p.y, 0) / 4;
    for (let i = 0; i < 4; i++) {
      const p = foot[i]!;
      const q = foot[(i + 1) % 4]!;
      if ((p.y + q.y) / 2 < cy - 0.01) continue;
      g.fillStyle(darken(color, Math.abs(p.x - q.x) > Math.abs(p.y - q.y) ? 0.75 : 0.6), alpha);
      this.quad([p, q, up(q), up(p)]);
    }
    g.fillStyle(color, alpha);
    this.quad(foot.map(up));
    if (battlements) {
      g.fillStyle(darken(color, 0.85), alpha);
      for (let f = 0.15; f < 1; f += 0.35) {
        const x =
          (foot[0]!.x +
            (foot[1]!.x - foot[0]!.x) * f +
            foot[3]!.x +
            (foot[2]!.x - foot[3]!.x) * f) /
          2;
        const y =
          (foot[0]!.y +
            (foot[1]!.y - foot[0]!.y) * f +
            foot[3]!.y +
            (foot[2]!.y - foot[3]!.y) * f) /
          2;
        g.fillRect(x - SCALE * 0.2, y - height - SCALE * 0.3, SCALE * 0.4, SCALE * 0.3);
      }
    }
  }

  /**
   * Squad flags (playtest 2): each barracks' flag stands where its squad guards. A flag the
   * king carries, or whose squad follows him, flies over the king instead.
   */
  private addFlags(items: { y: number; draw: () => void }[]): void {
    const { state, ctx } = this.runtime;
    let onKing = 0;
    for (const b of state.buildings) {
      if (b.destroyed || !ctx.buildings.get(b.type)!.spawns) continue;
      const following = state.units.some((u) => u.home === b.id && u.following);
      if (b.carried || following) {
        onKing++;
        continue;
      }
      const p = this.px(guardSpot(ctx, b));
      items.push({ y: p.y, draw: () => this.flag(p.x, p.y, 1) });
    }
    if (onKing > 0 && state.king.alive) {
      const k = this.px(this.runtime.drawPos('king', state.king.pos));
      // Behind the king's shoulder, so it reads as carried.
      items.push({ y: k.y + 0.01, draw: () => this.flag(k.x - SCALE * 0.5, k.y, 0.8) });
    }
  }

  private flag(x: number, y: number, scale: number): void {
    const banner = this.art.still('panda_banner');
    if (banner) {
      this.image(banner, x, y, ART_SCALE * 0.8 * scale);
      return;
    }
    const g = this.dynamic;
    const h = SCALE * 1.8 * scale;
    g.lineStyle(2, 0x5a3b1e, 1);
    g.lineBetween(x, y, x, y - h);
    g.fillStyle(colors.buildings.military, 1);
    g.fillTriangle(
      x,
      y - h,
      x + SCALE * 0.9 * scale,
      y - h + SCALE * 0.3 * scale,
      x,
      y - h + SCALE * 0.6 * scale,
    );
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(x, y, SCALE * 0.5, SCALE * 0.2);
  }

  /** Enemy shots in flight: arrows fly flat and fast, catapult stones arc with a landing shadow. */
  private drawProjectiles(): void {
    const boulder = this.art.still('boulder');
    for (const p of this.runtime.state.projectiles) {
      const g = this.dynamic;
      const lobbed = LOBBED.has(this.shooters.get(p.id) ?? '');
      const at = (t: number) => {
        const ground = this.px({
          x: p.from.x + (p.to.x - p.from.x) * t,
          y: p.from.y + (p.to.y - p.from.y) * t,
        });
        // Metres above the ground: a stone leaves the arm high and lands on the ground; an
        // arrow flies at chest height with a slight arc.
        const lift = lobbed
          ? 1.5 * (1 - t) + 4 * Math.sin(Math.PI * t)
          : 0.8 + 0.6 * Math.sin(Math.PI * t);
        return { x: ground.x, y: ground.y - lift * SCALE };
      };
      const t = 1 - p.ticksLeft / p.flight;
      if (lobbed) {
        const land = this.px(p.to);
        g.fillStyle(0x000000, 0.15 + 0.25 * t);
        g.fillEllipse(land.x, land.y, SCALE * 1.2, SCALE * 1.2 * SQUASH);
        const s = at(t);
        if (boulder) {
          this.image(boulder, s.x, s.y, ART_SCALE).setRotation(t * 6);
          continue;
        }
        g.fillStyle(0x6b6b6b, 1);
        g.fillCircle(s.x, s.y, SCALE * 0.3);
        continue;
      }
      // An arrow: a dark shaft with a head, and its shadow on the ground below, so the player
      // sees where it is going and can step aside.
      const ground = this.px({
        x: p.from.x + (p.to.x - p.from.x) * t,
        y: p.from.y + (p.to.y - p.from.y) * t,
      });
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(ground.x, ground.y, SCALE * 0.35, SCALE * 0.18);
      const head = at(t);
      const tail = at(Math.max(0, t - ARROW_LENGTH / Math.max(1, p.flight)));
      const arrow = this.art.still(projectileFrame(this.shooters.get(p.id) ?? ''));
      if (arrow) {
        // The painted arrow's tip is its right end.
        this.image(arrow, head.x, head.y, ART_SCALE)
          .setOrigin(0.85, 0.5)
          .setRotation(Math.atan2(head.y - tail.y, head.x - tail.x))
          .setTint(p.attacker.kind === 'enemy' ? 0xffffff : 0xc7dcff);
        continue;
      }
      // The player's own archers shoot pale arrows, so they never read as shots to dodge.
      g.lineStyle(4, p.attacker.kind === 'enemy' ? 0x3a2a1a : 0xe8d9b0, 1);
      g.lineBetween(tail.x, tail.y, head.x, head.y);
      const a = Math.atan2(head.y - tail.y, head.x - tail.x);
      const hs = SCALE * 0.3;
      g.fillStyle(0xf2f2f2, 1);
      g.fillTriangle(
        head.x + Math.cos(a) * hs,
        head.y + Math.sin(a) * hs,
        head.x + Math.cos(a + 2.5) * hs * 0.7,
        head.y + Math.sin(a + 2.5) * hs * 0.7,
        head.x + Math.cos(a - 2.5) * hs * 0.7,
        head.y + Math.sin(a - 2.5) * hs * 0.7,
      );
    }
    // Forget shooters of shots that are no longer flying (landed on a target).
    if (this.shooters.size > this.runtime.state.projectiles.length) {
      const live = new Set(this.runtime.state.projectiles.map((p) => p.id));
      for (const id of this.shooters.keys()) if (!live.has(id)) this.shooters.delete(id);
    }
  }

  /**
   * An actor in its pose: lifted by its step, mirrored to face where it goes or strikes, leaning
   * into a blow, and washed white for a moment when hit. The shadow stays on the ground.
   */
  private drawActor(id: string, x: number, y: number, s: number, alpha: number, pose: Pose): void {
    if (this.drawActorArt(id, x, y, s, alpha, pose)) return;
    const g = this.dynamic;
    const draw = spriteFor(id);
    g.save();
    g.translateCanvas(x, y - pose.bob * bobHeight(id) * s);
    g.scaleCanvas(pose.facing, 1);
    g.rotateCanvas(pose.lean);
    draw(g, 0, 0, s, alpha, pose);
    if (pose.flash > 0) draw(whiteout(g, pose.flash * 0.8), 0, 0, s, alpha, pose);
    g.restore();
  }

  /**
   * The painted actor: the body frame for its view and step, its weapon layer in the front hand
   * (behind the body when seen from the back), mirrored to face left. False when it has no art.
   */
  private drawActorArt(
    id: string,
    x: number,
    y: number,
    s: number,
    alpha: number,
    pose: Pose,
  ): boolean {
    const action =
      id === 'king'
        ? this.kingActions.update(
            !!this.runtime.state.king.dash,
            this.runtime.state.king.alive,
            this.animationNow,
          )
        : null;
    const frame = this.art.body(id, pose, strideFor(id), this.animationNow, action);
    if (!frame) return false;
    const k = ART_SCALE * ACTOR_SIZE;
    const f = pose.facing;
    const lean = action ? 0 : pose.lean;
    // A flyer hovers high above its shadow; walkers hop with their step.
    const by = y - (id === 'harpy' ? s * 2.2 : action ? 0 : pose.bob * bobHeight(id) * s);
    const body = () => {
      const im = this.image(frame, x, by, k)
        .setScale(k * f, k)
        .setRotation(lean * f)
        .setAlpha(alpha);
      if (pose.flash > 0) this.painter.whiteout(im, pose.flash * 0.8);
    };
    const size = this.textures.getFrame(this.art.atlas(frame)!, frame);
    // A point on the body, in art pixels from the feet (facing right), to scene pixels; the lean
    // turns the body around its feet.
    const onBody = (fx: number, fy: number) => {
      const c = Math.cos(lean);
      const sn = Math.sin(lean);
      return { x: x + f * (fx * c - fy * sn) * k, y: by + (fx * sn + fy * c) * k };
    };
    if (id === 'catapult') {
      body();
      const arm = this.art.at(CATAPULT_ARM.name, pose.swing > 0 ? 0.99 : 0);
      if (!arm) return true;
      const hub = CATAPULT_ARM.hub[arm.endsWith('.f1') ? 0 : 1]!;
      const at = onBody(0, -CATAPULT_ARM.axle * size.cutHeight);
      const im = this.image(arm, at.x, at.y, k)
        .setOrigin(hub[0], hub[1])
        .setScale(k * f, k)
        .setAlpha(alpha);
      if (pose.flash > 0) this.painter.whiteout(im, pose.flash * 0.8);
      return true;
    }
    const rig = action ? null : this.art.rig(id);
    if (!rig) {
      body();
      return true;
    }
    const hand = rig.hand ?? HAND;
    let hx = hand[0] * size.cutWidth;
    if (rig.kind === 'thrust') hx += pose.swing * 0.42 * size.cutWidth;
    if (rig.kind === 'aim') hx -= pose.swing * 0.12 * size.cutWidth;
    const at = onBody(hx, -hand[1] * size.cutHeight);
    const held = this.textures.getFrame(this.art.atlas(rig.frame)!, rig.frame);
    const w = (k * rig.length * size.cutHeight) / Math.max(held.cutWidth, held.cutHeight);
    const weapon = () => {
      const im = this.image(rig.frame, at.x, at.y, w)
        .setOrigin(rig.grip[0], rig.grip[1])
        .setScale(w * f, w)
        .setRotation(f * (weaponAngle(rig, pose.swing) + lean))
        .setAlpha(alpha);
      if (pose.flash > 0) this.painter.whiteout(im, pose.flash * 0.8);
    };
    if (pose.back) {
      weapon();
      body();
    } else {
      body();
      weapon();
    }
    return true;
  }

  /** A building, the castle or a structure: its painted frame, else its code-drawn shape. */
  private drawStill(
    id: string,
    x: number,
    y: number,
    s: number,
    alpha: number,
    flash: number,
    king: { x: number; y: number } | null,
  ) {
    const frame = this.art.still(id);
    if (frame) {
      const size = this.textures.getFrame(this.art.atlas(frame)!, frame);
      const origin = groundOrigin(frame, size.realWidth, size.realHeight);
      const im = this.image(
        frame,
        x,
        y,
        ART_SCALE * (id.startsWith('castle') ? 1 : BUILDING_SIZE),
      ).setOrigin(origin[0], origin[1]);
      const hides = king && king.y < y && im.getBounds().contains(king.x, king.y);
      im.setAlpha(hides ? alpha * SEE_THROUGH : alpha);
      if (this.runtime.state.phase === 'night') im.setTint(colors.nightArt);
      if (flash > 0) this.painter.whiteout(im, flash * 0.7);
      return;
    }
    const g = this.dynamic;
    spriteFor(id)(g, x, y, s, alpha);
    if (flash > 0) spriteFor(id)(whiteout(g, flash * 0.7), x, y, s, alpha);
  }

  /** Where a building's health bar goes: just over its painted roof, or its drawn shape. */
  private stillHeight(id: string, s: number): number {
    const frame = this.art.still(id);
    if (!frame) return s * 3.2;
    const size = this.textures.getFrame(this.art.atlas(frame)!, frame);
    const scale = ART_SCALE * (id.startsWith('castle') ? 1 : BUILDING_SIZE);
    // Use the same calibrated ground anchor as the image, accounting for atlas trimming.
    const top = size.realHeight * groundOrigin(frame, size.realWidth, size.realHeight)[1] - size.y;
    return top * scale + 6;
  }

  /** A body tipping over backwards where it died, then fading; a flyer drops to the ground. */
  private drawCorpse(
    id: string,
    x: number,
    y: number,
    s: number,
    facing: 1 | -1,
    fall: { tip: number; alpha: number },
  ): void {
    const g = this.dynamic;
    shadow(g, x, y, s * (1 - 0.3 * fall.tip));
    const frame = this.art.body(id, { back: false, walked: 0, moving: false }, STRIDE_M, 0);
    if (frame) {
      const k = ART_SCALE * ACTOR_SIZE;
      const lift = id === 'harpy' ? s * 2.2 * (1 - fall.tip) : 0;
      this.image(frame, x, y - lift, k)
        .setScale(k * facing, k)
        .setRotation(-fall.tip * 1.35 * facing)
        .setAlpha(fall.alpha);
      return;
    }
    g.save();
    g.translateCanvas(x, y + (id === 'harpy' ? fall.tip * s * 2.2 : 0));
    g.scaleCanvas(facing, 1);
    g.rotateCanvas(-fall.tip * 1.35);
    spriteFor(id)(g, 0, 0, s, fall.alpha);
    g.restore();
  }

  /** An actor's position in metres, to turn it toward the one it strikes. */
  private refWorld(ref: Ref): Vec | null {
    const key = keyOf(ref);
    const s = this.runtime.state;
    switch (ref.kind) {
      case 'king':
        return s.king.pos;
      case 'castle':
        return s.castle.pos;
      case 'building':
        return s.buildings.find((x) => x.id === ref.id)?.pos ?? null;
      case 'unit':
      case 'enemy': {
        const list: { id: number; pos: Vec }[] = ref.kind === 'unit' ? s.units : s.enemies;
        const found = list.find((x) => x.id === ref.id);
        return found && key ? this.runtime.drawPos(key, found.pos) : null;
      }
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

const darken = (c: number, f = 0.7) =>
  (Math.round(((c >> 16) & 255) * f) << 16) |
  (Math.round(((c >> 8) & 255) * f) << 8) |
  Math.round((c & 255) * f);

/**
 * The same drawing in white: every fill and line colour is replaced, so any sprite can flash
 * without a second set of drawers. `strength` is the white's opacity.
 */
function whiteout(g: Phaser.GameObjects.Graphics, strength: number): Phaser.GameObjects.Graphics {
  return new Proxy(g, {
    get(target, prop) {
      if (prop === 'fillStyle')
        return (_color: number, alpha = 1) => target.fillStyle(0xffffff, alpha * strength);
      if (prop === 'lineStyle')
        return (width: number, _color: number, alpha = 1) =>
          target.lineStyle(width, 0xffffff, alpha * strength);
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
