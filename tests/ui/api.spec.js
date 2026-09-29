// @ts-check
'use strict';

// API-Smoke-Tests gegen basketball-bund.net (Live-Netzwerk, Tag @network).
// Sie prüfen den VERTRAG, nicht die Daten: nur die Felder, die src/apiClient.js, src/wamClient.js
// und die Generatoren wirklich lesen. Fällt hier ein Feld weg oder ändert sich die Antwortform,
// bricht sonst die Portal-Ausgabe still (z.B. verschwinden Club-Links auf den Land-Seiten, wenn
// team.teamPermanentId aus der Tabelle fehlt).
// Fehlen in der laufenden Saison passende Daten (z.B. Saisonpause, kein Pokal), wird der jeweilige
// Test übersprungen statt rot zu werden. Ausgeführt werden diese Tests NICHT im PR-Lauf
// (test.yml: --grep-invert @network), sondern wöchentlich über .github/workflows/api-smoke.yml.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { loadClubs } = require('../../src/clubs');
const { fetchLeaguesForVerband } = require('../../src/wamClient');

// Seit der Multi-Club-Umstellung (Plan A) gibt es kein Root-config.json mehr: die Smoke-Tests
// nutzen den ersten Club unter clubs/<bundesland>/<club>/config.json.
const [smokeClub] = loadClubs(path.resolve(__dirname, '../../clubs'));
if (!smokeClub) throw new Error('Kein Club unter clubs/ gefunden — API-Smoke-Tests brauchen mindestens einen.');

const BASE = 'https://www.basketball-bund.net/rest';
const CLUB_ID = smokeClub.config.clubId;
const isLiga = name => String(name || '').toLowerCase().includes('liga'); // wie in src/cronUpdate.js

/** @type {any[]} */
let matches = [];

