/**
 * Painted cliffs for any map: each cliff line of the map is raised into a continuous rock wall
 * that follows the line in every direction, round ends and bends included. Its grass top covers
 * exactly the ground the core blocks (a strip `width` metres wide), and a rock face drops from
 * it wherever the edge faces the camera, so a ring of cliffs reads as a ring, not as a pile of
 * flat terrace pieces.
 *
 * The whole relief is painted once into a map-sized canvas, then cut into short pieces along each
 * line. The pieces join exactly, and each one sorts by its own ground line, so actors walk in
 * front of and behind the cliff correctly. View-only (ADR-004).
 */
import type Phaser from 'phaser';
import type { GameMap } from '@kd/content';
import { SCALE, SQUASH } from './camera.ts';
import { ART_PX_PER_M, type Art } from './art.ts';

type Pt = readonly [number, number];
interface Xy {
  x: number;
  y: number;
}

/** How high a cliff stands above the ground, in metres: well above a panda's head. */
export const CLIFF_HEIGHT = 2.2;
/** Longest piece along a cliff line, in metres; short pieces keep the depth order right. */
const PIECE = 1.5;
/** Ground kept around the strip in each piece, in metres: just the anti-aliased edge. */
const MARGIN = 0.05;

/**
 * Rows of `cliff_section`, as fractions of its untrimmed canvas, measured on the master: the
 * grass lip that overhangs the face, then the rock face down to the ground.
 */
const LIP_TOP = 116 / 192;
const ROCK_TOP = 130 / 192;
const ROCK_BOTTOM = 171 / 192;
/** The painted rock is drawn a little larger than the art's own scale, as befits a tall wall. */
const ROCK_ZOOM = 1.4;

/** One piece of a cliff: where it is cut, in scene pixels, and the ground y it sorts by. */
export interface CliffPiece {
  /** The piece's outline in scene pixels: ground between its two cuts, raised by the height. */
  outline: Xy[];
  /** Ground y (scene pixels) of the line at the piece's middle: its painter's order. */
  sortY: number;
}

const screen = (x: number, y: number): Xy => ({ x: x * SCALE, y: y * SCALE * SQUASH });

/** The texture holding every painted cliff piece. */
export const CLIFF_TEXTURE = 'painted:cliffs';

/** A painted piece: its frame in CLIFF_TEXTURE, drawn with its top-left corner at (x, y). */
export interface CliffSprite {
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ground y it sorts by among everything standing up. */
  sortY: number;
}

/** Convex hull, counter-clockwise (monotone chain). */
function hull(points: Xy[]): Xy[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Xy, a: Xy, b: Xy) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Xy[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Xy[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Cuts a cliff line into pieces at most PIECE metres long. Neighbouring pieces share their cut,
 * which runs across the line (along the bisector at a bend), so together they cover the whole
 * cliff once; the first and last pieces reach past the ends to hold the rounded caps.
 */
export function cliffPieces(
  points: readonly Pt[],
  width: number,
  height = CLIFF_HEIGHT,
): CliffPiece[] {
  const pts = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1],
  );
  if (pts.length < 2) return [];
  const reach = width / 2 + MARGIN;
  const lift = height * SCALE;
  const dir = (a: Pt, b: Pt) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as const;
  };
  // Cut direction (across the line) and half-length at each vertex.
  const cuts = pts.map((_, i) => {
    const before = i > 0 ? dir(pts[i - 1]!, pts[i]!) : null;
    const after = i < pts.length - 1 ? dir(pts[i]!, pts[i + 1]!) : null;
    const t = before && after ? [before[0] + after[0], before[1] + after[1]] : (before ?? after)!;
    const tl = Math.hypot(t[0], t[1]) || 1;
    const tangent = [t[0] / tl, t[1] / tl] as const;
    // A bisector cut is longer than a square one so it still spans the whole strip.
    const cos =
      before && after ? Math.max(0.5, before[0] * tangent[0] + before[1] * tangent[1]) : 1;
    return { across: [-tangent[1], tangent[0]] as const, half: reach / cos };
  });
  const pieces: CliffPiece[] = [];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    let b = pts[i]!;
    const d = dir(a, b);
    // The ends reach past the line's endpoints to hold the caps.
    if (i === 1) a = [a[0] - d[0] * reach, a[1] - d[1] * reach];
    if (i === pts.length - 1) b = [b[0] + d[0] * reach, b[1] + d[1] * reach];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(length / PIECE));
    const ca = cuts[i - 1]!;
    const cb = cuts[i]!;
    for (let k = 0; k < n; k++) {
      const at = (t: number) => {
        // Cuts inside a segment run square across it; the end cuts use the vertex's bisector.
        const cut = t === 0 ? ca : t === 1 ? cb : { across: [-d[1], d[0]] as const, half: reach };
        const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
        return [
          screen(c[0] - cut.across[0] * cut.half, c[1] - cut.across[1] * cut.half),
          screen(c[0] + cut.across[0] * cut.half, c[1] + cut.across[1] * cut.half),
        ];
      };
      const ground = [...at(k / n), ...at((k + 1) / n)];
      const raised = ground.map((p) => ({ x: p.x, y: p.y - lift - 2 }));
      const mid = (k + 0.5) / n;
      pieces.push({
        outline: hull([...ground, ...raised]),
        sortY: (a[1] + (b[1] - a[1]) * mid) * SCALE * SQUASH,
      });
    }
  }
  return pieces;
}

