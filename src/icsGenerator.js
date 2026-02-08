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

// ICS-Escape für manuell eingefügte Felder (nach RFC 5545)
function icsEscape(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')  // Backslash → \\
    .replace(/;/g, '\\;')    // Semikolon → \;
    .replace(/,/g, '\\,')    // Komma → \,
    .replace(/\n/g, '\\n')   // Newline → \n
    .replace(/\r/g, '');     // Carriage Return entfernen
}

// HTML-Version für X-ALT-DESC erstellen
function createHtmlDescription(descriptionLines, feld) {
  const html = `<!DOCTYPE HTML><HTML><HEAD><META CHARSET="UTF-8"></HEAD><BODY>
<p><strong>${descriptionLines[0]}</strong></p>
<p>${descriptionLines[1]}</p>
<p><strong>Spiel ${descriptionLines[2].split(' ')[1]}</strong></p>
<p>${descriptionLines[3]}<br>${descriptionLines[4]}</p>
${feld.bezeichnung ? `<p><strong>Halle:</strong> ${feld.bezeichnung}</p>` : ''}
${feld.strasse && feld.ort ? `<p><strong>Adresse:</strong> ${feld.strasse}, ${feld.plz} ${feld.ort}</p>` : ''}
<p><strong>${descriptionLines[descriptionLines.length - 2]}</strong></p>
<p><em>${descriptionLines[descriptionLines.length - 1]}</em></p>
</BODY></HTML>`;
  
  // Für ICS: Zeilenumbrüche entfernen und escapen
  return icsEscape(html.replace(/\r?\n/g, ''));
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

  // Prefix mit Emojis
  let prefix = '';
  if (calendarType === 'all') {
    prefix = isHome ? 'HEIM: ' : isAway ? 'AUSWÄRTS: ' : '';
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

  // Description als Array mit echten Zeilenumbrüchen
  const descriptionLines = [
    `Wettbewerb: ${matchInfo?.ligaData.liganame || match.ligaData.liganame || 'Unbekannt'}`,
    `Saison: ${matchInfo?.ligaData.seasonName || match.ligaData.seasonName || 'Unbekannt'}`,
    `Spiel ${matchInfo?.matchNo || match.matchNo || '?'}`,
    `Heim: ${homeNameDesc || 'Unbekannt'}`,
    `Gast: ${guestNameDesc || 'Unbekannt'}`,
    feld.bezeichnung ? `Halle: ${feld.bezeichnung}` : '',
    feld.strasse && feld.ort ? `${feld.strasse}, ${feld.plz} ${feld.ort}` : '',
    `Anpfiff: ${formatKickoff(dateStr, timeStr)}`,
    `Update: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
  ].filter(Boolean);

  // Plain Text mit echten Zeilenumbrüchen (ics library macht das escaping)
  const description = descriptionLines.join('\n');
  
  // HTML-Version für Outlook/Thunderbird (mit Escaping!)
  const htmlDescription = createHtmlDescription(descriptionLines, feld);

  // Trigger validieren
  const alarmTriggerMinutes = isHome ? 30 : 60;

  const event = {
    uid: `${match.matchId}@basketball-bund.net`,
    title: summaryClean,
    description,
//    htmlDescription, // Temporär für später
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

  // HTML-Descriptions extrahieren
  const htmlDescriptions = events.map(e => e.htmlDescription);
  
  // htmlDescription aus Events entfernen
  events.forEach(e => delete e.htmlDescription);

  return new Promise((resolve, reject) => {
    createEvents(events, (error, value) => {
      if (error) {
        reject(error);
      } else {
        const lines = value.split('\r\n');
        const modifiedLines = [];
        let eventIndex = -1;
        let inEvent = false;
        let inAlarm = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Calendar Header einfügen
          if (line === 'BEGIN:VCALENDAR') {
            modifiedLines.push(line);
            modifiedLines.push('VERSION:2.0');
            modifiedLines.push('PRODID:-//bbb-ics-generator//DE');
            modifiedLines.push('CALSCALE:GREGORIAN');
            modifiedLines.push('METHOD:PUBLISH');
            modifiedLines.push('X-WR-CALNAME:' + icsEscape(calendarName));
            modifiedLines.push('X-WR-TIMEZONE:Europe/Berlin');
            modifiedLines.push('X-WR-CALDESC:Basketball-Spielplan');
            continue;
          }
          
          // Überspringe automatisch generierte Header
          if (line.startsWith('VERSION:') || 
              line.startsWith('PRODID:') || 
              line.startsWith('CALSCALE:') || 
              line.startsWith('METHOD:')) {
            continue;
          }
          
          // Event-Zähler
          if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            eventIndex++;
          }
          
          if (line === 'END:VEVENT') {
            inEvent = false;
          }
          
          // Alarm-Tracking
          if (line === 'BEGIN:VALARM') {
            inAlarm = true;
          }
          
          if (line === 'END:VALARM') {
            inAlarm = false;
          }
          
          // X-ALT-DESC nach DESCRIPTION einfügen (nur im EVENT, nicht im ALARM)
          // Wichtig: Line Folding beachten - fortgesetzte Zeilen beginnen mit Whitespace
          if (inEvent && !inAlarm && line.startsWith('DESCRIPTION:')) {
            // Sammle alle DESCRIPTION-Zeilen (inkl. fortgesetzte Zeilen)
            const descriptionLines = [line];
            
            // Line Folding: Zeilen die mit Space oder Tab beginnen gehören zur vorherigen Property
            while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
              i++;
              descriptionLines.push(lines[i]);
            }
            
            // Alle DESCRIPTION-Zeilen ausgeben
            descriptionLines.forEach(l => modifiedLines.push(l));
            
            // Jetzt X-ALT-DESC hinzufügen (nach der kompletten DESCRIPTION)
            if (htmlDescriptions[eventIndex]) {
              modifiedLines.push('X-ALT-DESC;FMTTYPE=text/html:' + htmlDescriptions[eventIndex]);
            }
            continue;
          }
          
          modifiedLines.push(line);
        }
        
        resolve(modifiedLines.join('\r\n'));
      }
    });
  });
}

module.exports = { generateICS };
