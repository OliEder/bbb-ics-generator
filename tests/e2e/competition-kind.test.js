'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kindFromName, isLeagueByName, resolveCompetition } = require('../../src/competitionKind');

test('kindFromName: Klassifikation nach Namen', () => {
  assert.equal(kindFromName('OPF Bezirksklasse Damen 2026/27'), 'unknown');
  assert.equal(kindFromName('Kreisklasse Herren A'), 'unknown');
  assert.equal(kindFromName('Bezirksoberliga Herren'), 'league');
  assert.equal(kindFromName('Landesliga Nord'), 'league');
  assert.equal(kindFromName('OPF Bezirkspokal Herren 26-27'), 'cup');
  assert.equal(kindFromName('Bayernpokal 2027 Herren'), 'cup');
  assert.equal(kindFromName('Ligapokal Herren'), 'cup');
  assert.equal(kindFromName('Qualifikationsspiel bayerische Meisterschaft'), 'cup');
  assert.equal(kindFromName('DBB Cup'), 'cup');
  assert.equal(kindFromName('Stadtturnier'), 'cup');
  assert.equal(kindFromName(''), 'unknown');
  assert.equal(kindFromName(undefined), 'unknown');
});

test('isLeagueByName: nur eindeutige Liga-Namen', () => {
  assert.equal(isLeagueByName('Bezirksliga'), true);
  assert.equal(isLeagueByName('Ligapokal'), false);
  assert.equal(isLeagueByName('Bezirksklasse Damen'), false);
});

function makeApi({ meta, rounds = [{ roundName: 'Finale', matches: [] }] } = {}) {
  const calls = { table: 0, meta: 0, bracket: 0 };
  return {
    calls,
    fns: {
      fetchLeagueTable: async () => { calls.table++; return [{ rank: 1 }]; },
      fetchLeagueTableWithMeta: async () => { calls.meta++; return meta; },
      fetchTournamentRounds: async () => { calls.bracket++; return rounds; },
    },
  };
}

test('resolveCompetition: unknown + crossTableExists=true → league, genau ein Table-Abruf', async () => {
  const api = makeApi({ meta: { rows: [{ rank: 1 }], tableExists: true, crossTableExists: true } });
  const c = await resolveCompetition({ ligaId: '1', liganame: 'OPF Bezirksklasse Damen 2026/27' }, '5', api.fns);
  assert.equal(c.isLiga, true);
  assert.deepEqual(c.table, [{ rank: 1 }]);
  assert.equal(c.bracket, null);
  assert.deepEqual(api.calls, { table: 0, meta: 1, bracket: 0 });
});

test('resolveCompetition: unknown + crossTableExists=false → cup mit Bracket', async () => {
  const api = makeApi({ meta: { rows: [{ rank: 1 }], tableExists: true, crossTableExists: false } });
  const c = await resolveCompetition({ ligaId: '1', liganame: 'Kreisklasse X' }, '5', api.fns);
  assert.equal(c.isLiga, false);
  assert.equal(c.table, null);
  assert.equal(c.bracket.length, 1);
  assert.equal(api.calls.bracket, 1);
});

test('resolveCompetition: unknown + Abruffehler → cup', async () => {
  const api = makeApi({ meta: null });
  const c = await resolveCompetition({ ligaId: '1', liganame: 'Kreisklasse X' }, '5', api.fns);
  assert.equal(c.isLiga, false);
  assert.equal(api.calls.bracket, 1);
});

test('resolveCompetition: unknown ohne fetchLeagueTableWithMeta in apiFns → cup (abwärtskompatibel)', async () => {
  const api = makeApi({});
  delete api.fns.fetchLeagueTableWithMeta;
  const c = await resolveCompetition({ ligaId: '1', liganame: 'Kreisklasse X' }, '5', api.fns);
  assert.equal(c.isLiga, false);
});

test('resolveCompetition: Name mit "liga" → league ohne Metadaten-Abruf', async () => {
  const api = makeApi({});
  const c = await resolveCompetition({ ligaId: '1', liganame: 'Bezirksliga Nord' }, '5', api.fns);
  assert.equal(c.isLiga, true);
  assert.deepEqual(c.table, [{ rank: 1 }]);
  assert.deepEqual(api.calls, { table: 1, meta: 0, bracket: 0 });
});

test('resolveCompetition: "pokal" → cup ohne Table-Abruf', async () => {
  const api = makeApi({});
  const c = await resolveCompetition({ ligaId: '1', liganame: 'Ligapokal' }, '5', api.fns);
  assert.equal(c.isLiga, false);
  assert.deepEqual(api.calls, { table: 0, meta: 0, bracket: 1 });
});
