import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /production-server\.spec\.ts/,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'HOST=127.0.0.1 PORT=4174 VAULT_DIR=tests/fixtures/vault-a npm start',
    url: 'http://127.0.0.1:4174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
