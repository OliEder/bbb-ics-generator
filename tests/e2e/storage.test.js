'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// Helper: require storage.js fresh with a given tmp dir set as BBB_ICS_DIR
function requireStorage(dir) {
  // Clear the cached module so it re-evaluates ICS_DIR
  const storagePath = require.resolve('../../src/storage.js');
  delete require.cache[storagePath];
  process.env.BBB_ICS_DIR = dir;
  const mod = require('../../src/storage.js');
  return mod;
}

// ---- saveICS / readICS ----

test('saveICS schreibt Datei, readICS liest sie korrekt zurück', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveICS, readICS } = requireStorage(dir);
    const content = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
    saveICS('12345', 'all', content);
    const result = readICS('12345', 'all');
    assert.equal(result, content);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('readICS gibt null zurück wenn Datei nicht existiert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { readICS } = requireStorage(dir);
    const result = readICS('99999', 'all');
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('saveICS wirft bei ungültigem type', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveICS } = requireStorage(dir);
    assert.throws(() => saveICS('12345', 'invalid', 'data'), /Ungültiger ICS-Typ/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('saveICS wirft bei ungültiger teamId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveICS } = requireStorage(dir);
    assert.throws(() => saveICS('../etc', 'all', 'data'), /Ungültige teamId/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ---- saveTeamsCache / loadTeamsCache ----

test('saveTeamsCache und loadTeamsCache: Round-trip korrekt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveTeamsCache, loadTeamsCache } = requireStorage(dir);
    const teams = [{ id: '167881', name: 'Test Team', ageGroup: 'U10' }];
    saveTeamsCache(teams, '4468');
    const { teams: loaded, stale } = loadTeamsCache('4468');
    assert.deepEqual(loaded, teams);
    assert.equal(stale, false);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadTeamsCache gibt { teams: null, stale: false } wenn keine Datei', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { loadTeamsCache } = requireStorage(dir);
    const result = loadTeamsCache('4468');
    assert.deepEqual(result, { teams: null, stale: false });
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadTeamsCache gibt stale: true wenn cachedAt 31 Tage alt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveTeamsCache, loadTeamsCache } = requireStorage(dir);
    const teams = [{ id: '167881', name: 'Test Team', ageGroup: 'U10' }];
    // Write cache manually with old timestamp
    const { writeFileSync } = require('node:fs');
    const { join: pathJoin } = require('node:path');
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      pathJoin(dir, 'teams-cache-4468.json'),
      JSON.stringify({ cachedAt: old, teams }),
      'utf8'
    );
    const { stale } = loadTeamsCache('4468');
    assert.equal(stale, true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ---- saveTeamsCache/loadTeamsCache: Cache-Isolation zwischen Clubs (Regressionstest) ----
// Deckt den Bug ab, bei dem teams-cache.json eine einzige globale Datei war: der
// zweite Club in einem Multi-Club-Lauf erbte stillschweigend die Team-Liste des
// ersten Clubs, weil beide dieselbe Cache-Datei teilten. Dieser Test würde fehlschlagen,
// wenn clubId aus saveTeamsCache/loadTeamsCache entfernt (oder ignoriert) würde.
test('saveTeamsCache/loadTeamsCache: Caches verschiedener Clubs sind vollständig isoliert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveTeamsCache, loadTeamsCache } = requireStorage(dir);
    // Numerische clubIds (wie echte Basketball-Bund-clubIds) — clubId wird strikt
    // gegen /^\d+$/ validiert (siehe Test weiter unten), daher keine Buchstaben-IDs.
    const CLUB_AAA = '1111';
    const CLUB_BBB = '2222';
    const teamsAAA = [{ id: '1001', name: 'Club AAA Team 1', ageGroup: 'U10' }];
    const teamsBBB = [{ id: '2002', name: 'Club BBB Team 1', ageGroup: 'U12' }, { id: '2003', name: 'Club BBB Team 2', ageGroup: 'U14' }];

    saveTeamsCache(teamsAAA, CLUB_AAA);
    saveTeamsCache(teamsBBB, CLUB_BBB);

    const resultAAA = loadTeamsCache(CLUB_AAA);
    const resultBBB = loadTeamsCache(CLUB_BBB);

    assert.deepEqual(resultAAA.teams, teamsAAA, 'Club AAA muss seine EIGENEN Teams zurückbekommen');
    assert.deepEqual(resultBBB.teams, teamsBBB, 'Club BBB muss seine EIGENEN Teams zurückbekommen');
    assert.notDeepEqual(resultAAA.teams, resultBBB.teams, 'Caches dürfen sich nicht gegenseitig überschreiben/vermischen');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('saveTeamsCache wirft ohne clubId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveTeamsCache } = requireStorage(dir);
    assert.throws(() => saveTeamsCache([{ id: '1' }]), /clubId ist erforderlich/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadTeamsCache wirft ohne clubId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { loadTeamsCache } = requireStorage(dir);
    assert.throws(() => loadTeamsCache(), /clubId ist erforderlich/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// Regressionstest für einen vom Code-Review gefundenen Schwester-Bug derselben Klasse:
// teamsCacheFilePath normalisierte clubId ursprünglich per Zeichen-Ersetzung statt sie
// zu validieren, wodurch zwei UNTERSCHIEDLICHE clubIds (z.B. "44-68" und "44 68") auf
// denselben sanitisierten Dateinamen "44_68" hätten kollidieren können — strukturell
// dieselbe "implizite Annahme, die nirgends erzwungen wird" wie der ursprüngliche
// geteilte-Cache-Bug. clubId muss jetzt strikt gegen /^\d+$/ validiert werden (wie
// teamId in saveICS/readICS), statt still normalisiert zu werden.
test('saveTeamsCache/loadTeamsCache: wirft bei ungültiger clubId (Sonderzeichen/Leerzeichen) statt still zu normalisieren', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  try {
    const { saveTeamsCache, loadTeamsCache } = requireStorage(dir);
    assert.throws(() => saveTeamsCache([{ id: '1' }], '44-68'), /Ungültige clubId/);
    assert.throws(() => saveTeamsCache([{ id: '1' }], '44 68'), /Ungültige clubId/);
    assert.throws(() => loadTeamsCache('44-68'), /Ungültige clubId/);
    assert.throws(() => loadTeamsCache('44 68'), /Ungültige clubId/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ---- sanitizeSlug ----

test('sanitizeSlug: akzeptiert gültige Slugs', () => {
  const { sanitizeSlug } = requireStorage(mkdtempSync(join(tmpdir(), 'bbb-test-')));
  assert.equal(sanitizeSlug('bayern'), 'bayern');
  assert.equal(sanitizeSlug('fibalon-baskets'), 'fibalon-baskets');
});

test('sanitizeSlug: wirft bei Path-Traversal-Versuchen', () => {
  const { sanitizeSlug } = requireStorage(mkdtempSync(join(tmpdir(), 'bbb-test-')));
  assert.throws(() => sanitizeSlug('../etc'), /Ungültiger Slug/);
  assert.throws(() => sanitizeSlug('a/b'), /Ungültiger Slug/);
  assert.throws(() => sanitizeSlug(''), /Ungültiger Slug/);
});

// ---- saveICS/readICS mit outputDir ----

test('saveICS/readICS: outputDir-Parameter schreibt/liest außerhalb des globalen ICS_DIR', () => {
  const globalDir = mkdtempSync(join(tmpdir(), 'bbb-test-'));
  const clubDir = mkdtempSync(join(tmpdir(), 'bbb-club-'));
  try {
    const { saveICS, readICS } = requireStorage(globalDir);
    const content = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
    saveICS('12345', 'all', content, clubDir);
    assert.equal(readICS('12345', 'all', clubDir), content);
    assert.equal(readICS('12345', 'all'), null, 'darf nicht im globalen ICS_DIR gelandet sein');
  } finally {
    rmSync(globalDir, { recursive: true });
    rmSync(clubDir, { recursive: true });
  }
});
