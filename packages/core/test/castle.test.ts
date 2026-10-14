import { describe, expect, it } from 'vitest';
import { buyOptions, castleOffer, playReplay, stateHash, TICK_RATE } from '../src/index.ts';
import { content, contentWith, emptyNight, newSession, placeEnemy } from './helpers.ts';

describe('castle levels (13 §1)', () => {
  it('a castle level costs gold only, raises the castle and records the perk', () => {
    const s = newSession();
    expect(castleOffer(s.state, s.ctx)).toMatchObject({ level: 2, cost: 35 });
    const result = s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'royal_archers' });
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: 'castleUpgraded', level: 2, perk: 'royal_archers' }],
    });
    expect(s.state).toMatchObject({ gold: 75 - 35, castleLevel: 2, perks: ['royal_archers'] });
    expect(s.state.castle).toMatchObject({ hp: 2000, maxHp: 2000 });
    // Level 2 shoots 8, and Royal Archers doubles it and adds 3 m.
    expect(s.ctx.castle.attack).toMatchObject({ damage: 16, range: 12 });
    expect(castleOffer(s.state, s.ctx)).toMatchObject({ level: 3, cost: 80 });
  });

  it.each([
    [{ type: 'chooseCastleLevel', level: 3, perk: 'fortress' }, 'next castle level is 2'],
    [{ type: 'chooseCastleLevel', level: 2, perk: 'fortress' }, 'not offered'],
    [{ type: 'chooseCastleLevel', level: 2, perk: 'nope' }, 'not offered'],
  ] as const)('refuses %j without changing anything', (cmd, reason) => {
    const s = newSession();
    const before = stateHash(s.state);
    const result = s.submit(cmd);
    expect(!result.ok && result.reason).toContain(reason);
    expect(stateHash(s.state)).toBe(before);
  });

  it('refuses without gold, at night and past the top level', () => {
    const s = newSession();
    s.state.gold = 30;
    expect(s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' })).toEqual({
      ok: false,
      reason: 'not enough gold',
    });
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'fortress' });
    expect(castleOffer(s.state, s.ctx)).toBeNull();
    expect(s.submit({ type: 'chooseCastleLevel', level: 4, perk: 'fortress' }).ok).toBe(false);
    const night = newSession();
    night.submit({ type: 'startNight' });
    expect(night.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' }).ok).toBe(false);
  });

  it('second-tier upgrades show but wait for castle level 2', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    expect(buyOptions(s.state, s.ctx, 'tw')).toEqual([
      { option: 0, kind: 'upgrade', building: 'watchtower', cost: 35, needsCastle: 2 },
    ]);
    expect(s.submit({ type: 'buy', slot: 'tw', option: 0 })).toEqual({
      ok: false,
      reason: 'needs castle level 2',
    });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    expect(s.submit({ type: 'buy', slot: 'tw', option: 0 }).ok).toBe(true);
    expect(buyOptions(s.state, s.ctx, 'tw').map((o) => o.needsCastle)).toEqual([3, 3]);
  });

  it('Tithe adds gold at dawn to houses only', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'h1', option: 0 });
    s.submit({ type: 'buy', slot: 'm1', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    emptyNight(s);
    s.step();
    // castle 25 + house (10 + 5) + mine 25
    expect(s.state.history[0]!.income).toBe(25 + 15 + 25);
  });

  it('Fortress raises the HP of standing walls and towers at once', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'ww', option: 0 });
    s.submit({ type: 'buy', slot: 'h1', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'fortress' });
    const [wall, house] = s.state.buildings;
    expect(wall).toMatchObject({ hp: 700, maxHp: 700 });
    expect(house).toMatchObject({ hp: 150, maxHp: 150 });
  });

  it("Hero King raises the king's HP and shortens the ability's cooldown", () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'hero_king' });
    expect(s.state.king).toMatchObject({ hp: 300, maxHp: 300 });
    s.submit({ type: 'startNight' });
    s.submit({ type: 'ability' });
    expect(s.state.king.abilityCooldown).toBe(Math.round(8 * 0.7 * TICK_RATE));
  });

  it("Gambler's Oath makes enemies tougher on nights 5 and 6 only", () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    s.submit({ type: 'chooseCastleLevel', level: 3, perk: 'gamblers_oath' });
    expect(s.ctx.enemies.get('raider')!.hp).toBe(
      content.enemies.find((e) => e.id === 'raider')!.hp,
    );
    expect(s.ctx.rules.scoreMultiplier).toBe(1.25);
    s.state.day = 5;
    s.step();
    expect(s.ctx.enemies.get('raider')!.hp).toBeCloseTo(
      content.enemies.find((e) => e.id === 'raider')!.hp * 1.2,
      9,
    );
  });

  it('Commander doubles the rally reach and boosts soldiers with the king', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'commander' });
    emptyNight(s, 10_000);
    // The squad stands at the west gate, about 9.5 m from the king: out of reach without the perk.
    for (let i = 0; i < TICK_RATE * 4; i++) s.step();
    s.state.king.pos = { x: 30, y: 24 };
    expect(s.submit({ type: 'rally' })).toMatchObject({ ok: true });
    const follower = s.state.units.find((u) => u.following)!;
    placeEnemy(s, 'raider', follower.pos.x + 0.9, follower.pos.y, { hp: 1000 });
    const hit = Array.from({ length: TICK_RATE * 2 }, () => s.step())
      .flat()
      .find((e) => e.type === 'hit' && e.attacker.kind === 'unit' && e.attacker.id === follower.id);
    expect(hit && hit.type === 'hit' && hit.damage).toBeCloseTo(6 * 1.3, 9);
  });

  it('a run with castle picks replays to the same state', () => {
    const s = newSession(3);
    s.state.gold = 75;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'royal_archers' });
    s.submit({ type: 'startNight' });
    while (!s.over && s.state.day < 2) s.step();
    const replay = playReplay(content, s.toReplay(), s.state.tick);
    expect(stateHash(replay.state)).toBe(stateHash(s.state));
  });

  it('content refuses a castle level that offers an unknown perk', () => {
    expect(() =>
      contentWith((raw) => {
        (raw.castle as { levels: { perks: string[] }[] }).levels[0]!.perks[0] = 'nope';
      }),
    ).toThrow(/unknown perk "nope"/);
  });

  it('a perk whose stat reaches no number stops the run from starting', () => {
    const bad = contentWith((raw) => {
      const perks = (raw.castle as { perks: { modifiers: { stat: string }[] }[] }).perks;
      perks[0]!.modifiers[0]!.stat = 'building.house.armour';
    });
    expect(() => newSession(1, bad)).toThrow(/tithe: building.house.armour/);
  });
});
