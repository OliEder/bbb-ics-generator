'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// Helper: require generateHTML fresh with a given dir
function requireGenHTML(dir) {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  process.env.BBB_GENERATED_DIR = dir;
  return require('../../src/generateHTML.js');
}

const sampleMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets Neumarkt U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
  },
  {
    teamId: '167882',
    teamName: 'Test Team <script> & Co.',
    ageGroup: 'U12',
    lastUpdate: new Date().toISOString(),
    matchCount: 1,
    homeMatchCount: 1,
    awayMatchCount: 0,
    logoUrl: 'https://www.basketball-bund.net/media/team/167882/logo',
  },
];

const DEFAULT_THEME = { primary: '#004174', accent: '#009ef3', logoUrl: null };

test('index.html wird erstellt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    assert.ok(existsSync(join(dir, 'index.html')), 'index.html wurde nicht erstellt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('index.html enthält webcal:// Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('webcal://'), 'webcal:// Link fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('index.html enthält google.com/calendar/render Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('google.com/calendar/render'), 'Google Calendar Link fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('index.html enthält https://olieder.github.io Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('https://olieder.github.io'), 'GitHub Pages Link fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Teamname ist escaped (kein raw <, >, &)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    // The raw unescaped team name should not appear as-is (team name contains <script>)
    assert.ok(!html.includes('Test Team <script>'), 'Unescaped <script> im Teamnamen gefunden');
    assert.ok(html.includes('&lt;script&gt;'), 'HTML-Escaping fehlt für <script>');
    assert.ok(html.includes('&amp;'), 'HTML-Escaping fehlt für &');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Anzahl .team Divs = Anzahl Teams in metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const matches = html.match(/class="team-card"/g) || [];
    assert.equal(matches.length, sampleMetadata.length);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('CSS-Variablen für primary und accent sind im HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#ff0000', accent: '#00ff00', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('--color-primary: #ff0000'), 'primary CSS-Variable fehlt');
    assert.ok(html.includes('--color-accent') && html.includes('#00ff00'), 'accent CSS-Variable fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('sanitizeCssColor blockiert CSS-Injection im theme', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: 'red; background: url(evil)', accent: '#009ef3', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!html.includes('url(evil)'), 'CSS-Injection wurde nicht geblockt');
    assert.ok(html.includes('--color-primary: #004174'), 'Fallback-Farbe fehlt nach Injection-Versuch');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Dark Mode media query ist vorhanden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('prefers-color-scheme: dark'), 'Dark Mode media query fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Logo-URL wird als img-Tag eingebettet wenn vorhanden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: 'https://example.com/logo.png' });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('https://example.com/logo.png'), 'Logo-URL fehlt im HTML');
    assert.ok(html.includes('club-logo'), 'club-logo Klasse fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Kein club-logo img wenn logoUrl null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!html.includes('class="club-logo"'), 'club-logo img-Klasse sollte nicht vorhanden sein wenn kein Logo');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('color-mix() wird für abgeleitete Farben verwendet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('color-mix('), 'color-mix() fehlt im CSS');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Logo-URL aus teamId ist in Team-Card', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo' });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('media/team/167881/logo'), 'Team-Logo-URL fehlt im HTML');
    assert.ok(html.includes('media/team/167882/logo'), 'Team-Logo-URL für zweites Team fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Tab-Struktur mit role="tablist" ist vorhanden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('role="tablist"'), 'tablist role fehlt');
    assert.ok(html.includes('role="tab"'), 'tab role fehlt');
    assert.ok(html.includes('role="tabpanel"'), 'tabpanel role fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Jede Team-Card hat drei Tab-Panels (all, home, away)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const panels = html.match(/role="tabpanel"/g) || [];
    assert.equal(panels.length, sampleMetadata.length * 3, 'Falsche Anzahl tab panels');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Keyboard-Navigation JS ist eingebettet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('ArrowRight') || html.includes('arrowright'), 'Keyboard-Navigation JS fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
