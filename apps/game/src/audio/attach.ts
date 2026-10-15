/**
 * Connects a running game to the audio engine: game events become sound cues, and the phase
 * picks the music. It only reads the runtime, like the renderer does (ADR-004, ADR-005).
 */
import type { GameState } from '@kd/core';
import type { GameRuntime } from '../game/runtime.ts';
import { cuesFor, EnemyTypes, Shots, worldOf } from './cues.ts';
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
  const shots = new Shots();

  // A king ability has no event of its own: the command only starts a dash. Watch it here and
  // on every event batch so its movement sound starts immediately.
  let dashing = false;
  const watchDash = () => {
    const dash = runtime.state.king.dash !== null;
    if (dash && !dashing)
      engine.play(runtime.ctx.king.ability.kind === 'roll' ? 'roll' : 'spearThrust');
    dashing = dash;
  };

  const offEvents = runtime.onEvents((events) => {
    const wasRolling = dashing && runtime.ctx.king.ability.kind === 'roll';
    watchDash();
    enemies.learn(events);
    for (const cue of cuesFor(
      events,
      worldOf(
        runtime.state,
        enemies,
        wasRolling,
        runtime.ctx.king.ability.kind === 'roll',
        runtime.ctx.weapon.id,
      ),
      shots,
    ))
      engine.play(cue.id, cue.gain);
    enemies.forget(events);
    shots.keepOnly(runtime.state.projectiles);
  });

  let session = runtime.session;
  const timer = window.setInterval(() => {
    if (runtime.session !== session) {
      session = runtime.session;
      enemies.clear();
      shots.clear();
    }
    const state = runtime.state;
    watchDash();
    engine.setTrack(trackFor(state, runtime.ctx.map.nights, runtime.paused));
  }, POLL_MS);

  return () => {
    offEvents();
    window.clearInterval(timer);
    engine.setTrack(null);
  };
}
