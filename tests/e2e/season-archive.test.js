'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBySeasonId } = require('../../src/seasonArchive');

test('groupBySeasonId: gruppiert Matches nach ligaData.seasonId', () => {
  const matches = [
    { matchId: 1, ligaData: { seasonId: 2026 } },
    { matchId: 2, ligaData: { seasonId: 2025 } },
    { matchId: 3, ligaData: { seasonId: 2026 } },
  ];
  const grouped = groupBySeasonId(matches);
  assert.deepEqual(Object.keys(grouped).sort(), ['2025', '2026']);
  assert.equal(grouped[2026].length, 2);
  assert.equal(grouped[2025].length, 1);
  assert.equal(grouped[2025][0].matchId, 2);
});

test('groupBySeasonId: ignoriert Matches ohne seasonId', () => {
  const matches = [
    { matchId: 1, ligaData: {} },
    { matchId: 2, ligaData: { seasonId: 2026 } },
  ];
  const grouped = groupBySeasonId(matches);
  assert.deepEqual(Object.keys(grouped), ['2026']);
});

test('groupBySeasonId: leere Liste ergibt leeres Objekt', () => {
  assert.deepEqual(groupBySeasonId([]), {});
});
