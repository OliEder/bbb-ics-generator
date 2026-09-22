'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function requireClubs() {
  const modPath = require.resolve('../../src/clubs.js');
  delete require.cache[modPath];
  return require('../../src/clubs.js');
}

test('loadClubs: findet alle config.json unter clubs/<bundesland>/<club>/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  try {
    mkdirSync(join(dir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(dir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468', theme: { primary: '#004174' } })
    );
    mkdirSync(join(dir, 'bundesweit', 'testverein'), { recursive: true });
    writeFileSync(
      join(dir, 'bundesweit', 'testverein', 'config.json'),
      JSON.stringify({ clubId: '9999' })
    );

    const { loadClubs } = requireClubs();
    const clubs = loadClubs(dir);

    assert.equal(clubs.length, 2);
    const fibalon = clubs.find(c => c.slug === 'fibalon');
    assert.ok(fibalon, 'fibalon-Club nicht gefunden');
    assert.equal(fibalon.sourceBundeslandSlug, 'bayern');
    assert.equal(fibalon.config.clubId, '4468');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadClubs: leeres Verzeichnis liefert leere Liste', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  try {
    const { loadClubs } = requireClubs();
    assert.deepEqual(loadClubs(dir), []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadClubs: config.json ohne clubId wird übersprungen und geloggt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  try {
    mkdirSync(join(dir, 'bayern', 'kaputt'), { recursive: true });
    writeFileSync(join(dir, 'bayern', 'kaputt', 'config.json'), JSON.stringify({ theme: {} }));

    const { loadClubs } = requireClubs();
    const clubs = loadClubs(dir);
    assert.deepEqual(clubs, []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
