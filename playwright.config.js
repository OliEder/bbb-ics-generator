// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  projects: [
    {
      name: 'chromium-a11y',
      use: { ...devices['Desktop Chrome'] },
      testDir: './tests/accessibility',
    },
    {
      name: 'chromium-ui',
      use: { ...devices['Desktop Chrome'] },
      testDir: './tests/ui',
    },
  ],
});
