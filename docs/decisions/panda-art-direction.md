# Panda Kingdom — approved art decisions (2026-10-14)

Status: approved art direction; production assets must be reviewed against the reference sheet before merging.

## Factions and king modifiers
- Friendly faction: rounded pandas in blue and gold; enemies: green goblins, ogres, dark harpies, red enemy indicators only.
- Two exclusive king modifiers selected at the start of a run: (1) on-foot king with Sonic-like rolling charge, crowd control and repositioning; (2) panda king riding an anatomically quadrupedal wolf, with lunge charge, pursuit and focused damage.
- Keep existing gameplay content IDs and avoid changing simulation rules during the art pass. Guardian and Monk are proposed new content, not yet implemented.
- Six friendly types: footman, knight, archer, crossbowman, guardian, monk. Six enemies: raider, skirmisher, brute, harpy, catapult, warlord.

## Art bible
- Hand-painted cozy storybook strategy game; consistent 3/4 isometric-like view, warm light from upper-left, subtle brown outlines, readable at ~40px.
- Buildings: unified timber, bamboo, stone foundations, blue tiled roofs, gold accents and panda banners. Castle: three increasingly elaborate pagoda tiers.
- Map ground quiet around paths; richer vegetation toward map edges. Night: blue tint with separate warm emissive windows and lanterns.
- Transparent, tightly trimmed sprite masters with pivots/feet anchors; independent weapons; Phaser-compatible JSON texture atlases, WebP runtime and PNG masters. Avoid baking UI or ground shadows into sprites.
- Review inventory: 105 logical entries, with extra frames/layers as needed; identifiers 001–105 in the approved review manifest. Verify every item at mobile scale.

## Required visual distinctions
- Garrison (053): visible wooden melee training dummies, never archery targets; coherent roof.
- Knight Hall (054): unmistakable knight theme, crossed swords, shields, armored practice equipment.
- Archery Range (055): targets, bow racks and shooting lane.
- Marksmen (056): more targets at varied distances, shooting platforms and bow racks.
- Crossbow Range (057): large targets, reinforced shooting platform, heavy crossbow racks.
- Ballista Tower (048): functional top-mounted ballista with two bow arms, taut string, bolt and central firing rail.
- Goblin catapult (035–036): mechanically credible siege engine with symmetric chassis and centered throwing arm pivoted between two supports, clear axle, cup/sling and projectile. No side-mounted arm. Validate the actual geometry rather than merely the painted silhouette.
- Guardian Lodge/Bastion: oversized shields and shield-training equipment; Monk Sanctuary/Monastery: distinct staff training.
- Keep all other approved v1.2 concept designs consistent; do not introduce redesigns without review.

## Integration
- Existing sprites are procedural in apps/game/src/game/sprites.ts; do not remove fallbacks until new art is verified in the actual Phaser 4.2.1 game.
- Review each separately isolated source, not merely a combined AI-generated scene. Build one numbered contact sheet covering all logical assets, plus a machine-readable manifest.
- Run game build and tests after integration. Changes to gameplay/balance are a separate decision.
