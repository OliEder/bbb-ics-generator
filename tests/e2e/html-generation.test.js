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

test('team page enthält webcal:// Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    assert.ok(html.includes('webcal://'), 'webcal:// Link fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('team page enthält google.com/calendar/render Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    assert.ok(html.includes('google.com/calendar/render'), 'Google Calendar Link fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('team page enthält https://olieder.github.io Links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
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

test('Anzahl team pages = Anzahl Teams in metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    // Each team gets its own page under teams/
    for (const team of sampleMetadata) {
      assert.ok(existsSync(join(dir, 'teams', `${team.teamId}.html`)), `teams/${team.teamId}.html fehlt`);
    }
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

test('Tab-Struktur mit role="tablist" ist vorhanden (team page)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    assert.ok(html.includes('role="tablist"'), 'tablist role fehlt');
    assert.ok(html.includes('role="tab"'), 'tab role fehlt');
    assert.ok(html.includes('role="tabpanel"'), 'tabpanel role fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Team page hat drei Tab-Panels (all, home, away)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    const panels = html.match(/role="tabpanel"/g) || [];
    assert.equal(panels.length, 3, 'Falsche Anzahl tab panels');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Keyboard-Navigation JS ist in team page eingebettet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
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
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
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
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    const awayPanel = html.match(/id="panel-167881-away"[\s\S]*?(?=(?:<div class="schedule-legend|<\/section>|<\/main>|<script))/)?.[0] || '';
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
    const html = readFileSync(join(dir, 'teams', '167881.html'), 'utf8');
    assert.ok(html.includes('SPIELPLAN'), 'Spielplan-Überschrift fehlt');
    assert.ok(html.includes('TSV Musterstadt'), 'Gegnerteam fehlt');
    assert.ok(html.includes('62') && html.includes('58'), 'Ergebnis fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Auswärtsspiel hat badge--away im HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  const metaAway = [
    {
      teamId: '167881',
      teamName: 'Test Team',
      ageGroup: 'U10',
      lastUpdate: new Date().toISOString(),
      matchCount: 1, homeMatchCount: 0, awayMatchCount: 1,
      logoUrl: null,
      matches: [
        { date: '2025-10-19', time: '15:00', opponent: 'Auswärtsgegner', isHome: false, result: null, competition: 'Kreisliga', isNext: true },
      ],
    },
  ];
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metaAway));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('badge--away'), 'badge--away Klasse fehlt für Auswärtsspiel');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// --- sortTeams ---
test('sortTeams: Herren first, then U-groups descending', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { sortTeams } = _testExports;

  const teams = [
    { teamName: 'Fibalon U10', ageGroup: 'U10' },
    { teamName: 'Fibalon Herren', ageGroup: '' },
    { teamName: 'Fibalon U20', ageGroup: 'U20' },
    { teamName: 'Fibalon U16', ageGroup: 'U16' },
  ];
  const sorted = sortTeams(teams);
  assert.equal(sorted[0].ageGroup, '');
  assert.equal(sorted[1].ageGroup, 'U20');
  assert.equal(sorted[2].ageGroup, 'U16');
  assert.equal(sorted[3].ageGroup, 'U10');
});

// --- buildNavigation ---
test('buildNavigation: active page has aria-current, all teams linked', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildNavigation } = _testExports;

  const teams = [
    { teamId: '100', teamName: 'Herren', ageGroup: '' },
    { teamId: '200', teamName: 'U16', ageGroup: 'U16' },
  ];
  const html = buildNavigation(teams, 'index');
  assert.ok(html.includes('aria-current="page"'), 'active page missing aria-current');
  assert.ok(html.includes('teams/100.html'), 'Herren link missing');
  assert.ok(html.includes('teams/200.html'), 'U16 link missing');
});

test('buildNavigation: does not contain inline script (script moved to buildNavScript)', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildNavigation } = _testExports;

  const teams = [
    { teamId: '100', teamName: 'Herren', ageGroup: '' },
  ];
  const html = buildNavigation(teams, 'index');
  assert.ok(!html.includes('<script>'), 'inline script tag should not be in buildNavigation');
  assert.ok(html.includes('nav-toggle'), 'nav-toggle button should still be present');
  assert.ok(html.includes('nav-drawer'), 'nav-drawer should still be present');
  assert.ok(html.includes('aria-expanded'), 'aria-expanded attribute should still be present');
});

