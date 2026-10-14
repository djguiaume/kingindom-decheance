/**
 * The generation workflow, with its spending gates:
 *
 * 1. `estimate` uploads the reference (once) and dry-runs every selected part. Nothing is
 *    charged. It writes art/batches/<token>.json and prints the token and the total.
 * 2. A human approves that batch and its budget.
 * 3. `generate --approve <token> --budget <CU>` runs exactly that batch. It refuses when the
 *    prompts changed since the estimate or the estimate exceeds the budget, and it stops before
 *    any part that would push the spend over the budget. Each part gets at most `maxAttempts`
 *    generations over its whole life (failed jobs and failed validation both count).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { selectParts, type Asset, type Manifest, type Part } from './manifest.ts';
import { promptFor, promptHash } from './prompts.ts';
import type { GenerateRequest, ScenarioClient } from './scenario.ts';
import type { StatusStore } from './status.ts';
import { analyze, hasErrors, normalize } from './validate.ts';

export interface Workspace {
  /** Repo root (or a scratch root for mock runs). */
  root: string;
  manifest: Manifest;
  status: StatusStore;
  client: ScenarioClient;
  log?: (line: string) => void;
}

export const paths = (root: string) => ({
  manifest: join(root, 'art/manifest.json'),
  status: join(root, 'art/status.json'),
  reference: join(root, 'art/reference/panda-kingdom-v1.2.png'),
  originals: join(root, 'art/.cache/originals'),
  batches: join(root, 'art/batches'),
  runtime: join(root, 'art/runtime'),
  review: join(root, 'art/review'),
});

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export function requestFor(
  asset: Asset,
  part: Part,
  referenceAssetId: string,
  firstFrameAssetId?: string,
): GenerateRequest {
  return {
    prompt: promptFor(asset, part),
    width: asset.generate.w,
    height: asset.generate.h,
    background: asset.transparent ? 'transparent' : 'opaque',
    quality: 'high',
    numOutputs: 1,
    referenceAssetIds: [
      ...(asset.noReference ? [] : [referenceAssetId]),
      ...(firstFrameAssetId ? [firstFrameAssetId] : []),
    ],
  };
}

/** The frame-1 part a later frame must match, for assets that follow their first frame. */
export function firstFrameOf(asset: Asset, part: Part): Part | undefined {
  if (!asset.followFirstFrame || part.frame === 0) return undefined;
  return asset.parts.find((p) => p.view === part.view && p.frame === 0);
}

/**
 * Uploads the current master of the first frame a part must follow, once per content.
 * Returns undefined when there is none or it is not generated yet.
 */
async function firstFrameReference(
  ws: Workspace,
  asset: Asset,
  part: Part,
  cache: Map<string, string>,
): Promise<string | undefined> {
  const first = firstFrameOf(asset, part);
  if (!first) return undefined;
  const png = await readFile(join(ws.root, first.master)).catch(() => undefined);
  if (!png) return undefined;
  const hash = sha256(png);
  let id = cache.get(hash);
  if (!id) {
    id = await ws.client.uploadAsset(`${first.id}.png`, png);
    cache.set(hash, id);
    ws.log?.(`Uploaded ${first.id} as the frame for ${part.id} to follow.`);
  }
  return id;
}

/** Uploads the approved reference sheet once; re-uploads only if the file changed. */
export async function ensureReference(ws: Workspace): Promise<string> {
  const png = await readFile(paths(ws.root).reference);
  const hash = sha256(png);
  const s = ws.status.data;
  if (s.referenceAssetId && s.referenceSha256 === hash) return s.referenceAssetId;
  const id = await ws.client.uploadAsset('panda-kingdom-v1.2-reference.png', png);
  s.referenceAssetId = id;
  s.referenceSha256 = hash;
  await ws.status.save();
  ws.log?.(`Uploaded the v1.2 reference as ${id}.`);
  return id;
}

export interface BatchPart {
  id: string;
  promptHash: string;
  estimateCU: number;
}

