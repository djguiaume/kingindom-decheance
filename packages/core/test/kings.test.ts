import { describe, expect, it } from 'vitest';
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { Session, stateHash } from '../src/index.ts';
import { emptyNight, placeEnemy } from './helpers.ts';

const session = (kingId?: string) =>
  new Session(prototypeContent, { ...prototypeRun, kingId, seed: 17 });

function startAbility(kingId: string): Session {
  const s = session(kingId);
  emptyNight(s, 10_000);
  s.submit({ type: 'move', x: 1, y: 0 });
  s.submit({ type: 'move', x: 0, y: 0 });
  return s;
}

describe('selectable kings', () => {
  it('uses the content default for old configs and records the stable id', () => {
    const s = session(undefined);
    expect(s.ctx.king.id).toBe('roll');
    expect(s.state.kingId).toBe('roll');
    expect(s.state.king.maxHp).toBe(200);
    expect(s.toReplay().config.kingId).toBe('roll');
  });

  it('rejects an unknown king id', () => {
    expect(() => session('missing')).toThrow('Unknown king "missing"');
  });

  it('loads different stats and keeps the selected id in the replay config', () => {
    const s = session('wolf');
    expect(s.ctx.king).toMatchObject({ id: 'wolf', speed: 8, hp: 190 });
    expect(s.state.king.maxHp).toBe(190);
    expect(s.toReplay().config.kingId).toBe('wolf');
  });

  it('rolls through a crowd while the wolf lunge stops on its first target', () => {
    const roll = startAbility('roll');
    const rollA = placeEnemy(roll, 'brute', 34, 27);
    const rollB = placeEnemy(roll, 'brute', 34, 27);
    roll.state.king.cooldown = 999;
    roll.submit({ type: 'ability' });
    while (roll.state.king.dash) roll.step();
    expect(rollA.hp).toBeLessThanOrEqual(285);
    expect(rollB.hp).toBeLessThanOrEqual(285);

    const wolf = startAbility('wolf');
    const wolfA = placeEnemy(wolf, 'brute', 34, 27);
    const wolfB = placeEnemy(wolf, 'brute', 34, 27);
    wolf.state.king.cooldown = 999;
    wolf.submit({ type: 'ability' });
    while (wolf.state.king.dash) wolf.step();
    expect(wolfA.hp).toBeLessThanOrEqual(145);
    expect(wolfB.hp).toBeGreaterThanOrEqual(320);
    expect(wolfA.hp).toBeLessThan(wolfB.hp);
    expect(wolf.state.king.dash).toBeNull();
  });

  it.each(['roll', 'wolf'])('%s runs replay-identically from the same commands', (kingId) => {
    const first = startAbility(kingId);
    const second = startAbility(kingId);
    first.submit({ type: 'ability' });
    second.submit({ type: 'ability' });
    for (let tick = 0; tick < 120; tick++) {
      first.step();
      second.step();
    }
    expect(stateHash(first.state)).toBe(stateHash(second.state));
    expect(first.toReplay()).toEqual(second.toReplay());
  });
});
