'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBySeasonId } = require('../../src/seasonArchive');
const { buildArchiveTeamEntry } = require('../../src/seasonArchive');

test('groupBySeasonId: gruppiert Matches nach ligaData.seasonId', () => {
  const matches = [
    { matchId: 1, ligaData: { seasonId: 2026 } },
    { matchId: 2, ligaData: { seasonId: 2025 } },
    { matchId: 3, ligaData: { seasonId: 2026 } },
  ];
  const grouped = groupBySeasonId(matches);
  assert.deepEqual(Object.keys(grouped).sort(), ['2025', '2026']);
  assert.equal(grouped[2026].length, 2);
  assert.equal(grouped[2025].length, 1);
  assert.equal(grouped[2025][0].matchId, 2);
});

test('groupBySeasonId: ignoriert Matches ohne seasonId', () => {
  const matches = [
    { matchId: 1, ligaData: {} },
    { matchId: 2, ligaData: { seasonId: 2026 } },
  ];
  const grouped = groupBySeasonId(matches);
  assert.deepEqual(Object.keys(grouped), ['2026']);
});

test('groupBySeasonId: leere Liste ergibt leeres Objekt', () => {
  assert.deepEqual(groupBySeasonId([]), {});
});

function makeMatch({ matchId = 1, teamId = 100, isHome = true, result = null, date = '2026-05-01', time = '18:00', liganame = 'Bezirksliga', ligaId = '1', oppId = 999, seasonId = 2025 } = {}) {
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
    ligaData: { liganame, ligaId, seasonId },
  };
}

test('buildArchiveTeamEntry: baut matches und competitions aus Saison-Matches', async () => {
  const seasonMatches = [
    makeMatch({ matchId: 1, result: '80:70', date: '2026-03-01' }),
    makeMatch({ matchId: 2, result: '70:75', date: '2026-04-01' }),
  ];
  const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
  const fetchTable = async () => ([{ rank: 1, teamName: 'Eigenes Team', played: 2, won: 1, lost: 1, points: 2, korbdiff: 5, isOwn: true }]);
  const fetchBracket = async () => null;

  const entry = await buildArchiveTeamEntry(teamMeta, seasonMatches, {}, { fetchLeagueTable: fetchTable, fetchTournamentRounds: fetchBracket });

  assert.equal(entry.teamName, 'Eigenes Team');
  assert.equal(entry.ageGroup, 'U18');
  assert.equal(entry.gender, 'männlich');
  assert.equal(entry.matches.length, 2);
  assert.equal(entry.matches[0].result, '80:70');
  assert.equal(entry.competitions.length, 1);
  assert.equal(entry.competitions[0].liganame, 'Bezirksliga');
  assert.ok(entry.competitions[0].table);
  assert.equal(entry.competitions[0].bracket, null);
});

test('buildArchiveTeamEntry: Pokal-Wettbewerb bekommt bracket statt table', async () => {
  const seasonMatches = [makeMatch({ matchId: 1, liganame: 'Bezirkspokal Herren', ligaId: '9', result: '80:70' })];
  const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
  const fetchTable = async () => { throw new Error('sollte nicht aufgerufen werden'); };
  const fetchBracket = async () => ([{ roundName: 'Finale', matches: [] }]);

  const entry = await buildArchiveTeamEntry(teamMeta, seasonMatches, {}, { fetchLeagueTable: fetchTable, fetchTournamentRounds: fetchBracket });

  assert.equal(entry.competitions[0].table, null);
  assert.ok(entry.competitions[0].bracket);
});

const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-archive-'));
  const modPath = require.resolve('../../src/seasonArchive');
  delete require.cache[modPath];
  process.env.BBB_ICS_DIR = dir;
  try {
    return fn(require('../../src/seasonArchive'), dir);
  } finally {
    delete process.env.BBB_ICS_DIR;
    rmSync(dir, { recursive: true });
  }
}

test('saveArchive/loadArchive: Round-trip', () => {
  withTempDir(({ saveArchive, loadArchive }) => {
    const data = { season: 2025, teams: { '100': { status: 'provisional', teams: [] } } };
    saveArchive(2025, data);
    const loaded = loadArchive(2025);
    assert.deepEqual(loaded, data);
  });
});

test('loadArchive: gibt null zurück wenn Datei nicht existiert', () => {
  withTempDir(({ loadArchive }) => {
    assert.equal(loadArchive(2099), null);
  });
});

test('loadArchive: wirft bei ungültiger season (Path-Traversal-Schutz)', () => {
  withTempDir(({ loadArchive }) => {
    assert.throws(() => loadArchive('../../etc/passwd'), /Ungültige season/);
  });
});

test('saveArchive: wirft bei ungültiger season', () => {
  withTempDir(({ saveArchive }) => {
    assert.throws(() => saveArchive('2025; rm -rf', {}), /Ungültige season/);
  });
});

const { updateArchiveForTeam } = require('../../src/seasonArchive');

const noopApiFns = {
  fetchLeagueTable: async () => null,
  fetchTournamentRounds: async () => null,
};

