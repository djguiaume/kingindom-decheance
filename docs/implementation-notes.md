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
| `defensive` | towers, walls, barracks first, no early eco      | wins ~35%     |
| `balanced`  | half its gold into eco on days 1–3, then defends | wins ~85%     |

So investing in eco pays off, and building nothing loses. Bots are a rough guide: real play
decides the final numbers.

## Not built yet

- Day/night music and lighting, object pools for effects.
- Web Worker pool and Comlink (ADR-003): the runner is ready to be moved into a worker.
- Tier 3 nightly balance assertions (ADR-007) and the ECharts dashboard (ADR-005).
- Perks, mutators, research, score.
