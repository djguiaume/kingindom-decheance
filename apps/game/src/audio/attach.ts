/**
 * Connects a running game to the audio engine: game events become sound cues, and the phase
 * picks the music. It only reads the runtime, like the renderer does (ADR-004, ADR-005).
 */
import type { GameState } from '@kd/core';
import type { GameRuntime } from '../game/runtime.ts';
import { cuesFor, EnemyTypes, worldOf } from './cues.ts';
import type { AudioEngine } from './engine.ts';
import type { TrackId } from './music.ts';

const POLL_MS = 50;

/** The loop for this moment: the last night (the warlord's) gets the finale drums. */
export function trackFor(state: GameState, nights: number, paused: boolean): TrackId | null {
  if (paused) return null;
  if (state.phase === 'day') return 'day';
  if (state.phase === 'night') return state.day >= nights ? 'finale' : 'night';
  return null;
}

export function attachAudio(runtime: GameRuntime, engine: AudioEngine): () => void {
  engine.install();
  const enemies = new EnemyTypes();

  const offEvents = runtime.onEvents((events) => {
    enemies.learn(events);
    for (const cue of cuesFor(events, worldOf(runtime.state, enemies)))
      engine.play(cue.id, cue.gain);
    enemies.forget(events);
  });

  // The Charge has no event of its own (the command only starts a dash): watch for it starting.
  let session = runtime.session;
  let dashing = false;
  const timer = window.setInterval(() => {
    if (runtime.session !== session) {
      session = runtime.session;
      enemies.clear();
    }
    const state = runtime.state;
    const dash = state.king.dash !== null;
    if (dash && !dashing) engine.play('charge');
    dashing = dash;
    engine.setTrack(trackFor(state, runtime.ctx.map.nights, runtime.paused));
  }, POLL_MS);

  return () => {
    offEvents();
    window.clearInterval(timer);
    engine.setTrack(null);
  };
}
