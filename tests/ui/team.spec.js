// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { generatePages, sampleMetadata, sampleTheme, sampleLegal } = require('./helpers');
const { TeamPage } = require('./pages/team.page');

let pages;
test.beforeAll(() => {
  pages = generatePages(sampleTheme, sampleMetadata(), sampleLegal);
});

test.beforeEach(async ({ page }) => {
  await page.goto(`file://${pages.teamPath('167881')}`);
});

test.describe('Spielplan-Tabs', () => {
  test('Tab "Heim" ist klickbar und wird als aktiv markiert', async ({ page }) => {
    const pg = new TeamPage(page);
    const heimTab = pg.scheduleTab('Heim');
    await heimTab.click();
    await expect(heimTab).toHaveAttribute('aria-selected', 'true');
  });

  test('Tab "Auswärts" ist klickbar und wird als aktiv markiert', async ({ page }) => {
    const pg = new TeamPage(page);
    const awayTab = pg.scheduleTab('Auswärts');
    await awayTab.click();
    await expect(awayTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Spielzeilen-Badges', () => {
  test('Heimspiel-Badge (.badge--home) ist vorhanden', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.homeBadges().first()).toBeVisible();
  });

  test('Auswärtsspiel-Badge (.badge--away) ist vorhanden', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.awayBadges().first()).toBeVisible();
  });
});

test.describe('Footer', () => {
  test('Footer ist vorhanden', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.footer()).toBeVisible();
  });

  test('Datenschutz-Link zeigt auf ../datenschutz.html', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.footerLink('../datenschutz.html')).toBeVisible();
  });

  test('Barrierefreiheit-Link zeigt auf ../barrierefreiheit.html', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.footerLink('../barrierefreiheit.html')).toBeVisible();
  });

  test('Impressum-Link zeigt auf ../impressum.html', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.footerLink('../impressum.html')).toBeVisible();
  });
});
