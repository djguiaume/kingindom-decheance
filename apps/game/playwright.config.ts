import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests (ADR-007, ADR-009): the production build on a desktop and on a phone in
// landscape with touch. Locally, PW_CHROMIUM_PATH can point at an installed Chromium.
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /desktop/ },
    // Pixel runs on Chromium; an iPhone preset needs WebKit, which CI does not install yet.
    { name: 'phone', use: { ...devices['Pixel 7 landscape'] }, testMatch: /phone/ },
  ],
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
