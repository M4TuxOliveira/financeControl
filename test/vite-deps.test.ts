// @vitest-environment node
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

// The dev server pre-bundles dependencies with esbuild using `optimizeDeps.esbuildOptions`. amazon-cognito-identity-js
// pulls in the `buffer` polyfill, which reads the Node-only `global` at load time; in a browser that threw
// "global is not defined" and the whole app rendered a blank page under `npm run dev` / `npm run dev:local`.
describe('vite dev dependency pre-bundling', () => {
  it('loads amazon-cognito-identity-js in a browser-like context without a Node `global`', async () => {
    const config = typeof viteConfig === 'function' ? viteConfig({ mode: 'development', command: 'serve' }) : viteConfig;
    const define = (await config).optimizeDeps?.esbuildOptions?.define ?? {};
    const out = await build({
      stdin: { contents: "import * as c from 'amazon-cognito-identity-js'; globalThis.__ok = typeof c.CognitoUserPool;", resolveDir: process.cwd() },
      bundle: true, write: false, format: 'iife', platform: 'browser', define, logLevel: 'silent',
    });
    // A fresh realm with the browser's self/window aliases but none of Node's globals (no `global`, `require`, `Buffer`).
    const sandbox: Record<string, unknown> = {};
    runInNewContext(`globalThis.self = globalThis; globalThis.window = globalThis;\n${out.outputFiles[0].text}`, sandbox);
    expect(sandbox.__ok).toBe('function');
  }, 30_000);
});
