'use strict';

const fs = require('fs');
const path = require('path');
const { resolveCompetition, isCupForMatch } = require('./competitionKind');

function groupBySeasonId(matches) {
  const grouped = {};
  for (const m of matches) {
    const id = m.ligaData?.seasonId;
    if (typeof id !== 'number') continue;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(m);
  }
  return grouped;
}

function mapMatches(seasonMatches, teamId, details, ligaKindMap) {
  return seasonMatches
    .slice()
    .sort((a, b) => {
      const da = (a.kickoffDate || '') + (a.kickoffTime || '');
      const db = (b.kickoffDate || '') + (b.kickoffTime || '');
      return da < db ? -1 : da > db ? 1 : 0;
    })
    .map(m => {
      const isHome = Number(m.homeTeam?.teamPermanentId) === Number(teamId);
      const opponent = isHome
        ? (m.guestTeam?.teamname || '')
        : (m.homeTeam?.teamname  || '');
      const opponentShort = isHome
        ? (m.guestTeam?.teamnameSmall || '')
        : (m.homeTeam?.teamnameSmall  || '');
      const ownShort = isHome
        ? (m.homeTeam?.teamnameSmall || '')
        : (m.guestTeam?.teamnameSmall || '');
      return {
        date:         m.kickoffDate  || '',
        time:         m.kickoffTime  || '',
        opponent,
        opponentShort,
        ownShort,
        isHome,
        result:       m.result || null,
        competition:  m.ligaData?.liganame || '',
        isCup:        isCupForMatch(m, ligaKindMap),
        isNext:       false,
        venueName:    '',
        venueAddress: '',
        opponentLogoUrl: '',
      };
    });
}

async function buildArchiveTeamEntry(teamMeta, seasonMatches, details, apiFns) {
  const compMap = new Map();
  for (const m of seasonMatches) {
    const ligaId = String(m.ligaData?.ligaId || '');
    if (!ligaId || compMap.has(ligaId)) continue;
    compMap.set(ligaId, { ligaId, liganame: m.ligaData?.liganame || '' });
  }

  // Gleiche Auflösung wie im aktuellen Lauf (competitionKind.js, ADR-028). Fehlt
  // fetchLeagueTableWithMeta in apiFns, werden Namen ohne "liga" als Pokal behandelt.
  const competitions = await Promise.all(
    Array.from(compMap.values()).map(comp => resolveCompetition(comp, teamMeta.id, apiFns))
  );
  const ligaKindMap = new Map(competitions.map(c => [c.ligaId, c.isLiga]));
  const matches = mapMatches(seasonMatches, teamMeta.id, details, ligaKindMap);

  return {
    teamName: teamMeta.name,
    ageGroup: teamMeta.ageGroup,
    gender:   teamMeta.gender,
    matches,
    competitions,
  };
}

// Das Archiv ist pro Club gescoped: generated/archive/<clubId>/<season>.json (ADR-026).
// Ein gemeinsames generated/archive/<season>.json für alle Clubs würde im Multi-Club-Betrieb
// die Teams mehrerer Clubs in einer Datei vermischen (dieselbe Fehlerklasse wie der frühere
// geteilte Teams-Cache, ADR-019). Schlüssel ist bewusst die clubId und nicht
// <bundesland>/<club-slug>: das Bundesland wird pro Lauf aus den Liga-Daten abgeleitet und
// kann z.B. bei einem API-Ausfall auf 'bundesweit' kippen — das Archiv würde sich sonst
// aufspalten. Die clubId ist stabil und eindeutig.
function archiveRootDir() {
  const base = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  return path.join(base, 'archive');
}

// clubId wird wie im Teams-Cache (storage.js) strikt gegen /^\d+$/ validiert statt
// normalisiert: Path-Traversal-Schutz und keine zwei clubIds, die auf dasselbe
// Verzeichnis abgebildet werden. Ohne clubId wird laut geworfen statt still auf ein
// globales (clubübergreifendes) Verzeichnis zurückzufallen.
function assertValidClubId(clubId) {
  if (clubId === undefined || clubId === null || clubId === '') {
    throw new Error('seasonArchive: clubId ist erforderlich');
  }
  if (!/^\d+$/.test(String(clubId))) {
    throw new Error(`Ungültige clubId: ${clubId}`);
  }
}

function assertValidSeason(season) {
  if (!/^\d{4}$/.test(String(season))) {
    throw new Error(`Ungültige season: ${season}`);
  }
}

// Archiv-Verzeichnis eines Clubs. Legt nichts an (reines Lesen soll keine leeren
// Verzeichnisse erzeugen); saveArchive() erstellt es bei Bedarf.
function clubArchiveDir(clubId) {
  assertValidClubId(clubId);
  return path.join(archiveRootDir(), String(clubId));
}

const ARCHIVE_FILE_PATTERN = /^\d{4}\.json$/;

function saveArchive(clubId, season, data) {
  const dir = clubArchiveDir(clubId);
  assertValidSeason(season);
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${season}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  return filepath;
}

function loadArchive(clubId, season) {
  const dir = clubArchiveDir(clubId);
  assertValidSeason(season);
  const filepath = path.join(dir, `${season}.json`);
  return fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf8')) : null;
}

async function updateArchiveForTeam(clubId, teamMeta, groupedBySeason, currentSeasonId, details, apiFns) {
  // clubId zuerst prüfen, damit ein Aufruffehler auch dann laut wird, wenn (noch) nichts
  // zu archivieren wäre.
  const dir = clubArchiveDir(clubId);

  // Ohne eine bekannte aktuelle Saison lässt sich "alt" nicht von "aktuell"
  // unterscheiden — ein Team ohne jegliche numerische seasonId in seinen
  // Matches wird übersprungen, statt versehentlich die einzige Saison als
  // "alt" zu archivieren.
  if (typeof currentSeasonId !== 'number') return;

  const seasonIds = Object.keys(groupedBySeason).map(Number);
  const olderSeasonIds = seasonIds.filter(id => id !== currentSeasonId);

  for (const seasonId of olderSeasonIds) {
    const seasonMatches = groupedBySeason[seasonId];
    const entry = await buildArchiveTeamEntry(teamMeta, seasonMatches, details, apiFns);
    const archive = loadArchive(clubId, seasonId) || { season: seasonId, clubId: String(clubId), teams: {} };
    archive.teams[teamMeta.id] = {
      ...entry,
      status: 'provisional',
      lastSeenAt: new Date().toISOString(),
    };
    saveArchive(clubId, seasonId, archive);
  }

  // Saisons, die vorher provisional waren, aber jetzt nicht mehr in den
  // Rohdaten auftauchen, gelten als final — der zuletzt gespeicherte Stand
  // bleibt unverändert stehen. Durchsucht nur das Archiv DIESES Clubs.
  if (!fs.existsSync(dir)) return;
  const seenSeasonIds = new Set(olderSeasonIds);
  const archiveFiles = fs.readdirSync(dir).filter(f => ARCHIVE_FILE_PATTERN.test(f));
  for (const file of archiveFiles) {
    const seasonId = Number(file.replace('.json', ''));
    if (seenSeasonIds.has(seasonId) || seasonId === currentSeasonId) continue;
    const archive = loadArchive(clubId, seasonId);
    const teamEntry = archive?.teams?.[teamMeta.id];
    if (teamEntry && teamEntry.status === 'provisional') {
      teamEntry.status = 'final';
      saveArchive(clubId, seasonId, archive);
    }
  }
}

module.exports = { groupBySeasonId, buildArchiveTeamEntry, clubArchiveDir, saveArchive, loadArchive, updateArchiveForTeam };
