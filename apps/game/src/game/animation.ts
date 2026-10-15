/**
 * Light character animation (corpus 11 §12.0, item 2): walk bob, weapon swing, hit flash and
 * death fall, all drawn in code from what the view already sees (positions and core events).
 * View-only (ADR-004): nothing here reaches the core, so replays and balance are untouched.
 * The curves are pure functions of elapsed time so they can be tested without Phaser.
 */
import type { GameEvent, Ref } from '@kd/core';

/** Metres walked per full step (two bobs). */
export const STRIDE_M = 0.9;
/** The king covers 7 m/s: a longer painted stride keeps his four frames near 10 FPS. */
export const KING_STRIDE_M = 2.8;
export const strideFor = (id: string): number => (id === 'king' ? KING_STRIDE_M : STRIDE_M);

export interface KingAction {
  phase: 'anticipate' | 'roll' | 'uncurl';
  elapsed: number;
}

/** Observes the real dash; it never delays or changes movement, damage or cooldown. */
export class KingActions {
  private dashing = false;
  private started = 0;
  private ended = -Infinity;

  update(dashing: boolean, alive: boolean, now: number): KingAction | null {
    if (!alive) {
      this.dashing = false;
      this.ended = -Infinity;
      return null;
    }
    if (dashing && !this.dashing) this.started = now;
    if (!dashing && this.dashing) this.ended = now;
    this.dashing = dashing;
    if (dashing) {
      const elapsed = now - this.started;
      return { phase: elapsed < 30 ? 'anticipate' : 'roll', elapsed };
    }
    return now - this.ended < 160 ? { phase: 'uncurl', elapsed: now - this.ended } : null;
  }
}
/**
 * How an actor attacks, which shapes both its tell and its blow: the king thrusts his spear,
 * swordsmen and axemen chop, archers and slingers draw and loose, the catapult throws, the harpy
 * dives at its prey.
 */
export type AttackStyle = 'thrust' | 'chop' | 'shoot' | 'throw' | 'dive';

const STYLES: Record<string, AttackStyle> = {
  king: 'thrust',
  archer: 'shoot',
  crossbowman: 'shoot',
  skirmisher: 'shoot',
  catapult: 'throw',
  harpy: 'dive',
};
export const styleOf = (id: string): AttackStyle => STYLES[id] ?? 'chop';

/**
 * The phases of an attack, in ms. `tell` is the longest wind-up shown before a blow the core
 * has scheduled (the attacker's cooldown is running out with its target in reach); `strike`
 * snaps to the blow once the core reports it (`hit` or `fired`), `hold` keeps it, `recover`
 * returns to rest. Every tell is shorter than its attacker's interval, so tells never start
 * before the previous blow has landed.
 */
export interface AttackTiming {
  tell: number;
  strike: number;
  hold: number;
  recover: number;
}

export const TIMING: Record<AttackStyle, AttackTiming> = {
  thrust: { tell: 240, strike: 70, hold: 80, recover: 180 },
  chop: { tell: 320, strike: 90, hold: 70, recover: 240 },
  shoot: { tell: 420, strike: 40, hold: 60, recover: 260 },
  throw: { tell: 700, strike: 120, hold: 160, recover: 600 },
  dive: { tell: 320, strike: 100, hold: 60, recover: 260 },
};
/** The warlord's stomp: it rises over the tell, slams down on the blow. */
export const STOMP_TIMING: AttackTiming = { tell: 600, strike: 90, hold: 120, recover: 320 };

const smooth = (t: number) => t * t * (3 - 2 * t);

/** How far into its wind-up an attacker is, 0 to 1, with `remaining` ms before its blow. */
export function tellAt(timing: AttackTiming, remaining: number): number {
  if (!(remaining < timing.tell)) return 0;
  return smooth(Math.min(1, Math.max(0, 1 - remaining / timing.tell)));
}

/**
 * The blow `ms` after the core reported it: from `from` (the wind-up it started at, -1 to 0) to
 * full reach (1) fast, held, then back to rest (0). Null outside the blow.
 */
export function blowAt(timing: AttackTiming, ms: number, from = 0): number | null {
  const { strike, hold, recover } = timing;
  if (ms < 0 || ms >= strike + hold + recover) return null;
  if (ms < strike) {
    const t = ms / strike;
    return from + (1 - from) * (1 - (1 - t) * (1 - t));
  }
  if (ms < strike + hold) return 1;
  return 1 - smooth((ms - strike - hold) / recover);
}

