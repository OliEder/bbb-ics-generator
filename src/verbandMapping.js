'use strict';

// Basketball-Bund-net verbandId → Bundesland-Slug.
// IDs stammen aus der öffentlichen API-Doku (basketball-bund-api Repo, verbandId-Feld
// in ligaData). Verbände, die nicht auf genau ein Bundesland abbilden (z.B. Bundesligen),
// werden bewusst NICHT hier eingetragen und fallen auf 'bundesweit' zurück.
const VERBAND_TO_BUNDESLAND = {
  1: 'baden-wuerttemberg',
  2: 'bayern',
  3: 'berlin',
  4: 'brandenburg',
  5: 'sachsen',
  6: 'bremen',
  7: 'hamburg',
  8: 'hessen',
  9: 'mecklenburg-vorpommern',
  10: 'niedersachsen',
  11: 'nordrhein-westfalen',
  12: 'rheinland-pfalz',
  13: 'saarland',
  14: 'sachsen-anhalt',
  15: 'schleswig-holstein',
  16: 'thueringen',
};

const BUNDESWEIT = 'bundesweit';

function verbandIdToBundesland(verbandId) {
  if (verbandId === null || verbandId === undefined) return BUNDESWEIT;
  return VERBAND_TO_BUNDESLAND[Number(verbandId)] || BUNDESWEIT;
}

// teamVerbandIds: Array von verbandId-Werten, einer je Team des Clubs
// (Teams mit mehreren Ligen können ihre verbandId mehrfach beitragen — Aufrufer
// entscheidet, wie granular die Liste ist; diese Funktion zählt nur, was übergeben wird).
function deriveClubBundesland(teamVerbandIds) {
  const counts = new Map();
  const firstSeenOrder = [];
  for (const verbandId of teamVerbandIds || []) {
    const slug = verbandIdToBundesland(verbandId);
    if (slug === BUNDESWEIT) continue;
    if (!counts.has(slug)) {
      counts.set(slug, 0);
      firstSeenOrder.push(slug);
    }
    counts.set(slug, counts.get(slug) + 1);
  }
  if (counts.size === 0) return BUNDESWEIT;

  let winner = firstSeenOrder[0];
  let winnerCount = counts.get(winner);
  for (const slug of firstSeenOrder) {
    const count = counts.get(slug);
    if (count > winnerCount) {
      winner = slug;
      winnerCount = count;
    }
  }
  return winner;
}

module.exports = { verbandIdToBundesland, deriveClubBundesland, BUNDESWEIT };
