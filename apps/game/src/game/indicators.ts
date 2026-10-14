/**
 * Off-screen indicators (design 11 §9.1): edge arrows toward what matters outside the view.
 * Pure functions of the state, the camera and recent hits, so they are testable without a
 * browser. View-only: nothing here reaches the core.
 */
import { req, telegraph, type GameContext, type GameState, type Vec } from '@kd/core';
import { colors, css, enemyIcon } from '../theme.ts';

export interface Projection {
  toScreen(p: Vec): Vec;
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ArrowLayout {
  /** Distance from each screen edge to the arrow line (safe area + 40 CSS px). */
  inset: { top: number; right: number; bottom: number; left: number };
  /** Screen areas arrows must stay out of (joystick zone, buttons). */
  avoid: Rect[];
}

export type ArrowKind = 'castle' | 'boss' | 'building' | 'group' | 'spawn';

export interface Arrow {
  key: string;
  kind: ArrowKind;
  x: number;
  y: number;
  /** Direction the arrow points, in radians (0 = right, clockwise, screen coordinates). */
  angle: number;
  /** 1 small, 2 medium, 3 large. */
  size: 1 | 2 | 3;
  color: string;
  /** Plain-text form of `parts`, e.g. "🪓8 🏹3". */
  label: string;
  /** What the marker shows inside: an icon with an optional count, per enemy type. */
  parts: { icon: string; count: number | null }[];
}

export const MAX_ARROWS = 6;
/** Enemies on one lane closer than this form one group. */
export const GROUP_GAP = 6;
/** A building counts as under attack for this long after a hit. */
export const UNDER_ATTACK_MS = 2000;

export interface EnemyGroup {
  lane: string;
  pos: Vec;
  count: number;
  /** The most common enemy type in the group. */
  main: string;
}

/** Groups enemies per lane: chains of enemies less than GROUP_GAP apart (single link). */
export function enemyGroups(state: GameState, exclude?: (id: number) => boolean): EnemyGroup[] {
  const groups: EnemyGroup[] = [];
  const byLane = new Map<string, typeof state.enemies>();
  for (const e of state.enemies) {
    if (exclude?.(e.id)) continue;
    const list = byLane.get(e.lane) ?? [];
    list.push(e);
    byLane.set(e.lane, list);
  }
  for (const [lane, list] of byLane) {
    const parent = list.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const dx = list[i]!.pos.x - list[j]!.pos.x;
        const dy = list[i]!.pos.y - list[j]!.pos.y;
        if (dx * dx + dy * dy < GROUP_GAP * GROUP_GAP) parent[find(i)] = find(j);
      }
    const clusters = new Map<number, typeof list>();
    list.forEach((e, i) => {
      const root = find(i);
      clusters.set(root, [...(clusters.get(root) ?? []), e]);
    });
    for (const members of clusters.values()) {
      const counts = new Map<string, number>();
      for (const e of members) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const main = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      const x = members.reduce((n, e) => n + e.pos.x, 0) / members.length;
      const y = members.reduce((n, e) => n + e.pos.y, 0) / members.length;
      groups.push({ lane, pos: { x, y }, count: members.length, main });
    }
  }
  return groups;
}

/**
 * Where an arrow toward a screen point sits: on the inset rectangle, along the line from the
 * screen centre, moved out of any area to avoid. Null when the point is on screen.
 */
export function placeArrow(
  target: Vec,
  view: { width: number; height: number },
  layout: ArrowLayout,
): { x: number; y: number; angle: number } | null {
  const { width: w, height: h } = view;
  if (target.x >= 0 && target.x <= w && target.y >= 0 && target.y <= h) return null;
  const inner: Rect = {
    left: layout.inset.left,
    top: layout.inset.top,
    right: w - layout.inset.right,
    bottom: h - layout.inset.bottom,
  };
  const cx = w / 2;
  const cy = h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  const kx = dx > 0 ? (inner.right - cx) / dx : dx < 0 ? (inner.left - cx) / dx : Infinity;
  const ky = dy > 0 ? (inner.bottom - cy) / dy : dy < 0 ? (inner.top - cy) / dy : Infinity;
  const k = Math.min(kx, ky);
  let x = cx + dx * k;
  let y = cy + dy * k;
  for (const r of layout.avoid) {
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    // Slide along the edge to the nearest side of the area that is still inside the frame.
    const options = [
      { x, y: r.top },
      { x, y: r.bottom },
      { x: r.left, y },
      { x: r.right, y },
    ].filter(
      (p) => p.x >= inner.left && p.x <= inner.right && p.y >= inner.top && p.y <= inner.bottom,
    );
    const best = options.sort(
      (a, b) => Math.abs(a.x - x) + Math.abs(a.y - y) - (Math.abs(b.x - x) + Math.abs(b.y - y)),
    )[0];
    if (best) ({ x, y } = best);
  }
  return { x, y, angle };
}

