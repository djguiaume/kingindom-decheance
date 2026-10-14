/**
 * Prompt for one generation part. Every part is generated on its own; the uploaded v1.2 sheet
 * is attached as a style reference only.
 */
import { createHash } from 'node:crypto';
import { KIND_RULES, type Asset, type Part } from './manifest.ts';

export const STYLE_BIBLE = [
  'Cozy hand-painted storybook strategy game art, soft brushwork, warm sunlight, saturated but not neon.',
  'Consistent three-quarter isometric-like view looking down about 35-40 degrees; light from the upper left.',
  'Subtle dark-brown outline so the sprite reads at 40 px tall on a phone.',
  'Palette: deep blue #315F94, gold #E2B94B (royalty and money only), panda white and black, bamboo, natural wood, grey stone.',
  'Red appears ONLY on enemies. No red on pandas or panda buildings.',
  'Pandas are round, friendly and brave; not a Kung Fu Panda look-alike. East Asian mood through bamboo, paper lanterns and pagoda roofs.',
  'No text, letters, numbers, labels, UI, frames or parchment. The only symbol allowed is a simple panda-face emblem.',
].join(' ');

const REFERENCE_RULE =
  'The attached image is the approved v1.2 style reference sheet. Match its art style, palette, proportions and character designs. Do NOT copy, crop or recompose it; paint ONE new isolated subject from scratch.';

/** Long thin objects must be painted along their canvas, or they shrink to nothing once fitted. */
function orientation(asset: Asset): string {
  const { w, h } = asset.canvas;
  if (w >= h * 2) {
    return ' Lay it out perfectly horizontal, long axis left to right, tip or head pointing right, filling the width. Not tilted or diagonal.';
  }
  if (h >= w * 2) {
    return ' Stand it perfectly upright, long axis vertical, filling the height. Not tilted or diagonal.';
  }
  return '';
}

function framing(asset: Asset, part: Part): string {
  const rule = KIND_RULES[asset.kind];
  switch (asset.kind) {
    case 'tile':
      return 'Fill the whole square edge to edge as a seamless, tileable texture. Opaque, no border, no vignette.';
    case 'background':
      return 'Fill the whole frame edge to edge. Opaque painted scene.';
    case 'weapon':
    case 'projectile':
      return `Show the object alone, whole and centred, nobody holding it, on a fully transparent background.${orientation(asset)}`;
    default: {
      const ground = rule.groundAllowed
        ? 'Small contextual decorations attached to it are fine; no wide ground plate or scenery around it.'
        : 'No ground patch, no cast shadow, no scenery, nothing under the feet.';
      const gate = asset.id.startsWith('gate_');
      const turnable = asset.parts.some((p) => p.view === 'side');
      const facing =
        part.view === 'back'
          ? ' Seen from behind, walking away up the screen: back turned to the viewer, face hidden, same camera angle.'
          : part.view === 'side'
            ? gate
              ? ' Same camera angle, but the gate is turned 90 degrees: its wall line runs straight up the screen, away from the viewer, so the gateway is seen from its side, doors edge-on.'
              : ' Same camera angle, but turned 90 degrees: its length runs straight up the screen, away from the viewer.'
            : part.view === 'diag'
              ? gate
                ? ' Same camera angle, but the gate is turned 45 degrees: its wall line runs diagonally from bottom-left to top-right, so the gateway is seen at an angle.'
                : ' Same camera angle, but turned 45 degrees: its length runs diagonally from bottom-left to top-right.'
              : turnable && !gate
                ? ' Its length runs straight left to right across the frame.'
                : asset.kind === 'character' || asset.kind === 'flyer'
                  ? ' Body turned clearly toward the right (three-quarter side view, looking right), not facing the viewer.'
                  : asset.kind === 'siege'
                    ? ' Facing right.'
                    : '';
      return `One single subject, whole (nothing cut off by the frame), centred with margin, on a fully transparent background.${facing} ${ground}`;
    }
  }
}

export function promptFor(asset: Asset, part: Part): string {
  const pose = part.pose
    ? ` Animation frame ${part.frame + 1} of ${asset.parts.filter((p) => p.view === part.view).length}: ${part.pose}.`
    : '';
  return [
    `Game sprite: ${asset.subject}.${pose}`,
    framing(asset, part),
    STYLE_BIBLE,
    REFERENCE_RULE,
  ].join('\n');
}

/** Short stable hash of everything that shapes a generation, to detect stale approvals. */
export function promptHash(asset: Asset, part: Part): string {
  return createHash('sha256')
    .update(JSON.stringify([promptFor(asset, part), asset.generate, asset.transparent]))
    .digest('hex')
    .slice(0, 12);
}
