'use strict';

// Gemeinsame Testdaten für Multi-Club-Portal-Tests (CLAUDE.md-Policy, ADR-016):
// 10 Clubs, 8 Bundesländer + 1 bundesweiter Club, davon 2 Clubs in DERSELBEN Liga (Bayern).
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SHARED_LIGA_ID = '7002';

// Saison-IDs der Fixture. Die aktuelle Saison wird im Produktivcode NICHT aus dem Datum,
// sondern pro Team aus der höchsten seasonId der Rohspiele abgeleitet
// (currentSeasonId() in src/cronUpdate.js). Die Tests hängen daher nur von diesen beiden
// Konstanten ab und kippen an keinem Kalenderdatum.
const FIXTURE_SEASON_ID = 2026;
const FIXTURE_PAST_SEASON_ID = FIXTURE_SEASON_ID - 1;
const seasonName = seasonId => `${seasonId - 1}/${String(seasonId % 100).padStart(2, '0')}`;
const SHARED_LIGA_NAME = 'Bezirksliga Gemeinsam';

const CLUBS = [
  { clubId: '3001', verbandId: 1,   sourceSlug: 'baden-wuerttemberg' },
  { clubId: '3002', verbandId: 2,   sourceSlug: 'bayern', shared: true },
  { clubId: '3003', verbandId: 3,   sourceSlug: 'berlin' },
  { clubId: '3004', verbandId: 7,   sourceSlug: 'niedersachsen' },
  { clubId: '3005', verbandId: 11,  sourceSlug: 'nordrhein-westfalen' },
  { clubId: '3006', verbandId: 15,  sourceSlug: 'sachsen' },
  { clubId: '3007', verbandId: 6,   sourceSlug: 'hessen' },
  { clubId: '3008', verbandId: 9,   sourceSlug: 'saarland' },
  { clubId: '3009', verbandId: 100, sourceSlug: 'bundesweit' }, // Bundesligen — keine Bundesland-Zuordnung
  { clubId: '3010', verbandId: 2,   sourceSlug: 'bayern', shared: true },
];

const DEFAULT_PORTAL = {
  operator: 'Portal Betreiber (Test)',
  address: 'Teststraße 1, 12345 Teststadt',
  email: 'portal@example.test',
  phone: '',
  responsible: '',
};

const clubSlug = clubId => `verein-${clubId}`;
// teamId muss rein numerisch sein (siehe storage.js: /^\d+$/-Validierung)
const teamIdFor = clubId => `9${clubId}`;

function ligaFor(club) {
  if (club.shared) return { ligaId: SHARED_LIGA_ID, liganame: SHARED_LIGA_NAME };
  if (club.verbandId === 100) return { ligaId: '7009', liganame: 'Bundesliga Herren' };
  return { ligaId: `7${club.clubId}`, liganame: `Bezirksliga ${club.clubId}` };
}

const teamFor = club => ({ id: teamIdFor(club.clubId), name: `Team ${club.clubId}`, ageGroup: 'Herren', gender: 'männlich' });

// verbandId: optional abweichender Landesverband (z.B. Wechsel in eine Bundesliga → 100).
function matchFor(club, verbandId = club.verbandId) {
  const { ligaId, liganame } = ligaFor(club);
  const team = teamFor(club);
  return {
    matchId: Number(club.clubId) * 10 + 1,
    kickoffDate: `${FIXTURE_SEASON_ID}-05-01`,
    kickoffTime: '18:00',
    matchNo: '1',
    result: null,
    homeTeam: { teamPermanentId: team.id, teamname: team.name, teamnameSmall: team.name.slice(0, 2) },
    guestTeam: { teamPermanentId: 999, teamname: 'Gegner', teamnameSmall: 'GG' },
    ligaData: { liganame, seasonId: FIXTURE_SEASON_ID, seasonName: seasonName(FIXTURE_SEASON_ID), ligaId, verbandId },
  };
}