async function withTempDirAsync(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-archive-'));
  const modPath = require.resolve('../../src/seasonArchive');
  delete require.cache[modPath];
  process.env.BBB_ICS_DIR = dir;
  try {
    return await fn(require('../../src/seasonArchive'), dir);
  } finally {
    delete process.env.BBB_ICS_DIR;
    rmSync(dir, { recursive: true });
  }
}

test('updateArchiveForTeam: neue Saison und alte Saison gleichzeitig → alte Saison wird provisional archiviert', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive }) => {
    const groupedBySeason = {
      2025: [makeMatch({ matchId: 1, seasonId: 2025, result: '80:70' })],
      2026: [makeMatch({ matchId: 2, seasonId: 2026, result: null })],
    };
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };

    await updateArchiveForTeam(teamMeta, groupedBySeason, 2026, {}, noopApiFns);

    const archive2025 = loadArchive(2025);
    assert.ok(archive2025, 'Archiv für 2025 wurde angelegt');
    assert.equal(archive2025.teams['100'].status, 'provisional');
    assert.equal(archive2025.teams['100'].matches.length, 1);

    assert.equal(loadArchive(2026), null, 'Aktuelle Saison wird nicht archiviert');
  });
});

test('updateArchiveForTeam: alte Saison verschwindet → status wird final, Daten bleiben erhalten', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive, saveArchive }) => {
    saveArchive(2025, {
      season: 2025,
      teams: {
        '100': { teamName: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich', status: 'provisional', lastSeenAt: '2026-09-01T00:00:00.000Z', matches: [{ result: '80:70' }], competitions: [] },
      },
    });
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
    const groupedBySeason = { 2026: [makeMatch({ matchId: 2, seasonId: 2026, result: null })] };

    await updateArchiveForTeam(teamMeta, groupedBySeason, 2026, {}, noopApiFns);

    const archive2025 = loadArchive(2025);
    assert.equal(archive2025.teams['100'].status, 'final');
    assert.equal(archive2025.teams['100'].matches.length, 1, 'letzter bekannter Stand bleibt erhalten');
  });
});

test('updateArchiveForTeam: nur eine Saison vorhanden → kein Archiv-Eintrag', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive }) => {
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
    const groupedBySeason = { 2026: [makeMatch({ matchId: 1, seasonId: 2026 })] };

    await updateArchiveForTeam(teamMeta, groupedBySeason, 2026, {}, noopApiFns);

    assert.equal(loadArchive(2026), null);
  });
});

test('updateArchiveForTeam: currentSeasonId ist null (keine erkennbare aktuelle Saison) → kein Archiv-Zugriff, keine Saison wird fälschlich als alt archiviert', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive }) => {
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
    const groupedBySeason = { 2025: [makeMatch({ matchId: 1, seasonId: 2025 })] };

    await updateArchiveForTeam(teamMeta, groupedBySeason, null, {}, noopApiFns);

    assert.equal(loadArchive(2025), null, 'Ohne bekannte aktuelle Saison darf nichts archiviert werden');
  });
});

test('updateArchiveForTeam: final gewordene Saison wird nicht erneut überschrieben, wenn sie weiterhin fehlt', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive, saveArchive }) => {
    saveArchive(2025, {
      season: 2025,
      teams: {
        '100': { teamName: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich', status: 'final', lastSeenAt: '2026-09-01T00:00:00.000Z', matches: [{ result: '80:70' }], competitions: [] },
      },
    });
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
    const groupedBySeason = { 2026: [makeMatch({ matchId: 2, seasonId: 2026 })] };

    await updateArchiveForTeam(teamMeta, groupedBySeason, 2026, {}, noopApiFns);

    const archive2025 = loadArchive(2025);
    assert.equal(archive2025.teams['100'].status, 'final');
    assert.equal(archive2025.teams['100'].lastSeenAt, '2026-09-01T00:00:00.000Z', 'final-Eintrag wird nicht erneut angefasst');
  });
});

test('updateArchiveForTeam: Archiv-Eintrag eines anderen Teams bleibt unangetastet (kein aktives Löschen)', async () => {
  await withTempDirAsync(async ({ updateArchiveForTeam, loadArchive, saveArchive }) => {
    saveArchive(2025, {
      season: 2025,
      teams: {
        '999': { teamName: 'Anderes Team', ageGroup: 'U16', gender: 'weiblich', status: 'final', lastSeenAt: '2026-08-01T00:00:00.000Z', matches: [{ result: '60:55' }], competitions: [] },
      },
    });
    const teamMeta = { id: '100', name: 'Eigenes Team', ageGroup: 'U18', gender: 'männlich' };
    const groupedBySeason = { 2026: [makeMatch({ matchId: 1, seasonId: 2026 })] };

    await updateArchiveForTeam(teamMeta, groupedBySeason, 2026, {}, noopApiFns);

    const archive2025 = loadArchive(2025);
    assert.ok(archive2025.teams['999'], 'Archiv-Eintrag eines anderen Teams darf nicht verschwinden');
    assert.equal(archive2025.teams['999'].status, 'final');
    assert.equal(archive2025.teams['100'], undefined, 'Team ohne Vorsaison-Daten bekommt keinen Archiv-Eintrag');
  });
});
