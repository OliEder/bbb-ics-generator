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

async function buildEvent(match, matchInfo, teamId, calendarType = 'all') {
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

  // Prefix nur bei "all" Kalender
  let prefix = '';
  if (calendarType === 'all') {
    prefix = isHome ? '🏠 ' : isAway ? '🚗 ' : '🏀 ';
  }

  const summary = `${prefix}${homeNameSummary} vs. ${guestNameSummary} (Spiel ${matchInfo?.matchNo || match.matchNo})`;

  const cleanSummary = (text) => (typeof text === 'string' ? text.replace(/[\r\n]+/g, ' ').trim() : 'Untitled event');
  const summaryClean = cleanSummary(summary);

  // Kickoff-Zeit korrekt parsen (deutsche Zeit)
  const dateStr = matchInfo?.kickoffDate || match.kickoffDate;
  const timeStr = matchInfo?.kickoffTime || match.kickoffTime;
  const kickoff = new Date(`${dateStr}T${timeStr}:00`);
  
  // Start: 1 Stunde VOR Spielbeginn
  const dtstart = new Date(kickoff.getTime() - 60 * 60 * 1000);
  // Ende: 2.5 Stunden NACH Spielbeginn
  const dtend = new Date(kickoff.getTime() + 2.5 * 60 * 60 * 1000);

  const feld = matchInfo?.matchInfo?.spielfeld || match.spielfeld || {};

  const location = feld.strasse && feld.plz && feld.ort
    ? `${feld.strasse}, ${feld.plz} ${feld.ort}, Deutschland`
    : 'Ort unbekannt';

  const description = [
    `Wettbewerb: ${matchInfo?.ligaData.liganame || match.ligaData.liganame || 'Unbekannt'}`,
    `Saison: ${matchInfo?.ligaData.seasonName || match.ligaData.seasonName || 'Unbekannt'}`,
    `Spiel ${matchInfo?.matchNo || match.matchNo || '?'}`,
    `Heim: ${homeNameDesc || 'Unbekannt'}`,
    `Gast: ${guestNameDesc || 'Unbekannt'}`,
    feld.bezeichnung ? `Halle: ${feld.bezeichnung}` : '',
    feld.strasse && feld.ort ? `${feld.strasse}, ${feld.plz} ${feld.ort}` : '',
    `Anpfiff: ${formatKickoff(dateStr, timeStr)}`,
    `Update: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
  ].filter(Boolean).join(' | ');

  // Trigger validieren, Fallback einbauen
  const alarmTriggerMinutes = isHome ? 30 : 60;

  const event = {
    uid: `${match.matchId}@basketball-bund.net`,
    title: summaryClean,
    description,
    start: dateToArr(dtstart),
    startInputType: 'local',
    startOutputType: 'local',
    end: dateToArr(dtend),
    endInputType: 'local',
    endOutputType: 'local',
    location,
    busyStatus: 'BUSY',
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

async function generateICS(matches, details, teamId, type = 'all') {
  const events = [];
  for (const match of matches) {
    const matchInfo = details[match.matchId];
    events.push(await buildEvent(match, matchInfo, teamId, type));
  }
  if (!events.length) return null;

  // Debug vor createEvents
  events.forEach((e, i) => console.log(`Event ${i} summary: "${e.title}"`));

  // Teaminfo aus teams.json holen
  const teams = require('../teams.json');
  const team = teams.find(t => Number(t.id) === Number(teamId));
  
  const teamName = team?.name || 'Basketball Team';
  
  const typeLabel = type === 'home' ? ' - Heimspiele' : 
                    type === 'away' ? ' - Auswärtsspiele' : '';
  
  const calendarName = `${teamName}${typeLabel}`;

  return new Promise((resolve, reject) => {
    createEvents(events, (error, value) => {
      if (error) {
        reject(error);
      } else {
        // Header korrekt einfügen
        const lines = value.split('\n');
        const vcalendarIndex = lines.findIndex(line => line.trim() === 'BEGIN:VCALENDAR');
        
        if (vcalendarIndex !== -1) {
          // Füge Header nach BEGIN:VCALENDAR ein
          const header = [
            ...lines.slice(0, vcalendarIndex + 1),
            'PRODID:-//bbb-ics-generator//DE',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' + calendarName,
            'X-WR-TIMEZONE:Europe/Berlin',
            'X-WR-CALDESC:Basketball-Spielplan',
            ...lines.slice(vcalendarIndex + 1)
          ];
          resolve(header.join('\r\n'));
        } else {
          // Fallback: Füge vor dem Content ein
          const withHeaders = `X-WR-CALNAME:${calendarName}\r\nX-WR-TIMEZONE:Europe/Berlin\r\nX-WR-CALDESC:Basketball-Spielplan\r\n${value}`;
          resolve(withHeaders);
        }
      }
    });
  });
}

module.exports = { generateICS };