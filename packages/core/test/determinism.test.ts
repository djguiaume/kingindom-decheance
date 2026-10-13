/**
 * Determinism (ADR-007 tier 1): the same inputs must give the same run, bit for bit,
 * including when the run is snapshotted and resumed, or rebuilt from its command log.
 * fast-check generates many random scripts (seed, builds, king moves) and checks the
 * invariants after every tick; failing cases are shrunk to a minimal example.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clone,
  cyrb53,
  canonicalJson,
  playReplay,
  Session,
  stateHash,
  type LoggedCommand,
} from '../src/index.ts';
import { config, content } from './helpers.ts';

interface Script {
  seed: number;
  days: { slot: number; option: number; upgrade: boolean }[][];
  moves: [number, number][];
}

const scriptArb: fc.Arbitrary<Script> = fc.record({
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
  days: fc.array(
    fc.array(fc.record({ slot: fc.nat(10), option: fc.nat(3), upgrade: fc.boolean() }), {
      maxLength: 5,
    }),
    { minLength: 2, maxLength: 2 },
  ),
  moves: fc.array(fc.tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 })), {
    minLength: 1,
    maxLength: 12,
  }),
});

const MAX_NIGHT_TICKS = 30 * 90;

/** Plays a script; `onTick` sees the session after every step. Refused commands are fine. */
function play(
  script: Script,
  onTick?: (s: Session, eventsHash: string) => void,
): { session: Session; events: string } {
  const session = new Session(content, { ...config, seed: script.seed });
  const slots = session.ctx.map.nodes.filter((n) => n.slot);
  let eventLog = '';
  for (const day of script.days) {
    if (session.over) break;
    for (const a of day) {
      const node = slots[a.slot % slots.length]!;
      if (a.upgrade) session.submit({ type: 'cycleRally', slot: node.id });
      session.submit({ type: 'buy', slot: node.id, option: a.option % 2 });
    }
    session.submit({ type: 'startNight' });
    let i = 0;
    while (session.state.phase === 'night' && session.state.nightTick < MAX_NIGHT_TICKS) {
      if (session.state.nightTick % 15 === 0) {
        const [x, y] = script.moves[i++ % script.moves.length]!;
        session.submit({ type: 'move', x, y });
        if (x !== 0 && y !== 0) session.submit({ type: 'ability' });
        if (x === 0 && y !== 0) session.submit({ type: 'rally' });
      }
      const events = session.step();
      eventLog = cyrb53(eventLog + canonicalJson(events));
      onTick?.(session, eventLog);
    }
    if (session.state.phase === 'night') break; // stuck night: stop the script here
  }
  return { session, events: eventLog };
}

function checkInvariants(s: Session): void {
  const st = s.state;
  expect(st.gold).toBeGreaterThanOrEqual(0);
  const bodies = [st.castle, st.king, ...st.buildings, ...st.units, ...st.enemies];
  for (const b of bodies) {
    expect(b.hp).toBeGreaterThanOrEqual(0);
    expect(b.hp).toBeLessThanOrEqual(b.maxHp);
  }
  // Dead entities are removed in the same tick, so nothing dead can act next tick.
  for (const e of st.enemies) expect(e.hp).toBeGreaterThan(0);
  for (const u of st.units) expect(u.hp).toBeGreaterThan(0);
  if (st.phase === 'lost') expect(st.castle.hp).toBe(0);
  if (st.phase === 'day' || st.phase === 'won') {
    // A night only ends once every enemy has spawned and died.
    expect(st.enemies).toEqual([]);
    expect(st.spawnQueue).toEqual([]);
  }
  const ids = [...st.buildings, ...st.units, ...st.enemies].map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Math.max(0, ...ids)).toBeLessThan(st.nextId);
}

// Each property plays whole nights many times over, so they get more than the default 5 s.
describe('determinism', { timeout: 60_000 }, () => {
  it('holds the invariants on every tick of random runs', () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        play(script, (s) => checkInvariants(s));
      }),
      { numRuns: 15 },
    );
  });

  it('gives the same state and events for the same inputs', () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const a = play(script);
        const b = play(script);
        expect(stateHash(b.session.state)).toBe(stateHash(a.session.state));
        expect(b.events).toBe(a.events);
      }),
      { numRuns: 15 },
    );
  });

  it('rebuilds the exact run from its command log', () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const { session } = play(script);
        // A script may stop on a stuck night; replay to the same tick and compare there.
        const replayed = playReplay(content, session.toReplay(), session.state.tick);
        expect(stateHash(replayed.state)).toBe(stateHash(session.state));
      }),
      { numRuns: 15 },
    );
  });

  it('resumes from a snapshot exactly as an uninterrupted run', () => {
    fc.assert(
      fc.property(scriptArb, fc.nat(2000), (script, cut) => {
        const { session } = play(script);
        const replay = session.toReplay();
        const end = session.state.tick;
        const at = Math.min(cut, end);

        // Run to the cut, snapshot the state (as a save file would), and resume in a new session.
        const first = new Session(content, replay.config);
        const rest = feed(first, replay.commands, at);
        const resumed = new Session(content, replay.config);
        resumed.state = clone(first.state);
        feed(resumed, rest, end);

        expect(stateHash(resumed.state)).toBe(stateHash(session.state));
      }),
      { numRuns: 15 },
    );
  });

  it('different seeds give different runs', () => {
    const base = {
      days: [[{ slot: 4, option: 0, upgrade: false }], [], []],
      moves: [[0, 0]] as [number, number][],
    };
    const hashes = new Set(
      [1, 2, 3, 4].map((seed) => stateHash(play({ ...base, seed }).session.state)),
    );
    expect(hashes.size).toBe(4);
  });
});

/** Applies logged commands up to tick `until` (stepping as needed); returns the ones left. */
function feed(session: Session, commands: LoggedCommand[], until: number): LoggedCommand[] {
  let i = 0;
  while (
    session.state.tick < until ||
    (i < commands.length && commands[i]!.tick === session.state.tick)
  ) {
    const next = commands[i];
    if (next && next.tick === session.state.tick) {
      expect(session.submit(next.command).ok).toBe(true);
      i++;
    } else {
      if (session.state.tick >= until) break;
      session.step();
    }
  }
  return commands.slice(i);
}
