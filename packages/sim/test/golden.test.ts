import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeholderContent } from '@kd/content/placeholder';
import { playReplay } from '@kd/core';
import { describe, expect, it } from 'vitest';
import { summarize } from '../src/runner.ts';
import { GOLDEN_CASES, recordGolden, type GoldenFile } from './golden.ts';

const dir = join(import.meta.dirname, 'golden');
const update = process.env.UPDATE_GOLDEN === '1';

describe('golden runs', () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.name}: ${c.why}`, () => {
      const file = join(dir, `${c.name}.json`);
      if (update) {
        writeFileSync(file, JSON.stringify(recordGolden(placeholderContent, c), null, 2) + '\n');
      }
      const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
      if (golden.replay.contentHash !== placeholderContent.hash) {
        throw new Error(
          `Golden "${c.name}" was recorded with content ${golden.replay.contentHash}; content is now ${placeholderContent.hash}. ` +
            'If the change is intended, run `pnpm golden:update` and explain why in the commit.',
        );
      }
      const session = playReplay(placeholderContent, golden.replay);
      const actual = summarize(session, golden.expected.policy);
      // On mismatch Vitest prints a field-by-field diff (night reached, gold per night, ...).
      expect(actual).toEqual(golden.expected);
    });
  }
});
