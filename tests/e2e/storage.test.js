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
    saveTeamsCache(teams);
    const { teams: loaded, stale } = loadTeamsCache();
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
    const result = loadTeamsCache();
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
      pathJoin(dir, 'teams-cache.json'),
      JSON.stringify({ cachedAt: old, teams }),
      'utf8'
    );
    const { stale } = loadTeamsCache();
    assert.equal(stale, true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
