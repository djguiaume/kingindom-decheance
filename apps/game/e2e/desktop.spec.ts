import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: keyboard holds buy and start the night', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.getByTestId('play').click();
  await expect(page.getByTestId('gold')).toHaveText('🪙 50');
  await expect(page.getByTestId('buy-0')).toBeVisible();

  // Hold E to buy: a tap is not enough, a 0.4 s hold is.
  await page.keyboard.press('e');
  await expect(page.getByTestId('gold')).toHaveText('🪙 50');
  await page.keyboard.down('e');
  await page.waitForTimeout(600);
  await page.keyboard.up('e');
  await expect(page.getByTestId('gold')).toHaveText('🪙 25');

  // Hold Enter for 1 s to start the night.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('night')).toContainText('Day 1');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('night')).toContainText('Night 1');

  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  await page.keyboard.press(' ');
  await page.keyboard.up('a');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/desktop.png' });
  expect(errors).toEqual([]);
});
