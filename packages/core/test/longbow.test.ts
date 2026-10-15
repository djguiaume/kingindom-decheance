import { describe, expect, it } from 'vitest';
import { Session } from '../src/index.ts';
import { collectUntil, config, content, emptyNight, placeEnemy } from './helpers.ts';

const asKing = (kingId: string) => new Session(content, { ...config, kingId, seed: 17 });

describe('the Longbow King (Stage A)', () => {
  it('comes with his own weapon: every king carries one, none is picked', () => {
    expect(asKing('roll').ctx.weapon.id).toBe('spear');
    expect(asKing('wolf').ctx.weapon.id).toBe('spear');
    expect(asKing('longbow').ctx.weapon.id).toBe('longbow');
  });

  it('shoots the nearest enemy 6 m away, where the Spear reaches nothing', () => {
    const run = (kingId: string) => {
      const s = asKing(kingId);
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
    expect(run('roll').hits).toHaveLength(0);
  });

  it('Volley hits the nearest enemies in the cone ahead, at most 7, then cools down', () => {
    const s = asKing('longbow');
    emptyNight(s, 10_000);
    const { x, y } = s.state.king.pos;
    // Nine in front (the two farthest are left out), one behind.
    const ahead = Array.from({ length: 9 }, (_, i) => placeEnemy(s, 'brute', x + 2 + i * 0.5, y));
    const behind = placeEnemy(s, 'brute', x - 3, y);
    const result = s.submit({ type: 'ability', dir: { x: 1, y: 0 } });
    if (!result.ok) throw new Error(result.reason);
    const { events } = result;
    expect(events[0]).toMatchObject({ type: 'volley', arrows: 7, cone: 60 });
    const struck = events.filter((e) => e.type === 'hit');
    expect(struck).toHaveLength(7);
    expect(ahead.slice(0, 7).every((e) => e.hp === e.maxHp - 25)).toBe(true);
    expect(ahead.slice(7).every((e) => e.hp === e.maxHp)).toBe(true);
    expect(behind.hp).toBe(behind.maxHp);
    expect(s.state.king.dash).toBeNull();
    expect(s.submit({ type: 'ability' }).ok).toBe(false);
  });
});
