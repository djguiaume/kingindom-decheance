/**
 * The sound catalog: every sound the game can play, by id. Placeholder sounds are synthesized
 * from a few oscillator and noise layers, so the prototype ships no audio files. The final audio
 * pass swaps a recipe for a file (`{ url: 'sfx/hit.ogg' }`) without touching any caller: code
 * only ever names the id.
 */

export type SoundId =
  | 'build'
  | 'upgrade'
  | 'horn'
  | 'dawn'
  | 'coins'
  | 'charge'
  | 'spearHit'
  | 'swordHit'
  | 'arrowHit'
  | 'ballista'
  | 'boulder'
  | 'kingHurt'
  | 'castleHit'
  | 'woodHit'
  | 'enemyDie'
  | 'unitDie'
  | 'kingDown'
  | 'respawn'
  | 'collapse'
  | 'bossRoar'
  | 'bossDie'
  | 'stomp'
  | 'rally'
  | 'drop'
  | 'victory'
  | 'defeat';

/** An oscillator note with a pitch glide and a fast-attack, exponential-decay envelope. */
export interface ToneLayer {
  kind: 'tone';
  wave: OscillatorType;
  /** Start and end frequency in Hz (a glide when they differ). */
  from: number;
  to?: number;
  /** Seconds from the sound's start. */
  delay?: number;
  dur: number;
  gain: number;
}

/** A filtered white-noise burst: hits, whooshes, crumbles. */
export interface NoiseLayer {
  kind: 'noise';
  filter: BiquadFilterType;
  /** Filter frequency at the start and end, in Hz. */
  from: number;
  to?: number;
  q?: number;
  delay?: number;
  dur: number;
  gain: number;
}

export type Layer = ToneLayer | NoiseLayer;

interface Common {
  /** Overall loudness, 0–1, before distance and master volume. */
  volume?: number;
  /** The same sound will not start again sooner than this (keeps a volley from roaring). */
  minGapMs?: number;
  /** Random pitch spread, as a fraction (0.08 = ±8 %), so repeats do not sound robotic. */
  vary?: number;
}

export type SoundDef = Common & ({ layers: Layer[] } | { url: string });

const tone = (
  wave: OscillatorType,
  from: number,
  to: number,
  dur: number,
  gain: number,
  delay = 0,
): ToneLayer => ({ kind: 'tone', wave, from, to, dur, gain, delay });

const noise = (
  filter: BiquadFilterType,
  from: number,
  to: number,
  dur: number,
  gain: number,
  delay = 0,
  q = 1,
): NoiseLayer => ({ kind: 'noise', filter, from, to, dur, gain, delay, q });

/** Notes of a short melody, one tone layer each. */
const notes = (wave: OscillatorType, freqs: number[], step: number, dur: number, gain: number) =>
  freqs.map((f, i) => tone(wave, f, f, dur, gain, i * step));

export const SOUNDS: Record<SoundId, SoundDef> = {
  // Day: building and economy.
  build: {
    layers: [noise('lowpass', 900, 300, 0.12, 0.9), tone('triangle', 180, 90, 0.12, 0.6)],
    vary: 0.05,
  },
  upgrade: { layers: notes('triangle', [523, 659, 784, 1047], 0.07, 0.18, 0.35) },
  coins: {
    layers: [tone('square', 1568, 1568, 0.06, 0.12), tone('square', 2093, 2093, 0.18, 0.12, 0.06)],
  },
  horn: {
    layers: [
      tone('sawtooth', 110, 147, 0.25, 0.25),
      tone('sawtooth', 147, 147, 1.1, 0.25, 0.22),
      tone('sawtooth', 73, 73, 1.3, 0.2),
    ],
  },
  dawn: { layers: notes('sine', [784, 988, 1175, 1568], 0.12, 0.6, 0.25) },

  // The king.
  charge: { layers: [noise('bandpass', 400, 2400, 0.3, 0.8, 0, 2)], minGapMs: 200 },
  spearHit: {
    layers: [noise('bandpass', 2500, 1200, 0.07, 0.8, 0, 3), tone('square', 220, 110, 0.06, 0.2)],
    minGapMs: 50,
    vary: 0.1,
  },
  kingHurt: {
    layers: [tone('square', 330, 196, 0.12, 0.25), noise('lowpass', 600, 200, 0.1, 0.6)],
    minGapMs: 150,
  },
  kingDown: { layers: notes('triangle', [392, 330, 262, 196], 0.14, 0.3, 0.35) },
  respawn: { layers: notes('sine', [392, 523, 659], 0.09, 0.3, 0.3) },

  // Combat.
  swordHit: {
    layers: [
      noise('bandpass', 3200, 1800, 0.05, 0.6, 0, 4),
      tone('triangle', 900, 600, 0.05, 0.15),
    ],
    minGapMs: 60,
    vary: 0.12,
  },
  arrowHit: {
    layers: [noise('highpass', 3000, 1500, 0.05, 0.5), tone('triangle', 520, 300, 0.04, 0.2)],
    minGapMs: 60,
    vary: 0.15,
    volume: 0.7,
  },
  ballista: {
    layers: [noise('lowpass', 1400, 300, 0.15, 0.9), tone('square', 140, 70, 0.12, 0.25)],
    minGapMs: 80,
    vary: 0.06,
  },
  boulder: {
    layers: [noise('lowpass', 500, 80, 0.45, 1), tone('sine', 90, 40, 0.4, 0.6)],
    minGapMs: 120,
  },
  castleHit: {
    layers: [noise('lowpass', 400, 120, 0.2, 0.8), tone('sine', 70, 50, 0.2, 0.5)],
    minGapMs: 120,
  },
  woodHit: {
    layers: [noise('bandpass', 700, 400, 0.08, 0.7, 0, 3), tone('triangle', 240, 180, 0.06, 0.3)],
    minGapMs: 80,
    vary: 0.1,
  },
  enemyDie: {
    layers: [tone('square', 600, 150, 0.16, 0.15), noise('lowpass', 1200, 300, 0.1, 0.3)],
    minGapMs: 60,
    vary: 0.15,
  },
  unitDie: { layers: [tone('triangle', 300, 120, 0.25, 0.3)], minGapMs: 100 },
  collapse: {
    layers: [noise('lowpass', 900, 60, 0.9, 1), tone('sine', 80, 35, 0.8, 0.5)],
    minGapMs: 200,
  },

  // The warlord.
  bossRoar: {
    layers: [tone('sawtooth', 90, 60, 1.2, 0.35), noise('bandpass', 500, 250, 1.1, 0.5, 0, 2)],
  },
  stomp: { layers: [noise('lowpass', 300, 40, 0.6, 1), tone('sine', 60, 30, 0.6, 0.8)] },
  bossDie: {
    layers: [tone('sawtooth', 120, 40, 1.4, 0.35), noise('lowpass', 700, 60, 1.2, 0.7)],
  },

  // Rally.
  rally: { layers: notes('sawtooth', [196, 294], 0.14, 0.22, 0.18) },
  drop: { layers: notes('sawtooth', [294, 196], 0.12, 0.2, 0.15) },

  // End of the run.
  victory: { layers: notes('triangle', [523, 659, 784, 1047, 784, 1047], 0.15, 0.4, 0.3) },
  defeat: { layers: notes('sawtooth', [220, 208, 196, 147], 0.3, 0.6, 0.18) },
};
