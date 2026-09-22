'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } = require('node:fs');
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

test('loadClubs: Club-Verzeichnis mit ungültigem Namen wird übersprungen, gültiger Nachbar bleibt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  try {
    mkdirSync(join(dir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(dir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468' })
    );
    mkdirSync(join(dir, 'bayern', 'Ungueltig_Name'), { recursive: true });
    writeFileSync(
      join(dir, 'bayern', 'Ungueltig_Name', 'config.json'),
      JSON.stringify({ clubId: '1234' })
    );

    const { loadClubs } = requireClubs();
    const clubs = loadClubs(dir);

    assert.equal(clubs.length, 1);
    assert.ok(clubs.find(c => c.slug === 'fibalon'), 'fibalon sollte trotz ungültigem Nachbarverzeichnis gefunden werden');
    assert.ok(!clubs.find(c => c.slug === 'Ungueltig_Name'), 'Club mit ungültigem Verzeichnisnamen darf nicht enthalten sein');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadClubs: Bundesland-Verzeichnis mit ungültigem Namen wird übersprungen, gültiger Nachbar bleibt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  try {
    mkdirSync(join(dir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(dir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468' })
    );
    mkdirSync(join(dir, '..gesperrt', 'boesewicht'), { recursive: true });
    writeFileSync(
      join(dir, '..gesperrt', 'boesewicht', 'config.json'),
      JSON.stringify({ clubId: '9999' })
    );

    const { loadClubs } = requireClubs();
    const clubs = loadClubs(dir);

    assert.equal(clubs.length, 1);
    assert.ok(clubs.find(c => c.slug === 'fibalon'), 'fibalon sollte trotz ungültigem Nachbar-Bundesland gefunden werden');
    assert.ok(!clubs.find(c => c.slug === 'boesewicht'), 'Club unter ungültigem Bundesland-Verzeichnis darf nicht enthalten sein');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadClubs: unlesbares Bundesland-Verzeichnis bricht nicht die gesamte Funktion ab', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-clubs-'));
  const unreadableDir = join(dir, 'gesperrt');
  try {
    mkdirSync(join(unreadableDir, 'irrelevant'), { recursive: true });
    mkdirSync(join(dir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(dir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468' })
    );

    chmodSync(unreadableDir, 0o000);

    // Manche Umgebungen (z.B. root-Prozesse) ignorieren Verzeichnis-Berechtigungen —
    // in dem Fall ist der Fehlerpfad nicht provozierbar, der Test bleibt dann ohne Aussage.
    let readable = true;
    try {
      require('node:fs').readdirSync(unreadableDir);
    } catch {
      readable = false;
    }

    const { loadClubs } = requireClubs();
    assert.doesNotThrow(() => loadClubs(dir));

    const clubs = loadClubs(dir);
    const fibalon = clubs.find(c => c.slug === 'fibalon');
    assert.ok(fibalon, 'fibalon-Club sollte trotz unlesbarem Nachbarverzeichnis gefunden werden');

    if (!readable) {
      assert.equal(clubs.length, 1, 'unlesbares Verzeichnis sollte übersprungen, nicht ausgewertet werden');
    }
  } finally {
    chmodSync(unreadableDir, 0o755);
    rmSync(dir, { recursive: true });
  }
});