test.describe('BBB API Smoke Tests @network', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE}/club/id/${CLUB_ID}/actualmatches?justHome=false&rangeDays=150`);
    expect(res.status(), 'club/actualmatches muss mit 200 antworten').toBe(200);
    const body = await res.json();
    expect(Array.isArray(body?.data?.matches), 'data.matches muss ein Array sein').toBe(true);
    matches = body.data.matches;
  });

  test('club/actualmatches: Match-Felder, die fetchClubTeams und die Generatoren lesen', async () => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    const m = matches[0];
    for (const key of ['matchId', 'kickoffDate', 'kickoffTime', 'homeTeam', 'guestTeam', 'ligaData']) {
      expect(m, `Match ohne ${key}`).toHaveProperty(key);
    }
    for (const side of ['homeTeam', 'guestTeam']) {
      for (const key of ['teamPermanentId', 'teamname', 'clubId']) {
        expect(m[side], `${side} ohne ${key}`).toHaveProperty(key);
      }
    }
    for (const key of ['ligaId', 'liganame', 'seasonId', 'verbandId', 'akName', 'geschlecht']) {
      expect(m.ligaData, `ligaData ohne ${key}`).toHaveProperty(key);
    }
  });

  test('team/matches: matches-Array und team.teamGenderId', async ({ request }) => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    const m = matches[0];
    const teamId = m.homeTeam?.teamPermanentId || m.guestTeam?.teamPermanentId;
    expect(teamId).toBeTruthy();
    const res = await request.get(`${BASE}/team/id/${teamId}/matches`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body?.data?.matches)).toBe(true);
    expect(body.data.team, 'data.team fehlt (Geschlecht wird daraus gelesen)').toHaveProperty('teamGenderId');
  });

  test('match/matchInfo: Felder, die icsGenerator und mapMatches lesen', async ({ request }) => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    const res = await request.get(`${BASE}/match/id/${matches[0].matchId}/matchInfo`);
    expect(res.status()).toBe(200);
    const info = (await res.json())?.data;
    expect(info).toBeTruthy();
    for (const key of ['matchId', 'matchNo', 'kickoffDate', 'kickoffTime', 'homeTeam', 'guestTeam', 'ligaData', 'matchInfo']) {
      expect(info, `matchInfo ohne ${key}`).toHaveProperty(key);
    }
  });

  test('competition/table: Zeilenfelder inkl. team.teamPermanentId (Club-Links auf Land-Seiten)', async ({ request }) => {
    const liga = matches.map(m => m.ligaData).find(l => isLiga(l?.liganame));
    test.skip(!liga, 'Keine Liga in den Spielen des Clubs');
    const res = await request.get(`${BASE}/competition/table/id/${liga.ligaId}`);
    expect(res.status()).toBe(200);
    const entries = (await res.json())?.data?.tabelle?.entries;
    expect(Array.isArray(entries), 'data.tabelle.entries muss ein Array sein').toBe(true);
    test.skip(entries.length === 0, 'Tabelle noch leer (Saisonstart)');
    for (const key of ['rang', 'anzspiele', 's', 'n', 'anzGewinnpunkte', 'koerbe', 'gegenKoerbe', 'korbdiff', 'team']) {
      expect(entries[0], `Tabellenzeile ohne ${key}`).toHaveProperty(key);
    }
    for (const key of ['teamPermanentId', 'teamname']) {
      expect(entries[0].team, `Tabellenzeile: team ohne ${key}`).toHaveProperty(key);
    }
  });

  test('competition/spielplan (+ matchday): Pokal-/Turnierstruktur für fetchTournamentRounds', async ({ request }) => {
    const cup = matches.map(m => m.ligaData).find(l => l && !isLiga(l.liganame));
    test.skip(!cup, 'Kein Pokal/Turnier in den Spielen des Clubs');
    const res = await request.get(`${BASE}/competition/spielplan/id/${cup.ligaId}`);
    expect(res.status()).toBe(200);
    const data = (await res.json())?.data;
    expect(data).toBeTruthy();
    // spieltage/matches sind optional (der Code liest beide mit `|| []`; Turniere liefern z.B.
    // spieltage: null) — vorhanden müssen sie aber Arrays sein.
    for (const key of ['spieltage', 'matches']) {
      if (data[key] != null) expect(Array.isArray(data[key]), `data.${key} muss ein Array sein`).toBe(true);
    }
    data.spieltage = data.spieltage || [];
    data.matches = data.matches || [];

    if (data.spieltage.length > 0) {
      // Pfad A: je Spieltag ein eigener Abruf
      expect(data.spieltage[0]).toHaveProperty('spieltag');
      const md = await request.get(`${BASE}/competition/id/${cup.ligaId}/matchday/${data.spieltage[0].spieltag}`);
      expect(md.status()).toBe(200);
      expect(Array.isArray((await md.json())?.data?.matches)).toBe(true);
    } else if (data.matches.length > 0) {
      // Pfad B: Matches inline, gruppiert nach matchDay
      for (const key of ['matchDay', 'homeTeam', 'guestTeam']) {
        expect(data.matches[0], `Inline-Match ohne ${key}`).toHaveProperty(key);
      }
    }
  });

  test('wam/liga/list: reale Antwortform (flach unter data, NICHT unter data.ligaListe wie in der Spec)', async ({ request }) => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    const verbandId = Number(matches[0].ligaData.verbandId);
    const res = await request.post(`${BASE}/wam/liga/list?startAtIndex=0`, { data: { token: 0, verbandIds: [verbandId] } });
    expect(res.status()).toBe(200);
    const data = (await res.json())?.data;
    expect(data, 'data fehlt').toBeTruthy();
    // Spec ↔ Realität (ADR-018): Ändert die API die Form Richtung Spec, muss wamClient.js angepasst werden.
    expect(data.ligaListe, 'API liefert jetzt data.ligaListe (wie in der Spec) — src/wamClient.js anpassen!').toBeUndefined();
    expect(Array.isArray(data.ligen), 'data.ligen muss ein Array sein').toBe(true);
    expect(typeof data.hasMoreData).toBe('boolean');
    expect(typeof data.size).toBe('number');
    expect(data.ligen.length).toBeGreaterThan(0);
    for (const key of ['ligaId', 'liganame', 'skEbeneId', 'skEbeneName', 'bezirknr', 'bezirkName', 'kreisnr', 'kreisname']) {
      expect(data.ligen[0], `Liga ohne ${key}`).toHaveProperty(key);
    }
  });

  test('wam/liga/list: startAtIndex paginiert wirklich (Seite 2 ≠ Seite 1)', async ({ request }) => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    const verbandId = Number(matches[0].ligaData.verbandId);
    const page = async index => (await (await request.post(`${BASE}/wam/liga/list?startAtIndex=${index}`, { data: { token: 0, verbandIds: [verbandId] } })).json()).data;
    const first = await page(0);
    test.skip(!first.hasMoreData, 'Verband hat nur eine Seite');
    const second = await page(10);
    expect(second.ligen[0].ligaId, 'Seite 2 liefert dieselbe Liga wie Seite 1 — startAtIndex wirkt nicht mehr').not.toBe(first.ligen[0].ligaId);
  });

  test('wam/liga/list: jede ligaId aus den Match-Daten kommt im WAM-Ergebnis vor (Join-Schlüssel, ADR-018)', async () => {
    test.skip(matches.length === 0, 'Keine Spiele im Zeitfenster (Saisonpause?)');
    test.setTimeout(180_000);
    const verbandId = Number(matches[0].ligaData.verbandId);
    const { ligen, complete } = await fetchLeaguesForVerband(verbandId, { delayMs: 150 });
    expect(complete, 'WAM-Abruf war unvollständig').toBe(true);
    const wamIds = new Set(ligen.map(l => String(l.ligaId)));
    const missing = [...new Set(matches.map(m => String(m.ligaData.ligaId)))].filter(id => !wamIds.has(id));
    expect(missing, `ligaIds aus Match-Daten fehlen in WAM (Verband ${verbandId}): ${missing.join(', ')}`).toEqual([]);
  });
});
