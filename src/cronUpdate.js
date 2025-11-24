const { createEvents } = require('ics');

function dateToArr(d) {
  return [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  ];
}

function formatKickoff(dateStr, timeStr) {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function getTeamNameForSummary(teamObj) {
  return teamObj?.teamnameSmall || teamObj?.teamname || 'Unbekannt';
}

function getTeamNameForDescription(teamObj) {
  return teamObj?.teamname || 'Unbekannt';
}

async function buildEvent(match, matchInfo, teamId) {
  const homeTeamObj = matchInfo?.homeTeam || match.homeTeam || {};
  const guestTeamObj = matchInfo?.guestTeam || match.guestTeam || {};

  const homeTeamId = Number(homeTeamObj.teamPermanentId);
  const guestTeamId = Number(guestTeamObj.teamPermanentId);
  const ownTeamId = Number(teamId);

  const homeNameTitle = getTeamNameForSummary(homeTeamObj);
  const guestNameTitle = getTeamNameForSummary(guestTeamObj);

  const homeNameDesc = getTeamNameForDescription(homeTeamObj);
  const guestNameDesc = getTeamNameForDescription(guestTeamObj);

  const isHome = homeTeamId === ownTeamId;
  const isAway = guestTeamId === ownTeamId;

  const title = isHome
    ? `HEIM: ${homeNameTitle} vs. ${guestNameTitle} (Spiel ${matchInfo?.matchNo || match.matchNo})`
    : isAway
    ? `AUSWÄRTS: ${homeNameTitle} vs. ${guestNameTitle} (Spiel ${matchInfo?.matchNo || match.matchNo})`
    : `${homeNameTitle} vs. ${guestNameTitle} (Spiel ${matchInfo?.matchNo || match.matchNo})`;

  const cleanTitle = (text) =>
    typeof text === 'string' ? text.replace(/[\r\n]+/g, ' ').trim() : 'Untitled event';

  const titleClean = cleanTitle(title);

  const dateStr = matchInfo?.kickoffDate || match.kickoffDate;
  const timeStr = matchInfo?.kickoffTime || match.kickoffTime;
  const kickoff = new Date(`${dateStr}T${timeStr}:00`);

  const startArray = dateToArr(kickoff);
  const duration = { hours: 3, minutes: 30 };

  const feld = matchInfo?.matchInfo?.spielfeld || match.spielfeld || {};

  const location =
    feld.strasse && feld.plz && feld.ort
      ? `${feld.strasse}, ${feld.plz} ${feld.ort}, Deutschland`
      : 'Ort unbekannt';

  const description = [
    `Wettbewerb: ${matchInfo?.ligaData.liganame || match.ligaData.liganame || 'Unbekannt'}`,
    `Saison: ${matchInfo?.ligaData.seasonName || match.ligaData.seasonName || 'Unbekannt'}`,
    `Spielnr: ${matchInfo?.matchNo || match.matchNo || 'Unbekannt'}`,
    `Heimteam: ${homeNameDesc || 'Unbekannt'}`,
    `Gastteam: ${guestNameDesc || 'Unbekannt'}`,
    'Adresse:',
    feld.bezeichnung || 'Unbekannt',
    feld.strasse || '',
    `${feld.plz || ''} ${feld.ort || ''}`.trim(),
    `Spielbeginn: ${formatKickoff(dateStr, timeStr)}`,
    `Title: ${titleClean}`,
  ]
    .filter(Boolean)
    .join('\n');

  const alarmTriggerMinutes = isHome ? 30 : 60;

  return {
    uid: `${match.matchId}@basketball-bund.net`,
    title: titleClean,
    description,
    start: startArray,
    duration,
    location,
    alarms: [
      {
        action: 'display',
        description: 'Spiel beginnt bald',
        trigger: { minutes: alarmTriggerMinutes, before: true },
      },
    ],
  };
}

async function generateICS(matches, details, teamId, teamData, type = 'all') {
  const events = [];
  for (const match of matches) {
    const matchInfo = details[match.matchId];
    events.push(await buildEvent(match, matchInfo, teamId));
  }
  if (!events.length) return null;

  const calendarNames = {
    all: `Spielplan: ${teamData.teamName} ${teamData.teamAkj} ${teamData.teamGender}`,
    home: `Heimspiele: ${teamData.teamName} ${teamData.teamAkj} ${teamData.teamGender}`,
    away: `Auswärtsspiele: ${teamData.teamName} ${teamData.teamAkj} ${teamData.teamGender}`,
  };

  const calName = calendarNames[type] || calendarNames.all;

  events.forEach((e, i) => console.log(`Event ${i} title: "${e.title}"`));

  return new Promise((resolve, reject) => {
    createEvents(events, { calName }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

module.exports = { generateICS };
