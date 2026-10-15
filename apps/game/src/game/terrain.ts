/**
 * Placeholder drawing of the map's terrain (rework of Greyhollow): water, bridges, cliffs and
 * scenery props, in simple shapes until the panda tiles and environment sprites replace them.
 * Drawn once into the static layer, under everything that moves. View-only (ADR-004).
 */
import type Phaser from 'phaser';
import type { GameMap, Prop } from '@kd/content';
import { SCALE, SQUASH } from './camera.ts';
import type { Art } from './art.ts';
import { CLIFF_HEIGHT, paintCliffShadows } from './cliffs.ts';

type Graphics = Phaser.GameObjects.Graphics;
type Pt = readonly [number, number];

export interface GroundLane {
  air: boolean;
  points: readonly { x: number; y: number }[];
}

export interface PaintedTerrain {
  ground: boolean;
  paths: boolean;
  water: boolean;
  bridges: boolean;
}

export interface TerrainFallbacks {
  water?: boolean;
  bridges?: boolean;
  cliffs?: boolean;
  paintedProps?: ReadonlySet<string>;
}

const tint = {
  bank: 0xcbb98a,
  water: 0x4f8fc0,
  waterLight: 0x7fbde3,
  cliffFoot: 0x5e574c,
  cliffFace: 0x80786a,
  cliffTop: 0xa39b88,
  cliffMoss: 0x7f9a5a,
  wood: 0x8a5a33,
  woodDark: 0x5f3b20,
  trunk: 0x6e4a2c,
  leaf: 0x4f8a3c,
  leafLight: 0x6fae4f,
  pine: 0x2f6b45,
  bamboo: 0x7fb24a,
  rock: 0x8f8a80,
  rockLight: 0xb3aea3,
  grass: 0x4e8c3a,
  flowers: [0xf2a7c3, 0xffffff, 0xf4d35e],
  lantern: 0xffd27f,
  banner: 0x2f5aa8,
} as const;

const px = (p: Pt) => ({ x: p[0] * SCALE, y: p[1] * SCALE * SQUASH });

const screen = (p: { x: number; y: number }) => ({ x: p.x * SCALE, y: p.y * SCALE * SQUASH });

/** Selects the nearest painted bridge perspective for any map-space direction. */
export function bridgeFrame(from: Pt, to: Pt): string {
  const dx = Math.abs(to[0] - from[0]);
  const dy = Math.abs(to[1] - from[1]);
  if (dy < dx * 0.45) return 'bridge';
  if (dx < dy * 0.45) return 'bridge.side';
  return 'bridge.diag';
}

/** Assets reviewed as matching their prop id; grass_patch currently contains a panda guard. */
export function paintedPropFrame(art: Art, kind: string): string | null {
  if (kind === 'grass_patch') return null;
  return art.still(kind);
}

/** Only tall scenery can occlude an actor and needs per-frame ground-y sorting. */
export function propNeedsDepth(kind: string): boolean {
  return [
    'tree',
    'pine',
    'bamboo_large',
    'bamboo_small',
    'bamboo_single',
    'shrub',
    'lantern_post',
    'panda_banner',
  ].includes(kind);
}

type Band = { points: readonly { x: number; y: number }[]; width: number };

