/**
 * Golden runs (ADR-007 tier 2): recorded replays with their expected outcome.
 * Regenerate deliberately, and say why in the commit:
 *   pnpm golden:update
 */
import type { ContentBundle } from '@kd/content';
import { prototypeRun } from '@kd/content/prototype';
import type { Replay } from '@kd/core';
import { policies } from '../src/policies.ts';
import { runHeadless, type RunSummary } from '../src/runner.ts';

export interface GoldenCase {
  name: string;
  why: string;
  policy: string;
  seed: number;
}

export interface GoldenFile {
  name: string;
  why: string;
  replay: Replay;
  expected: RunSummary;
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'balanced-win',
    why: 'eco early, then towers, walls and an active king win Greyhollow',
    policy: 'balanced',
    seed: 1,
  },
  {
    name: 'balanced-win-seed-8',
    why: 'same plan, another seed: RNG flows through spawns',
    policy: 'balanced',
    seed: 8,
  },
  {
    name: 'defensive-loss',
    why: 'defences only, no eco: a seed where night 6 breaks through',
    policy: 'defensive',
    seed: 5,
  },
  {
    name: 'greedy-loss',
    why: 'eco-first with an idle king falls on night 3 (pass and flyers open)',
    policy: 'greedy',
    seed: 1,
  },
  {
    name: 'king-only',
    why: 'no buildings: the king and the castle alone fall on night 5',
    policy: 'king-only',
    seed: 1,
  },
  { name: 'idle-loss', why: 'no buildings, no king: the castle falls', policy: 'idle', seed: 1 },
];

export function recordGolden(content: ContentBundle, c: GoldenCase): GoldenFile {
  const policy = policies[c.policy];
  if (!policy) throw new Error(`unknown policy ${c.policy}`);
  const { summary, replay } = runHeadless(content, { ...prototypeRun, seed: c.seed }, policy);
  return { name: c.name, why: c.why, replay, expected: summary };
}
