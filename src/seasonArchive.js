'use strict';

const fs = require('fs');
const path = require('path');

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

function isLiga(liganame) {
  return String(liganame || '').toLowerCase().includes('liga');
}

function mapMatches(seasonMatches, teamId, details) {
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
        isNext:       false,
        venueName:    '',
        venueAddress: '',
        opponentLogoUrl: '',
      };
    });
}

async function buildArchiveTeamEntry(teamMeta, seasonMatches, details, apiFns) {
  const { fetchLeagueTable, fetchTournamentRounds } = apiFns;
  const matches = mapMatches(seasonMatches, teamMeta.id, details);

  const compMap = new Map();
  for (const m of seasonMatches) {
    const ligaId = String(m.ligaData?.ligaId || '');
    if (!ligaId || compMap.has(ligaId)) continue;
    compMap.set(ligaId, {
      ligaId,
      liganame: m.ligaData?.liganame || '',
      isLiga:   isLiga(m.ligaData?.liganame),
    });
  }

  const competitions = await Promise.all(
    Array.from(compMap.values()).map(async comp => {
      if (comp.isLiga) {
        const table = await fetchLeagueTable(comp.ligaId, teamMeta.id);
        return { ...comp, table: table || null, bracket: null };
      }
      const bracket = await fetchTournamentRounds(comp.ligaId);
      return { ...comp, table: null, bracket: bracket || null };
    })
  );

  return {
    teamName: teamMeta.name,
    ageGroup: teamMeta.ageGroup,
    gender:   teamMeta.gender,
    matches,
    competitions,
  };
}

function archiveDir() {
  const base = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const dir = path.join(base, 'archive');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function assertValidSeason(season) {
  if (!/^\d{4}$/.test(String(season))) {
    throw new Error(`Ungültige season: ${season}`);
  }
}

function saveArchive(season, data) {
  assertValidSeason(season);
  const filepath = path.join(archiveDir(), `${season}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  return filepath;
}

function loadArchive(season) {
  assertValidSeason(season);
  const filepath = path.join(archiveDir(), `${season}.json`);
  return fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf8')) : null;
}

module.exports = { groupBySeasonId, buildArchiveTeamEntry, saveArchive, loadArchive };
