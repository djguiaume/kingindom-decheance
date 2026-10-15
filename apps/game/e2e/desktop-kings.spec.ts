import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: king choice is explicit and remembered', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');

  await expect(page.getByTestId('king-card')).toContainText('Panda King');
  await expect(page.getByTestId('king-picker')).toBeHidden();
  await page.getByTestId('king-card').click();
  await expect(page.getByTestId('king-roll')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('king-wolf')).toContainText('Hunting Lunge');
  await page.getByTestId('king-wolf').click();
  await expect(page.getByTestId('king-picker')).toBeHidden();
  await expect(page.getByTestId('king-card')).toContainText('Wolf Rider');

  await page.reload();
  await expect(page.getByTestId('king-card')).toContainText('Wolf Rider');
  await page.getByTestId('king-card').click();
  await expect(page.getByTestId('king-wolf')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('gold')).toHaveText('75');
  expect(errors).toEqual([]);
});
