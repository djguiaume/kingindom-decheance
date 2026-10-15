import { describe, expect, it } from 'vitest';
import {
  DUSK_MS,
  easeNight,
  glowStrength,
  groundShade,
  mix,
  sceneryTint,
} from '../src/game/lighting.ts';

describe('night lighting', () => {
  it('eases through dusk and dawn the same at any frame rate', () => {
    const run = (step: number) => {
      let level = 0;
      for (let t = 0; t < DUSK_MS; t += step) level = easeNight(level, true, step);
      return level;
    };
    expect(run(1000 / 30)).toBeCloseTo(run(1000 / 120), 2);
    expect(run(1000 / 60)).toBeGreaterThan(0.5);
    expect(run(1000 / 60)).toBeLessThan(1);
    // It settles exactly, so a long night is fully lit and a day is fully clear.
    let level = 0.5;
    for (let i = 0; i < 600; i++) level = easeNight(level, false, 16);
    expect(level).toBe(0);
  });

  it('leaves the day untouched and moonlights the night, never black', () => {
    expect(sceneryTint(0)).toBe(0xffffff);
    expect(groundShade(0)).toBe(0);
    const night = sceneryTint(1);
    for (const shift of [16, 8, 0]) expect((night >> shift) & 0xff).toBeGreaterThan(110);
    // Moonlight is blue: the blue channel stays the brightest.
    expect(night & 0xff).toBeGreaterThan((night >> 16) & 0xff);
  });

  it('lights windows and lanterns only once dusk has fallen', () => {
    expect(glowStrength(0)).toBe(0);
    expect(glowStrength(0.2)).toBe(0);
    expect(glowStrength(1)).toBe(1);
  });

  it('mixes colours channel by channel', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});