test('buildNavScript: returns script that references nav-toggle, nav-drawer, aria-expanded', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildNavScript } = _testExports;

  const html = buildNavScript();
  assert.ok(html.includes('<script>'), 'script tag missing');
  assert.ok(html.includes('nav-toggle'), 'script should reference nav-toggle');
  assert.ok(html.includes('nav-drawer'), 'script should reference nav-drawer');
  assert.ok(html.includes('aria-expanded'), 'script should toggle aria-expanded');
});

// --- buildTeaserCard ---
test('buildTeaserCard: shows last 3 results, next match, and team link', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildTeaserCard } = _testExports;

  const team = {
    teamId: '100',
    teamName: 'Herren',
    ageGroup: '',
    logoUrl: 'https://example.com/logo.png',
    matches: [
      { date: '2025-03-01', opponent: 'Regensburg', result: '72:68', isHome: true, isNext: false, competition: 'Bayernliga' },
      { date: '2025-03-08', opponent: 'Würzburg',   result: '55:61', isHome: false, isNext: false, competition: 'Bayernliga' },
      { date: '2025-03-15', opponent: 'Nürnberg',   result: '80:74', isHome: true, isNext: false, competition: 'Bayernliga' },
      { date: '2025-04-17', opponent: 'Freising',   result: null,    isHome: true, isNext: true,  competition: 'Bayernliga' },
      { date: '2025-04-24', opponent: 'FC Bayern',  result: null,    isHome: false, isNext: false, competition: 'Bayernliga' },
    ],
  };
  const html = buildTeaserCard(team);
  assert.ok(html.includes('>72<') && html.includes(':68'), 'first result missing');
  assert.ok(html.includes('>61<') && html.includes(':55'), 'second result missing');
  assert.ok(html.includes('>80<') && html.includes(':74'), 'third result missing');
  assert.ok(html.includes('Freising'), 'next match missing');
  assert.ok(html.includes('teaser-next'), 'next highlight class missing');
  assert.ok(html.includes('teams/100.html'), 'team page link missing');
});

test('buildTeaserCard: escapes XSS in teamName', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildTeaserCard } = _testExports;

  const xssTeam = {
    teamId: 'test',
    teamName: '<script>alert(1)</script>',
    logoUrl: null,
    matches: [],
  };
  const html = buildTeaserCard(xssTeam);
  assert.ok(!html.includes('<script>alert'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped form must be present');
});

test('buildTeaserCard: results rendered most recent first', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildTeaserCard } = _testExports;

  const team = {
    teamId: '100',
    teamName: 'Herren',
    ageGroup: '',
    logoUrl: null,
    matches: [
      { date: '2025-03-01', opponent: 'OldestOpponent', result: '50:60', isHome: true,  isNext: false, competition: 'Bayernliga' },
      { date: '2025-03-08', opponent: 'MiddleOpponent',  result: '55:61', isHome: false, isNext: false, competition: 'Bayernliga' },
      { date: '2025-03-15', opponent: 'NewestOpponent',  result: '80:74', isHome: true,  isNext: false, competition: 'Bayernliga' },
    ],
  };
  const html = buildTeaserCard(team);
  const newestPos = html.indexOf('NewestOpponent');
  const oldestPos = html.indexOf('OldestOpponent');
  assert.ok(newestPos !== -1, 'newest result missing');
  assert.ok(oldestPos !== -1, 'oldest result missing');
  assert.ok(newestPos < oldestPos, 'most recent result should appear before oldest result');
});

