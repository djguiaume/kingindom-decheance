import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRuntime, pack } from '../src/atlas.ts';
import { CATALOG } from '../src/catalog.ts';
import { buildManifest, type Manifest } from '../src/manifest.ts';
import { createMockScenario, fixturePng, type MockOptions } from '../src/mock-scenario.ts';
import {
  estimate,
  generateBatch,
  generateSelection,
  paths,
  type Workspace,
} from '../src/pipeline.ts';
import { audit, contactSheet, animationSheet } from '../src/review.ts';
import { APPROVED_MODEL_ID, ScenarioClient, credentialsFromEnv, redact } from '../src/scenario.ts';
import { StatusStore } from '../src/status.ts';
import { analyze, makeSeamless, normalize } from '../src/validate.ts';

const REPO = join(import.meta.dirname, '../../..');
const CREDS = { key: 'test-key-abc', secret: 'test-secret-xyz' };
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'art-pipeline-'));
  await mkdir(join(root, 'art/reference'), { recursive: true });
  await cp(join(REPO, 'art/manifest.json'), paths(root).manifest);
  await cp(join(REPO, 'art/reference/panda-kingdom-v1.2.png'), paths(root).reference);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function ws(mock: MockOptions = {}) {
  const { fetch, state } = createMockScenario(mock);
  const manifest = buildManifest(CATALOG);
  const status = await StatusStore.open(paths(root).status, APPROVED_MODEL_ID);
  const client = new ScenarioClient({ credentials: CREDS, fetch, pollIntervalMs: 1 });
  const w: Workspace = { root, manifest, status, client };
  return { w, state, manifest };
}

const asset = (m: Manifest, id: string) => m.assets.find((a) => a.id === id)!;

describe('credentials', () => {
  it('come only from the environment and missing ones are named, not echoed', () => {
    expect(() => credentialsFromEnv({})).toThrow(/SCENARIO_API_KEY, SCENARIO_API_SECRET/);
    expect(credentialsFromEnv({ SCENARIO_API_KEY: 'k', SCENARIO_API_KEY_SECRET: 's' })).toEqual({
      key: 'k',
      secret: 's',
    });
    expect(credentialsFromEnv({ SCENARIO_API_KEY: 'k', SCENARIO_API_SECRET: 's' })).toEqual({
      key: 'k',
      secret: 's',
    });
  });

  it('are sent as HTTP Basic auth and redacted from error text', async () => {
    const { w, state } = await ws();
    await estimate(w, 'raider');
    expect([...state.authHeaders]).toEqual([
      `Basic ${Buffer.from('test-key-abc:test-secret-xyz').toString('base64')}`,
    ]);
    expect(redact('bad test-key-abc / test-secret-xyz', CREDS)).toBe('bad [redacted] / [redacted]');
  });

  it('are never written to the status or batch files', async () => {
    const { w } = await ws();
    const batch = await estimate(w, '35-36');
    await generateBatch(w, batch.token, batch.totalCU);
    for (const f of [paths(root).status, join(paths(root).batches, `${batch.token}.json`)]) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toContain(CREDS.key);
      expect(text).not.toContain(CREDS.secret);
    }
  });
});

