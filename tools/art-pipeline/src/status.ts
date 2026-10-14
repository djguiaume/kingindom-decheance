/**
 * Per-part generation status (art/status.json): what was spent, which Scenario job and asset
 * produced the current master, and what the validation found. Committed with the masters, so
 * the PR shows exactly what each file came from.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Issue } from './validate.ts';

export const PART_STATES = [
  'pending',
  'generating',
  'generated',
  'validated',
  'failed',
  'approved',
  'rejected',
] as const;
export type PartState = (typeof PART_STATES)[number];

const IssueSchema = z.object({
  level: z.enum(['error', 'warn']),
  code: z.string(),
  message: z.string(),
});

export const PartStatusSchema = z.object({
  state: z.enum(PART_STATES),
  attempts: z.number().int().nonnegative(),
  promptHash: z.string().optional(),
  jobId: z.string().optional(),
  assetId: z.string().optional(),
  costCU: z.number().nonnegative(),
  originalSha256: z.string().optional(),
  issues: z.array(IssueSchema),
  note: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type PartStatus = z.infer<typeof PartStatusSchema>;

export const StatusFileSchema = z.object({
  modelId: z.string(),
  referenceAssetId: z.string().optional(),
  referenceSha256: z.string().optional(),
  spentCU: z.number().nonnegative(),
  parts: z.record(z.string(), PartStatusSchema),
});
export type StatusFile = z.infer<typeof StatusFileSchema>;

export const emptyPart = (): PartStatus => ({
  state: 'pending',
  attempts: 0,
  costCU: 0,
  issues: [],
});

export class StatusStore {
  constructor(
    readonly file: string,
    readonly data: StatusFile,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  static async open(file: string, modelId: string, now?: () => string): Promise<StatusStore> {
    let data: StatusFile;
    try {
      data = StatusFileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      data = { modelId, spentCU: 0, parts: {} };
    }
    return new StatusStore(file, data, now);
  }

  get(id: string): PartStatus {
    return this.data.parts[id] ?? emptyPart();
  }

  update(id: string, patch: Partial<PartStatus> & { issues?: Issue[] }): PartStatus {
    const next = { ...this.get(id), ...patch, updatedAt: this.now() };
    this.data.parts[id] = next;
    return next;
  }

  addSpend(cu: number): void {
    this.data.spentCU += cu;
  }

  async save(): Promise<void> {
    const sorted = Object.fromEntries(
      Object.entries(this.data.parts).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(this.file, `${JSON.stringify({ ...this.data, parts: sorted }, null, 2)}\n`);
  }
}