// Ein bereits gespieltes Spiel der VORSAISON (Übergangsphase: die API liefert es noch mit) —
// Grundlage für die Saison-Archivierung. Gegnername enthält die clubId, damit Tests die
// Herkunft eines Archiv-Eintrags eindeutig zuordnen können.
function pastMatchFor(club, verbandId = club.verbandId) {
  const { ligaId, liganame } = ligaFor(club);
  const team = teamFor(club);
  return {
    matchId: Number(club.clubId) * 10 + 2,
    kickoffDate: `${FIXTURE_PAST_SEASON_ID}-03-01`,
    kickoffTime: '18:00',
    matchNo: '2',
    result: '80:70',
    homeTeam: { teamPermanentId: team.id, teamname: team.name, teamnameSmall: team.name.slice(0, 2) },
    guestTeam: { teamPermanentId: 998, teamname: `Vorsaison-Gegner ${club.clubId}`, teamnameSmall: 'VG' },
    ligaData: { liganame, seasonId: FIXTURE_PAST_SEASON_ID, seasonName: seasonName(FIXTURE_PAST_SEASON_ID), ligaId, verbandId },
  };
}

function row(rank, teamName, teamId, ownTeamId) {
  return {
    rank, teamName, teamId, played: 10, won: 10 - rank, lost: rank, points: 2 * (10 - rank),
    koerbe: 700, gegenKoerbe: 650, korbdiff: 50, isOwn: teamId === ownTeamId,
  };
}

// Tabelle je Liga; isOwn hängt (wie in der echten API-Abbildung) vom abfragenden Team ab.
function tableFor(ligaId, ownTeamId) {
  if (ligaId === SHARED_LIGA_ID) {
    return [
      row(1, 'Team 3002', teamIdFor('3002'), ownTeamId),
      row(2, 'Team 3010', teamIdFor('3010'), ownTeamId),
      row(3, 'Fremdteam Gemeinsam', '55555', ownTeamId),
    ];
  }
  const club = CLUBS.find(c => ligaFor(c).ligaId === ligaId);
  return [
    row(1, `Team ${club.clubId}`, teamIdFor(club.clubId), ownTeamId),
    row(2, `Fremdteam ${ligaId}`, `5${ligaId}`, ownTeamId),
  ];
}

// failClubIds: fetchClubTeams wirft (simulierter API-Ausfall). emptyClubIds: liefert keine Teams.
// Optionen für die Saison-Archivierung (alle optional, Default = bisheriges Verhalten):
//  pastSeason: true → jedes Team liefert zusätzlich ein Spiel der Vorsaison (FIXTURE_PAST_SEASON_ID)
//  emptyMatchClubIds: fetchTeamMatches liefert für die Teams dieser Clubs keine Spiele
//    (API-Ausfall auf Team-Ebene; der Teams-Cache greift hier nicht → Club fällt auf 'bundesweit')
//  verbandOverrides: { [clubId]: verbandId } — abweichender Landesverband aller Spiele eines Clubs
function installApiMocks(apiClient, { failClubIds = [], emptyClubIds = [], pastSeason = false, emptyMatchClubIds = [], verbandOverrides = {} } = {}) {
  apiClient.fetchClubTeams = async clubId => {
    if (failClubIds.includes(String(clubId))) throw new Error(`Simulierter API-Ausfall für Club ${clubId}`);
    if (emptyClubIds.includes(String(clubId))) return [];
    const club = CLUBS.find(c => c.clubId === String(clubId));
    return club ? [teamFor(club)] : [];
  };
  apiClient.fetchTeamMatches = async teamId => {
    const club = CLUBS.find(c => teamIdFor(c.clubId) === String(teamId));
    if (!club || emptyMatchClubIds.includes(club.clubId)) return { matches: [], gender: 'männlich' };
    const verbandId = verbandOverrides[club.clubId] ?? club.verbandId;
    const matches = [matchFor(club, verbandId)];
    if (pastSeason) matches.push(pastMatchFor(club, verbandId));
    return { matches, gender: 'männlich' };
  };
  apiClient.fetchMatchInfo = async () => null;
  apiClient.fetchLeagueTable = async (ligaId, ownTeamId) => tableFor(String(ligaId), String(ownTeamId));
  apiClient.fetchTournamentRounds = async () => null;
}

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

