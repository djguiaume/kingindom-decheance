/**
 * The panda art the Vue HUD and menus draw (F14): one map from UI roles and content ids to
 * frames of the runtime atlases (art/runtime), so the DOM shows the same paintings as the game.
 *
 * Phaser atlas frames are not image URLs, so a frame is drawn as a CSS background cut from its
 * atlas page (ArtSprite.vue). A checkout without art/runtime finds nothing here, and every caller
 * keeps its icon from icons.ts; text, numbers and focus states always stay live UI.
 */
import { ATLASES, TEXTURES } from './game/art.ts';

/** One frame on an atlas page, in page pixels. */
export interface UiFrame {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pageW: number;
  pageH: number;
}

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { size: { w: number; h: number } };
}

const json = import.meta.glob(['../../../art/runtime/*.json', '!../../../art/runtime/index.json'], {
  eager: true,
  import: 'default',
}) as Record<string, AtlasJson>;

/** Indexes every frame of every atlas by name; the first atlas holding a name wins. */
export function indexFrames(
  pages: { name: string; url: string; atlas: AtlasJson }[],
): Map<string, UiFrame> {
  const out = new Map<string, UiFrame>();
  for (const { url, atlas } of pages)
    for (const [name, f] of Object.entries(atlas.frames))
      if (!out.has(name))
        out.set(name, { url, ...f.frame, pageW: atlas.meta.size.w, pageH: atlas.meta.size.h });
  return out;
}

const pages = ATLASES.flatMap((a) => {
  const name = a.key.replace(/^art:/, '');
  const atlas = Object.entries(json).find(([path]) => path.endsWith(`/${name}.json`))?.[1];
  return atlas ? [{ name, url: a.image, atlas }] : [];
});
const frames = indexFrames(pages);

/** Content ids drawn by a frame of another name (walls by their post, the catapult by its body,
 * the harpy by a wingbeat). */
const ALIAS: Record<string, string> = {
  wall: 'wall_post',
  stone_wall: 'stone_wall_post',
  catapult: 'catapult_chassis',
  castle: 'castle_1',
  harpy: 'harpy.f2',
};

/** UI roles that have a painting (corpus 14 identity, panda pass). */
export const UI_ART = {
  portrait: 'king_portrait',
  crown: 'king_crown',
  coin: 'coin',
  banner: 'panda_banner',
  flag: 'castle_flag',
} as const;
export type UiRole = keyof typeof UI_ART;

/** The frame for a UI role or a content id (building, enemy, unit), or null without art. */
export function uiFrame(id: string): UiFrame | null {
  const name = (UI_ART as Record<string, string>)[id] ?? ALIAS[id] ?? id;
  return frames.get(name) ?? null;
}

/** The castle's painting at a level (1 to 3). */
export const castleArt = (level: number): string => `castle_${Math.min(3, Math.max(1, level))}`;

/** The painted kingdom backdrop for the title screen, or null without art. */
export const backdropUrl: string | null =
  TEXTURES.find((t) => t.key === 'art:map_background')?.image ?? null;
