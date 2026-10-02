'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { loadWamCache, buildLigaIndex, refreshWamCache, WAM_CACHE_TTL_MS } = require('../../src/wamCache');

const DAY = 24 * 60 * 60 * 1000;
const liga = (ligaId, extra = {}) => ({ ligaId, liganame: `Liga ${ligaId}`, skEbeneId: 1, skEbeneName: 'Bezirk', bezirknr: 1, bezirkName: 'Oberbayern', kreisnr: null, kreisname: null, ...extra });

function withCacheFile(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-wamcache-'));
  const file = join(dir, 'wam-ligen-cache.json');
  if (content !== undefined) writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  try { return fn(file); } finally { rmSync(dir, { recursive: true }); }
}

test('WAM_CACHE_TTL_MS beträgt 150 Tage', () => {
  assert.equal(WAM_CACHE_TTL_MS, 150 * DAY);
});

test('loadWamCache: fehlende Datei → { cache: null, stale: false }', () => {
  withCacheFile(undefined, file => {
    assert.deepEqual(loadWamCache(file), { cache: null, stale: false });
  });
});

test('loadWamCache: frischer Cache → stale=false', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');
  const cache = { generatedAt: new Date(now - 10 * DAY).toISOString(), ligenByVerbandId: { 2: [liga(1)] } };
  withCacheFile(cache, file => {
    const res = loadWamCache(file, now);
    assert.equal(res.stale, false);
    assert.equal(res.cache.ligenByVerbandId['2'].length, 1);
  });
});

test('loadWamCache: älter als 150 Tage → stale=true, Cache trotzdem zurückgegeben', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');
  const cache = { generatedAt: new Date(now - 151 * DAY).toISOString(), ligenByVerbandId: {} };
  withCacheFile(cache, file => {
    const res = loadWamCache(file, now);
    assert.equal(res.stale, true);
    assert.ok(res.cache);
  });
});

test('loadWamCache: kaputtes JSON oder falsches Format → { cache: null, stale: false }', () => {
  withCacheFile('{ kaputt', file => assert.deepEqual(loadWamCache(file), { cache: null, stale: false }));
  withCacheFile({ generatedAt: 'kein-datum', ligenByVerbandId: {} }, file => assert.deepEqual(loadWamCache(file), { cache: null, stale: false }));
  withCacheFile({ generatedAt: new Date().toISOString() }, file => assert.deepEqual(loadWamCache(file), { cache: null, stale: false }));
});

test('buildLigaIndex: Map von String(ligaId) auf Liga über alle Verbände', () => {
  const idx = buildLigaIndex({ ligenByVerbandId: { 2: [liga(10), liga(11)], 6: [liga(20)] } });
  assert.equal(idx.size, 3);
  assert.equal(idx.get('10').liganame, 'Liga 10');
  assert.equal(idx.get('20').ligaId, 20);
  assert.equal(idx.get('999'), undefined);
});

test('refreshWamCache: vollständige Verbände werden übernommen, generatedAt gesetzt, keine partialVerbandIds', async () => {
  const fetchLeagues = async id => ({ ligen: [liga(id * 100)], complete: true });
  const { cache, incompleteVerbandIds } = await refreshWamCache({ verbandIds: [2, 6], fetchLeagues, now: new Date('2026-09-29T03:00:00Z') });
  assert.equal(cache.generatedAt, '2026-09-29T03:00:00.000Z');
  assert.deepEqual(Object.keys(cache.ligenByVerbandId).sort(), ['2', '6']);
  assert.deepEqual(incompleteVerbandIds, []);
  assert.equal('partialVerbandIds' in cache, false);
});

test('refreshWamCache: unvollständiger Verband behält den ALTEN Stand und wird gemeldet', async () => {
  const existingCache = { generatedAt: '2026-06-01T00:00:00.000Z', ligenByVerbandId: { 2: [liga(1), liga(2), liga(3)] } };
  const fetchLeagues = async () => ({ ligen: [liga(1)], complete: false });
  const { cache, incompleteVerbandIds } = await refreshWamCache({ verbandIds: [2], existingCache, fetchLeagues });
  assert.equal(cache.ligenByVerbandId['2'].length, 3, 'alter Stand (3 Ligen), nicht der Teilabruf (1 Liga)');
  assert.deepEqual(incompleteVerbandIds, ['2']);
  assert.deepEqual(cache.partialVerbandIds, ['2']);
});

test('refreshWamCache: unvollständiger Verband ohne alten Stand wird weggelassen', async () => {
  const fetchLeagues = async () => ({ ligen: [liga(1)], complete: false });
  const { cache, incompleteVerbandIds } = await refreshWamCache({ verbandIds: [2], existingCache: null, fetchLeagues });
  assert.equal('2' in cache.ligenByVerbandId, false);
  assert.deepEqual(incompleteVerbandIds, ['2']);
});

test('refreshWamCache: Verbände, die nicht mehr abgefragt werden, fallen aus dem Cache', async () => {
  const existingCache = { generatedAt: '2026-06-01T00:00:00.000Z', ligenByVerbandId: { 2: [liga(1)], 9: [liga(9)] } };
  const fetchLeagues = async id => ({ ligen: [liga(id)], complete: true });
  const { cache } = await refreshWamCache({ verbandIds: [2], existingCache, fetchLeagues });
  assert.deepEqual(Object.keys(cache.ligenByVerbandId), ['2']);
});
