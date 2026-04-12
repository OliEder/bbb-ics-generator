'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapMatches, computeSpotlight } = require('../../src/cronUpdate');

// Minimal match factory
function makeMatch({ matchId = 1, teamId = 100, isHome = true, result = null, date = '2026-05-01', time = '18:00', liganame = 'Bezirksliga', oppId = 999 } = {}) {
  return {
    matchId,
    kickoffDate: date,
    kickoffTime: time,
    result,
    homeTeam: {
      teamPermanentId: isHome ? teamId : oppId,
      teamname: isHome ? 'Eigenes Team' : 'Gegner',
      teamnameSmall: isHome ? 'ET' : 'GG',
    },
    guestTeam: {
      teamPermanentId: isHome ? oppId : teamId,
      teamname: isHome ? 'Gegner' : 'Eigenes Team',
      teamnameSmall: isHome ? 'GG' : 'ET',
    },
    ligaData: { liganame, seasonId: 2025 },
  };
}

test('mapMatches: isHome korrekt gesetzt', () => {
  const m = makeMatch({ teamId: 100, isHome: true });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.isHome, true);
});

test('mapMatches: isHome false bei Auswärtsspiel', () => {
  const m = makeMatch({ teamId: 100, isHome: false });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.isHome, false);
});

test('mapMatches: opponent ist Gegnerteam-Name', () => {
  const m = makeMatch({ teamId: 100, isHome: true });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.opponent, 'Gegner');
});

test('mapMatches: opponent bei Auswärtsspiel ist Heimteam-Name', () => {
  const m = makeMatch({ teamId: 100, isHome: false });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.opponent, 'Gegner');
});

test('mapMatches: erstes Spiel ohne Ergebnis bekommt isNext=true', () => {
  const matches = [
    makeMatch({ matchId: 1, result: '80:70', date: '2026-03-01' }),
    makeMatch({ matchId: 2, result: null,    date: '2026-04-01' }),
    makeMatch({ matchId: 3, result: null,    date: '2026-05-01' }),
  ];
  const results = mapMatches(matches, 100, {});
  assert.equal(results[0].isNext, false, 'Spiel mit Ergebnis darf kein isNext sein');
  assert.equal(results[1].isNext, true,  'Erstes offenes Spiel soll isNext sein');
  assert.equal(results[2].isNext, false, 'Zweites offenes Spiel darf kein isNext sein');
});

test('mapMatches: kein isNext wenn alle Spiele Ergebnisse haben', () => {
  const matches = [
    makeMatch({ matchId: 1, result: '80:70' }),
    makeMatch({ matchId: 2, result: '60:55' }),
  ];
  const results = mapMatches(matches, 100, {});
  assert.ok(results.every(r => !r.isNext), 'Kein isNext wenn alle Ergebnisse vorliegen');
});

test('mapMatches: venueAddress aus matchInfo.spielfeld extrahiert', () => {
  const m = makeMatch({ matchId: 42, result: null });
  const details = {
    42: {
      matchInfo: {
        spielfeld: {
          bezeichnung: 'Sporthalle West',
          strasse: 'Mühlenstr. 1',
          plz: '92318',
          ort: 'Neumarkt',
        },
      },
    },
  };
  const [result] = mapMatches([m], 100, details);
  assert.equal(result.venueName, 'Sporthalle West');
  assert.equal(result.venueAddress, 'Mühlenstr. 1, 92318 Neumarkt');
});

test('mapMatches: venueAddress leer wenn spielfeld fehlt', () => {
  const m = makeMatch({ matchId: 42, result: null });
  const details = { 42: {} };
  const [result] = mapMatches([m], 100, details);
  assert.equal(result.venueName, '');
  assert.equal(result.venueAddress, '');
});

test('mapMatches: venueAddress leer wenn nur ort aber keine strasse', () => {
  const m = makeMatch({ matchId: 42, result: null });
  const details = {
    42: { matchInfo: { spielfeld: { plz: '92318', ort: 'Neumarkt' } } },
  };
  const [result] = mapMatches([m], 100, details);
  assert.equal(result.venueAddress, '', 'Ohne Straße keine Adresse');
});

test('mapMatches: opponentLogoUrl für isNext Heimspiel gesetzt', () => {
  const m = makeMatch({ matchId: 42, result: null, isHome: true, oppId: 9999 });
  const details = { 42: { matchInfo: { spielfeld: { strasse: 'X', ort: 'Y', plz: '00000' } } } };
  const [result] = mapMatches([m], 100, details);
  assert.ok(result.opponentLogoUrl.includes('9999'), 'Gegner-ID in Logo-URL');
  assert.ok(result.opponentLogoUrl.includes('basketball-bund.net'), 'BBB-Domain in Logo-URL');
});

