import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: king and weapon choice is explicit and remembered', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');

  await expect(page.getByTestId('king-card')).toContainText('Panda King');
  await expect(page.getByTestId('king-picker')).toBeHidden();
  await page.getByTestId('king-card').click();
  await expect(page.getByTestId('king-roll')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('king-wolf')).toContainText('Hunting Lunge');
  await page.getByTestId('king-wolf').click();
  // The weapon sits under the kings: the Spear until another is picked.
  await expect(page.getByTestId('weapon-spear')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('weapon-longbow').click();
  await page.screenshot({ path: 'test-results/desktop-king-picker.png' });
  await page.getByTestId('king-done').click();
  await expect(page.getByTestId('king-picker')).toBeHidden();
  await expect(page.getByTestId('king-card')).toContainText('Wolf Rider');
  await expect(page.getByTestId('king-loadout')).toHaveText('Hunting Lunge · Longbow');

  await page.reload();
  await expect(page.getByTestId('king-card')).toContainText('Wolf Rider');
  await page.getByTestId('king-card').click();
  await expect(page.getByTestId('king-wolf')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('weapon-longbow')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('gold')).toHaveText('75');
  // The Wolf Rider's 190 HP, less the Longbow's fifth.
  await expect(page.locator('[title^="King "]')).toHaveAttribute('title', 'King 152 / 152');
  expect(errors).toEqual([]);
});
