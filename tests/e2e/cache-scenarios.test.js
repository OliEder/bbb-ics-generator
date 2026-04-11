'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { teams: mockTeams, clubTeamsResponse } = require('../fixtures/mockResponses.js');

// Helper: reload storage with a specific tmp dir
function requireStorage(dir) {
  const p = require.resolve('../../src/storage.js');
  delete require.cache[p];
  process.env.BBB_ICS_DIR = dir;
  return require('../../src/storage.js');
}

// Helper: reload cronUpdate (and its deps) with fresh module instances
function requireCronUpdate(dir) {
  // Clear the full dependency chain so they pick up the new ICS_DIR/stub
  [
    '../../src/storage.js',
    '../../src/cronUpdate.js',
    '../../src/apiClient.js',
  ].forEach(rel => {
    const p = require.resolve(rel);
    delete require.cache[p];
  });
  process.env.BBB_ICS_DIR = dir;
  return require('../../src/cronUpdate.js');
}

// ---- Cache-HIT ----

test('Cache-HIT: loadTeamsCache gibt frische Teams zurück → fetchClubTeams nicht aufgerufen', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cache-'));
  try {
    // Write a fresh cache
    const storage = requireStorage(dir);
    storage.saveTeamsCache(mockTeams);

    // Stub axios so any real network call fails loudly
    const axios = require('axios');
    const stub = t.mock.method(axios, 'get', () => Promise.reject(new Error('Should not be called')));

    const { getTeams } = requireCronUpdate(dir);
    const result = await getTeams();
    assert.deepEqual(result, mockTeams);
    assert.equal(stub.mock.calls.length, 0, 'fetchClubTeams (axios.get) wurde unerwartet aufgerufen');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ---- Cache-MISS ----

test('Cache-MISS: stale Cache → fetchClubTeams wird aufgerufen, Cache neu geschrieben', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cache-'));
  try {
    // Write a stale cache (31 days old)
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(dir, 'teams-cache.json'),
      JSON.stringify({ cachedAt: old, teams: mockTeams }),
      'utf8'
    );

    const axios = require('axios');
    t.mock.method(axios, 'get', () => Promise.resolve(clubTeamsResponse));

    const { getTeams } = requireCronUpdate(dir);
    const result = await getTeams();
    assert.ok(Array.isArray(result) && result.length > 0, 'Keine Teams zurückgegeben');
    assert.equal(result[0].id, String(clubTeamsResponse.data.data.matches[0].homeTeam.teamPermanentId));

    // Verify cache was written fresh
    const { loadTeamsCache } = requireStorage(dir);
    const { stale } = loadTeamsCache();
    assert.equal(stale, false, 'Cache sollte nach Update nicht stale sein');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ---- Fallback ----

test('Fallback: fetchClubTeams wirft Error + stale Cache → stale Cache zurückgegeben', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cache-'));
  try {
    // Write a stale cache
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(dir, 'teams-cache.json'),
      JSON.stringify({ cachedAt: old, teams: mockTeams }),
      'utf8'
    );

    const axios = require('axios');
    t.mock.method(axios, 'get', () => Promise.reject(new Error('Network error')));

    const { getTeams } = requireCronUpdate(dir);
    const result = await getTeams();
    // Should fall back to stale cached teams
    assert.deepEqual(result, mockTeams, 'Stale Cache wurde nicht als Fallback verwendet');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
