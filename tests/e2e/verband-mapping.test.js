'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verbandIdToBundesland, deriveClubBundesland } = require('../../src/verbandMapping.js');

test('verbandIdToBundesland: bekannte Landesverband-ID liefert Bundesland-Slug', () => {
  assert.equal(verbandIdToBundesland(2), 'bayern');
});

test('verbandIdToBundesland: unbekannte oder bundesweite ID liefert bundesweit', () => {
  assert.equal(verbandIdToBundesland(100), 'bundesweit');
  assert.equal(verbandIdToBundesland(999999), 'bundesweit');
  assert.equal(verbandIdToBundesland(null), 'bundesweit');
  assert.equal(verbandIdToBundesland(undefined), 'bundesweit');
});

test('deriveClubBundesland: häufigstes nicht-bundesweites Bundesland gewinnt', () => {
  const teamVerbandIds = [2, 2, 5]; // 2x Bayern, 1x ein anderes Bundesland
  const result = deriveClubBundesland(teamVerbandIds);
  assert.equal(result, 'bayern');
});

test('deriveClubBundesland: bundesweite Verbände werden bei der Zählung ignoriert', () => {
  const teamVerbandIds = [100, 100, 2]; // 2x bundesweit, 1x Bayern
  const result = deriveClubBundesland(teamVerbandIds);
  assert.equal(result, 'bayern');
});

test('deriveClubBundesland: ausschließlich bundesweite Verbände ergibt bundesweit', () => {
  const teamVerbandIds = [100, 100];
  const result = deriveClubBundesland(teamVerbandIds);
  assert.equal(result, 'bundesweit');
});

test('deriveClubBundesland: leere Liste ergibt bundesweit', () => {
  assert.equal(deriveClubBundesland([]), 'bundesweit');
});

test('deriveClubBundesland: Gleichstand wählt das zuerst gesehene Bundesland deterministisch', () => {
  const teamVerbandIds = [5, 2];
  assert.equal(deriveClubBundesland(teamVerbandIds), 'hamburg');
});

test('deriveClubBundesland: N-Wege-Gleichstand wählt das zuerst gesehene Bundesland deterministisch', () => {
  const teamVerbandIds = [2, 5, 8];
  assert.equal(deriveClubBundesland(teamVerbandIds), 'bayern');
});

test('verbandIdToBundesland: nicht-numerischer String liefert bundesweit (NaN-Fallback)', () => {
  assert.equal(verbandIdToBundesland('abc'), 'bundesweit');
});

test('verbandIdToBundesland: NaN liefert bundesweit', () => {
  assert.equal(verbandIdToBundesland(NaN), 'bundesweit');
});

test('verbandIdToBundesland: negative Zahl liefert bundesweit', () => {
  assert.equal(verbandIdToBundesland(-1), 'bundesweit');
});
