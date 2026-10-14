/**
 * Automatic checks on a downloaded Scenario output, and its normalisation into a master:
 * trimmed, scaled to 1 m = 64 px and placed on the manifest canvas at its anchor.
 *
 * What a machine cannot judge (missing limbs, wrong weapon, siege mechanics, building identity)
 * is listed per asset in `checks` and shown on the review sheet for a human.
 */
import sharp from 'sharp';
import { KIND_RULES, type Asset } from './manifest.ts';

export interface Issue {
  level: 'error' | 'warn';
  code: string;
  message: string;
}

export interface Analysis {
  width: number;
  height: number;
  hasAlpha: boolean;
  /** Bounding box of pixels with alpha > 8. */
  bbox: { x: number; y: number; w: number; h: number } | null;
  transparentRatio: number;
  issues: Issue[];
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

async function raw(png: Buffer): Promise<Raw & { hasAlpha: boolean; format: string }> {
  const img = sharp(png);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    hasAlpha: meta.hasAlpha ?? false,
    format: meta.format ?? 'unknown',
  };
}

const alphaAt = (r: Raw, x: number, y: number) => r.data[(y * r.width + x) * 4 + 3] ?? 0;

function bboxOf(r: Raw, threshold = 8): Analysis['bbox'] {
  let x0 = r.width,
    y0 = r.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (alphaAt(r, x, y) > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Sizeable connected blobs of the alpha mask, on a coarse grid. */
function countBlobs(r: Raw, grid = 96, minShare = 0.03): number {
  const sx = r.width / grid,
    sy = r.height / grid;
  const mask = new Uint8Array(grid * grid);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      mask[gy * grid + gx] =
        alphaAt(r, Math.floor((gx + 0.5) * sx), Math.floor((gy + 0.5) * sy)) > 64 ? 1 : 0;
    }
  }
  const total = mask.reduce((a, b) => a + b, 0);
  const seen = new Uint8Array(grid * grid);
  let blobs = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop() as number;
      size++;
      const x = j % grid,
        y = (j - x) / grid;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx,
          ny = y + dy;
        const k = ny * grid + nx;
        if (nx >= 0 && ny >= 0 && nx < grid && ny < grid && mask[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (size >= total * minShare) blobs++;
  }
  return blobs;
}

export async function analyze(png: Buffer, asset: Asset): Promise<Analysis> {
  const issues: Issue[] = [];
  const add = (level: Issue['level'], code: string, message: string) =>
    issues.push({ level, code, message });
  let r: Awaited<ReturnType<typeof raw>>;
  try {
    r = await raw(png);
  } catch {
    add('error', 'decode', 'Not a readable image.');
    return { width: 0, height: 0, hasAlpha: false, bbox: null, transparentRatio: 0, issues };
  }
  if (r.format !== 'png') add('error', 'format', `Expected PNG, got ${r.format}.`);
  if (r.width !== asset.generate.w || r.height !== asset.generate.h) {
    add(
      'error',
      'size',
      `Expected ${asset.generate.w}x${asset.generate.h}, got ${r.width}x${r.height}.`,
    );
  }
  let clear = 0;
  for (let i = 3; i < r.data.length; i += 4) if ((r.data[i] ?? 0) === 0) clear++;
  const transparentRatio = clear / (r.width * r.height);
  const bbox = bboxOf(r);
  const rule = KIND_RULES[asset.kind];

  if (!rule.transparent) {
    if (clear > 0) add('error', 'opaque', 'Tiles and backdrops must be fully opaque.');
    if (asset.kind === 'tile') {
      const seam = seamDifference(r);
      if (seam > 24)
        add('warn', 'seam', `Edges differ by ${seam.toFixed(0)}/255: may not tile seamlessly.`);
    }
    return {
      width: r.width,
      height: r.height,
      hasAlpha: r.hasAlpha,
      bbox,
      transparentRatio,
      issues,
    };
  }

  if (!r.hasAlpha) add('error', 'no-alpha', 'No alpha channel: the background is not transparent.');
  const corners = [
    [0, 0],
    [r.width - 1, 0],
    [0, r.height - 1],
    [r.width - 1, r.height - 1],
  ] as const;
  if (corners.some(([x, y]) => alphaAt(r, x, y) !== 0)) {
    add('error', 'background', 'Corners are not transparent (painted background or checkerboard).');
  }
  if (transparentRatio < 0.15) {
    add('error', 'background', `Only ${(transparentRatio * 100).toFixed(0)}% transparent pixels.`);
  }
  if (!bbox) {
    add('error', 'empty', 'Image is fully transparent.');
  } else {
    const m = 2;
    if (
      !rule.groundAllowed &&
      (bbox.x < m || bbox.y < m || bbox.x + bbox.w > r.width - m || bbox.y + bbox.h > r.height - m)
    ) {
      add('error', 'cutoff', 'Subject touches the image edge: it may be cut off.');
    }
    if (bbox.w * bbox.h < r.width * r.height * 0.01) add('error', 'tiny', 'Subject is too small.');
    // A long weapon painted diagonally or the wrong way round ends up tiny on its slim canvas.
    if (asset.kind === 'weapon' || asset.kind === 'projectile') {
      const want = asset.canvas.w / asset.canvas.h;
      const got = bbox.w / bbox.h;
      if ((want >= 2 && got < want / 2.5) || (want <= 0.5 && got > want * 2.5)) {
        add(
          'error',
          'orientation',
          `Shape ${bbox.w}x${bbox.h} does not fit its ${asset.canvas.w}x${asset.canvas.h} canvas: tilted or turned?`,
        );
      }
    }
  }
  if (!rule.multiBlob && bbox) {
    const blobs = countBlobs(r);
    if (blobs > 1) add('warn', 'blobs', `${blobs} separate shapes: duplicated or merged subjects?`);
  }
  const halo = haloShare(r);
  if (halo > 0.35)
    add('warn', 'halo', `${(halo * 100).toFixed(0)}% of edge pixels are near-white: halo?`);
  return { width: r.width, height: r.height, hasAlpha: r.hasAlpha, bbox, transparentRatio, issues };
}

function seamDifference(r: Raw): number {
  let sum = 0,
    n = 0;
  const px = (x: number, y: number, c: number) => r.data[(y * r.width + x) * 4 + c] ?? 0;
  for (let y = 0; y < r.height; y++)
    for (let c = 0; c < 3; c++, n++) sum += Math.abs(px(0, y, c) - px(r.width - 1, y, c));
  for (let x = 0; x < r.width; x++)
    for (let c = 0; c < 3; c++, n++) sum += Math.abs(px(x, 0, c) - px(x, r.height - 1, c));
  return sum / n;
}

function haloShare(r: Raw): number {
  let edge = 0,
    white = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    const a = r.data[i + 3] ?? 0;
    if (a > 0 && a < 200) {
      edge++;
      if (Math.min(r.data[i] ?? 0, r.data[i + 1] ?? 0, r.data[i + 2] ?? 0) > 230) white++;
    }
  }
  return edge === 0 ? 0 : white / edge;
}

