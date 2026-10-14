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
}

export const GATE_RIGS: Record<string, GateRig> = {
  gate_wood: {
    hinges: [
      [60, 146],
      [136, 158],
    ],
  },
  'gate_wood.diag': {
    hinges: [
      [62, 150],
      [128, 112],
    ],
  },
  'gate_wood.side': {
    hinges: [
      [78, 149],
      [111, 81],
    ],
  },
  gate_stone: {
    hinges: [
      [51, 156],
      [141, 156],
    ],
  },
  'gate_stone.diag': {
    hinges: [
      [56, 154],
      [136, 116],
    ],
  },
  'gate_stone.side': {
    hinges: [
      [79, 149],
      [113, 80],
    ],
  },
};

export function groundOrigin(frame: string, width: number, height: number): [number, number] {
  const anchor = GROUND_ANCHORS[frame];
  return anchor ? [anchor[0] / width, anchor[1] / height] : [0.5, 0.9];
}

/** Select perspective from the projected wall axis; side views need mirroring too. */
export function gateView(across: { x: number; y: number }, squash: number) {
  const x = across.x;
  const y = across.y * squash;
  const angle = Math.atan2(Math.abs(y), Math.abs(x));
  const view = angle < Math.PI / 8 ? '' : angle > (3 * Math.PI) / 8 ? '.side' : '.diag';
  return { view, mirror: view !== '' && x * y > 0 };
}

/**
 * Fit the painted hinge segment to the real gate passage, after projecting the wall to screen.
 * The same closed-frame calibration is used for both states. This replaces a raw pixel scale
 * with world geometry; reversing the wall's vector cannot move or flip the gate differently.
 */
export function gatePlacement(
  rig: GateRig,
  across: { x: number; y: number },
  mirror: boolean,
  gapM: number,
  pixelsPerM: number,
  squash: number,
) {
  const [a, b] = rig.hinges;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const targetX = Math.abs(across.x) * gapM * pixelsPerM;
  const targetY = Math.abs(across.y) * gapM * pixelsPerM * squash;
  const side = dy < 0;
  const tx = mirror ? -targetX : targetX;
  const ty = side ? -targetY : (across.x * across.y > 0 ? 1 : -1) * targetY;
  const uprightScale = pixelsPerM / 64;
  // At an edge-on view the wall axis and upright axis project onto the same line. A small
  // depth component keeps the side art visible without moving either hinge off the passage.
  const depth = (mirror ? -1 : 1) * 0.02 * Math.max(0, 1 - Math.abs(across.x) / 0.1);
  return {
    anchor: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const,
    matrix: {
      a: (tx - depth * dy) / dx,
      b: (ty - dy * uprightScale) / dx,
      c: depth,
      d: uprightScale,
    },
  };
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
