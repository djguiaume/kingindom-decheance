import { describe, expect, it } from 'vitest';
import { loadContent, type RawContent } from '../src/index.ts';
import { prototypeContent, prototypeRaw } from '../src/prototype.ts';

/** Deep copy of the placeholder files, to break one thing at a time. */
const raw = (): RawContent => JSON.parse(JSON.stringify(prototypeRaw)) as RawContent;
// Loose accessors for poking at untyped JSON in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const errorsOf = (content: RawContent) => {
  const result = loadContent(content);
  return result.ok ? [] : result.errors;
};

describe('prototype content', () => {
  it('passes shape and semantic validation', () => {
    expect(errorsOf(raw())).toEqual([]);
    expect(prototypeContent.maps.map((m) => m.id)).toEqual(['greyhollow']);
  });

  it('has a stable hash that changes when content changes', () => {
    const again = loadContent(raw());
    expect(again.ok && again.bundle.hash).toBe(prototypeContent.hash);
    const changed = raw();
    (changed.buildings as Any).buildings[0].cost += 1;
    const result = loadContent(changed);
    expect(result.ok && result.bundle.hash).not.toBe(prototypeContent.hash);
  });

  it('applies schema defaults', () => {
    const wall = prototypeContent.buildings.find((b) => b.id === 'stone_wall')!;
    expect(wall.income).toBe(0);
    expect(wall.upgrades).toEqual([]);
    const raider = prototypeContent.enemies.find((e) => e.id === 'raider')!;
    expect(raider.aggroRange).toBe(3);
    expect(raider.leash).toBe(5);
    expect(raider.attack.maxTargets).toBe(1);
  });
});

describe('shape validation', () => {
  it('reports the precise path of a bad field', () => {
    const c = raw();
    (c.enemies as Any).enemies[0].hp = -1;
    expect(errorsOf(c)).toContainEqual(
      expect.objectContaining({ file: 'enemies.json', path: 'enemies.0.hp' }),
    );
  });

  it('rejects an unknown schema version', () => {
    const c = raw();
    (c.units as Any).schemaVersion = 99;
    expect(errorsOf(c)[0]).toMatchObject({ file: 'units.json', path: 'schemaVersion' });
  });
});

describe('semantic validation', () => {
  const map = (c: RawContent): Any => c.maps[0];

  it('catches a slot offering an unknown building', () => {
    const c = raw();
    map(c)
      .nodes.find((n: Any) => n.slot)
      .slot.options.push('castle-of-glass');
    expect(errorsOf(c)).toContainEqual(
      expect.objectContaining({ message: 'unknown building "castle-of-glass"' }),
    );
  });

  it('catches a lane that does not end at the castle', () => {
    const c = raw();
    map(c).lanes[0].path.pop();
    expect(errorsOf(c).map((e) => e.message)).toContain(
      'a ground lane must end at the castle node',
    );
  });

  it('catches a cyclic upgrade graph', () => {
    const c = raw();
    const ballista = (c.buildings as Any).buildings.find((b: Any) => b.id === 'ballista_tower');
    ballista.upgrades = [{ to: 'tower', cost: 25 }];
    expect(errorsOf(c).some((e) => e.message.includes('cycle'))).toBe(true);
  });

  it('catches a flyer on a ground lane', () => {
    const c = raw();
    map(c).waves[0].groups[0].enemy = 'harpy';
    expect(errorsOf(c).map((e) => e.message)).toContain('flying enemy on a ground lane');
  });

  it('catches a night without a wave', () => {
    const c = raw();
    map(c).nights = 7;
    expect(errorsOf(c).map((e) => e.message)).toContain('no wave for night 7');
  });

  it('catches duplicate ids and unknown enemies', () => {
    const c = raw();
    (c.buildings as Any).buildings.push({ ...(c.buildings as Any).buildings[0] });
    map(c).waves[0].groups[0].enemy = 'dragon';
    const messages = errorsOf(c).map((e) => e.message);
    expect(messages).toContain('duplicate id "house"');
    expect(messages).toContain('unknown enemy');
  });

  it('catches an upgrade edge whose cost differs from the target building', () => {
    const c = raw();
    (c.buildings as Any).buildings.find((b: Any) => b.id === 'manor').cost = 99;
    expect(errorsOf(c).map((e) => e.message)).toContain(
      'upgrade cost 20 differs from "manor" cost 99',
    );
  });

  it('catches unknown rally gates and nodes outside the map', () => {
    const c = raw();
    const b1 = map(c).nodes.find((n: Any) => n.id === 'b1');
    b1.slot.rally.push('gate_nowhere');
    map(c).nodes[0].pos = [99, 0];
    const messages = errorsOf(c).map((e) => e.message);
    expect(messages).toContain('unknown node "gate_nowhere"');
    expect(messages).toContain('node is outside the map');
  });

  it('accepts an air lane with only a spawn node', () => {
    expect(prototypeContent.maps[0]!.lanes.find((l) => l.air)!.path).toEqual(['sp_air']);
  });
});
