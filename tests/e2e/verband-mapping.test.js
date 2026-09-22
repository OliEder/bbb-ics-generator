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
  assert.equal(deriveClubBundesland(teamVerbandIds), 'sachsen');
});
