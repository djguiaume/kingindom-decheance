/**
 * Sprite registry: how each content id is drawn, keyed by id (design 11 §9 placeholder rule).
 * Everything here is a code-drawn stand-in in the approved flat cartoon style. The final art
 * pass replaces entries with real sprites and touches neither rules nor content.
 *
 * Drawing convention: (x, y) is the ground point under the entity in screen pixels; `s` is the
 * entity's radius in pixels. Shapes stand "up" from the ground for the 3/4 view.
 */
import type Phaser from 'phaser';
import { colors } from '../theme.ts';
import { REST, type Pose } from './animation.ts';

type G = Phaser.GameObjects.Graphics;
/**
 * Draws one entity. Actors also get their `pose` (animation.ts); the scene has already moved,
 * mirrored and tilted the canvas for the bob, facing and lean, so a drawer only animates its
 * own parts (the weapon swing, wings).
 */
export type Drawer = (g: G, x: number, y: number, s: number, alpha: number, pose?: Pose) => void;

/** What a creature holds; it swings with the pose. */
type Weapon = 'sword' | 'club' | 'axe' | 'bow';

const darker = (c: number, f = 0.7) =>
  (Math.round(((c >> 16) & 255) * f) << 16) |
  (Math.round(((c >> 8) & 255) * f) << 8) |
  Math.round((c & 255) * f);

export function shadow(g: G, x: number, y: number, s: number): void {
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(x, y, s * 2.2, s * 0.9);
}

function block(color: number, height: number, roof?: number): Drawer {
  return (g, x, y, s, a) => {
    const h = s * height;
    g.fillStyle(darker(color), a);
    g.fillRect(x - s, y - h, s * 2, h);
    g.fillStyle(color, a);
    g.fillRect(x - s + 2, y - h + 2, s * 2 - 4, h - 4);
    if (roof !== undefined) {
      g.fillStyle(roof, a);
      g.fillTriangle(x - s * 1.15, y - h, x + s * 1.15, y - h, x, y - h - s * 0.9);
    }
  };
}

/**
 * A weapon held at the creature's front hand. The swing turns it from raised to struck
 * (forward is +x: the scene mirrors the canvas for actors facing left).
 */
function weapon(g: G, kind: Weapon, x: number, y: number, s: number, a: number, swing: number) {
  if (kind === 'bow') {
    // Drawing the bow pulls the string back.
    const pull = s * (0.15 + 0.35 * swing);
    g.lineStyle(Math.max(1.5, s * 0.14), 0x6b4423, a);
    g.beginPath();
    g.arc(x, y, s * 0.6, -1.2, 1.2);
    g.strokePath();
    g.lineStyle(1, 0xe8e0c8, a);
    g.lineBetween(x + s * 0.22, y - s * 0.56, x - pull, y);
    g.lineBetween(x - pull, y, x + s * 0.22, y + s * 0.56);
    return;
  }
  const angle = -Math.PI / 2 - 0.35 + swing * (Math.PI / 2 + 0.2);
  const len = s * (kind === 'sword' ? 1.1 : 1.0);
  const tx = x + Math.cos(angle) * len;
  const ty = y + Math.sin(angle) * len;
  const wood = 0x6b4423;
  if (kind === 'sword') {
    g.lineStyle(Math.max(2, s * 0.16), 0xd5dbe1, a);
    g.lineBetween(x, y, tx, ty);
    g.lineStyle(Math.max(2, s * 0.16), 0x4a3b2a, a);
    g.lineBetween(x - s * 0.15, y + s * 0.05, x + s * 0.15, y - s * 0.05);
  } else {
    g.lineStyle(Math.max(2, s * 0.18), wood, a);
    g.lineBetween(x, y, tx, ty);
    if (kind === 'club') {
      g.fillStyle(darker(wood, 0.8), a);
      g.fillCircle(tx, ty, s * 0.25);
    } else {
      g.fillStyle(0xb8c0c8, a);
      g.fillTriangle(
        tx,
        ty,
        tx + Math.cos(angle + 1.6) * s * 0.45,
        ty + Math.sin(angle + 1.6) * s * 0.45,
        x + Math.cos(angle) * len * 0.6,
        y + Math.sin(angle) * len * 0.6,
      );
    }
  }
}

function creature(color: number, height = 1.6, hat?: number, held?: Weapon): Drawer {
  return (g, x, y, s, a, pose = REST) => {
    const h = s * height;
    g.fillStyle(darker(color), a);
    g.fillEllipse(x, y - h / 2, s * 2, h);
    g.fillStyle(color, a);
    g.fillEllipse(x, y - h / 2, s * 2 - 4, h - 4);
    g.fillStyle(0xffffff, a);
    g.fillCircle(x - s * 0.3, y - h * 0.65, Math.max(1.5, s * 0.18));
    g.fillCircle(x + s * 0.3, y - h * 0.65, Math.max(1.5, s * 0.18));
    if (hat !== undefined) {
      g.fillStyle(hat, a);
      g.fillTriangle(x - s * 0.8, y - h * 0.85, x + s * 0.8, y - h * 0.85, x, y - h * 1.35);
    }
    if (held) weapon(g, held, x + s * 0.95, y - h * 0.45, s, a, pose.swing);
  };
}

