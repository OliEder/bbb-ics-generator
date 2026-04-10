'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateICS } = require('../../src/icsGenerator.js');
const { matches, details } = require('../fixtures/mockResponses.js');

const TEAM_ID = 167881;
const TEAM_NAME = 'Fibalon Baskets Neumarkt U10';

// ---- Basic structure ----

test('ICS enthält BEGIN:VCALENDAR und END:VCALENDAR', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('BEGIN:VCALENDAR'), 'BEGIN:VCALENDAR fehlt');
  assert.ok(ics.includes('END:VCALENDAR'), 'END:VCALENDAR fehlt');
});

test('ICS enthält VERSION:2.0', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('VERSION:2.0'), 'VERSION:2.0 fehlt');
});

test('ICS enthält X-WR-CALNAME mit Teamnamen', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('X-WR-CALNAME:Fibalon Baskets Neumarkt U10'), 'X-WR-CALNAME fehlt oder falsch');
});

test('ICS enthält X-WR-TIMEZONE:Europe/Berlin', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('X-WR-TIMEZONE:Europe/Berlin'), 'X-WR-TIMEZONE fehlt');
});

// ---- Event count ----

test('Anzahl BEGIN:VEVENT = Anzahl Matches (type=all)', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(count, matches.length);
});

// ---- Timing ----

test('DTSTART ist 1h vor Kickoff (10:00 => 09:00)', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  // local time 09:00 on 2026-05-10
  assert.ok(ics.includes('20260510T090000'), `DTSTART falsch, ICS:\n${ics}`);
});

test('DTEND ist 2.5h nach Kickoff (10:00 => 12:30)', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('20260510T123000'), `DTEND falsch, ICS:\n${ics}`);
});

// ---- Summary & UID ----

test('SUMMARY enthält (Spiel 1)', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('(Spiel 1)'), `SUMMARY fehlt (Spiel 1), ICS:\n${ics}`);
});

test('UID enthält 5001@basketball-bund.net', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('5001@basketball-bund.net'), 'UID fehlt');
});

// ---- Location ----

test('LOCATION enthält Teststr. 1', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('Teststr. 1'), 'LOCATION enthält Teststr. 1 nicht');
});

// ---- type=all: home/away prefixes ----

test('type=all: alle 2 Matches enthalten', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(count, 2);
});

test('type=all: Heimspiel enthält HEIM: in SUMMARY', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('HEIM:'), `HEIM: fehlt im ICS:\n${ics}`);
});

test('type=all: Auswärtsspiel enthält AUSWÄRTS: in SUMMARY', async () => {
  const ics = await generateICS(matches, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('AUSWÄRTS:'), `AUSWÄRTS: fehlt im ICS:\n${ics}`);
});

// ---- type=home ----

test('type=home: nur 1 Match (matchId 5001)', async () => {
  const homeMatches = matches.filter(m => Number(m.homeTeam.teamPermanentId) === TEAM_ID);
  const ics = await generateICS(homeMatches, details, TEAM_ID, 'home', TEAM_NAME);
  const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(count, 1);
  assert.ok(ics.includes('5001@basketball-bund.net'), 'Falsches Match in home ICS');
});

// ---- type=away ----

test('type=away: nur 1 Match (matchId 5002)', async () => {
  const awayMatches = matches.filter(m => Number(m.guestTeam.teamPermanentId) === TEAM_ID);
  const ics = await generateICS(awayMatches, details, TEAM_ID, 'away', TEAM_NAME);
  const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(count, 1);
  assert.ok(ics.includes('5002@basketball-bund.net'), 'Falsches Match in away ICS');
});

// ---- VALARM triggers ----

test('VALARM Heimspiel: TRIGGER enthält -PT30M', async () => {
  const match5001 = matches.filter(m => m.matchId === 5001);
  const ics = await generateICS(match5001, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('-PT30M'), `TRIGGER -PT30M fehlt:\n${ics}`);
});

test('VALARM Auswärtsspiel: TRIGGER enthält -PT60M', async () => {
  const match5002 = matches.filter(m => m.matchId === 5002);
  const ics = await generateICS(match5002, details, TEAM_ID, 'all', TEAM_NAME);
  assert.ok(ics.includes('-PT60M'), `TRIGGER -PT60M fehlt:\n${ics}`);
});
