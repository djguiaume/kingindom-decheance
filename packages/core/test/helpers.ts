import { loadContentOrThrow, type ContentBundle, type RawContent } from '@kd/content';
import { prototypeContent, prototypeRaw, prototypeRun } from '@kd/content/prototype';
import { Session, type EnemyState, type GameEvent } from '../src/index.ts';

export const content = prototypeContent;
export const config = { ...prototypeRun, seed: 1 };

export function newSession(seed = 1, bundle: ContentBundle = content): Session {
  return new Session(bundle, { ...config, seed });
}

/** Prototype content with a change applied to a deep copy of the raw files. */
export function contentWith(edit: (raw: RawContent) => void): ContentBundle {
  const raw = JSON.parse(JSON.stringify(prototypeRaw)) as RawContent;
  edit(raw);
  return loadContentOrThrow(raw);
}

/** Steps until the predicate holds; fails the test if it never does. */
export function stepUntil(session: Session, done: () => boolean, maxTicks = 30 * 60 * 5): void {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return;
    session.step();
  }
  throw new Error(`condition not reached within ${maxTicks} ticks`);
}

/** Steps until the predicate holds and returns every event seen on the way. */
export function collectUntil(
  session: Session,
  done: () => boolean,
  maxTicks = 30 * 60 * 5,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return events;
    events.push(...session.step());
  }
  throw new Error(`condition not reached within ${maxTicks} ticks`);
}

/** Starts the night with no enemies at all, for tests that set up their own fight. */
export function emptyNight(session: Session, keepAliveTicks = 0): void {
  session.submit({ type: 'startNight' });
  // A far-off spawn order keeps the night from ending at once when asked to.
  session.state.spawnQueue =
    keepAliveTicks > 0 ? [{ at: keepAliveTicks, lane: 'west', enemy: 'raider' }] : [];
}

/** Puts an enemy at a position, idle (long cooldown) unless told otherwise. */
export function placeEnemy(
  session: Session,
  type: string,
  x: number,
  y: number,
  over: Partial<EnemyState> = {},
): EnemyState {
  const def = session.ctx.enemies.get(type)!;
  const enemy: EnemyState = {
    id: session.state.nextId++,
    type,
    lane: def.flying ? 'air' : 'west',
    waypoint: 1,
    pos: { x, y },
    hp: def.hp,
    maxHp: def.hp,
    cooldown: 999,
    target: null,
    abilityCooldown: 0,
    ...over,
  };
  session.state.enemies.push(enemy);
  return enemy;
}

/** Keeps the king out of every fight. */
export function benchKing(session: Session): void {
  session.state.king.alive = false;
  session.state.king.respawnIn = 1_000_000;
}
