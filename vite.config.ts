/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertSafeEnv } from './vite.env-guard';

// base './' keeps asset URLs relative so the build works on any static host.
export default defineConfig(({ mode }) => {
  assertSafeEnv(mode, loadEnv(mode, process.cwd(), ''));
  return {
    base: './',
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
