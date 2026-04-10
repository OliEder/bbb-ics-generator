const { fetchTeamMatches, fetchMatchInfo, fetchClubTeams } = require('./apiClient');
const { generateICS } = require('./icsGenerator');
const { saveICS, saveTeamsCache, loadTeamsCache } = require('./storage');
const { clubId } = require('../config.json');
const fs = require('fs');
const path = require('path');

async function getTeams() {
  const { teams: cached, stale } = loadTeamsCache();
  if (cached && !stale) {
    console.log(`[DEBUG] Teams aus Cache geladen (${cached.length} Teams)`);
    return cached;
  }
  console.log(`[DEBUG] Lade Teams von API für Club ${clubId}...`);
  const fresh = await fetchClubTeams(clubId);
  if (fresh && fresh.length > 0) {
    saveTeamsCache(fresh);
    console.log(`[DEBUG] ${fresh.length} Teams gecacht`);
    return fresh;
  }
  if (cached) {
    console.warn('[WARN] Club-API fehlgeschlagen, verwende abgelaufenen Cache');
    return cached;
  }
  console.error('[ERROR] Keine Teams verfügbar — weder API noch Cache');
  return [];
}

async function updateAll() {
  const meta = [];
  const teams = await getTeams();

  for (const t of teams) {
    try {
      console.log(`[DEBUG] Starte Update für Team ${t.id} (${t.name})`);

      // Matches abrufen
      const matches = await fetchTeamMatches(t.id);
      console.log(`[DEBUG] API-Matches: ${matches.length}`);

      if (!Array.isArray(matches) || matches.length === 0) {
        console.warn(`[WARN] Keine Matches für Team ${t.id}`);
        continue;
      }

      // Detailinfos für jedes Match holen
      const details = {};
      for (const m of matches) {
        details[m.matchId] = await fetchMatchInfo(m.matchId);
      }

      // Home und Away Matches filtern
      const homeMatches = matches.filter(m => Number(m.homeTeam.teamPermanentId) === Number(t.id));
      const awayMatches = matches.filter(m => Number(m.guestTeam.teamPermanentId) === Number(t.id));

      // Für alle Varianten ICS generieren
      const matchVariants = {
        all: matches,
        home: homeMatches,
        away: awayMatches,
      };

      for (const [kind, ms] of Object.entries(matchVariants)) {
        console.log(`[DEBUG] Erzeuge ICS für Team ${t.id}, Typ ${kind}, Spiele: ${ms.length}`);
        const ics = await generateICS(ms, details, t.id, kind, t.name);
        console.log(`[DEBUG] ICS erzeugt: Länge ${ics?.length || 0}`);

        if (ics) {
          saveICS(t.id, kind, ics);
          console.log(`[DEBUG] ICS gespeichert: ${t.id}_${kind}.ics`);
        } else {
          console.warn(`[WARN] Keine ICS für Team ${t.id}, Typ ${kind}`);
        }
      }

      meta.push({
        teamId: t.id,
        teamName: t.name,
        ageGroup: t.ageGroup,
        lastUpdate: new Date().toISOString(),
        matchCount: matches.length,
        homeMatchCount: homeMatches.length,
        awayMatchCount: awayMatches.length,
      });
    } catch (e) {
      console.error(`Fehler beim Update Team ${t.id}:`, e.stack || e);
    }
  }

  fs.writeFileSync(path.resolve(__dirname, '../generated/metadata.json'), JSON.stringify(meta, null, 2));
}

updateAll();
