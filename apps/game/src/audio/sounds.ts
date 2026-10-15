/**
 * The sound catalog: every sound the game can play, by id. Each sound has a synthesized recipe
 * (a few oscillator and noise layers). Combat sounds also list recorded takes in public/sfx/,
 * built from CC0 packs by tools/sfx/build.py (which records where each one comes from); the
 * engine plays a random take once loaded and the recipe until then, or if a file fails. Code
 * only ever names the id.
 */

/** Where the recorded takes are served, relative to the page. */
export const SFX_DIR = 'sfx/';

export type SoundId =
  | 'build'
  | 'upgrade'
  | 'horn'
  | 'dawn'
  | 'coins'
  | 'roll'
  | 'rollHit'
  | 'spearThrust'
  | 'swordHit'
  | 'axeHit'
  | 'clubHit'
  | 'bowRelease'
  | 'crossbowRelease'
  | 'arrowHit'
  | 'boltHit'
  | 'arrowMiss'
  | 'towerShot'
  | 'ballista'
  | 'catapultLaunch'
  | 'boulder'
  | 'boulderLand'
  | 'kingHurt'
  | 'stoneHit'
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
  /** Danger and abilities: still heard when a crowd of ordinary hits fills every voice. */
  priority?: boolean;
}

export interface SoundDef extends Common {
  layers: Layer[];
  /** Recorded takes in SFX_DIR; one is picked at random each time. */
  files?: string[];
}

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
    priority: true,
  },
  dawn: { layers: notes('sine', [784, 988, 1175, 1568], 0.12, 0.6, 0.25) },

  // The king. The roll is his Charge: a tumble of body thumps under a cloth swish, as long as
  // the dash; what he bowls over gets a heavy bump, not a spear hit.
  roll: {
    files: ['roll.mp3'],
    layers: [
      noise('lowpass', 600, 250, 0.32, 0.5),
      noise('bandpass', 800, 1600, 0.26, 0.35, 0, 2),
      tone('sine', 120, 60, 0.08, 0.5),
      tone('sine', 115, 58, 0.08, 0.45, 0.1),
      tone('sine', 110, 55, 0.09, 0.4, 0.2),
    ],
    minGapMs: 200,
    priority: true,
  },
  rollHit: {
    files: ['roll-hit_1.mp3', 'roll-hit_2.mp3'],
    layers: [tone('sine', 110, 45, 0.14, 0.7), noise('lowpass', 1200, 200, 0.1, 0.8)],
    minGapMs: 60,
    vary: 0.08,
  },
  // The spear: a short whoosh, then the stab lands.
  spearThrust: {
    files: ['spear_1.mp3', 'spear_2.mp3', 'spear_3.mp3'],
    layers: [
      noise('bandpass', 1200, 3500, 0.07, 0.5, 0, 2),
      noise('bandpass', 2200, 900, 0.06, 0.8, 0.05, 3),
      tone('square', 200, 100, 0.05, 0.15, 0.05),
    ],
    minGapMs: 50,
    vary: 0.1,
  },
  kingHurt: {
    layers: [tone('square', 330, 196, 0.12, 0.25), noise('lowpass', 600, 200, 0.1, 0.6)],
    minGapMs: 150,
    priority: true,
  },
  kingDown: { layers: notes('triangle', [392, 330, 262, 196], 0.14, 0.3, 0.35), priority: true },
  respawn: { layers: notes('sine', [392, 523, 659], 0.09, 0.3, 0.3) },

  // Melee, by weapon: the sword rings, the axe chops, the club thuds.
  swordHit: {
    files: ['sword_1.mp3', 'sword_2.mp3', 'sword_3.mp3'],
    layers: [
      noise('bandpass', 4000, 2500, 0.04, 0.6, 0, 5),
      tone('triangle', 1250, 1250, 0.18, 0.12),
      tone('triangle', 1870, 1870, 0.12, 0.08),
    ],
    minGapMs: 60,
    vary: 0.08,
  },
  axeHit: {
    files: ['axe_1.mp3', 'axe_2.mp3'],
    layers: [noise('bandpass', 1400, 700, 0.07, 0.8, 0, 2), tone('triangle', 320, 160, 0.08, 0.3)],
    minGapMs: 60,
    vary: 0.12,
  },
  clubHit: {
    files: ['club_1.mp3', 'club_2.mp3'],
    layers: [noise('lowpass', 700, 120, 0.14, 1), tone('sine', 95, 50, 0.15, 0.6)],
    minGapMs: 100,
    vary: 0.08,
  },

  // Shots: the release when the shooter lets go, then the impact or the miss when it lands.
  bowRelease: {
    files: ['bow_1.mp3', 'bow_2.mp3', 'bow_3.mp3'],
    layers: [
      tone('triangle', 260, 220, 0.18, 0.25),
      noise('highpass', 4000, 6000, 0.04, 0.25),
      noise('bandpass', 2500, 1500, 0.1, 0.2, 0.02, 2),
    ],
    minGapMs: 60,
    vary: 0.1,
    volume: 0.8,
  },
  crossbowRelease: {
    files: ['crossbow_1.mp3', 'crossbow_2.mp3'],
    layers: [
      tone('square', 1400, 900, 0.02, 0.2),
      noise('bandpass', 3000, 1200, 0.05, 0.7, 0, 4),
      tone('triangle', 180, 140, 0.1, 0.25),
    ],
    minGapMs: 80,
    vary: 0.06,
  },
  arrowHit: {
    files: ['arrow-hit_1.mp3', 'arrow-hit_2.mp3'],
    layers: [noise('highpass', 3000, 1500, 0.05, 0.5), tone('triangle', 520, 300, 0.04, 0.2)],
    minGapMs: 60,
    vary: 0.15,
    volume: 0.7,
  },
  boltHit: {
    files: ['bolt-hit_1.mp3', 'bolt-hit_2.mp3'],
    layers: [noise('bandpass', 1800, 700, 0.07, 0.8, 0, 2), tone('triangle', 300, 150, 0.06, 0.3)],
    minGapMs: 60,
    vary: 0.1,
  },
  arrowMiss: {
    files: ['arrow-miss_1.mp3', 'arrow-miss_2.mp3'],
    layers: [noise('lowpass', 1500, 400, 0.06, 0.4)],
    minGapMs: 60,
    vary: 0.2,
    volume: 0.5,
  },
  // Towers and the castle shoot and hit in the same instant: a twang and a thwip together.
  towerShot: {
    files: ['tower_1.mp3', 'tower_2.mp3'],
    layers: [
      tone('triangle', 300, 240, 0.12, 0.18),
      noise('highpass', 3000, 1500, 0.05, 0.45, 0.03),
    ],
    minGapMs: 60,
    vary: 0.12,
    volume: 0.7,
  },
  ballista: {
    files: ['ballista.mp3'],
    layers: [noise('lowpass', 1400, 300, 0.15, 0.9), tone('square', 140, 70, 0.12, 0.25)],
    minGapMs: 80,
    vary: 0.06,
  },
  // The catapult: the arm creaks back, whips round and slams the crossbar.
  catapultLaunch: {
    files: ['catapult.mp3'],
    layers: [
      tone('sawtooth', 70, 110, 0.25, 0.12),
      noise('lowpass', 400, 900, 0.18, 0.6, 0.15),
      tone('sine', 80, 50, 0.12, 0.5, 0.2),
    ],
    minGapMs: 150,
  },
  boulder: {
    files: ['boulder.mp3'],
    layers: [
      noise('lowpass', 500, 80, 0.45, 1),
      tone('sine', 90, 40, 0.4, 0.6),
      noise('bandpass', 1200, 300, 0.3, 0.4, 0.03, 1.5),
    ],
    minGapMs: 120,
  },
  boulderLand: {
    files: ['boulder-land.mp3'],
    layers: [noise('lowpass', 350, 60, 0.4, 0.9), tone('sine', 70, 35, 0.35, 0.6)],
    minGapMs: 120,
    volume: 0.8,
  },

  // Blows on structures, by material.
  stoneHit: {
    files: ['stone_1.mp3', 'stone_2.mp3'],
    layers: [noise('lowpass', 400, 120, 0.2, 0.8), tone('sine', 70, 50, 0.2, 0.5)],
    minGapMs: 120,
  },
  woodHit: {
    files: ['wood_1.mp3', 'wood_2.mp3', 'wood_3.mp3'],
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
    priority: true,
  },
  stomp: {
    layers: [noise('lowpass', 300, 40, 0.6, 1), tone('sine', 60, 30, 0.6, 0.8)],
    priority: true,
  },
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
