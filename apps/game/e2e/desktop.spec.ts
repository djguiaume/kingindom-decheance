import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: keyboard holds buy and start the night', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  // The title screen (F03/F16): the compact king card, and accurate controls one click away.
  await expect(page.getByTestId('king-card')).toBeVisible();
  await page.getByTestId('how-to-play').click();
  await expect(page.getByTestId('controls')).toContainText('Call the night');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('gold')).toHaveText('75');
  await expect(page.getByTestId('buy-0')).toBeVisible();

  // Tonight's spawn is off-screen: an edge arrow points at it.
  await expect(page.locator('[data-kind="spawn"]')).toHaveCount(1);
  // The marker is one red pin with the enemy icons and counts inside it.
  await expect(page.locator('[data-kind="spawn"] .part')).not.toHaveCount(0);
  // The night track shows one pip per night, the boss night marked.
  await expect(page.getByTestId('night').locator('[data-pip]')).toHaveCount(6);
  // The buy button says what the building does.
  await expect(page.getByTestId('offer-stats').first()).not.toBeEmpty();
  // Tab opens the waves panel: tonight and the next night, then every night on request.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('waves-panel').locator('[data-night]')).toHaveCount(2);
  await expect(page.locator('[data-night="1"]')).toHaveClass(/tonight/);
  await page.getByTestId('waves-all').click();
  await expect(page.getByTestId('waves-panel').locator('[data-night]')).toHaveCount(6);
  await expect(page.locator('[data-night="6"] .boss')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-waves.png' });
  await page.keyboard.press('Tab');

  // Hold E to buy: a tap is not enough, a 0.4 s hold is.
  await page.keyboard.press('e');
  await expect(page.getByTestId('gold')).toHaveText('75');
  await page.keyboard.down('e');
  await page.waitForTimeout(600);
  await page.keyboard.up('e');
  await expect(page.getByTestId('gold')).toHaveText('50');
  const watchtower = page.getByTestId('buy-0');
  await expect(watchtower).toContainText('Watchtower');
  await expect(watchtower).toContainText('35');
  expect(
    await watchtower.evaluate((card) => {
      const box = card.getBoundingClientRect();
      return (
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight &&
        card.scrollWidth <= card.clientWidth &&
        card.scrollHeight <= card.clientHeight
      );
    }),
  ).toBe(true);

  // Walk up to the castle: its card offers level 2; holding E opens the perk picker.
  await page.keyboard.down('w');
  await expect(page.getByTestId('castle-up')).toBeVisible();
  await page.keyboard.up('w');
  await page.keyboard.down('e');
  await page.waitForTimeout(600);
  await page.keyboard.up('e');
  await expect(page.getByTestId('perk-picker')).toBeVisible();
  await expect(page.getByTestId('perk-picker').locator('.perk')).toHaveCount(3);
  // Choosing needs a selection first; 2 selects the second card, a hold of E confirms.
  await page.keyboard.press('Digit2');
  await expect(page.getByTestId('perk-1')).toHaveClass(/picked/);
  await page.screenshot({ path: 'test-results/desktop-perks.png' });
  await page.keyboard.down('e');
  await page.waitForTimeout(600);
  await page.keyboard.up('e');
  await expect(page.getByTestId('perk-picker')).toBeHidden();
  await expect(page.getByTestId('gold')).toHaveText('15');
  await expect(page.getByTestId('castle-level')).toHaveText('2');
  await page.screenshot({ path: 'test-results/desktop-castle-2.png' });

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
