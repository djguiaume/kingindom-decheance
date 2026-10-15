import type { IconId } from './icons.ts';

/**
 * Colour tokens shared by the Phaser view and the Vue HUD (ADR-005: defined once).
 * One colour per enemy archetype and per building class, for readability (ADR-004).
 */
export const colors = {
  background: 0x1b2130,
  ground: 0x243044,
  grass: 0x6fa857,
  night: 0x0b1a4a,
  /** Multiplied over painted buildings at night: moonlit blue, still readable. */
  nightArt: 0xb4c0dc,
  lane: 0xc9b47e,
  airLane: 0x5b4a7a,
  slot: 0x6b7d99,
  castle: 0xe8c547,
  king: 0xf4f4f4,
  unit: 0xffd27f,
  hpBar: 0x58d68d,
  hpBack: 0x000000,
  hit: 0xffffff,
  shot: 0xffe066,
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

/**
 * UI identity tokens, direction A "Linen and ink" (corpus 14 §2.1, chosen 2026-10-14).
 * Red is for enemies, gold for money, blue for night: nothing else uses those three. The panda
 * livery (F15) adds lacquer blue with gold trim for frames and the main button, bamboo and stone;
 * the livery blue is deeper than the night's and never fills a night element.
 * style.css mirrors these as CSS custom properties for the Vue HUD.
 */
export const ui = {
  linen: 0xf4efe4,
  linenDeep: 0xe7e0d1,
  ink: 0x24272c,
  muted: 0x6c6f72,
  gold: 0xc99a1e,
  enemy: 0xc4412f,
  night: 0x34507a,
  moss: 0x5d7a4c,
  livery: 0x2d4c93,
  liveryDeep: 0x1b2f63,
  trim: 0xe0b54a,
  bamboo: 0x7a9e45,
  stone: 0x8e918b,
} as const;

/** One glyph per enemy type, from the game's icon set (icons.ts), for the HUD, waves and pins. */
export const enemyIcons: Record<string, IconId> = {
  raider: 'axe',
  skirmisher: 'bow',
  brute: 'club',
  harpy: 'wing',
  catapult: 'boulder',
  warlord: 'helm',
};
export const enemyIcon = (id: string): IconId => enemyIcons[id] ?? 'skull';

/** One glyph per castle perk (perk cards, pause menu). Unknown perks fall back to the keep. */
export const perkIcons: Record<string, IconId> = {
  tithe: 'house',
  royal_archers: 'bow',
  commander: 'flag',
  fortress: 'wall',
  hero_king: 'crown',
  gamblers_oath: 'dice',
};
export const perkIcon = (id: string): IconId => perkIcons[id] ?? 'keep';
