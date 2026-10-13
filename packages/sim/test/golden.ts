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
    name: 'defensive-win',
    why: 'towers, walls and an active king win the run',
    policy: 'defensive',
    seed: 1,
  },
  {
    name: 'defensive-win-seed-7',
    why: 'same plan, another seed: RNG flows through spawns',
    policy: 'defensive',
    seed: 7,
  },
  {
    name: 'greedy-loss',
    why: 'eco-first with an idle king loses to flyers',
    policy: 'greedy',
    seed: 1,
  },
  { name: 'idle-loss', why: 'no buildings, no king: the castle falls', policy: 'idle', seed: 1 },
];

export function recordGolden(content: ContentBundle, c: GoldenCase): GoldenFile {
  const policy = policies[c.policy];
  if (!policy) throw new Error(`unknown policy ${c.policy}`);
  const { summary, replay } = runHeadless(
    content,
    { ...prototypeRun, seed: c.seed },
    policy,
  );
  return { name: c.name, why: c.why, replay, expected: summary };
}
