'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchLeagueTable } = require('../../src/apiClient');

const realGet = axios.get;
afterEach(() => { axios.get = realGet; });

const entry = (rang, id, name) => ({
  rang, anzspiele: 10, s: 6, n: 4, anzGewinnpunkte: 12, koerbe: 700, gegenKoerbe: 650, korbdiff: 50,
  team: { teamPermanentId: id, teamname: name },
});

test('fetchLeagueTable: liefert teamId (String) je Zeile und behält isOwn', async () => {
  axios.get = async () => ({ data: { data: { tabelle: { entries: [entry(1, 111, 'Alpha'), entry(2, 222, 'Beta')] } } } });
  const rows = await fetchLeagueTable(55, 222);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].teamId, '111');
  assert.equal(rows[1].teamId, '222');
  assert.equal(rows[0].isOwn, false);
  assert.equal(rows[1].isOwn, true);
  assert.equal(rows[0].teamName, 'Alpha');
});

test('fetchLeagueTable: fehlende teamPermanentId → teamId null (kein "undefined")', async () => {
  axios.get = async () => ({ data: { data: { tabelle: { entries: [{ rang: 1, team: { teamname: 'Ohne Id' } }] } } } });
  const rows = await fetchLeagueTable(55, 1);
  assert.equal(rows[0].teamId, null);
});
