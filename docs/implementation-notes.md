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
steering, hand-made maps) and are easy to revisit:

- Ground enemies always consider walls first (walls block); flyers never target walls.
- Every enemy will attack the castle when it reaches it, even if its priority list omits it.
- Enemies follow their lane; within `aggroRange` of a target in their priority list they leave
  the lane to attack it, then walk back toward their next waypoint.
- Units guard a post in front of their military building and only engage enemies near that post.
- The king attacks the nearest enemy in reach automatically; the player only moves him.
- Overlapping enemies and units push each other apart (separation), computed order-independently.
- Dawn restores every building, the castle and the king; units are re-fielded each night.
  Income is paid only for eco buildings that survived (corpus fact sheet).
- Day commands do not require the king to be near the slot. Whether building needs the king
  present is a design question for the prototype.

## Not built yet

- Web Worker pool and Comlink (ADR-003): the runner is ready to be moved into a worker.
- Tier 3 nightly balance assertions (ADR-007) and the ECharts dashboard (ADR-005).
- Perks, mutators, research, score.
