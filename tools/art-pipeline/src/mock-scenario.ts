/**
 * An in-memory stand-in for the Scenario API, used by the tests and by `--mock` runs. It costs
 * nothing and never touches the network. Its images are flat fixtures, never art: mock runs
 * write to a scratch folder, not to art/.
 */
import sharp from 'sharp';
import type { FetchLike } from './scenario.ts';

export type Fixture = 'good' | 'opaque' | 'cutoff' | 'tiny';

export interface MockOptions {
  /** CU per image the dry run reports. */
  costPerImage?: number;
  /** Polls before a job succeeds. */
  pollsToFinish?: number;
  /** Which fixture the n-th generation (0-based) returns; default "good". */
  fixtureFor?: (n: number, prompt: string) => Fixture;
  /** Fail the n-th generation job outright. */
  failJob?: (n: number) => boolean;
}

export interface MockState {
  uploads: { name: string; bytes: number }[];
  dryRuns: number;
  generations: { prompt: string; body: Record<string, unknown> }[];
  polls: number;
  authHeaders: Set<string>;
  spent: number;
}

const PALETTE = ['#315F94', '#E2B94B', '#7aa35a', '#8b5a2b', '#6b6f78'];

export async function fixturePng(
  w: number,
  h: number,
  kind: Fixture,
  seed: number,
  transparent = true,
): Promise<Buffer> {
  const color = PALETTE[seed % PALETTE.length];
  const bg =
    transparent && kind !== 'opaque' ? '' : `<rect width="${w}" height="${h}" fill="#d8d2c4"/>`;
  const shape =
    kind === 'cutoff'
      ? `<rect x="${w * 0.4}" y="${h * 0.2}" width="${w * 0.7}" height="${h * 0.6}" fill="${color}"/>`
      : kind === 'tiny'
        ? `<circle cx="${w / 2}" cy="${h / 2}" r="3" fill="${color}"/>`
        : `<ellipse cx="${w / 2}" cy="${h * 0.55}" rx="${w * 0.22}" ry="${h * 0.3}" fill="${color}" stroke="#3b2a1a" stroke-width="${Math.max(2, w / 200)}"/>` +
          `<circle cx="${w / 2}" cy="${h * 0.25}" r="${Math.min(w, h) * 0.12}" fill="#f4f1ea" stroke="#3b2a1a" stroke-width="${Math.max(2, w / 200)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bg}${shape}</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

export function createMockScenario(opts: MockOptions = {}): { fetch: FetchLike; state: MockState } {
  const state: MockState = {
    uploads: [],
    dryRuns: 0,
    generations: [],
    polls: 0,
    authHeaders: new Set(),
    spent: 0,
  };
  const cost = opts.costPerImage ?? 5;
  const jobs = new Map<string, { n: number; polls: number; assets: string[]; failed: boolean }>();
  const assets = new Map<
    string,
    { w: number; h: number; fixture: Fixture; n: number; transparent: boolean }
  >();
  let nextId = 1;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    if (u.hostname === 'cdn.mock.scenario') {
      const a = assets.get(u.pathname.slice(1));
      if (!a) return new Response('not found', { status: 404 });
      return new Response(
        new Uint8Array(await fixturePng(a.w, a.h, a.fixture, a.n, a.transparent)),
      );
    }
    const auth = new Headers(init?.headers).get('Authorization');
    if (!auth?.startsWith('Basic ')) return json({ error: 'unauthorized' }, 401);
    state.authHeaders.add(auth);
    const path = u.pathname.replace(/^\/v1/, '');
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (method === 'POST' && path === '/assets') {
      if (typeof body.image !== 'string' || typeof body.name !== 'string') {
        return json({ error: "Either 'image' or 'canvas' must be provided" }, 400);
      }
      state.uploads.push({ name: body.name, bytes: Buffer.from(body.image, 'base64').length });
      return json({ asset: { id: `asset_ref_${nextId++}` } });
    }
    const gen = /^\/generate\/custom\/([^/]+)$/.exec(path);
    if (method === 'POST' && gen) {
      const n = Math.max(1, Number(body.numOutputs ?? 1));
      if (u.searchParams.get('dryRun') === 'true') {
        state.dryRuns++;
        return json({ creativeUnitsCost: cost * n });
      }
      const idx = state.generations.length;
      const prompt = String(body.prompt ?? '');
      state.generations.push({ prompt, body });
      const jobId = `job_${nextId++}`;
      const fixture = opts.fixtureFor?.(idx, prompt) ?? 'good';
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = `asset_${nextId++}`;
        assets.set(id, {
          w: Number(body.width),
          h: Number(body.height),
          fixture,
          n: idx,
          transparent: body.background === 'transparent',
        });
        ids.push(id);
      }
      jobs.set(jobId, { n: idx, polls: 0, assets: ids, failed: opts.failJob?.(idx) ?? false });
      state.spent += cost * n;
      return json({ job: { jobId, status: 'queued', creativeUnitsCost: cost * n } });
    }
    const job = /^\/jobs\/([^/]+)$/.exec(path);
    if (method === 'GET' && job) {
      const j = jobs.get(job[1] ?? '');
      if (!j) return json({ error: 'not found' }, 404);
      state.polls++;
      j.polls++;
      const done = j.polls > (opts.pollsToFinish ?? 1);
      const status = !done ? 'in-progress' : j.failed ? 'failure' : 'success';
      return json({
        job: {
          jobId: job[1],
          status,
          progress: done ? 1 : 0.5,
          metadata: {
            assetIds: status === 'success' ? j.assets : [],
            ...(j.failed && done ? { error: 'mock failure' } : {}),
          },
        },
      });
    }
    const asset = /^\/assets\/([^/]+)$/.exec(path);
    if (method === 'GET' && asset) {
      if (!assets.has(asset[1] ?? '')) return json({ error: 'not found' }, 404);
      return json({ asset: { id: asset[1], url: `https://cdn.mock.scenario/${asset[1]}` } });
    }
    return json({ error: `no mock route for ${method} ${path}` }, 404);
  };
  return { fetch, state };
}
