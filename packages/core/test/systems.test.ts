import { describe, expect, it } from 'vitest';
import { buildSpawnQueue, effectivePriority, TICK_RATE } from '../src/index.ts';
import { collectUntil, contentWith, emptyNight, newSession, stepUntil } from './helpers.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

describe('spawning', () => {
  it('turns wave groups into a time-ordered spawn queue', () => {
    const s = newSession();
    const queue = buildSpawnQueue(s.ctx, 2);
    expect(queue).toHaveLength(5 + 3 + 2);
    expect(queue.map((o) => o.at)).toEqual([...queue.map((o) => o.at)].sort((a, b) => a - b));
    expect(queue[0]).toEqual({ at: 0, lane: 'west', enemy: 'grunt' });
    expect(queue.filter((o) => o.enemy === 'bat')[0]!.at).toBe(6 * TICK_RATE);
  });

  it('spawns enemies near the first node of their lane', () => {
    const s = newSession();
    s.submit({ type: 'startNight' });
    const events = s.step();
    expect(events).toContainEqual(expect.objectContaining({ type: 'enemySpawned', lane: 'west' }));
    const e = s.state.enemies[0]!;
    expect(Math.abs(e.pos.x - 0)).toBeLessThan(1);
    expect(Math.abs(e.pos.y - 15)).toBeLessThan(1);
  });
});

describe('targeting rules', () => {
  it('ground enemies stop for walls first; flyers ignore walls; everyone ends at the castle', () => {
    expect(effectivePriority(['eco', 'wall'], false)).toEqual(['wall', 'eco', 'castle']);
    expect(effectivePriority(['wall', 'eco'], true)).toEqual(['eco', 'castle']);
    expect(effectivePriority(['castle', 'king'], false)).toEqual(['wall', 'castle', 'king']);
  });

  it('a wall on the lane holds ground enemies back while it stands', () => {
    const s = newSession();
    s.submit({ type: 'build', slot: 'slot-wall-w', building: 'wall' });
    s.submit({ type: 'moveKing', x: 1, y: 0 }); // keep the king out of the fight
    s.submit({ type: 'startNight' });
    const wall = s.state.buildings[0]!;
    const wallX = wall.pos.x;
    for (let i = 0; i < TICK_RATE * 20 && !wall.destroyed; i++) {
      s.step();
      for (const e of s.state.enemies) expect(e.pos.x).toBeLessThan(wallX);
    }
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it('flyers pass over walls and go for eco buildings', () => {
    const s = newSession();
    s.state.gold = 100;
    s.submit({ type: 'build', slot: 'slot-house-2', building: 'house' });
    emptyNight(s);
    s.state.spawnQueue = [{ at: 0, lane: 'north-air', enemy: 'bat' }];
    const events = collectUntil(s, () => s.state.buildings[0]!.hp < s.state.buildings[0]!.maxHp);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits[0]).toMatchObject({ attacker: { kind: 'enemy' }, target: { kind: 'building' } });
  });
});

describe('combat', () => {
  it('towers shoot enemies in range, and kills are counted', () => {
    const s = newSession();
    s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' });
    s.submit({ type: 'moveKing', x: 1, y: 0 });
    s.submit({ type: 'startNight' });
    const events = collectUntil(s, () => s.state.phase !== 'night');
    expect(events.some((e) => e.type === 'hit' && e.attacker.kind === 'building')).toBe(true);
    expect(s.state.history[0]!.enemiesKilled).toBe(4);
  });

  it('splash damage hits every enemy near the target', () => {
    const s = newSession();
    s.state.gold = 100;
    s.submit({ type: 'build', slot: 'slot-tower-w', building: 'tower' });
    s.submit({ type: 'upgrade', slot: 'slot-tower-w', to: 'tower-heavy' });
    emptyNight(s);
    const tower = s.state.buildings[0]!;
    for (let i = 0; i < 3; i++) {
      s.state.enemies.push({
        id: 100 + i,
        type: 'brute',
        lane: 'west',
        waypoint: 1,
        pos: { x: tower.pos.x + 3 + i * 0.4, y: tower.pos.y },
        hp: 45,
        maxHp: 45,
        cooldown: 99,
        target: null,
      });
    }
    s.state.king.alive = false;
    s.state.king.respawnIn = 1000;
    const events = s.step();
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(3);
  });

  it('military buildings field their squad at night start', () => {
    const s = newSession();
    s.submit({ type: 'build', slot: 'slot-barracks', building: 'barracks' });
    s.submit({ type: 'startNight' });
    expect(s.state.units).toHaveLength(2);
    expect(s.state.units.every((u) => u.type === 'footman' && u.hp === 30)).toBe(true);
  });

  it('a dead king respawns at the spawn point after the respawn delay', () => {
    const s = newSession();
    emptyNight(s);
    s.state.spawnQueue = [{ at: 1000, lane: 'west', enemy: 'grunt' }]; // keep the night going
    s.state.king.hp = 0;
    s.state.king.pos = { x: 5, y: 5 };
    const events = s.step();
    expect(events).toContainEqual({ type: 'killed', target: { kind: 'king' } });
    expect(s.state.king.alive).toBe(false);
    stepUntil(s, () => s.state.king.alive);
    expect(s.state.nightTick).toBe(1 + 5 * TICK_RATE);
    expect(s.state.king.pos).toEqual(s.ctx.kingSpawn);
    expect(s.state.king.hp).toBe(s.state.king.maxHp);
  });
});

describe('phases', () => {
  it('pays income at dawn only for eco buildings that survived', () => {
    const s = newSession();
    s.state.gold = 100;
    s.submit({ type: 'build', slot: 'slot-house-1', building: 'house' }); // income 1
    s.submit({ type: 'build', slot: 'slot-farm', building: 'farm' }); // income 2
    const goldBefore = s.state.gold;
    emptyNight(s);
    s.state.buildings.find((b) => b.type === 'farm')!.hp = 0;
    const events = s.step();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'buildingDestroyed', slot: 'slot-farm' }),
    );
    expect(events).toContainEqual({ type: 'dawn', night: 1, income: 1 });
    expect(s.state.gold).toBe(goldBefore + 1);
    expect(s.state.history[0]).toMatchObject({ night: 1, income: 1, buildingsLost: 1 });
  });

  it('restores buildings, castle and units at dawn, then starts the next day', () => {
    const s = newSession();
    s.submit({ type: 'build', slot: 'slot-barracks', building: 'barracks' });
    emptyNight(s);
    s.state.castle.hp = 10;
    s.state.buildings[0]!.hp = 0;
    s.step();
    expect(s.state.phase).toBe('day');
    expect(s.state.day).toBe(2);
    expect(s.state.castle.hp).toBe(s.state.castle.maxHp);
    expect(s.state.buildings[0]).toMatchObject({ destroyed: false, hp: 40 });
    expect(s.state.units).toEqual([]);
  });

  it('loses when the castle falls', () => {
    const s = newSession();
    emptyNight(s);
    s.state.spawnQueue = [{ at: 1000, lane: 'west', enemy: 'grunt' }];
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
