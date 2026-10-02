// @ts-check
'use strict';

// Kritischer Use Case (Plan A, zurückgestellt): Verein über Bund → Land → Club finden.
// Relative Links, geprüft über file:// (ohne PORTAL_BASE_URL/Server), mit den 10 Fixture-Clubs.
const { test, expect } = require('@playwright/test');
const { createRun } = require('../fixtures/multiClubFixture');

/** @type {ReturnType<typeof createRun>} */
let run;
test.beforeAll(async () => {
  run = createRun();
  await run.cronModule.updateAll();
});
test.afterAll(() => run.cleanup());

const PATHS = [
  ['Baden-Württemberg', 'Verein 3001'],
  ['Hessen', 'Verein 3007'],
  ['Sachsen', 'Verein 3006'],
  ['Bundesweite Wettbewerbe', 'Verein 3009'],
];

for (const [region, club] of PATHS) {
  test(`Bund → ${region} → ${club}`, async ({ page }) => {
    await page.goto(`file://${run.paths.bund}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('BBB Vereinsportal');

    await page.getByRole('heading', { level: 2 }).getByRole('link', { name: region, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(region);

    await page.locator('main').getByRole('link', { name: club, exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Basketball Spielplan');
  });
}

test('Bayern: beide Vereine der gemeinsamen Liga sind über die Tabelle erreichbar', async ({ page }) => {
  await page.goto(`file://${run.paths.land('bayern')}`);
  await expect(page.locator('table.standings-table').first()).toBeVisible();
  await page.locator('table.standings-table').first().getByRole('link', { name: 'Team 3010' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Basketball Spielplan');
});

test('Nav-Logo der Land-Seite führt zurück zur Bund-Seite', async ({ page }) => {
  await page.goto(`file://${run.paths.land('hessen')}`);
  await page.getByRole('link', { name: 'BBB Vereinsportal' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('BBB Vereinsportal');
});
