import { describe, expect, it } from 'vitest';
import { buyOptions, TICK_RATE, type GameEvent } from '../src/index.ts';
import { benchKing, content, emptyNight, newSession, placeEnemy } from './helpers.ts';

/** Steps `seconds` and returns the events seen. */
function run(s: ReturnType<typeof newSession>, seconds: number): GameEvent[] {
  return Array.from({ length: TICK_RATE * seconds }, () => s.step()).flat();
}

describe('Knight hall and Archery range (11 §12.2)', () => {
  it('the barracks branches into Garrison or Knight hall, and picking one closes the other', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    expect(buyOptions(s.state, s.ctx, 'b1').map((o) => o.building)).toEqual([
      'garrison',
      'knight_hall',
    ]);
    expect(s.submit({ type: 'buy', slot: 'b1', option: 1 })).toMatchObject({ ok: true });
    expect(buyOptions(s.state, s.ctx, 'b1')).toEqual([]);
    emptyNight(s);
    expect(s.state.units.map((u) => u.type)).toEqual(['knight', 'knight', 'knight']);
  });

  it('archers only come from the Archery range, never from the barracks line', () => {
    const fromBarracks = new Set<string>();
    const walk = (id: string) => {
      const def = content.buildings.find((b) => b.id === id)!;
      if (def.spawns) fromBarracks.add(def.spawns.unit);
      for (const u of def.upgrades) walk(u.to);
    };
    walk('barracks');
    expect([...fromBarracks].sort()).toEqual(['footman', 'knight']);
  });

  it('knights take 30% less damage', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'buy', slot: 'b1', option: 1 });
    benchKing(s);
    emptyNight(s, 10_000);
    run(s, 4);
    const knight = s.state.units[0]!;
    placeEnemy(s, 'raider', knight.pos.x + 0.8, knight.pos.y, { cooldown: 0, hp: 1000 });
    const hit = run(s, 2).find((e) => e.type === 'hit' && e.target.kind === 'unit');
    const raider = s.ctx.enemies.get('raider')!.attack.damage;
    expect(hit && hit.type === 'hit' && hit.damage).toBeCloseTo(raider * 0.7, 9);
  });

  it('archers shoot arrows at flyers from their post', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'r_w', option: 0 });
    benchKing(s);
    emptyNight(s, 10_000);
    run(s, 4);
    const archer = s.state.units[0]!;
    expect(archer.type).toBe('archer');
    const harpy = placeEnemy(s, 'harpy', archer.pos.x, archer.pos.y - 4, { hp: 1000 });
    const events = run(s, 3);
    const fired = events.filter((e) => e.type === 'fired' && e.attacker.kind === 'unit');
    expect(fired.length).toBeGreaterThan(0);
    const landed = events.find(
      (e) =>
        e.type === 'hit' &&
        e.attacker.kind === 'unit' &&
        e.target.kind === 'enemy' &&
        e.target.id === harpy.id,
    );
    expect(landed && landed.type === 'hit' && landed.damage).toBe(7);
  });

  it('crossbowmen hit brutes 1.5 times as hard', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'r_w', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'buy', slot: 'r_w', option: 1 });
    benchKing(s);
    emptyNight(s, 10_000);
    run(s, 4);
    const bow = s.state.units[0]!;
    expect(bow.type).toBe('crossbowman');
    const brute = placeEnemy(s, 'brute', bow.pos.x + 5, bow.pos.y, { hp: 1000 });
    const landed = run(s, 4).find(
      (e) =>
        e.type === 'hit' &&
        e.attacker.kind === 'unit' &&
        e.target.kind === 'enemy' &&
        e.target.id === brute.id,
    );
    expect(landed && landed.type === 'hit' && landed.damage).toBe(18 * 1.5);
  });
});
