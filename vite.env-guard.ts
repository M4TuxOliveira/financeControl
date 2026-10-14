/**
 * VITE_DEV_AUTH (unsigned dev tokens) must never reach a deployable bundle: refuse it in production mode and in ANY
 * build whose mode is not `development` (e.g. `vite build --mode staging`). `vite` serve in non-production modes
 * (dev server, e2e, Vitest) and an explicit `--mode development` build stay allowed.
 */
export function assertSafeEnv(mode: string, env: Record<string, string | undefined>, command: 'build' | 'serve'): void {
  if (env.VITE_DEV_AUTH !== 'true') return;
  if (mode === 'production' || (command === 'build' && mode !== 'development')) {
    throw new Error(`VITE_DEV_AUTH=true must never be used in a ${command === 'build' ? `${mode} build` : `${mode}-mode server`}`);
  }
}
