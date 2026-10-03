import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  reporter: process.env.CI !== undefined ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // PLAYWRIGHT_CHANNEL=chrome runs against an installed Chrome when the download is blocked
        ...(process.env.PLAYWRIGHT_CHANNEL === undefined
          ? {}
          : { channel: process.env.PLAYWRIGHT_CHANNEL }),
      },
    },
  ],
  webServer: {
    // the site is built against the fixture snapshot so the assertions don't move with the data
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 180_000,
    env: {
      SNAPSHOT_PATH: '../../fixtures/web/snapshot.fixture.json',
      // placeholders, so the admin dialog renders as it does in a configured build; no test
      // follows the sign-in link, and .invalid never resolves if one did
      VITE_API_BASE_URL: 'https://api.example.invalid',
      VITE_COGNITO_DOMAIN: 'https://auth.example.invalid',
      VITE_COGNITO_CLIENT_ID: 'e2e-client',
    },
  },
});
