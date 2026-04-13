// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { existsSync } = require('node:fs');
const { generatePages, sampleMetadata, sampleTheme, sampleLegal } = require('./helpers');

let pages;
test.beforeAll(() => {
  pages = generatePages(sampleTheme, sampleMetadata(), sampleLegal);
});

test('impressum.html existiert auf Disk', () => {
  expect(existsSync(pages.legalPath('impressum'))).toBe(true);
});

test('datenschutz.html existiert auf Disk', () => {
  expect(existsSync(pages.legalPath('datenschutz'))).toBe(true);
});

test('barrierefreiheit.html existiert auf Disk', () => {
  expect(existsSync(pages.legalPath('barrierefreiheit'))).toBe(true);
});

test('index.html enthält Links zu allen Legal-Seiten', async ({ page }) => {
  await page.goto(`file://${pages.indexPath}`);
  const hrefs = await page.locator('footer a').evaluateAll(els => els.map(el => el.getAttribute('href')));
  expect(hrefs).toContain('./impressum.html');
  expect(hrefs).toContain('./datenschutz.html');
  expect(hrefs).toContain('./barrierefreiheit.html');
});

test('Teamseite enthält Links zu allen Legal-Seiten', async ({ page }) => {
  const teamId = sampleMetadata()[0].teamId;
  await page.goto(`file://${pages.teamPath(teamId)}`);
  const hrefs = await page.locator('footer a').evaluateAll(els => els.map(el => el.getAttribute('href')));
  expect(hrefs).toContain('../impressum.html');
  expect(hrefs).toContain('../datenschutz.html');
  expect(hrefs).toContain('../barrierefreiheit.html');
});

test('Teamseite existiert für jeden Team-Eintrag', () => {
  const metadata = sampleMetadata();
  for (const team of metadata) {
    const p = pages.teamPath(team.teamId);
    expect(existsSync(p), `Team-Seite fehlt: ${p}`).toBe(true);
  }
});

test('Teamseite enthält Support-Links für Apple, Google und Microsoft', async ({ page }) => {
  const teamId = sampleMetadata()[0].teamId;
  await page.goto(`file://${pages.teamPath(teamId)}`);
  const hrefs = await page.locator('.cal-help__body a[href^="https"]').evaluateAll(els => els.map(el => el.getAttribute('href')));
  expect(hrefs.some(h => h.includes('support.apple.com'))).toBe(true);
  expect(hrefs.some(h => h.includes('support.google.com'))).toBe(true);
  expect(hrefs.some(h => h.includes('support.microsoft.com'))).toBe(true);
});
