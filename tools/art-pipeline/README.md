# Panda art pipeline (Scenario.gg)

Generates the 105 logical assets of the approved Panda Kingdom v1.2 sheet with Scenario's
**GPT Image 2.5 Flare** (`model_openai-gpt-image-2-5-flare`), validates them, stores lossless
masters, builds Phaser atlases and assembles review sheets from the exact files.

Every asset is generated **on its own** (one generation per animation frame). The v1.2 sheet in
`art/reference/` is uploaded once and attached to every generation as a **style reference only**;
no pixel is ever cut out of it.

## Layout

| Path                                   | What                                                                          | Committed |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `art/reference/panda-kingdom-v1.2.png` | Approved style reference                                                      | yes       |
| `art/manifest.json`                    | 105 assets → 143 generation parts (generated from `src/catalog.ts`)           | yes       |
| `art/status.json`                      | Per-part state, attempts, Scenario job/asset ids, CU spent, validation issues | yes       |
| `art/batches/<token>.json`             | Each dry-run estimate and the runs made against it                            | yes       |
| `art/.cache/originals/`                | Raw Scenario downloads (large; sha256 kept in status)                         | no        |
| `art/masters/<group>/<num>_<part>.png` | Lossless transparent masters, normalised to the manifest canvas               | yes       |
| `art/runtime/`                         | WebP atlases + Phaser JSON Hash, standalone tile/backdrop WebP, `index.json`  | yes       |
| `art/review/`                          | `contact-sheet.png`, `animation-frames.png`, `AUDIT.md`                       | yes       |

## Setup (once, by a human)

1. In the project's cloud environment, set `SCENARIO_API_KEY` and `SCENARIO_API_SECRET`
   (`SCENARIO_API_KEY_SECRET` is accepted too)
   (optionally `SCENARIO_PROJECT_ID`). Never put them in code, files or chat.
2. Allow network access to `api.cloud.scenario.com` and `cdn.cloud.scenario.com` (where
   generated files are downloaded from; checked on 2026-10-14, the docs' `cdn.scenario.com`
   example is not what real asset urls use). Downloads follow redirects.

## Workflow

```sh
pnpm art plan enemies                 # what is selected and its state
pnpm art estimate enemies             # dry run: cost per part, nothing charged → prints a batch token
# → a human approves the token and a budget in CU
pnpm art generate --approve <token> --budget <CU>
pnpm art runtime                      # masters → WebP atlases + Phaser JSON
pnpm art review                       # contact sheet, animation sheet, AUDIT.md
pnpm art mark catapult_arm.f1 rejected --note "arm mounted on the side"
pnpm art audit                        # exit 1 until all 105 assets are complete
```

Selectors: `all`, a group (`kings`, `friendly`, `enemies`, `buildings`, `structures`,
`effects`, `environment`, `map`), an asset id or number (`catapult_arm`, `36`), a range
(`35-36`), or a part id (`king_roll_walk.f2`); combine with commas.

Add `--mock` to any command for a free offline run against the in-memory Scenario mock, in
`.art-mock/` (git-ignored). Mock images are flat placeholders and never land in `art/`.

## Spending gates

- `estimate` uses Scenario's `?dryRun=true`: it reports the CU cost without charging.
- `generate` only runs a batch token produced by `estimate`, and refuses when the estimate is
  over `--budget` or any prompt changed since the estimate.
- During a run it stops before any generation that would take spending over the budget.
- Each part gets at most 3 generations in its life (`--max-attempts`); failed jobs and failed
  validation both count. Validated or approved parts are never regenerated unless `--redo`.

## Validation

Automatic (`src/validate.ts`): PNG, requested size, real alpha with transparent corners, no
painted background or checkerboard, subject not cut off by the frame, not tiny, a single main
subject for characters and weapons, white halo detection; tiles and backdrops fully opaque, tile
seams. Masters are trimmed, scaled to 1 m = 64 px (`heightPx`) and placed with their base on the
anchor (feet at 50% / 90% of the canvas) or centred.

Human (shown in `AUDIT.md` and on the sheets): the `checks` of each asset, e.g. the catapult's
central arm, the ballista's two limbs and string, garrison dummies with no archery targets.

## Runtime format

`art/runtime/<group>.json` is a Phaser JSON Hash atlas. Frame names are part ids
(`footman`, `footman_weapon`, `king_roll_walk.f3`, `catapult_arm.f1`). Assets marked `back` in the catalog
also have a view from behind for walking up the screen, e.g. `king_roll_walk.back.f3`. Each frame keeps its
untrimmed `sourceSize` and a normalised `pivot`, which Phaser 4.2.1 reads as the frame's custom
pivot, so a sprite placed at an entity's ground point stands on its feet. `contentId` maps art to
existing game content ids. `index.json` lists every atlas, image and frame.

## Things to confirm on the first real call

The Scenario docs do not name these precisely; the client handles the likely shapes and the first
real dry run will settle them:

- the dry-run response field for the cost (`creativeUnitsCost` assumed; `readCost` also accepts
  `cuCost`/`cost`);
- the body field for reference images on GPT Image 2.5 Flare (`referenceImages` assumed;
  configurable as `referenceField`);
- that `background: "transparent"` returns real alpha for this model (validation rejects it if not).