const ENV_KEYS = ['BBB_ICS_DIR', 'BBB_CLUBS_DIR', 'BBB_PORTAL_CONFIG', 'BBB_WAM_CACHE'];

// Legt temporäre Verzeichnisse und Club-Configs an, setzt die BBB_*-Umgebungsvariablen und lädt
// cronUpdate.js frisch mit gemockter API. cleanup() stellt die Umgebung wieder her.
//  configOverrides: { [clubId]: extraConfig }  (z.B. { '3001': { legacyRootOutput: true } })
//  portal: Objekt für portal.json, oder null → Datei fehlt
//  wamCache: Objekt für den WAM-Cache, oder null → Datei fehlt
//  mockOptions: weitere Optionen für installApiMocks (pastSeason, emptyMatchClubIds, verbandOverrides)
// rerun(apiOptions) lädt cronUpdate.js mit neuen API-Mocks frisch, behält aber Verzeichnisse
// und Configs bei — für Tests über mehrere aufeinanderfolgende Läufe (z.B. Rolling-Update).
function createRun({ configOverrides = {}, failClubIds = [], emptyClubIds = [], portal = DEFAULT_PORTAL, wamCache = null, ...mockOptions } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-portal-out-'));
  const clubsDir = mkdtempSync(join(tmpdir(), 'bbb-portal-clubs-'));
  const cfgDir = mkdtempSync(join(tmpdir(), 'bbb-portal-cfg-'));

  for (const club of CLUBS) {
    const clubDir = join(clubsDir, club.sourceSlug, clubSlug(club.clubId));
    mkdirSync(clubDir, { recursive: true });
    writeFileSync(join(clubDir, 'config.json'), JSON.stringify({
      clubId: club.clubId, name: `Verein ${club.clubId}`, ...(configOverrides[club.clubId] || {}),
    }));
  }

  const portalPath = join(cfgDir, 'portal.json');
  if (portal) writeFileSync(portalPath, JSON.stringify(portal));
  const wamPath = join(cfgDir, 'wam-ligen-cache.json');
  if (wamCache) writeFileSync(wamPath, JSON.stringify(wamCache));

  const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  process.env.BBB_ICS_DIR = dir;
  process.env.BBB_CLUBS_DIR = clubsDir;
  process.env.BBB_PORTAL_CONFIG = portalPath;
  process.env.BBB_WAM_CACHE = wamPath;

  // Reihenfolge: cronUpdate.js destrukturiert apiClient-Funktionen beim require() — Mocks
  // müssen VOR dem frischen Laden von cronUpdate.js gesetzt werden.
  function loadCronModule(apiOptions) {
    freshRequire('../../src/storage.js');
    freshRequire('../../src/generateHTML.js');
    freshRequire('../../src/seasonArchive.js');
    const apiClient = freshRequire('../../src/apiClient.js');
    installApiMocks(apiClient, apiOptions);
    freshRequire('../../src/wamCache.js');
    freshRequire('../../src/portalConfig.js');
    freshRequire('../../src/aggregatePages.js');
    return freshRequire('../../src/cronUpdate.js');
  }
  const cronModule = loadCronModule({ failClubIds, emptyClubIds, ...mockOptions });

  return {
    dir,
    clubsDir,
    cronModule,
    rerun(apiOptions = {}) {
      return loadCronModule(apiOptions);
    },
    paths: {
      bund: join(dir, 'index.html'),
      land: slug => join(dir, slug, 'index.html'),
      club: (bundesland, clubId) => join(dir, bundesland, clubSlug(clubId), 'index.html'),
      legal: name => join(dir, `${name}.html`),
      archive: (clubId, seasonId) => join(dir, 'archive', clubId, `${seasonId}.json`),
    },
    cleanup() {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
      for (const d of [dir, clubsDir, cfgDir]) rmSync(d, { recursive: true, force: true });
    },
  };
}

module.exports = {
  CLUBS, DEFAULT_PORTAL, SHARED_LIGA_ID, SHARED_LIGA_NAME, FIXTURE_SEASON_ID, FIXTURE_PAST_SEASON_ID,
  clubSlug, teamIdFor, ligaFor, installApiMocks, createRun,
};
