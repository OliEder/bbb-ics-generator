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
    assert.ok(!html.includes('class="club-logo"'), 'club-logo im Header sollte nicht vorhanden sein wenn kein Logo');
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

const sampleMetadataWithMatches = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets Neumarkt U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
    matches: [
      {
        date: '2025-10-12',
        time: '15:00',
        opponent: 'TSV Musterstadt',
        isHome: true,
        result: '62:58',
        competition: 'Kreisliga Mittelfranken',
        isNext: false,
      },
      {
        date: '2025-10-26',
        time: '14:00',
        opponent: 'SV Demo',
        isHome: true,
        result: null,
        competition: 'Kreisliga Mittelfranken',
        isNext: true,
      },
    ],
  },
];

test('Vergangenes Spiel hat opacity-Stil (gedimmt)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadataWithMatches));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('opacity'), 'opacity-Stil für vergangene Spiele fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Nächstes Spiel hat schedule-next Klasse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadataWithMatches));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('schedule-next'), 'schedule-next Klasse für nächstes Spiel fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Heim-Tab enthält nur Heimspiele', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  const metaHomeAway = [
    {
      teamId: '167881',
      teamName: 'Test Team',
      ageGroup: 'U10',
      lastUpdate: new Date().toISOString(),
      matchCount: 2, homeMatchCount: 1, awayMatchCount: 1,
      logoUrl: null,
      matches: [
        { date: '2025-10-12', time: '15:00', opponent: 'Heimgegner', isHome: true,  result: '60:50', competition: 'Kreisliga', isNext: false },
        { date: '2025-10-19', time: '15:00', opponent: 'Auswärtsgegner', isHome: false, result: null, competition: 'Kreisliga', isNext: true },
      ],
    },
  ];
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metaHomeAway));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    // panel-167881-home must contain Heimgegner but NOT Auswärtsgegner
    const homePanel = html.match(/id="panel-167881-home"[\s\S]*?(?=id="panel-167881-away")/)?.[0] || '';
    assert.ok(homePanel.includes('Heimgegner'),     'Heimgegner fehlt im Heim-Panel');
    assert.ok(!homePanel.includes('Auswärtsgegner'), 'Auswärtsgegner darf nicht im Heim-Panel sein');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Auswärts-Tab enthält nur Auswärtsspiele', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  const metaHomeAway = [
    {
      teamId: '167881',
      teamName: 'Test Team',
      ageGroup: 'U10',
      lastUpdate: new Date().toISOString(),
      matchCount: 2, homeMatchCount: 1, awayMatchCount: 1,
      logoUrl: null,
      matches: [
        { date: '2025-10-12', time: '15:00', opponent: 'Heimgegner',    isHome: true,  result: '60:50', competition: 'Kreisliga', isNext: false },
        { date: '2025-10-19', time: '15:00', opponent: 'Auswärtsgegner', isHome: false, result: null,   competition: 'Kreisliga', isNext: true },
      ],
    },
  ];
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metaHomeAway));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const awayPanel = html.match(/id="panel-167881-away"[\s\S]*?(?=<\/div>\s*<\/div>\s*(?:<div class="schedule-legend|<\/main>|<script))/)?.[0] || '';
    assert.ok(awayPanel.includes('Auswärtsgegner'), 'Auswärtsgegner fehlt im Auswärts-Panel');
    assert.ok(!awayPanel.includes('Heimgegner'),    'Heimgegner darf nicht im Auswärts-Panel sein');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Pokal-Spiel nutzt cupColor im HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  const metaCup = [
    {
      teamId: '167881',
      teamName: 'Test Team',
      ageGroup: 'U10',
      lastUpdate: new Date().toISOString(),
      matchCount: 1, homeMatchCount: 1, awayMatchCount: 0,
      logoUrl: null,
      matches: [
        { date: '2025-10-22', time: '15:00', opponent: 'Pokalteam', isHome: true, result: null, competition: 'Bezirkspokal', isNext: true },
      ],
    },
  ];
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metaCup));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: null, cupColor: '#7c3aed' });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('#7c3aed'), 'cupColor fehlt im HTML für Pokal-Wettbewerb');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Kein Spielplan wenn matches leer oder fehlt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  const metaNoMatches = [
    {
      teamId: '167881',
      teamName: 'Test Team',
      ageGroup: 'U10',
      lastUpdate: new Date().toISOString(),
      matchCount: 0, homeMatchCount: 0, awayMatchCount: 0,
      logoUrl: null,
      matches: [],
    },
  ];
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metaNoMatches));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!html.includes('SPIELPLAN'), 'Spielplan-Sektion sollte fehlen wenn keine Matches');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Spielplan-Sektion erscheint wenn matches vorhanden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadataWithMatches));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('SPIELPLAN'), 'Spielplan-Überschrift fehlt');
    assert.ok(html.includes('TSV Musterstadt'), 'Gegnerteam fehlt');
    assert.ok(html.includes('62:58'), 'Ergebnis fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
