'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const axios = require('axios');
const { mapMatches, computeSpotlight, currentSeasonId } = require('../../src/cronUpdate');

// Helper: reload cronUpdate (and its deps) with fresh module instances,
// pointed at a specific tmp dir — mirrors requireCronUpdate() in
// tests/e2e/cache-scenarios.test.js.
function requireCronUpdate(dir) {
  [
    '../../src/storage.js',
    '../../src/cronUpdate.js',
    '../../src/seasonArchive.js',
    '../../src/apiClient.js',
    '../../src/generateHTML.js',
  ].forEach(rel => {
    const p = require.resolve(rel);
    delete require.cache[p];
  });
  process.env.BBB_ICS_DIR = dir;
  return require('../../src/cronUpdate.js');
}

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

test('computeSpotlight: alle gespielt → letztes Ergebnis (1 Spiel)', () => {
  const matches = [
    { date: '2026-02-01', result: '60:50', isNext: false, isHome: true,  opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-03-01', result: '70:60', isNext: false, isHome: false, opponent: 'B', competition: 'Liga', opponentShort: 'B', ownShort: 'A', time: '15:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-04-01', result: '80:70', isNext: false, isHome: true,  opponent: 'C', competition: 'Liga', opponentShort: 'C', ownShort: 'A', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 1);
  assert.equal(result[0].opponent, 'C');
});

test('computeSpotlight: alle zukünftig → nächstes Spiel (1 Spiel)', () => {
  const matches = [
    { date: '2026-05-01', result: null, isNext: false, isHome: true,  opponent: 'A', competition: 'Liga', opponentShort: 'A', ownShort: 'B', time: '18:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
    { date: '2026-06-01', result: null, isNext: false, isHome: false, opponent: 'B', competition: 'Liga', opponentShort: 'B', ownShort: 'A', time: '15:00', venueName: '', venueAddress: '', opponentLogoUrl: '' },
  ];
  const result = computeSpotlight(matches);
  assert.equal(result.length, 1);
  assert.equal(result[0].opponent, 'A');
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

test('currentSeasonId: liefert höchste seasonId aus gemischten Saisons', () => {
  const matches = [
    makeMatch({ matchId: 1 }),
    { ...makeMatch({ matchId: 2 }), ligaData: { liganame: 'Liga', seasonId: 2026 } },
    { ...makeMatch({ matchId: 3 }), ligaData: { liganame: 'Liga', seasonId: 2025 } },
  ];
  assert.equal(currentSeasonId(matches), 2026);
});

test('currentSeasonId: leere Liste → null', () => {
  assert.equal(currentSeasonId([]), null);
});

test('currentSeasonId: fehlende seasonId wird ignoriert', () => {
  const matches = [
    { ligaData: {} },
    { ligaData: { seasonId: 2026 } },
  ];
  assert.equal(currentSeasonId(matches), 2026);
});

test('updateAll: archiviert ältere Saison beim Übergang (Integrationstest)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-archive-'));
  const originalIcsDir = process.env.BBB_ICS_DIR;
  process.env.BBB_ICS_DIR = dir;

  // Volle Abhängigkeitskette frisch laden, damit sie den env-var-Pfad greifen
  for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
    const p = require.resolve(mod);
    delete require.cache[p];
  }

  // currentSeasonId(matches) ermittelt die höchste seasonId aus den Rohdaten (hier 2025);
  // 2024 taucht daneben noch auf (Übergangsphase) und soll archiviert werden.
  const oldMatch = makeMatch({ matchId: 1, teamId: 100, result: '80:70', date: '2024-03-01' });
  oldMatch.ligaData.seasonId = 2024;
  const newMatch = makeMatch({ matchId: 2, teamId: 100, result: null, date: '2025-10-01' });
  newMatch.ligaData.seasonId = 2025;

  t.mock.method(axios, 'get', (url) => {
    if (url.includes('/club/id/')) {
      return Promise.resolve({ data: { data: { matches: [
        { homeTeam: { teamPermanentId: 100, clubId: 4468, teamname: 'Eigenes Team' }, guestTeam: { teamPermanentId: 999, clubId: 1, teamname: 'Gegner' }, ligaData: { akName: 'U18', geschlecht: 'männlich' } },
      ] } } });
    }
    if (url.includes('/team/id/')) {
      return Promise.resolve({ data: { data: { team: { teamGenderId: 1 }, matches: [oldMatch, newMatch] } } });
    }
    if (url.includes('/match/id/')) {
      return Promise.resolve({ data: { data: {} } });
    }
    if (url.includes('/competition/table/')) {
      return Promise.resolve({ data: { data: { tabelle: { entries: [] } } } });
    }
    if (url.includes('/competition/spielplan/')) {
      return Promise.resolve({ data: { data: { spieltage: [] } } });
    }
    return Promise.reject(new Error(`Unerwarteter Request in Test: ${url}`));
  });

  try {
    const cronUpdate = require('../../src/cronUpdate');
    await cronUpdate.updateAll();

    const { loadArchive } = require('../../src/seasonArchive');
    const archive2024 = loadArchive(2024);
    assert.ok(archive2024, 'Archiv für 2024 wurde beim Update angelegt');
    assert.equal(archive2024.teams['100'].status, 'provisional');
    assert.equal(archive2024.teams['100'].matches[0].result, '80:70');
  } finally {
    if (originalIcsDir === undefined) delete process.env.BBB_ICS_DIR;
    else process.env.BBB_ICS_DIR = originalIcsDir;
    rmSync(dir, { recursive: true });
    for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
      delete require.cache[require.resolve(mod)];
    }
  }
});

