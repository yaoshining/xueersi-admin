import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm --filter @xueersi/api start',
    url: 'http://127.0.0.1:3107/api/v1/health',
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: '3107',
      SERVE_WEB: 'true',
      DATABASE_PATH: ':memory:',
    },
  },
});
