/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertSafeEnv } from './vite.env-guard';

// base './' keeps asset URLs relative so the build works on any static host.
export default defineConfig(({ mode, command }) => {
  assertSafeEnv(mode, loadEnv(mode, process.cwd(), ''), command);
  return {
    base: './',
    plugins: [react()],
    // amazon-cognito-identity-js → `buffer` reads Node's `global` at load time. The production build (Rollup
    // commonjs) rewrites it, but the dev server's esbuild pre-bundle does not: map it to globalThis there.
    optimizeDeps: { esbuildOptions: { define: { global: 'globalThis' } } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
