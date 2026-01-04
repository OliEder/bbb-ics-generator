const { createEvents } = require('ics');

function dateToArr(d) {
  return [
    Number(d.getFullYear()),
    Number(d.getMonth() + 1),
    Number(d.getDate()),
    Number(d.getHours()),
    Number(d.getMinutes()),
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

  const homeNameSummary = getTeamNameForSummary(homeTeamObj);
  const guestNameSummary = getTeamNameForSummary(guestTeamObj);

  const homeNameDesc = getTeamNameForDescription(homeTeamObj);
  const guestNameDesc = getTeamNameForDescription(guestTeamObj);

  const isHome = homeTeamId === ownTeamId;
  const isAway = guestTeamId === ownTeamId;

  const summary = isHome
    ? `🏠 ${homeNameSummary} vs. ${guestNameSummary} (Spiel ${matchInfo?.matchNo || match.matchNo})`
    : isAway
    ? `✈️ ${homeNameSummary} vs. ${guestNameSummary} (Spiel ${matchInfo?.matchNo || match.matchNo})`
    : `${homeNameSummary} vs. ${guestNameSummary} (Spiel ${matchInfo?.matchNo || match.matchNo})`;

  const cleanSummary = (text) => (typeof text === 'string' ? text.replace(/[\r\n]+/g, ' ').trim() : 'Untitled event');
  const summaryClean = cleanSummary(summary);

  const dateStr = matchInfo?.kickoffDate || match.kickoffDate;
  const timeStr = matchInfo?.kickoffTime || match.kickoffTime;
  const kickoff = new Date(`${dateStr}T${timeStr}:00`);
  const dtstart = new Date(kickoff.getTime() - 60 * 60 * 1000);
  const dtend = new Date(kickoff.getTime() + 2.5 * 60 * 60 * 1000);

  const feld = matchInfo?.matchInfo?.spielfeld || match.spielfeld || {};

  const location = feld.strasse && feld.plz && feld.ort
    ? `${feld.strasse}, ${feld.plz} ${feld.ort}, Deutschland`
    : 'Ort unbekannt';

  const description = [
    `Wettbewerb: ${matchInfo?.ligaData.liganame || match.ligaData.liganame || 'Unbekannt'}`,
    `Saison: ${matchInfo?.ligaData.seasonName || match.ligaData.seasonName || 'Unbekannt'}`,
    `Spielnr: ${matchInfo?.matchNo || match.matchNo || 'Unbekannt'}`,
    `Heimteam: ${homeNameDesc || 'Unbekannt'}`,
    `Gastteam: ${guestNameDesc || 'Unbekannt'}`,
    'Adresse:',
    `${feld.bezeichnung || '}`,
    `${feld.strasse || '}`,
    `${feld.plz || ''} ${feld.ort || ''}`.trim(),
    `Spielbeginn: ${formatKickoff(dateStr, timeStr)}`,
    `letztes Update: ${new Date().toLocaleString('de-DE')}`,
  ].filter(Boolean).join('\r\n');

  // Trigger validieren, Fallback einbauen
  const alarmTriggerMinutes = isHome ? 30 : 60;

  const event = {
    uid: `${match.matchId}@basketball-bund.net`,
    title: summaryClean,
    description,
    start: dateToArr(dtstart),
    end: dateToArr(dtend),
    location,
    alarms: [
      {
        action: 'display',
        description: 'Spiel beginnt bald',
        trigger: { minutes: alarmTriggerMinutes, before: true },
      },
    ],
  };

  return event;
}

async function generateICS(matches, details, teamId) {
  const events = [];
  for (const match of matches) {
    const matchInfo = details[match.matchId];
    events.push(await buildEvent(match, matchInfo, teamId));
  }
  if (!events.length) return null;

  // Debug vor createEvents
  events.forEach((e, i) => console.log(`Event ${i} summary: "${e.title}"`));

  return new Promise((resolve, reject) => {
    createEvents(events, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

module.exports = { generateICS };
