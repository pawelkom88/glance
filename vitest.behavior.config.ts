import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    include: ['src/test/behavior/**/*.behavior.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    environment: 'jsdom',
    globals: true
  }
}));