test('mapMatches: opponentLogoUrl für isNext Auswärtsspiel gesetzt', () => {
  const m = makeMatch({ matchId: 42, result: null, isHome: false, teamId: 100, oppId: 8888 });
  const details = { 42: { matchInfo: { spielfeld: { strasse: 'X', ort: 'Y', plz: '00000' } } } };
  const [result] = mapMatches([m], 100, details);
  assert.ok(result.opponentLogoUrl.includes('8888'), 'Heimteam-ID (=Gegner) in Logo-URL');
});

test('mapMatches: venue und logo nur beim isNext Spiel gesetzt', () => {
  const matches = [
    makeMatch({ matchId: 1, result: '80:70', date: '2026-03-01' }),
    makeMatch({ matchId: 2, result: null,    date: '2026-04-01' }),
    makeMatch({ matchId: 3, result: null,    date: '2026-05-01' }),
  ];
  const details = {
    2: { matchInfo: { spielfeld: { bezeichnung: 'Halle', strasse: 'Str. 1', plz: '12345', ort: 'Stadt' } } },
    3: { matchInfo: { spielfeld: { bezeichnung: 'Halle2', strasse: 'Str. 2', plz: '12345', ort: 'Stadt' } } },
  };
  const results = mapMatches(matches, 100, details);
  assert.equal(results[0].venueName, '',      'Vergangenes Spiel hat kein venue');
  assert.equal(results[1].venueName, 'Halle', 'isNext hat venue');
  assert.equal(results[2].venueName, '',      'Zweites offenes Spiel hat kein venue');
});

test('mapMatches: date und time korrekt übernommen', () => {
  const m = makeMatch({ date: '2026-06-15', time: '19:30' });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.date, '2026-06-15');
  assert.equal(result.time, '19:30');
});

test('mapMatches: competition aus ligaData.liganame', () => {
  const m = makeMatch({ liganame: 'U16 männlich Bezirksoberliga' });
  const [result] = mapMatches([m], 100, {});
  assert.equal(result.competition, 'U16 männlich Bezirksoberliga');
});

test('computeSpotlight: isNext + vorheriges Ergebnis → 2 Spiele', () => {
  const matches = [
    { date: '2026-03-01', result: '80:70', isNext: false, isHome: true, opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-04-10', result: null,    isNext: true,  isHome: false, opponent: 'B', competition: 'Liga', opponentShort: 'B', ownShort: 'A', time: '15:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-05-01', result: null,    isNext: false, isHome: true,  opponent: 'C', competition: 'Liga', opponentShort: 'C', ownShort: 'A', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 2);
  assert.equal(result[0].result, '80:70');
  assert.equal(result[1].isNext, true);
});

test('computeSpotlight: nur isNext (kein vorheriges Ergebnis) → 1 Spiel', () => {
  const matches = [
    { date: '2026-04-10', result: null, isNext: true, isHome: true, opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 1);
  assert.equal(result[0].isNext, true);
});

test('computeSpotlight: alle gespielt → letzte 2', () => {
  const matches = [
    { date: '2026-02-01', result: '60:50', isNext: false, isHome: true,  opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-03-01', result: '70:60', isNext: false, isHome: false, opponent: 'B', competition: 'Liga', opponentShort: 'B', ownShort: 'A', time: '15:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-04-01', result: '80:70', isNext: false, isHome: true,  opponent: 'C', competition: 'Liga', opponentShort: 'C', ownShort: 'A', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 2);
  assert.equal(result[0].opponent, 'B');
  assert.equal(result[1].opponent, 'C');
});

test('computeSpotlight: alle zukünftig → erste 2', () => {
  const matches = [
    { date: '2026-05-01', result: null, isNext: false, isHome: true,  opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-06-01', result: null, isNext: false, isHome: false, opponent: 'B', competition: 'Liga', opponentShort: 'B', ownShort: 'A', time: '15:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-07-01', result: null, isNext: false, isHome: true,  opponent: 'C', competition: 'Liga', opponentShort: 'C', ownShort: 'A', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 2);
  assert.equal(result[0].opponent, 'A');
  assert.equal(result[1].opponent, 'B');
});

test('computeSpotlight: leere Liste → leeres Array', () => {
  const result = computeSpotlight([]);
  assert.deepEqual(result, []);
});

test('computeSpotlight: nur ein Spiel mit Ergebnis → 1 Spiel', () => {
  const matches = [
    { date: '2026-03-01', result: '80:70', isNext: false, isHome: true, opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 1);
  assert.equal(result[0].result, '80:70');
});
