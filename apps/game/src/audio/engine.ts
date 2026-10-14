/**
 * AudioEngine: the one owner of the browser's AudioContext (view only, never read by the core).
 *
 * Browsers, phones above all, keep audio silent until the player touches or presses something,
 * so the context is created and resumed on the first gesture. Before that, sounds are dropped.
 * Mute is remembered on this device. Effects and music have their own volume so either can be
 * rebalanced in the final audio pass.
 */
import { Limiter } from './cues.ts';
import { MusicPlayer, type TrackId } from './music.ts';
import { SOUNDS, type Layer, type SoundId } from './sounds.ts';

const MUTE_KEY = 'kd.muted';
const SFX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.3;
/** Never more than this many effects at once: a big fight stays a sound, not noise. */
const MAX_VOICES = 14;

type AudioContextCtor = typeof AudioContext;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private files = new Map<SoundId, AudioBuffer | 'loading'>();
  private limiter = new Limiter();
  private voices = 0;
  private music: MusicPlayer | null = null;
  private wantedTrack: TrackId | null = null;
  private listeners: ((muted: boolean) => void)[] = [];
  private installed = false;
  muted = readMuted();

  /** Listens for the first gesture; safe to call more than once. */
  install(): void {
    if (typeof window === 'undefined' || this.installed) return;
    this.installed = true;
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'touchend', 'keydown'])
      window.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend();
      else if (this.ctx) void this.ctx.resume();
    });
  }

  /** Inside a user gesture: create or resume the context so sound may play. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      // A gentle limiter: a big fight stacks many hits, and stacked sounds must not crackle.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = SFX_VOLUME;
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOLUME;
      this.musicBus.connect(this.master);
      this.noise = whiteNoise(ctx);
      this.music = new MusicPlayer(ctx, this.musicBus, this.noise);
      // Older iOS only unlocks after a sound starts inside the gesture: play one silent sample.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, 22050);
      silent.connect(ctx.destination);
      silent.start();
      if (this.wantedTrack) this.music.play(this.wantedTrack);
    }
    if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Private mode: mute still works for this visit.
    }
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    for (const l of this.listeners) l(muted);
  }

  onMuted(listener: (muted: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => (this.listeners = this.listeners.filter((l) => l !== listener));
  }

  /** Plays a sound by id at `gain` (0–1). Dropped while locked, muted or too crowded. */
  play(id: SoundId, gain = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise || ctx.state !== 'running' || this.muted) return;
    const def = SOUNDS[id];
    if (this.voices >= MAX_VOICES) return;
    if (!this.limiter.allow(id, performance.now(), def.minGapMs ?? 0)) return;

    const out = ctx.createGain();
    out.gain.value = (def.volume ?? 1) * gain;
    out.connect(this.sfx);
    const rate = 1 + (def.vary ?? 0) * (Math.random() * 2 - 1);
    const start = ctx.currentTime;
    let end = start;

    if ('url' in def) {
      const buffer = this.files.get(id);
      if (!buffer) this.load(id, def.url);
      if (!(buffer instanceof AudioBuffer)) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.connect(out);
      src.start(start);
      end = start + buffer.duration / rate;
    } else {
      for (const layer of def.layers) end = Math.max(end, this.layer(layer, out, start, rate));
    }

    this.voices++;
    window.setTimeout(
      () => {
        this.voices--;
        out.disconnect();
      },
      (end - start) * 1000 + 50,
    );
  }

  /** Switches the music loop (null = silence). Remembered until audio unlocks. */
  setTrack(track: TrackId | null): void {
    this.wantedTrack = track;
    if (this.music) this.music.play(track);
  }

  private layer(l: Layer, out: AudioNode, t0: number, rate: number): number {
    const ctx = this.ctx!;
    const t = t0 + (l.delay ?? 0);
    const end = t + l.dur;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(l.gain, t + Math.min(0.01, l.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out);

    if (l.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = l.wave;
      osc.frequency.setValueAtTime(l.from * rate, t);
      if (l.to !== undefined && l.to !== l.from)
        osc.frequency.exponentialRampToValueAtTime(l.to * rate, end);
      osc.connect(env);
      osc.start(t);
      osc.stop(end + 0.02);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = l.filter;
      filter.Q.value = l.q ?? 1;
      filter.frequency.setValueAtTime(l.from * rate, t);
      if (l.to !== undefined && l.to !== l.from)
        filter.frequency.exponentialRampToValueAtTime(l.to * rate, end);
      src.connect(filter).connect(env);
      src.start(t, Math.random());
      src.stop(end + 0.02);
    }
    return end;
  }

  private load(id: SoundId, url: string): void {
    const ctx = this.ctx!;
    this.files.set(id, 'loading');
    fetch(new URL(url, document.baseURI))
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => this.files.set(id, buffer))
      .catch(() => this.files.delete(id));
  }
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** The game's one audio engine, shared by the play screen and the sound button. */
export const audio = new AudioEngine();