test('updateAll: Team, das nicht mehr in der API-Team-Liste auftaucht, bleibt mit altem Stand in metadata.json und bekommt notCurrentlyListed:true', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-missing-'));
  const originalIcsDir = process.env.BBB_ICS_DIR;
  process.env.BBB_ICS_DIR = dir;

  for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
    delete require.cache[require.resolve(mod)];
  }

  // Alten Stand für ein Team simulieren, das die API-Team-Liste in diesem Lauf nicht mehr liefert.
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify([
    {
      teamId: '999', teamName: 'Verschwundenes Team', ageGroup: 'U16', gender: 'weiblich',
      lastUpdate: '2026-08-01T00:00:00.000Z', matchCount: 3, homeMatchCount: 2, awayMatchCount: 1,
      logoUrl: 'https://www.basketball-bund.net/media/team/999/logo',
      matches: [{ date: '2026-05-01', time: '18:00', opponent: 'X', opponentShort: 'X', ownShort: 'VT', isHome: true, result: '70:60', competition: 'Bezirksliga', isNext: false, venueName: '', venueAddress: '', opponentLogoUrl: '' }],
      spotlightMatches: [], competitions: [],
    },
  ]));

  const activeMatch = makeMatch({ matchId: 1, teamId: 100, result: null, date: '2026-10-01' });
  activeMatch.ligaData.seasonId = 2026;

  t.mock.method(axios, 'get', (url) => {
    if (url.includes('/club/id/')) {
      // Team 999 taucht hier bewusst nicht mehr auf — nur noch Team 100.
      return Promise.resolve({ data: { data: { matches: [
        { homeTeam: { teamPermanentId: 100, clubId: 4468, teamname: 'Aktives Team' }, guestTeam: { teamPermanentId: 999999, clubId: 1, teamname: 'Gegner' }, ligaData: { akName: 'U18', geschlecht: 'männlich' } },
      ] } } });
    }
    if (url.includes('/team/id/')) {
      return Promise.resolve({ data: { data: { team: { teamGenderId: 1 }, matches: [activeMatch] } } });
    }
    if (url.includes('/match/id/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/competition/table/')) return Promise.resolve({ data: { data: { tabelle: { entries: [] } } } });
    if (url.includes('/competition/spielplan/')) return Promise.resolve({ data: { data: { spieltage: [] } } });
    return Promise.reject(new Error(`Unerwarteter Request in Test: ${url}`));
  });

  try {
    const cronUpdate = require('../../src/cronUpdate');
    await cronUpdate.updateAll();

    const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
    const missingTeam = meta.find(t => t.teamId === '999');
    assert.ok(missingTeam, 'Verschwundenes Team fehlt nicht mehr komplett aus metadata.json');
    assert.equal(missingTeam.notCurrentlyListed, true);
    assert.equal(missingTeam.matches[0].result, '70:60', 'alter Datenstand bleibt unverändert erhalten');

    const activeTeam = meta.find(t => t.teamId === '100');
    assert.ok(activeTeam, 'aktives Team wird weiterhin normal verarbeitet');
    assert.equal(activeTeam.notCurrentlyListed, undefined, 'aktives Team bekommt keinen notCurrentlyListed-Flag');
  } finally {
    if (originalIcsDir === undefined) delete process.env.BBB_ICS_DIR;
    else process.env.BBB_ICS_DIR = originalIcsDir;
    rmSync(dir, { recursive: true });
    for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
      delete require.cache[require.resolve(mod)];
    }
  }
});

