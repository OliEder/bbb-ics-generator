'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { mapMatches, computeSpotlight } = require('../../src/cronUpdate');

// Löscht die require-Caches, die von env-Variablen abhängiges Modul-Setup betreiben
// (BBB_ICS_DIR/BBB_CLUBS_DIR werden nur beim ersten require ausgewertet), damit jeder
// Test mit frischem Zustand läuft. Analog zum Muster in tests/e2e/storage.test.js.
function freshRequire(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

// applyMocks(apiClient) darf apiClient.fetchClubTeams etc. überschreiben, BEVOR
// cronUpdate.js frisch geladen wird — cronUpdate.js destrukturiert diese Funktionen
// beim require() in lokale Bindings; ein Überschreiben NACH dem require hätte keine
// Wirkung mehr, weil die lokale Bindung bereits auf die alte Funktion zeigt.
function resetCronModules(applyMocks) {
  freshRequire('../../src/storage.js');
  freshRequire('../../src/generateHTML.js');
  const apiClient = freshRequire('../../src/apiClient.js');
  if (applyMocks) applyMocks(apiClient);
  const cronModule = freshRequire('../../src/cronUpdate.js');
  return { cronModule, apiClient };
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

test('updateAll: schreibt metadata.json unter generated/<bundesland>/<club-slug>/ — bundesweit bei fehlenden Teams', async () => {
  // Der im Task-Prompt vorgegebene Test-Template-Assert (generated/bayern/fibalon/metadata.json)
  // ist bei fetchClubTeams => [] FALSCH: ohne Teams gibt es keine verbandId-Daten, aus denen
  // deriveClubBundesland ein echtes Bundesland ableiten könnte. deriveClubBundesland([]) liefert
  // laut src/verbandMapping.js (Task 1) 'bundesweit' zurück — die Datei landet also unter
  // generated/bundesweit/fibalon/metadata.json, nicht generated/bayern/fibalon/metadata.json.
  // Dieser Test prüft genau dieses (korrekte) Verhalten als Regressionsschutz.
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-'));
  const clubsDir = mkdtempSync(join(tmpdir(), 'bbb-cron-clubs-'));
  try {
    mkdirSync(join(clubsDir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(clubsDir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468' })
    );

    process.env.BBB_ICS_DIR = dir;
    process.env.BBB_CLUBS_DIR = clubsDir;

    const { cronModule } = resetCronModules(apiClient => {
      apiClient.fetchClubTeams = async () => [];
    });

    await cronModule.updateAll();

    assert.ok(
      existsSync(join(dir, 'bundesweit', 'fibalon', 'metadata.json')),
      'Ohne Teams/verbandId-Daten muss die Metadata unter "bundesweit" landen'
    );
    assert.ok(
      !existsSync(join(dir, 'bayern', 'fibalon', 'metadata.json')),
      'Ohne echte Bundesland-Herleitung darf keine bayern/-Ausgabe entstehen'
    );
  } finally {
    rmSync(dir, { recursive: true });
    rmSync(clubsDir, { recursive: true });
    delete process.env.BBB_CLUBS_DIR;
    delete process.env.BBB_ICS_DIR;
  }
});

test('updateAll: legacyRootOutput=true erzeugt Alt-Pfad-Duplikat MIT echten Spielen + Migrationshinweis', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-legacy-'));
  const clubsDir = mkdtempSync(join(tmpdir(), 'bbb-cron-legacy-clubs-'));
  try {
    mkdirSync(join(clubsDir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(clubsDir, 'bayern', 'fibalon', 'config.json'),
      JSON.stringify({ clubId: '4468', legacyRootOutput: true })
    );

    process.env.BBB_ICS_DIR = dir;
    process.env.BBB_CLUBS_DIR = clubsDir;

    const TEAM_ID = '100';
    const MATCH = {
      matchId: 555,
      kickoffDate: '2026-05-01',
      kickoffTime: '18:00',
      matchNo: '1',
      result: null,
      homeTeam: { teamPermanentId: TEAM_ID, teamname: 'Eigenes Team', teamnameSmall: 'ET', clubId: '4468' },
      guestTeam: { teamPermanentId: 999, teamname: 'Auswärtiger Gegner', teamnameSmall: 'AG' },
      ligaData: { liganame: 'Bezirksliga', seasonId: 2026, seasonName: '2025/26', ligaId: '1', verbandId: 2 }, // 2 = Bayern
    };

    const { cronModule } = resetCronModules(apiClient => {
      apiClient.fetchClubTeams = async () => [{ id: TEAM_ID, name: 'Eigenes Team', ageGroup: 'Herren', gender: 'männlich' }];
      apiClient.fetchTeamMatches = async () => ({ matches: [MATCH], gender: 'männlich' });
      apiClient.fetchMatchInfo = async () => null;
      apiClient.fetchLeagueTable = async () => null;
      apiClient.fetchTournamentRounds = async () => null;
    });

    await cronModule.updateAll();

    const newPathIcs = join(dir, 'bayern', 'fibalon', `${TEAM_ID}_all.ics`);
    const legacyIcs = join(dir, `${TEAM_ID}_all.ics`);
    const legacyIndex = join(dir, 'index.html');
    const newIndex = join(dir, 'bayern', 'fibalon', 'index.html');

    assert.ok(existsSync(newPathIcs), 'Neuer Pfad muss ICS-Datei enthalten');
    const newPathContent = readFileSync(newPathIcs, 'utf8');
    assert.ok(!newPathContent.includes('Kalender-Abo aktualisieren'), 'Neuer Pfad darf keinen Migrationshinweis enthalten');
    assert.ok(newPathContent.includes('Auswärtiger Gegner'), 'Neuer Pfad muss das echte Spiel enthalten');

    assert.ok(existsSync(legacyIcs), 'Alt-Pfad muss ICS-Datei enthalten');
    const legacyContent = readFileSync(legacyIcs, 'utf8');
    assert.ok(legacyContent.includes('Kalender-Abo aktualisieren'), 'Alt-Pfad muss Migrationshinweis enthalten');
    assert.ok(legacyContent.includes('Auswärtiger Gegner'), 'Alt-Pfad muss ZUSÄTZLICH das echte Spiel enthalten (nicht nur den Hinweis)');

    // Hinweis: 'migration-banner' als CSS-Klassenname steht immer im <style>-Block
    // (buildSharedStyles), unabhängig davon ob der Banner tatsächlich gerendert wird.
    // Wir prüfen daher gezielt auf das <div class="migration-banner" ...>-Markup.
    const MIGRATION_BANNER_MARKUP = '<div class="migration-banner"';

    assert.ok(existsSync(legacyIndex), 'Alt-Pfad index.html muss existieren');
    const legacyIndexContent = readFileSync(legacyIndex, 'utf8');
    assert.ok(legacyIndexContent.includes(MIGRATION_BANNER_MARKUP), 'Alt-Pfad index.html muss das Migrations-Banner-Markup enthalten');

    assert.ok(existsSync(newIndex), 'Neuer Pfad index.html muss existieren');
    const newIndexContent = readFileSync(newIndex, 'utf8');
    assert.ok(!newIndexContent.includes(MIGRATION_BANNER_MARKUP), 'Neuer Pfad index.html darf KEIN Migrations-Banner-Markup enthalten');
  } finally {
    rmSync(dir, { recursive: true });
    rmSync(clubsDir, { recursive: true });
    delete process.env.BBB_CLUBS_DIR;
    delete process.env.BBB_ICS_DIR;
  }
});

test('updateAll: ohne legacyRootOutput entsteht KEIN Alt-Pfad-Duplikat unter generatedRootDir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-nolegacy-'));
  const clubsDir = mkdtempSync(join(tmpdir(), 'bbb-cron-nolegacy-clubs-'));
  try {
    mkdirSync(join(clubsDir, 'bayern', 'fibalon'), { recursive: true });
    writeFileSync(
      join(clubsDir, 'bayern', 'fibalon', 'config.json'),
      // Bewusst OHNE legacyRootOutput — Negativ-Fall: ein Club, der die Multi-Club-
      // Migration nicht "geerbt" hat, darf NIE unter generatedRootDir selbst schreiben.
      JSON.stringify({ clubId: '4468' })
    );

    process.env.BBB_ICS_DIR = dir;
    process.env.BBB_CLUBS_DIR = clubsDir;

    const TEAM_ID = '200';
    const MATCH = {
      matchId: 777,
      kickoffDate: '2026-05-01',
      kickoffTime: '18:00',
      matchNo: '1',
      result: null,
      homeTeam: { teamPermanentId: TEAM_ID, teamname: 'Eigenes Team', teamnameSmall: 'ET', clubId: '4468' },
      guestTeam: { teamPermanentId: 999, teamname: 'Gegner', teamnameSmall: 'GG' },
      ligaData: { liganame: 'Bezirksliga', seasonId: 2026, seasonName: '2025/26', ligaId: '1', verbandId: 2 },
    };

    const { cronModule } = resetCronModules(apiClient => {
      apiClient.fetchClubTeams = async () => [{ id: TEAM_ID, name: 'Eigenes Team', ageGroup: 'Herren', gender: 'männlich' }];
      apiClient.fetchTeamMatches = async () => ({ matches: [MATCH], gender: 'männlich' });
      apiClient.fetchMatchInfo = async () => null;
      apiClient.fetchLeagueTable = async () => null;
      apiClient.fetchTournamentRounds = async () => null;
    });

    await cronModule.updateAll();

    assert.ok(existsSync(join(dir, 'bayern', 'fibalon', `${TEAM_ID}_all.ics`)), 'Neuer Pfad muss trotzdem geschrieben werden');
    assert.ok(!existsSync(join(dir, `${TEAM_ID}_all.ics`)), 'Ohne legacyRootOutput darf KEINE Alt-Pfad-ICS entstehen');
    assert.ok(!existsSync(join(dir, 'metadata.json')), 'Ohne legacyRootOutput darf KEINE Alt-Pfad-metadata.json unter generatedRootDir entstehen');
    assert.ok(!existsSync(join(dir, 'index.html')), 'Ohne legacyRootOutput darf KEIN Alt-Pfad-index.html unter generatedRootDir entstehen');
  } finally {
    rmSync(dir, { recursive: true });
    rmSync(clubsDir, { recursive: true });
    delete process.env.BBB_CLUBS_DIR;
    delete process.env.BBB_ICS_DIR;
  }
});

// ---- Regressionstest: Teams-Cache-Isolation über updateAll() bei mehreren Clubs ----
// Deckt genau den Bug ab, der beim echten End-to-End-Test gegen die Basketball-Bund.net-API
// mit mehreren Clubs gefunden wurde: teams-cache.json war eine einzige globale Datei ohne
// Club-Bezug. getTeams(clubId) rief loadTeamsCache()/saveTeamsCache(fresh) OHNE clubId auf,
// sodass der zweite (und jeder weitere) Club in einem Multi-Club-Lauf beim Cache-Check
// stillschweigend die gecachte Team-Liste des ERSTEN Clubs zurückbekam — falsche Teams,
// falsche Spiele und (als Folge) falsch hergeleitetes Bundesland für jeden Club nach dem
// ersten. fetchClubTeams wird hier bewusst als Funktion implementiert, die je nach
// übergebener clubId unterschiedliche Team-Listen liefert (kein fixer Rückgabewert) — nur
// so kann ein Test überhaupt unterscheiden, ob Club B seine EIGENEN Teams bekommt oder
// (Bug) die von Club A geerbten.
test('updateAll: zwei Clubs mit unterschiedlichen Team-Listen — Club B bekommt NICHT Club As Teams (Cache-Isolation)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-cron-multiclub-'));
  const clubsDir = mkdtempSync(join(tmpdir(), 'bbb-cron-multiclub-clubs-'));
  try {
    // Club A: Bayern, clubId 1111
    mkdirSync(join(clubsDir, 'bayern', 'club-a'), { recursive: true });
    writeFileSync(
      join(clubsDir, 'bayern', 'club-a', 'config.json'),
      JSON.stringify({ clubId: '1111' })
    );
    // Club B: Hessen, clubId 2222 — Verarbeitungsreihenfolge ist plattformabhängig
    // (fs.readdirSync sortiert nicht garantiert); der Test prüft daher beide Clubs
    // unabhängig davon, welcher zuerst verarbeitet wird — der Bug betraf ohnehin
    // "jeden Club nach dem ersten", unabhängig von A/B-Reihenfolge.
    mkdirSync(join(clubsDir, 'hessen', 'club-b'), { recursive: true });
    writeFileSync(
      join(clubsDir, 'hessen', 'club-b', 'config.json'),
      JSON.stringify({ clubId: '2222' })
    );

    process.env.BBB_ICS_DIR = dir;
    process.env.BBB_CLUBS_DIR = clubsDir;

    const TEAMS_BY_CLUB = {
      '1111': [{ id: '100', name: 'Club A Team', ageGroup: 'Herren', gender: 'männlich' }],
      '2222': [{ id: '200', name: 'Club B Team', ageGroup: 'Damen', gender: 'weiblich' }],
    };

    // verbandId 2 = Bayern, 6 = Hessen (siehe src/verbandMapping.js) — das derivierte
    // Bundesland (nicht der Quellordnername sourceBundeslandSlug) bestimmt den
    // tatsächlichen Ausgabepfad, daher müssen die Matches die passende verbandId tragen.
    function makeMatchFor(teamId, teamName, verbandId) {
      return {
        matchId: Number(teamId) * 10 + 1,
        kickoffDate: '2026-05-01',
        kickoffTime: '18:00',
        matchNo: '1',
        result: null,
        homeTeam: { teamPermanentId: teamId, teamname: teamName, teamnameSmall: teamName.slice(0, 2) },
        guestTeam: { teamPermanentId: 999, teamname: 'Gegner', teamnameSmall: 'GG' },
        ligaData: { liganame: 'Bezirksliga', seasonId: 2026, seasonName: '2025/26', ligaId: '1', verbandId },
      };
    }

    const { cronModule } = resetCronModules(apiClient => {
      // Schaltet je nach übergebener clubId auf unterschiedliche Team-Listen um —
      // genau das Verhalten, das den Bug beim echten API-Test sichtbar machte.
      apiClient.fetchClubTeams = async (clubId) => TEAMS_BY_CLUB[clubId] || [];
      apiClient.fetchTeamMatches = async (teamId) => {
        const isClubA = teamId === '100';
        const team = isClubA ? TEAMS_BY_CLUB['1111'][0] : TEAMS_BY_CLUB['2222'][0];
        const verbandId = isClubA ? 2 : 6; // Bayern vs. Hessen
        return { matches: [makeMatchFor(teamId, team.name, verbandId)], gender: team.gender };
      };
      apiClient.fetchMatchInfo = async () => null;
      apiClient.fetchLeagueTable = async () => null;
      apiClient.fetchTournamentRounds = async () => null;
    });

    await cronModule.updateAll();

    const metaAPath = join(dir, 'bayern', 'club-a', 'metadata.json');
    const metaBPath = join(dir, 'hessen', 'club-b', 'metadata.json');

    assert.ok(existsSync(metaAPath), 'Club A metadata.json muss existieren');
    assert.ok(existsSync(metaBPath), 'Club B metadata.json muss existieren');

    const metaA = JSON.parse(readFileSync(metaAPath, 'utf8'));
    const metaB = JSON.parse(readFileSync(metaBPath, 'utf8'));

    assert.equal(metaA.length, 1, 'Club A muss genau sein eigenes Team enthalten');
    assert.equal(metaA[0].teamId, '100', 'Club A muss seine EIGENE teamId haben');
    assert.equal(metaA[0].teamName, 'Club A Team', 'Club A muss seinen EIGENEN Teamnamen haben');

    assert.equal(metaB.length, 1, 'Club B muss genau sein eigenes Team enthalten');
    assert.equal(metaB[0].teamId, '200', 'Club B (zweiter verarbeiteter Club) muss seine EIGENE teamId haben, NICHT die von Club A');
    assert.equal(metaB[0].teamName, 'Club B Team', 'Club B darf NICHT den von Club A geerbten (gecachten) Teamnamen bekommen');
  } finally {
    rmSync(dir, { recursive: true });
    rmSync(clubsDir, { recursive: true });
    delete process.env.BBB_CLUBS_DIR;
    delete process.env.BBB_ICS_DIR;
  }
});