export const hasErrors = (a: Analysis) => a.issues.some((i) => i.level === 'error');

/** Trims, scales and places the subject on the manifest canvas. Returns a lossless PNG. */
export async function normalize(png: Buffer, asset: Asset): Promise<Buffer> {
  const { w: cw, h: ch } = asset.canvas;
  const rule = KIND_RULES[asset.kind];
  if (!rule.transparent) {
    const fitted = await sharp(png)
      .resize(cw, ch, { fit: 'cover' })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
    return asset.kind === 'tile' ? makeSeamless(fitted) : fitted;
  }
  const r = await raw(png);
  const bbox = bboxOf(r);
  if (!bbox) throw new Error('Nothing to normalise: the image is empty.');
  const margin = 0.04;
  const maxW = cw * (1 - 2 * margin);
  const maxH = rule.grounded ? ch * asset.anchor.y * (1 - margin) : ch * (1 - 2 * margin);
  let scale = asset.heightPx ? asset.heightPx / bbox.h : Math.min(maxW / bbox.w, maxH / bbox.h);
  scale = Math.min(scale, maxW / bbox.w, maxH / bbox.h);
  const w = Math.max(1, Math.round(bbox.w * scale));
  const h = Math.max(1, Math.round(bbox.h * scale));
  const subject = await sharp(png)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h })
    .resize(w, h, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const left = Math.round(cw * asset.anchor.x - w / 2);
  const top = rule.grounded
    ? Math.round(ch * asset.anchor.y - h)
    : Math.round(ch * asset.anchor.y - h / 2);
  return sharp({
    create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: subject, left: Math.max(0, left), top: Math.max(0, top) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Makes an opaque tile wrap without visible seams. Image models paint "seamless" textures with
 * broad light and dark areas, so a grid of them shows bands at every edge. First the broad
 * lighting is flattened (divided by a heavy blur, scaled back to the tile's mean colour), then a
 * band along each edge is cross-faded with the tile shifted by half its size, whose edges wrap
 * exactly. Apply once per generated tile: it is not idempotent.
 */
export async function makeSeamless(png: Buffer, band = 0.15): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const blur = await sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .blur(Math.max(w, h) / 6)
    .raw()
    .toBuffer();
  const mean = [0, 0, 0];
  for (let i = 0; i < data.length; i++) mean[i % 3]! += data[i]!;
  for (let c = 0; c < 3; c++) mean[c]! /= w * h;
  const flat = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    flat[i] = (data[i]! * mean[i % 3]!) / Math.max(1, blur[i]!);
  }
  const out = Buffer.alloc(data.length);
  const bw = Math.max(1, Math.round(Math.min(w, h) * band));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, w - 1 - x, y, h - 1 - y);
      const t = d >= bw ? 0 : 1 - d / bw;
      const m = t * t * (3 - 2 * t);
      const i = (y * w + x) * 3;
      const j = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * 3;
      for (let c = 0; c < 3; c++) {
        const v = flat[i + c]! * (1 - m) + flat[j + c]! * m;
        out[i + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
