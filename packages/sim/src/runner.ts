/**
 * Headless run: a policy plays one full run as fast as the CPU allows (ADR-003).
 * The same function will run inside Web Workers and the Node CLI.
 */
import type { ContentBundle } from '@kd/content';
import { scoreOf, Session, stateHash, TICK_RATE, type Replay, type RunConfig } from '@kd/core';
import { KING_DECISION_TICKS, type Policy } from './policies.ts';

/** Compact result of one run; what batches aggregate (ADR-003). */
export interface RunSummary {
  contentHash: string;
  policy: string;
  config: RunConfig;
  outcome: 'won' | 'lost' | 'timeout';
  nightReached: number;
  goldPerNight: number[];
  buildingsLostPerNight: number[];
  enemiesKilled: number;
  /** The run's score (13 §2); a timed-out run is scored as lost. */
  score: number;
  ticks: number;
  finalHash: string;
}

export interface RunResult {
  summary: RunSummary;
  replay: Replay;
}

/** A night that lasts longer than this is treated as stuck (protects batch runs from hanging). */
export const MAX_NIGHT_TICKS = TICK_RATE * 60 * 10;

export function runHeadless(content: ContentBundle, config: RunConfig, policy: Policy): RunResult {
  const session = new Session(content, config);
  let timedOut = false;

  while (!session.over && !timedOut) {
    for (const command of policy.day(session.state, session.ctx)) {
      const result = session.submit(command);
      if (!result.ok)
        throw new Error(`Policy ${policy.id} sent an invalid command: ${result.reason}`);
    }
    session.submit({ type: 'startNight' });
    while (session.state.phase === 'night') {
      if (policy.night && session.state.nightTick % KING_DECISION_TICKS === 0) {
        for (const command of policy.night(session.state, session.ctx)) session.submit(command);
      }
      session.step();
      if (session.state.nightTick > MAX_NIGHT_TICKS) {
        timedOut = true;
        break;
      }
    }
  }

  return {
    summary: summarize(session, policy.id, timedOut),
    replay: session.toReplay(),
  };
}

export function summarize(session: Session, policyId: string, timedOut = false): RunSummary {
  const s = session.state;
  return {
    contentHash: session.ctx.contentHash,
    policy: policyId,
    config: { ...session.config },
    outcome: timedOut ? 'timeout' : s.phase === 'won' ? 'won' : 'lost',
    nightReached: s.day,
    goldPerNight: s.history.map((h) => h.income),
    buildingsLostPerNight: s.history.map((h) => h.buildingsLost),
    enemiesKilled: s.history.reduce((n, h) => n + h.enemiesKilled, 0),
    score: scoreOf(s, session.ctx).total,
    ticks: s.tick,
    finalHash: stateHash(s),
  };
}