const sizeFor = (count: number): 1 | 2 | 3 => (count >= 12 ? 3 : count >= 5 ? 2 : 1);
/** Every enemy marker is one danger red, like Thronefall's; the icons tell the types apart. */
const ENEMY_RED = css(0xc73a3a);
const BOSS_RED = css(colors.enemies.boss);
const ALERT_RED = css(0xff4d4d);

/**
 * Every arrow to show now, most important first, at most MAX_ARROWS.
 * `lastHit` maps "castle" or "b<id>" to the time (ms) it last took damage.
 */
export function buildArrows(
  state: GameState,
  ctx: GameContext,
  view: Projection,
  layout: ArrowLayout,
  lastHit: ReadonlyMap<string, number>,
  now: number,
): Arrow[] {
  const out: Arrow[] = [];
  const add = (
    key: string,
    kind: ArrowKind,
    world: Vec,
    size: Arrow['size'],
    color: string,
    parts: Arrow['parts'],
  ) => {
    const at = placeArrow(view.toScreen(world), view, layout);
    const label = parts.map((p) => `${p.icon}${p.count ?? ''}`).join(' ');
    if (at) out.push({ key, kind, ...at, size, color, label, parts });
  };

  if (state.phase === 'day') {
    // Tonight's lanes: point at their spawns.
    const lanes = new Map<string, { enemy: string; count: number }[]>();
    for (const t of telegraph(ctx, state.day)) lanes.set(t.lane, [...(lanes.get(t.lane) ?? []), t]);
    for (const [lane, list] of lanes) {
      const total = list.reduce((n, t) => n + t.count, 0);
      const parts = list.map((t) => ({ icon: enemyIcon(t.enemy), count: t.count }));
      add(
        `spawn-${lane}`,
        'spawn',
        req(ctx.lanes, lane).points[0]!,
        sizeFor(total),
        ENEMY_RED,
        parts,
      );
    }
    return out.slice(0, MAX_ARROWS);
  }
  if (state.phase !== 'night') return [];

  const recent = (key: string) => now - (lastHit.get(key) ?? -Infinity) < UNDER_ATTACK_MS;
  if (recent('castle'))
    add('castle', 'castle', state.castle.pos, 3, ALERT_RED, [{ icon: '🏰', count: null }]);

  const bosses = state.enemies.filter((e) => req(ctx.enemies, e.type).archetype === 'boss');
  for (const b of bosses)
    add(`boss-${b.id}`, 'boss', b.pos, 3, BOSS_RED, [{ icon: enemyIcon(b.type), count: null }]);

  const hitBuildings = state.buildings
    .filter((b) => !b.destroyed && recent(`b${b.id}`))
    .sort((a, b) => (lastHit.get(`b${b.id}`) ?? 0) - (lastHit.get(`b${a.id}`) ?? 0));
  for (const b of hitBuildings)
    add(`b${b.id}`, 'building', b.pos, 2, ALERT_RED, [{ icon: '⚠', count: null }]);

  const bossIds = new Set(bosses.map((b) => b.id));
  const groups = enemyGroups(state, (id) => bossIds.has(id)).sort((a, b) => b.count - a.count);
  for (const g of groups)
    add(
      `g-${g.lane}-${Math.round(g.pos.x)}-${Math.round(g.pos.y)}`,
      'group',
      g.pos,
      sizeFor(g.count),
      ENEMY_RED,
      [{ icon: enemyIcon(g.main), count: g.count }],
    );
  return out.slice(0, MAX_ARROWS);
}
