import { describe, expect, it } from 'vitest';
import { prototypeContent } from '@kd/content/prototype';
import { saveSelectedKingId, selectedKingId } from '../src/king-selection.ts';

describe('king selection', () => {
  it('defaults safely and ignores a removed king id', () => {
    expect(selectedKingId(prototypeContent, null)).toBe('roll');
    expect(selectedKingId(prototypeContent, { getItem: () => 'removed-king' })).toBe('roll');
  });

  it('remembers a valid selection', () => {
    let saved = '';
    saveSelectedKingId('wolf', { setItem: (_key, value) => (saved = value) });
    expect(saved).toBe('wolf');
    expect(selectedKingId(prototypeContent, { getItem: () => saved })).toBe('wolf');
  });
});
