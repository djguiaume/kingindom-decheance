/**
 * Developer CLI (ADR-003): runs a block of seeds headless and prints a summary.
 *   pnpm sim --policy greedy --runs 200 --seed 1
 * Node is a dev tool only; the game never depends on it.
 */
import { parseArgs } from 'node:util';
import { placeholderContent } from '@kd/content/placeholder';
import { policies } from './policies.ts';
import { runHeadless } from './runner.ts';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    policy: { type: 'string', default: 'greedy' },
    map: { type: 'string', default: 'placeholder' },
    weapon: { type: 'string', default: 'sword' },
    runs: { type: 'string', default: '100' },
    seed: { type: 'string', default: '1' },
    json: { type: 'boolean', default: false },
  },
});

const policy = policies[values.policy];
if (!policy)
  throw new Error(`Unknown policy "${values.policy}". Known: ${Object.keys(policies).join(', ')}`);
const runs = Number(values.runs);
const firstSeed = Number(values.seed);

const started = Date.now();
const summaries = [];
for (let i = 0; i < runs; i++) {
  const config = { mapId: values.map, weaponId: values.weapon, seed: firstSeed + i };
  summaries.push(runHeadless(placeholderContent, config, policy).summary);
}
const elapsed = (Date.now() - started) / 1000;

if (values.json) {
  console.log(JSON.stringify(summaries, null, 2));
} else {
  const wins = summaries.filter((s) => s.outcome === 'won').length;
  const meanNight = summaries.reduce((n, s) => n + s.nightReached, 0) / runs;
  console.log(
    `content ${placeholderContent.hash} · policy ${policy.id} · ${runs} runs in ${elapsed.toFixed(2)}s`,
  );
  console.log(
    `win rate ${((100 * wins) / runs).toFixed(1)}% · mean night reached ${meanNight.toFixed(2)}`,
  );
}
