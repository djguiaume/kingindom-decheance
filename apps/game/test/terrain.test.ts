import { describe, expect, it } from 'vitest';
import { bridgeFrame, terrainSamples } from '../src/game/terrain.ts';

describe('painted terrain orientation', () => {
  it('selects bridge perspectives from geometry in either direction', () => {
    const cases = [
      { from: [0, 0] as const, to: [10, 1] as const, frame: 'bridge' },
      { from: [0, 0] as const, to: [1, 10] as const, frame: 'bridge.side' },
      { from: [0, 0] as const, to: [10, 8] as const, frame: 'bridge.diag' },
    ];
    for (const { from, to, frame } of cases) {
      expect(bridgeFrame(from, to)).toBe(frame);
      expect(bridgeFrame(to, from)).toBe(frame);
    }
  });

  it('covers every future-map angle without a direction gap', () => {
    for (let degree = 0; degree < 360; degree++) {
      const radians = (degree * Math.PI) / 180;
      expect(
        ['bridge', 'bridge.diag', 'bridge.side'].includes(
          bridgeFrame([0, 0], [Math.cos(radians), Math.sin(radians)]),
        ),
      ).toBe(true);
    }
  });
});

describe('painted cliff placement', () => {
  it('follows bends and vertical future-map sections with bounded gaps', () => {
    const points = terrainSamples(
      [
        [0, 0],
        [0, 7],
        [6, 7],
      ],
      3,
    );
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([6, 7]);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(3.01);
    }
  });
});
