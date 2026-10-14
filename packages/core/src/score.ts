/**
 * The run's score (corpus 13 §2), modelled on Thronefall: points for every night held, fewer
 * when buildings fall, a bonus for gold left after a won run, and the run's multiplier (castle
 * perks today, mutators later) applied only to a win. Computed from state, so bots and players
 * get the same number.
 */
import type { GameContext } from './context.ts';
import type { GameState } from './state.ts';

/** Starting values (13 §2.1), to be re-tuned with the bots. */
export const SCORE = {
  perNight: 150,
  perBuildingLost: 25,
  perGold: 5,
  /** Easy mutators may lower the score but never below half. */
  multiplierFloor: 0.5,
} as const;

export interface ScoreBreakdown {
  won: boolean;
  /** Nights held to the dawn (the night the castle fell does not count). */
  nightsHeld: number;
  /** Buildings destroyed during the nights held, counting each loss even if rebuilt at dawn. */
  buildingsLost: number;
  /** What those losses cost (never more than a night's points per night). */
  lostPoints: number;
  /** Σ max(0, perNight − perBuildingLost × lost that night) over the nights held. */
  nightPoints: number;
  /** Won runs only: gold in hand at the end. */
  goldLeft: number;
  goldPoints: number;
  /** Won runs only; 1 on a lost run. */
  multiplier: number;
  total: number;
}

/** The score of a finished run, or of the run so far (then counted as lost). */
export function scoreOf(state: GameState, ctx: GameContext): ScoreBreakdown {
  const won = state.phase === 'won';
  // The history ends with the night that was lost, which earns nothing.
  const held = state.phase === 'lost' ? state.history.slice(0, -1) : state.history;
  let nightPoints = 0;
  let buildingsLost = 0;
  for (const night of held) {
    nightPoints += Math.max(0, SCORE.perNight - SCORE.perBuildingLost * night.buildingsLost);
    buildingsLost += night.buildingsLost;
  }
  const goldLeft = won ? state.gold : 0;
  const goldPoints = goldLeft * SCORE.perGold;
  const multiplier = won ? Math.max(SCORE.multiplierFloor, ctx.rules.scoreMultiplier) : 1;
  return {
    won,
    nightsHeld: held.length,
    buildingsLost,
    lostPoints: held.length * SCORE.perNight - nightPoints,
    nightPoints,
    goldLeft,
    goldPoints,
    multiplier,
    total: Math.round((nightPoints + goldPoints) * multiplier),
  };
}