test('buildTeaserCard: fewer than 3 results — no empty rows', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildTeaserCard } = _testExports;

  const team = {
    teamId: '200', teamName: 'U10', ageGroup: 'U10', logoUrl: null,
    matches: [
      { date: '2025-03-01', opponent: 'Roth', result: '24:18', isHome: true, isNext: false, competition: 'Kreisliga' },
    ],
  };
  const html = buildTeaserCard(team);
  assert.ok(html.includes('>24<') && html.includes(':18'), 'result missing');
  assert.ok(!html.includes('teaser-result-empty'), 'no empty row class expected');
});

test('buildTeaserCard: no next match and no future — shows season over message', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildTeaserCard } = _testExports;

  const team = {
    teamId: '300', teamName: 'U14', ageGroup: 'U14', logoUrl: null,
    matches: [
      { date: '2025-03-01', opponent: 'Roth', result: '24:18', isHome: true, isNext: false, competition: 'Kreisliga' },
    ],
  };
  const html = buildTeaserCard(team);
  assert.ok(html.includes('teaser-next--empty'), 'season-over message should appear when no future matches');
  assert.ok(html.includes('Keine weiteren Spiele'), 'season-over text missing');
});

// --- buildStandingsTable ---
test('buildStandingsTable: own team row has highlight class', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildStandingsTable } = _testExports;

  const comp = {
    liganame: 'Bayernliga',
    table: [
      { rank: 1, teamName: 'Regensburg', played: 16, won: 14, lost: 2, points: '28:4', isOwn: false },
      { rank: 3, teamName: 'Fibalon',    played: 16, won: 10, lost: 6, points: '20:12', isOwn: true },
    ],
  };
  const html = buildStandingsTable(comp);
  assert.ok(html.includes('standings-own'), 'own team row missing highlight class');
  assert.ok(html.includes('Regensburg'), 'other team missing');
  assert.ok(html.includes('Fibalon'), 'own team missing');
});

test('buildStandingsTable: null table renders unavailable note', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildStandingsTable } = _testExports;

  const html = buildStandingsTable({ liganame: 'Liga X', table: null });
  assert.ok(html.includes('nicht verfügbar'), 'missing unavailable note');
});

// --- buildBracket ---
test('buildBracket: winner row has winner class, bye row has bye class', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildBracket } = _testExports;

  const comp = {
    liganame: 'Final4',
    bracket: [
      {
        roundName: 'Halbfinale',
        matches: [
          { home: 'Fibalon', guest: 'München', result: '72:68', homeWon: true, homeBye: false, guestBye: false },
          { home: 'Freilos', guest: 'Augsburg', result: null, homeWon: null, homeBye: true, guestBye: false },
        ],
      },
    ],
  };
  const html = buildBracket(comp);
  assert.ok(html.includes('bracket-winner'), 'winner class missing');
  assert.ok(html.includes('bracket-bye'), 'bye class missing');
});

test('buildBracket: null bracket renders unavailable note', () => {
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const { _testExports } = require('../../src/generateHTML.js');
  const { buildBracket } = _testExports;

  const html = buildBracket({ liganame: 'Pokal', bracket: null });
  assert.ok(html.includes('nicht verfügbar'), 'missing unavailable note');
});

