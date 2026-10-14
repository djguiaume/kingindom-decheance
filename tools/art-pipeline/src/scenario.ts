/**
 * Minimal Scenario.gg REST client (https://docs.scenario.com/).
 *
 * - Base URL https://api.cloud.scenario.com/v1, HTTP Basic auth with key:secret.
 * - Credentials come only from SCENARIO_API_KEY / SCENARIO_API_SECRET (or SCENARIO_API_KEY_SECRET,
 *   the name used in the project's environment); they are never logged,
 *   written to disk or included in error messages.
 * - `fetch` is injected so tests run against the mock (mock-scenario.ts) with no network.
 */

export const SCENARIO_BASE_URL = 'https://api.cloud.scenario.com/v1';
export const APPROVED_MODEL_ID = 'model_openai-gpt-image-2-5-flare';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Credentials {
  key: string;
  secret: string;
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials {
  const key = env.SCENARIO_API_KEY?.trim();
  const secret = (env.SCENARIO_API_SECRET ?? env.SCENARIO_API_KEY_SECRET)?.trim();
  const missing = [!key && 'SCENARIO_API_KEY', !secret && 'SCENARIO_API_SECRET'].filter(Boolean);
  if (missing.length > 0 || !key || !secret) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(', ')}. Set them in the cloud environment settings; never in code or chat.`,
    );
  }
  return { key, secret };
}

export interface GenerateRequest {
  prompt: string;
  width: number;
  height: number;
  background: 'transparent' | 'opaque';
  quality: 'high' | 'medium' | 'low' | 'auto' | 'xhigh' | 'max';
  numOutputs: number;
  /** Asset id of the uploaded style reference; absent for assets generated without it. */
  referenceAssetId?: string;
}

export type JobStatus =
  | 'pending'
  | 'queued'
  | 'warming-up'
  | 'in-progress'
  | 'finalizing'
  | 'success'
  | 'failure'
  | 'canceled';

export interface Job {
  jobId: string;
  status: JobStatus;
  progress?: number;
  assetIds: string[];
  /** Compute units the job reports, when it does. */
  cost?: number;
  error?: string;
}

const TERMINAL: JobStatus[] = ['success', 'failure', 'canceled'];

export interface ClientOptions {
  credentials: Credentials;
  fetch?: FetchLike;
  baseUrl?: string;
  modelId?: string;
  projectId?: string;
  /** Body field carrying the reference asset ids; to be confirmed by the first real dry run. */
  referenceField?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class ScenarioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Reads a cost field whatever its name: the docs promise a CU cost but do not name the field. */
export function readCost(body: unknown): number | undefined {
  const seen = new Set<unknown>();
  const visit = (v: unknown): number | undefined => {
    if (!v || typeof v !== 'object' || seen.has(v)) return undefined;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (/^(creativeUnitsCost|cuCost|computeUnitsCost|cost)$/.test(k) && typeof x === 'number') {
        return x;
      }
    }
    for (const x of Object.values(v)) {
      const found = visit(x);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(body);
}

export class ScenarioClient {
  private readonly fetch: FetchLike;
  private readonly baseUrl: string;
  readonly modelId: string;
  private readonly auth: string;

  constructor(private readonly opts: ClientOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.baseUrl = opts.baseUrl ?? SCENARIO_BASE_URL;
    this.modelId = opts.modelId ?? APPROVED_MODEL_ID;
    this.auth = `Basic ${Buffer.from(`${opts.credentials.key}:${opts.credentials.secret}`).toString('base64')}`;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      // Only the path and status: the request carried credentials and must not be echoed.
      throw new ScenarioError(
        `Scenario ${method} ${path.split('?')[0]} failed: HTTP ${res.status} ${redact(text.slice(0, 300), this.opts.credentials)}`,
        res.status,
      );
    }
    return text ? JSON.parse(text) : {};
  }

  /** Uploads a PNG as a Scenario asset (base64 body, per the "Uploading assets" guide). */
  async uploadAsset(name: string, png: Buffer): Promise<string> {
    const q = this.opts.projectId ? `?projectId=${encodeURIComponent(this.opts.projectId)}` : '';
    const body = (await this.call('POST', `/assets${q}`, {
      image: png.toString('base64'),
      name,
      hide: true,
    })) as { asset?: { id?: string } };
    const id = body.asset?.id;
    if (!id) throw new ScenarioError('Upload returned no asset.id');
    return id;
  }

  private generateBody(req: GenerateRequest): Record<string, unknown> {
    return {
      prompt: req.prompt,
      width: req.width,
      height: req.height,
      background: req.background,
      quality: req.quality,
      numOutputs: req.numOutputs,
      ...(req.referenceAssetId
        ? { [this.opts.referenceField ?? 'referenceImages']: [req.referenceAssetId] }
        : {}),
    };
  }

  /** Dry run: the CU cost Scenario would charge, without running or charging anything. */
  async estimate(req: GenerateRequest): Promise<number> {
    const body = await this.call(
      'POST',
      `/generate/custom/${encodeURIComponent(this.modelId)}?dryRun=true`,
      this.generateBody(req),
    );
    const cost = readCost(body);
    if (cost === undefined) throw new ScenarioError('Dry run returned no cost field.');
    return cost;
  }

  /** Starts a real (paid) generation and returns its job id. */
  async generate(req: GenerateRequest): Promise<string> {
    const body = (await this.call(
      'POST',
      `/generate/custom/${encodeURIComponent(this.modelId)}`,
      this.generateBody(req),
    )) as { job?: { jobId?: string }; jobId?: string };
    const jobId = body.job?.jobId ?? body.jobId;
    if (!jobId) throw new ScenarioError('Generate returned no jobId.');
    return jobId;
  }

  async getJob(jobId: string): Promise<Job> {
    const body = (await this.call('GET', `/jobs/${encodeURIComponent(jobId)}`)) as {
      job?: Record<string, unknown>;
    };
    const job = (body.job ?? body) as {
      jobId?: string;
      status?: JobStatus;
      progress?: number;
      metadata?: { assetIds?: string[]; error?: string };
      assetIds?: string[];
      error?: string;
    };
    const cost = readCost(job);
    const error = job.metadata?.error ?? job.error;
    return {
      jobId: job.jobId ?? jobId,
      status: job.status ?? 'pending',
      ...(job.progress !== undefined ? { progress: job.progress } : {}),
      assetIds: job.metadata?.assetIds ?? job.assetIds ?? [],
      ...(cost !== undefined ? { cost } : {}),
      ...(error ? { error } : {}),
    };
  }

  /** Polls every few seconds until the job ends (docs: poll every 2-3 s). */
  async waitForJob(jobId: string): Promise<Job> {
    const interval = this.opts.pollIntervalMs ?? 3000;
    const timeout = this.opts.pollTimeoutMs ?? 10 * 60_000;
    const sleep = this.opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (let waited = 0; ; waited += interval) {
      const job = await this.getJob(jobId);
      if (TERMINAL.includes(job.status)) return job;
      if (waited >= timeout) throw new ScenarioError(`Job ${jobId} timed out (${job.status}).`);
      await sleep(interval);
    }
  }

  /** Downloads an asset's original file. */
  async download(assetId: string): Promise<Buffer> {
    const body = (await this.call('GET', `/assets/${encodeURIComponent(assetId)}`)) as {
      asset?: { url?: string };
    };
    const url = body.asset?.url;
    if (!url) throw new ScenarioError(`Asset ${assetId} has no url.`);
    // The CDN url is pre-signed: no Authorization header goes to it.
    const host = new URL(url).host;
    let res: Response;
    try {
      res = await this.fetch(url);
    } catch (e) {
      throw new ScenarioError(
        `Download of ${assetId} from ${host} failed: ${(e as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new ScenarioError(
        `Download of ${assetId} from ${host} failed: HTTP ${res.status}`,
        res.status,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

export function redact(text: string, c: Credentials): string {
  let out = text;
  for (const s of [c.key, c.secret, Buffer.from(`${c.key}:${c.secret}`).toString('base64')]) {
    if (s) out = out.split(s).join('[redacted]');
  }
  return out;
}
