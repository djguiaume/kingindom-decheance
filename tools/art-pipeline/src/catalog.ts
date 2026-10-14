/**
 * The 105 logical assets of the approved Panda Kingdom v1.2 review sheet
 * (art/reference/panda-kingdom-v1.2.png), numbered exactly as on that sheet.
 *
 * This file is the source of art/manifest.json (`pnpm art manifest`). Each entry is generated
 * independently: one Scenario generation per frame. The sheet is a style reference only; no
 * pixel is ever taken from it.
 *
 * Where the sheet is ambiguous (numbers it skips or repeats) the entry carries `inferred`, and
 * the choice needs Guillaume's confirmation before that asset is generated.
 */
import type { AssetKind, Group } from './manifest.ts';

export interface CatalogEntry {
  num: number;
  id: string;
  name: string;
  group: Group;
  kind: AssetKind;
  /** Existing game content id this art is for, when there is one. */
  contentId?: string;
  /** What to paint, in plain words (goes into the prompt). */
  subject: string;
  /** One line per frame; a single-frame asset has none. */
  frames?: string[];
  /** Final canvas in px at 1 m = 64 px. */
  canvas: [number, number];
  /** Subject height in px on that canvas (characters, props); omitted = fit the canvas. */
  heightPx?: number;
  /** Things a human must check on the review sheet beyond the automatic validation. */
  checks?: string[];
  inferred?: string;
  /** Also generate the view from behind (walking up the screen). */
  back?: boolean;
  /**
   * Also generate these views. Gates: "side" when the wall runs up the screen (lane left-right),
   * "diag" for a diagonal wall; the default view is the wall running across the screen.
   */
  views?: ('side' | 'diag')[];
}

const walk4 = [
  'contact pose, left foot forward',
  'passing pose, body slightly raised',
  'contact pose, right foot forward',
  'passing pose, body slightly raised, opposite arm swing',
];
const run4 = [
  'gallop: all four legs gathered under the body',
  'gallop: front legs reaching forward',
  'gallop: all four legs extended, airborne',
  'gallop: hind legs pushing off',
];
const burst3 = ['start: small and bright', 'peak: largest and brightest', 'fade: breaking apart'];

const gateCheck =
  'The same gate in all three views (face-on, side, diagonal); the side and diagonal views are the gate turned, not a new design.';

const siegeCheck =
  'Mechanics: symmetric chassis, throwing arm centred on an axle between two supports; never side-mounted.';

