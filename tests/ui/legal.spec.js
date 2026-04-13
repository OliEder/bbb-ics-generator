// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { generatePages, sampleMetadata, sampleTheme, sampleLegal } = require('./helpers');
const { LegalPage } = require('./pages/legal.page');

let pages;
test.beforeAll(() => {
  pages = generatePages(sampleTheme, sampleMetadata(), sampleLegal);
});

test.describe('impressum.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${pages.legalPath('impressum')}`);
  });

  test('Überschrift "Impressum" ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    await expect(pg.heading()).toHaveText('Impressum');
  });

  test('Betreibername aus config ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    const text = await pg.bodyText().innerText();
    expect(text).toContain(sampleLegal.operator);
  });

  test('Adresse aus config ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    const text = await pg.bodyText().innerText();
    expect(text).toContain(sampleLegal.address);
  });
});

test.describe('datenschutz.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${pages.legalPath('datenschutz')}`);
  });

  test('Überschrift "Datenschutzerklärung" ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    await expect(pg.heading()).toHaveText('Datenschutzerklärung');
  });

  test('"basketball-bund.net" wird erwähnt', async ({ page }) => {
    const pg = new LegalPage(page);
    const text = await pg.bodyText().innerText();
    expect(text).toContain('basketball-bund.net');
  });

  test('"cdnjs" wird erwähnt', async ({ page }) => {
    const pg = new LegalPage(page);
    const text = await pg.bodyText().innerText();
    expect(text).toContain('cdnjs');
  });
});

test.describe('barrierefreiheit.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${pages.legalPath('barrierefreiheit')}`);
  });

  test('Überschrift "Barrierefreiheitserklärung" ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    await expect(pg.heading()).toHaveText('Barrierefreiheitserklärung');
  });

  test('Konformitätsstatus "teilweise konform" ist sichtbar', async ({ page }) => {
    const pg = new LegalPage(page);
    const text = await pg.bodyText().innerText();
    expect(text.toLowerCase()).toContain('teilweise konform');
  });
});
