# Claude execution brief — Panda Kingdom production assets

Repository: djguiaume/kingindom-decheance
Working branch: art/panda-assets-production. Do not change main or merge without approval.

## NON-NEGOTIABLE
The approved visual reference is the v1.2 Panda Kingdom sheet supplied by the user. Ask for it if not present in your session. DO NOT extract, crop, segment, trace or repurpose sprites from this reference or from any combined concept sheet. Every asset must be independently generated as a new source image. DO NOT generate another fake numbered overview and call it production. If your environment cannot generate original images, say so immediately and arrange an executable production workflow; do not substitute placeholder graphics.

Read docs/decisions/panda-art-direction.md and docs/decisions/panda-asset-manifest.json. Treat the 105 numbered entries in the prior approved chat manifest as the canonical checklist; expand the existing basic manifest into an exhaustive one. Inspect packages/content/data, apps/game/src/game/sprites.ts, animation.ts, package.json, and Phaser loader/drawer before coding. Preserve existing content IDs and gameplay logic.

## Art direction
Cozy hand-painted storybook fantasy, consistent three-quarter isometric view, warm upper-left lighting, subtle brown outlines, blue #315F94, gold #E2B94B, panda white/black, bamboo, wood and stone. Red reserved for enemies. Friendly pandas with distinct readable silhouettes; green goblins, grey-green brute, dark harpy, plausible siege engine. Blue pagoda roofs and panda banners. Map paths visually quiet, vegetation richer at edges; blue night tint and separate warm light overlays. No UI, labels, parchment, shadows or scenery embedded in standalone sprites. Readable at 40px on phones.

## Characters and gameplay
Two exclusive king modifiers selected at run start: on-foot rolling panda (Sonic-style curl/spin/uncurl and crowd control); panda riding a real four-legged wolf (run and lunge, pursuit and focused damage). Keep weapon/body/mount layers independent as appropriate, define pivots and anchors. Six friendly types: footman, knight, archer, crossbowman, guardian, monk. Six enemy types: raider, skirmisher, brute, harpy, catapult, warlord. Guardian and Monk are proposed content and require separate recruitment buildings; do not silently alter game balance.

## Building validation
053 Garrison: melee training dummies, NO archery targets; coherent roof.
054 Knight Hall: unmistakable knight imagery: crossed swords, shields, armored equipment.
055 Archery Range: bow racks, shooting lane, targets.
056 Marksmen: upgraded shooting platforms, multiple targets at distances, bow racks.
057 Crossbow Range: heavy crossbows and racks, reinforced shooting platform, large targets.
048 Ballista Tower: visible mechanically functional ballista with paired bow limbs, taut string, central rail and bolt.
035-036 Catapult: mechanically credible symmetrical frame, central throwing arm on central axle between supports, plausible projectile cup or sling; NEVER side-mounted arm. Review actual geometry carefully.
Guardian buildings: shield-training equipment. Monk buildings: staff-training elements.
All other approved v1.2 designs stay consistent.

## Required execution
1. Make an exhaustive numbered manifest of all 105 logical assets, including separate animation frames and weapons, with stable IDs and source filenames.
2. Establish reusable generation specifications and validation scripts. Generate EACH source asset individually (one generation per asset or animation component) with transparent alpha, using the approved reference only as stylistic guidance, never as source pixels. Retry failed assets.
3. Inspect all files for actual transparency, missing limbs, duplicated/merged assets, incorrect weapons, wrong perspective, and consistency; manually check mechanical siege equipment and building distinctions. Do not declare completion with failures.
4. Store original lossless transparent PNG masters; generate optimized, padded, trimmed WebP texture atlases with Phaser-compatible JSON metadata and correct pivots, preserving independent animation layers. Do not use placeholder crops.
5. Integrate loader and image drawer with feet anchoring, flipping, zoom, depth sorting, wall modularity and night overlays. Preserve fallbacks until real assets verified. Run project build/tests and a mobile-scale day/night smoke test.
6. Generate ONE complete, readable numbered contact sheet assembled programmatically from the EXACT individual exported files. It must show ALL 105 logical assets and clearly label each; also create a separate animation-frame contact sheet where necessary. Never fabricate a review sheet independently with an image model.
7. Commit actual masters, runtime assets, manifest, contact sheet, scripts and integration changes to art/panda-assets-production, in coherent commits. Report commit SHAs, test results, exact file counts, unresolved defects and download/review locations. Do not merge to main.

## Acceptance
A full file audit must verify every manifest item has an original individual master and exported runtime representation. The contact sheet must be regenerated from these files. All sprites must match approved style, pass mobile readability, and have validated transparent backgrounds. If you cannot fulfill any stage, state precisely what is incomplete and stop claiming completion.