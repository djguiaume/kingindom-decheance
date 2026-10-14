import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

test('desktop: sound unlocks on the first click, plays in a night, and M mutes', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Count oscillators the game starts, to see that sounds really play.
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__tones++;
      return create.call(this);
    };
  });
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);

  await page.goto('./');
  await page.getByTestId('play').click();
  const sound = page.getByTestId('sound');
  await expect(sound).toHaveAttribute('data-muted', 'false');

  // Day music starts once the click has unlocked audio.
  await expect.poll(tones).toBeGreaterThan(0);

  await page.keyboard.down('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('night')).toContainText('Night 1');
  const atNight = await tones();
  await page.keyboard.press(' ');
  await expect.poll(tones).toBeGreaterThan(atNight + 5);

  // M mutes, the button follows, and the choice survives a reload.
  await page.keyboard.press('m');
  await expect(sound).toHaveAttribute('data-muted', 'true');
  await page.reload();
  await expect(page.getByTestId('sound')).toHaveAttribute('data-muted', 'true');
  await page.getByTestId('sound').click();
  await expect(page.getByTestId('sound')).toHaveAttribute('data-muted', 'false');
  expect(errors).toEqual([]);
});
