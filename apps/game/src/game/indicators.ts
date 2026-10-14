/**
 * Off-screen indicators (design 11 §9.1): edge arrows toward what matters outside the view.
 * Pure functions of the state, the camera and recent hits, so they are testable without a
 * browser. View-only: nothing here reaches the core.
 */
import { req, telegraph, type GameContext, type GameState, type Vec } from '@kd/core';
import type { IconId } from '../icons.ts';
import { colors, css, enemyIcon, ui } from '../theme.ts';

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
  /** Plain-text form of `parts`, e.g. "axe8 bow3". */
  label: string;
  /** What the marker shows inside: an icon with an optional count, per enemy type. */
  parts: { icon: IconId; count: number | null }[];
  /** The marker body's size in CSS px (a pill sized to its icons and counts). */
  width: number;
  height: number;
  /** True when the target is on screen and the marker stands over it, pointing down. */
  onScreen: boolean;
}

/** Marker body height per arrow size, in CSS px. */
export const PIN_HEIGHT = { 1: 30, 2: 36, 3: 44 } as const;

/** The marker body's size: as tall as its size class, as wide as its icons and counts. */
export function pinSize(
  size: Arrow['size'],
  parts: Arrow['parts'],
): { width: number; height: number; font: number } {
  const height = PIN_HEIGHT[size];
  const font = Math.round(height * 0.45);
  const partW = (p: Arrow['parts'][number]) =>
    font * 1.3 + (p.count === null ? 0 : String(p.count).length * font * 0.62);
  const width = Math.max(
    height,
    parts.reduce((n, p) => n + partW(p), 0) + (parts.length - 1) * 6 + height * 0.6,
  );
  return { width: Math.round(width), height, font };
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

const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clampInside = (p: Vec, r: Rect): Vec => ({
  x: Math.min(r.right, Math.max(r.left, p.x)),
  y: Math.min(r.bottom, Math.max(r.top, p.y)),
});

/** Room for the tip outside the marker body, in CSS px. */
const TIP = 14;

/**
 * Where an arrow toward a screen point sits: on the inset rectangle (shrunk by half the marker's
 * size, so a wide marker never pokes out of the screen), along the line from the screen centre.
 * If that spot covers an area to avoid (a HUD panel, the joystick), the marker slides along the
 * same screen edge to the nearest free spot; only when the whole edge is blocked there does it
 * step inwards, just past the panel. Null when the point is on screen.
 */
export function placeArrow(
  target: Vec,
  view: { width: number; height: number },
  layout: ArrowLayout,
  half: { w: number; h: number } = { w: 0, h: 0 },
): { x: number; y: number; angle: number } | null {
  const { width: w, height: h } = view;
  if (target.x >= 0 && target.x <= w && target.y >= 0 && target.y <= h) return null;
  const inner = innerRect(view, layout, half);
  const cx = w / 2;
  const cy = h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  const kx = dx > 0 ? (inner.right - cx) / dx : dx < 0 ? (inner.left - cx) / dx : Infinity;
  const ky = dy > 0 ? (inner.bottom - cy) / dy : dy < 0 ? (inner.top - cy) / dy : Infinity;
  const k = Math.max(0, Math.min(kx, ky));
  const at = { x: cx + dx * k, y: cy + dy * k };
  // Which edge it sits on decides the direction it may slide in.
  const edge = kx <= ky ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
  return { ...avoidAreas(at, edge, inner, layout.avoid, half), angle };
}

/** The rectangle a marker's centre may use: the screen minus the insets and half the marker. */
function innerRect(
  view: { width: number; height: number },
  layout: ArrowLayout,
  half: { w: number; h: number },
): Rect {
  return {
    left: layout.inset.left + half.w,
    top: layout.inset.top + half.h,
    right: Math.max(layout.inset.left + half.w, view.width - layout.inset.right - half.w),
    bottom: Math.max(layout.inset.top + half.h, view.height - layout.inset.bottom - half.h),
  };
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

function avoidAreas(
  at: Vec,
  edge: Edge,
  inner: Rect,
  avoid: Rect[],
  half: { w: number; h: number },
): Vec {
  // The marker's box, not just its centre, must stay out of every area.
  const hits = (p: Vec) =>
    avoid.filter(
      (r) =>
        p.x + half.w > r.left &&
        p.x - half.w < r.right &&
        p.y + half.h > r.top &&
        p.y - half.h < r.bottom,
    );
  if (hits(at).length === 0) return at;
  const nearest = (options: Vec[]) =>
    options
      .filter(
        (p) =>
          p.x >= inner.left - 0.5 &&
          p.x <= inner.right + 0.5 &&
          p.y >= inner.top - 0.5 &&
          p.y <= inner.bottom + 0.5 &&
          hits(p).length === 0,
      )
      .sort((a, b) => dist2(a, at) - dist2(b, at))[0];
  const side = edge === 'left' || edge === 'right';
  // Slide along the edge: just before or after each area.
  const slides = avoid.flatMap((r) =>
    side
      ? [
          { x: at.x, y: r.top - half.h },
          { x: at.x, y: r.bottom + half.h },
        ]
      : [
          { x: r.left - half.w, y: at.y },
          { x: r.right + half.w, y: at.y },
        ],
  );
  const slid = nearest(slides);
  if (slid) return slid;
  // The whole edge is blocked here: step inwards, just past what is in the way.
  let p = at;
  for (let i = 0; i < avoid.length; i++) {
    const r = hits(p)[0];
    if (!r) return p;
    p =
      edge === 'top'
        ? { x: p.x, y: r.bottom + half.h }
        : edge === 'bottom'
          ? { x: p.x, y: r.top - half.h }
          : edge === 'left'
            ? { x: r.right + half.w, y: p.y }
            : { x: r.left - half.w, y: p.y };
  }
  return hits(p).length === 0 ? p : at;
}

const sizeFor = (count: number): 1 | 2 | 3 => (count >= 12 ? 3 : count >= 5 ? 2 : 1);
/** Every enemy marker is one danger red, like Thronefall's; the icons tell the types apart. */
const ENEMY_RED = css(ui.enemy);
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
    const { width, height } = pinSize(size, parts);
    const screen = view.toScreen(world);
    const at = placeArrow(screen, view, layout, { w: width / 2 + TIP, h: height / 2 + TIP });
    const label = parts.map((p) => `${p.icon}${p.count ?? ''}`).join(' ');
    if (at)
      out.push({ key, kind, ...at, size, color, label, parts, width, height, onScreen: false });
    // By day a spawn on screen keeps its marker, standing over the spawn, so the player can
    // still read what comes from there.
    else if (kind === 'spawn')
      out.push({
        key,
        kind,
        // Kept inside the screen when the spawn sits near an edge.
        ...clampInside(
          { x: screen.x, y: screen.y - height / 2 - TIP - 6 },
          innerRect(view, layout, { w: width / 2, h: height / 2 }),
        ),
        angle: Math.PI / 2,
        size,
        color,
        label,
        parts,
        width,
        height,
        onScreen: true,
      });
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
    add('castle', 'castle', state.castle.pos, 3, ALERT_RED, [{ icon: 'keep', count: null }]);

  const bosses = state.enemies.filter((e) => req(ctx.enemies, e.type).archetype === 'boss');
  for (const b of bosses)
    add(`boss-${b.id}`, 'boss', b.pos, 3, BOSS_RED, [{ icon: enemyIcon(b.type), count: null }]);

  const hitBuildings = state.buildings
    .filter((b) => !b.destroyed && recent(`b${b.id}`))
    .sort((a, b) => (lastHit.get(`b${b.id}`) ?? 0) - (lastHit.get(`b${a.id}`) ?? 0));
  for (const b of hitBuildings)
    add(`b${b.id}`, 'building', b.pos, 2, ALERT_RED, [{ icon: 'house', count: null }]);

  const bossIds = new Set(bosses.map((b) => b.id));
  const groups = enemyGroups(state, (id) => bossIds.has(id));
  // Stable keys (lane and rank along the lane) so a marker keeps its identity while its group
  // moves, instead of being replaced every time its centre crosses a metre.
  const rank = new Map<EnemyGroup, number>();
  for (const lane of new Set(groups.map((g) => g.lane))) {
    const start = req(ctx.lanes, lane).points[0]!;
    groups
      .filter((g) => g.lane === lane)
      .sort((a, b) => dist2(b.pos, start) - dist2(a.pos, start))
      .forEach((g, i) => rank.set(g, i));
  }
  groups.sort((a, b) => b.count - a.count);
  for (const g of groups)
    add(`g-${g.lane}-${rank.get(g)}`, 'group', g.pos, sizeFor(g.count), ENEMY_RED, [
      { icon: enemyIcon(g.main), count: g.count },
    ]);
  return out.slice(0, MAX_ARROWS);
}
