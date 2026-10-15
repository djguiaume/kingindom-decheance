/**
 * The asset manifest: 105 logical assets, each split into generation parts (one per animation
 * frame). art/manifest.json is generated from catalog.ts and validated with Zod on every load.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

export const GROUPS = [
  'kings',
  'friendly',
  'enemies',
  'buildings',
  'structures',
  'effects',
  'environment',
  'map',
] as const;
export type Group = (typeof GROUPS)[number];

/** Number ranges as printed on the v1.2 sheet. */
export const GROUP_RANGES: Record<Group, [number, number]> = {
  kings: [1, 14],
  friendly: [15, 26],
  enemies: [27, 39],
  buildings: [40, 61],
  structures: [62, 72],
  effects: [73, 85],
  environment: [86, 100],
  map: [101, 105],
};

export const ASSET_KINDS = [
  'character',
  'flyer',
  'weapon',
  'siege',
  'building',
  'structure',
  'overlay',
  'projectile',
  'effect',
  'prop',
  'decal',
  'portrait',
  'tile',
  'background',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** How each kind is generated, validated and anchored. */
export interface KindRule {
  /** The sprite has a transparent background (false: an opaque tile or backdrop). */
  transparent: boolean;
  /** Pivot on the final canvas, as a fraction of its size. */
  anchor: { x: number; y: number };
  /** The subject stands on the ground: its base sits on the anchor. Otherwise it is centred. */
  grounded: boolean;
  /** Painted ground under the subject is allowed (buildings' decorations, decals). */
  groundAllowed: boolean;
  /** Several separate blobs are fine (effects, clumps); otherwise one main subject. */
  multiBlob: boolean;
}

export const KIND_RULES: Record<AssetKind, KindRule> = {
  character: {
    transparent: true,
    anchor: { x: 0.5, y: 0.9 },
    grounded: true,
    groundAllowed: false,
    multiBlob: false,
  },
  flyer: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: false,
  },
  weapon: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: false,
  },
  siege: {
    transparent: true,
    anchor: { x: 0.5, y: 0.9 },
    grounded: true,
    groundAllowed: false,
    multiBlob: false,
  },
  building: {
    transparent: true,
    anchor: { x: 0.5, y: 0.9 },
    grounded: true,
    groundAllowed: true,
    multiBlob: true,
  },
  structure: {
    transparent: true,
    anchor: { x: 0.5, y: 0.9 },
    grounded: true,
    groundAllowed: false,
    multiBlob: true,
  },
  overlay: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: true,
  },
  projectile: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: false,
  },
  effect: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: true,
  },
  prop: {
    transparent: true,
    anchor: { x: 0.5, y: 0.9 },
    grounded: true,
    groundAllowed: false,
    multiBlob: true,
  },
  decal: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: true,
    multiBlob: true,
  },
  portrait: {
    transparent: true,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: false,
    multiBlob: false,
  },
  tile: {
    transparent: false,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: true,
    multiBlob: true,
  },
  background: {
    transparent: false,
    anchor: { x: 0.5, y: 0.5 },
    grounded: false,
    groundAllowed: true,
    multiBlob: true,
  },
};

export const VIEWS = ['back', 'side', 'diag'] as const;

const Size = z.object({ w: z.number().int().positive(), h: z.number().int().positive() });

export const PartSchema = z.object({
  /**
   * Stable id: the asset id, plus ".back", ".side" or ".diag" for an extra view and ".f<n>" for
   * animation frames. Also the atlas frame name.
   */
  id: z.string().regex(/^[a-z0-9_]+(\.(back|side|diag))?(\.f\d+)?$/),
  frame: z.number().int().nonnegative(),
  /**
   * Absent: the default view (right-facing for characters, face-on for gates). "back": seen from
   * behind, walking away up the screen. "side" and "diag": a gate in a wall that runs up the
   * screen, or diagonally (the game mirrors it for the other diagonal).
   */
  view: z.enum(VIEWS).optional(),
  /** The pose of this frame, added to the prompt. */
  pose: z.string().optional(),
  /** Committed lossless master, relative to the repo root. */
  master: z.string(),
});
export type Part = z.infer<typeof PartSchema>;

export const AssetSchema = z.object({
  num: z.number().int().min(1),
  /** Zero-padded number as on the sheet, e.g. "035". */
  code: z.string().regex(/^\d{3}$/),
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  group: z.enum(GROUPS),
  kind: z.enum(ASSET_KINDS),
  contentId: z.string().optional(),
  subject: z.string(),
  canvas: Size,
  heightPx: z.number().int().positive().optional(),
  anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  transparent: z.boolean(),
  /** Scenario output size requested for this asset (masters are then normalised to `canvas`). */
  generate: Size,
  checks: z.array(z.string()),
  inferred: z.string().optional(),
  /** Generated without the v1.2 sheet attached, so its characters and towers can't leak in. */
  noReference: z.literal(true).optional(),
  /** Later frames are painted from the first frame of the same view, so only the pose changes. */
  followFirstFrame: z.literal(true).optional(),
  /** Painted from the master of this other asset, so the pieces join (a cliff end and its section). */
  followAsset: z.string().optional(),
  parts: z.array(PartSchema).min(1),
});
export type Asset = z.infer<typeof AssetSchema>;

