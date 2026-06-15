/// <reference types="vitest" />
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin, ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';

const versionPath = fileURLToPath(new URL('../../VERSION', import.meta.url));
const version = existsSync(versionPath)
  ? readFileSync(versionPath, 'utf-8').trim()
  : '0.0.0-dev';
const commit = (process.env.APP_COMMIT ?? 'local').slice(0, 7);

// Media (family photos / living-portrait clips) is deliberately NOT in this
// public repo. Locally it lives in the gitignored <repo root>/media folder
// (mirroring the R2 bucket keys); in production it is served from R2 by
// functions/media/[[path]].ts. Dev serves the local folder when it exists,
// and otherwise proxies /media to the production site so the UI shows real
// media (contributors without either just get 404s → initials fallback).
const mediaDir = fileURLToPath(new URL('../../media', import.meta.url));
const hasLocalMedia = existsSync(mediaDir);
const PROD_SITE = 'https://family-tree-4fl.pages.dev';

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

// Minimal static server for the local media folder (no range support — fine
// for short, small dev clips). The '/media' mount strips the prefix from req.url.
function localMediaPlugin(dir: string): Plugin {
  const serve = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      next();
      return;
    }
    const file = join(dir, normalize(pathname).replace(/^[/\\]+/, ''));
    if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      next();
      return;
    }
    res.setHeader('Content-Type', MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    // Short freshness window so repeated mounts (popup dock ↔ maximize) reuse the
    // browser cache instead of re-downloading, while a swapped same-named file
    // still shows up within ~20s. Production uses far-future immutable caching.
    res.setHeader('Cache-Control', 'public, max-age=20');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'family-tree:local-media',
    configureServer(server) {
      server.middlewares.use('/media', serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/media', serve);
    }
  };
}

const mediaProxy: Record<string, ProxyOptions> = hasLocalMedia
  ? {}
  : { '/media': { target: PROD_SITE, changeOrigin: true } };

export default defineConfig({
  plugins: hasLocalMedia ? [vue(), localMediaPlugin(mediaDir)] : [vue()],
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
    // the same network (http://<this-machine-LAN-IP>:5173). The /api proxy and
    // /media handling run server-side, so the backend stays on localhost.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      ...mediaProxy
    }
  },
  // `vite preview` serves the minified production build. /api goes to the local
  // API; /media behaves exactly like dev (local folder or production proxy).
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      ...mediaProxy
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // Vitest 4 changed the default worker pool to 'forks' (child processes).
    // Keep the 'threads' pool that Vitest 1 defaulted to: it's faster for this
    // jsdom suite and avoids child-process worker start-up timeouts.
    pool: 'threads',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.d.ts']
    }
  }
});
