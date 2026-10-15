# Implementation notes

Choices made while building the skeleton, answering the open questions at the end of
ADR-010. Significant ones can be promoted to ADRs in the design corpus.

## Active implementation plans

The [2026-10-14 panda playtest remediation strategy](plans/2026-10-14-playtest-remediation.md)
tracks the 21 findings from the latest main-branch playtest, their implementation order and
acceptance criteria. It is planned work; the notes below describe implemented behavior.

## Panda playtest integration fixes (2026-10-14)

First remediation batch; existing assets only, view-only changes with no new art generation or
simulation/content changes:

- Night combat uses a compact toolbar. A ResizeObserver measures treasury, night track, boss
  HP, pause and sound; the Phaser canvas starts below them and refreshes its size when the
  inset changes. Camera projection includes that offset so edge markers still point correctly;
  enemies clipped above the battlefield receive an off-screen marker. Day/restart restores
  the full canvas. Night messages sit near the bottom instead of expanding the top toolbar.
- The on-foot king's four walk frames use a 2.8 m stride (about 10 frame advances/s at the
  current 7 m/s), independently of movement stats. Feet settle by elapsed time rather than
  one increment per rendered frame.
- Actual dash state selects anticipation, rolling and uncurl assets. The spear and normal
  walk bob are hidden during these poses. The initial anticipation is visual only and never
  postpones the dash. Death/restart clears action state; pause freezes the animation clock.
- Attacks retain their target facing during the longer 300 ms visual swing/recoil; ranged
  attackers face the projectile destination at release. Spear thrust and bow/crossbow recoil
  are stronger. Projectile impacts do not replay the release animation.
- Empty foundations are drawn dynamically only at unoccupied slots. Buildings and ruins carry
  their own footing; repair and restart need no static-image cleanup.
- Shot art is selected by source: arrows for archers/goblin archers/ordinary towers/castle,
  bolts for crossbowmen, heavy bolts for ballistas, boulders for catapults. Friendly in-flight
  shots use art with a pale blue tint. Existing instant tower shot effects remain view-only;
  their damage/flight semantics are unchanged.

The tutorial remains in the remediation plan. Attack quality still needs playtest feedback;
these rig improvements do not constitute new attack sequences or pre-hit gameplay telegraphs.

## Selectable kings and abilities (2026-10-15)

- The validated king catalog contains stable `roll` and `wolf` IDs. The home screen selects and
  remembers one independently of the mutator/perk setup; old configs and direct Play default to
  `roll`. Restart keeps the run's resolved king.
- The run weapon owns the automatic normal attack. The selected king owns the manual active
  ability and its HUD label: Royal Roll damages every touched enemy, while Hunting Lunge travels
  farther, deals focused damage and stops on its first target.
- Runtime rendering reads idle, walk and ability sequences from the selected king's content.
  Existing wolf-rider art includes the rider's grip, so it does not draw the on-foot spear layer.
- `kingId` is stored in game state, normalized into replay/simulator configs and written to new
  profile run records. Existing profile entries remain valid without the optional field.
- Modifier rebuilding starts from the selected king rather than a global default. Starting perks
  that touch the ability use `king.ability.*` (Light Cavalry).

## Panda gates and ground anchors (2026-10-14)

Existing-asset batch 2, view-only:

- `game/groundRigs.ts` records building/ruin ground centres and gate hinge points on the
  untrimmed masters. Building footprints now centre on their slot, rather than placing the
  canvas's generic 90% pivot at the slot. Roof HP bars follow the same anchor.
- Gates fit the core's projected 2.2 m passage. Their ground plane stretches/shears to the
  lane direction while posts remain upright; `Painter.projectedImage` pools a parent container
  and image, decomposing the affine matrix into normal Phaser rotation/scale transforms.
- Side and diagonal gate perspectives both mirror when required. The same source hinge
  calibration is used for open/closed frames, and reversing lane direction cannot change
  placement. Near-vertical custom-map gates use a small depth projection so the side painting
  remains visible while both hinge endpoints still match the exact passage. Tests cover all 360
  degrees of presentation and 24 rotated paths with actual king, footman and enemy movement.
- Second-playtest follow-up: the upright axis is enlarged 1.5× so the complete structure reads
  as a fortification while its 2.2 m passage stays unchanged. Each rig records the occupied
  closed/open art heights; open frames are normalized around the fixed hinges so toggling the
  leaves does not make the gate appear to shrink.
