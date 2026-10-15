import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: customise a run with mutators, remembered for the next Play', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  // A first launch has no setup: Play is a quick start.
  await expect(page.getByTestId('setup-line')).toHaveCount(0);
  await page.getByTestId('customise').click();
  await expect(page.getByTestId('mutators').locator('button')).toHaveCount(7);
  await expect(page.getByTestId('setup-multiplier')).toHaveText('Score ×1.00');
  await page.getByTestId('mutator-swarm').click();
  await page.getByTestId('mutator-no_walls').click();
  await expect(page.getByTestId('mutator-swarm')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setup-multiplier')).toHaveText('Score ×1.70');
  await page.screenshot({ path: 'test-results/desktop-setup.png' });
  await page.getByTestId('start-run').click();

  // Swarm doubles night 1: the waves panel shows 16 raiders instead of 8.
  await expect(page.getByTestId('gold')).toHaveText('75');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-night="1"]')).toContainText('16');
  await page.keyboard.press('Tab');

  // Back on the title screen, Play remembers the setup.
  await page.goto('./');
  await expect(page.getByTestId('setup-line')).toHaveText('Swarm, No Walls · score ×1.70');
  expect(errors).toEqual([]);
});
