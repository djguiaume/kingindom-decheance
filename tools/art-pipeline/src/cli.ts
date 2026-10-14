/**
 * `pnpm art <command>`: see tools/art-pipeline/README.md.
 *
 * Add `--mock` to any command to run against the in-memory Scenario mock in .art-mock/ (free,
 * offline, never touches art/).
 */
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildRuntime, type RuntimeIndex } from './atlas.ts';
import { CATALOG } from './catalog.ts';
import { buildManifest, loadManifest, selectParts, writeManifest } from './manifest.ts';
import { createMockScenario } from './mock-scenario.ts';
import { estimate, generateBatch, paths, type Workspace } from './pipeline.ts';
import { animationSheet, audit, contactSheet, ensureDir, writeAudit } from './review.ts';
import { APPROVED_MODEL_ID, ScenarioClient, credentialsFromEnv } from './scenario.ts';
import { PART_STATES, StatusStore, type PartState } from './status.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const MOCK_ROOT = join(REPO, '.art-mock');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mock: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    approve: { type: 'string' },
    budget: { type: 'string' },
    'max-attempts': { type: 'string', default: '3' },
    redo: { type: 'boolean', default: false },
    note: { type: 'string' },
  },
});
const [command = 'help', ...args] = positionals;
const root = values.mock ? MOCK_ROOT : REPO;
const maxAttempts = Number(values['max-attempts']);
const log = (s: string) => console.log(s);

async function seedMockRoot(): Promise<void> {
  if (existsSync(join(MOCK_ROOT, 'art/manifest.json'))) return;
  await mkdir(join(MOCK_ROOT, 'art/reference'), { recursive: true });
  await cp(paths(REPO).manifest, paths(MOCK_ROOT).manifest);
  await cp(paths(REPO).reference, paths(MOCK_ROOT).reference);
  log(`Seeded the mock workspace in ${MOCK_ROOT}.`);
}

async function workspace(): Promise<Workspace> {
  if (values.mock) await seedMockRoot();
  const manifest = await loadManifest(paths(root).manifest);
  const status = await StatusStore.open(paths(root).status, APPROVED_MODEL_ID);
  const client = values.mock
    ? new ScenarioClient({
        credentials: { key: 'mock', secret: 'mock' },
        fetch: createMockScenario().fetch,
        pollIntervalMs: 1,
      })
    : new ScenarioClient({
        credentials: credentialsFromEnv(),
        ...(process.env.SCENARIO_PROJECT_ID ? { projectId: process.env.SCENARIO_PROJECT_ID } : {}),
      });
  return { root, manifest, status, client, log };
}

async function readIndex(): Promise<RuntimeIndex | null> {
  const f = join(paths(root).runtime, 'index.json');
  return existsSync(f) ? (JSON.parse(await readFile(f, 'utf8')) as RuntimeIndex) : null;
}

async function main(): Promise<number> {
  switch (command) {
    case 'manifest': {
      const fresh = `${JSON.stringify(buildManifest(CATALOG), null, 2)}\n`;
      if (values.check) {
        const current = await readFile(paths(REPO).manifest, 'utf8').catch(() => '');
        if (current !== fresh) {
          log('art/manifest.json is out of date: run `pnpm art manifest`.');
          return 1;
        }
        log('art/manifest.json is up to date.');
        return 0;
      }
      await writeManifest(paths(REPO).manifest, buildManifest(CATALOG));
      log('Wrote art/manifest.json (105 assets).');
      return 0;
    }
    case 'plan': {
      const manifest = await loadManifest(paths(root).manifest);
      const status = await StatusStore.open(paths(root).status, APPROVED_MODEL_ID);
      const sel = selectParts(manifest, args[0] ?? 'all');
      const counts = new Map<string, number>();
      for (const { part } of sel) {
        const s = status.get(part.id).state;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      log(`${sel.length} parts selected: ${[...counts].map(([s, n]) => `${n} ${s}`).join(', ')}.`);
      log(`Spent so far: ${status.data.spentCU} CU.`);
      return 0;
    }
    case 'estimate': {
      const selector = args[0];
      if (!selector) throw new Error('Usage: pnpm art estimate <selector>');
      const ws = await workspace();
      const batch = await estimate(ws, selector, { maxAttempts, redo: values.redo });
      for (const s of batch.skipped) log(`skip ${s.id}: ${s.reason}`);
      log(`Dry run: ${batch.parts.length} generations, ${batch.totalCU} CU. Nothing was charged.`);
      log(`Batch token: ${batch.token}`);
      log(`To run it after approval: pnpm art generate --approve ${batch.token} --budget <CU>`);
      return 0;
    }
    case 'generate': {
      if (!values.approve || !values.budget) {
        throw new Error('Usage: pnpm art generate --approve <batch token> --budget <approved CU>');
      }
      const ws = await workspace();
      const result = await generateBatch(ws, values.approve, Number(values.budget), {
        maxAttempts,
      });
      log(
        `Spent ${result.spentCU} CU. Validated: ${result.done.length}. Failed: ${result.failed.length}.`,
      );
      if (result.failed.length) log(`Failed parts: ${result.failed.join(', ')}`);
      if (result.stoppedFor) log(`Stopped early: ${result.stoppedFor}`);
      return result.failed.length || result.stoppedFor ? 2 : 0;
    }
    case 'mark': {
      const [partId, state] = args;
      if (!partId || !PART_STATES.includes(state as PartState)) {
        throw new Error(`Usage: pnpm art mark <part id> <${PART_STATES.join('|')}> [--note "..."]`);
      }
      const status = await StatusStore.open(paths(root).status, APPROVED_MODEL_ID);
      status.update(partId, {
        state: state as PartState,
        ...(values.note ? { note: values.note } : {}),
      });
      await status.save();
      log(`${partId} is now ${state}.`);
      return 0;
    }
    case 'runtime': {
      const manifest = await loadManifest(paths(root).manifest);
      await rm(paths(root).runtime, { recursive: true, force: true });
      const index = await buildRuntime(root, manifest, paths(root).runtime);
      log(
        `Built ${index.atlases.length} atlas page(s) and ${index.images.length} image(s), ${Object.keys(index.frames).length} frames.`,
      );
      return 0;
    }
    case 'review':
    case 'audit': {
      const manifest = await loadManifest(paths(root).manifest);
      const status = await StatusStore.open(paths(root).status, APPROVED_MODEL_ID);
      const dir = paths(root).review;
      await ensureDir(dir);
      if (command === 'review') {
        await contactSheet(root, manifest, status.data, join(dir, 'contact-sheet.png'));
        await animationSheet(root, manifest, join(dir, 'animation-frames.png'));
        log(`Wrote ${dir}/contact-sheet.png and animation-frames.png.`);
      }
      const result = audit(root, manifest, status.data, await readIndex());
      await writeAudit(join(dir, 'AUDIT.md'), manifest, result);
      const done = result.rows.filter((r) => r.problems.length === 0).length;
      log(`Audit: ${done}/105 logical assets complete.`);
      return command === 'audit' && !result.complete ? 1 : 0;
    }
    default:
      log(
        'Commands: manifest [--check] | plan [selector] | estimate <selector> | generate --approve <token> --budget <CU> | mark <part> <state> | runtime | review | audit. Add --mock for a free offline run.',
      );
      return command === 'help' ? 0 : 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  },
);
