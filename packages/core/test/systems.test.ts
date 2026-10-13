import { describe, expect, it } from 'vitest';
import {
  buildSpawnQueue,
  effectivePriority,
  telegraph,
  TICK_RATE,
  type GameEvent,
} from '../src/index.ts';
import {
  benchKing,
  collectUntil,
  contentWith,
  emptyNight,
  newSession,
  placeEnemy,
  stepUntil,
} from './helpers.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const hitsBy = (events: GameEvent[], kind: string) =>
  events.filter((e) => e.type === 'hit' && e.attacker.kind === kind) as Extract<
    GameEvent,
    { type: 'hit' }
  >[];

describe('waves', () => {
  it('turns wave groups into a time-ordered spawn queue', () => {
    const s = newSession();
    const queue = buildSpawnQueue(s.ctx, 2);
    expect(queue).toHaveLength(16);
    expect(queue.map((o) => o.at)).toEqual([...queue.map((o) => o.at)].sort((a, b) => a - b));
    expect(queue[0]).toEqual({ at: 0, lane: 'west', enemy: 'raider' });
    expect(queue.find((o) => o.lane === 'east')!.at).toBe(6 * TICK_RATE);
  });

  it('summarises a night per lane for the telegraph', () => {
    const s = newSession();
    expect(telegraph(s.ctx, 6)).toContainEqual({ lane: 'air', enemy: 'harpy', count: 8 });
    expect(telegraph(s.ctx, 1)).toEqual([{ lane: 'west', enemy: 'raider', count: 8 }]);
  });

  it('spawns enemies near the first node of their lane', () => {
    const s = newSession();
    s.submit({ type: 'startNight' });
    const events = s.step();
    expect(events).toContainEqual(expect.objectContaining({ type: 'enemySpawned', lane: 'west' }));
    const e = s.state.enemies[0]!;
    expect(Math.abs(e.pos.x - 0)).toBeLessThan(1);
    expect(Math.abs(e.pos.y - 27)).toBeLessThan(1);
  });
});

describe('targeting and movement', () => {
  it('flyers never consider walls; every enemy ends at the castle', () => {
    expect(effectivePriority(['eco', 'wall'], true)).toEqual(['eco', 'castle']);
    expect(effectivePriority(['unit', 'wall'], false)).toEqual(['unit', 'wall', 'castle']);
    expect(effectivePriority(['castle', 'king'], false)).toEqual(['castle', 'king']);
  });

  it('a wall on the lane holds ground enemies back while it stands', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'ww', option: 0 });
    s.submit({ type: 'move', x: 1, y: 0 }); // keep the king out of the fight
    s.submit({ type: 'startNight' });
    const wall = s.state.buildings[0]!;
    for (let i = 0; i < TICK_RATE * 30 && !wall.destroyed; i++) {
      s.step();
      for (const e of s.state.enemies) expect(e.pos.x).toBeLessThan(wall.pos.x);
    }
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it('enemies do not walk around a wall to reach the king behind it', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'ww', option: 0 });
    emptyNight(s, 10_000);
    const wall = s.state.buildings[0]!;
    // Just behind the wall: in a raider's aggro range, out of the king's own reach.
    s.state.king.pos = { x: wall.pos.x + 2, y: wall.pos.y + 2 };
    const raider = placeEnemy(s, 'raider', 15.5, 27.5, { cooldown: 0, waypoint: 2 });
    for (let i = 0; i < TICK_RATE * 5; i++) {
      s.step();
      expect(raider.pos.x).toBeLessThan(wall.pos.x);
    }
    expect(raider.target).toEqual({ kind: 'building', id: wall.id });
    expect(s.state.king.hp).toBe(s.state.king.maxHp);
  });

  it('brutes attack a blocking wall even though it is first on their list anyway', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'ww', option: 0 });
    emptyNight(s, 10_000);
    benchKing(s);
    const brute = placeEnemy(s, 'brute', 13, 27, { cooldown: 0, waypoint: 2 });
    stepUntil(s, () => s.state.buildings[0]!.hp < 500);
    expect(brute.target).toEqual({ kind: 'building', id: s.state.buildings[0]!.id });
  });

  it('flyers fly straight to eco buildings anywhere on the map', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'm2', option: 0 }); // far west, nowhere near the air spawn
    emptyNight(s);
    s.state.spawnQueue = [{ at: 0, lane: 'air', enemy: 'harpy' }];
    benchKing(s);
    const events = collectUntil(s, () => s.state.buildings[0]!.hp < s.state.buildings[0]!.maxHp);
    expect(hitsBy(events, 'enemy')[0]).toMatchObject({ target: { kind: 'building' } });
  });

  it('ground enemies do not leave their lane for targets beyond their leash', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    // The king is 1.5 m from the raider (inside its 3 m aggro) but 6 m from the west lane
    // (beyond its 5 m leash): the raider ignores him.
    s.state.king.pos = { x: 9, y: 34 };
    const raider = placeEnemy(s, 'raider', 9, 32.5, { cooldown: 0 });
    s.step();
    expect(raider.target).toBeNull();
  });
});

