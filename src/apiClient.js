const axios = require('axios');

const BASE_URL = 'https://www.basketball-bund.net/rest';

async function fetchTeamMatches(teamId) {
  const url = `${BASE_URL}/team/id/${teamId}/matches`;
  const res = await axios.get(url);
  return res.data;
}

async function fetchMatchInfo(matchId) {
  const url = `${BASE_URL}/match/id/${matchId}/matchInfo`;
  const res = await axios.get(url);
  return res.data;
}

module.exports = { fetchTeamMatches, fetchMatchInfo };
