'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchTeamMatches } = require('../../src/apiClient');

test('fetchTeamMatches: liefert teamAkjId und teamNumber aus der API-Antwort', async (t) => {
  t.mock.method(axios, 'get', () => Promise.resolve({
    data: { data: {
      team: { teamGenderId: 1, teamAkjId: 1, teamNumber: 2 },
      matches: [],
    } },
  }));

  const result = await fetchTeamMatches(167890);

  assert.equal(result.teamAkjId, 1);
  assert.equal(result.teamNumber, 2);
  assert.equal(result.gender, 'männlich');
});

test('fetchTeamMatches: teamAkjId/teamNumber fehlen bei API-Fehler (Fallback)', async (t) => {
  t.mock.method(axios, 'get', () => Promise.reject(new Error('Network error')));

  const result = await fetchTeamMatches(167890);

  assert.equal(result.teamAkjId, undefined);
  assert.equal(result.teamNumber, undefined);
  assert.deepEqual(result.matches, []);
});

test('fetchTeamMatches: teamAkjId/teamNumber undefined wenn im team-Objekt nicht vorhanden', async (t) => {
  t.mock.method(axios, 'get', () => Promise.resolve({
    data: { data: {
      team: { teamGenderId: 2 },
      matches: [],
    } },
  }));

  const result = await fetchTeamMatches(167890);

  assert.equal(result.teamAkjId, undefined);
  assert.equal(result.teamNumber, undefined);
  assert.equal(result.gender, 'weiblich');
});
