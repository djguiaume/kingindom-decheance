/**
 * Placeholder music: three short synthesized loops (calm day, night drums, finale drums for the
 * warlord's night), played by a small step sequencer on the AudioContext clock. The final audio
 * pass replaces these with recorded tracks behind the same `TrackId`s.
 */

export type TrackId = 'day' | 'night' | 'finale';

/** One bar of 16 steps; a pattern lists the steps a voice plays on. */
interface Track {
  bpm: number;
  bars: number;
  kick: number[];
  tom: number[];
  hat: number[];
  /** Per bar: the bass root in Hz (played on `bassSteps`), and a held pad chord. */
  bass: number[];
  bassSteps: number[];
  pad: number[][];
  /** Per bar: a few plucked notes `[step, Hz]`. */
  pluck: [number, number][][];
}

// A minor-ish palette: A2 110, C3 131, D3 147, E3 165, F2 87, G2 98.
const TRACKS: Record<TrackId, Track> = {
  day: {
    bpm: 76,
    bars: 4,
    kick: [],
    tom: [],
    hat: [],
    bass: [110, 87, 131, 98],
    bassSteps: [0],
    pad: [
      [220, 262, 330],
      [175, 220, 262],
      [262, 330, 392],
      [196, 247, 294],
    ],
    pluck: [
      [
        [0, 659],
        [6, 523],
        [10, 440],
      ],
      [[4, 523]],
      [
        [0, 784],
        [8, 659],
      ],
      [
        [2, 587],
        [10, 494],
      ],
    ],
  },
  night: {
    bpm: 84,
    bars: 2,
    kick: [0, 7, 10],
    tom: [4, 12, 14],
    hat: [],
    bass: [55, 49],
    bassSteps: [0, 10],
    pad: [
      [110, 131, 165],
      [98, 123, 147],
    ],
    pluck: [[], []],
  },
  finale: {
    bpm: 118,
    bars: 2,
    kick: [0, 3, 6, 8, 11, 14],
    tom: [4, 12, 13, 15],
    hat: [2, 6, 10, 14],
    bass: [55, 58],
    bassSteps: [0, 3, 6, 8, 11, 14],
    pad: [
      [110, 131, 165],
      [117, 139, 175],
    ],
    pluck: [[], []],
  },
};

const LOOKAHEAD_S = 0.25;
const TICK_MS = 60;
const FADE_S = 1.2;

export class MusicPlayer {
  private track: TrackId | null = null;
  private bus: GainNode | null = null;
  private step = 0;
  private nextAt = 0;
  private timer: number | undefined;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  play(track: TrackId | null): void {
    if (track === this.track) return;
    this.fadeOut();
    this.track = track;
    if (!track) return;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + FADE_S);
    bus.connect(this.out);
    this.bus = bus;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  private fadeOut(): void {
    window.clearInterval(this.timer);
    const bus = this.bus;
    if (!bus) return;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
    window.setTimeout(() => bus.disconnect(), FADE_S * 1000 + 3000);
    this.bus = null;
  }

  private schedule(): void {
    if (!this.track || !this.bus) return;
    const t = TRACKS[this.track];
    const stepS = 60 / t.bpm / 4;
    while (this.nextAt < this.ctx.currentTime + LOOKAHEAD_S) {
      const bar = Math.floor(this.step / 16) % t.bars;
      const s = this.step % 16;
      const at = this.nextAt;
      if (t.kick.includes(s)) this.drum(at, 140, 45, 0.35, 0.9);
      if (t.tom.includes(s)) this.drum(at, 220, 110, 0.25, 0.45);
      if (t.hat.includes(s)) this.hat(at);
      if (t.bassSteps.includes(s)) this.note('triangle', t.bass[bar]!, at, stepS * 3, 0.35);
      if (s === 0) for (const f of t.pad[bar]!) this.pad(f, at, stepS * 16);
      for (const [ps, f] of t.pluck[bar]!) if (ps === s) this.note('sine', f, at, 0.8, 0.12);
      this.nextAt += stepS;
      this.step = (this.step + 1) % (16 * t.bars);
    }
  }

  private envelope(at: number, attack: number, dur: number, gain: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(this.bus!);
    return g;
  }

  private drum(at: number, from: number, to: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    osc.connect(this.envelope(at, 0.005, dur, gain));
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private hat(at: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    src.connect(hp).connect(this.envelope(at, 0.002, 0.05, 0.12));
    src.start(at, Math.random() * 0.5);
    src.stop(at + 0.07);
  }

  private note(wave: OscillatorType, f: number, at: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = f;
    osc.connect(this.envelope(at, 0.01, dur, gain));
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** A soft held chord tone with a slow attack. */
  private pad(f: number, at: number, dur: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.detune.value = Math.random() * 8 - 4;
    osc.connect(this.envelope(at, dur * 0.3, dur, 0.07));
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}
