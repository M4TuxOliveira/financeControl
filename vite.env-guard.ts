export function assertSafeEnv(mode: string, env: Record<string, string | undefined>): void {
  if (mode === 'production' && env.VITE_DEV_AUTH === 'true') {
    throw new Error('VITE_DEV_AUTH=true must never be used in a production build');
  }
}
