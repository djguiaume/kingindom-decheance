import { describe, expect, it } from 'vitest';
import { Session } from '../src/index.ts';
import { collectUntil, config, content, emptyNight, placeEnemy } from './helpers.ts';

const withWeapon = (weaponId: string) => new Session(content, { ...config, weaponId });

describe('the Longbow (Stage A)', () => {
  it('costs the king a fifth of his HP, whichever king', () => {
    for (const kingId of ['roll', 'wolf']) {
      const spear = new Session(content, { ...config, kingId });
      const bow = new Session(content, { ...config, kingId, weaponId: 'longbow' });
      expect(bow.state.king.maxHp).toBe(spear.state.king.maxHp * 0.8);
    }
  });

  it('keeps the king his own ability: abilities come with the king, not the weapon', () => {
    expect(withWeapon('longbow').ctx.king.ability).toEqual(withWeapon('spear').ctx.king.ability);
  });

  it('shoots the nearest enemy 6 m away, where the Spear reaches nothing', () => {
    const run = (weaponId: string) => {
      const s = withWeapon(weaponId);
      emptyNight(s, 10_000);
      const { x, y } = s.state.king.pos;
      const near = placeEnemy(s, 'brute', x + 6, y);
      const far = placeEnemy(s, 'brute', x + 9, y);
      // One shot: the next is 0.7 s away.
      const start = s.state.tick;
      const events = collectUntil(s, () => s.state.tick > start + 10, 20);
      const hits = events.filter((e) => e.type === 'hit' && e.attacker.kind === 'king');
      return { hits, near, far };
    };
    const bow = run('longbow');
    expect(bow.hits).toHaveLength(1);
    expect(bow.near.hp).toBeLessThan(bow.near.maxHp);
    expect(bow.far.hp).toBe(bow.far.maxHp);
    expect(run('spear').hits).toHaveLength(0);
  });
});