export const CATALOG: CatalogEntry[] = [
  // 1. Kings (1-14). A: rolling panda king on foot. B: panda king riding a wolf.
  {
    num: 1,
    id: 'king_roll_idle',
    back: true,
    name: 'Rolling king: idle',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king on foot: older, stout, crown one size too big, deep blue cape with gold trim, dark armour, standing ready; hands in a grip pose without a weapon (the spear is a separate layer)',
    canvas: [192, 192],
    heightPx: 125,
  },
  {
    num: 2,
    id: 'king_roll_walk',
    back: true,
    name: 'Rolling king: walk',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject: 'the panda king on foot (same design as the idle pose), walking right, no weapon',
    frames: walk4,
    canvas: [192, 192],
    heightPx: 125,
  },
  {
    num: 3,
    id: 'king_roll_anticipate',
    name: 'Rolling king: anticipate',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king crouching and starting to curl into a ball before a rolling charge, cape wrapping around him',
    canvas: [192, 192],
    heightPx: 110,
  },
  {
    num: 4,
    id: 'king_roll_roll',
    name: 'Rolling king: roll',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king fully curled into a round ball wrapped in his blue and gold cape, rolling right like a spin dash; no motion trail (effects are separate)',
    frames: [
      'ball rotated 0 degrees',
      'ball rotated 90 degrees',
      'ball rotated 180 degrees',
      'ball rotated 270 degrees',
    ],
    canvas: [192, 192],
    heightPx: 96,
    checks: ['The four frames are the same ball turned in 90-degree steps.'],
  },
  {
    num: 5,
    id: 'king_roll_impact_fx',
    name: 'Rolling king: impact FX',
    group: 'kings',
    kind: 'effect',
    contentId: 'king',
    subject: 'a burst of dust and small stones thrown up where a rolling ball hits enemies',
    frames: burst3,
    canvas: [192, 128],
    inferred:
      'The sheet labels two items "5" (Uncurl and Impact FX); 5 is read as Impact FX, 6 as Uncurl.',
  },
  {
    num: 6,
    id: 'king_roll_uncurl',
    name: 'Rolling king: uncurl',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king springing out of his ball, arms open, cape flaring, landing in a heroic stance',
    frames: ['half uncurled, still round', 'standing up, cape flaring'],
    canvas: [192, 192],
    heightPx: 125,
  },
  {
    num: 7,
    id: 'king_wolf_idle',
    back: true,
    name: 'Wolf rider: idle',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king (crown, blue cape with gold trim) riding a large grey wolf with a real four-legged wolf anatomy, saddle and blue harness; rider hands in a grip pose without a weapon',
    canvas: [256, 256],
    heightPx: 150,
    checks: ['The wolf has four legs in a plausible stance.'],
  },
  {
    num: 8,
    id: 'king_wolf_walk',
    back: true,
    name: 'Wolf rider: walk',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject: 'the panda king riding the grey wolf, wolf walking right',
    frames: [
      'wolf walk: left front and right hind leg forward',
      'wolf walk: legs passing',
      'wolf walk: right front and left hind leg forward',
      'wolf walk: legs passing, opposite',
    ],
    canvas: [256, 256],
    heightPx: 150,
  },
  {
    num: 9,
    id: 'king_wolf_run',
    back: true,
    name: 'Wolf rider: run',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject: 'the panda king riding the grey wolf at full gallop to the right, cape streaming',
    frames: run4,
    canvas: [256, 256],
    heightPx: 140,
  },
  {
    num: 10,
    id: 'king_wolf_lunge',
    name: 'Wolf rider: lunge',
    group: 'kings',
    kind: 'character',
    contentId: 'king',
    subject:
      'the panda king (crown, blue cape with gold trim) riding the large grey wolf, firmly seated in the saddle, same rider and wolf as the wolf-rider idle pose; the wolf leaps forward in a lunge charge, jaws open, and the king leans in; rider hands in a grip pose without a weapon. The king is always on the wolf’s back, never missing',
    frames: ['crouched, about to spring', 'fully stretched mid-leap'],
    canvas: [320, 256],
    heightPx: 140,
    checks: ['The king rides the wolf in both frames.'],
  },
  {
    num: 11,
    id: 'king_wolf_impact_fx',
    name: 'Wolf rider: impact FX',
    group: 'kings',
    kind: 'effect',
    contentId: 'king',
    subject: 'a golden star-shaped impact flash with dust where the wolf lands its lunge',
    frames: burst3,
    canvas: [192, 160],
  },
  {
    num: 12,
    id: 'king_portrait',
    name: 'King portrait',
    group: 'kings',
    kind: 'portrait',
    contentId: 'king',
    subject:
      'head-and-shoulders portrait of the panda king facing the viewer, crown, blue cape collar with gold trim; for the HUD',
    canvas: [256, 256],
  },
  {
    num: 13,
    id: 'king_spear',
    name: 'King spear (weapon layer)',
    group: 'kings',
    kind: 'weapon',
    contentId: 'king',
    subject: 'the king’s royal spear: dark wooden shaft, steel leaf blade, small gold collar',
    canvas: [192, 48],
    inferred:
      'Not shown on the sheet (it shows 1-12). Read as the king’s independent weapon layer, shared by both modifiers.',
  },
  {
    num: 14,
    id: 'king_crown',
    name: 'King crown (layer)',
    group: 'kings',
    kind: 'weapon',
    contentId: 'king',
    subject: 'the king’s gold crown, one size too big, three points with blue gems',
    canvas: [64, 48],
    inferred:
      'Not shown on the sheet. Read as a separate crown layer so it can pop off and land during the roll and uncurl.',
  },

  // 2. Friendly units (15-26): body, then its independent weapon layer.
  ...unit(
    15,
    'footman',
    'Footman',
    'panda spearman: light blue armour, round blue shield with a white panda-face emblem on the off arm',
    'spear: wooden shaft, steel head',
    [192, 48],
    96,
  ),
  ...unit(
    17,
    'knight',
    'Knight',
    'panda knight: heavy steel armour, blue tabard with gold trim, plumed helmet, large kite shield with panda emblem',
    'longsword with gold crossguard',
    [160, 48],
    104,
  ),
  ...unit(
    19,
    'archer',
    'Archer',
    'panda archer: blue hood, leather armour, quiver on the back',
    'longbow, string taut, drawn vertical',
    [64, 160],
    92,
  ),
  ...unit(
    21,
    'crossbowman',
    'Crossbowman',
    'panda crossbowman: blue quilted coat, steel cap',
    'hand-held crossbow carried by one soldier: wooden stock, steel prod, bolt loaded; no wheels, no stand, no carriage, not a siege engine',
    [128, 64],
    94,
  ),
  ...unit(
    23,
    'guardian',
    'Guardian',
    'panda guardian: heavy blue and steel armour, tower shield almost as tall as him with a gold panda emblem',
    'short spear with a broad head',
    [160, 48],
    104,
    'Guardian is proposed content (not in the game yet).',
  ),
  ...unit(
    25,
    'monk',
    'Monk',
    'panda monk: wide conical straw hat, simple blue robe with gold sash, calm stance',
    'long wooden staff with gold rings at the top',
    [48, 192],
    98,
    'Monk is proposed content (not in the game yet).',
  ),

  // 3. Enemies (27-39).
  ...unit(
    27,
    'raider',
    'Raider',
    'small green goblin raider: red bandana, ragged leather, mean grin',
    'crude hand axe',
    [96, 64],
    80,
  ),
  ...unit(
    29,
    'skirmisher',
    'Skirmisher',
    'hooded goblin archer: dark hood with red trim, light leathers',
    'short recurved bow',
    [64, 128],
    84,
  ),
  ...unit(
    31,
    'brute',
    'Brute',
    'big hunched grey-green ogre brute: red war paint, fur loincloth, heavy shoulders',
    'huge spiked wooden club',
    [192, 96],
    150,
    undefined,
    [256, 256],
  ),
  {
    num: 33,
    id: 'harpy',
    back: true,
    name: 'Harpy',
    group: 'enemies',
    kind: 'flyer',
    contentId: 'harpy',
    subject:
      'dark purple harpy flying, wings spread, red crest, talons tucked, hands in a grip pose without a weapon',
    frames: ['wings up', 'wings level', 'wings down'],
    canvas: [192, 192],
    heightPx: 110,
  },
  {
    num: 34,
    id: 'harpy_weapon',
    name: 'Harpy weapon',
    group: 'enemies',
    kind: 'weapon',
    contentId: 'harpy',
    subject:
      'small crude double-headed axe with a dark bone handle and red rag wrapping; enemy gear, so no panda emblem, no blue and no gold',
    canvas: [96, 96],
    inferred: 'The sheet shows a double axe beside the harpy at 33-34; read as its weapon layer.',
  },
  {
    num: 35,
    id: 'catapult_chassis',
    name: 'Catapult chassis',
    group: 'enemies',
    kind: 'siege',
    contentId: 'catapult',
    subject:
      'goblin siege catapult chassis WITHOUT its throwing arm: symmetric rectangular wooden frame on four wheels, two upright A-frame supports on either side of the centre line holding a horizontal axle, crossbar stop, red rag flags; enemy gear, so no panda emblem, no blue and no gold; no operator',
    canvas: [256, 256],
    heightPx: 120,
    checks: [
      siegeCheck,
      'The axle hole is empty: the arm is the separate sprite 036.',
      'No panda emblem: enemy gear.',
    ],
  },
  {
    num: 36,
    id: 'catapult_arm',
    name: 'Catapult throwing arm',
    group: 'enemies',
    kind: 'siege',
    contentId: 'catapult',
    subject:
      'the throwing arm of a goblin catapult on its own: one straight rough timber beam bound with rope, an axle hub near the lower end and a wooden bucket cup holding a grey stone at the top end; enemy gear, so no panda emblem, no blue and no gold. Every frame shows the exact same beam, hub and cup; only the angle changes',
    frames: ['cocked: arm pulled back', 'released: arm vertical against the stop'],
    canvas: [128, 256],
    checks: [
      siegeCheck,
      'The hub lines up with the chassis axle; the pivot is the hub centre.',
      'Both frames show the same beam and cup.',
    ],
  },
  ...unit(
    37,
    'warlord',
    'Warlord',
    'big armoured goblin warlord (boss): red cape, horned helmet, spiked dark armour',
    'huge crude two-handed battle axe of dark iron with red rag wrapping; enemy gear, so no panda emblem, no blue and no gold',
    [192, 96],
    170,
    undefined,
    [256, 256],
  ),
  {
    num: 39,
    id: 'warlord_bodyguard',
    back: true,
    name: 'Warlord bodyguard',
    group: 'enemies',
    kind: 'character',
    contentId: 'warlord',
    subject:
      'goblin bodyguard: small green goblin in a red-trimmed helmet and leather armour holding a round red-and-black shield',
    canvas: [160, 160],
    heightPx: 82,
    inferred:
      'The sheet shows two small goblins under the warlord at 37-39; read as the warlord’s escort.',
  },

  // 5. Buildings (40-61). Buildings may carry contextual decorations, no ground plate.
  b(
    40,
    'castle_1',
    'Castle 1',
    'pagoda keep level 1: wood-and-stone keep, one blue tiled roof, panda banners',
    [512, 512],
  ),
  b(
    41,
    'castle_2',
    'Castle 2',
    'pagoda keep level 2: larger, stone walls, two blue roof tiers, gold ridge ornaments',
    [512, 512],
  ),
  b(
    42,
    'castle_3',
    'Castle 3',
    'grand three-tier pagoda castle: stone base, three blue tiled roof tiers, gold ornaments, many panda banners',
    [512, 512],
  ),
  b(43, 'house', 'House', 'thatched bamboo hut with a paper lantern and a chimney', [256, 256]),
  b(
    44,
    'manor',
    'Manor',
    'two-storey timber house with a blue tiled roof and a panda banner',
    [256, 256],
  ),
  b(
    45,
    'gold_mine',
    'Gold mine',
    'rocky mine entrance with a timber frame, rails and a cart of gold nuggets',
    [256, 256],
  ),
  b(46, 'tower', 'Tower', 'simple bamboo archer tower with a small blue roof', [192, 288]),
  b(
    47,
    'watchtower',
    'Watchtower',
    'tall watchtower: stone base, timber upper floor, blue pagoda roof, lantern',
    [224, 320],
  ),
  b(
    48,
    'ballista_tower',
    'Ballista tower',
    'stone and timber tower with a working ballista mounted on its top platform: two bow limbs, taut string, central rail with a loaded bolt',
    [256, 320],
    ['Ballista: two bow arms, a taut string, a central firing rail and a bolt.'],
    'The sheet shows two items labelled 48; this is the complete tower, 050 and 051 split it into layers.',
  ),
  b(
    49,
    'volley_tower',
    'Volley tower',
    'stone tower with several timber archer platforms at different heights and a blue roof',
    [256, 320],
  ),
  b(
    50,
    'ballista_tower_base',
    'Ballista tower base',
    'the same square wood-and-stone ballista tower as 048, standing on the ground, with an EMPTY flat top platform holding only a round pivot mount (no ballista on it); no wheels, not a cart or wagon',
    [256, 320],
    undefined,
    '50-51 are not on the sheet. Read as the ballista tower split into base and turret so the weapon can aim.',
  ),
  {
    num: 51,
    id: 'ballista_turret',
    name: 'Ballista turret',
    group: 'buildings',
    kind: 'weapon',
    contentId: 'ballista_tower',
    subject:
      'the ballista weapon head that sits on top of a tower, on its own, seen in the same 3/4 view: a big crossbow-like frame with two bow limbs, a taut string and a central rail with a bolt, on a small round turntable, pointing right; no wheels, no carriage, no throwing arm, no tower and nothing under it',
    canvas: [192, 128],
    checks: ['Ballista: two bow arms, a taut string, a central firing rail and a bolt.'],
    inferred: 'See 050.',
  },
  b(52, 'barracks', 'Barracks', 'training hall with spear racks and a blue roof', [320, 320]),
  b(
    53,
    'garrison',
    'Garrison',
    'fortified barracks: palisade, several blue banners, wooden melee training dummies in the yard, coherent blue roof',
    [320, 320],
    ['Melee training dummies are visible; there are NO archery targets.'],
  ),
  b(
    54,
    'knight_hall',
    'Knight hall',
    'stone hall with crossed swords over the door, shields on the walls, armour stands and a knight banner',
    [320, 320],
    ['Unmistakably a knight hall: crossed swords, shields, armoured practice equipment.'],
  ),
  b(
    55,
    'archery_range',
    'Archery range',
    'open roofed range with straw targets, bow racks and a shooting lane',
    [320, 320],
    ['Targets, bow racks and a shooting lane.'],
  ),
  b(
    56,
    'marksmen',
    'Marksmen',
    'upgraded range: raised shooting platforms, several targets at varied distances, longbow racks',
    [320, 320],
    ['More targets at varied distances than 055, plus platforms and bow racks.'],
  ),
  b(
    57,
    'crossbow_range',
    'Crossbow range',
    'range with a reinforced shooting platform, large targets and heavy crossbow racks',
    [320, 320],
    ['Large targets, reinforced platform, heavy crossbow racks.'],
  ),
  b(
    58,
    'guardian_lodge',
    'Guardian lodge',
    'lodge with oversized shields on the walls and a shield-training wall',
    [320, 320],
    ['Oversized shields and shield-training equipment.'],
    'Proposed content.',
  ),
  b(
    59,
    'guardian_bastion',
    'Guardian bastion',
    'upgraded fortified bastion with large shield racks and a pell for shield drills',
    [320, 320],
    ['Oversized shields and shield-training equipment.'],
    'Proposed content.',
  ),
  b(
    60,
    'monk_sanctuary',
    'Monk sanctuary',
    'small sanctuary with a pink blossom tree, staff racks and wooden staff-training posts',
    [320, 320],
    ['Distinct staff training elements.'],
    'Proposed content.',
  ),
  b(
    61,
    'monastery',
    'Monastery',
    'larger monastery with a two-tier blue roof, a bell and a staff-training courtyard',
    [320, 320],
    ['Distinct staff training elements.'],
    'Proposed content.',
  ),

  // 6. Walls and structures (62-72).
  s(
    62,
    'wall_post',
    'Wood post',
    'structure',
    'one bamboo palisade stake bound with blue rope',
    [64, 128],
    'wall',
  ),
  s(
    63,
    'stone_wall_post',
    'Stone post',
    'structure',
    'one stone wall block with a small blue roof-tile cap',
    [64, 128],
    'stone_wall',
  ),
  {
    num: 64,
    id: 'gate_wood',
    name: 'Wood gate',
    group: 'structures',
    kind: 'structure',
    contentId: 'wall',
    subject: 'bamboo palisade gate with two doors bound in blue rope',
    frames: ['closed', 'open'],
    canvas: [192, 192],
    views: ['side', 'diag'],
    checks: [gateCheck],
  },
  {
    num: 65,
    id: 'gate_stone',
    name: 'Stone gate',
    group: 'structures',
    kind: 'structure',
    contentId: 'stone_wall',
    subject: 'stone gate with a wooden double door and a small blue tiled roof',
    frames: ['closed', 'open'],
    canvas: [192, 192],
    views: ['side', 'diag'],
    checks: [gateCheck],
  },
  {
    num: 66,
    id: 'slot_empty',
    name: 'Empty slot',
    group: 'structures',
    kind: 'decal',
    subject: 'flat stone foundation outline on a patch of packed earth, where a building can go',
    canvas: [192, 96],
  },
  s(
    67,
    'construction',
    'Construction',
    'structure',
    'bamboo scaffolding with planks and rope',
    [256, 256],
  ),
  s(
    68,
    'ruin',
    'Ruin',
    'structure',
    'collapsed rubble with broken beams and a torn blue roof',
    [256, 192],
  ),
  s(
    69,
    'window_glow',
    'Window glow',
    'overlay',
    'a soft warm yellow glow on its own: a blurred rectangle of window light fading to transparent at the edges, for night; light only, no building, no wall, no window frame, no lantern',
    [96, 96],
  ),
  s(
    70,
    'lantern_glow',
    'Lantern glow',
    'overlay',
    'a soft warm orange round halo of light on its own, bright in the centre and fading to transparent at the edges, for night; light only, no lantern, no building, no object',
    [128, 128],
  ),
  s(
    71,
    'panda_banner',
    'Panda banner',
    'structure',
    'vertical blue banner with a white panda-face emblem on a wooden pole',
    [64, 160],
  ),
  s(
    72,
    'castle_flag',
    'Castle flag',
    'structure',
    'blue flag with a panda-face emblem waving on a tall pole',
    [96, 192],
  ),

  // 4. Projectiles and effects (73-85).
  fx(73, 'arrow', 'Arrow', 'projectile', 'arrow pointing right', [64, 16]),
  fx(74, 'bolt', 'Bolt', 'projectile', 'crossbow bolt pointing right', [48, 16]),
  fx(
    75,
    'ballista_bolt',
    'Ballista bolt',
    'projectile',
    'large ballista bolt pointing right',
    [96, 24],
  ),
  fx(
    76,
    'boulder',
    'Boulder',
    'projectile',
    'round grey catapult boulder bound with rough rope; enemy ammunition, so no panda emblem, no blue and no gold',
    [48, 48],
  ),
  fx(77, 'hit_spark', 'Hit spark', 'effect', 'golden star-shaped impact flash', [64, 64], burst3),
  fx(78, 'dust', 'Dust', 'effect', 'soft beige dust cloud', [128, 64], burst3),
  fx(
    79,
    'slash',
    'Slash',
    'effect',
    'a curved light-blue sword slash arc on its own: the swoosh of light only, no sword, no character, nobody making it',
    [96, 96],
    burst3,
  ),
  fx(
    80,
    'shield_fx',
    'Shield',
    'effect',
    'glowing light-blue shield crest with a gold rim',
    [96, 96],
  ),
  fx(81, 'coin', 'Coin', 'effect', 'gold coin with a panda face', [48, 48]),
  fx(82, 'heal', 'Heal', 'effect', 'green four-point sparkle', [64, 64], burst3),
  fx(
    83,
    'death',
    'Death',
    'effect',
    'small grey puff with a cartoon skull wisp',
    [96, 96],
    ['puff appears', 'skull wisp rises', 'wisp fades', 'last smoke'],
  ),
  fx(
    84,
    'charge',
    'Charge',
    'effect',
    'blue and violet speed streaks pointing right on their own: motion lines only, no character, no rider, no animal',
    [128, 64],
    burst3,
  ),
  fx(
    85,
    'stomp',
    'Stomp',
    'effect',
    'a ground stomp shockwave on its own: a low ring of flying dirt clods and a gold flash, no character, nobody stomping',
    [128, 96],
    burst3,
  ),

  // 7. Environment (86-100).
  p(86, 'bamboo_small', 'Bamboo S', 'small clump of bamboo', [96, 160], 120),
  p(87, 'bamboo_large', 'Bamboo L', 'large clump of tall bamboo', [192, 256], 220),
  p(88, 'bamboo_single', 'Bamboo 1', 'single bamboo stalk with leaves', [64, 224], 200),
  p(89, 'tree', 'Tree', 'rounded broadleaf tree', [256, 320], 280),
  p(90, 'pine', 'Pine', 'pine tree', [192, 288], 260),
  p(91, 'rock_small', 'Rock S', 'small grey rock', [96, 80], 50),
  p(92, 'rock_large', 'Rock L', 'large grey rock with moss', [192, 160], 120),
  p(93, 'grass', 'Grass', 'tuft of tall grass', [96, 80], 56),
  p(94, 'flowers', 'Flowers', 'small patch of pink and white flowers', [96, 64], 40),
  p(95, 'shrub', 'Shrub', 'round leafy shrub', [128, 96], 72),
  p(
    96,
    'lantern_post',
    'Lantern',
    'stone lantern post with a warm cream paper lantern',
    [64, 160],
    140,
  ),
  p(97, 'barrel', 'Barrel', 'wooden barrel with iron bands', [64, 80], 60),
  p(98, 'crate', 'Crate', 'wooden supply crate', [80, 80], 56),
  {
    num: 99,
    id: 'path_edge',
    name: 'Path edge',
    group: 'environment',
    kind: 'decal',
    subject: 'flat decal: soft edge where meadow grass meets a packed dirt path, seen from above',
    canvas: [128, 128],
  },
  {
    num: 100,
    id: 'water_edge',
    name: 'Water edge',
    group: 'environment',
    kind: 'decal',
    subject: 'flat decal: shallow blue water meeting rocky grass bank, seen from above',
    canvas: [192, 128],
  },

  // 8. Map and UI (101-105).
  {
    num: 101,
    id: 'ground_greyhollow',
    name: 'Greyhollow ground (map)',
    group: 'map',
    kind: 'background',
    subject:
      'top-down painted ground for the Greyhollow map: calm low-contrast meadow, packed dirt paths, richer vegetation only at the edges, no buildings or characters',
    canvas: [1536, 1024],
  },
  t(102, 'tile_grass', 'Grass tile', 'soft meadow grass'),
  t(103, 'tile_path', 'Path tile', 'packed dirt path'),
  t(104, 'tile_stone', 'Stone tile', 'worn stone paving'),
  {
    num: 105,
    id: 'map_background',
    name: 'Map background',
    group: 'map',
    kind: 'background',
    subject:
      'painted backdrop for the title and map screens: misty bamboo forest, distant blue mountains, a small torii-like gate, lanterns; no characters, no text',
    canvas: [1536, 1024],
  },
];

