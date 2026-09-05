import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

function landingPageRouting(): Plugin {
  const landingPageRoot = path.join(process.cwd(), 'landing-page');

  function resolveLandingPageRequest(pathname: string): string | null {
    if (pathname === '/' || pathname === '/index.html') {
      return null;
    }

    if (pathname === '/landing-page' || pathname === '/landing-page/' || pathname === '/landing-page/index.html') {
      return path.join(landingPageRoot, 'index.html');
    }

    const normalizedPath = pathname.replace(/^\/+/, '');

    if (pathname.endsWith('/')) {
      const indexPath = path.join(landingPageRoot, normalizedPath, 'index.html');
      return fs.existsSync(indexPath) ? indexPath : null;
    }

    const extension = path.extname(pathname);
    if (!extension) {
      const htmlPath = path.join(landingPageRoot, `${normalizedPath}.html`);
      if (fs.existsSync(htmlPath)) {
        return htmlPath;
      }

      const indexPath = path.join(landingPageRoot, normalizedPath, 'index.html');
      return fs.existsSync(indexPath) ? indexPath : null;
    }

    if (extension === '.html') {
      const exactHtmlPath = path.join(landingPageRoot, normalizedPath);
      return fs.existsSync(exactHtmlPath) ? exactHtmlPath : null;
    }

    return null;
  }

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

        const landingPageFile = resolveLandingPageRequest(pathname);
        if (landingPageFile) {
          debug(`Serving ${pathname} from ${landingPageFile}`);
          return server.transformIndexHtml(pathname, fs.readFileSync(landingPageFile, 'utf8'), reqAny.originalUrl || reqAny.url)
            .then((html) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(html);
            })
            .catch(next);
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
    include: ['src/**/*.test.{ts,tsx}'],
  },
  clearScreen: false,
  css: {
    postcss: {}
  },
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
            'script-template': path.resolve(__dirname, 'landing-page/script-template/index.html'),
            privacy: path.resolve(__dirname, 'landing-page/privacy.html'),
            terms: path.resolve(__dirname, 'landing-page/terms.html'),
            refund: path.resolve(__dirname, 'landing-page/refund.html'),
            'zoom-teleprompter': path.resolve(__dirname, 'landing-page/zoom-teleprompter/index.html'),
          }
        }
      },
  publicDir: process.env.TAURI_ENV_PLATFORM ? false : 'landing-page'
});
