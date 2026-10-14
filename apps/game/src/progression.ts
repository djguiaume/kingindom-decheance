/**
 * Progression service (corpus 13 §6.4): the one place that decides whether a weapon, perk,
 * mutator or map is unlocked, and what a finished run earns. Stage A keeps everything open
 * and awards no XP; Thronefall-style XP levels later change only the rules in here (and a
 * `progression.json` content file), not the screens or the core. The core never knows about
 * unlocks: it receives a RunConfig the app has already checked.
 */

/** What a finished run tells progression (a subset of the simulator's RunSummary). */
export interface RunRecord {
  mapId: string;
  won: boolean;
  nightsSurvived: number;
  score: number;
}

/** One finished run as the profile keeps it (13 §2.3). */
export interface RunEntry {
  mapId: string;
  score: number;
  won: boolean;
  /** Nights held to the dawn. */
  nights: number;
  weaponId: string;
  /** Castle perks picked during the run. */
  perks: string[];
  seed: number;
  /** ISO date and time the run ended. */
  date: string;
}

/** The player's profile in this browser. Versioned so later formats can migrate it. */
export interface Profile {
  schemaVersion: 1;
  xp: number;
  level: number;
  /** Ids unlocked by XP. Empty while everything is open. */
  unlocked: string[];
  /** Best run per map id. */
  records: Record<string, RunEntry>;
  /** The last runs, newest first. */
  recent: RunEntry[];
}

/** How many past runs the profile keeps. */
export const RECENT_RUNS = 10;

const KEY = 'kd.profile';

const fresh = (): Profile => ({
  schemaVersion: 1,
  xp: 0,
  level: 1,
  unlocked: [],
  records: {},
  recent: [],
});

/** Reads the profile, or a fresh one when there is none, it is unreadable or storage is off. */
export function loadProfile(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Profile {
  try {
    const raw = storage?.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<Profile>) : null;
    return data?.schemaVersion === 1 ? { ...fresh(), ...data, schemaVersion: 1 } : fresh();
  } catch {
    return fresh();
  }
}

export function saveProfile(
  profile: Profile,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private windows and full storage: progression is a nicety, never a crash.
  }
}

/**
 * Whether a catalogue entry can be picked. `unlock` is the entry's optional unlock field.
 * Stage A: everything is open.
 */
export function isUnlocked(_profile: Profile, _entry: { unlock?: { level: number } }): boolean {
  return true;
}

/**
 * Adds a finished run: it joins the recent runs and becomes the map's record when it beats it.
 * Returns the new profile and the record it had to beat (null on a map's first run).
 */
export function recordRun(
  profile: Profile,
  run: RunEntry,
): { profile: Profile; previousBest: RunEntry | null; newBest: boolean } {
  const previousBest = profile.records[run.mapId] ?? null;
  const newBest = !previousBest || run.score > previousBest.score;
  return {
    profile: {
      ...profile,
      records: newBest ? { ...profile.records, [run.mapId]: run } : profile.records,
      recent: [run, ...profile.recent].slice(0, RECENT_RUNS),
    },
    previousBest,
    newBest,
  };
}

/** What a finished run earns. Stage A: no XP and nothing new. */
export function awardRun(
  profile: Profile,
  _run: RunRecord,
): { profile: Profile; xpGained: number; newUnlocks: string[] } {
  return { profile, xpGained: 0, newUnlocks: [] };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
