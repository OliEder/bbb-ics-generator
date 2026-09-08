'use strict';

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

module.exports = { groupBySeasonId, buildArchiveTeamEntry };