test('updateAll: Team, das wieder in der API-Team-Liste auftaucht, verliert notCurrentlyListed automatisch', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-return-'));
  const originalIcsDir = process.env.BBB_ICS_DIR;
  process.env.BBB_ICS_DIR = dir;

  for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
    delete require.cache[require.resolve(mod)];
  }

  writeFileSync(join(dir, 'metadata.json'), JSON.stringify([
    {
      teamId: '100', teamName: 'Wieder aktives Team', ageGroup: 'U18', gender: 'männlich',
      lastUpdate: '2026-08-01T00:00:00.000Z', matchCount: 1, homeMatchCount: 1, awayMatchCount: 0,
      logoUrl: 'https://www.basketball-bund.net/media/team/100/logo',
      matches: [], spotlightMatches: [], competitions: [],
      notCurrentlyListed: true,
    },
  ]));

  const activeMatch = makeMatch({ matchId: 1, teamId: 100, result: null, date: '2026-10-01' });
  activeMatch.ligaData.seasonId = 2026;

  t.mock.method(axios, 'get', (url) => {
    if (url.includes('/club/id/')) {
      return Promise.resolve({ data: { data: { matches: [
        { homeTeam: { teamPermanentId: 100, clubId: 4468, teamname: 'Wieder aktives Team' }, guestTeam: { teamPermanentId: 999999, clubId: 1, teamname: 'Gegner' }, ligaData: { akName: 'U18', geschlecht: 'männlich' } },
      ] } } });
    }
    if (url.includes('/team/id/')) return Promise.resolve({ data: { data: { team: { teamGenderId: 1 }, matches: [activeMatch] } } });
    if (url.includes('/match/id/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/competition/table/')) return Promise.resolve({ data: { data: { tabelle: { entries: [] } } } });
    if (url.includes('/competition/spielplan/')) return Promise.resolve({ data: { data: { spieltage: [] } } });
    return Promise.reject(new Error(`Unerwarteter Request in Test: ${url}`));
  });

  try {
    const cronUpdate = require('../../src/cronUpdate');
    await cronUpdate.updateAll();

    const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
    const team = meta.find(t => t.teamId === '100');
    assert.ok(team);
    assert.equal(team.notCurrentlyListed, undefined, 'Flag verschwindet automatisch, sobald das Team wieder gelistet ist');
  } finally {
    if (originalIcsDir === undefined) delete process.env.BBB_ICS_DIR;
    else process.env.BBB_ICS_DIR = originalIcsDir;
    rmSync(dir, { recursive: true });
    for (const mod of ['../../src/cronUpdate', '../../src/storage', '../../src/seasonArchive', '../../src/apiClient', '../../src/generateHTML']) {
      delete require.cache[require.resolve(mod)];
    }
  }
});

test('updateAll: übernimmt teamAkjId und teamNumber in metadata.json', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-label-'));
  const originalIcsDir = process.env.BBB_ICS_DIR;

  const seniorsMatch = makeMatch({ matchId: 1, teamId: 167890, result: null, date: '2026-10-01' });

  // URL-Dispatch statt fixer 1:1-Fixtures, da dieser Test den vollen
  // Update-Zyklus durchläuft (Team-Liste, Matches, Match-Details, Tabelle) —
  // ein unerwarteter Call fällt auf den Promise.reject-Zweig und lässt
  // den Test laut fehlschlagen statt still eine falsche Form zu liefern.
  t.mock.method(axios, 'get', (url) => {
    if (url.includes('/club/id/')) {
      return Promise.resolve({ data: { data: { matches: [
        { homeTeam: { teamPermanentId: 167890, clubId: 4468, teamname: 'Fibalon Baskets Neumarkt 2' }, guestTeam: { teamPermanentId: 999999, clubId: 1, teamname: 'Gegner' }, ligaData: { akName: 'Senioren', geschlecht: 'männlich' } },
      ] } } });
    }
    if (url.includes('/team/id/')) {
      return Promise.resolve({ data: { data: { team: { teamGenderId: 1, teamAkjId: 1, teamNumber: 2 }, matches: [seniorsMatch] } } });
    }
    if (url.includes('/match/id/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/competition/table/')) return Promise.resolve({ data: { data: { tabelle: { entries: [] } } } });
    if (url.includes('/competition/spielplan/')) return Promise.resolve({ data: { data: { spieltage: [] } } });
    return Promise.reject(new Error(`Unerwarteter Request in Test: ${url}`));
  });

  try {
    const cronUpdate = requireCronUpdate(dir);
    await cronUpdate.updateAll();

    const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
    const team = meta.find(t => t.teamId === '167890');
    assert.ok(team, 'Team wurde verarbeitet');
    assert.equal(team.teamAkjId, 1);
    assert.equal(team.teamNumber, 2);
  } finally {
    if (originalIcsDir === undefined) delete process.env.BBB_ICS_DIR;
    else process.env.BBB_ICS_DIR = originalIcsDir;
    rmSync(dir, { recursive: true });
  }
});
