import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Zephyr E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/specs',

  // Run tests sequentially - service worker tests need isolation
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Single worker for service worker state isolation
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],

  // Shared settings for all the projects
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // Using port 5197 to avoid interference with dev server
    baseURL: 'http://localhost:5197',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Enable service workers
    serviceWorkers: 'allow',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm dev --port 5197',
    url: 'http://localhost:5197',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
