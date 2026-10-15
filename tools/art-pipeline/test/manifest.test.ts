import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/catalog.ts';
import { GROUP_RANGES, KIND_RULES, buildManifest, selectParts } from '../src/manifest.ts';
import { promptFor } from '../src/prompts.ts';

const REPO = join(import.meta.dirname, '../../..');
const manifest = buildManifest(CATALOG);

describe('manifest', () => {
  it('has the 105 numbered assets of the v1.2 sheet then numbered additions, ids unique', () => {
    const n = manifest.assets.length;
    expect(n).toBeGreaterThanOrEqual(105);
    expect(manifest.assets.map((a) => a.num)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(new Set(manifest.assets.map((a) => a.id)).size).toBe(n);
    for (const a of manifest.assets.filter((x) => x.num > 105))
      expect(a.inferred, a.id).toBeTruthy();
    const parts = manifest.assets.flatMap((a) => a.parts);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    expect(new Set(parts.map((p) => p.master)).size).toBe(parts.length);
  });

  it('puts every sheet asset in the group range printed on the sheet', () => {
    for (const a of manifest.assets.filter((x) => x.num <= 105)) {
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
      expect(p).toMatch(a.noReference ? /no panda, person/ : /Do NOT copy, crop or recompose it/);
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

  it('adds back views for the king and every unit body, without changing the front prompts', () => {
    const back = manifest.assets.flatMap((a) => a.parts.filter((p) => p.view === 'back'));
    // 28, plus the Longbow king's idle and four walk frames.
    expect(back).toHaveLength(33);
    expect(new Set(back.map((p) => p.id.split('.')[0]))).toEqual(
      new Set([
        'king_roll_idle',
        'king_roll_walk',
        'king_wolf_idle',
        'king_wolf_walk',
        'king_wolf_run',
        'footman',
        'knight',
        'archer',
        'crossbowman',
        'guardian',
        'monk',
        'raider',
        'skirmisher',
        'brute',
        'harpy',
        'warlord',
        'warlord_bodyguard',
      ]),
    );
    const walk = manifest.assets.find((a) => a.id === 'king_roll_walk')!;
    const front = walk.parts.find((p) => p.id === 'king_roll_walk.f2')!;
    const behind = walk.parts.find((p) => p.id === 'king_roll_walk.back.f2')!;
    expect(promptFor(walk, front)).toMatch(/frame 2 of 4/);
    expect(promptFor(walk, front)).not.toMatch(/Seen from behind/);
    expect(promptFor(walk, behind)).toMatch(/frame 2 of 4/);
    expect(promptFor(walk, behind)).toMatch(/Seen from behind/);
    expect(behind.master).toBe('art/masters/kings/002_king_roll_walk_back_f2.png');
  });

  it('adds side and diagonal views for the gates, keeping the face-on prompts', () => {
    for (const id of ['gate_wood', 'gate_stone']) {
      const gate = manifest.assets.find((a) => a.id === id)!;
      expect(gate.parts.map((p) => p.id)).toEqual([
        `${id}.f1`,
        `${id}.f2`,
        `${id}.side.f1`,
        `${id}.side.f2`,
        `${id}.diag.f1`,
        `${id}.diag.f2`,
      ]);
      const [front, , side, , diag] = gate.parts;
      expect(promptFor(gate, front!)).not.toMatch(/turned/);
      expect(promptFor(gate, side!)).toMatch(/runs straight up the screen/);
      expect(promptFor(gate, diag!)).toMatch(/diagonally/);
      expect(promptFor(gate, side!)).toMatch(/frame 1 of 2/);
    }
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
    expect(selectParts(manifest, 'map')).toHaveLength(6);
    expect(() => selectParts(manifest, 'dragons')).toThrow(/matches no asset/);
  });
});
