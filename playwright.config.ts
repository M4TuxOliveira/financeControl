import { defineConfig, devices } from '@playwright/test';

// Requires the local stack to be running: `npm run stack` in another terminal (see README → Local full stack).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:5173', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
