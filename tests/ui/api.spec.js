// @ts-check
'use strict';

// NOTE: Diese Tests benötigen eine aktive Internetverbindung zu basketball-bund.net.
// In CI-Umgebungen ohne Netzwerkzugang schlagen sie fehl — das ist beabsichtigt (Smoke Tests).

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { loadClubs } = require('../../src/clubs');

// Seit der Multi-Club-Umstellung (Plan A) gibt es kein Root-config.json mehr: der Smoke-Test
// nutzt den ersten Club unter clubs/<bundesland>/<club>/config.json.
const [smokeClub] = loadClubs(path.resolve(__dirname, '../../clubs'));
if (!smokeClub) throw new Error('Kein Club unter clubs/ gefunden — API-Smoke-Tests brauchen mindestens einen.');

const BASE = 'https://www.basketball-bund.net/rest';
const CLUB_ID = smokeClub.config.clubId;

test.describe('BBB API Smoke Tests @network', () => {
  test('Club-Matches Endpoint antwortet mit HTTP 200', async ({ request }) => {
    const res = await request.get(`${BASE}/club/id/${CLUB_ID}/actualmatches?justHome=false&rangeDays=150`);
    expect(res.status()).toBe(200);
  });

  test('Club-Response enthält matches-Array', async ({ request }) => {
    const res = await request.get(`${BASE}/club/id/${CLUB_ID}/actualmatches?justHome=false&rangeDays=150`);
    const body = await res.json();
    expect(Array.isArray(body?.data?.matches)).toBe(true);
  });

  test('Match-Objekt enthält Pflichtfelder', async ({ request }) => {
    const res = await request.get(`${BASE}/club/id/${CLUB_ID}/actualmatches?justHome=false&rangeDays=150`);
    const body = await res.json();
    const match = body?.data?.matches?.[0];
    expect(match).toBeTruthy();
    expect(match).toHaveProperty('matchId');
    expect(match).toHaveProperty('kickoffDate');
    expect(match).toHaveProperty('homeTeam');
    expect(match).toHaveProperty('guestTeam');
  });

  test('Team-Matches Endpoint funktioniert', async ({ request }) => {
    const clubRes = await request.get(`${BASE}/club/id/${CLUB_ID}/actualmatches?justHome=false&rangeDays=150`);
    const body = await clubRes.json();
    const firstMatch = body?.data?.matches?.[0];
    const teamId = firstMatch?.homeTeam?.teamPermanentId || firstMatch?.guestTeam?.teamPermanentId;
    expect(teamId).toBeTruthy();

    const teamRes = await request.get(`${BASE}/team/id/${teamId}/matches`);
    expect(teamRes.status()).toBe(200);
    const teamBody = await teamRes.json();
    expect(Array.isArray(teamBody?.data?.matches)).toBe(true);
  });
});