export const ManifestSchema = z.object({
  version: z.literal('1.2'),
  reference: z.string(),
  scale: z.literal('1 m = 64 px'),
  facing: z.literal('right'),
  /** The 105 assets of the v1.2 sheet, then additions numbered from 106. */
  assets: z.array(AssetSchema).min(105),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export interface CatalogLike {
  num: number;
  id: string;
  name: string;
  group: Group;
  kind: AssetKind;
  contentId?: string;
  subject: string;
  frames?: string[];
  canvas: [number, number];
  heightPx?: number;
  checks?: string[];
  inferred?: string;
  /** Also generate every frame seen from behind, for walking up the screen. */
  back?: boolean;
  /** Also generate every frame in these extra views (gates in walls at other angles). */
  views?: ('side' | 'diag')[];
  /** Generate without the reference sheet: ground decals and lights it kept turning into figures. */
  noReference?: true;
  /** Paint later frames from the first frame's master, e.g. a gate's open doors. */
  followFirstFrame?: true;
  /** Paint from this other asset's master, so the two pieces match and join. */
  followAsset?: string;
}

/** Scenario output size: square for most, landscape for wide canvases and backdrops. */
export function generationSize(canvas: [number, number]): { w: number; h: number } {
  const [w, h] = canvas;
  if (w >= h * 1.4) return { w: 1536, h: 1024 };
  if (h >= w * 1.4) return { w: 1024, h: 1536 };
  return { w: 1024, h: 1024 };
}

export function buildManifest(catalog: readonly CatalogLike[]): Manifest {
  const assets = [...catalog]
    .sort((a, b) => a.num - b.num)
    .map((e): Asset => {
      const rule = KIND_RULES[e.kind];
      const code = String(e.num).padStart(3, '0');
      const frames = e.frames ?? [undefined];
      return {
        num: e.num,
        code,
        id: e.id,
        name: e.name,
        group: e.group,
        kind: e.kind,
        ...(e.contentId ? { contentId: e.contentId } : {}),
        subject: e.subject,
        canvas: { w: e.canvas[0], h: e.canvas[1] },
        ...(e.heightPx ? { heightPx: e.heightPx } : {}),
        anchor: rule.anchor,
        transparent: rule.transparent,
        generate: generationSize(e.canvas),
        checks: e.checks ?? [],
        ...(e.inferred ? { inferred: e.inferred } : {}),
        ...(e.noReference ? { noReference: true as const } : {}),
        ...(e.followFirstFrame ? { followFirstFrame: true as const } : {}),
        ...(e.followAsset ? { followAsset: e.followAsset } : {}),
        parts: [undefined, ...(e.back ? (['back'] as const) : []), ...(e.views ?? [])].flatMap(
          (view) =>
            frames.map((pose, i) => {
              const base = view ? `${e.id}.${view}` : e.id;
              const id = frames.length > 1 ? `${base}.f${i + 1}` : base;
              return {
                id,
                frame: i,
                ...(view ? { view } : {}),
                ...(pose ? { pose } : {}),
                master: `art/masters/${e.group}/${code}_${id.replaceAll('.', '_')}.png`,
              };
            }),
        ),
      };
    });
  return ManifestSchema.parse({
    version: '1.2',
    reference: 'art/reference/panda-kingdom-v1.2.png',
    scale: '1 m = 64 px',
    facing: 'right',
    assets,
  });
}

export function allParts(manifest: Manifest): { asset: Asset; part: Part }[] {
  return manifest.assets.flatMap((asset) => asset.parts.map((part) => ({ asset, part })));
}

/**
 * Picks parts by selector: "all", a group ("enemies"), an asset id or number ("catapult_arm",
 * "36"), a range ("35-36"), or a part id ("king_roll_walk.f2"). Comma-separated selectors add up.
 */
export function selectParts(manifest: Manifest, selector: string): { asset: Asset; part: Part }[] {
  const wanted = new Set<string>();
  const parts = allParts(manifest);
  for (const raw of selector
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(raw);
    const matches = parts.filter(({ asset, part }) => {
      if (raw === 'all') return true;
      if (range) return asset.num >= Number(range[1]) && asset.num <= Number(range[2]);
      if (/^\d+$/.test(raw)) return asset.num === Number(raw);
      return asset.group === raw || asset.id === raw || part.id === raw;
    });
    if (matches.length === 0) throw new Error(`Selector "${raw}" matches no asset.`);
    for (const m of matches) wanted.add(m.part.id);
  }
  return parts.filter(({ part }) => wanted.has(part.id));
}

export async function loadManifest(file: string): Promise<Manifest> {
  return ManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
