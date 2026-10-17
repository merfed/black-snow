import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Shown on the station page so it is clear which build is live. CI adds the short commit.
const sha = process.env.GITHUB_SHA ? ` ${process.env.GITHUB_SHA.slice(0, 7)}` : '';
const build = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${sha}`;

// Relative base so the build runs from any static host or a subfolder (itch.io, GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
  },
});
