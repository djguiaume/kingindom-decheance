import { describe, expect, it } from 'vitest';
import { Session, STARTING_PERK_SLOTS } from '../src/index.ts';
import { benchKing, collectUntil, config, content, emptyNight, placeEnemy } from './helpers.ts';

const withPerks = (...perkIds: string[]) => new Session(content, { ...config, perkIds });
const plain = () => new Session(content, config);

describe('starting perks (13 §4)', () => {
  it('refuses unknown, repeated or too many perks', () => {
    expect(() => withPerks('nope')).toThrow('Unknown starting perk "nope"');
    expect(() => withPerks('veterans', 'veterans')).toThrow('picked twice');
    expect(STARTING_PERK_SLOTS).toBe(3);
    expect(() => withPerks('gold_rush', 'royal_mint', 'veterans', 'stonemasons')).toThrow(
      'At most 3',
    );
  });

  it('Early Start adds starting gold and costs the houses 3 a dawn', () => {
    const s = withPerks('early_start');
    expect(s.state.gold).toBe(plain().state.gold + 40);
    expect(s.ctx.buildings.get('house')!.income).toBe(
      plain().ctx.buildings.get('house')!.income - 3,
    );
  });

  it('a perk with a cost carries it: Royal Mint, Stonemasons, Veterans, Light Cavalry', () => {
    const base = plain();
    expect(withPerks('royal_mint').state.king.maxHp).toBe(base.state.king.maxHp * 0.75);
    expect(withPerks('royal_mint').ctx.castle.income).toBe(base.ctx.castle.income + 10);
    expect(withPerks('stonemasons').ctx.buildings.get('wall')!.cost).toBe(
      base.ctx.buildings.get('wall')!.cost + 5,
    );
    expect(withPerks('veterans').ctx.units.get('footman')!.hp).toBe(
      base.ctx.units.get('footman')!.hp * 1.5,
    );
    expect(withPerks('light_cavalry').ctx.king.ability.cooldown).toBe(
      base.ctx.king.ability.cooldown + 2,
    );
  });

  it('starting perks and castle perks stack', () => {
    const s = withPerks('drill_sergeant');
    s.state.gold = 1000;
    s.submit({ type: 'chooseCastleLevel', level: 2, perk: 'tithe' });
    expect(s.ctx.buildings.get('barracks')!.spawns!.count).toBe(4);
    expect(s.state.perks).toEqual(['tithe']);
  });

  it('Scarecrows arms houses against flyers only', () => {
    const s = withPerks('scarecrows');
    expect(s.ctx.buildings.get('house')!.attack).toMatchObject({ damage: 4, targets: ['air'] });
    expect(s.ctx.buildings.get('tower')!.attack).toEqual(
      plain().ctx.buildings.get('tower')!.attack,
    );
    expect(plain().ctx.buildings.get('house')!.attack).toBeUndefined();

    s.submit({ type: 'buy', slot: 'h1', option: 0 });
    const house = s.state.buildings[0]!;
    benchKing(s);
    emptyNight(s, 30 * 30);
    placeEnemy(s, 'harpy', house.pos.x + 2, house.pos.y);
    const events = collectUntil(s, () => s.state.tick > 30 * 3, 30 * 5);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'hit', attacker: { kind: 'building', id: house.id } }),
    );
  });
});
