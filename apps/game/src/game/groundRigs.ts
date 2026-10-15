/**
 * Ground anchors measured in the untrimmed PNG masters, not in atlas cut rectangles.
 * A building's position is the centre of its painted footing, not its foremost bottom pixel.
 * Values belong to this approved asset set; review these points when replacing a master.
 */
export const GROUND_ANCHORS: Record<string, readonly [number, number]> = {
  castle_1: [256, 390],
  castle_2: [256, 400],
  castle_3: [256, 410],
  house: [128, 198],
  manor: [128, 208],
  gold_mine: [128, 198],
  tower: [96, 235],
  watchtower: [112, 264],
  ballista_tower: [128, 262],
  volley_tower: [128, 264],
  barracks: [160, 250],
  garrison: [160, 251],
  knight_hall: [160, 250],
  archery_range: [160, 248],
  marksmen: [160, 249],
  crossbow_range: [160, 250],
  guardian_lodge: [160, 250],
  guardian_bastion: [160, 250],
  monk_sanctuary: [160, 250],
  monastery: [160, 250],
  ruin: [128, 150],
};

export interface GateRig {
  /** Ground hinges of the closed gate, reused for open art to avoid changing placement. */
  hinges: readonly [readonly [number, number], readonly [number, number]];
  /** Painted alpha height in the closed/open masters, used to keep their apparent height stable. */
  visibleHeights: readonly [closed: number, open: number];
}

/** Gates are landmarks: a little over twice the king's visible height, like the reference. */
export const GATE_UPRIGHT_SCALE = 1.5;

export const GATE_RIGS: Record<string, GateRig> = {
  gate_wood: {
    hinges: [
      [60, 146],
      [136, 158],
    ],
    visibleHeights: [150, 137],
  },
  'gate_wood.diag': {
    hinges: [
      [62, 150],
      [128, 112],
    ],
    visibleHeights: [160, 145],
  },
  'gate_wood.side': {
    hinges: [
      [78, 149],
      [111, 81],
    ],
    visibleHeights: [166, 166],
  },
  gate_stone: {
    hinges: [
      [51, 156],
      [141, 156],
    ],
    visibleHeights: [166, 166],
  },
  'gate_stone.diag': {
    hinges: [
      [56, 154],
      [136, 116],
    ],
    visibleHeights: [163, 147],
  },
  'gate_stone.side': {
    hinges: [
      [79, 149],
      [113, 80],
    ],
    visibleHeights: [166, 166],
  },
};

export function groundOrigin(frame: string, width: number, height: number): [number, number] {
  // A building's ruin is painted from its master on the same canvas and footing.
  const anchor = GROUND_ANCHORS[frame] ?? GROUND_ANCHORS[frame.replace(/^ruin_/, '')];
  return anchor ? [anchor[0] / width, anchor[1] / height] : [0.5, 0.9];
}

/**
 * Screen angles at which the painted views switch. The painted wall lines run at about 0°
 * (face-on), 28° (diagonal) and 64° (side) on screen, so each view takes the walls closest to
 * its own angle and needs the least tilt to fit.
 */
const DIAG_FROM = (14 * Math.PI) / 180;
const SIDE_FROM = (46 * Math.PI) / 180;

/** Select perspective from the projected wall axis; side views need mirroring too. */
export function gateView(across: { x: number; y: number }, squash: number) {
  const x = across.x;
  const y = across.y * squash;
  const angle = Math.atan2(Math.abs(y), Math.abs(x));
  const view = angle < DIAG_FROM ? '' : angle >= SIDE_FROM ? '.side' : '.diag';
  return { view, mirror: view !== '' && x * y > 0 };
}

/** How far the painted width may be stretched or narrowed to meet the passage, either way. */
export const GATE_WIDTH_RANGE = [0.75, 1.35] as const;

/**
 * Place the painted gate on the real passage without flattening it. The painting already shows
 * the gate in perspective, depth and all, so it keeps its upright scale and is only stretched
 * sideways within GATE_WIDTH_RANGE and tilted (a vertical shear) so its hinges meet the projected
 * passage. An earlier fit sheared the painted width onto the wall line exactly, which squashed
 * a steep wall's gate into a sliver. Near a vertical wall the side view keeps its painted width,
 * so its hinges sit a little to the side of the line: `hinges` gives where they really land
 * (screen pixels from the anchor), for the wings to start there. Reversing the wall's vector
 * gives the same placement.
 */
export function gatePlacement(
  rig: GateRig,
  across: { x: number; y: number },
  mirror: boolean,
  gapM: number,
  pixelsPerM: number,
  squash: number,
  open = false,
) {
  const [a, b] = rig.hinges;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const targetX = Math.abs(across.x) * gapM * pixelsPerM;
  const targetY = Math.abs(across.y) * gapM * pixelsPerM * squash;
  // Painted hinges run up-right in the side and diagonal views; mirroring turns them up-left.
  const ty = dy < 0 ? -targetY : (across.x * across.y > 0 ? 1 : -1) * targetY;
  const width = (pixelsPerM / 64) * GATE_UPRIGHT_SCALE;
  const sx = Math.min(
    Math.max(targetX / dx, GATE_WIDTH_RANGE[0] * width),
    GATE_WIDTH_RANGE[1] * width,
  );
  // The source canvases match, but some open paintings have a shorter occupied alpha region.
  // Normalize that difference around the fixed hinges so opening never shrinks the structure.
  const stateScale = open ? rig.visibleHeights[0] / rig.visibleHeights[1] : 1;
  const uprightScale = width * stateScale;
  const anchor = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const matrix = { a: mirror ? -sx : sx, b: (ty - dy * uprightScale) / dx, c: 0, d: uprightScale };
  const hinges = rig.hinges.map(([x, y]) => ({
    x: matrix.a * (x - anchor[0]) + matrix.c * (y - anchor[1]),
    y: matrix.b * (x - anchor[0]) + matrix.d * (y - anchor[1]),
  }));
  return { anchor, matrix, hinges };
}

export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Two ordinary Phaser transforms represent an affine ground projection: R(outer) · S · R(inner).
 * The parent container and child image use public APIs, in both WebGL and Canvas renderers.
 */
export function decomposeAffine(m: Affine2D) {
  const aa = m.a * m.a + m.b * m.b;
  const bb = m.c * m.c + m.d * m.d;
  const ab = m.a * m.c + m.b * m.d;
  const v = 0.5 * Math.atan2(2 * ab, aa - bb);
  const discriminant = Math.hypot(aa - bb, 2 * ab);
  const sx = Math.sqrt((aa + bb + discriminant) / 2);
  const sy = (m.a * m.d - m.b * m.c) / sx;
  const outer = Math.atan2(
    m.b * Math.cos(v) + m.d * Math.sin(v),
    m.a * Math.cos(v) + m.c * Math.sin(v),
  );
  return { outer, inner: -v, scaleX: sx, scaleY: sy };
}
