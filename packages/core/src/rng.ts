/**
 * Seeded pseudo-random generator: sfc32, seeded through splitmix32.
 * Its whole state is four 32-bit integers stored in GameState, so a state snapshot
 * also snapshots the random sequence. Never use Math.random in the core.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: RngState = [next(), next(), next(), next()];
  // Warm up so nearby seeds diverge quickly.
  for (let i = 0; i < 12; i++) nextUint32(state);
  return state;
}

/** Advances the generator in place and returns an unsigned 32-bit integer. */
export function nextUint32(rng: RngState): number {
  let [a, b, c, d] = rng;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  rng[0] = a;
  rng[1] = b;
  rng[2] = c;
  rng[3] = d;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / 4294967296;
}

/** Uniform float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(rng);
}

/** Uniform integer in [0, n). */
export function nextInt(rng: RngState, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}
