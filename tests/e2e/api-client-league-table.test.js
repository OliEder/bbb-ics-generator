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

const { fetchLeagueTableWithMeta } = require('../../src/apiClient');

test('fetchLeagueTableWithMeta: liefert rows und die Flags tableExists/crossTableExists', async () => {
  axios.get = async () => ({ data: { data: {
    ligaData: { tableExists: true, crossTableExists: true },
    tabelle: { entries: [entry(1, 111, 'Alpha'), entry(2, 222, 'Beta')] },
  } } });
  const res = await fetchLeagueTableWithMeta(55, 222);
  assert.equal(res.tableExists, true);
  assert.equal(res.crossTableExists, true);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[1].isOwn, true);
});

test('fetchLeagueTableWithMeta: fehlende Flags → false/false (keine Booleans geraten)', async () => {
  axios.get = async () => ({ data: { data: { tabelle: { entries: [] } } } });
  const res = await fetchLeagueTableWithMeta(55, 1);
  assert.deepEqual(res, { rows: [], tableExists: false, crossTableExists: false });
});

test('fetchLeagueTableWithMeta: Abruffehler → null', async () => {
  const origError = console.error; console.error = () => {};
  axios.get = async () => { throw new Error('boom'); };
  try { assert.equal(await fetchLeagueTableWithMeta(55, 1), null); } finally { console.error = origError; }
});

test('fetchLeagueTable: Rückgabewert unverändert (Array bzw. null bei Fehler)', async () => {
  const origError = console.error; console.error = () => {};
  axios.get = async () => ({ data: { data: { ligaData: { crossTableExists: true }, tabelle: { entries: [entry(1, 111, 'Alpha')] } } } });
  try {
    const rows = await fetchLeagueTable(55, 111);
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 1);
    axios.get = async () => { throw new Error('boom'); };
    assert.equal(await fetchLeagueTable(55, 111), null);
  } finally { console.error = origError; }
});