// --- genHTML multi-page integration ---
const sampleTeams = [
  {
    teamId: '100', teamName: 'Herren', ageGroup: '',
    lastUpdate: new Date().toISOString(),
    matchCount: 3, homeMatchCount: 2, awayMatchCount: 1,
    logoUrl: 'https://example.com/logo.png',
    matches: [
      { date: '2025-03-01', opponent: 'Regensburg', result: '72:68', isHome: true,  isNext: false, competition: 'Bayernliga' },
      { date: '2025-04-17', opponent: 'Freising',   result: null,    isHome: true,  isNext: true,  competition: 'Bayernliga' },
    ],
    competitions: [
      { ligaId: '47653', liganame: 'Bayernliga', isLiga: true,
        table: [
          { rank: 1, teamName: 'Regensburg', played: 16, won: 14, lost: 2, points: '28:4', isOwn: false },
          { rank: 3, teamName: 'Herren',     played: 16, won: 10, lost: 6, points: '20:12', isOwn: true },
        ],
        bracket: null },
    ],
  },
  {
    teamId: '200', teamName: 'U16', ageGroup: 'U16',
    lastUpdate: new Date().toISOString(),
    matchCount: 2, homeMatchCount: 1, awayMatchCount: 1,
    logoUrl: null,
    matches: [],
    competitions: [
      { ligaId: '51935', liganame: 'Bezirksoberliga U16', isLiga: true,
        table: null, bracket: null },
    ],
  },
];

const DEFAULT_THEME_MULTI = { primary: '#004174', accent: '#009ef3', logoUrl: null, cupColor: '#7c3aed' };

