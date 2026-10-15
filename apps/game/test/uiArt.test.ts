import { describe, expect, it } from 'vitest';
import { castleArt, indexFrames, uiFrame } from '../src/ui-art.ts';

const atlas = (names: string[], w = 100) => ({
  frames: Object.fromEntries(names.map((n, i) => [n, { frame: { x: i * 10, y: 0, w: 8, h: 9 } }])),
  meta: { size: { w, h: 50 } },
});

describe('UI art map (F14)', () => {
  it('indexes frames with their page, the first atlas winning a shared name', () => {
    const frames = indexFrames([
      { name: 'kings', url: 'kings.webp', atlas: atlas(['king_portrait', 'coin']) },
      { name: 'effects', url: 'effects.webp', atlas: atlas(['coin'], 200) },
    ]);
    expect(frames.get('coin')).toEqual({
      url: 'kings.webp',
      x: 10,
      y: 0,
      w: 8,
      h: 9,
      pageW: 100,
      pageH: 50,
    });
  });

  it('clamps the castle painting to the three levels', () => {
    expect([0, 1, 2, 3, 4].map(castleArt)).toEqual([
      'castle_1',
      'castle_1',
      'castle_2',
      'castle_3',
      'castle_3',
    ]);
  });

  it('finds the painted UI roles and content ids in the repository art', () => {
    // The art is in main; a checkout without it gets null and the icon fallback instead.
    for (const id of ['portrait', 'coin', 'crown', 'house', 'wall', 'harpy', 'warlord'])
      expect(uiFrame(id), id).not.toBeNull();
    expect(uiFrame('no_such_art')).toBeNull();
  });
});
