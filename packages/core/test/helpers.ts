import { loadContentOrThrow, type ContentBundle, type RawContent } from '@kd/content';
import { placeholderContent, placeholderRaw } from '@kd/content/placeholder';
import { Session, type GameEvent } from '../src/index.ts';

export const content = placeholderContent;
export const config = { mapId: 'placeholder', weaponId: 'sword', seed: 1 };

export function newSession(seed = 1, bundle: ContentBundle = content): Session {
  return new Session(bundle, { ...config, seed });
}

/** Placeholder content with a change applied to a deep copy of the raw files. */
export function contentWith(edit: (raw: RawContent) => void): ContentBundle {
  const raw = JSON.parse(JSON.stringify(placeholderRaw)) as RawContent;
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
export function emptyNight(session: Session): void {
  session.submit({ type: 'startNight' });
  session.state.spawnQueue = [];
}
