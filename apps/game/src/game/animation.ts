/**
 * Light character animation (corpus 11 §12.0, item 2): walk bob, weapon swing, hit flash and
 * death fall, all drawn in code from what the view already sees (positions and core events).
 * View-only (ADR-004): nothing here reaches the core, so replays and balance are untouched.
 * The curves are pure functions of elapsed time so they can be tested without Phaser.
 */
import type { GameEvent, Ref } from '@kd/core';

/** Metres walked per full step (two bobs). */
export const STRIDE_M = 0.9;
/** How long a weapon swing lasts. */
export const SWING_MS = 220;
/** How long a hit flash lasts. */
export const FLASH_MS = 120;
/** A death: the body tips over, then fades. */
export const FALL_MS = 260;
export const FADE_MS = 340;

/** How an actor is drawn this frame. All zero is standing still. */
export interface Pose {
  /** Pixels the body is lifted off the ground by its step, as a fraction of its radius. */
  bob: number;
  /** Body lean in radians, positive toward where it faces. */
  lean: number;
  /** Weapon swing, 0 at rest, 1 at the end of the blow. */
  swing: number;
  /** White flash strength, 0 to 1. */
  flash: number;
  /** 1 faces right, -1 faces left. */
  facing: 1 | -1;
  /** Seen from behind: it last walked (or struck) up the screen. */
  back: boolean;
  /** Metres walked so far, to pick walk frames. */
  walked: number;
  /** Walking right now (not standing still). */
  moving: boolean;
}

export const REST: Pose = {
  bob: 0,
  lean: 0,
  swing: 0,
  flash: 0,
  facing: 1,
  back: false,
  walked: 0,
  moving: false,
};

/** How long after its last step an actor still counts as walking (smooths frame gaps). */
const MOVING_MS = 120;

/** Whether a step or blow along (dx, dy) turns the actor's back to the viewer. */
export function seenFromBehind(dx: number, dy: number, was: boolean): boolean {
  // Mostly up the screen shows the back; mostly down or sideways the front. Near the diagonal
  // it keeps its view, so walking at 45 degrees does not flicker.
  if (dy < 0 && -dy > Math.abs(dx) * 1.2) return true;
  if (dy >= 0 || -dy * 1.2 < Math.abs(dx)) return false;
  return was;
}

/** The step bob for `walked` metres: one hop per stride, from 0 (feet down) to 1. */
export function bobAt(walked: number): number {
  return Math.abs(Math.sin((walked / STRIDE_M) * Math.PI));
}

/** The swing `ms` after a blow started: a fast wind-through, then a slower return. */
export function swingAt(ms: number): number {
  if (ms < 0 || ms >= SWING_MS) return 0;
  const t = ms / SWING_MS;
  return t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
}

/** The flash `ms` after a hit: full at once, fading out. */
export function flashAt(ms: number): number {
  return ms < 0 || ms >= FLASH_MS ? 0 : 1 - ms / FLASH_MS;
}

/**
 * A falling body `ms` after its death: how far it has tipped (0 to 1, eased like a fall)
 * and how visible it still is. Null once it is gone.
 */
export function fallAt(ms: number): { tip: number; alpha: number } | null {
  if (ms >= FALL_MS + FADE_MS) return null;
  if (ms < FALL_MS) {
    const t = Math.max(0, ms / FALL_MS);
    return { tip: t * t, alpha: 1 };
  }
  return { tip: 1, alpha: 1 - (ms - FALL_MS) / FADE_MS };
}

/** The view's key for an actor: the same keys as the runtime's interpolation. */
export function keyOf(ref: Ref): string | null {
  switch (ref.kind) {
    case 'king':
      return 'king';
    case 'unit':
      return `u${ref.id}`;
    case 'enemy':
      return `e${ref.id}`;
    case 'castle':
      return 'castle';
    case 'building':
      return `b${ref.id}`;
  }
}

interface Track {
  /** Last drawn ground position, in metres. */
  pos: { x: number; y: number };
  walked: number;
  facing: 1 | -1;
  back: boolean;
  lastStep: number;
  swingStart: number;
  flashStart: number;
}

/** A body left where an actor died, drawn until it has fallen and faded. */
export interface Corpse {
  pos: { x: number; y: number };
  sprite: string;
  radius: number;
  facing: 1 | -1;
  start: number;
}

/**
 * Remembers, per actor, how far it has walked, which way it faces and when it last struck or
 * was struck, and turns core events into swings, flashes and corpses.
 */