/**
 * Where an attack stands: below 0 it winds up (-1 fully), above 0 it strikes (1 at full reach),
 * 0 at rest. A tell during the recovery of the last blow blends into it.
 */
export function actAt(timing: AttackTiming, sinceBlow: number, from: number, tell: number): number {
  const blow = blowAt(timing, sinceBlow, from);
  if (blow === null) return tell > 0 ? -tell : 0;
  if (sinceBlow < timing.strike + timing.hold) return blow;
  return Math.max(-1, blow - tell);
}

/**
 * How the body moves with its attack: lean (radians), shift and stretch (of its width), lift
 * and squash (of its height). All zero (and scales 1) at rest.
 */
export interface BodyMotion {
  lean: number;
  shift: number;
  lift: number;
  stretch: number;
  squash: number;
}

/** The body motion of an attack `act` (-1 to 1) and, for the warlord, a stomp. */
export function bodyAt(style: AttackStyle, act: number, stomp = 0): BodyMotion {
  if (act === 0 && stomp === 0) return { lean: 0, shift: 0, lift: 0, stretch: 1, squash: 1 };
  const back = Math.max(0, -act);
  const on = Math.max(0, act);
  const m: BodyMotion = { lean: 0, shift: 0, lift: 0, stretch: 1, squash: 1 };
  switch (style) {
    case 'thrust':
      // Draws back over the tell, then lunges along the spear.
      m.lean = -0.12 * back + 0.22 * on;
      m.shift = -0.08 * back + 0.2 * on;
      m.stretch = 1 + 0.08 * on;
      m.squash = 1 - 0.04 * back;
      break;
    case 'chop':
      // Rears up with the weapon, then throws its weight into the blow.
      m.lean = -0.16 * back + 0.24 * on;
      m.shift = 0.12 * on;
      m.squash = 1 + 0.05 * back - 0.08 * on;
      m.stretch = 1 - 0.03 * back + 0.06 * on;
      break;
    case 'shoot':
      // Leans into the draw, kicks back on release.
      m.lean = -0.08 * back - 0.12 * on;
      m.shift = -0.04 * back - 0.08 * on;
      break;
    case 'throw':
      m.lean = -0.1 * back + 0.14 * on;
      m.squash = 1 - 0.06 * back + 0.04 * on;
      break;
    case 'dive':
      // Climbs over the tell, swoops down at the prey.
      m.lift = 0.45 * back - 0.4 * on;
      m.lean = -0.1 * back + 0.4 * on;
      m.shift = 0.25 * on;
      break;
  }
  if (stomp < 0) {
    m.lift += 0.35 * -stomp;
    m.squash *= 1 + 0.05 * -stomp;
  } else if (stomp > 0) {
    m.squash *= 1 - 0.12 * stomp;
    m.stretch *= 1 + 0.08 * stomp;
  }
  return m;
}

/**
 * What the view knows about an actor's next blow: ms before its attack and the warlord's stomp
 * can land (Infinity when none is coming), and where the attack is aimed.
 */
export interface Tell {
  attack: number;
  stomp: number;
  at: { x: number; y: number } | null;
}
export const NO_TELL: Tell = { attack: Infinity, stomp: Infinity, at: null };

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
  /** Weapon swing, 0 at rest, 1 at the end of the blow (the code-drawn stand-ins). */
  swing: number;
  /** The attack: -1 fully wound up, 0 at rest, 1 at full reach of the blow. */
  act: number;
  /** The warlord's stomp, the same way. */
  stomp: number;
  /** Ms since the last blow landed (Infinity when none is playing): smears and streaks. */
  blow: number;
  /** Where the attack being told or struck is aimed, in metres; null at rest. */
  target: { x: number; y: number } | null;
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
  act: 0,
  stomp: 0,
  blow: Infinity,
  target: null,
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
export function bobAt(walked: number, strideM = STRIDE_M): number {
  return Math.abs(Math.sin((walked / strideM) * Math.PI));
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
  lastPose: number;
  /** When the last blow landed, the wind-up it started from, and where it was aimed. */
  blowStart: number;
  blowFrom: number;
  aim: { x: number; y: number } | null;
  stompStart: number;
  stompFrom: number;
  /** The attack and stomp as last drawn (a blow starts from there). */
  act: number;
  stomp: number;
  flashStart: number;
}

