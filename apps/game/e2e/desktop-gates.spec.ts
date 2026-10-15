import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: buy a painted gate, approach and leave it, then restart', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/play');
  await expect(page.getByTestId('gold')).toHaveText('75');
  await page.keyboard.down('a');
  await expect(page.getByTestId('buy-0')).toContainText('Wall', { timeout: 30000 });
  await page.keyboard.up('a');
  await page.keyboard.down('e');
  await page.waitForTimeout(600);
  await page.keyboard.up('e');
  await expect(page.getByTestId('gold')).toHaveText('65');
  await expect(page.getByTestId('slot-title')).toContainText('Wall');
  await page.screenshot({ path: 'test-results/gate-west-open.png' });
  await page.keyboard.down('d');
  await expect(page.getByTestId('slot-title')).not.toContainText('Wall', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.keyboard.up('d');
  await page.screenshot({ path: 'test-results/gate-west-closed.png' });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Restart run' }).click();
  await expect(page.getByTestId('gold')).toHaveText('75');
  expect(errors).toEqual([]);
});
