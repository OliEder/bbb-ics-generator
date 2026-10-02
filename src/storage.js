const fs = require('fs');
const path = require('path');

const ICS_DIR = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
if (!fs.existsSync(ICS_DIR)) fs.mkdirSync(ICS_DIR, { recursive: true });

const VALID_TYPES = new Set(['all', 'home', 'away']);
const SLUG_PATTERN = /^[a-z0-9-]+$/;
// Vorsorglich reserviert: "index" würde URLs wie /<bundesland>/index (Club) und
// /<bundesland>/index.html (Land-Seite) mehrdeutig machen. Kein Dateisystem-Konflikt
// (Ordner index/ und Datei index.html sind verschiedene Namen) — siehe ADR-024.
const RESERVED_SLUGS = new Set(['index']);

// Validiert Pfadsegmente (Bundesland-/Club-Slugs), die später von Aufrufern
// zu Dateisystempfaden zusammengesetzt werden. Nur Kleinbuchstaben, Ziffern
// und Bindestrich sind erlaubt — verhindert Path-Traversal (../, /) und
// uneinheitliche Groß-/Kleinschreibung zwischen Verzeichnisnamen.
function sanitizeSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Ungültiger Slug: ${slug}`);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`Reservierter Slug: ${slug}`);
  }
  return slug;
}

function resolveDir(outputDir) {
  if (!outputDir) return ICS_DIR;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

// outputDir ist optional: ohne Angabe wird auf das globale ICS_DIR zurückgefallen
// (Rückwärtskompatibilität); mit Angabe landet die Datei im club-spezifischen Verzeichnis.
function saveICS(teamId, type, data, outputDir) {
  if (!VALID_TYPES.has(type)) throw new Error(`Ungültiger ICS-Typ: ${type}`);
  if (!/^\d+$/.test(String(teamId))) throw new Error(`Ungültige teamId: ${teamId}`);
  const dir = resolveDir(outputDir);
  const filepath = path.join(dir, `${teamId}_${type}.ics`);
  fs.writeFileSync(filepath, data, 'utf8');
  return filepath;
}

function readICS(teamId, type, outputDir) {
  if (!VALID_TYPES.has(type)) return null;
  if (!/^\d+$/.test(String(teamId))) return null;
  const dir = resolveDir(outputDir);
  const file = path.join(dir, `${teamId}_${type}.ics`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

// Bestimmt den club-spezifischen Cache-Dateipfad. clubId ist erforderlich (nicht
// optional mit globalem Fallback): ein ungescopter Teams-Cache ist genau der Bug,
// den dieses Schema behebt (Team-Liste von Club A wird beim Verarbeiten von Club B
// zurückgegeben, weil beide dieselbe Datei teilen). Ein fehlendes clubId wirft daher
// laut, statt still eine "teams-cache-undefined.json" zu erzeugen, die selbst wieder
// zu einer geteilten (Bug-)Datei würde.
//
// clubId wird zusätzlich strikt gegen /^\d+$/ validiert (analog zur teamId-Prüfung
// in saveICS/readICS oben) statt nur normalisiert: ein reines Zeichen-Ersetzen
// (z.B. alles außer [a-zA-Z0-9_-] durch "_") würde zwei UNTERSCHIEDLICHE clubIds
// still auf denselben Dateinamen abbilden können (z.B. "44-68" und "44 68" werden
// beide zu "44_68") — genau dieselbe Bug-Klasse (implizite Annahme über eindeutige
// Cache-Schlüssel, die nirgends erzwungen wird), die dieser gesamte Fix behebt. Echte
// Basketball-Bund-clubIds sind ohnehin rein numerisch, daher ist die Einschränkung
// auf Ziffern unproblematisch.
function teamsCacheFilePath(clubId) {
  if (!clubId) throw new Error('teamsCacheFilePath: clubId ist erforderlich');
  if (!/^\d+$/.test(String(clubId))) throw new Error(`Ungültige clubId: ${clubId}`);
  return path.join(ICS_DIR, `teams-cache-${clubId}.json`);
}

function saveTeamsCache(teams, clubId) {
  if (!clubId) throw new Error('saveTeamsCache: clubId ist erforderlich');
  const file = teamsCacheFilePath(clubId);
  fs.writeFileSync(file, JSON.stringify({ cachedAt: new Date().toISOString(), teams }, null, 2), 'utf8');
}

function loadTeamsCache(clubId) {
  if (!clubId) throw new Error('loadTeamsCache: clubId ist erforderlich');
  const file = teamsCacheFilePath(clubId);
  if (!fs.existsSync(file)) return { teams: null, stale: false };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const age = Date.now() - new Date(raw.cachedAt).getTime();
    return { teams: raw.teams, stale: age >= CACHE_TTL_MS };
  } catch {
    return { teams: null, stale: true };
  }
}

module.exports = { ICS_DIR, saveICS, readICS, saveTeamsCache, loadTeamsCache, sanitizeSlug };