- No PNG masters, runtime atlas files, collision dimensions, content or balance changed.

## PRNG

sfc32 (four 32-bit integers of state), seeded through splitmix32 and warmed up 12 rounds.
The state is the `rng` array inside `GameState`, so snapshots and save files include it.
A pinned test (`packages/core/test/rng.test.ts`) makes any change to the algorithm deliberate,
because it changes every replay.

## Cross-engine determinism

The core only uses `+ - * /` and `Math.sqrt`, which IEEE 754 specifies exactly, so results
should match across browsers too. Trigonometry, `exp`, `pow` and `hypot` are banned in the core
by lint. This goes a little beyond ADR-002, which accepted single-engine exactness, at no cost.

## Pinned versions

TypeScript 6.0 (7.x not yet supported by typescript-eslint), Vue 3.5, Vite 8, Phaser 4.2,
Pinia 4, Vue Router 5, Zod 4, Vitest 5, fast-check 4, Playwright 1.64, Node 22, pnpm 10.

## Rules the core applies on top of content

These follow the approved map defaults (fixed slots, predefined lanes with simple local
steering, hand-made maps) and the prototype design (corpus 11), and are easy to revisit:

- Ground enemies keep their content priority order; a wall standing on their next waypoint
  stops them, and they attack it when nothing in their priority list is in reach. The wall
  acts as a gate line across the lane (through the wall, square to the lane): enemies stay on
  their side of it and ignore anything beyond it, so they cannot walk around a wall to chase
  the king or hit a tower behind it. Flyers never
  target walls and ignore lanes (the air lane is a single spawn node).
- Every enemy will attack the castle when it reaches it, even if its priority list omits it.
- Enemies leave their lane for targets within `aggroRange`, but only up to `leash` metres from
  the lane, then walk back.
- Units guard a post at their barracks' rally gate (`guardRadius`, `leash`). The player cycles
  the gate during the day.
- The king attacks automatically with the run's weapon (multi-target arc for the spear). The
  selected king owns the manual active ability. Weapon, king and map are chosen per run
  (`prototypeRun`), so starters and bonuses can swap them later.
- Overlapping enemies and units push each other apart (separation), computed order-independently.
- Dawn restores every building, the castle and the king; units are re-fielded each night.
  Income is the castle's plus each eco building that survived.

## Deviations from design 11 §10

- The core command is `ability` rather than `charge`, so it stays weapon-agnostic.
- Pause is a view concern (the runtime stops ticking), not a core command, so it never enters a
  replay.
- "The king must stand near a slot to buy" is enforced by the input layer (build reach from
  `king.json`), not by the core. Bots can buy anywhere.
- At a barracks, E (or the Guard card) cycles the rally gate and R (or the card) upgrades.
- Zoom is double tap or wheel; pinch zoom is not built.
- Phone smoke tests use a Pixel preset on Chromium; an iPhone/WebKit run is not in CI yet.

## Prototype additions (approved 2026-10-13)

- **Catapult** (siege): out-ranges towers; it is still stopped by a wall but lobs over it at
  targets behind (the only enemy that ignores the wall gate for targeting).
- **Warlord** (boss, night 6): Stomp hits every footman and the king within 3 m, then waits
  10 s; it fires only when someone is in reach. Counter bonuses against tanks apply to it.
  A boss bar shows at the top while it lives. Night 6 swaps the west brutes for the warlord
  (with them, the balanced bot won under a third of runs).
- **Rally (night)**: F or the Rally button. Footmen within 6 m of the king follow him; pressing
  again drops them where he stands. If the king falls, followers stay where they are. Extended
  after the second playtest (flags, see below).
- **Edge arrows** (view-only, `apps/game/src/game/indicators.ts`): tonight's spawns by day;
  by night the castle and buildings hit in the last 2 s, the boss, then the largest enemy
  groups; at most 6. They keep out of the joystick corner and the button column. On-screen
  spawns glow by day.
- **Waves panel**: Tab or the night track (trimmed after the second playtest, see below).
- Not built: the finale drums (there is no audio yet); tapping an arrow does nothing.

## Second playtest fixes (2026-10-14)