const flyer: Drawer = (g, x, y, s, a, pose = REST) => {
  const c = colors.enemies.flyer;
  const lift = s * 2.2; // drawn high above its shadow
  // The wings flap with its flight (its bob) and beat down when it strikes.
  const tip = s * (0.9 * pose.bob - 0.45 + 0.6 * pose.swing);
  g.fillStyle(darker(c), a);
  g.fillTriangle(
    x - s * 1.8,
    y - lift + tip,
    x,
    y - lift - s * 0.4,
    x - s * 0.3,
    y - lift + s * 0.6,
  );
  g.fillTriangle(
    x + s * 1.8,
    y - lift + tip,
    x,
    y - lift - s * 0.4,
    x + s * 0.3,
    y - lift + s * 0.6,
  );
  g.fillStyle(c, a);
  g.fillCircle(x, y - lift, s * 0.8);
};

const king: Drawer = (g, x, y, s, a, pose = REST) => {
  g.lineStyle(3, colors.castle, a);
  g.strokeEllipse(x, y, s * 2.6, s * 1.1);
  g.fillStyle(0xf4f4f4, a); // white horse
  g.fillEllipse(x, y - s * 0.7, s * 2.2, s * 1.2);
  g.fillStyle(0xc0392b, a); // red cape
  g.fillRect(x - s * 0.5, y - s * 2, s, s * 1.1);
  g.fillStyle(0xf1c27d, a);
  g.fillCircle(x, y - s * 2.2, s * 0.45);
  g.fillStyle(colors.castle, a); // crown
  g.fillTriangle(x - s * 0.45, y - s * 2.5, x + s * 0.45, y - s * 2.5, x, y - s * 3);
  // The spear, held near-upright, levels into a forward thrust when he strikes.
  const angle = -1.34 + pose.swing * 1.2;
  const hx = x + s * 0.85;
  const hy = y - s * 1.5;
  const back = s * 1.0;
  const ahead = s * 1.6 + pose.swing * s * 0.5;
  g.lineStyle(2, 0x8b5a2b, a);
  g.lineBetween(
    hx - Math.cos(angle) * back,
    hy - Math.sin(angle) * back,
    hx + Math.cos(angle) * ahead,
    hy + Math.sin(angle) * ahead,
  );
  g.fillStyle(0xd5dbe1, a);
  g.fillCircle(hx + Math.cos(angle) * ahead, hy + Math.sin(angle) * ahead, Math.max(1.5, s * 0.14));
};

const castle: Drawer = (g, x, y, s, a) => {
  block(0xd9c48a, 1.4)(g, x, y, s, a);
  for (const dx of [-s, s]) block(0xcbb57a, 2.2, 0x3b6db3)(g, x + dx * 0.9, y, s * 0.35, a);
  g.fillStyle(colors.castle, a);
  g.fillTriangle(x, y - s * 2.2, x, y - s * 2.9, x + s * 0.5, y - s * 2.55);
};

/** A wooden frame on wheels with a throwing arm. */
const catapult: Drawer = (g, x, y, s, a, pose = REST) => {
  const c = colors.enemies.siege;
  g.fillStyle(darker(c, 0.5), a);
  g.fillCircle(x - s * 0.7, y - s * 0.3, s * 0.35);
  g.fillCircle(x + s * 0.7, y - s * 0.3, s * 0.35);
  g.fillStyle(c, a);
  g.fillRect(x - s, y - s * 0.9, s * 2, s * 0.5);
  g.lineStyle(Math.max(2, s * 0.2), darker(c), a);
  // The arm is cocked back and throws forward when it fires.
  const angle = -2.3 + pose.swing * 1.5;
  const ax = x - s * 0.4 + Math.cos(angle) * s * 1.6;
  const ay = y - s * 0.7 + Math.sin(angle) * s * 1.6;
  g.lineBetween(x - s * 0.4, y - s * 0.7, ax, ay);
  if (pose.swing < 0.5) {
    g.fillStyle(0x6b6b6b, a);
    g.fillCircle(ax, ay, s * 0.3);
  }
};

const sprites: Record<string, Drawer> = {
  castle,
  king,
  house: block(colors.buildings.eco, 1.1, 0xb5523b),
  manor: block(colors.buildings.eco, 1.4, 0x8e3b2b),
  gold_mine: block(0x8d7b68, 0.9, colors.castle),
  tower: block(colors.buildings.tower, 2.6, 0x3b6db3),
  watchtower: block(colors.buildings.tower, 3.2, 0x2c548c),
  ballista_tower: block(0x5d7fa8, 3.2, 0x7a4a2a),
  volley_tower: block(0x7fb0e8, 3.2, 0x2c548c),
  wall: block(colors.buildings.wall, 0.9),
  stone_wall: block(0x8c8c8c, 1.2),
  barracks: block(colors.buildings.military, 1.2, 0x7a3e22),
  garrison: block(colors.buildings.military, 1.5, 0x5e2e18),
  footman: creature(colors.unit, 1.8, 0x9aa5b1, 'sword'),
  raider: creature(colors.enemies.swarm, 1.6, 0x8b1e1e, 'axe'),
  skirmisher: creature(colors.enemies.ranged, 1.8, 0x3d3d5c, 'bow'),
  brute: creature(colors.enemies.tank, 1.4, undefined, 'club'),
  harpy: flyer,
  catapult: catapult,
  warlord: creature(colors.enemies.boss, 1.9, colors.castle, 'axe'),
};

/** How high a step lifts each kind of actor, as a fraction of its radius. */
export function bobHeight(id: string): number {
  if (id === 'catapult') return 0.08; // wheels rattle, they do not hop
  if (id === 'harpy') return 0; // it flaps instead (see flyer)
  if (id === 'king') return 0.18; // the horse's gait
  return 0.3;
}

/** The drawer for a content id, or a neutral fallback so new content is visible at once. */
export function spriteFor(id: string): Drawer {
  return sprites[id] ?? creature(0xff00ff);
}
