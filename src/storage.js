const fs = require('fs');
const path = require('path');

const ICS_DIR = path.resolve(__dirname, '../generated');
if (!fs.existsSync(ICS_DIR)) fs.mkdirSync(ICS_DIR, { recursive: true });

function saveICS(teamId, type, data) {
  const filepath = path.join(ICS_DIR, `${teamId}_${type}.ics`);
  // Explizit UTF-8 mit BOM für bessere Kompatibilität
  const utf8BOM = '\uFEFF';
  fs.writeFileSync(filepath, utf8BOM + data, { encoding: 'utf8' });
  console.log(`[STORAGE] Datei geschrieben: ${filepath} (${data.length} Bytes)`);
  return filepath;
}

function readICS(teamId, type) {
  const file = path.join(ICS_DIR, `${teamId}_${type}.ics`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

module.exports = { ICS_DIR, saveICS, readICS };