function unit(
  num: number,
  contentId: string,
  name: string,
  body: string,
  weapon: string,
  weaponCanvas: [number, number],
  heightPx: number,
  inferred?: string,
  canvas: [number, number] = [160, 160],
): CatalogEntry[] {
  const group: Group = num < 27 ? 'friendly' : 'enemies';
  return [
    {
      num,
      id: contentId,
      name,
      group,
      kind: 'character',
      back: true,
      contentId,
      subject: `${body}; hands in a grip pose without a weapon (the weapon is a separate layer)`,
      canvas,
      heightPx,
      ...(inferred ? { inferred } : {}),
    },
    {
      num: num + 1,
      id: `${contentId}_weapon`,
      name: `${name} weapon`,
      group,
      kind: 'weapon',
      contentId,
      subject: weapon,
      canvas: weaponCanvas,
      ...(inferred ? { inferred } : {}),
    },
  ];
}

function b(
  num: number,
  id: string,
  name: string,
  subject: string,
  canvas: [number, number],
  checks?: string[],
  inferred?: string,
): CatalogEntry {
  const known = [
    'house',
    'manor',
    'gold_mine',
    'tower',
    'watchtower',
    'ballista_tower',
    'volley_tower',
    'barracks',
    'garrison',
    'knight_hall',
    'archery_range',
    'marksmen',
    'crossbow_range',
  ];
  const contentId = id.startsWith('castle_')
    ? 'castle'
    : id === 'ballista_tower_base'
      ? 'ballista_tower'
      : known.includes(id)
        ? id
        : undefined;
  return {
    num,
    id,
    name,
    group: 'buildings',
    kind: 'building',
    ...(contentId ? { contentId } : {}),
    subject,
    canvas,
    ...(checks ? { checks } : {}),
    ...(inferred ? { inferred } : {}),
  };
}

function s(
  num: number,
  id: string,
  name: string,
  kind: AssetKind,
  subject: string,
  canvas: [number, number],
  contentId?: string,
): CatalogEntry {
  return {
    num,
    id,
    name,
    group: 'structures',
    kind,
    subject,
    canvas,
    ...(contentId ? { contentId } : {}),
  };
}

function fx(
  num: number,
  id: string,
  name: string,
  kind: AssetKind,
  subject: string,
  canvas: [number, number],
  frames?: string[],
): CatalogEntry {
  return { num, id, name, group: 'effects', kind, subject, canvas, ...(frames ? { frames } : {}) };
}

function p(
  num: number,
  id: string,
  name: string,
  subject: string,
  canvas: [number, number],
  heightPx: number,
): CatalogEntry {
  return { num, id, name, group: 'environment', kind: 'prop', subject, canvas, heightPx };
}

function t(num: number, id: string, name: string, subject: string): CatalogEntry {
  return {
    num,
    id,
    name,
    group: 'map',
    kind: 'tile',
    subject: `seamless square ground tile: ${subject}, calm and low contrast, no props`,
    canvas: [512, 512],
  };
}
