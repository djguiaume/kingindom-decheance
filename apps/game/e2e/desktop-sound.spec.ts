import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.ts';

/** Counts oscillators started (synthesized sounds, music) and recordings decoded and played. */
function countAudio() {
  const w = window as unknown as { __tones: number; __decoded: number; __recorded: number };
  w.__tones = 0;
  w.__decoded = 0;
  w.__recorded = 0;
  const create = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (this: AudioContext) {
    w.__tones++;
    return create.call(this);
  };
  const decode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function (this: AudioContext, data: ArrayBuffer) {
    return decode.call(this, data).then((b) => {
      w.__decoded++;
      return b;
    });
  } as typeof decode;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args) {
    // Recordings play once (no loop); noise layers and music loop their buffers.
    if (this.buffer && !this.loop && this.buffer.length > 1) w.__recorded++;
    return start.apply(this, args);
  } as typeof start;
}

test('desktop: sound unlocks on the first click, plays in a night, and M mutes', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.addInitScript(countAudio);
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);
  const count = (key: '__decoded' | '__recorded') =>
    page.evaluate((k) => (window as unknown as Record<string, number>)[k]!, key);

  await page.goto('./');
  await page.getByTestId('play').click();
  const sound = page.getByTestId('sound');
  await expect(sound).toHaveAttribute('data-muted', 'false');

  // Day music starts once the click has unlocked audio, and the recorded effects load.
  await expect.poll(tones).toBeGreaterThan(0);
  await expect.poll(() => count('__decoded')).toBeGreaterThanOrEqual(30);

  await page.keyboard.down('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('night')).toContainText('Night 1');
  const atNight = await tones();
  await page.keyboard.press(' ');
  await expect.poll(tones).toBeGreaterThan(atNight + 5);
  // The king's roll (Space) and the fighting around him play recordings, not only synthesis.
  await expect.poll(() => count('__recorded'), { timeout: 20_000 }).toBeGreaterThan(0);

  // M mutes, the button follows, and the choice survives a reload.
  await page.keyboard.press('m');
  await expect(sound).toHaveAttribute('data-muted', 'true');
  await page.reload();
  await expect(page.getByTestId('sound')).toHaveAttribute('data-muted', 'true');
  await page.getByTestId('sound').click();
  await expect(page.getByTestId('sound')).toHaveAttribute('data-muted', 'false');
  expect(errors).toEqual([]);
});

test('desktop: when the recordings fail to load, the synthesized sounds still play', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.addInitScript(countAudio);
  await page.route('**/sfx/**', (route) => route.fulfill({ status: 404, body: '' }));
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);

  await page.goto('./');
  await page.getByTestId('play').click();
  await expect.poll(tones).toBeGreaterThan(0);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('night')).toContainText('Night 1');
  const atNight = await tones();
  await page.keyboard.press(' ');
  await expect.poll(tones).toBeGreaterThan(atNight + 5);
  // The browser reports each 404 itself; nothing else may fail.
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});
