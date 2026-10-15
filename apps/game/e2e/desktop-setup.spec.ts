import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: customise a run with a weapon, perks and mutators, remembered for the next Play', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('./');
  // A first launch has no setup: Play is a quick start.
  await expect(page.getByTestId('setup-line')).toHaveCount(0);
  await page.getByTestId('customise').click();
  // The weapon first: the Spear until another is picked.
  await expect(page.getByTestId('tab-weapon')).toHaveText('Spear');
  await page.getByTestId('weapon-longbow').click();
  await expect(page.getByTestId('tab-weapon')).toHaveText('Longbow');
  await page.screenshot({ path: 'test-results/desktop-setup-weapon.png' });
  // Perks: three slots, the rest locked once they are full.
  await page.getByTestId('tab-perks').click();
  await expect(page.getByTestId('perks').locator('button')).toHaveCount(9);
  for (const id of ['early_start', 'veterans', 'scarecrows'])
    await page.getByTestId(`perk-${id}`).click();
  await expect(page.getByTestId('tab-perks')).toHaveText('Perks 3/3');
  await expect(page.getByTestId('perk-gold_rush')).toBeDisabled();
  await page.screenshot({ path: 'test-results/desktop-setup-perks.png' });
  await page.getByTestId('tab-mutators').click();
  await expect(page.getByTestId('mutators').locator('button')).toHaveCount(7);
  await expect(page.getByTestId('setup-multiplier')).toHaveText('Score ×1.00');
  await page.getByTestId('mutator-swarm').click();
  await page.getByTestId('mutator-no_walls').click();
  await expect(page.getByTestId('mutator-swarm')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setup-multiplier')).toHaveText('Score ×1.70');
  await page.screenshot({ path: 'test-results/desktop-setup.png' });
  await page.getByTestId('start-run').click();

  // Early Start adds 40 gold; Swarm doubles night 1 (16 raiders instead of 8). The Longbow
  // costs the king a fifth of his HP.
  await expect(page.locator('[title^="King "]')).toHaveAttribute('title', 'King 160 / 160');
  await expect(page.getByTestId('gold')).toHaveText('115');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-night="1"]')).toContainText('16');
  await page.keyboard.press('Tab');

  // Back on the title screen, Play remembers the setup.
  await page.goto('./');
  await expect(page.getByTestId('setup-line')).toHaveText(
    'Longbow, Early Start, Scarecrows, Veterans, Swarm, No Walls · score ×1.70',
  );
  expect(errors).toEqual([]);
});