test('genHTML creates index.html and teams/ subpages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-multi-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleTeams));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME_MULTI);
    assert.ok(existsSync(join(dir, 'index.html')), 'index.html missing');
    assert.ok(existsSync(join(dir, 'teams', '100.html')), 'teams/100.html missing');
    assert.ok(existsSync(join(dir, 'teams', '200.html')), 'teams/200.html missing');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('index.html contains teaser cards with links to team pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-multi-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleTeams));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME_MULTI);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('teams/100.html'), 'link to Herren page missing');
    assert.ok(html.includes('teams/200.html'), 'link to U16 page missing');
    assert.ok(html.includes('teaser-card'), 'teaser-card class missing');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('team page contains standings table and schedule tabs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-multi-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleTeams));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME_MULTI);
    const html = readFileSync(join(dir, 'teams', '100.html'), 'utf8');
    assert.ok(html.includes('standings-table'), 'standings table missing');
    assert.ok(html.includes('Bayernliga'), 'competition heading missing');
    assert.ok(html.includes('tab-bar'), 'schedule tabs missing');
    assert.ok(html.includes('btn-group'), 'calendar buttons missing');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('team page with null table shows unavailable note', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-multi-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleTeams));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME_MULTI);
    const html = readFileSync(join(dir, 'teams', '200.html'), 'utf8');
    assert.ok(html.includes('nicht verfügbar'), 'unavailable note missing');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('isNext match enthält venueName und venueAddress', () => {
  const { buildNextGameTeaser } = require('../../src/generateHTML.js')._testExports;
  const team = {
    teamId: 'T1', teamName: 'NM Baskets', ageGroup: 'Senioren', gender: 'männlich',
    lastUpdate: new Date().toISOString(),
    matchCount: 1, homeMatchCount: 1, awayMatchCount: 0,
    matches: [
      {
        date: '2026-04-19', time: '18:00', opponent: 'VfB Dragons',
        opponentShort: 'VfB', ownShort: 'NM',
        isHome: true, result: null, competition: 'Bayerische Oberliga', isNext: true,
        venueName: 'Sporthalle Nordmühle',
        venueAddress: 'Mühlenstr. 12, 12345 Neumarkt',
      },
    ],
    competitions: [],
  };
  const html = buildNextGameTeaser(team);
  assert.ok(html.includes('Sporthalle Nordmühle'), 'venueName fehlt');
  assert.ok(html.includes('Mühlenstr. 12, 12345 Neumarkt'), 'venueAddress fehlt');
  assert.ok(html.includes('maps.google.com') || html.includes('google.com/maps'), 'Google Maps Link fehlt');
  assert.ok(html.includes('maps.apple.com'), 'Apple Maps Link fehlt');
  assert.ok(html.includes('next-game-map'), 'Leaflet map div fehlt');
  // Full names in matchup layout
  assert.ok(html.includes('NM Baskets'), 'Eigener Teamname fehlt im Teaser');
  assert.ok(html.includes('VfB Dragons'), 'Gegner-Vollname fehlt im Teaser');
  assert.ok(html.includes('next-game-matchup'), 'Matchup-Layout fehlt');
  assert.ok(html.includes('next-game-team-name'), 'team-name Element fehlt');
});

test('buildNextGameTeaser: kein Venue → kein Kartenblock', () => {
  const { buildNextGameTeaser } = require('../../src/generateHTML.js')._testExports;
  const team = {
    teamId: 'T2', teamName: 'Test Team', ageGroup: 'U16', gender: '',
    matches: [
      {
        date: '2026-04-19', time: '18:00', opponent: 'VfB Dragons',
        opponentShort: 'VfB', ownShort: 'NM',
        isHome: false, result: null, competition: 'Kreisliga', isNext: true,
        venueName: '', venueAddress: '',
      },
    ],
    competitions: [],
  };
  const html = buildNextGameTeaser(team);
  assert.ok(html.includes('19.04'), 'Datum fehlt');
  assert.ok(html.includes('Auswärts'), 'Badge fehlt');
  assert.ok(!html.includes('next-game-map'), 'Kartenblock sollte nicht erscheinen');
  assert.ok(!html.includes('maps.apple.com'), 'Apple Maps Link sollte nicht erscheinen');
});

test('buildNextGameTeaser: kein nächstes Spiel aber Spiele vorhanden → Saisonende-Meldung', () => {
  const { buildNextGameTeaser } = require('../../src/generateHTML.js')._testExports;
  const team = {
    teamId: 'T3', teamName: 'Test Team', ageGroup: 'U14', gender: '',
    matches: [
      { date: '2026-03-01', opponent: 'X', isHome: true, result: '70:60', competition: 'Liga', isNext: false, venueName: '', venueAddress: '' },
    ],
    competitions: [],
  };
  const html = buildNextGameTeaser(team);
  assert.ok(html.includes('next-game--empty'), 'Saisonende-Sektion fehlt');
  assert.ok(html.includes('Aktuell sind keine weiteren Spiele geplant'), 'Saisonende-Text fehlt');
});

test('buildNextGameTeaser: keine Spiele überhaupt → leerer String', () => {
  const { buildNextGameTeaser } = require('../../src/generateHTML.js')._testExports;
  const team = {
    teamId: 'T3b', teamName: 'Test Team', ageGroup: 'U14', gender: '',
    matches: [],
    competitions: [],
  };
  const html = buildNextGameTeaser(team);
  assert.strictEqual(html, '', 'Sollte leerer String sein wenn gar keine Spiele');
});

test('buildTeamPage enthält next-game section wenn isNext vorhanden', () => {
  const { buildTeamPage } = require('../../src/generateHTML.js')._testExports;
  const team = {
    teamId: 'T4', teamName: 'NM Baskets', ageGroup: 'Senioren', gender: 'männlich',
    lastUpdate: new Date().toISOString(),
    matchCount: 2, homeMatchCount: 1, awayMatchCount: 1,
    logoUrl: null,
    matches: [
      { date: '2026-04-19', time: '18:00', opponent: 'VfB Dragons', opponentShort: 'VfB', ownShort: 'NM', isHome: true, result: null, competition: 'Bayerische Oberliga', isNext: true, venueName: 'Sporthalle', venueAddress: 'Mühlenstr. 1, 92318 Neumarkt' },
      { date: '2026-04-26', time: '15:00', opponent: 'FC Bayern', opponentShort: 'FCB', ownShort: 'NM', isHome: false, result: null, competition: 'Bayerische Oberliga', isNext: false, venueName: '', venueAddress: '' },
    ],
    competitions: [],
  };
  const html = buildTeamPage(team, [team], { primary: '#004174', accent: '#009ef3', cupColor: '#7c3aed' });
  assert.ok(html.includes('next-game'), 'next-game section fehlt');
  assert.ok(html.includes('leaflet'), 'Leaflet CDN fehlt');
  assert.ok(html.includes('Nächstes Spiel'), 'Heading fehlt');
});
