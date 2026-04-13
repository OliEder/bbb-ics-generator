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

test.describe('Kalender-Abo-Bereich', () => {
  test('Überschrift "alle Spiele" im Alle-Panel sichtbar', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.calSectionHeading('panel-167881-all')).toContainText('alle Spiele');
  });

  test('Hilfe-Block ist initial zugeklappt', async ({ page }) => {
    const pg = new TeamPage(page);
    const details = pg.calHelp('panel-167881-all');
    await expect(details).toBeAttached();
    expect(await details.getAttribute('open')).toBeNull();
  });

  test('Hilfe-Block steht vor den Abo-Buttons', async ({ page }) => {
    const isBefore = await page.evaluate(() => {
      const help = document.querySelector('#panel-167881-all .cal-help');
      const btns = document.querySelector('#panel-167881-all .btn-group');
      if (!help || !btns) return false;
      return help.compareDocumentPosition(btns) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(isBefore).toBeTruthy();
  });

  test('"Link kopieren"-Button vorhanden', async ({ page }) => {
    const pg = new TeamPage(page);
    await expect(pg.copyButton('panel-167881-all')).toBeAttached();
  });

  test('Überschrift wechselt beim Tab-Wechsel zu "Heimspiele"', async ({ page }) => {
    const pg = new TeamPage(page);
    await pg.scheduleTab('Heim').click();
    await expect(pg.calSectionHeading('panel-167881-home')).toContainText('Heimspiele');
  });

  test('Überschrift wechselt beim Tab-Wechsel zu "Auswärtsspiele"', async ({ page }) => {
    const pg = new TeamPage(page);
    await pg.scheduleTab('Auswärts').click();
    await expect(pg.calSectionHeading('panel-167881-away')).toContainText('Auswärtsspiele');
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