/** A repeating fill of a loaded texture, or null when it is missing or not drawable. */
function pattern(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  textureKey: string,
): CanvasPattern | null {
  if (!scene.textures.exists(textureKey)) return null;
  const source = scene.textures.get(textureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return null;
  return ctx.createPattern(source, 'repeat');
}

/** Strokes each band with `fill`, round-capped, in screen pixels. */
function strokeBands(ctx: CanvasRenderingContext2D, fill: CanvasPattern, bands: readonly Band[]) {
  ctx.strokeStyle = fill;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const strip of bands) {
    if (strip.points.length < 2) continue;
    ctx.lineWidth = strip.width * SCALE;
    ctx.beginPath();
    const first = screen(strip.points[0]!);
    ctx.moveTo(first.x, first.y);
    for (const point of strip.points.slice(1)) {
      const p = screen(point);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

/**
 * Adds the reviewed repeatable ground/path/water textures and bridge art under gameplay. The
 * geometry still comes entirely from the validated map, so new lane angles and map sizes work
 * without a hand-painted background or route-specific coordinates.
 *
 * Grass, paths, the stone bank and water are baked into one map-sized texture: drawn as separate
 * full-map layers they cost a full-screen fill each, every frame, which slow GPUs feel.
 */
export function addPaintedTerrain(
  scene: Phaser.Scene,
  map: GameMap,
  lanes: Iterable<GroundLane>,
  art: Art,
): PaintedTerrain {
  const none = { ground: false, paths: false, water: false };
  const width = Math.ceil(map.size[0] * SCALE);
  const height = Math.ceil(map.size[1] * SCALE * SQUASH);
  const key = 'painted:ground';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, width, height);
  const painted = { ...none };
  if (texture) {
    const ctx = texture.context;
    const grass = pattern(scene, ctx, 'art:tile_grass');
    if (grass) {
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, width, height);
      painted.ground = true;
    }

    const pathBands = [...lanes]
      .filter((lane) => !lane.air)
      .map((lane) => ({ points: lane.points, width: 1.4 }));
    const path = pattern(scene, ctx, 'art:tile_path');
    if (path && pathBands.length > 0) {
      strokeBands(ctx, path, pathBands);
      painted.paths = true;
    }

    const waters = map.terrain.water.map((water) => ({
      points: water.points.map(([x, y]) => ({ x, y })),
      width: water.width,
    }));
    const stone = pattern(scene, ctx, 'art:tile_stone');
    const water = pattern(scene, ctx, 'art:tile_water');
    if (water && waters.length > 0) {
      // A narrow stone bank keeps the collision boundary legible before the water is laid over it.
      if (stone)
        strokeBands(
          ctx,
          stone,
          waters.map((w) => ({ ...w, width: w.width + 0.6 })),
        );
      strokeBands(ctx, water, waters);
      painted.water = true;
    }

    // Painted cliffs stand on a soft contact shadow (the placeholder cliffs draw their own foot).
    if (painted.ground && art.has('cliff_section')) paintCliffShadows(ctx, map);

    if (painted.ground || painted.paths || painted.water) {
      texture.refresh();
      scene.add.image(0, 0, key).setOrigin(0).setDepth(-4);
    } else scene.textures.remove(key);
  }
  const { ground, paths, water } = painted;

  const bridges = map.terrain.bridges.every((bridge) =>
    art.has(bridgeFrame(bridge.from, bridge.to)),
  );
  if (bridges)
    for (const bridge of map.terrain.bridges) {
      const frame = bridgeFrame(bridge.from, bridge.to);
      const atlas = art.atlas(frame)!;
      const a = px(bridge.from);
      const b = px(bridge.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const source = scene.textures.getFrame(atlas, frame).realWidth;
      const target = Math.hypot(dx, dy) + bridge.width * SCALE * 0.35;
      const image = scene.add
        .image((a.x + b.x) / 2, (a.y + b.y) / 2, atlas, frame)
        .setDepth(-1)
        .setScale(target / source);
      const base =
        frame === 'bridge.side' ? Math.PI / 2 : frame === 'bridge.diag' ? Math.PI / 4 : 0;
      image.setRotation(Math.atan2(dy, dx) - base);
    }
  return { ground, paths, water, bridges };
}

/** Fills a four-cornered shape in the current fill style. */
function fillQuad(g: Graphics, q: readonly { x: number; y: number }[]) {
  g.beginPath();
  g.moveTo(q[0]!.x, q[0]!.y);
  for (const p of q.slice(1)) g.lineTo(p.x, p.y);
  g.closePath();
  g.fillPath();
}

/**
 * A strip `width` metres wide along a polyline, with round joints and ends, lifted `lift` pixels
 * up. Shaped in world metres, then squashed, so it covers exactly the ground the core blocks.
 */
function band(g: Graphics, points: readonly Pt[], width: number, color: number, lift = 0) {
  const r = width / 2;
  g.fillStyle(color, 1);
  const at = (x: number, y: number) => ({ x: x * SCALE, y: y * SCALE * SQUASH - lift });
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * r;
    const ny = ((bx - ax) / len) * r;
    fillQuad(g, [
      at(ax + nx, ay + ny),
      at(bx + nx, by + ny),
      at(bx - nx, by - ny),
      at(ax - nx, ay - ny),
    ]);
  }
  for (const [x, y] of points) {
    const c = at(x, y);
    g.fillEllipse(c.x, c.y, width * SCALE, width * SCALE * SQUASH);
  }
}

export function drawTerrain(g: Graphics, map: GameMap, fallback: TerrainFallbacks = {}): void {
  const { water, bridges, cliffs, props } = map.terrain;

  if (fallback.water !== false) for (const w of water) band(g, w.points, w.width + 0.6, tint.bank);
  if (fallback.water !== false) for (const w of water) band(g, w.points, w.width, tint.water);
  if (fallback.water !== false)
    for (const w of water) {
      g.lineStyle(2, tint.waterLight, 0.6);
      const at = w.points.map(px);
      for (let i = 1; i < at.length; i++)
        g.lineBetween(at[i - 1]!.x, at[i - 1]!.y, at[i]!.x, at[i]!.y);
    }

  if (fallback.bridges !== false) for (const b of bridges) drawBridge(g, b.from, b.to, b.width);

  // Cliffs: a dark foot, a stone face rising CLIFF_HEIGHT, and a lighter mossy top.
  const rise = CLIFF_HEIGHT * SCALE;
  if (fallback.cliffs !== false)
    for (const c of cliffs) {
      const w = c.width;
      band(g, c.points, w, tint.cliffFoot);
      for (let k = 1; k <= 4; k++) band(g, c.points, w, tint.cliffFace, (rise * k) / 5);
      band(g, c.points, w * 0.95, tint.cliffTop, rise);
      band(g, c.points, w * 0.55, tint.cliffMoss, rise + 2);
    }

  // Props back to front, so nearer ones overlap farther ones.
  for (const p of [...props].sort((a, b) => a.pos[1] - b.pos[1]))
    if (!fallback.paintedProps?.has(p.kind)) drawProp(g, p);
}

function drawBridge(g: Graphics, from: Pt, to: Pt, width: number) {
  const a = px(from);
  const b = px(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Across the deck, in screen pixels (the 3/4 squash applies to the world's y only).
  const ax = (-(to[1] - from[1]) / Math.hypot(to[0] - from[0], to[1] - from[1])) * width * SCALE;
  const ay =
    ((to[0] - from[0]) / Math.hypot(to[0] - from[0], to[1] - from[1])) * width * SCALE * SQUASH;
  const half = (k: number) => ({ x: (ax * k) / 2, y: (ay * k) / 2 });
  const l = half(-1);
  const r = half(1);
  g.fillStyle(tint.wood, 1);
  fillQuad(g, [
    { x: a.x + l.x, y: a.y + l.y },
    { x: b.x + l.x, y: b.y + l.y },
    { x: b.x + r.x, y: b.y + r.y },
    { x: a.x + r.x, y: a.y + r.y },
  ]);
  // Planks across the deck.
  g.lineStyle(1.5, tint.woodDark, 0.7);
  const planks = Math.floor(len / 9);
  for (let i = 1; i < planks; i++) {
    const t = i / planks;
    const c = { x: a.x + dx * t, y: a.y + dy * t };
    g.lineBetween(c.x + l.x, c.y + l.y, c.x + r.x, c.y + r.y);
  }
  // Rails on both sides.
  g.lineStyle(4, tint.woodDark, 1);
  g.lineBetween(a.x + l.x, a.y + l.y - 6, b.x + l.x, b.y + l.y - 6);
  g.lineBetween(a.x + r.x, a.y + r.y - 6, b.x + r.x, b.y + r.y - 6);
}

function drawProp(g: Graphics, prop: Prop) {
  const { x, y } = px(prop.pos);
  const s = prop.scale * SCALE;
  const f = prop.flip ? -1 : 1;
  switch (prop.kind) {
    case 'tree':
      g.fillStyle(0x000000, 0.18).fillEllipse(x, y, s * 1.3, s * 0.45);
      g.fillStyle(tint.trunk, 1).fillRect(x - s * 0.08, y - s * 0.7, s * 0.16, s * 0.7);
      g.fillStyle(tint.leaf, 1).fillCircle(x, y - s * 1.05, s * 0.55);
      g.fillCircle(x - f * s * 0.35, y - s * 0.8, s * 0.38);
      g.fillStyle(tint.leafLight, 1).fillCircle(x + f * s * 0.15, y - s * 1.2, s * 0.3);
      break;
    case 'pine':
      g.fillStyle(0x000000, 0.18).fillEllipse(x, y, s * 1.1, s * 0.4);
      g.fillStyle(tint.trunk, 1).fillRect(x - s * 0.07, y - s * 0.35, s * 0.14, s * 0.35);
      g.fillStyle(tint.pine, 1);
      for (const [base, top, half] of [
        [0.3, 1.0, 0.5],
        [0.7, 1.4, 0.38],
        [1.1, 1.8, 0.26],
      ] as const)
        g.fillTriangle(x - s * half, y - s * base, x + s * half, y - s * base, x, y - s * top);
      break;
    case 'bamboo_large':
    case 'bamboo_small':
    case 'bamboo_single': {
      const stems = prop.kind === 'bamboo_large' ? 5 : prop.kind === 'bamboo_small' ? 3 : 1;
      const h = prop.kind === 'bamboo_large' ? 2.2 : prop.kind === 'bamboo_small' ? 1.5 : 1.2;
      g.fillStyle(0x000000, 0.15).fillEllipse(x, y, s * 0.3 * (stems + 1), s * 0.3);
      for (let i = 0; i < stems; i++) {
        const ox = (i - (stems - 1) / 2) * s * 0.18 * f;
        const top = y - s * h * (0.8 + (0.2 * ((i * 7) % 3)) / 2);
        g.lineStyle(Math.max(2, s * 0.07), tint.bamboo, 1).lineBetween(x + ox, y, x + ox, top);
        g.fillStyle(tint.leafLight, 1).fillEllipse(
          x + ox + f * s * 0.12,
          top + s * 0.1,
          s * 0.3,
          s * 0.1,
        );
      }
      break;
    }
    case 'rock_small':
    case 'rock_large': {
      const k = prop.kind === 'rock_large' ? 1.3 : 0.7;
      g.fillStyle(tint.rock, 1).fillEllipse(x, y - s * 0.2 * k, s * 0.9 * k, s * 0.6 * k);
      g.fillStyle(tint.rockLight, 1).fillEllipse(
        x - f * s * 0.1 * k,
        y - s * 0.32 * k,
        s * 0.5 * k,
        s * 0.25 * k,
      );
      break;
    }
    case 'grass':
      g.lineStyle(2, tint.grass, 1);
      for (const ox of [-0.15, 0, 0.15])
        g.lineBetween(x + ox * s, y, x + ox * s * 1.8 * f, y - s * 0.35);
      break;
    case 'grass_patch':
      g.fillStyle(tint.grass, 0.35).fillEllipse(x, y, s * 1.8, s * 0.7);
      break;
    case 'flowers':
      g.fillStyle(tint.grass, 0.5).fillEllipse(x, y, s * 0.8, s * 0.3);
      tint.flowers.forEach((c, i) =>
        g.fillStyle(c, 1).fillCircle(x + (i - 1) * s * 0.22 * f, y - s * 0.08 * (i % 2), s * 0.07),
      );
      break;
    case 'shrub':
      g.fillStyle(tint.leaf, 1).fillEllipse(x, y - s * 0.25, s * 0.9, s * 0.6);
      g.fillStyle(tint.leafLight, 1).fillEllipse(x - f * s * 0.12, y - s * 0.35, s * 0.4, s * 0.25);
      break;
    case 'lantern_post':
      g.fillStyle(tint.woodDark, 1).fillRect(x - s * 0.05, y - s * 1.1, s * 0.1, s * 1.1);
      g.fillStyle(tint.lantern, 1).fillRect(x - s * 0.13, y - s * 1.3, s * 0.26, s * 0.24);
      break;
    case 'barrel':
      g.fillStyle(tint.wood, 1).fillRoundedRect(
        x - s * 0.22,
        y - s * 0.5,
        s * 0.44,
        s * 0.5,
        s * 0.08,
      );
      g.lineStyle(2, tint.woodDark, 1).lineBetween(
        x - s * 0.22,
        y - s * 0.25,
        x + s * 0.22,
        y - s * 0.25,
      );
      break;
    case 'crate':
      g.fillStyle(tint.wood, 1).fillRect(x - s * 0.25, y - s * 0.45, s * 0.5, s * 0.45);
      g.lineStyle(2, tint.woodDark, 1).strokeRect(x - s * 0.25, y - s * 0.45, s * 0.5, s * 0.45);
      break;
    case 'panda_banner':
      g.fillStyle(tint.woodDark, 1).fillRect(x - s * 0.04, y - s * 1.6, s * 0.08, s * 1.6);
      g.fillStyle(tint.banner, 1).fillRect(
        x + (f < 0 ? -s * 0.4 : 0),
        y - s * 1.55,
        s * 0.4,
        s * 0.6,
      );
      g.fillStyle(0xffffff, 1).fillCircle(x + f * s * 0.2, y - s * 1.3, s * 0.08);
      break;
  }
}
