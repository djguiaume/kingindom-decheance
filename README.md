# Throne falling

A browser-only build-by-day, defend-by-night game in the spirit of Thronefall. No backend, ever.
Design corpus and architecture decisions (ADR-001 to ADR-008) live in the project's design corpus;
this repository implements them.

> **Status:** engineering skeleton. The map, numbers and art are **placeholders** that exist only
> to exercise the core. The real prototype content comes from the design work.

## Quick start

```sh
corepack enable          # gives you the pinned pnpm
pnpm install
pnpm dev                 # game at http://localhost:5173
pnpm test                # unit, content, determinism and golden-run tests
pnpm sim --policy defensive --runs 200   # headless batch on the command line
```

Requires Node 22 (see `.nvmrc`).

## Layout (ADR-008)

Think of it as a Maven multi-module build: one repo, four modules, arrows only point one way.

| Package            | What it holds                                                    | May use           |
| ------------------ | ---------------------------------------------------------------- | ----------------- |
| `packages/content` | JSON content, Zod schemas, validator, exported JSON Schemas      | `zod`             |
| `packages/core`    | Game state, seeded RNG, commands, systems, phase machine, events | content **types** |
| `packages/sim`     | Headless runner, bot policies, run summaries, Node CLI           | `core`, `content` |
| `apps/game`        | Vue 3 app, Phaser `GameView`, HUD (Pinia snapshots)              | everything above  |

Boundaries are enforced twice: `core` and `content` compile without the DOM library, and ESLint
fails on any forbidden import (`phaser`/`vue` in the core, a reverse arrow, `Math.random`, `Date`…).

## How the core works, in Java terms

- **`GameState`** is one plain data object (like a DTO graph): castle, king, buildings, units,
  enemies, gold, RNG state. No classes with behaviour, so `JSON.stringify` is a save file and a
  deep copy is a snapshot.
- **Commands** (`build`, `upgrade`, `startNight`, `moveKing`) are the only way in, like a command
  bus in front of a domain model: validated, then applied, or refused with a reason and no change.
- **Systems** are plain functions run in a fixed order each tick, like a pipeline of stateless
  services: `king → spawning → targeting → movement → separation → combat → death → phase`.
- **Fixed tick.** Nights advance in exact 1/30 s steps whatever the frame rate. The browser
  accumulates frame time and runs as many ticks as fit; the view interpolates between ticks.
  Headless runs just loop ticks as fast as the CPU allows (~0.005 s per run here).
- **Determinism.** One seeded RNG (sfc32) lives inside the state. Same content + config + seed +
  command log ⇒ the same run, bit for bit. A `Session` records accepted commands with their tick,
  so every run can be replayed exactly.
- **Events** (`hit`, `killed`, `dawn`…) are returned by each tick for the view to animate. They do
  not change the state.

Implementation choices made here (open questions in ADR-010 §hooks) are listed in
[docs/implementation-notes.md](docs/implementation-notes.md).

## Tests (ADR-007)

- `pnpm test` runs tier 1 and 2 in Node: unit tests per system, content validation, property
  tests with fast-check (invariants on every tick of random runs), determinism (same inputs,
  snapshot/resume, rebuild from command log) and golden runs.
- **Golden runs** (`packages/sim/test/golden/*.json`) are recorded replays with their expected
  summary. If a change alters an outcome the test fails with a diff. If the change is intended,
  run `pnpm golden:update` and say why in the commit.
- `pnpm e2e` runs the Playwright smoke test against the production build.

## CI and deploy

GitHub Actions runs format, lint, type-check, schema freshness, tests, build and the browser smoke
test on every pull request. Each merge to `main` deploys the game to GitHub Pages
(repository Settings → Pages → Source must be set to **GitHub Actions** once).