describe('combat', () => {
  it('towers shoot enemies in range, and kills are counted', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'startNight' });
    const events = collectUntil(s, () => s.state.phase !== 'night');
    expect(hitsBy(events, 'building').length).toBeGreaterThan(0);
    expect(s.state.history[0]!.enemiesKilled).toBe(8);
  });

  it('the volley tower hits up to three enemies per shot', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'buy', slot: 'tw', option: 1 });
    emptyNight(s, 10_000);
    benchKing(s);
    for (const dx of [3, 3.5, 4, 4.5]) placeEnemy(s, 'raider', 19 - dx, 22);
    expect(hitsBy(s.step(), 'building')).toHaveLength(3);
  });

  it('the ballista deals its bonus against tanks', () => {
    const s = newSession();
    s.state.gold = 1000;
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    s.submit({ type: 'buy', slot: 'tw', option: 0 });
    emptyNight(s, 10_000);
    benchKing(s);
    placeEnemy(s, 'brute', 14, 22);
    expect(hitsBy(s.step(), 'building')[0]!.damage).toBeCloseTo(40 * 1.6, 9);
  });

  it('the spear hits up to three enemies in a 90° arc, not behind the king', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.king.pos = { x: 10, y: 42 };
    const front1 = placeEnemy(s, 'raider', 11.5, 42);
    const front2 = placeEnemy(s, 'raider', 11.5, 42.9);
    const behind = placeEnemy(s, 'raider', 8.2, 42);
    const targets = hitsBy(s.step(), 'king').map((h) => (h.target as { id: number }).id);
    expect(targets).toEqual(expect.arrayContaining([front1.id, front2.id]));
    expect(targets).not.toContain(behind.id);
  });

  it('the charge damages every enemy the king dashes through', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.king.pos = { x: 10, y: 42 };
    const a = placeEnemy(s, 'brute', 13, 42);
    const b = placeEnemy(s, 'brute', 15, 42.3);
    s.submit({ type: 'move', x: 1, y: 0 });
    s.submit({ type: 'move', x: 0, y: 0 });
    s.submit({ type: 'ability' });
    const events: GameEvent[] = [];
    for (let i = 0; i < 9; i++) events.push(...s.step());
    const charged = hitsBy(events, 'king').filter((h) => h.damage === 40);
    expect(charged.map((h) => (h.target as { id: number }).id).sort()).toEqual([a.id, b.id].sort());
  });

  it('the castle shoots enemies near it', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    benchKing(s);
    placeEnemy(s, 'raider', 32, 18);
    expect(hitsBy(s.step(), 'castle')).toHaveLength(1);
  });

  it('barracks field their squad at their rally gate', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    s.submit({ type: 'cycleRally', slot: 'b1' });
    s.submit({ type: 'cycleRally', slot: 'b1' });
    s.submit({ type: 'startNight' });
    expect(s.state.units).toHaveLength(3);
    for (const u of s.state.units) expect(u.post.y).toBe(13);
  });
});

describe('the king', () => {
  it('regenerates after a quiet spell', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.king.hp = 100;
    s.state.king.calm = 0;
    for (let i = 0; i < TICK_RATE * 4; i++) s.step();
    expect(s.state.king.hp).toBeLessThan(102);
    for (let i = 0; i < TICK_RATE; i++) s.step();
    expect(s.state.king.hp).toBeGreaterThan(108);
  });

  it('respawns at the castle 8 s after dying', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.king.hp = 0;
    s.state.king.pos = { x: 5, y: 5 };
    const events = s.step();
    expect(events).toContainEqual({ type: 'killed', target: { kind: 'king' } });
    stepUntil(s, () => s.state.king.alive);
    expect(s.state.nightTick).toBe(1 + 8 * TICK_RATE);
    expect(s.state.king.pos).toEqual(s.ctx.kingSpawn);
    expect(s.state.king.hp).toBe(200);
  });
});

describe('phases', () => {
  it('pays the castle and eco buildings that survived, at dawn', () => {
    const s = newSession();
    s.state.gold = 100;
    s.submit({ type: 'buy', slot: 'h1', option: 0 }); // 10
    s.submit({ type: 'buy', slot: 'm2', option: 0 }); // 25
    const goldBefore = s.state.gold;
    emptyNight(s);
    s.state.buildings.find((b) => b.type === 'gold_mine')!.hp = 0;
    const events = s.step();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'buildingDestroyed', slot: 'm2' }),
    );
    expect(events).toContainEqual({ type: 'dawn', night: 1, income: 25 + 10 });
    expect(s.state.gold).toBe(goldBefore + 35);
    expect(s.state.history[0]).toMatchObject({ night: 1, income: 35, buildingsLost: 1 });
  });

  it('rebuilds for free and restores everything at dawn, then starts the next day', () => {
    const s = newSession();
    s.submit({ type: 'buy', slot: 'b1', option: 0 });
    emptyNight(s);
    s.state.castle.hp = 10;
    s.state.buildings[0]!.hp = 0;
    s.step();
    expect(s.state.phase).toBe('day');
    expect(s.state.day).toBe(2);
    expect(s.state.castle.hp).toBe(1500);
    expect(s.state.buildings[0]).toMatchObject({ destroyed: false, hp: 400 });
    expect(s.state.units).toEqual([]);
  });

  it('loses when the castle falls', () => {
    const s = newSession();
    emptyNight(s, 10_000);
    s.state.castle.hp = 0;
    expect(s.step()).toContainEqual({ type: 'lost' });
    expect(s.state.phase).toBe('lost');
    expect(s.step()).toEqual([]);
    expect(s.submit({ type: 'startNight' })).toEqual({ ok: false, reason: 'the run is over' });
  });

  it('wins at the dawn after the last night', () => {
    const bundle = contentWith((raw) => {
      const map = raw.maps[0] as Any;
      map.nights = 1;
      map.waves = map.waves.slice(0, 1);
    });
    const s = newSession(1, bundle);
    emptyNight(s);
    expect(s.step()).toContainEqual({ type: 'won' });
    expect(s.state.phase).toBe('won');
  });
});