- **Building info**: every buy button shows what the building is for (`description` in
  `buildings.json`) and its numbers; an upgrade shows only what changes
  ("Damage 8 → 12/s · Range 7 → 8.5"). The title above the buttons lists the current
  building's numbers. Logic in `apps/game/src/game/buildingInfo.ts`.
- **Dodgeable enemy shots**: an attack with `projectile: { speed }` no longer hits at once. It
  fires a shot at the spot where its target stands; the shot lands after its flight time and
  hits only if the target's edge is still within 0.2 m of that spot (`PROJECTILE_SLACK`).
  Archers (8 m/s since playtest 3) and catapults (7 m/s, lobbed, with a landing shadow) use it; towers, the
  king and footmen still hit at once. Shots in flight live in `GameState.projectiles`
  (state schema 2) and vanish at dawn.
- **Rally and flags**: each barracks has a flag where its squad stands guard (its gate, or
  where the king planted it). By day, F / the flag button at a barracks takes its flag and
  pressing again elsewhere plants it. A flag still carried at nightfall makes the squad start
  the night following the king. By night, Rally at a barracks calls that whole squad from
  anywhere, plus every footman within 6 m; dropping them also moves their flag there for the
  next nights. Choosing a gate (E) takes the flag back to that gate.
- **Top bar**: a night track (one pip per night, boss night marked, enemies left by night)
  replaces the day and "Tonight" chips; tapping it or Tab opens the waves panel. A card at
  dawn shows the night survived, its gold and enemies beaten.
- **Waves panel**: tonight and the next night by default, every night behind "All nights";
  no longer in the pause menu.
- **Edge markers**: one red pin per marker, with the enemy icons (as white silhouettes) and
  counts inside, like Thronefall; castle, building and boss markers keep their own icons.
