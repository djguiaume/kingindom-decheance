/**
 * Developer CLI (ADR-003): runs a block of seeds headless and prints a summary.
 *   pnpm sim --policy greedy --runs 200 --seed 1
 * Node is a dev tool only; the game never depends on it.
 */
import { parseArgs } from 'node:util';
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { makeBalanced, makeDefensive, policies } from './policies.ts';
import { runHeadless } from './runner.ts';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    policy: { type: 'string', default: 'greedy' },
    map: { type: 'string', default: prototypeRun.mapId },
    weapon: { type: 'string', default: prototypeRun.weaponId },
    king: { type: 'string', default: prototypeRun.kingId },
    runs: { type: 'string', default: '100' },
    seed: { type: 'string', default: '1' },
    json: { type: 'boolean', default: false },
    /** Castle perk picks for balanced/defensive, e.g. "1,2" (indexes per level). */
    perks: { type: 'string' },
    /** Upgrade branches balanced/defensive prefer, e.g. "knight_hall,crossbow_range". */
    branches: { type: 'string' },
    /** Mutator ids for every run, e.g. "ironhide,no_walls" (13 §3). */
    mutators: { type: 'string' },
    /** Starting perk ids for every run, at most 3, e.g. "gold_rush,veterans" (13 §4). */
    starting: { type: 'string' },
  },
});

const picks = values.perks?.split(',').map(Number);
const branches = values.branches?.split(',');
const mutatorIds = values.mutators?.split(',');
const perkIds = values.starting?.split(',');
const makers: Record<string, typeof makeBalanced> = {
  balanced: makeBalanced,
  defensive: makeDefensive,
};
const maker = makers[values.policy];
const policy = (picks || branches) && maker ? maker(picks, branches) : policies[values.policy];
if (!policy)
  throw new Error(`Unknown policy "${values.policy}". Known: ${Object.keys(policies).join(', ')}`);
const runs = Number(values.runs);
const firstSeed = Number(values.seed);

const started = Date.now();
const summaries = [];
for (let i = 0; i < runs; i++) {
  const config = {
    mapId: values.map,
    weaponId: values.weapon,
    kingId: values.king,
    seed: firstSeed + i,
    mutatorIds,
    perkIds,
  };
  summaries.push(runHeadless(prototypeContent, config, policy).summary);
}
const elapsed = (Date.now() - started) / 1000;

if (values.json) {
  console.log(JSON.stringify(summaries, null, 2));
} else {
  const wins = summaries.filter((s) => s.outcome === 'won').length;
  const meanNight = summaries.reduce((n, s) => n + s.nightReached, 0) / runs;
  const failureNights = Object.entries(
    summaries
      .filter((s) => s.outcome === 'lost')
      .reduce<Record<number, number>>((counts, s) => {
        counts[s.nightReached] = (counts[s.nightReached] ?? 0) + 1;
        return counts;
      }, {}),
  )
    .map(([night, count]) => `N${night}:${count}`)
    .join(', ');
  console.log(
    `content ${prototypeContent.hash} · policy ${policy.id}${picks ? ` perks ${picks.join(',')}` : ''}${branches ? ` branches ${branches.join(',')}` : ''}${mutatorIds ? ` mutators ${mutatorIds.join(',')}` : ''}${perkIds ? ` starting ${perkIds.join(',')}` : ''} · ${runs} runs in ${elapsed.toFixed(2)}s`,
  );
  const meanScore = summaries.reduce((n, s) => n + s.score, 0) / runs;
  console.log(
    `win rate ${((100 * wins) / runs).toFixed(1)}% · mean night reached ${meanNight.toFixed(2)} · mean score ${meanScore.toFixed(0)}`,
  );
  if (failureNights) console.log(`failure nights ${failureNights}`);
}