describe('budget gates', () => {
  it('a dry-run estimate uploads the reference once and charges nothing', async () => {
    const { w, state } = await ws({ costPerImage: 7 });
    const batch = await estimate(w, 'enemies');
    expect(state.generations).toHaveLength(0);
    expect(state.spent).toBe(0);
    expect(state.uploads).toHaveLength(1);
    expect(batch.parts.length).toBe(state.dryRuns);
    expect(batch.totalCU).toBe(7 * batch.parts.length);
    await estimate(w, 'kings');
    expect(state.uploads).toHaveLength(1);
  });

  it('refuses a batch whose estimate exceeds the approved budget, before generating anything', async () => {
    const { w, state } = await ws();
    const batch = await estimate(w, 'friendly');
    await expect(generateBatch(w, batch.token, batch.totalCU - 1)).rejects.toThrow(
      /over the approved/,
    );
    expect(state.generations).toHaveLength(0);
  });

  it('refuses a batch whose prompts changed since the estimate', async () => {
    const { w, state, manifest } = await ws();
    const batch = await estimate(w, 'raider');
    asset(manifest, 'raider').subject += ' with a hat';
    await expect(generateBatch(w, batch.token, 100)).rejects.toThrow(/changed since/);
    expect(state.generations).toHaveLength(0);
  });

  it('refuses an unknown token or a missing budget', async () => {
    const { w } = await ws();
    await expect(generateBatch(w, 'nothex', 10)).rejects.toThrow(/not a batch token/);
    await expect(generateBatch(w, '0123456789', 0)).rejects.toThrow(/budget/);
  });

  it('stops before a part that would push spending over the budget', async () => {
    // Every image fails validation, so retries eat the budget.
    const { w, state } = await ws({ costPerImage: 5, fixtureFor: () => 'opaque' });
    const batch = await estimate(w, 'boulder,coin');
    const run = await generateBatch(w, batch.token, 12);
    expect(run.spentCU).toBeLessThanOrEqual(12);
    expect(state.spent).toBeLessThanOrEqual(12);
    expect(run.stoppedFor).toMatch(/budget/);
  });

  it('generates a selection in one step, up to the budget, without a separate approval', async () => {
    const { w, state } = await ws({ costPerImage: 5 });
    const run = await generateSelection(w, 'boulder,coin', 7);
    expect(run.batch.totalCU).toBe(10);
    expect(run.done).toHaveLength(1);
    expect(run.spentCU).toBe(5);
    expect(state.spent).toBe(5);
    expect(run.stoppedFor).toMatch(/budget/);
    await expect(generateSelection(w, 'coin', 0)).rejects.toThrow(/budget/);
  });
});

describe('generation', () => {
  it('limits retries per part and records why each attempt failed', async () => {
    const { w, state } = await ws({ fixtureFor: () => 'cutoff' });
    const batch = await estimate(w, 'boulder');
    const run = await generateBatch(w, batch.token, 100, { maxAttempts: 3 });
    expect(state.generations).toHaveLength(3);
    expect(run.failed).toEqual(['boulder']);
    const st = w.status.get('boulder');
    expect(st).toMatchObject({ state: 'failed', attempts: 3, costCU: 15 });
    expect(st.issues.map((i) => i.code)).toContain('cutoff');
    // Out of attempts: the next estimate skips it instead of spending again.
    const again = await estimate(w, 'boulder');
    expect(again.parts).toHaveLength(0);
    expect(again.skipped[0]?.reason).toMatch(/out of attempts/);
  });

  it('retries a failed job and keeps the first valid output', async () => {
    const { w, state } = await ws({ failJob: (n) => n === 0 });
    const batch = await estimate(w, 'boulder');
    const run = await generateBatch(w, batch.token, 100);
    expect(run.done).toEqual(['boulder']);
    expect(state.generations).toHaveLength(2);
    expect(w.status.get('boulder')).toMatchObject({ state: 'validated', attempts: 2 });
  });

  it('generates each part independently with the approved model, the reference and transparency', async () => {
    const { w, state } = await ws();
    const batch = await estimate(w, '35-36');
    await generateBatch(w, batch.token, batch.totalCU);
    expect(state.generations).toHaveLength(3);
    const ref = w.status.data.referenceAssetId;
    for (const g of state.generations) {
      expect(g.body).toMatchObject({
        background: 'transparent',
        numOutputs: 1,
        referenceImages: [ref],
      });
      expect(g.prompt).toMatch(/paint ONE new isolated subject/);
    }
    expect(new Set(state.generations.map((g) => g.prompt)).size).toBe(3);
    expect(w.status.data.modelId).toBe('model_openai-gpt-image-2-5-flare');
  });

  it("paints a gate's open frame from its closed frame, so only the doors change", async () => {
    const { w, state } = await ws();
    await generateSelection(w, 'gate_wood.f1,gate_wood.f2', 100);
    const [closed, open] = state.generations;
    expect(closed!.body.referenceImages).toEqual([w.status.data.referenceAssetId]);
    expect(closed!.prompt).not.toMatch(/frame 1 of this very subject/);
    const refs = open!.body.referenceImages as string[];
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(w.status.data.referenceAssetId);
    expect(state.uploads.map((u) => u.name)).toContain('gate_wood.f1.png');
    expect(open!.prompt).toMatch(/frame 1 of this very subject in this same view/);
  });

  it('generates ground decals and lights without the reference sheet, so no figures leak in', async () => {
    const { w, state } = await ws();
    const batch = await estimate(w, 'grass_patch,window_glow');
    await generateBatch(w, batch.token, batch.totalCU);
    expect(state.generations).toHaveLength(2);
    for (const g of state.generations) {
      expect(g.body).not.toHaveProperty('referenceImages');
      expect(g.prompt).toMatch(/no panda, person, animal, soldier, tower/);
      expect(g.prompt).not.toMatch(/style reference/);
    }
  });

  it('skips parts already validated when estimating again', async () => {
    const { w } = await ws();
    const first = await estimate(w, 'boulder');
    await generateBatch(w, first.token, 100);
    const second = await estimate(w, 'boulder,coin');
    expect(second.parts.map((p) => p.id)).toEqual(['coin']);
  });

  it('regenerates validated parts once under --redo, and charges for them', async () => {
    const { w, state } = await ws({ costPerImage: 5 });
    await generateSelection(w, 'boulder', 100);
    const first = w.status.get('boulder').assetId;
    const run = await generateSelection(w, 'boulder', 100, { redo: true });
    expect(run.done).toEqual(['boulder']);
    expect(run.spentCU).toBe(5);
    expect(state.spent).toBe(10);
    expect(w.status.get('boulder').assetId).not.toBe(first);
  });
});