- **Walls like Thronefall**: a wall is a 9 m line across its lane, square to the lane, with a
  2.2 m gate in the middle (`packages/core/src/systems/walls.ts`). Enemies are held behind the
  whole line, as before. The king and footmen are stopped by the two wings and walk through the
  gate; footmen (and the bots' king) steer to the gate when a wing is in the way. The gate is
  drawn open while the king or a footman is near it. Enemies never open it.
- New sim events for effects and sound: `fired` and `missed` (enemy shots), `flagTaken` and
  `flagPlanted`; `hit` carries `projectile: true` when a shot landed.
- Balance after dodgeable shots and walls (`pnpm sim`, 200 seeds): balanced ~95%, defensive ~76%,
  king-only falls night 5, greedy falls night 3. The bots' king never stands still, so it
  dodges more than a player will. The `defensive-loss` golden moved to seed 6 (seed 4 now
  wins).

## Playtest 3 fixes (2026-10-14)

- **Messages clear themselves**: a refused command ("Charge isn't ready") shows for 1.5 s
  (`MESSAGE_MS` in `input/hub.ts`) instead of staying until the next command.
- **Edge pins stay on the edge**: a pin is placed by its whole box, not its centre, so a wide
  pill never pokes off screen. When it would cover the joystick or the buttons it slides along
  its own edge, never inwards. Group markers keep a stable key (lane and rank along the lane),
  and every pin eases toward its new spot, so they no longer jump.
- **Pins on a short phone screen** (follow-up): pins sat 40 px in from every edge plus a 52 px
  top bar, which on a phone in landscape (about 330 px tall) put them near the middle. They now
  hug the edge (6 px inside the safe area) and keep clear of the HUD by measuring its panels and
  buttons (`.hud .panel`, `.hud button`, every 250 ms) instead of fixed zones: a pin slides along
  its edge to the nearest free spot, and steps just past a panel only when the whole edge is
  blocked there. There is no joystick zone: the stick floats anywhere on the left, and a fixed
  zone only pushed left-edge pins off the edge (playtest, 2026-10-14). A spawn pin
  stands over an on-screen spawn only when it fits there; a spawn just on screen at an edge
  keeps an ordinary edge pin, so left-edge spawns look like the other edges.
- **Spawn pin while the spawn is on screen**: by day the pin stands over the spawn, pointing
  down, so the king can walk there and still read what is coming.
- **Readable attacks**: melee hits draw a short slash on the target instead of a white line
  from the attacker (those looked like shots). Enemy arrows are thick dark shafts with a white
  head and a ground shadow, and fly at 8 m/s (was 12), so there is time to step aside.
- Balance (`pnpm sim`, 200 seeds): balanced ~95%, defensive ~80%. The `defensive-loss` golden
  moved to seed 5.

## Stage A2, castle upgrades (2026-10-14, corpus 13 §1)

- **Castle levels**: `packages/content/data/castle.json` lists levels 2 and 3 (cost, HP, shot)
  and the perks. The map's castle is level 1. New day command
  `chooseCastleLevel { level, perk }`: gold only, no night requirement; the pick is logged, so
  replays stay exact. State gains `castleLevel` and `perks` (state schema 3).
- **Tiers**: every building has a `castleLevel` (default 1). Manor, watchtower, stone wall and
  garrison need level 2; ballista and volley towers level 3. `buyOptions` still lists a locked
  option, with `needsCastle`, so the HUD can show it greyed ("Needs castle level 2").
- **Perks are data**: a perk is a list of modifiers `{ stat, op, value, nights? }`
  (`packages/core/src/modifiers.ts`), e.g. `building.class:wall.hp × 1.4` or
  `rules.rallyReach × 2`. The context's stats are rebuilt from the content, the castle level
  and the perks whenever one of them (or the night) changes (`syncContext`), so the rules read
  plain numbers and never check a perk id. A stat path that reaches no number stops the run
  from starting. Rules that are not a stat (rally reach, damage of soldiers with the king, score
  multiplier) live in `ctx.rules`.
- **HUD**: standing at the castle by day shows its card (what the next level changes and
  unlocks); holding it opens the perk picker (three cards; tap or 1-3 / arrows to select, hold
  Choose or E, Esc backs out). The treasury shows the castle's level next to its bar; the pause
  menu lists the perks taken. The castle is drawn bigger at each level: outer towers and
  banners at level 2, a keep and gold roofs at level 3.
- **Ready for XP and unlocks** (13 §6.4): weapons and perks accept an optional `unlock` field;
  `apps/game/src/progression.ts` holds the versioned profile and `isUnlocked` / `awardRun`,
  which keep everything open and award no XP for now.
- **Bots** buy level 2 from day 2 and level 3 from day 4 and take the first perk of each level;
  `pnpm sim --policy balanced --perks 1,2` picks others (indexes per level).
- **Retune**: nights 4-6 have 15% more raiders and skirmishers. Results (200 seeds): balanced
  100% with Tithe or Royal Archers, 80% with Commander (the bots never rally, so for them it does
  nothing), 64% with Gambler's Oath (enemies +20% HP on nights 5-6; its score bonus waits for the
  score); defensive 45% (no eco no longer wins), king-only falls night 5, greedy night 3.

## Character animation (2026-10-14, corpus 11 §12.0)

Light, code-driven and view-only (`apps/game/src/game/animation.ts`); the core, replays and
balance are untouched.

- Walk bob: actors hop once per 0.9 m walked, so faster walkers bob faster; standing still
  settles the feet down. The king's horse bobs less, the catapult only rattles, the harpy flaps.
- Facing: actors turn toward where they walk and toward the one they strike.
- Weapon swing: footmen carry a sword, raiders and the Warlord an axe, brutes a club,
  skirmishers a bow they draw; the king levels his spear into a thrust; the catapult throws its
  arm. A melee blow swings on its `hit` event, a shot on its `fired` event.
- Hit flash: anything hit, buildings included, washes white for 0.12 s (any sprite, no extra
  drawers: the flash re-draws it with every colour replaced by white).
- Death fall: a dead footman or enemy tips over backwards where it died, then fades (0.6 s).

## Stage A2, new units (2026-10-14, corpus 11 §12.2)

- **Barracks branches** (castle level 2, exclusive): Garrison (5 footmen) or Knight hall
  (3 knights: 150 HP, 12 dmg / 1.2 s, speed 3, `armor` 0.3 so they take 30% less damage).
  `armor` is a new unit field applied wherever a unit is hit.
- **Archery range** (45 gold, first tier): 3 archers (40 HP, 7 dmg / 1.2 s, range 6, hit flyers;
  arrows are projectiles). Branches (castle level 2, exclusive): Marksmen (5 archers) or
  Crossbow range (3 crossbowmen: 18 dmg / 2 s, range 7.5, ×1.5 vs brutes and the Warlord).
  Archers never come from the barracks line. Squads answer Rally and flags like footmen.
