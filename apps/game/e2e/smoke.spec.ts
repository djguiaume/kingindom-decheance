import { expect, test } from '@playwright/test';

test('loads, starts a night and plays without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await page.getByTestId('play').click();
  await expect(page.locator('[data-testid="game"] canvas')).toBeVisible();

  await page
    .getByRole('button', { name: /Tower \(5\)/ })
    .first()
    .click();
  await expect(page.getByTestId('gold')).toHaveText('Gold 7');

  await page.getByTestId('start-night').click();
  await expect(page.getByText(/^Night 1/)).toBeVisible();
  await page.keyboard.down('a');
  await page.waitForTimeout(1500);
  await page.keyboard.up('a');

  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