describe('validation and masters', () => {
  const m = buildManifest(CATALOG);
  const raider = asset(m, 'raider');
  const tile = asset(m, 'tile_grass');
  const { w, h } = raider.generate;

  it('accepts a clean transparent sprite', async () => {
    const a = await analyze(await fixturePng(w, h, 'good', 1), raider);
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('rejects a painted background, a cut-off subject, a tiny subject and a wrong size', async () => {
    const codes = async (png: Buffer) => (await analyze(png, raider)).issues.map((i) => i.code);
    expect(await codes(await fixturePng(w, h, 'opaque', 1))).toContain('background');
    expect(await codes(await fixturePng(w, h, 'cutoff', 1))).toContain('cutoff');
    expect(await codes(await fixturePng(w, h, 'tiny', 1))).toContain('tiny');
    expect(await codes(await fixturePng(512, 512, 'good', 1))).toContain('size');
    expect(await codes(Buffer.from('not an image'))).toContain('decode');
  });

  it('rejects a long weapon painted tilted, accepts it laid along its canvas', async () => {
    const spear = asset(m, 'footman_weapon');
    const { w: gw, h: gh } = spear.generate;
    const codes = async (png: Buffer) => (await analyze(png, spear)).issues.map((i) => i.code);
    expect(await codes(await fixturePng(gw, gh, 'good', 1))).toContain('orientation');
    expect(await codes(await fixturePng(gw, gh, 'horizontal', 1))).not.toContain('orientation');
  });

  it('makes tiles wrap without seams or light and dark bands', async () => {
    const size = 128;
    const data = Buffer.alloc(size * size * 3);
    // A lit top-left corner and a dark bottom-right one, with fine noise: bands at every seam.
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        for (let c = 0; c < 3; c++)
          data[(y * size + x) * 3 + c] = 60 + x + y / 2 + ((x * 7 + y * 13 + c) % 11);
    const png = await sharp(data, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();
    const seam = async (b: Buffer) => {
      const { data: d } = await sharp(b).raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (let y = 0; y < size; y++)
        for (let c = 0; c < 3; c++)
          sum += Math.abs(d[y * size * 3 + c]! - d[(y * size + size - 1) * 3 + c]!);
      return sum / (size * 3);
    };
    expect(await seam(png)).toBeGreaterThan(100);
    expect(await seam(await makeSeamless(png))).toBeLessThan(12);
  });

  it('requires tiles to be opaque', async () => {
    const opaque = await analyze(
      await fixturePng(tile.generate.w, tile.generate.h, 'good', 1, false),
      tile,
    );
    expect(opaque.issues.filter((i) => i.level === 'error')).toEqual([]);
    const clear = await analyze(
      await fixturePng(tile.generate.w, tile.generate.h, 'good', 1, true),
      tile,
    );
    expect(clear.issues.map((i) => i.code)).toContain('opaque');
  });

  it('normalises a sprite onto its canvas, feet on the anchor, at its listed height', async () => {
    const master = await normalize(await fixturePng(w, h, 'good', 1), raider);
    const { data, info } = await sharp(master).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([raider.canvas.w, raider.canvas.h, 4]);
    let top = info.height,
      bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 8) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    expect(bottom + 1).toBeCloseTo(raider.canvas.h * raider.anchor.y, -1);
    expect(bottom - top + 1).toBeCloseTo(raider.heightPx!, -1);
  });
});

describe('runtime atlases and review', () => {
  it('packs frames without overlap', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      w: 40 + ((i * 37) % 300),
      h: 30 + ((i * 53) % 400),
    }));
    const packed = pack(items, 1024, 2);
    for (const a of packed) {
      for (const b of packed) {
        if (a === b || a.page !== b.page) continue;
        const apart =
          a.x + a.item.w <= b.x ||
          b.x + b.item.w <= a.x ||
          a.y + a.item.h <= b.y ||
          b.y + b.item.h <= a.y;
        expect(apart).toBe(true);
      }
      expect(a.x + a.item.w).toBeLessThanOrEqual(1024);
      expect(a.y + a.item.h).toBeLessThanOrEqual(1024);
    }
  });

  it('builds Phaser JSON Hash atlases with pivots, a contact sheet and an honest audit', async () => {
    const { w, manifest } = await ws();
    const batch = await estimate(w, '35-36,102');
    await generateBatch(w, batch.token, batch.totalCU);
    const out = paths(root).runtime;
    const index = await buildRuntime(root, manifest, out);

    const atlas = JSON.parse(await readFile(join(out, 'enemies.json'), 'utf8'));
    expect(atlas.meta).toMatchObject({ image: 'enemies.webp', format: 'RGBA8888' });
    expect(Object.keys(atlas.frames).sort()).toEqual([
      'catapult_arm.f1',
      'catapult_arm.f2',
      'catapult_chassis',
    ]);
    const chassis = atlas.frames.catapult_chassis;
    expect(chassis).toMatchObject({
      rotated: false,
      trimmed: true,
      sourceSize: { w: 256, h: 256 },
      pivot: { x: 0.5, y: 0.9 },
      contentId: 'catapult',
    });
    const meta = await sharp(join(out, 'enemies.webp')).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
    expect(index.images.map((i) => i.key)).toEqual(['tile_grass']);
    expect(index.frames['catapult_arm.f2']).toMatchObject({ atlas: 'enemies', num: 36 });

    const review = paths(root).review;
    await mkdir(review, { recursive: true });
    await contactSheet(root, manifest, w.status.data, join(review, 'contact-sheet.png'));
    await animationSheet(root, manifest, join(review, 'animation-frames.png'));
    expect(existsSync(join(review, 'contact-sheet.png'))).toBe(true);
    expect(existsSync(join(review, 'animation-frames.png'))).toBe(true);

    const result = audit(root, manifest, w.status.data, index);
    expect(result.complete).toBe(false);
    const done = result.rows.filter((r) => r.problems.length === 0).map((r) => r.id);
    expect(done).toEqual(['catapult_chassis', 'catapult_arm', 'tile_grass']);
  });
});