export class Animator {
  private tracks = new Map<string, Track>();
  /** What each actor looked like when last seen, to leave a body where it died. */
  private looks = new Map<string, { sprite: string; radius: number }>();
  corpses: Corpse[] = [];

  /**
   * Reads one batch of core events at time `now`. `posOf` gives an actor's position in metres
   * (to face the target of a blow).
   */
  onEvents(
    events: readonly GameEvent[],
    now: number,
    posOf: (ref: Ref) => { x: number; y: number } | null,
  ): void {
    for (const e of events) {
      // A shot is swung when it leaves (`fired`); its later hit only flashes the target.
      if (e.type === 'fired' || (e.type === 'hit' && !e.projectile)) {
        const track = this.track(e.attacker);
        if (track) {
          track.swingStart = now;
          const target = e.type === 'hit' ? posOf(e.target) : null;
          if (target && Math.abs(target.x - track.pos.x) > 0.05)
            track.facing = target.x < track.pos.x ? -1 : 1;
          if (target)
            track.back = seenFromBehind(target.x - track.pos.x, target.y - track.pos.y, track.back);
        }
      }
      if (e.type === 'hit') {
        const track = this.track(e.target);
        if (track) track.flashStart = now;
      }
      if (e.type === 'killed') {
        const key = keyOf(e.target);
        const track = key && this.tracks.get(key);
        const look = key && this.looks.get(key);
        if (key && track && look) {
          this.corpses.push({ pos: { ...track.pos }, ...look, facing: track.facing, start: now });
          this.tracks.delete(key);
        }
      }
    }
  }

  /** The pose of an actor drawn at `pos` (metres) at time `now`; call once per frame. */
  pose(
    key: string,
    pos: { x: number; y: number },
    look: { sprite: string; radius: number },
    now: number,
  ): Pose {
    let track = this.tracks.get(key);
    if (!track) {
      track = {
        pos: { ...pos },
        walked: 0,
        facing: 1,
        back: false,
        lastStep: -Infinity,
        swingStart: -Infinity,
        flashStart: -Infinity,
      };
      this.tracks.set(key, track);
    }
    this.looks.set(key, look);
    const dx = pos.x - track.pos.x;
    const dy = pos.y - track.pos.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    // Big jumps are respawns or restarts, not steps.
    if (moved < 1) {
      track.walked += moved;
      if (Math.abs(dx) > 0.002) track.facing = dx < 0 ? -1 : 1;
      if (moved > 0.002) {
        track.back = seenFromBehind(dx, dy, track.back);
        track.lastStep = now;
      }
    }
    // Standing still settles the foot down instead of freezing mid-hop.
    if (moved < 0.001) track.walked = settle(track.walked);
    track.pos = { ...pos };
    const swing = swingAt(now - track.swingStart);
    return {
      bob: bobAt(track.walked),
      lean: swing * 0.25,
      swing,
      flash: flashAt(now - track.flashStart),
      facing: track.facing,
      back: track.back,
      walked: track.walked,
      moving: now - track.lastStep < MOVING_MS,
    };
  }

  /** The flash of a building or the castle, which never walks. */
  flash(key: string, now: number): number {
    const track = this.tracks.get(key);
    return track ? flashAt(now - track.flashStart) : 0;
  }

  /** Registers a building or the castle so its hits flash. */
  still(key: string, pos: { x: number; y: number }): void {
    if (!this.tracks.has(key))
      this.tracks.set(key, {
        pos: { ...pos },
        walked: 0,
        facing: 1,
        back: false,
        lastStep: -Infinity,
        swingStart: -Infinity,
        flashStart: -Infinity,
      });
  }

  /** Drops corpses that are gone and actors not drawn this frame (`seen`). */
  prune(seen: ReadonlySet<string>, now: number): void {
    this.corpses = this.corpses.filter((c) => fallAt(now - c.start) !== null);
    for (const key of this.tracks.keys()) {
      if (seen.has(key)) continue;
      this.tracks.delete(key);
      this.looks.delete(key);
    }
  }

  private track(ref: Ref): Track | undefined {
    const key = keyOf(ref);
    return key ? this.tracks.get(key) : undefined;
  }
}

/** Moves the walked distance on to the next point where both feet are down (bob 0). */
function settle(walked: number): number {
  const into = walked % STRIDE_M;
  if (into < 0.001 || STRIDE_M - into < 0.001) return walked - into;
  // Finish the hop quickly rather than snapping to the ground.
  return Math.min(walked - into + STRIDE_M, walked + 0.08);
}
