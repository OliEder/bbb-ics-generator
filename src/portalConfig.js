'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['operator', 'address', 'email'];

// Lädt die Betreiberangaben (Impressum) des Portals aus portal.json (Repo-Root) — gleiche
// Struktur wie `legal` in den Club-Configs. Wirft mit klarer Meldung, wenn die Datei fehlt
// oder Pflichtfelder leer sind: eine Portal-Seite ohne Impressum wird nie veröffentlicht
// (aggregatePages fängt den Fehler; Club-Ausgabe bleibt unberührt).
function loadPortalConfig(filePath = process.env.BBB_PORTAL_CONFIG || path.resolve(__dirname, '../portal.json')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Portal-Config nicht gefunden: ${filePath} (Impressum-Pflichtangaben fehlen; Vorlage: portal.example.json)`);
  }
  let legal;
  try {
    legal = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Ungültiges JSON in ${filePath}: ${err.message}`);
  }
  const missing = REQUIRED_FIELDS.filter(key => !legal || !String(legal[key] || '').trim());
  if (missing.length > 0) {
    throw new Error(`portal.json: Pflichtfelder fehlen: ${missing.join(', ')}`);
  }
  return legal;
}

module.exports = { loadPortalConfig, REQUIRED_FIELDS };