/** A canvas copy of an atlas frame, or null when the frame is missing. */
function frameCanvas(scene: Phaser.Scene, art: Art, name: string) {
  const atlas = art.atlas(name);
  if (!atlas) return null;
  const frame = scene.textures.getFrame(atlas, name);
  const source = frame?.source.image;
  if (!frame || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement))
    return null;
  const c = document.createElement('canvas');
  c.width = frame.cutWidth;
  c.height = frame.cutHeight;
  c.getContext('2d')!.drawImage(
    source,
    frame.cutX,
    frame.cutY,
    frame.cutWidth,
    frame.cutHeight,
    0,
    0,
    frame.cutWidth,
    frame.cutHeight,
  );
  // Rows measured on the untrimmed canvas, shifted by the trim.
  const top = frame.y;
  return { canvas: c, top, full: frame.realHeight };
}

/**
 * The face texture, `rise` pixels tall: the painted grass lip, then the painted rock repeated
 * down to the ground (each course shifted sideways so the repeat does not show), darkening
 * towards the foot.
 */
function faceTexture(scene: Phaser.Scene, art: Art, rise: number): HTMLCanvasElement | null {
  const art106 = frameCanvas(scene, art, 'cliff_section');
  if (!art106) return null;
  const { canvas: src, top, full } = art106;
  const row = (f: number) => Math.round(f * full) - top;
  const lip0 = row(LIP_TOP);
  const rock0 = row(ROCK_TOP);
  const rock1 = Math.min(src.height, row(ROCK_BOTTOM));
  if (lip0 < 0 || rock1 <= rock0) return null;
  // Keep clear of the painted piece's left and right ends.
  const inset = Math.round(src.width * 0.08);
  const sw = src.width - inset * 2;
  const k = (SCALE / ART_PX_PER_M) * ROCK_ZOOM;
  const w = Math.round(sw * k);
  const lipH = Math.round((rock0 - lip0) * k);
  const courseH = Math.round((rock1 - rock0) * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.max(1, Math.round(rise));
  const g = c.getContext('2d')!;
  for (let y = lipH, course = 0; y < c.height; y += courseH, course++) {
    const shift = (course % 2) * Math.round(w / 2);
    for (const dx of [-shift, w - shift])
      g.drawImage(src, inset, rock0, sw, rock1 - rock0, dx, y, w, courseH);
  }
  g.drawImage(src, inset, lip0, sw, rock0 - lip0, 0, 0, w, lipH);
  const shade = g.createLinearGradient(0, 0, 0, c.height);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0.08)');
  shade.addColorStop(1, 'rgba(20,16,10,0.42)');
  g.fillStyle = shade;
  g.fillRect(0, lipH, c.width, c.height - lipH);
  return c;
}

/** Traces a cliff line in metres, for stroking under a (1, SQUASH) scale. */
function trace(g: CanvasRenderingContext2D, points: readonly Pt[]) {
  g.beginPath();
  g.moveTo(points[0]![0] * SCALE, points[0]![1] * SCALE);
  for (const p of points.slice(1)) g.lineTo(p[0] * SCALE, p[1] * SCALE);
}

/**
 * Paints the soft shadow at the foot of every cliff into the ground canvas `g` (which is drawn
 * once, under everything), so the cliff pieces themselves need no ground margin to draw.
 */
export function paintCliffShadows(g: CanvasRenderingContext2D, map: GameMap): void {
  g.save();
  g.filter = 'blur(5px)';
  g.setTransform(1, 0, 0, SQUASH, 0, 3);
  g.strokeStyle = 'rgba(24,32,12,0.45)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const c of map.terrain.cliffs) {
    g.lineWidth = (c.width + 0.5) * SCALE;
    trace(g, c.points);
    g.stroke();
  }
  g.restore();
}

/**
 * Paints every cliff of the map and cuts it into pieces, all frames of CLIFF_TEXTURE. Returns null when the cliff art is missing (the placeholder bands in
 * terrain.ts draw them instead).
 */
