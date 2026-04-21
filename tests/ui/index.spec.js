// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { generatePages, sampleMetadata, sampleTheme, sampleLegal } = require('./helpers');
const { IndexPage } = require('./pages/index.page');

let pages;
test.beforeAll(() => {
  pages = generatePages(sampleTheme, sampleMetadata(), sampleLegal);
});

test.beforeEach(async ({ page }) => {
  await page.goto(`file://${pages.indexPath}`);
});

test.describe('Spotlight-Tabs', () => {
  test('Klick auf "Heim" zeigt Home-Panel und versteckt Away-Panel', async ({ page }) => {
    const pg = new IndexPage(page);
    await pg.spotlightTab('Heim').click();
    await expect(pg.spotlightPanel('spotlight-away')).toBeHidden();
    await expect(pg.spotlightPanel('spotlight-home')).toBeVisible();
  });

  test('Klick auf "Auswärts" zeigt Away-Panel und versteckt Home-Panel', async ({ page }) => {
    const pg = new IndexPage(page);
    await pg.spotlightTab('Auswärts').click();
    await expect(pg.spotlightPanel('spotlight-home')).toBeHidden();
    await expect(pg.spotlightPanel('spotlight-away')).toBeVisible();
  });

  test('ArrowRight wechselt Fokus vom ersten zum zweiten Tab', async ({ page }) => {
    const pg = new IndexPage(page);
    await pg.spotlightTab('Alle').focus();
    await page.keyboard.press('ArrowRight');
    await expect(pg.spotlightTab('Heim')).toBeFocused();
  });
});

test.describe('Teaser-Karten', () => {
  test('Heimspiel-Zeile enthält "vs." Prefix', async ({ page }) => {
    const pg = new IndexPage(page);
    const texts = await pg.teaserRows().allInnerTexts();
    expect(texts.some(t => t.includes('vs.'))).toBe(true);
  });

  test('Auswärtsspiel-Zeile enthält "@" Prefix', async ({ page }) => {
    const pg = new IndexPage(page);
    const texts = await pg.teaserRows().allInnerTexts();
    expect(texts.some(t => t.includes('@'))).toBe(true);
  });

  test('Gegner-Name ist linksbündig (text-align: left)', async ({ page }) => {
    const pg = new IndexPage(page);
    const textAlign = await pg.teaserOpponent().evaluate(el =>
      window.getComputedStyle(el).textAlign
    );
    expect(textAlign).toBe('left');
  });
});

test.describe('Footer', () => {
  test('Footer ist vorhanden', async ({ page }) => {
    const pg = new IndexPage(page);
    await expect(pg.footer()).toBeVisible();
  });

  test('Quellenlink zeigt auf basketball-bund.net', async ({ page }) => {
    const pg = new IndexPage(page);
    await expect(pg.footerLink('https://www.basketball-bund.net')).toBeVisible();
  });

  test('Impressum-Link vorhanden', async ({ page }) => {
    const pg = new IndexPage(page);
    await expect(pg.footerLink('./impressum.html')).toBeVisible();
  });

  test('Datenschutz-Link vorhanden', async ({ page }) => {
    const pg = new IndexPage(page);
    await expect(pg.footerLink('./datenschutz.html')).toBeVisible();
  });

  test('Barrierefreiheit-Link vorhanden', async ({ page }) => {
    const pg = new IndexPage(page);
    await expect(pg.footerLink('./barrierefreiheit.html')).toBeVisible();
  });
});

test.describe('Ergebnis-Icons auf Startseite', () => {
  test('Teaser-Karte zeigt Sieg-Icon', async ({ page }) => {
    await page.goto(`file://${pages.indexPath}`);
    const icon = page.locator('.teaser-result [aria-label="Sieg"]');
    await expect(icon.first()).toBeVisible();
  });

  test('Teaser-Karte zeigt Niederlage-Icon', async ({ page }) => {
    await page.goto(`file://${pages.indexPath}`);
    const icon = page.locator('.teaser-result [aria-label="Niederlage"]');
    await expect(icon.first()).toBeVisible();
  });

  test('Spotlight zeigt Sieg-Icon', async ({ page }) => {
    await page.goto(`file://${pages.indexPath}`);
    const icon = page.locator('.spotlight [aria-label="Sieg"]');
    await expect(icon.first()).toBeVisible();
  });

  test('Spotlight zeigt Niederlage-Icon', async ({ page }) => {
    await page.goto(`file://${pages.indexPath}`);
    const icon = page.locator('.spotlight [aria-label="Niederlage"]');
    await expect(icon.first()).toBeVisible();
  });
});
