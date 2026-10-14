import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/catalog.ts';
import { GROUP_RANGES, KIND_RULES, buildManifest, selectParts } from '../src/manifest.ts';
import { promptFor } from '../src/prompts.ts';

const REPO = join(import.meta.dirname, '../../..');
const manifest = buildManifest(CATALOG);

describe('manifest', () => {
  it('has exactly the 105 numbered assets of the v1.2 sheet, ids unique', () => {
    expect(manifest.assets.map((a) => a.num)).toEqual(Array.from({ length: 105 }, (_, i) => i + 1));
    expect(new Set(manifest.assets.map((a) => a.id)).size).toBe(105);
    const parts = manifest.assets.flatMap((a) => a.parts);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    expect(new Set(parts.map((p) => p.master)).size).toBe(parts.length);
  });

  it('puts every asset in the group range printed on the sheet', () => {
    for (const a of manifest.assets) {
      const [lo, hi] = GROUP_RANGES[a.group];
      expect(a.num, a.id).toBeGreaterThanOrEqual(lo);
      expect(a.num, a.id).toBeLessThanOrEqual(hi);
    }
  });

  it('keeps the catapult chassis and throwing arm as separate sprites', () => {
    const chassis = manifest.assets.find((a) => a.num === 35);
    const arm = manifest.assets.find((a) => a.num === 36);
    expect(chassis?.id).toBe('catapult_chassis');
    expect(arm?.id).toBe('catapult_arm');
    expect(chassis?.subject).toMatch(/WITHOUT its throwing arm/);
    expect(arm?.parts.length).toBeGreaterThan(1);
  });

  it('separates weapons from bodies for every unit', () => {
    for (const id of [
      'footman',
      'knight',
      'archer',
      'crossbowman',
      'guardian',
      'monk',
      'raider',
      'skirmisher',
      'brute',
      'warlord',
    ]) {
      expect(manifest.assets.find((a) => a.id === `${id}_weapon`)?.kind, id).toBe('weapon');
    }
  });

  it('forbids ground patches on characters and siege engines, allows decorations on buildings', () => {
    for (const a of manifest.assets) {
      const p = promptFor(a, a.parts[0]!);
      if (['character', 'flyer', 'siege'].includes(a.kind))
        expect(p, a.id).toMatch(/No ground patch/);
      if (a.kind === 'building') expect(p, a.id).toMatch(/decorations attached to it are fine/);
      expect(p).toMatch(/Do NOT copy, crop or recompose it/);
    }
  });

  it('tells long weapons to lie along their canvas and characters to turn right', () => {
    const prompt = (id: string) => {
      const a = manifest.assets.find((x) => x.id === id)!;
      return promptFor(a, a.parts[0]!);
    };
    expect(prompt('footman_weapon')).toMatch(/perfectly horizontal/);
    expect(prompt('monk_weapon')).toMatch(/perfectly upright/);
    expect(prompt('arrow')).toMatch(/perfectly horizontal/);
    expect(prompt('footman')).toMatch(/turned clearly toward the right/);
  });

  it('keeps transparency rules consistent with the kind', () => {
    for (const a of manifest.assets) expect(a.transparent).toBe(KIND_RULES[a.kind].transparent);
  });

  it('committed art/manifest.json matches catalog.ts', () => {
    const committed = readFileSync(join(REPO, 'art/manifest.json'), 'utf8');
    expect(committed).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  it('selects by group, number, range and part id', () => {
    expect(selectParts(manifest, '35-36').map((p) => p.part.id)).toEqual([
      'catapult_chassis',
      'catapult_arm.f1',
      'catapult_arm.f2',
    ]);
    expect(selectParts(manifest, 'king_roll_walk.f2')).toHaveLength(1);
    expect(selectParts(manifest, 'map')).toHaveLength(5);
    expect(() => selectParts(manifest, 'dragons')).toThrow(/matches no asset/);
  });
});
