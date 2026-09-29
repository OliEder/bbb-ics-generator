'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { sanitizeSlug } = require('../../src/storage');
const { loadClubs } = require('../../src/clubs');

test('sanitizeSlug: "index" ist reserviert und wirft', () => {
  assert.throws(() => sanitizeSlug('index'), /Reservierter Slug: index/);
});

test('sanitizeSlug: ähnliche gültige Slugs bleiben erlaubt', () => {
  assert.equal(sanitizeSlug('index-verein'), 'index-verein');
  assert.equal(sanitizeSlug('reindex'), 'reindex');
});

test('loadClubs: Club-Ordner "index" wird übersprungen und geloggt, andere Clubs bleiben', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-reserved-'));
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    for (const slug of ['index', 'normal']) {
      mkdirSync(join(dir, 'bayern', slug), { recursive: true });
      writeFileSync(join(dir, 'bayern', slug, 'config.json'), JSON.stringify({ clubId: '1' }));
    }
    const clubs = loadClubs(dir);
    assert.deepEqual(clubs.map(c => c.slug), ['normal']);
    assert.ok(errors.some(e => e.includes('index') && e.includes('Reservierter Slug')), 'Übersprungener Club muss geloggt werden');
  } finally {
    console.error = realError;
    rmSync(dir, { recursive: true });
  }
});
