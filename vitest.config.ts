import { defineConfig } from 'vitest/config';

// Tier 1 (unit, content, determinism, properties) and tier 2 (golden runs) of ADR-007.
// Every test runs in Node, without a browser.
export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/game/test/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
    ],
  },
});
