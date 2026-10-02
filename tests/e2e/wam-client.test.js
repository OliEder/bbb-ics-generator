'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchLeaguesForVerband } = require('../../src/wamClient');

const realPost = axios.post;
afterEach(() => { axios.post = realPost; });

function rawLiga(id) {
  return {
    ligaId: id, liganame: `Liga ${id}`, skEbeneId: 1, skEbeneName: 'Bezirk',
    bezirknr: 1, bezirkName: 'Oberbayern', kreisnr: null, kreisname: null,
    verbandId: 2, verbandName: 'Bayern', seasonId: null, tableExists: null,
  };
}

// Simuliert die echte API: startAtIndex kommt als Query-Parameter, Antwort unter data.ligen.
function pageResponse(startAtIndex, total, size = 10) {
  const ids = [];
  for (let i = startAtIndex; i < Math.min(startAtIndex + size, total); i++) ids.push(1000 + i);
  return { data: { status: '0', data: { startAtIndex: 0, ligen: ids.map(rawLiga), hasMoreData: startAtIndex + size < total, size } } };
}

function startIndexOf(url) {
  return Number(new URL(url).searchParams.get('startAtIndex'));
}

test('fetchLeaguesForVerband: paginiert über startAtIndex-Query bis hasMoreData=false', async () => {
  const calls = [];
  axios.post = async (url, body) => {
    calls.push({ url, body });
    return pageResponse(startIndexOf(url), 23);
  };

  const { ligen, complete } = await fetchLeaguesForVerband(2, { delayMs: 0 });

  assert.equal(complete, true);
  assert.equal(ligen.length, 23);
  assert.deepEqual(calls.map(c => startIndexOf(c.url)), [0, 10, 20]);
  assert.ok(calls[0].url.startsWith('https://www.basketball-bund.net/rest/wam/liga/list?'));
  assert.deepEqual(calls[0].body, { token: 0, verbandIds: [2] });
});

test('fetchLeaguesForVerband: übernimmt nur die relevanten Liga-Felder', async () => {
  axios.post = async url => pageResponse(startIndexOf(url), 1);
  const { ligen } = await fetchLeaguesForVerband(2, { delayMs: 0 });
  assert.deepEqual(Object.keys(ligen[0]).sort(), [
    'bezirkName', 'bezirknr', 'kreisname', 'kreisnr', 'ligaId', 'liganame', 'skEbeneId', 'skEbeneName',
  ]);
  assert.equal(ligen[0].ligaId, 1000);
  assert.equal(ligen[0].bezirkName, 'Oberbayern');
});

test('fetchLeaguesForVerband: gebietIds werden in den Body übernommen', async () => {
  let body;
  axios.post = async (url, b) => { body = b; return pageResponse(0, 1); };
  await fetchLeaguesForVerband(2, { gebietIds: ['_'], delayMs: 0 });
  assert.deepEqual(body, { token: 0, verbandIds: [2], gebietIds: ['_'] });
});

test('fetchLeaguesForVerband: schlägt eine Seite fehl, kommen die bisherigen Ligen mit complete=false zurück', async () => {
  axios.post = async url => {
    if (startIndexOf(url) === 20) throw new Error('Netzwerkfehler');
    return pageResponse(startIndexOf(url), 45);
  };
  const { ligen, complete } = await fetchLeaguesForVerband(2, { delayMs: 0 });
  assert.equal(complete, false);
  assert.equal(ligen.length, 20);
});

test('fetchLeaguesForVerband: unerwartete Antwortstruktur → complete=false statt Absturz', async () => {
  axios.post = async () => ({ data: { data: { ligaListe: [] } } });
  const { ligen, complete } = await fetchLeaguesForVerband(2, { delayMs: 0 });
  assert.equal(complete, false);
  assert.deepEqual(ligen, []);
});

test('fetchLeaguesForVerband: leere Seite trotz hasMoreData=true bricht ab (Endlosschleifen-Schutz)', async () => {
  axios.post = async () => ({ data: { data: { ligen: [], hasMoreData: true, size: 10 } } });
  const { complete } = await fetchLeaguesForVerband(2, { delayMs: 0 });
  assert.equal(complete, false);
});
