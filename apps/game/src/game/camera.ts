/**
 * Where the camera looks, shared between the Phaser scene (which updates it every frame) and the
 * DOM overlays (edge arrows) that need to know whether something is on screen. View-only.
 */
import type { Vec } from '@kd/core';

/** Scene pixels per metre at zoom 1, and the 3/4 view's vertical squash (design 11 §9). */
export const SCALE = 32;
export const SQUASH = 0.75;

export class CameraView {
  /** Top-left of the visible area, in scene pixels. */
  left = 0;
  top = 0;
  zoom = 1;
  /** Visible size in CSS pixels. */
  width = 0;
  height = 0;

  /** A world position (metres) in CSS pixels from the top-left of the game view. */
  toScreen(p: Vec): Vec {
    return {
      x: (p.x * SCALE - this.left) * this.zoom,
      y: (p.y * SCALE * SQUASH - this.top) * this.zoom,
    };
  }
}
