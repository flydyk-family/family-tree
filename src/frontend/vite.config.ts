/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const version = readFileSync(
  fileURLToPath(new URL('../../VERSION', import.meta.url)),
  'utf-8'
).trim();
const commit = (process.env.APP_COMMIT ?? 'local').slice(0, 7);

export default defineConfig({
  plugins: [vue()],
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit)
  },
  server: {
    port: 5173,
    // Bind to all interfaces so the dev server is reachable from other devices on
    // the same network (http://<this-machine-LAN-IP>:5173). The /api and /assets
    // proxies run server-side, so the backend stays on localhost.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      '/assets': { target: 'http://localhost:5037', changeOrigin: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Vitest 4 changed the default worker pool to 'forks' (child processes).
    // Keep the 'threads' pool that Vitest 1 defaulted to: it's faster for this
    // jsdom suite and avoids child-process worker start-up timeouts.
    pool: 'threads',
    include: ['src/**/*.spec.ts']
  }
});
