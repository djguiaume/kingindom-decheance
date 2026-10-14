/**
 * Draws one frame back to front, mixing code-drawn shapes and atlas images in a single painter's
 * order: each call takes the next depth. Consecutive shape calls share one Graphics; an image in
 * between closes it and the next shapes go on a fresh one. Both are pooled and reused every
 * frame, so nothing is created once the scene has warmed up. View-only.
 */
import Phaser from 'phaser';
import { decomposeAffine, type Affine2D } from './groundRigs.ts';

export class Painter {
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private images: Phaser.GameObjects.Image[] = [];
  private projected: { parent: Phaser.GameObjects.Container; image: Phaser.GameObjects.Image }[] =
    [];
  private usedP = 0;
  private usedG = 0;
  private usedI = 0;
  private depth = 0;
  private open: Phaser.GameObjects.Graphics | null = null;

  /** Everything drawn this frame sits above `base` (the static ground is below it). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly base = 10,
  ) {}

  begin(): void {
    this.usedP = 0;
    this.usedG = 0;
    this.usedI = 0;
    this.depth = this.base;
    this.open = null;
  }

  /** The Graphics to draw shapes on now (above every image placed so far). */
  g(): Phaser.GameObjects.Graphics {
    if (this.open) return this.open;
    let g = this.graphics[this.usedG];
    if (!g) {
      g = this.scene.add.graphics();
      this.graphics.push(g);
    }
    this.usedG++;
    g.clear().setVisible(true).setDepth(this.depth++);
    this.open = g;
    return g;
  }

  /**
   * An atlas frame above everything drawn so far, reset to its pivot, unscaled, untinted and
   * opaque; the caller places it.
   */
  image(atlas: string, frame: string): Phaser.GameObjects.Image {
    this.open = null;
    let im = this.images[this.usedI];
    if (!im) {
      im = this.scene.add.image(0, 0, atlas, frame);
      this.images.push(im);
    } else im.setTexture(atlas, frame);
    this.usedI++;
    return im
      .setVisible(true)
      .setDepth(this.depth++)
      .setAlpha(1)
      .setRotation(0)
      .setScale(1)
      .clearTint();
  }

  /** A calibrated ground-plane projection with upright posts, pooled like ordinary images. */
  projectedImage(
    atlas: string,
    frame: string,
    x: number,
    y: number,
    matrix: Affine2D,
  ): Phaser.GameObjects.Image {
    this.open = null;
    let item = this.projected[this.usedP];
    if (!item) {
      const image = this.scene.add.image(0, 0, atlas, frame);
      const parent = this.scene.add.container(0, 0, [image]);
      item = { parent, image };
      this.projected.push(item);
    } else item.image.setTexture(atlas, frame);
    this.usedP++;
    const transform = decomposeAffine(matrix);
    item.parent
      .setVisible(true)
      .setDepth(this.depth++)
      .setPosition(x, y)
      .setRotation(transform.outer)
      .setScale(transform.scaleX, transform.scaleY);
    return item.image
      .setVisible(true)
      .setPosition(0, 0)
      .setScale(1)
      .setRotation(transform.inner)
      .setAlpha(1)
      .clearTint();
  }

  /** The same frame washed white at `strength`, for a hit flash (placed like `like`). */
  whiteout(like: Phaser.GameObjects.Image, strength: number): void {
    const frame = like.frame;
    this.image(frame.texture.key, frame.name)
      .setOrigin(like.originX, like.originY)
      .setPosition(like.x, like.y)
      .setScale(like.scaleX, like.scaleY)
      .setRotation(like.rotation)
      .setTint(0xffffff)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(like.alpha * strength);
  }

  /** Hides what this frame did not use. */
  end(): void {
    for (let i = this.usedP; i < this.projected.length; i++)
      this.projected[i]!.parent.setVisible(false);
    for (let i = this.usedG; i < this.graphics.length; i++) {
      const g = this.graphics[i]!;
      if (g.visible) g.clear().setVisible(false);
    }
    for (let i = this.usedI; i < this.images.length; i++) this.images[i]!.setVisible(false);
  }
}
