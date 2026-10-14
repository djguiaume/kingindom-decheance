/**
 * Runtime export: trimmed, padded WebP texture atlases in Phaser's JSON Hash format, one per
 * manifest group (split into pages when full), plus standalone WebP images for tiles and
 * backdrops (they repeat or fill the screen, so they stay out of atlases).
 *
 * Each frame keeps its untrimmed `sourceSize` and a normalised `pivot`, which Phaser 4.2.1's
 * JSONHash parser turns into the frame's custom pivot: a sprite placed at the entity's ground
 * point stands on its feet with no per-sprite offsets in game code.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { GROUPS, type Asset, type Manifest, type Part } from './manifest.ts';

export const PAGE_SIZE = 2048;
export const PADDING = 2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Packed<T> {
  item: T;
  x: number;
  y: number;
  page: number;
}

/** Shelf packing, tallest first: simple, deterministic and good enough for sprite sets. */
export function pack<T extends { w: number; h: number }>(
  items: T[],
  size = PAGE_SIZE,
  pad = PADDING,
): Packed<T>[] {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const out: Packed<T>[] = [];
  let page = 0,
    x = pad,
    y = pad,
    shelf = 0;
  for (const item of sorted) {
    if (item.w + 2 * pad > size || item.h + 2 * pad > size) {
      throw new Error(`A ${item.w}x${item.h} frame does not fit a ${size} px atlas page.`);
    }
    if (x + item.w + pad > size) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    if (y + item.h + pad > size) {
      page++;
      x = pad;
      y = pad;
      shelf = 0;
    }
    out.push({ item, x, y, page });
    x += item.w + pad;
    shelf = Math.max(shelf, item.h);
  }
  return out;
}

export interface PhaserFrame {
  frame: Rect;
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: Rect;
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
  /** Extra data, kept by Phaser in frame.customData. */
  asset: string;
  num: number;
  contentId?: string;
}

export interface RuntimeIndex {
  scale: string;
  atlases: { key: string; image: string; json: string; frames: string[] }[];
  images: { key: string; image: string; num: number; tile: boolean; contentId?: string }[];
  /** part id -> where to find it. */
  frames: Record<
    string,
    { atlas?: string; image?: string; num: number; asset: string; contentId?: string }
  >;
}

interface Trimmed {
  asset: Asset;
  part: Part;
  png: Buffer;
  w: number;
  h: number;
  trim: Rect;
}

async function trimMaster(file: string, asset: Asset, part: Part): Promise<Trimmed> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) {
    x0 = 0;
    y0 = 0;
    x1 = 0;
    y1 = 0;
  }
  const trim = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const png = await sharp(file)
    .extract({ left: trim.x, top: trim.y, width: trim.w, height: trim.h })
    .png()
    .toBuffer();
  return { asset, part, png, w: trim.w, h: trim.h, trim };
}

/** Builds every atlas from the masters that exist. Returns the index; missing masters are skipped. */
export async function buildRuntime(
  root: string,
  manifest: Manifest,
  outDir: string,
): Promise<RuntimeIndex> {
  await mkdir(outDir, { recursive: true });
  const index: RuntimeIndex = { scale: '1 m = 64 px', atlases: [], images: [], frames: {} };

  for (const asset of manifest.assets.filter((a) => !a.transparent)) {
    for (const part of asset.parts) {
      const src = join(root, part.master);
      if (!existsSync(src)) continue;
      const image = `${part.id}.webp`;
      await sharp(src).webp({ quality: 88, effort: 6 }).toFile(join(outDir, image));
      index.images.push({
        key: part.id,
        image,
        num: asset.num,
        tile: asset.kind === 'tile',
        ...(asset.contentId ? { contentId: asset.contentId } : {}),
      });
      index.frames[part.id] = {
        image,
        num: asset.num,
        asset: asset.id,
        ...(asset.contentId ? { contentId: asset.contentId } : {}),
      };
    }
  }

  for (const group of GROUPS) {
    const trimmed: Trimmed[] = [];
    for (const asset of manifest.assets.filter((a) => a.group === group && a.transparent)) {
      for (const part of asset.parts) {
        const src = join(root, part.master);
        if (existsSync(src)) trimmed.push(await trimMaster(src, asset, part));
      }
    }
    if (trimmed.length === 0) continue;
    const packed = pack(trimmed);
    const pages = Math.max(...packed.map((p) => p.page)) + 1;
    for (let page = 0; page < pages; page++) {
      const onPage = packed.filter((p) => p.page === page);
      const key = pages > 1 ? `${group}-${page}` : group;
      const width = Math.max(...onPage.map((p) => p.x + p.item.w)) + PADDING;
      const height = Math.max(...onPage.map((p) => p.y + p.item.h)) + PADDING;
      const frames: Record<string, PhaserFrame> = {};
      for (const { item, x, y } of onPage) {
        frames[item.part.id] = {
          frame: { x, y, w: item.w, h: item.h },
          rotated: false,
          trimmed: true,
          spriteSourceSize: item.trim,
          sourceSize: { w: item.asset.canvas.w, h: item.asset.canvas.h },
          pivot: item.asset.anchor,
          asset: item.asset.id,
          num: item.asset.num,
          ...(item.asset.contentId ? { contentId: item.asset.contentId } : {}),
        };
        index.frames[item.part.id] = {
          atlas: key,
          num: item.asset.num,
          asset: item.asset.id,
          ...(item.asset.contentId ? { contentId: item.asset.contentId } : {}),
        };
      }
      const image = `${key}.webp`;
      await sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(onPage.map((p) => ({ input: p.item.png, left: p.x, top: p.y })))
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toFile(join(outDir, image));
      const json = `${key}.json`;
      const sortedFrames = Object.fromEntries(
        Object.entries(frames).sort(([a], [b]) => a.localeCompare(b)),
      );
      await writeFile(
        join(outDir, json),
        `${JSON.stringify({ frames: sortedFrames, meta: { app: '@kd/art-pipeline', version: '1', image, format: 'RGBA8888', size: { w: width, h: height }, scale: '1' } }, null, 2)}\n`,
      );
      index.atlases.push({ key, image, json, frames: Object.keys(sortedFrames) });
    }
  }
  await writeFile(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