export interface Batch {
  token: string;
  selector: string;
  modelId: string;
  createdAt: string;
  totalCU: number;
  parts: BatchPart[];
  /** Parts skipped because they are already validated or approved, or out of attempts. */
  skipped: { id: string; reason: string }[];
  /** Estimated with --redo: validated or approved parts are generated again, once. */
  redo?: boolean;
  runs: {
    at: string;
    budgetCU: number;
    spentCU: number;
    done: string[];
    failed: string[];
    stoppedFor?: string;
  }[];
}

export function batchToken(modelId: string, parts: BatchPart[]): string {
  const key = JSON.stringify([modelId, parts.map((p) => [p.id, p.promptHash, p.estimateCU])]);
  return createHash('sha256').update(key).digest('hex').slice(0, 10);
}

export async function estimate(
  ws: Workspace,
  selector: string,
  opts: { maxAttempts?: number; redo?: boolean; now?: () => string } = {},
): Promise<Batch> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const ref = await ensureReference(ws);
  const frameRefs = new Map<string, string>();
  const parts: BatchPart[] = [];
  const skipped: Batch['skipped'] = [];
  for (const { asset, part } of selectParts(ws.manifest, selector)) {
    const st = ws.status.get(part.id);
    if (!opts.redo && (st.state === 'validated' || st.state === 'approved')) {
      skipped.push({ id: part.id, reason: st.state });
      continue;
    }
    if (st.attempts >= maxAttempts) {
      skipped.push({ id: part.id, reason: `out of attempts (${st.attempts}/${maxAttempts})` });
      continue;
    }
    const follow = await firstFrameReference(ws, asset, part, frameRefs);
    const estimateCU = await ws.client.estimate(requestFor(asset, part, ref, follow));
    parts.push({ id: part.id, promptHash: promptHash(asset, part), estimateCU });
  }
  const batch: Batch = {
    token: batchToken(ws.client.modelId, parts),
    selector,
    modelId: ws.client.modelId,
    createdAt: (opts.now ?? (() => new Date().toISOString()))(),
    totalCU: parts.reduce((a, p) => a + p.estimateCU, 0),
    parts,
    skipped,
    ...(opts.redo ? { redo: true } : {}),
    runs: [],
  };
  const file = join(paths(ws.root).batches, `${batch.token}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
  return batch;
}

export async function loadBatch(root: string, token: string): Promise<Batch> {
  if (!/^[0-9a-f]{10}$/.test(token)) throw new Error(`"${token}" is not a batch token.`);
  return JSON.parse(await readFile(join(paths(root).batches, `${token}.json`), 'utf8')) as Batch;
}

export interface RunResult {
  spentCU: number;
  done: string[];
  failed: string[];
  stoppedFor?: string;
}

/** Runs an approved batch. Throws before spending anything if the approval does not hold. */
export async function generateBatch(
  ws: Workspace,
  token: string,
  budgetCU: number,
  opts: { maxAttempts?: number; now?: () => string; partial?: boolean } = {},
): Promise<RunResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  if (!(budgetCU > 0)) throw new Error('An approved budget (CU > 0) is required.');
  const batch = await loadBatch(ws.root, token);
  if (batch.modelId !== ws.client.modelId) {
    throw new Error(`Batch ${token} was estimated for ${batch.modelId}, not ${ws.client.modelId}.`);
  }
  if (!opts.partial && batch.totalCU > budgetCU) {
    throw new Error(
      `Batch ${token} is estimated at ${batch.totalCU} CU, over the approved ${budgetCU} CU. Nothing was generated.`,
    );
  }
  const byId = new Map(
    ws.manifest.assets.flatMap((asset) =>
      asset.parts.map((part) => [part.id, { asset, part }] as const),
    ),
  );
  for (const p of batch.parts) {
    const entry = byId.get(p.id);
    if (!entry) throw new Error(`Batch ${token} names unknown part ${p.id}.`);
    if (promptHash(entry.asset, entry.part) !== p.promptHash) {
      throw new Error(
        `The prompt for ${p.id} changed since batch ${token} was estimated: estimate again.`,
      );
    }
  }

  const ref = await ensureReference(ws);
  const frameRefs = new Map<string, string>();
  const dir = paths(ws.root);
  await mkdir(dir.originals, { recursive: true });
  const result: RunResult = { spentCU: 0, done: [], failed: [] };
  // Under --redo a part's earlier validation does not count: only a generation in this run does.
  const generated = new Set<string>();

  outer: for (const p of batch.parts) {
    const { asset, part } = byId.get(p.id) as { asset: Asset; part: Part };
    for (;;) {
      const st = ws.status.get(p.id);
      const kept = !batch.redo || generated.has(p.id);
      if (kept && (st.state === 'validated' || st.state === 'approved')) {
        result.done.push(p.id);
        break;
      }
      if (st.attempts >= maxAttempts) {
        result.failed.push(p.id);
        break;
      }
      if (result.spentCU + p.estimateCU > budgetCU) {
        result.stoppedFor = `budget: ${result.spentCU} CU spent, ${p.id} needs ${p.estimateCU} more of ${budgetCU}`;
        break outer;
      }
      generated.add(p.id);
      ws.status.update(p.id, {
        state: 'generating',
        attempts: st.attempts + 1,
        promptHash: p.promptHash,
      });
      await ws.status.save();
      // Charged from the moment a job exists: the estimate, until the job reports its own cost.
      let cost = 0;
      try {
        // Read at generation time: the first frame may have been redrawn earlier in this run.
        const follow = await firstFrameReference(ws, asset, part, frameRefs);
        const jobId = await ws.client.generate(requestFor(asset, part, ref, follow));
        cost = p.estimateCU;
        ws.status.update(p.id, { jobId });
        const job = await ws.client.waitForJob(jobId);
        cost = job.cost ?? p.estimateCU;
        const assetId = job.assetIds[0];
        if (job.status !== 'success' || !assetId) {
          throw new Error(`Job ${jobId} ended ${job.status}${job.error ? `: ${job.error}` : ''}`);
        }
        const png = await ws.client.download(assetId);
        const hash = sha256(png);
        await writeFile(join(dir.originals, `${p.id}.png`), png);
        const analysis = await analyze(png, asset);
        if (hasErrors(analysis)) {
          ws.status.update(p.id, {
            state: 'failed',
            assetId,
            originalSha256: hash,
            issues: analysis.issues,
          });
          ws.log?.(
            `${p.id}: rejected by validation (${analysis.issues.map((i) => i.code).join(', ')})`,
          );
        } else {
          const master = join(ws.root, part.master);
          await mkdir(dirname(master), { recursive: true });
          await writeFile(master, await normalize(png, asset));
          ws.status.update(p.id, {
            state: 'validated',
            assetId,
            originalSha256: hash,
            issues: analysis.issues,
          });
          ws.log?.(`${p.id}: validated`);
        }
      } catch (e) {
        ws.status.update(p.id, {
          state: 'failed',
          issues: [{ level: 'error', code: 'job', message: (e as Error).message }],
        });
        ws.log?.(`${p.id}: ${(e as Error).message}`);
      } finally {
        const s = ws.status.get(p.id);
        ws.status.update(p.id, { costCU: s.costCU + cost });
        ws.status.addSpend(cost);
        result.spentCU += cost;
        await ws.status.save();
      }
    }
  }

  batch.runs.push({ at: (opts.now ?? (() => new Date().toISOString()))(), budgetCU, ...result });
  await writeFile(join(dir.batches, `${token}.json`), `${JSON.stringify(batch, null, 2)}\n`);
  return result;
}

/**
 * One-step run: prices the selection (Scenario's free dry run, recorded as a batch file) and
 * generates it straight away, stopping before any generation that would pass the budget.
 */
export async function generateSelection(
  ws: Workspace,
  selector: string,
  budgetCU: number,
  opts: { maxAttempts?: number; redo?: boolean; now?: () => string } = {},
): Promise<RunResult & { batch: Batch }> {
  if (!(budgetCU > 0)) throw new Error('An approved budget (CU > 0) is required.');
  const batch = await estimate(ws, selector, opts);
  for (const s of batch.skipped) ws.log?.(`skip ${s.id}: ${s.reason}`);
  ws.log?.(`${batch.parts.length} generations, about ${batch.totalCU} CU (budget ${budgetCU}).`);
  const result = await generateBatch(ws, batch.token, budgetCU, { ...opts, partial: true });
  return { ...result, batch };
}
