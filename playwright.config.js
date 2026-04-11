// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  workers: 1,
  testDir: './tests/accessibility',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
