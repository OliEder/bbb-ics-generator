'use strict';

const clubTeamsResponse = {
  data: {
    data: {
      matches: [
        {
          homeTeam: { teamPermanentId: 167881, clubId: 4468, teamname: 'Fibalon Baskets Neumarkt U10', teamnameSmall: 'FBN U10' },
          guestTeam: { teamPermanentId: 99999, clubId: 9999, teamname: 'Gegner U10', teamnameSmall: 'GEG' },
          ligaData: { ligaId: '51961', akName: 'U10', liganame: 'Kreisliga U10', seasonName: '2025/26' },
        },
      ],
    },
  },
};

const teamMatchesResponse = {
  data: {
    data: {
      matches: [
        {
          matchId: 5001,
          matchNo: 1,
          kickoffDate: '2026-05-10',
          kickoffTime: '10:00',
          homeTeam: { teamPermanentId: 167881, clubId: 4468, teamname: 'Fibalon Baskets Neumarkt U10', teamnameSmall: 'FBN U10' },
          guestTeam: { teamPermanentId: 99999, clubId: 9999, teamname: 'Gegner U10', teamnameSmall: 'GEG' },
          ligaData: { ligaId: '51961', liganame: 'Kreisliga U10', seasonName: '2025/26', akName: 'U10' },
          spielfeld: { id: 1, bezeichnung: 'Sporthalle Nord', strasse: 'Teststr. 1', plz: '92318', ort: 'Neumarkt' },
        },
        {
          matchId: 5002,
          matchNo: 2,
          kickoffDate: '2026-05-17',
          kickoffTime: '14:00',
          homeTeam: { teamPermanentId: 99999, clubId: 9999, teamname: 'Gegner U10', teamnameSmall: 'GEG' },
          guestTeam: { teamPermanentId: 167881, clubId: 4468, teamname: 'Fibalon Baskets Neumarkt U10', teamnameSmall: 'FBN U10' },
          ligaData: { ligaId: '51961', liganame: 'Kreisliga U10', seasonName: '2025/26', akName: 'U10' },
          spielfeld: { id: 2, bezeichnung: 'Gegner Halle', strasse: 'Gegnerstr. 5', plz: '93055', ort: 'Regensburg' },
        },
      ],
    },
  },
};

const matchInfoResponse5001 = {
  data: {
    data: {
      matchId: 5001,
      matchNo: 1,
      kickoffDate: '2026-05-10',
      kickoffTime: '10:00',
      homeTeam: { teamPermanentId: 167881, teamname: 'Fibalon Baskets Neumarkt U10', teamnameSmall: 'FBN U10' },
      guestTeam: { teamPermanentId: 99999, teamname: 'Gegner U10', teamnameSmall: 'GEG' },
      ligaData: { ligaId: '51961', liganame: 'Kreisliga U10', seasonName: '2025/26' },
      matchInfo: {
        spielfeld: { id: 1, bezeichnung: 'Sporthalle Nord', strasse: 'Teststr. 1', plz: '92318', ort: 'Neumarkt' },
      },
    },
  },
};

const matchInfoResponse5002 = {
  data: {
    data: {
      matchId: 5002,
      matchNo: 2,
      kickoffDate: '2026-05-17',
      kickoffTime: '14:00',
      homeTeam: { teamPermanentId: 99999, teamname: 'Gegner U10', teamnameSmall: 'GEG' },
      guestTeam: { teamPermanentId: 167881, teamname: 'Fibalon Baskets Neumarkt U10', teamnameSmall: 'FBN U10' },
      ligaData: { ligaId: '51961', liganame: 'Kreisliga U10', seasonName: '2025/26' },
      matchInfo: {
        spielfeld: { id: 2, bezeichnung: 'Gegner Halle', strasse: 'Gegnerstr. 5', plz: '93055', ort: 'Regensburg' },
      },
    },
  },
};

// Parsed matches (as returned by apiClient)
const matches = teamMatchesResponse.data.data.matches;

// Details map as used in generateICS
const details = {
  5001: matchInfoResponse5001.data.data,
  5002: matchInfoResponse5002.data.data,
};

// Teams as returned by fetchClubTeams
const teams = [
  { id: '167881', name: 'Fibalon Baskets Neumarkt U10', ageGroup: 'U10' },
];

module.exports = {
  clubTeamsResponse,
  teamMatchesResponse,
  matchInfoResponse5001,
  matchInfoResponse5002,
  matches,
  details,
  teams,
};