- **Map**: two archery range plots on Greyhollow, one behind each side gate (`r_w`, `r_e`).
- **View**: friendly arrows are pale so they never read as shots to dodge; long building names
  wrap on the buy card.
- **Bots**: balanced now buys one soldiers' building a day from day 2; `--branches` makes
  balanced or defensive prefer an upgrade branch (e.g. `knight_hall,crossbow_range`).
- **Retune**: night 6 raiders and skirmishers +15%. Results (200 seeds): balanced 93.5% (Tithe
  and Fortress), 99% with Hero King, 76% with Royal Archers, 40% with Commander (bots never
  rally), 16% with Gambler's Oath; defensive 20%, greedy falls night 3, king-only night 5. The
  bots rarely have gold left for the branch upgrades, so Knight hall and Crossbow range are not
  measured by them yet.

## Stage A, score (2026-10-14, corpus 13 §2)

- `scoreOf(state, ctx)` in core (`score.ts`): 150 per night held, minus 25 per building lost
  that night (a night never goes below 0), plus 5 per gold left on a win, then the run's
  multiplier (Gambler's Oath today, mutators later; floor ×0.5) on a win only. The night the
  castle fell earns nothing. Computed from state, so bots and players get the same number.
- **Sim**: every run summary carries `score`; the CLI prints the mean (balanced, 50 runs: 853).
- **Profile**: best score per map (`records`) and the last 10 runs (`recent`), on the device.
- **End screen**: a score sheet under the result (nights, losses, gold, bonus, total) and the
  map best, with "New best!" when beaten.

## Stage A, mutators (2026-10-15, corpus 13 §3)

- `mutators.json`: seven mutators, each `{ scoreBonus, modifiers, closesClasses }`. `RunConfig`
  takes `mutatorIds`; the context folds them into the content before castle perks, and their
  bonuses are added to `rules.scoreMultiplier` (so Gambler's Oath multiplies the sum).
- New rules: `waveSize` (Swarm, wave group sizes rounded, nights 1–2 via the `nights` filter)
  and `incomeRate` (Lean Years, all dawn income). `rulesOn(ctx, night)` gives another night's
  rules for the waves panel. No Walls closes wall slots: `buyOptions` drops them and
  `slotClosed` hides the plot.
- **Setup screen**: "Customise run" on the title screen opens the mutator cards and the score
  multiplier; Start run saves the choice in the profile (`lastSetup`) and Play reuses it, so a
  first launch is still a quick start. Finished runs record their mutators.
- **Sim**: `--mutators a,b`. Balanced bot, 100 runs each (none 95%): Swarm 91%, Ironhide 0%,
  Lean Years 7%, Swift Foe 40%, No Walls 80%, Glass Crown 8%, Mercy 100%. The bonuses are still
  the design's guesses; repricing (bonus ≈ win-rate drop) belongs to the end-of-stage balancing
  pass.

## Stage A, starting perks (2026-10-15, corpus 13 §4)

- `perks.json`: nine starting perks (same `Perk` shape as castle perks, plus a `family`).
  `RunConfig.perkIds` takes up to `STARTING_PERK_SLOTS` (3); they apply after the mutators and
  before the castle perks. Ids are unique across castle and starting perks.
- New perk field `grantsAttack { buildings, attack }` gives buildings without an attack one
  (Scarecrows arms houses and mines against flyers); new rule `startingGold` (Early Start).
- **Setup screen**: the sheet now has two tabs, Perks (n/3, the rest lock once full) and
  Mutators. On phones Start run sits on the title line so both tabs fit one screen.
- **Sim**: `--starting a,b,c`. Balanced bot, 100 runs each (none 95%): Gold Rush 95%, Royal
  Mint 77%, Early Start 94%, Stonemasons 62%, Eagle Eyes 81%, Scarecrows 94%, Drill Sergeant
  94%, Veterans 95%, Light Cavalry 87%. No perk lifts the bot above its 95% ceiling, so their
  upside needs a harder baseline (a mutator) in the end-of-stage balancing pass.

## Balance (first playtest, 2026-10-13)

Gold felt scarce in play while the simulator found the game easy (the king alone reached
night 6). Both were tuned together: more gold (start 75, castle 25 a dawn, house 10, manor 20,
mine 25) and stronger waves (+30% enemy HP and +30% enemies per group). Targets, checked with
`pnpm sim` over many seeds:

| Bot         | What it does                                     | Result        |
| ----------- | ------------------------------------------------ | ------------- |
| `idle`      | nothing                                          | falls night 3 |
| `king-only` | no buildings, king fights                        | falls night 5 |
| `greedy`    | fills slots in map order, idle king              | falls night 3 |
| `defensive` | towers, walls, barracks first, no early eco      | wins ~80%     |
| `balanced`  | half its gold into eco on days 1–3, then defends | wins ~90%     |

So investing in eco pays off, and building nothing loses. Bots are a rough guide: real play
decides the final numbers.

## Sound (placeholder)

`apps/game/src/audio/` is a view-only layer: it listens to the core's events (ADR-004) and never
changes the state. Every sound is synthesized by Web Audio from a short recipe, so no audio files
ship yet. Callers only name a sound id (`SOUNDS` in `sounds.ts`); the final audio pass swaps a
recipe for `{ url: 'sfx/….ogg' }` and nothing else changes. Music is three synthesized loops
(`day`, `night`, `finale` on the last night) behind `TrackId`s, swappable the same way.

- Audio unlocks on the first tap or key press (browsers, iOS above all, require a gesture).
- Sounds far from the king play quieter; each sound has a minimum gap and at most 14 play at once.
- The Charge has no event of its own, so the layer watches the king's dash start.
- Sound on/off: the top-right button or M, remembered on the device.

## Painted terrain and paths (2026-10-15)

- Standalone runtime textures load alongside atlases. Grass tiles cover any validated map size;
  path and water textures are clipped to the map's lane and terrain polylines with rounded joins.
  No route, collision or balance data changes during the art pass.
- Path rendering accepts every segment angle and both directions. Water keeps a narrow stone
  bank at its actual blocker boundary. Bridges select the nearest front/diagonal/side painting
  from their endpoints and scale to the declared span.
- Cliffs (`game/cliffs.ts`, F22) are raised from each declared cliff line, for any map: a grass
  top covering exactly the strip the core blocks, and a rock face, built from `cliff_section`'s
  painted lip and rock, dropping 2.2 m wherever the edge faces the camera. Bends, rings and round
  ends follow the line in every direction. The relief is painted once, then cut across the line
  into pieces of at most 1.5 m, packed in one texture, that join the ground-y depth sort; the king
  sees through a piece he walks behind. The contact shadow is baked into the ground canvas.
- Tall scenery uses atlas pivots and joins actors/buildings in ground-y depth sorting, so a king
  can walk in front of or behind a tree. Ground-level grass, flowers, rocks and supplies stay in the
  static layer to avoid needless per-frame work.
- Corrected `grass_patch` art is selected directly from the environment atlas; the procedural
  patch remains only as a missing-art fallback. `cliff_end` is not needed by the continuous
  geometry-driven cliff renderer: cliff ends are rounded like the blocked capsule.
- F09 audit (2026-10-15): every Greyhollow blocker is natural (cliff or water) and now drawn over
  exactly the ground it blocks; the man-made barriers are the buyable walls in the three passes,
  which already have wall art and gates. No collision or balance data changed.

## Night lighting (F12, 2026-10-15)

- Night is lighting, not new art (`game/lighting.ts`). A night level eases from 0 to 1 over dusk
  and back at dawn (0.9 s time constant, frame-rate independent) instead of switching.
- The ground gets a cool moonlit wash; cliffs, tall scenery, walls, gates, empty plots and
  buildings get the same moonlight as a multiply tint, so nothing glows out of the dark.
- Warm additive glows (`window_glow`, `lantern_glow`) light standing building windows and lantern
  posts once dusk has fallen; ruins stay dark. Actors (king, units, enemies, shots) stay untinted
  so silhouettes and attacks remain readable.
- The pooled painter image resets blend mode as well as flip and tint.

## Not built yet

- Object pools for effects; the real audio (recorded sounds and music).
- Web Worker pool and Comlink (ADR-003): the runner is ready to be moved into a worker.
- Tier 3 nightly balance assertions (ADR-007) and the ECharts dashboard (ADR-005).
- Research (Gambler's Oath already stores its multiplier).
