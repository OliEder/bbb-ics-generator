'use strict';

// Aktualisiert data/wam-ligen-cache.json für alle Bundesländer, in denen mindestens ein
// Club unter clubs/ liegt. Die verbandIds werden aus dem Ordnernamen abgeleitet
// (clubs/<bundesland>/…, nur Organisationshilfe — siehe ADR-014); 'bundesweit' hat keine
// einzelne verbandId und wird übersprungen. Exit-Code 1, wenn ein Verband unvollständig war.
const fs = require('fs');
const path = require('path');
const { loadClubs } = require('../src/clubs');
const { bundeslandToVerbandId } = require('../src/verbandMapping');
const { loadWamCache, refreshWamCache, DEFAULT_CACHE_PATH } = require('../src/wamCache');

async function main() {
  const clubsDir = process.env.BBB_CLUBS_DIR || path.resolve(__dirname, '../clubs');
  const cachePath = process.env.BBB_WAM_CACHE || DEFAULT_CACHE_PATH;

  const verbandIds = [...new Set(
    loadClubs(clubsDir)
      .map(club => bundeslandToVerbandId(club.sourceBundeslandSlug))
      .filter(id => id !== null)
  )].sort((a, b) => a - b);

  if (verbandIds.length === 0) {
    console.error('[ERROR] Keine Clubs mit bekanntem Bundesland unter', clubsDir);
    process.exitCode = 1;
    return;
  }

  console.log(`[INFO] Aktualisiere WAM-Cache für Verbände: ${verbandIds.join(', ')}`);
  const { cache: existingCache } = loadWamCache(cachePath);
  const { cache, incompleteVerbandIds } = await refreshWamCache({ verbandIds, existingCache });

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
  console.log(`[INFO] ${cachePath} geschrieben`);

  if (incompleteVerbandIds.length > 0) {
    console.error(`[ERROR] Unvollständige Verbände: ${incompleteVerbandIds.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