export function addCliffs(scene: Phaser.Scene, map: GameMap, art: Art): CliffSprite[] | null {
  const cliffs = map.terrain.cliffs;
  if (cliffs.length === 0) return [];
  const grassSrc = scene.textures.exists('art:tile_grass')
    ? scene.textures.get('art:tile_grass').getSourceImage()
    : null;
  const rise = CLIFF_HEIGHT * SCALE;
  const face = faceTexture(scene, art, rise);
  if (!face || !(grassSrc instanceof HTMLImageElement || grassSrc instanceof HTMLCanvasElement))
    return null;

  const W = Math.ceil(map.size[0] * SCALE);
  const H = Math.ceil(map.size[1] * SCALE * SQUASH);
  const whole = document.createElement('canvas');
  whole.width = W;
  whole.height = H;
  const g = whole.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Strokes are shaped in metres and squashed, so round ends become the core's capsules.
  const at = (lift: number) => g.setTransform(1, 0, 0, SQUASH, 0, -lift);

  // The face: the strip raised one pixel at a time, each layer painted with the face row at that
  // height, so the rock follows the edge in any direction and shows only where it faces us.
  const rows = Array.from({ length: face.height }, (_, y) => {
    const r = document.createElement('canvas');
    r.width = face.width;
    r.height = 1;
    r.getContext('2d')!.drawImage(face, 0, y, face.width, 1, 0, 0, face.width, 1);
    return g.createPattern(r, 'repeat')!;
  });
  for (let t = 0; t < face.height; t++) {
    at(t);
    g.strokeStyle = rows[face.height - 1 - t]!;
    for (const c of cliffs) {
      g.lineWidth = c.width * SCALE;
      trace(g, c.points);
      g.stroke();
    }
  }

  // The grass top, rimmed: a dark edge where the plateau drops away behind, a sunlit one in front.
  at(rise);
  const grass = g.createPattern(grassSrc, 'repeat')!;
  grass.setTransform(new DOMMatrix([1, 0, 0, 1 / SQUASH, 0, 0]));
  for (const c of cliffs) {
    trace(g, c.points);
    g.lineWidth = c.width * SCALE;
    g.strokeStyle = 'rgba(52,64,26,0.9)';
    g.stroke();
    g.lineWidth = (c.width - 0.14) * SCALE;
    g.strokeStyle = grass;
    g.stroke();
    g.lineWidth = (c.width - 0.14) * SCALE;
    g.strokeStyle = 'rgba(255,250,200,0.10)';
    g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);

  // Cut the relief into pieces along each line, packed side by side into one texture so every
  // piece draws from it in a single batch.
  const cut = cliffs.flatMap((c) =>
    cliffPieces(c.points, c.width).map((piece) => {
      const xs = piece.outline.map((p) => p.x);
      const ys = piece.outline.map((p) => p.y);
      const x = Math.floor(Math.min(...xs));
      const y = Math.floor(Math.min(...ys));
      return {
        piece,
        x,
        y,
        w: Math.ceil(Math.max(...xs)) - x,
        h: Math.ceil(Math.max(...ys)) - y,
      };
    }),
  );
  const ROW = 2048;
  const slots: { sx: number; sy: number }[] = [];
  let sx = 0;
  let sy = 0;
  let rowH = 0;
  for (const c of cut) {
    if (sx + c.w > ROW) {
      sx = 0;
      sy += rowH + 1;
      rowH = 0;
    }
    slots.push({ sx, sy });
    sx += c.w + 1;
    rowH = Math.max(rowH, c.h);
  }
  if (scene.textures.exists(CLIFF_TEXTURE)) scene.textures.remove(CLIFF_TEXTURE);
  const texture = scene.textures.createCanvas(CLIFF_TEXTURE, ROW, sy + rowH);
  if (!texture) return null;
  const pc = texture.context;
  const out: CliffSprite[] = [];
  cut.forEach(({ piece, x, y, w, h }, i) => {
    const { sx, sy } = slots[i]!;
    pc.save();
    pc.beginPath();
    pc.moveTo(piece.outline[0]!.x - x + sx, piece.outline[0]!.y - y + sy);
    for (const p of piece.outline.slice(1)) pc.lineTo(p.x - x + sx, p.y - y + sy);
    pc.closePath();
    pc.clip();
    pc.drawImage(whole, x, y, w, h, sx, sy, w, h);
    pc.restore();
    const frame = `piece${i}`;
    texture.add(frame, 0, sx, sy, w, h);
    out.push({ frame, x, y, sortY: piece.sortY, w, h });
  });
  texture.refresh();
  return out;
}
