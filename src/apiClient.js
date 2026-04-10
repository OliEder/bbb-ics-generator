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
        if (!teamObj || Number(teamObj.clubId) !== Number(clubId)) continue;
        const id = String(teamObj.teamPermanentId);
        if (seen.has(id)) continue;
        seen.add(id);
        teams.push({
          id,
          name: teamObj.teamname || 'Unbekannt',
          ageGroup: match.ligaData?.akName || '',
        });
      }
    }
    return teams;
  } catch (err) {
    console.error('API error for club teams', clubId, err.response ? err.response.status : err.message);
    return null;
  }
}

module.exports = { fetchTeamMatches, fetchMatchInfo, fetchClubTeams };
