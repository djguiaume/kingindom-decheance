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

type G = Phaser.GameObjects.Graphics;
export type Drawer = (g: G, x: number, y: number, s: number, alpha: number) => void;

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

function creature(color: number, height = 1.6, hat?: number): Drawer {
  return (g, x, y, s, a) => {
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
  };
}

const flyer: Drawer = (g, x, y, s, a) => {
  const c = colors.enemies.flyer;
  const lift = s * 2.2; // drawn high above its shadow
  g.fillStyle(darker(c), a);
  g.fillTriangle(x - s * 1.8, y - lift, x, y - lift - s * 0.4, x - s * 0.3, y - lift + s * 0.6);
  g.fillTriangle(x + s * 1.8, y - lift, x, y - lift - s * 0.4, x + s * 0.3, y - lift + s * 0.6);
  g.fillStyle(c, a);
  g.fillCircle(x, y - lift, s * 0.8);
};

const king: Drawer = (g, x, y, s, a) => {
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
  g.lineStyle(2, 0x8b5a2b, a); // spear
  g.lineBetween(x + s * 0.7, y - s * 0.5, x + s * 1.3, y - s * 3);
};

const castle: Drawer = (g, x, y, s, a) => {
  block(0xd9c48a, 1.4)(g, x, y, s, a);
  for (const dx of [-s, s]) block(0xcbb57a, 2.2, 0x3b6db3)(g, x + dx * 0.9, y, s * 0.35, a);
  g.fillStyle(colors.castle, a);
  g.fillTriangle(x, y - s * 2.2, x, y - s * 2.9, x + s * 0.5, y - s * 2.55);
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
  footman: creature(colors.unit, 1.8, 0x9aa5b1),
  raider: creature(colors.enemies.swarm, 1.6, 0x8b1e1e),
  skirmisher: creature(colors.enemies.ranged, 1.8, 0x3d3d5c),
  brute: creature(colors.enemies.tank, 1.4),
  harpy: flyer,
};

/** The drawer for a content id, or a neutral fallback so new content is visible at once. */
export function spriteFor(id: string): Drawer {
  return sprites[id] ?? creature(0xff00ff);
}
