/**
 * The panda art (art/runtime, packed by tools/art-pipeline): which atlases exist, which frame
 * draws each content id, and how weapons sit in hands. View-only (ADR-004).
 *
 * The atlases are found at build time. A checkout without art/runtime loads nothing, and every
 * id keeps its code-drawn stand-in from sprites.ts; a frame that is missing (not generated yet,
 * or rejected) falls back the same way, so new art slots in by repacking the atlases alone.
 *
 * Atlases are Phaser JSON Hash, one per group; the frame name is the part id (`footman`,
 * `footman.back`, `king_roll_walk.f2`, `gate_wood.side.f1`) and each frame carries its pivot
 * (the feet, or the centre of effects and weapons). Art is painted at 1 m = 64 px.
 */
import type Phaser from 'phaser';
import type { KingAction } from './animation.ts';

const files = import.meta.glob(
  ['../../../../art/runtime/*.{json,webp}', '!../../../../art/runtime/index.json'],
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>;

/** Art pixels per metre (the pipeline's scale). */
export const ART_PX_PER_M = 64;

export interface AtlasFiles {
  key: string;
  image: string;
  json: string;
}

/** Pairs each atlas image with its JSON by name (index.json is the pipeline's own list). */
export function atlasFiles(urls: Record<string, string>): AtlasFiles[] {
  const byName = new Map<string, { image?: string; json?: string }>();
  for (const [path, url] of Object.entries(urls)) {
    const m = /([^/]+)\.(json|webp)$/.exec(path);
    if (!m || m[1] === 'index') continue;
    const entry = byName.get(m[1]!) ?? {};
    if (m[2] === 'json') entry.json = url;
    else entry.image = url;
    byName.set(m[1]!, entry);
  }
  const out: AtlasFiles[] = [];
  for (const [key, e] of byName)
    if (e.image && e.json) out.push({ key: `art:${key}`, image: e.image, json: e.json });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export const ATLASES = atlasFiles(files);

/** Queues the atlases on a scene's loader (a no-op without art). */
export function loadArt(load: Phaser.Loader.LoaderPlugin): void {
  for (const a of ATLASES) load.atlas(a.key, a.image, a.json);
}

/** How a weapon layer is held and swung (the drawing points as the pipeline laid it out). */
export interface WeaponRig {
  frame: string;
  /** The grip, as a fraction of the weapon's canvas: it sits in the hand. */
  grip: [number, number];
  /** Where the weapon points as drawn, in radians (0 = right, -π/2 = up). */
  points: number;
  /** `swing`: raised, then struck forward. `thrust`: levelled and pushed. `aim`: held still. */
  kind: 'swing' | 'thrust' | 'aim';
  /**
   * Its length (the longer side) as a fraction of the body's height: weapon layers were painted
   * to fill their canvas, not to scale with the body.
   */
  length: number;
  /** Where it is held, when not the front hand (HAND): forward and up, fractions of the body. */
  hand?: [number, number];
}

/** The front hand, as a fraction of the body's drawn width (forward) and height (up). */
export const HAND: [number, number] = [0.28, 0.42];

const UP = -Math.PI / 2;

export const RIGS: Record<string, WeaponRig> = {
  king: { frame: 'king_spear', grip: [0.42, 0.5], points: 0, kind: 'thrust', length: 1.3 },
  footman: {
    frame: 'footman_weapon',
    grip: [0.5, 0.5],
    points: -1.1,
    kind: 'swing',
    length: 0.9,
  },
  knight: { frame: 'knight_weapon', grip: [0.24, 0.5], points: 0, kind: 'swing', length: 0.8 },
  archer: { frame: 'archer_weapon', grip: [0.5, 0.5], points: UP, kind: 'aim', length: 0.75 },
  crossbowman: {
    frame: 'crossbowman_weapon',
    grip: [0.4, 0.55],
    points: 0,
    kind: 'aim',
    length: 0.65,
  },
  raider: { frame: 'raider_weapon', grip: [0.42, 0.85], points: UP, kind: 'swing', length: 0.55 },
  skirmisher: {
    frame: 'skirmisher_weapon',
    grip: [0.5, 0.5],
    points: UP,
    kind: 'aim',
    length: 0.75,
  },
  brute: { frame: 'brute_weapon', grip: [0.14, 0.5], points: 0, kind: 'swing', length: 0.85 },
  // Carried in the talons, below the body.
  harpy: {
    frame: 'harpy_weapon',
    grip: [0.45, 0.85],
    points: -1.9,
    kind: 'swing',
    length: 0.5,
    hand: [0.1, -0.3],
  },
  warlord: { frame: 'warlord_weapon', grip: [0.15, 0.5], points: 0, kind: 'swing', length: 0.9 },
};

/**
 * The weapon's rotation for a swing from 0 to 1, as the code-drawn weapons move: raised and a
 * little back, then struck forward; a spear levels into a thrust; a bow stays as it is held.
 */
export function weaponAngle(rig: WeaponRig, swing: number): number {
  switch (rig.kind) {
    case 'swing':
      return UP - 0.35 + swing * (Math.PI / 2 + 0.2) - rig.points;
    case 'thrust':
      return -1.34 + swing * 1.2 - rig.points;
    case 'aim':
      return 0;
  }
}

/**
 * The catapult's throwing arm, a layer over its chassis: cocked (`.f1`) until it throws, then
 * released (`.f2`). `hub` is the axle in each frame's canvas; it sits on the chassis axle,
 * `axle` of the chassis' drawn height above its feet.
 */
export const CATAPULT_ARM = {
  name: 'catapult_arm',
  hub: [
    [0.16, 0.81],
    [0.37, 0.8],
  ] as [number, number][],
  axle: 0.5,
};

/** Frames drawing the king: the rolling panda king on foot (the default king, design note). */
const KING = { idle: 'king_roll_idle', walk: 'king_roll_walk' };

/** Building and structure frames whose name differs from the content id. */
const ALIAS: Record<string, string> = { castle: 'castle_1', catapult: 'catapult_chassis' };

/** Walk frames per stride (two steps); one stride is animation.ts's STRIDE_M. */
const FRAMES_PER_STRIDE = 4;
/** A flyer's wingbeat: one frame this long, played up and down (1 2 3 2). */
const FLAP_MS = 110;

/** Everything the scene needs to know about the loaded frames. */
export class Art {
  private where = new Map<string, string>();
  private counts = new Map<string, number>();

  /** `frames` lists each atlas key with its frame names (from the texture manager). */
  constructor(frames: Iterable<[atlas: string, names: readonly string[]]>) {
    for (const [atlas, names] of frames)
      for (const name of names) if (name !== '__BASE') this.where.set(name, atlas);
  }

  static fromTextures(textures: Phaser.Textures.TextureManager): Art {
    return new Art(
      ATLASES.filter((a) => textures.exists(a.key)).map(
        (a) => [a.key, textures.get(a.key).getFrameNames()] as [string, string[]],
      ),
    );
  }

  get empty(): boolean {
    return this.where.size === 0;
  }

  /** The atlas holding a frame, or undefined when it does not exist. */
  atlas(frame: string): string | undefined {
    return this.where.get(frame);
  }

  has(frame: string): boolean {
    return this.where.has(frame);
  }

  /** How many numbered frames (`name.f1`, `name.f2`, ...) a sequence has. */
  private count(name: string): number {
    let n = this.counts.get(name);
    if (n === undefined) {
      n = 0;
      while (this.where.has(`${name}.f${n + 1}`)) n++;
      this.counts.set(name, n);
    }
    return n;
  }

  /** A still frame or one frame of a sequence; `pick` turns the frame count into an index. */
  private pick(name: string, pick: (n: number) => number): string | null {
    if (this.where.has(name)) return name;
    const n = this.count(name);
    return n > 0 ? `${name}.f${(pick(n) % n) + 1}` : null;
  }

  /**
   * The body frame of an actor: the back view while it walks up the screen (the front one when
   * there is no back view), the walk cycle while it walks, the wingbeat of a flyer. Null when
   * this id has no art.
   */
  body(
    id: string,
    pose: { back: boolean; walked: number; moving: boolean },
    strideM: number,
    now: number,
    action: KingAction | null = null,
  ): string | null {
    if (id === 'king' && action) {
      const frame =
        action.phase === 'anticipate'
          ? this.still('king_roll_anticipate')
          : action.phase === 'roll'
            ? this.pick('king_roll_roll', () => Math.floor(action.elapsed / 60))
            : this.at('king_roll_uncurl', action.elapsed / 160);
      if (frame) return frame;
    }
    const step = (n: number) =>
      n === 1 ? 0 : Math.floor((pose.walked / strideM) * FRAMES_PER_STRIDE);
    const flap = (n: number) => {
      // Up and down again: 0 1 2 1 0 1 2 ...
      const cycle = Math.max(1, 2 * (n - 1));
      const i = Math.floor(now / FLAP_MS) % cycle;
      return i < n ? i : cycle - i;
    };
    const bases =
      id === 'king' ? (pose.moving ? [KING.walk, KING.idle] : [KING.idle]) : [ALIAS[id] ?? id];
    for (const base of bases) {
      const views = pose.back ? [`${base}.back`, base] : [base];
      for (const name of views) {
        const frame = this.pick(name, id === 'harpy' ? flap : step);
        if (frame) return frame;
      }
    }
    return null;
  }

  /** A still frame for a building, structure or effect (the first of a sequence). */
  still(id: string): string | null {
    return this.pick(ALIAS[id] ?? id, () => 0);
  }

  /** One frame of a sequence `t` of the way through it (0 to 1). */
  at(name: string, t: number): string | null {
    return this.pick(name, (n) => Math.min(n - 1, Math.floor(Math.max(0, t) * n)));
  }

  /** The weapon layer of an actor, when its art exists. */
  rig(id: string): WeaponRig | null {
    const rig = RIGS[id];
    return rig && this.where.has(rig.frame) ? rig : null;
  }
}
