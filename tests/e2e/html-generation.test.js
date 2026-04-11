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
  },
  {
    teamId: '167882',
    teamName: 'Test Team <script> & Co.',
    ageGroup: 'U12',
    lastUpdate: new Date().toISOString(),
    matchCount: 1,
    homeMatchCount: 1,
    awayMatchCount: 0,
  },
];

test('index.html wird erstellt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML();
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
    genHTML();
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
    genHTML();
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
    genHTML();
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
    genHTML();
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    // The raw unescaped name should not appear
    assert.ok(!html.includes('<script>'), 'Unescaped <script> gefunden');
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
    genHTML();
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const matches = html.match(/class="team-card"/g) || [];
    assert.equal(matches.length, sampleMetadata.length);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
