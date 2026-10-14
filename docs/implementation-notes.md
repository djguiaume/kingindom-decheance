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
  again drops them where he stands and they guard that spot until dawn. If the king falls,
  followers stay where they are.
- **Edge arrows** (view-only, `apps/game/src/game/indicators.ts`): tonight's spawns by day;
  by night the castle and buildings hit in the last 2 s, the boss, then the largest enemy
  groups; at most 6. They keep out of the joystick corner and the button column. On-screen
  spawns glow by day.
- **Waves panel**: Tab or the wave chip, and in the pause menu.
- Not built: the finale drums (there is no audio yet); tapping an arrow does nothing.

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
