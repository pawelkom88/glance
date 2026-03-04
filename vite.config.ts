import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

function landingPageRouting(): Plugin {
  return {
    name: 'landing-page-routing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const reqAny = req as any;
        if (!reqAny.url) return next();
        const url = new URL(reqAny.url, 'http://localhost');
        const pathname = url.pathname;
        const search = url.search;

        if (pathname.startsWith('/@') || pathname.startsWith('/node_modules') || pathname.startsWith('/src')) {
          return next();
        }

        // Add logging to debug routing
        const debug = (msg: string) => {
          // console.log(`[landing-page-routing] ${msg}`);
        };

        if (pathname.endsWith('/')) {
          const indexPath = path.join(process.cwd(), 'landing-page', pathname, 'index.html');
          if (fs.existsSync(indexPath)) {
            debug(`Rewriting ${pathname} -> ${pathname}index.html`);
            reqAny.url = pathname + 'index.html' + search;
          }
        } else if (!path.extname(pathname)) {
          const htmlPath = path.join(process.cwd(), 'landing-page', pathname + '.html');
          const indexPath = path.join(process.cwd(), 'landing-page', pathname, 'index.html');

          if (fs.existsSync(htmlPath)) {
            debug(`Rewriting ${pathname} -> ${pathname}.html`);
            reqAny.url = pathname + '.html' + search;
          } else if (fs.existsSync(indexPath)) {
            debug(`Rewriting ${pathname} -> ${pathname}/index.html`);
            reqAny.url = pathname + '/index.html' + search;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    // @ts-expect-error type mismatch between vitest/config and vite
    landingPageRouting(),
    // @ts-expect-error type mismatch between vitest/config and vite
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },
  build: process.env.TAURI_ENV_PLATFORM
    ? {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
          }
        }
      }
    : {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            docs: path.resolve(__dirname, 'landing-page/docs.html'),
            guides: path.resolve(__dirname, 'landing-page/guides/index.html'),
            privacy: path.resolve(__dirname, 'landing-page/privacy.html'),
            terms: path.resolve(__dirname, 'landing-page/terms.html'),
            refund: path.resolve(__dirname, 'landing-page/refund.html'),
            'zoom-teleprompter': path.resolve(__dirname, 'landing-page/zoom-teleprompter/index.html'),
          }
        }
      },
  publicDir: process.env.TAURI_ENV_PLATFORM ? false : 'landing-page'
});
