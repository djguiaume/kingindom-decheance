/**
 * Colour tokens shared by the Phaser view and the Vue HUD (ADR-005: defined once).
 * One colour per enemy archetype and per building class, for readability (ADR-004).
 */
export const colors = {
  background: 0x1b2130,
  ground: 0x243044,
  lane: 0x3c4a63,
  airLane: 0x5b4a7a,
  slot: 0x6b7d99,
  castle: 0xe8c547,
  king: 0xf4f4f4,
  unit: 0xffd27f,
  hpBar: 0x58d68d,
  hpBack: 0x000000,
  hit: 0xffffff,
  text: 0xe6e9ef,
  buildings: {
    eco: 0x7cc576,
    tower: 0x6aa9ff,
    wall: 0xa7a7a7,
    military: 0xd98c5f,
  },
  enemies: {
    swarm: 0xe05656,
    tank: 0xb03a7f,
    siege: 0xe0873a,
    flyer: 0xb98cff,
    ranged: 0xe0c03a,
    fast: 0xff6f91,
    exploder: 0xff3b1f,
    boss: 0x8b0000,
  },
} as const;

export const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
