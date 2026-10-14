import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { collectErrors } from './errors.ts';

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

/**
 * Real touch input through the Chrome DevTools Protocol, so the browser produces genuine touch
 * pointer events (with capture, touch-action and all) rather than synthetic DOM events.
 */
class Finger {
  private constructor(private readonly cdp: CDPSession) {}
  static async on(page: Page): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page));
  }
  private async send(type: TouchType, x: number, y: number): Promise<void> {
    const touchPoints = type === 'touchEnd' ? [] : [{ x, y, id: 1 }];
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  async down(target: Locator, dx = 0, dy = 0): Promise<{ x: number; y: number }> {
    const b = (await target.boundingBox())!;
    const at = { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
    await this.send('touchStart', at.x, at.y);
    return at;
  }
  move(x: number, y: number): Promise<void> {
    return this.send('touchMove', x, y);
  }
  up(): Promise<void> {
    return this.send('touchEnd', 0, 0);
  }
  async hold(page: Page, target: Locator, ms: number): Promise<void> {
    await this.down(target);
    await page.waitForTimeout(ms);
    await this.up();
  }
}

test('phone: hold-to-buy, hold-to-start, joystick and Charge', async ({ page }) => {
  const errors = collectErrors(page);
  const finger = await Finger.on(page);
  await page.goto('./');
  await page.getByTestId('play').tap();
  await expect(page.getByTestId('rotate')).toHaveCount(0);
  await expect(page.getByTestId('gold')).toHaveText('75');

  const card = page.getByTestId('buy-0');
  const box = await card.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  // A tap does not buy; a hold does.
  await finger.hold(page, card, 80);
  await expect(page.getByTestId('gold')).toHaveText('75');
  await finger.hold(page, card, 600);
  await expect(page.getByTestId('gold')).toHaveText('50');

  // Up the stick to the castle, hold its card, tap a perk and hold Choose.
  const stick = page.getByTestId('joystick-zone');
  const from = await finger.down(stick);
  await finger.move(from.x, from.y - 40);
  await expect(page.getByTestId('castle-up')).toBeVisible();
  await finger.up();
  await finger.hold(page, page.getByTestId('castle-up'), 600);
  await expect(page.getByTestId('perk-picker')).toBeVisible();
  await expect(page.getByTestId('perk-choose')).toHaveClass(/disabled/);
  await finger.down(page.getByTestId('perk-0'));
  await finger.up();
  await page.screenshot({ path: 'test-results/phone-perks.png' });
  await finger.hold(page, page.getByTestId('perk-choose'), 600);
  await expect(page.getByTestId('perk-picker')).toBeHidden();
  await expect(page.getByTestId('castle-level')).toHaveText('2');
  await expect(page.getByTestId('gold')).toHaveText('15');

  await finger.hold(page, page.getByTestId('start-night'), 1300);
  await expect(page.getByTestId('night')).toContainText('Night 1');

  const zone = page.getByTestId('joystick-zone');
  const at = await finger.down(zone);
  await expect(zone.locator('.base')).toBeVisible();
  await finger.move(at.x - 40, at.y);
  await page.waitForTimeout(400);
  await finger.up();
  await expect(zone.locator('.base')).toHaveCount(0);

  const charge = page.getByTestId('charge');
  await expect(charge).toBeVisible();
  await finger.down(charge);
  await finger.up();
  await expect(charge).toBeDisabled();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/phone.png' });
  expect(errors).toEqual([]);
});

test('phone: portrait asks to rotate', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto('./#/play');
  await expect(page.getByTestId('rotate')).toBeVisible();
});
