// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function generateIndexHtml(theme, metadata) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-a11y-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  process.env.BBB_GENERATED_DIR = dir;
  const { genHTML } = require('../../src/generateHTML.js');
  genHTML(theme);
  return { dir, htmlPath: join(dir, 'index.html') };
}

function generateTeamHtml(theme, metadata) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-a11y-team-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  process.env.BBB_GENERATED_DIR = dir;
  const { genHTML } = require('../../src/generateHTML.js');
  genHTML(theme);
  return { dir, htmlPath: join(dir, 'teams', `${metadata[0].teamId}.html`) };
}

const sampleMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
  },
  {
    teamId: '167882',
    teamName: 'Test Team',
    ageGroup: 'U12',
    lastUpdate: new Date().toISOString(),
    matchCount: 1,
    homeMatchCount: 1,
    awayMatchCount: 0,
    logoUrl: 'https://www.basketball-bund.net/media/team/167882/logo',
  },
];

const DEFAULT_THEME = { primary: '#004174', accent: '#009ef3', cupColor: '#7c3aed', logoUrl: null };
const WITH_LOGO_THEME = {
  primary: '#004174',
  accent: '#009ef3',
  logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
};

test.describe('WCAG 2.1 AA — axe-core vollständiger Scan', () => {
  test('keine Violations ohne Logo', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine Violations mit Logo im Header', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(WITH_LOGO_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine Violations mit leerer Team-Liste', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, []);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine Violations auf Team-Seite', async ({ page }) => {
    const metadata = [
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
          { date: '2025-03-01', opponent: 'Roth', result: '24:18', isHome: true, isNext: false, competition: 'Kreisliga' },
          { date: '2025-04-17', opponent: 'Ansbach', result: null, isHome: false, isNext: true, competition: 'Kreisliga' },
        ],
        competitions: [
          { ligaId: '51961', liganame: 'Kreisliga Neumarkt', isLiga: true,
            table: [{ rank: 1, teamName: 'Fibalon U10', played: 4, won: 3, lost: 1, points: '6:2', isOwn: true }],
            bracket: null },
        ],
      },
    ];
    const { dir, htmlPath } = generateTeamHtml(DEFAULT_THEME, metadata);
    try {
      await page.goto(`file://${htmlPath}`);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

test.describe('WCAG 2.1 AA — strukturelle Prüfungen', () => {
  test('2.4.2 Seitentitel vorhanden', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const title = await page.title();
      expect(title.trim().length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('3.1.1 lang-Attribut auf <html>', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const lang = await page.getAttribute('html', 'lang');
      expect(lang).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.4.1 <main> und <header> Landmarks vorhanden', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      await expect(page.locator('main')).toBeAttached();
      await expect(page.locator('header')).toBeAttached();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.4.6 <h1> vorhanden und nicht leer', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const h1 = page.locator('h1');
      await expect(h1).toBeAttached();
      const text = await h1.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('4.1.2 aria-controls auf Tabs zeigt auf existierende Panels', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const tabs = page.locator('[role="tab"]');
      const count = await tabs.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const controlsId = await tabs.nth(i).getAttribute('aria-controls');
        expect(controlsId).toBeTruthy();
        const panel = page.locator(`#${controlsId}`);
        await expect(panel).toBeAttached();
        const role = await panel.getAttribute('role');
        expect(role).toBe('tabpanel');
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('4.1.2 Tablist hat aria-label', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const tablists = page.locator('[role="tablist"]');
      const count = await tablists.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const label = await tablists.nth(i).getAttribute('aria-label')
          || await tablists.nth(i).getAttribute('aria-labelledby');
        expect(label).toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.1.1 Tastaturnavigation: ArrowRight wechselt Tab', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const firstTab = page.locator('[role="tab"]').first();
      await firstTab.focus();
      await page.keyboard.press('ArrowRight');
      const secondTab = page.locator('[role="tab"]').nth(1);
      const selected = await secondTab.getAttribute('aria-selected');
      expect(selected).toBe('true');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('1.1.1 Alle <img> haben alt-Attribut', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(WITH_LOGO_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const images = page.locator('img');
      const count = await images.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const alt = await images.nth(i).getAttribute('alt');
        expect(alt).not.toBeNull();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
