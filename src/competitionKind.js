'use strict';

// Zentrale Klassifikation Liga vs. Pokal/Turnier (ADR-028). Es gibt genau EINE
// Implementierung der Namensregel; Anzeige-Schicht und Datenerhebung nutzen sie gemeinsam.
//
// Regeln:
//  1. Name enthält pokal/cup/turnier/qualifikation → 'cup' (auch bei "Ligapokal").
//  2. sonst Name enthält "liga" → 'league'.
//  3. sonst 'unknown' (z.B. Bezirksklasse, Kreisklasse) → resolveCompetition entscheidet
//     anhand von ligaData.crossTableExists der Table-Antwort.

function kindFromName(liganame) {
  const n = String(liganame || '').toLowerCase();
  if (/pokal|cup|turnier|qualifikation/.test(n)) return 'cup';
  if (n.includes('liga')) return 'league';
  return 'unknown';
}

// Reine Namensprüfung für die Anzeige-Schicht (Fallback ohne gespeicherte Klassifikation).
function isLeagueByName(liganame) {
  return kindFromName(liganame) === 'league';
}

// Löst einen Wettbewerb auf: { ...comp, isLiga, table, bracket }.
// apiFns: { fetchLeagueTable, fetchLeagueTableWithMeta?, fetchTournamentRounds }.
// Bei 'unknown' wird genau ein Table-Abruf mit Metadaten gemacht und dessen Zeilen
// wiederverwendet; fehlt die Funktion oder schlägt der Abruf fehl, gilt 'cup'.
async function resolveCompetition(comp, ownTeamId, apiFns) {
  const { fetchLeagueTable, fetchLeagueTableWithMeta, fetchTournamentRounds } = apiFns;
  const kind = kindFromName(comp.liganame);

  if (kind === 'league') {
    const table = await fetchLeagueTable(comp.ligaId, ownTeamId);
    return { ...comp, isLiga: true, table: table || null, bracket: null };
  }
  if (kind === 'unknown' && typeof fetchLeagueTableWithMeta === 'function') {
    const meta = await fetchLeagueTableWithMeta(comp.ligaId, ownTeamId);
    if (meta && meta.crossTableExists === true) {
      return { ...comp, isLiga: true, table: meta.rows || null, bracket: null };
    }
  }
  const bracket = await fetchTournamentRounds(comp.ligaId);
  return { ...comp, isLiga: false, table: null, bracket: bracket || null };
}

module.exports = { kindFromName, isLeagueByName, resolveCompetition };
