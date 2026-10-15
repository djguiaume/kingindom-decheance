# Panda Kingdom playtest remediation strategy

Status: ongoing. [PR #43](https://github.com/djguiaume/kingindom-decheance/pull/43) is merged.
[PR #44](https://github.com/djguiaume/kingindom-decheance/pull/44) contains the gate and
ground-anchor fixes on `fix/panda-gates-ground-anchors`, awaiting review and merge. No assets have been generated for either batch.

Reported by Guillaume after testing the latest `main` on 2026-10-14. Code reviewed at
`1de7567a91912545aa9343791f21aab43d53b104` (PR #39, “Bring the panda art into main”).
The findings below are user observations; the code inspection identifies implementation gaps,
but does not replace reproducing the issues in the deployed game.

This plan belongs in `docs/plans/`: it sequences implementation and verification. The approved
visual reference remains [panda-art-direction.md](../decisions/panda-art-direction.md), with
asset inventory in `art/manifest.json` and production workflow in
[tools/art-pipeline/README.md](../../tools/art-pipeline/README.md). New gameplay decisions should
be recorded separately before implementation. Update this plan's status as each batch lands.

## Strategy

Finish the integration of existing art before commissioning more assets. Fix geometry and
combat readability first, then unify the UI and onboarding. Build actual king variants as an
explicit gameplay feature after the current king feels right. Keep each batch reviewable and
playtest between batches; avoid a single large “polish” change that mixes renderer and balance.

Priorities: P0 = battlefield visibility blocker; P1 = integration/feedback defect; P2 = product
feature or broader presentation improvement. These are implementation priorities, not claims
that every observation has the same severity.

### What the reviewed playtest baseline established

- `game/art.ts` chooses only the on-foot king's idle/walk frames. It never chooses the existing
  roll, anticipation, uncurl or wolf sequences. Walk frames advance from distance with four
  frame advances per 0.9 m; `king.json` has speed 7 m/s. That implies about 31 frame advances/s
  at full speed, a plausible cause of the frantic walk. Measure in-game before tuning.
- `game/animation.ts` already responds to `hit`/`fired`, and `PlayScene.ts` draws weapon rigs
  for king and enemies. “No enemy attack animation” is a visibility/quality finding, not
  evidence that no animation code exists. Bodies mostly have front/back still frames;
  attack motion must come from good rigs or additional reviewed sequences.
- Static `slot_empty` images are drawn under every plot, independent of later construction.
  Gate art is drawn at raw `ART_SCALE`, whereas ordinary buildings use `BUILDING_SIZE`.
  Alignment needs inspection of atlas trim/pivot metadata and world footprint, not arbitrary
  offsets applied to every building.
- Ground, lane paths and terrain still use procedural graphics in `PlayScene.ts` and
  `terrain.ts`. Existing environment/tile files do not mean they are used. `Art` currently
  discovers atlas JSON/WebP pairs; standalone runtime textures need explicit loading.
- Enemy arrows and catapult boulders already have art paths. Friendly flying shots use drawn
  arrows; instant tower/castle shot effects share a `bolt` visual. The complaint therefore
  requires a source-to-projectile mapping audit, not just loading the arrow atlas.
- Buildings receive a night tint; the ground receives an overlay; actors deliberately remain
  bright. Glow assets are available but are not evidence of an emissive lighting system.
- `HomeView.vue` exists, but uses the old linen/crown identity and outdated stand-in text.
  The HUD uses `GameIcon` and CSS panels. There is no guided tutorial flow in the reviewed views.
- Audio uses synthesized placeholders. `cues.ts` treats all friendly unit hits as sword hits
  and has no `fired` cue handling; dash audio is detected from state in `audio/attach.ts`.
- King selection is explicitly approved in `panda-art-direction.md`, but no selection menu or
  king ID exists in `RunConfig` (`mapId`, `weaponId`, `seed`). `king.json` holds one global
  king definition. The ability command is generic, but content's `Ability.kind` accepts only
  `dash`, and `systems/king.ts` implements that dash. Different dash parameters are feasible;
  crowd control or new special-ability types require core/content work.

## Fix history and status

This register is the running list of all 22 findings. **Fixed** means implemented and tested;
the status also states whether it is merged or awaiting merge. **Partial** means the finding
still needs additional work. A merged PR is not a claim that a new user playtest has passed;
reopen any fixed finding if the next playtest still shows the issue.

| Batch | Delivery                                                                                         | Findings                | Result                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [PR #43](https://github.com/djguiaume/kingindom-decheance/pull/43), merged into main (`f1e9097`) | F01, F02, F11, F20, F21 | Fixed: walk cadence, rolling charge, foundation visibility, projectile mapping, night battlefield/HUD separation.                                                       |
| 1     | PR #43, merged                                                                                   | F05, F06                | Partial: stronger attacks/recoil and correct target facing; broader attack animation quality remains open.                                                              |
| 2     | [PR #44](https://github.com/djguiaume/kingindom-decheance/pull/44), merged into main (`487af73`) | F07, F08, F10           | Fixed: gate hinge span fits projected core passage, front/side/diagonal perspective and mirroring, upright posts, and calibrated building/ruin ground centres.          |
| 3     | [PR #47](https://github.com/djguiaume/kingindom-decheance/pull/47), merged into main (`92fa86b`) | F18                     | Partial: reviewed grass, water, bank, bridge, cliff-section and matching prop art now render from map geometry; the mislabeled grass-patch and cliff-end assets remain. |
| 3     | [PR #47](https://github.com/djguiaume/kingindom-decheance/pull/47), merged into main (`92fa86b`) | F19                     | Fixed: reviewed path texture follows every validated ground-lane polyline with rounded joins at arbitrary orientations and does not alter routes.                       |
| 3     | [PR #50](https://github.com/djguiaume/kingindom-decheance/pull/50), merged into main             | F18, F19                | CI follow-up: ground-level decoration stays static; only tall occluding scenery enters per-frame depth sorting, restoring headless-browser movement speed.              |

### CI follow-up for PR #44

The new orientation, scale/anchor and rotated-map tests passed on GitHub Actions. The failing
check was the existing atlas/contact-sheet integration test exceeding its default 5 s limit
while rasterizing and compressing full-catalog PNG review sheets. That single integration
test now has a 20 s timeout, with all assertions retained; ordinary tests keep their existing
limits. Verification uses the standard `pnpm test` command without a global timeout override.

### Batch 2 details

- Gate placement uses measured ground hinge points from the existing closed master, shared
  between closed/open frames. The hinge segment is fitted to the core's 2.2 m opening after
  projection. The ground axis can stretch/shear while the vertical axis stays upright; pooled
  Phaser containers/images implement this with standard transforms in WebGL and Canvas.
- Side views mirror as well as diagonal views. Reversing the wall axis leaves presentation
  unchanged. Near-vertical custom-map gates include a small depth projection to keep the side painting
  visible while fitting both hinge endpoints exactly. All orientations use the same lane-derived
  geometry; no Greyhollow coordinates or angles are hard-coded. Presentation tests cover
  every degree and both wall-axis directions. Validated map fixtures rotate the incoming path
  through 24 orientations, verifying king passage from either side, blocked wall wings,
  following soldiers routing through the opening, ground enemy blocking and flyers ignoring
  the wall. Friendly proximity opens the gate from either side at all angles.
- Each current building and castle tier has a ground centre measured on its untrimmed master.
  Trimmed atlas bounds do not become the anchor. Ruins and roof HP bars use the same convention.
  Building size, collision, routes and gameplay rules remain unchanged.

## Complete finding register

Every original finding has one ID. Design questions remain questions until their recommended
resolution below is adopted; do not silently mark them as fixed.

| ID  | Status                                  | Playtest finding                                             | Priority / batch | Required result and acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Fixed · PR #43 merged                   | King walk animation too fast                                 | P1 / B2          | Tune per-king cadence independently of movement speed; full-speed walking looks deliberate, settles cleanly, and behaves consistently at 30/60/120 render FPS.                                                                                                                                                                                                                                                                                                      |
| F02 | Fixed · PR #43 merged                   | King does not roll during charge                             | P1 / B2          | Use existing anticipation/roll/impact/uncurl art; roll visibly covers the actual dash, exits cleanly, and never leaves a spear floating beside a curled body.                                                                                                                                                                                                                                                                                                       |
| F03 | Open                                    | Is a king selection menu planned?                            | P2 / B6          | Yes in the approved art decision, absent in code. Add an explicit pre-run choice of on-foot/wolf king with portrait, ability description and selected state.                                                                                                                                                                                                                                                                                                        |
| F04 | Open                                    | Can selected kings have different charges/special abilities? | P2 / B6          | Extend deterministic run configuration and validated content; same seed/config/commands replay identically for each king. Do not promise non-dash abilities with the present schema.                                                                                                                                                                                                                                                                                |
| F05 | Partial · PR #43 merged                 | King attack too basic                                        | P1 / B2          | Clear spear thrust with body anticipation/recoil and correctly placed weapon/impact effect, readable at phone scale in front/back views.                                                                                                                                                                                                                                                                                                                            |
| F06 | Partial · PR #43 merged                 | Enemies appear to have no attack animation                   | P1 / B2          | Each implemented enemy visibly strikes, draws/releases, throws or stomps; weapon pivots and body motion align; one shot release never animates twice on landing.                                                                                                                                                                                                                                                                                                    |
| F07 | Fixed · PR #44 merged                   | Door scale completely wrong                                  | P1 / B1          | Gate opening matches the core's 2.2 m passage at every gate view and tier; neighboring wall wings meet it without gaps/overlap.                                                                                                                                                                                                                                                                                                                                     |
| F08 | Fixed · PR #44 merged                   | Door orientation slightly wrong                              | P1 / B1          | Front/side/diagonal view and mirror selection match the projected wall line; open/closed frames keep hinges and ground anchors stable.                                                                                                                                                                                                                                                                                                                              |
| F09 | Open                                    | Terrain acts as wall instead of actual walls                 | P1 / B3          | Audit map barriers and replace intended fortifications with wall geometry/art; retain genuine cliffs/water. The visible blocker and actual collision agree.                                                                                                                                                                                                                                                                                                         |
| F10 | Fixed · PR #44 merged                   | Buildings not aligned with bases                             | P1 / B1          | Every building/upgrade is centered on its plot's ground anchor and footprint, including castle tiers; no unexplained drift from trimming or scale.                                                                                                                                                                                                                                                                                                                  |
| F11 | Fixed · PR #43 merged                   | Base still visible after construction                        | P1 / B1          | Hide the empty-plot art when occupied; upgrades, destruction, dawn repair and restart display the intended occupied/ruined/empty state without duplicate foundations.                                                                                                                                                                                                                                                                                               |
| F12 | Decision recorded · implementation open | Should buildings/enemies change at night?                    | P2 / B3          | Use lighting, not alternate identity: subtle cool ambient tint and warm building glows; preserve enemy silhouette, attack readability and faction distinction.                                                                                                                                                                                                                                                                                                      |
| F13 | Open                                    | Generic sounds do not match actions                          | P1 / B4          | Distinct roll/lunge, spear, sword/axe/club, bow/crossbow, ballista and boulder cues; release and impact timing match the visible action; mute/limits still work.                                                                                                                                                                                                                                                                                                    |
| F14 | Open                                    | HUD does not use assets                                      | P2 / B5          | Wire suitable approved portraits/icons into Vue through a shared UI asset map; create only demonstrably missing UI assets.                                                                                                                                                                                                                                                                                                                                          |
| F15 | Open                                    | HUD does not match panda theme                               | P2 / B5          | Consistent blue/gold/bamboo/stone visual language across HUD, panels, pause, perk, wave and result screens; readable live text and usable touch targets.                                                                                                                                                                                                                                                                                                            |
| F16 | Open                                    | No themed main menu                                          | P2 / B5          | Theme the existing home screen using backdrop/panda identity, Play/Tutorial/settings access, and accurate instructions.                                                                                                                                                                                                                                                                                                                                             |
| F17 | Open                                    | No tutorial like Thronefall                                  | P2 / B7          | Short optional playable introduction teaches move, build, night, autoattack, ability and rally; supports keyboard/touch, skip/replay and progress only after the action succeeds.                                                                                                                                                                                                                                                                                   |
| F18 | Partial · PR #47 merged                 | Terrain does not match assets                                | P1 / B3          | Integrate reviewed grass/water/cliff/bridge/prop art over the authoritative map geometry; collision stays recognizable and scenery does not bury actors.                                                                                                                                                                                                                                                                                                            |
| F19 | Fixed · PR #47 merged                   | Paths do not match assets                                    | P1 / B3          | Use reviewed path tile/edge treatment aligned to lanes, without seams, abrupt joins, or changing travel routes during the art pass.                                                                                                                                                                                                                                                                                                                                 |
| F20 | Fixed · PR #43 merged                   | Projectiles appear not to use corresponding assets           | P1 / B2          | Verify arrow, crossbow bolt, ballista bolt and boulder per source; use corresponding art for friendly/enemy/tower/castle shots with distinct faction treatment.                                                                                                                                                                                                                                                                                                     |
| F21 | Fixed · PR #43 merged                   | Top HUD hides enemies at night                               | P0 / B0          | Compact night HUD and camera framing keep approaching enemies/telegraphs out from under opaque panels; boss bar/toasts and edge indicators remain usable on short landscape phones.                                                                                                                                                                                                                                                                                 |
| F22 | Open                                    | Cliffs drawn as flat horizontal strips                       | P1 / B3          | Reported 2026-10-15. `PlayScene.ts` stamps the one front-facing `cliff_section` every 3.2 m along each cliff line, whatever its direction, so the ring around the hollow reads as stacked terrace steps, too low to be a cliff. Cliffs must follow the ring: a face where the high ground's edge faces the camera, side and back pieces elsewhere, `cliff_end` at the passes, and enough height to read as a cliff. Visible cliff and collision stay the same line. |

## Parallel tracks (2026-10-15)

Guillaume asked for every independent fix to run in its own thread. The tracks below touch
different files, so they can proceed at the same time; each opens its own PR and updates only
its own rows of the register above.

| Track | Findings      | Owns (under `apps/game/src` unless noted)                                                             | Can start now? | Notes                                                                                                                                                            |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1    | F09, F22, F18 | `game/terrain.ts`, cliff/wall drawing in `game/PlayScene.ts`, map JSON, core terrain/walls, cliff art | Yes            | Fix the cliff renderer for any map (direction-aware faces, ends, height), not by removing cliffs from Greyhollow. Real fortifications get wall geometry and art. |
| T2    | F05, F06      | `game/animation.ts`, weapon rigs in `game/art.ts`, actor drawing in `game/PlayScene.ts`               | Yes            | Rest of B2: readable king thrust and enemy strikes at phone scale.                                                                                               |
| T3    | F13           | `audio/`                                                                                              | Yes            | Cue mapping and sound files now; final release/impact timing re-checked once T2 lands.                                                                           |
| T4    | F14, F15, F16 | `views/HomeView.vue`, `views/GameHud.vue`, `components/`, `style.css`, `theme.ts`, `icons.ts`         | Yes            | B5. Paid art needs Guillaume's typed approval in the spending thread.                                                                                            |
| T5    | F12           | night tint/glow in `game/PlayScene.ts`                                                                | After T1       | Same draw code as T1; T1's thread does it next.                                                                                                                  |
| T6    | F03, F04      | core run config, content, pre-run view                                                                | After T2, T4   | B6 needs the action presentation (T2) and the pre-run screen (T4).                                                                                               |
| T7    | F17           | tutorial controller, home/play views                                                                  | After T6       | B7 teaches the selected king's ability.                                                                                                                          |

T1 and T2 both edit `game/PlayScene.ts` in different sections (terrain/scenery versus actors);
merge main before each push and keep edits inside your own section.

## Implementation batches, in order

### B0 — Night visibility and a repeatable review scene

Scope: F21. Start here because hidden attackers undermine every later combat review.

Paths: `views/GameHud.vue`, `components/NightTrack.vue`, `components/EdgeArrows.vue`,
`game/indicators.ts`, `game/camera.ts`, `game/PlayScene.ts` (under `apps/game/src`).

1. Reproduce night 1 and boss night 6 on desktop and a short landscape phone. Capture the king,
   enemies near the top edge, boss bar, message toast, wave panel and both zoom levels.
2. Reduce the night track/treasury footprint and collapse optional details behind deliberate
   interaction. Reserve measured safe space for unavoidable panels in camera framing or show
   approaching threats clearly below it. Transparency alone and `pointer-events: none` do not
   solve visual occlusion.
3. Reuse measured HUD bounds for edge arrows; avoid stale fixed padding. Verify that joystick,
   ability, rally, pause and sound remain accessible with notches/safe areas.
4. Establish a development-only fixed-seed review route or fixture for later batches: plots,
   gate views, every currently implemented enemy, projectile sources, day/night and castle
   tiers. It must not modify production run rules or saved profiles.

Gate: an approaching attacker and its telegraph can be seen before reaching the king across
those layouts, including when boss bar and toast are present.

### B1 — Ground anchors, foundations and gates

Scope: F07, F08, F10, F11. Fix the shared geometry before decorating the map.

Paths: `game/PlayScene.ts`, `game/art.ts`, `tools/art-pipeline/src/atlas.ts`,
`tools/art-pipeline/src/catalog.ts`, `art/manifest.json`, `art/runtime/`, and core wall geometry
in `packages/core/src/systems/walls.ts` as the reference.

- Inspect actual Phaser bounds, `sourceSize`, trim rectangle and custom pivot. Add a review
  overlay showing slot center, painted ground anchor, footprint, wall endpoints and gate gap.
- Replace broad scale guesses with per-asset footprint/anchor metadata where needed. Keep
  sprite height separate from footprint width; preserve atlas pivots after trimming. Correct
  metadata/normalization at the source when possible, then repack the affected runtime assets.
- Fit gates by the projected hinge/opening geometry, not by total texture width (roof/towers
  are part of the painting). Validate front, side and both diagonals at wood/stone tiers.
  Change chosen perspective or source art only if placement cannot solve the observed mismatch.
- Make plot markers state-aware rather than permanent static images: empty art for unoccupied
  slots, building's own base when occupied, ruin treatment when destroyed. Do not introduce
  a simulated construction delay merely because a construction sprite exists.

Gate: buy, upgrade, destroy, repair at dawn, and restart all keep footprints centered and
foundations correct. King/friendly passage fits the drawn gate; enemies stop on its outer side.
Avoid changing wall collision dimensions to accommodate an oversized painting.

### B2 — Character actions and correct projectile visuals

Scope: F01, F02, F05, F06, F20.

Paths: `game/animation.ts`, `game/art.ts`, `game/PlayScene.ts`, `game/runtime.ts`,
`apps/game/test/animation.test.ts`, `apps/game/test/art.test.ts`.

- Introduce explicit view action selection: locomotion, attack, dash, recovery, death. Define
  precedence and reset on death, respawn and restart. Drive it from deterministic state/events
  plus a view clock; never from render-frame counts.
- Measure full cycles, then tune walk stride/cadence per king. Use distance-based steps with a
  sensible maximum cadence and time-based idle/recovery. Do not slow the simulation king to
  repair an animation. Inspect ordered frames for discontinuities before buying replacements.
- Keep the current 0.3 s charge distance/damage/cooldown. Play anticipation on accepted input
  without delaying the actual dash, loop roll while dash is active, and uncurl on completion.
  A rejected ability must not roll. If longer anticipation is desired later, treat that delay
  as a gameplay change. Hide/reposition the spear during the curled sequence.
- Improve the king's spear thrust and each enemy's rig (grip, direction, weapon depth) with
  small body recoil/recovery. Use `fired` for release and non-projectile `hit` for melee impact;
  separate damage flash from attack motion. Existing impact-only events cannot communicate a
  real pre-hit telegraph: any new wind-up that changes dodge timing needs a separate core plan.
- Create one presentation mapping from attack source/type to projectile frame, orientation,
  anchor, visual scale, trail and impact. Use arrow/bolt/ballista_bolt/boulder appropriately;
  render friendly shots with art too. Keep instant visual tower shots visually distinct from
  dodgeable simulated projectiles; do not silently add flight time or change hit rules.

Gate: review every enemy and friendly projectile source at mobile scale, paused at release and
impact, and in motion. No rolling walk, detached weapons, duplicated attack triggers or wrong
projectile frames. Rendering changes preserve existing replays and golden outcomes.

### B3 — Painted map, actual fortifications and night lighting

Scope: F09, F12, F18, F19. Depends on B1 anchor/scale conventions.

Paths: `game/terrain.ts`, `game/PlayScene.ts`, `game/art.ts`, `theme.ts`,
`packages/content/data/maps/greyhollow.json`, content terrain schemas, core terrain/wall systems.

1. Classify each current barrier as natural cliff/water, permanent fortification, or buyable
   wall. The current map has real terrain blockers and existing buyable wall slots; do not
   delete all cliffs. Record intended changes before changing collision.
2. For cosmetic-only replacements preserve blocker geometry. If permanent man-made walls are
   needed, model them explicitly in validated map/core data rather than disguising cliffs or
   seeding unlogged buildings. If replacing a cliff with a destructible/buyable wall opens a
   route, that is a map/balance change: validate routing and rerun balance separately.
3. Load standalone runtime textures as well as atlas frames. Apply grass/stone/path tiles and
   edges from the inventory; align water, cliffs and bridges to map coordinates. Depth-sort tall
   props against actors instead of baking every tree into an always-behind static layer.
   Check repeat seams, both zoom levels and phone render cost.
4. Night recommendation: retain the same building/enemy designs and geometry. Add subtle cool
   ambient lighting across structures and actors, warm `window_glow`/`lantern_glow` overlays
   above tinted bases, and gentle dusk/dawn transitions. Enemies may be less warmly lit, but
   never so dark that their weapon, silhouette or incoming shots disappear. Keep UI untinted.

Gate: screenshot comparison against the approved reference, day and night. Every visible wall
has matching collision and correct faction passage; paths/bridges remain walkable. If map
semantics change, require terrain tests, deterministic replays and a multi-seed balance report.

### B4 — Action-specific sound

Scope: F13. Finalize after B2 so audible and visible action timing share a contract.

Paths: `audio/cues.ts`, `audio/attach.ts`, `audio/sounds.ts`, `audio/engine.ts`,
`apps/game/test/audio.test.ts`.

- Specify cue IDs by actual attack/ability and release/impact, not just attacker faction.
  Extend the audio world lookup for friendly unit type/attack where needed; roll is not a spear
  hit, crossbow is not a sword, and a projectile miss is not an impact.
- Replace the highest-frequency placeholder recipes with reviewed, licensed/local audio files;
  record provenance. Wire attack whoosh/release separately from damage impact and material
  (wood/stone/body). Avoid playing a hurt cue instead of the source action or stacking the same
  cue for every target of one attack.
- Keep browser gesture unlock, distance falloff, mute persistence, concurrency limits and
  cooldowns. Give ability/king danger priority over a crowd of ordinary hits.

Gate: listen while rolling, melee fighting and dodging arrows/boulders; sound starts at the
corresponding action, stops at appropriate completion, and stays readable in night 6 crowds.
Test silent first load, muted play, pause/resume and missing-file fallback.

### B5 — Panda HUD and main menu

Scope: F14, F15, F16. Builds on B0's visibility layout; do not reintroduce large opaque panels.

Paths: `views/HomeView.vue`, `views/GameHud.vue`, `components/GameIcon.vue`, `icons.ts`,
`style.css`, `theme.ts`, wave/night/hold-button/sound components, `art/runtime/`.

- Define shared panda palette, typography, panel/button treatment and icon sizing. Inventory
  usable existing king portrait/crown/coin/banner/backdrop art. The 110-entry world inventory
  is not a complete UI kit: list missing action icons/panel borders before producing any new art.
- Provide stable UI asset URLs or extracted UI textures for Vue; Phaser atlas entries are not
  automatically DOM image URLs. Keep text, health values, focus states and labels as live UI.
- Theme the existing home screen, pause/settings, upgrades/perks, waves and results together.
  Keep game naming unchanged unless separately decided. Remove old “ride”/“stand-in art” copy
  where it no longer describes the selected king and current game.
- Reserve pre-run navigation space for king choice, implemented in B6. Keep controls discoverable
  with keyboard, adequate touch areas, and high contrast; decoration must not consume combat
  space or resemble red enemy warning markers.

Gate: home-to-play-to-pause-to-result flow consistently matches the reference and remains usable
on desktop and short landscape phones. Recheck F21 with the final themed UI.

### B6 — King selection and genuinely different abilities

Scope: F03, F04. Depends on B2 presentation and B5 pre-run UI. This is gameplay/content work.

Recommended shape:

1. Add a validated king catalog keyed by stable IDs (e.g. `roll`, `wolf`), and a `kingId` in
   `RunConfig`. Resolve stats/ability in `createContext` and again in derived stat rebuilding so
   castle perks cannot accidentally reset the selected king to global defaults. Keep weapon
   choice and king choice separate; define which source owns normal attack and active ability.
2. Preserve the generic `ability` command. Initially both king abilities may reuse dash mechanics
   with different validated parameters and presentation (roll/lunge), clearly labeled as such.
   The approved crowd-control/pursuit distinction is not complete merely because skins differ.
3. To deliver those distinct roles, specify roll crowd control versus wolf focused damage:
   affected targets, interruption/invulnerability policy, cooldown, collision and targeting.
   Implement approved effects through typed ability variants and core systems, not renderer
   callbacks or checks for a king's display name. Add only the mechanics needed for the two
   approved kings; avoid a speculative general scripting engine.
4. Selection creates the runtime with the chosen configuration; restart retains it, a new run
   can change it, and direct `/play` navigation uses an explicit default. Show ability name and
   cooldown from resolved content rather than hard-coded “Charge”.
5. Include king choice in replay/config serialization and profile run records. Define backward
   compatibility: older configs default to the existing roll king; migrate/version saved data
   where required and retain content-hash replay checks. Review sim CLI/policies too.

Gate: both choices render correct idle/walk/action art and execute their documented mechanics.
Content validation rejects unknown IDs; snapshot/resume and command replay are deterministic
for both. Run balance over at least 200 shared seeds per king and relevant policies; report
wins, failure nights and effect of perks. Baseline king-only/greedy losses still make sense.
Do not regenerate goldens to hide accidental balance changes; explain intended differences.

### B7 — Short playable tutorial

Scope: F17. Depends on final control labels and selected ability from B6.

Paths: home/play views, input hub, HUD store, progression profile; add a dedicated view-layer
tutorial controller and a small validated tutorial scenario only if Greyhollow is insufficient.

- Follow the idea of teaching by doing, with original wording and panda presentation. Offer a
  first-run prompt, Skip and Replay Tutorial from the menu; do not force repeat players through it.
- Teach in order: move to a plot → successfully build income → build a defense → deliberately
  start night → observe autoattack → use the selected ability → rally/drop a squad → survive
  and understand dawn income. Give one short device-appropriate instruction at a time.
- Complete steps from accepted commands/state/events, not button taps or elapsed time. Handle
  insufficient gold, failed abilities, dead king, restart, pause and changing input device.
  Delay steps until the relevant unit/building exists; tips must not block attacks or controls.
- Persist tutorial completion separately from normal scores. Tutorial runs must not pollute
  map records, consume unlocks or mutate ordinary Greyhollow balance. Prefer orchestration of
  existing commands; any special map goes through normal content validation.

Gate: a new desktop player and a new phone player can finish without reading a control dump;
skip/replay work, and ordinary runs stay unchanged.

## Review and validation policy

For strategy updates: verify all 21 findings remain represented, source paths/links exist,
and Markdown formatting passes. Fix status must identify the delivered code and its merge
state; preserve partial findings and record regressions instead of silently dropping entries.

For implementation batches:

- Keep one batch per PR where practical; split B3 into cosmetic/map-rule changes and B6 into
  configuration/selection and approved mechanics. Link finding IDs in each PR. Update
  `docs/implementation-notes.md` with implemented behavior, and this plan with actual status.
- Add targeted tests for behavior that can regress: action/frame selection, occupied plot
  visibility, projected gate mapping, projectile/cue mapping, king config/replay, tutorial step
  completion and night HUD visibility. Tests should assert behavior, not mirror internals.
- Follow existing CI: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm content:schema` with no unintended schema diff, `pnpm test`, `pnpm build`, `pnpm e2e`.
  Asset-only fixes also require runtime repack/review and targeted `pnpm art audit`. An audit
  marking an asset “validated” does not establish that it looks correct in the actual game.
- Attach before/after screenshots or short clips at the same seed, zoom and viewport. Review
  default/mobile landscape, a short ~330 px-high viewport, desktop, both zooms, day/night,
  boss night, and front/back character views. Capture sound examples for B4.
- Record mobile render performance before/after atlas terrain, glow and richer effects; use
  pools/static layers where appropriate, and ensure pause/restart does not leak scene objects.
- Re-play after B0–B2 before spending on replacement art; after B3–B5 for style/audio; after
  B6–B7 for the complete new-player flow. Mark a finding fixed after implementation and verification, with its PR/merge status recorded.
  Reopen it if Guillaume's next playtest shows that its acceptance condition is still unmet.

## Start here

PR #43 delivered the first visibility, animation, foundation and projectile fixes. PR #44
delivered orientation-independent gates and calibrated building ground anchors. Batch 3 now
integrates existing painted terrain, paths and environment props without changing F09's map
semantics or gameplay. Its remaining art gap is explicit: `grass_patch` and `cliff_end` do not
contain the assets their names claim, so the renderer uses a safe procedural fallback instead.
