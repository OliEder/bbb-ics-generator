const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://olieder.github.io/bbb-ics-generator/';

function makeWebcalLink(filename) {
  return BASE_URL.replace(/^https:/, 'webcal:') + filename;
}

function makeHttpsLink(filename) {
  return BASE_URL + filename;
}

function makeGoogleCalLink(filename) {
  return 'https://www.google.com/calendar/render?cid=' + encodeURIComponent(makeWebcalLink(filename));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function genHTML() {
  const generatedDir = process.env.BBB_GENERATED_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath)) : [];

  const content = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8"><title>Basketball Kalender Übersicht</title>
  <style>
    body{max-width:700px;margin:30px auto;font-family:sans-serif}
    .team{background:#fff;padding:20px;margin:15px 0;border-radius:6px;box-shadow:0 2px 10px #ddd}
    .buttons a {display:inline-block;padding:10px 16px;margin:2px 6px;background:#e74c3c;color:#fff;text-decoration:none;border-radius:3px;}
  </style>
</head>
<body>
  <h1>Basketball ICS Kalender – Übersicht</h1>
  <p>Kalender werden automatisch alle 2-6h aktualisiert. Stand: ${new Date().toLocaleString('de-DE')}</p>
  ${teams.map(t => `
    <div class="team">
      <strong>${escapeHtml(t.teamName)}</strong> (${escapeHtml(t.ageGroup)})<br/>
      <small>Letztes Update: ${new Date(t.lastUpdate).toLocaleString('de-DE')}</small><br/>
      ${Number(t.matchCount)} Spiele, Heim: ${Number(t.homeMatchCount)}, Auswärts: ${Number(t.awayMatchCount)}<br/>
      <div class="buttons">
        <a href="${escapeHtml(makeWebcalLink(t.teamId+"_all.ics"))}">iOS/Mac: Alle Spiele</a>
        <a href="${escapeHtml(makeWebcalLink(t.teamId+"_home.ics"))}">iOS/Mac: Heimspiele</a>
        <a href="${escapeHtml(makeWebcalLink(t.teamId+"_away.ics"))}">iOS/Mac: Auswärts</a>
      </div>
      <div class="buttons">
        <a href="${escapeHtml(makeGoogleCalLink(t.teamId+"_all.ics"))}">Android: Alle Spiele</a>
        <a href="${escapeHtml(makeGoogleCalLink(t.teamId+"_home.ics"))}">Android: Heimspiele</a>
        <a href="${escapeHtml(makeGoogleCalLink(t.teamId+"_away.ics"))}">Android: Auswärts</a>
      </div>
      <div class="buttons">
        <a href="${escapeHtml(makeHttpsLink(t.teamId+"_all.ics"))}">ICS Download: Alle</a>
        <a href="${escapeHtml(makeHttpsLink(t.teamId+"_home.ics"))}">ICS Download: Heim</a>
        <a href="${escapeHtml(makeHttpsLink(t.teamId+"_away.ics"))}">ICS Download: Auswärts</a>
      </div>
    </div>
  `).join('')}
</body>
</html>`;
  fs.writeFileSync(path.join(generatedDir, 'index.html'), content);
}

module.exports = { genHTML };

if (require.main === module) {
  genHTML();
}
