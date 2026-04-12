const { fetchTeamMatches, fetchMatchInfo, fetchClubTeams, fetchLeagueTable, fetchTournamentRounds } = require('./apiClient');
const { generateICS } = require('./icsGenerator');
const { saveICS, saveTeamsCache, loadTeamsCache } = require('./storage');
const { genHTML } = require('./generateHTML');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

const CURRENT_SEASON = 2025; // Saison 2025/26
const BBB_MEDIA_BASE = 'https://www.basketball-bund.net/media/team';

function isLiga(liganame) {
  return String(liganame || '').toLowerCase().includes('liga');
}

async function getTeams() {
  const { teams: cached, stale } = loadTeamsCache();
  if (cached && !stale) {
    console.log(`[DEBUG] Teams aus Cache geladen (${cached.length} Teams)`);
    return cached;
  }
  console.log(`[DEBUG] Lade Teams von API für Club ${config.clubId}...`);
  const fresh = await fetchClubTeams(config.clubId);
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

function mapMatches(seasonMatches, teamId, details) {
  let nextMarked = false;
  return seasonMatches.map(m => {
    const isHome = Number(m.homeTeam?.teamPermanentId) === Number(teamId);
    const opponent = isHome
      ? (m.guestTeam?.teamname || '')
      : (m.homeTeam?.teamname  || '');
    const opponentShort = isHome
      ? (m.guestTeam?.teamnameSmall || '')
      : (m.homeTeam?.teamnameSmall  || '');
    const ownShort = isHome
      ? (m.homeTeam?.teamnameSmall || '')
      : (m.guestTeam?.teamnameSmall || '');
    const result = m.result || null;
    const isNext = !nextMarked && !result ? (nextMarked = true, true) : false;
    let venueName = '';
    let venueAddress = '';
    let opponentLogoUrl = '';
    if (isNext) {
      const feld = details[m.matchId]?.matchInfo?.spielfeld || details[m.matchId]?.feld || {};
      venueName = feld.bezeichnung || '';
      const plzOrt = [feld.plz, feld.ort].filter(Boolean).join(' ');
      venueAddress = (feld.strasse && feld.ort)
        ? `${feld.strasse}, ${plzOrt}`
        : '';
      const oppId = isHome
        ? m.guestTeam?.teamPermanentId
        : m.homeTeam?.teamPermanentId;
      if (oppId) opponentLogoUrl = `${BBB_MEDIA_BASE}/${oppId}/logo`;
    }
    return {
      date:         m.kickoffDate  || '',
      time:         m.kickoffTime  || '',
      opponent,
      opponentShort,
      ownShort,
      isHome,
      result,
      competition:  m.ligaData?.liganame || '',
      isNext,
      venueName,
      venueAddress,
      opponentLogoUrl,
    };
  });
}

async function updateAll() {
  const meta = [];
  const teams = await getTeams();

  // All teamPermanentIds for this club share the same club logo at this endpoint.
  // Using teams[0] is safe; any team ID resolves to the club crest.
  const firstTeamLogoUrl = teams.length > 0
    ? `${BBB_MEDIA_BASE}/${teams[0].id}/logo`
    : null;

  const theme = {
    primary:  config.theme?.primary  || '#004174',
    accent:   config.theme?.accent   || '#009ef3',
    logoUrl:  config.theme?.logoUrl  || firstTeamLogoUrl,
    cupColor: config.cupColor        || '#7c3aed',
  };

  for (const t of teams) {
    try {
      console.log(`[DEBUG] Starte Update für Team ${t.id} (${t.name})`);

      // Matches abrufen
      const { matches, gender: teamGender } = await fetchTeamMatches(t.id);
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

      const seasonMatches = matches
        .filter(m => m.ligaData?.seasonId === CURRENT_SEASON)
        .sort((a, b) => {
          const da = (a.kickoffDate || '') + (a.kickoffTime || '');
          const db = (b.kickoffDate || '') + (b.kickoffTime || '');
          return da < db ? -1 : da > db ? 1 : 0;
        });

      const mappedMatches = mapMatches(seasonMatches, t.id, details);

      // Collect unique competitions from this season's matches
      const compMap = new Map();
      for (const m of seasonMatches) {
        const ligaId = String(m.ligaData?.ligaId || '');
        if (!ligaId || compMap.has(ligaId)) continue;
        compMap.set(ligaId, {
          ligaId,
          liganame: m.ligaData?.liganame || '',
          isLiga:   isLiga(m.ligaData?.liganame),
        });
      }

      // Fetch table or bracket for each competition in parallel
      const competitions = await Promise.all(
        Array.from(compMap.values()).map(async comp => {
          if (comp.isLiga) {
            const table = await fetchLeagueTable(comp.ligaId, t.id);
            return { ...comp, table: table || null, bracket: null };
          } else {
            const bracket = await fetchTournamentRounds(comp.ligaId);
            return { ...comp, table: null, bracket: bracket || null };
          }
        })
      );

      meta.push({
        teamId:         t.id,
        teamName:       t.name,
        ageGroup:       t.ageGroup,
        gender:         teamGender || t.gender,
        lastUpdate:     new Date().toISOString(),
        matchCount:     matches.length,
        homeMatchCount: homeMatches.length,
        awayMatchCount: awayMatches.length,
        logoUrl:        `${BBB_MEDIA_BASE}/${t.id}/logo`,
        matches:        mappedMatches,
        competitions,
      });
    } catch (e) {
      console.error(`Fehler beim Update Team ${t.id}:`, e.stack || e);
    }
  }

  const generatedDir = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  fs.writeFileSync(path.join(generatedDir, 'metadata.json'), JSON.stringify(meta, null, 2));
  genHTML(theme);
}

module.exports = { getTeams, updateAll, mapMatches };

if (require.main === module) {
  updateAll();
}
