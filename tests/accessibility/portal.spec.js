// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { createRun } = require('../fixtures/multiClubFixture');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** @type {ReturnType<typeof createRun>} */
let run;
/** @type {ReturnType<typeof createRun>} */
let privateRun;
test.beforeAll(async () => {
  run = createRun({
    configOverrides: { '3001': { legacyRootOutput: true } }, // Banner sichtbar
    wamCache: {
      generatedAt: new Date().toISOString(),
      ligenByVerbandId: { 2: [{ ligaId: 7002, liganame: 'Bezirksliga Gemeinsam', skEbeneId: 1, skEbeneName: 'Bezirk', bezirknr: 1, bezirkName: 'Oberbayern', kreisnr: null, kreisname: null }] },
    },
  });
  await run.cronModule.updateAll();
  // Privater Portalbetrieb (ADR-027): eigener Lauf; zweites createRun nach dem ersten Lauf,
  // Cleanup in umgekehrter Reihenfolge (stellt die Umgebung korrekt wieder her).
  privateRun = createRun({ portal: { private: true, operator: 'Privat Test', contactUrl: 'https://example.test/kontakt' } });
  await privateRun.cronModule.updateAll();
});
test.afterAll(() => { privateRun.cleanup(); run.cleanup(); });

const PAGES = [
  ['Bund-Seite (mit Banner)', () => run.paths.bund],
  ['Land-Seite Bayern (mit Ebenen-Gruppierung)', () => run.paths.land('bayern')],
  ['Land-Seite bundesweit', () => run.paths.land('bundesweit')],
  ['Portal-Impressum', () => run.paths.legal('impressum')],
  ['Bund-Seite (privater Betrieb)', () => privateRun.paths.bund],
  ['Portal-Datenschutz (privater Betrieb)', () => privateRun.paths.legal('datenschutz')],
];

for (const [name, getPath] of PAGES) {
  test(`axe WCAG 2.1 AA: ${name}`, async ({ page }) => {
    await page.goto(`file://${getPath()}`);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}

// axe wertet color-mix() nicht aus (siehe CLAUDE.md) — daher Kontrast selbst aus den vom Browser
// aufgelösten Farben berechnen. Ein 1x1-Canvas normalisiert jedes CSS-Farbformat zu RGBA.
async function contrastOf(page, selector) {
  const colors = await page.locator(selector).first().evaluate(el => {
    const toRgba = css => {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    let bg = [255, 255, 255, 255];
    for (let node = el; node; node = node.parentElement) {
      const candidate = toRgba(getComputedStyle(node).backgroundColor);
      if (candidate[3] > 0) { bg = candidate; break; }
    }
    return { fg: toRgba(getComputedStyle(el).color), bg };
  });
  const lum = ([r, g, b]) => {
    const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [hi, lo] = [lum(colors.fg), lum(colors.bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const CONTRAST_CHECKS = [
  ['Bund-Seite', () => run.paths.bund, ['.migration-banner', '.portal-region h2 a', '.portal-list a', '.portal-meta', '.site-footer', '.site-footer a']],
  ['Bund-Seite (privater Betrieb, Kontakt-Link)', () => privateRun.paths.bund, ['.site-footer', '.site-footer a[rel="noopener"][href^="https://example.test"]']],
  ['Land-Seite Bayern', () => run.paths.land('bayern'), ['.portal-list a', '.portal-group-heading', '.standings-table a', '.standings-table td', '.site-footer a']],
];

for (const scheme of ['light', 'dark']) {
  for (const [name, getPath, selectors] of CONTRAST_CHECKS) {
    test(`Kontrast ≥ 4.5:1 (${scheme}): ${name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: /** @type {'light'|'dark'} */ (scheme) });
      await page.goto(`file://${getPath()}`);
      for (const selector of selectors) {
        const ratio = await contrastOf(page, selector);
        expect(ratio, `${selector} (${scheme}) hat Kontrast ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
}
