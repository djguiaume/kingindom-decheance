# Implementation notes

Choices made while building the skeleton, answering the open questions at the end of
ADR-010. Significant ones can be promoted to ADRs in the design corpus.

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
  weapon's ability (the spear's Charge dash) is the only manual attack. Weapon and map are
  chosen per run (`prototypeRun`), so starters and bonuses can swap them later.
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
- **Spawn pin while the spawn is on screen**: by day the pin stands over the spawn, pointing
  down, so the king can walk there and still read what is coming.
- **Readable attacks**: melee hits draw a short slash on the target instead of a white line
  from the attacker (those looked like shots). Enemy arrows are thick dark shafts with a white
  head and a ground shadow, and fly at 8 m/s (was 12), so there is time to step aside.
- Balance (`pnpm sim`, 200 seeds): balanced ~95%, defensive ~80%. The `defensive-loss` golden
  moved to seed 5.

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

## Not built yet

- Day/night lighting, object pools for effects; the real audio (recorded sounds and music).
- Web Worker pool and Comlink (ADR-003): the runner is ready to be moved into a worker.
- Tier 3 nightly balance assertions (ADR-007) and the ECharts dashboard (ADR-005).
- Perks, mutators, research, score.
