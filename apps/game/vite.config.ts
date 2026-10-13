import { execSync } from 'node:child_process';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the deploy workflow sets PAGES_BASE.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [vue()],
  define: {
    __COMMIT__: JSON.stringify(commit()),
  },
  build: {
    // Phaser alone is ~1.5 MB minified; that is expected for a game.
    chunkSizeWarningLimit: 2000,
  },
});