function newTrack(pos: { x: number; y: number }, now: number): Track {
  return {
    pos: { ...pos },
    walked: 0,
    facing: 1,
    back: false,
    lastStep: -Infinity,
    lastPose: now,
    blowStart: -Infinity,
    blowFrom: 0,
    aim: null,
    stompStart: -Infinity,
    stompFrom: 0,
    act: 0,
    stomp: 0,
    flashStart: -Infinity,
  };
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
    shotTarget: (id: number) => { x: number; y: number } | null = () => null,
  ): void {
    // A stomp reports each one it hits as a hit too: those are the stomp, not a second blow.
    const stompers = stompersIn(events);
    for (const e of events) {
      // A shot is swung when it leaves (`fired`); its later hit only flashes the target.
      if (
        e.type === 'fired' ||
        (e.type === 'hit' && !e.projectile && !stompers.has(keyOf(e.attacker) ?? ''))
      ) {
        const track = this.track(e.attacker);
        // One blow per attack: a spear that hits three enemies in one tick thrusts once, at
        // the first.
        if (track && track.blowStart !== now) {
          track.blowStart = now;
          track.blowFrom = Math.min(0, track.act);
          const target = e.type === 'hit' ? posOf(e.target) : shotTarget(e.id);
          track.aim = target ? { ...target } : null;
          if (target) face(track, target);
        }
      }
      if (e.type === 'stomp') {
        const track = this.tracks.get(`e${e.enemy}`);
        if (track) {
          track.stompStart = now;
          track.stompFrom = Math.min(0, track.stomp);
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
    tell: Tell = NO_TELL,
  ): Pose {
    let track = this.tracks.get(key);
    if (!track) {
      track = newTrack(pos, now);
      this.tracks.set(key, track);
    }
    const timing = TIMING[styleOf(look.sprite)];
    const sinceBlow = now - track.blowStart;
    const striking = blowAt(timing, sinceBlow) !== null;
    const telling = tellAt(timing, tell.attack);
    this.looks.set(key, look);
    const dx = pos.x - track.pos.x;
    const dy = pos.y - track.pos.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    // Big jumps are respawns or restarts, not steps.
    if (moved < 1) {
      track.walked += moved;
      // An attacker keeps facing its target through its tell and blow.
      const attacking = striking || telling > 0;
      if (!attacking && Math.abs(dx) > 0.002) track.facing = dx < 0 ? -1 : 1;
      if (moved > 0.002) {
        if (!attacking) track.back = seenFromBehind(dx, dy, track.back);
        track.lastStep = now;
      }
    }
    // Standing still settles the foot down instead of freezing mid-hop.
    const stride = strideFor(look.sprite);
    if (moved < 0.001)
      track.walked = settle(track.walked, stride, Math.max(0, now - track.lastPose));
    track.lastPose = now;
    track.pos = { ...pos };
    if (!striking && telling > 0 && tell.at) face(track, tell.at);
    const act = actAt(timing, sinceBlow, track.blowFrom, telling);
    const stomp = actAt(
      STOMP_TIMING,
      now - track.stompStart,
      track.stompFrom,
      tellAt(STOMP_TIMING, tell.stomp),
    );
    track.act = act;
    track.stomp = stomp;
    return {
      bob: bobAt(track.walked, stride),
      lean: act > 0 ? act * 0.35 : act * 0.15,
      swing: Math.max(0, act),
      act,
      stomp,
      blow: striking ? sinceBlow : Infinity,
      target: striking ? track.aim : telling > 0 ? tell.at : null,
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
    if (!this.tracks.has(key)) this.tracks.set(key, newTrack(pos, 0));
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

/** The animation keys of the enemies that stomped in a batch of events. */
export function stompersIn(events: readonly GameEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.type === 'stomp') out.add(`e${e.enemy}`);
  return out;
}

/** Turns a track toward a point (sideways only when it is clearly to one side). */
function face(track: Track, at: { x: number; y: number }): void {
  if (Math.abs(at.x - track.pos.x) > 0.05) track.facing = at.x < track.pos.x ? -1 : 1;
  track.back = seenFromBehind(at.x - track.pos.x, at.y - track.pos.y, track.back);
}

/** Moves the walked distance on to the next point where both feet are down (bob 0). */
function settle(walked: number, stride: number, deltaMs: number): number {
  const into = walked % stride;
  if (into < 0.001 || stride - into < 0.001) return walked - into;
  // Finish the hop quickly rather than snapping to the ground.
  return Math.min(walked - into + stride, walked + (stride * deltaMs) / 120);
}
