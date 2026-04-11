'use strict';

const axios = require('axios');
const BASE_URL = 'https://www.basketball-bund.net/rest';

async function fetchTeamMatches(teamId) {
  const url = `${BASE_URL}/team/id/${teamId}/matches`;
  try {
    const res = await axios.get(url);
    return res.data?.data?.matches || [];
  } catch (err) {
    console.error('API error for matches', teamId, err.response ? err.response.status : err.message);
    return [];
  }
}

async function fetchMatchInfo(matchId) {
  const url = `${BASE_URL}/match/id/${matchId}/matchInfo`;
  try {
    const res = await axios.get(url);
    return res.data?.data || null;
  } catch (err) {
    console.error('API error for matchInfo', matchId, err.response ? err.response.status : err.message);
    return null;
  }
}

async function fetchClubTeams(clubId) {
  const url = `${BASE_URL}/club/id/${clubId}/actualmatches?justHome=false&rangeDays=150`;
  try {
    const res = await axios.get(url);
    const matches = res.data?.data?.matches || [];
    const seen = new Set();
    const teams = [];
    for (const match of matches) {
      for (const teamObj of [match.homeTeam, match.guestTeam]) {
        if (!teamObj || !teamObj.teamPermanentId || Number(teamObj.clubId) !== Number(clubId)) continue;
        const id = String(teamObj.teamPermanentId);
        if (seen.has(id)) continue;
        seen.add(id);
        teams.push({
          id,
          name: teamObj.teamname || 'Unbekannt',
          ageGroup: match.ligaData?.akName || '',
          gender: match.ligaData?.geschlecht || '',
        });
      }
    }
    return teams;
  } catch (err) {
    console.error('API error for club teams', clubId, err.response ? err.response.status : err.message);
    return null;
  }
}

async function fetchLeagueTable(ligaId, ownTeamId) {
  const url = `${BASE_URL}/competition/table/id/${ligaId}`;
  try {
    const res = await axios.get(url);
    const rows = res.data?.data?.tabelle?.entries || [];
    return rows.map(row => ({
      rank:     row.rang || 0,
      teamName: row.team?.teamname || '',
      played:   row.anzspiele || 0,
      won:      row.s  || 0,
      lost:     row.n || 0,
      points:   row.anzGewinnpunkte || 0,
      koerbe:   row.koerbe || 0,
      gegenKoerbe: row.gegenKoerbe || 0,
      korbdiff: row.korbdiff || 0,
      isOwn:    String(row.team?.teamPermanentId) === String(ownTeamId),
    }));
  } catch (err) {
    console.error('API error fetchLeagueTable', ligaId, err.response ? err.response.status : err.message);
    return null;
  }
}

async function fetchTournamentRounds(ligaId) {
  const spielplanUrl = `${BASE_URL}/competition/spielplan/id/${ligaId}`;
  try {
    const spielplanRes = await axios.get(spielplanUrl);
    const spieltage = spielplanRes.data?.data?.spieltage || [];
    if (spieltage.length === 0) return null;

    const rounds = [];
    for (const st of spieltage) {
      const mdUrl = `${BASE_URL}/competition/id/${ligaId}/matchday/${st.spieltag}`;
      try {
        const mdRes = await axios.get(mdUrl);
        const mdMatches = mdRes.data?.data?.matches || [];
        if (mdMatches.length === 0) continue;

        // Round name by match count
        const count = mdMatches.length;
        const nameMap = { 1: 'Finale', 2: 'Halbfinale', 4: 'Viertelfinale', 8: 'Achtelfinale' };
        const roundName = nameMap[count] || st.bezeichnung || `Runde ${st.spieltag}`;

        rounds.push({
          roundName,
          matches: mdMatches.map(m => {
            const isBye = t =>
              !t.teamPermanentId ||
              t.teamPermanentId === 0 ||
              /freilos|\?/i.test(t.teamname || '');
            const result = m.result || null;
            let homeWon = null;
            if (result && m.homeTeam && m.guestTeam) {
              const parts = result.split(':');
              if (parts.length === 2) {
                const a = parseInt(parts[0], 10);
                const b = parseInt(parts[1], 10);
                if (!isNaN(a) && !isNaN(b)) homeWon = a > b;
              }
            }
            return {
              home:     m.homeTeam?.teamname  || '',
              guest:    m.guestTeam?.teamname || '',
              result,
              homeWon,
              homeBye:  isBye(m.homeTeam  || {}),
              guestBye: isBye(m.guestTeam || {}),
            };
          }),
        });
      } catch (innerErr) {
        console.error('API error fetchTournamentRounds matchday', ligaId, st.spieltag, innerErr.message);
      }
    }
    return rounds.length > 0 ? rounds : null;
  } catch (err) {
    console.error('API error fetchTournamentRounds spielplan', ligaId, err.response ? err.response.status : err.message);
    return null;
  }
}

module.exports = { fetchTeamMatches, fetchMatchInfo, fetchClubTeams, fetchLeagueTable, fetchTournamentRounds };
