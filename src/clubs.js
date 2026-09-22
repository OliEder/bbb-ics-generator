'use strict';

const fs = require('fs');
const path = require('path');

// Liest clubs/<bundeslandSlug>/<clubSlug>/config.json für jeden Club ein.
// sourceBundeslandSlug ist nur der Ordnername (Organisationshilfe im Repo) —
// die verbindliche Bundesland-Zuordnung wird separat aus API-Daten berechnet
// (siehe src/verbandMapping.js, aufgerufen aus cronUpdate.js).
function loadClubs(clubsRootDir) {
  const clubs = [];
  if (!fs.existsSync(clubsRootDir)) return clubs;

  const bundeslandDirs = fs.readdirSync(clubsRootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory());

  for (const bundeslandEntry of bundeslandDirs) {
    const bundeslandPath = path.join(clubsRootDir, bundeslandEntry.name);

    let clubDirs;
    try {
      clubDirs = fs.readdirSync(bundeslandPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory());
    } catch (err) {
      console.error(`[ERROR] Konnte Verzeichnis ${bundeslandPath} nicht lesen:`, err.message);
      continue;
    }

    for (const clubEntry of clubDirs) {
      const configPath = path.join(bundeslandPath, clubEntry.name, 'config.json');
      if (!fs.existsSync(configPath)) continue;

      let config;
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (err) {
        console.error(`[ERROR] Ungültiges JSON in ${configPath}:`, err.message);
        continue;
      }

      if (!config.clubId) {
        console.error(`[ERROR] ${configPath} hat keine clubId — wird übersprungen`);
        continue;
      }

      clubs.push({
        slug: clubEntry.name,
        sourceBundeslandSlug: bundeslandEntry.name,
        configPath,
        config,
      });
    }
  }

  return clubs;
}

module.exports = { loadClubs };
