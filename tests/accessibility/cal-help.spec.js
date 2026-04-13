// @ts-check
// Tests für den Kalender-Hilfe-Block (<details>) und den „Link kopieren"-Button.
// Bewusst getrennt von wcag.spec.js, um Merge-Konflikte bei paralleler Entwicklung zu vermeiden.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function generateTeamHtml(metadata) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-calhelp-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  process.env.BBB_GENERATED_DIR = dir;
  const { genHTML } = require('../../src/generateHTML.js');
  genHTML({ primary: '#004174', accent: '#009ef3', cupColor: '#7c3aed', logoUrl: null });
  return { dir, htmlPath: join(dir, 'teams', `${metadata[0].teamId}.html`) };
}

const teamMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
    matches: [
      { date: '2025-03-01', opponent: 'Roth',    result: '24:18', isHome: true,  isNext: false, competition: 'Kreisliga' },
      { date: '2025-04-17', opponent: 'Ansbach', result: null,    isHome: false, isNext: true,  competition: 'Kreisliga' },
    ],
    competitions: [],
  },
];

test.describe('Kalender-Hilfe <details>-Block', () => {
  test('Block ist initial zugeklappt', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const details = page.locator('.cal-help').first();
      await expect(details).toBeAttached();
      const open = await details.getAttribute('open');
      expect(open).toBeNull();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Block öffnet sich nach Klick auf Summary', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const summary = page.locator('.cal-help__summary').first();
      await summary.click();
      const details = page.locator('.cal-help').first();
      const open = await details.getAttribute('open');
      expect(open).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Inhalt nach Aufklappen sichtbar', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      await page.locator('.cal-help__summary').first().click();
      const body = page.locator('.cal-help__body').first();
      await expect(body).toBeVisible();
      await expect(body).toContainText('iOS');
      await expect(body).toContainText('Google');
      await expect(body).toContainText('Outlook');
      await expect(body).toContainText('ICS');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Summary ist per Tastatur fokussierbar und per Enter öffenbar', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const summary = page.locator('.cal-help__summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      const details = page.locator('.cal-help').first();
      const open = await details.getAttribute('open');
      expect(open).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Externe Support-Links öffnen in neuem Tab (target=_blank)', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      await page.locator('.cal-help__summary').first().click();
      const links = page.locator('.cal-help__body a[href^="https"]');
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(links.nth(i)).toHaveAttribute('target', '_blank');
        await expect(links.nth(i)).toHaveAttribute('rel', 'noopener');
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine WCAG-Violations mit geöffnetem Hilfe-Block', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      await page.locator('.cal-help__summary').first().click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

test.describe('„Link kopieren"-Button', () => {
  test('Button ist im DOM vorhanden', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const btn = page.locator('.btn--copy').first();
      await expect(btn).toBeAttached();
      await expect(btn).toContainText('Link kopieren');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Button hat data-copy-url mit HTTPS-Link', async ({ page }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const btn = page.locator('.btn--copy').first();
      const url = await btn.getAttribute('data-copy-url');
      expect(url).toBeTruthy();
      expect(url).toMatch(/^https:\/\//);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Klick auf Button schreibt URL in Zwischenablage', async ({ page, context }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`file://${htmlPath}`);
      const btn = page.locator('.btn--copy').first();
      const expectedUrl = await btn.getAttribute('data-copy-url');
      await btn.click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe(expectedUrl);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Button zeigt Bestätigung nach Klick', async ({ page, context }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`file://${htmlPath}`);
      const btn = page.locator('.btn--copy').first();
      await btn.click();
      await expect(btn).toContainText('Link kopiert');
      await expect(btn).toHaveClass(/btn--copy--copied/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('Button stellt Original-Label nach 2 Sekunden wieder her', async ({ page, context }) => {
    const { dir, htmlPath } = generateTeamHtml(teamMetadata);
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`file://${htmlPath}`);
      const btn = page.locator('.btn--copy').first();
      await btn.click();
      await expect(btn).toContainText('Link kopiert');
      await page.waitForTimeout(2200);
      await expect(btn).toContainText('Link kopieren');
      await expect(btn).not.toHaveClass(/btn--copy--copied/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
