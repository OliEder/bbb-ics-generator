'use strict';

// Basketball-Bund-net verbandId → Bundesland-Slug.
// Die OpenAPI-Doku des basketball-bund-api Repos dokumentiert das verbandId-Feld in
// ligaData nur mit zwei Beispielwerten (2=Bayern, 100=Bundesligen) — keine vollständige
// Enum-Liste. Diese Tabelle wurde daher gegen echte Daten verifiziert: Abgleich von
// 1725 real gecrawlten Vereinsdatensätzen (verbandId/verbandName-Paare direkt aus der
// Basketball-Bund.net-API) aus dem Schwesterprojekt
// basketball-vereinsregister-deutschland. Eine frühere Version dieser Tabelle nahm eine
// falsche ID-Reihenfolge an (nur 1, 2, 3 und 16 stimmten zufällig) — siehe Commit-Historie.
// Verbände, die nicht auf genau ein Bundesland abbilden (z.B. Bundesligen, ID 100, oder
// Deutsche Meisterschaften, ID 29), werden bewusst NICHT hier eingetragen und fallen auf
// 'bundesweit' zurück.
const VERBAND_TO_BUNDESLAND = {
  1: 'baden-wuerttemberg',
  2: 'bayern',
  3: 'berlin',
  4: 'bremen',
  5: 'hamburg',
  6: 'hessen',
  7: 'niedersachsen',
  8: 'rheinland-pfalz',
  9: 'saarland',
  10: 'schleswig-holstein',
  11: 'nordrhein-westfalen',
  12: 'mecklenburg-vorpommern',
  13: 'sachsen-anhalt',
  14: 'brandenburg',
  15: 'sachsen',
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
