const { fetchTeamMatches, fetchMatchInfo, fetchClubTeams, fetchLeagueTable, fetchTournamentRounds, mapWithConcurrency } = require('./apiClient');
const { generateICS } = require('./icsGenerator');
const { saveICS, saveTeamsCache, loadTeamsCache, sanitizeSlug } = require('./storage');
const { genHTML } = require('./generateHTML');
const { loadClubs } = require('./clubs');
const { deriveClubBundesland } = require('./verbandMapping');
const fs = require('fs');
const path = require('path');

const CURRENT_SEASON = 2026; // Saison 2025/26
const BBB_MEDIA_BASE = 'https://www.basketball-bund.net/media/team';
const PORTAL_BASE_URL = process.env.BBB_PORTAL_BASE_URL || 'https://olieder.github.io/bbb-ics-generator/';
const MATCH_INFO_CONCURRENCY = Number(process.env.BBB_MATCH_INFO_CONCURRENCY) > 0
  ? Number(process.env.BBB_MATCH_INFO_CONCURRENCY)
  : 4;

function isLiga(liganame) {
  return String(liganame || '').toLowerCase().includes('liga');
}

async function getTeams(clubId) {
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

function computeSpotlight(mappedMatches) {
  if (!mappedMatches.length) return [];
  const isNextIdx = mappedMatches.findIndex(m => m.isNext);
  if (isNextIdx !== -1) {
    // Show last result (if any) + next upcoming match
    const prev = isNextIdx > 0 ? [mappedMatches[isNextIdx - 1]] : [];
    return [...prev, mappedMatches[isNextIdx]];
  }
  // No upcoming matches — show only the most recent result
  const played = mappedMatches.filter(m => m.result);
  if (played.length > 0) return [played[played.length - 1]];
  // All future, no results — show next upcoming
  return [mappedMatches[0]];
}

// Ermittelt die verbandId für ein Team anhand seiner (ungefilterten) Rohspiele —
// benutzt für die Bundesland-Herleitung, unabhängig von den saisongefilterten,
// aufbereiteten Daten in mapMatches. Nimmt die verbandId des ersten Spiels, das eine
// besitzt (i.d.R. identisch über alle Spiele eines Teams hinweg).
function firstVerbandId(matches) {
  for (const m of matches) {
    const verbandId = m.ligaData?.verbandId;
    if (verbandId !== undefined && verbandId !== null) return verbandId;
  }
  return null;
}

// Verarbeitet einen einzelnen Club: holt Teams + Spiele, erzeugt die neuen
// (nach Bundesland/Club verschachtelten) ICS-/HTML-Dateien, und — nur für Clubs mit
// legacyRootOutput: true — zusätzlich ein Alt-Pfad-Duplikat direkt unter generatedRootDir
// (mit Migrationshinweis), das die ECHTEN Spieldaten behält (nicht nur den Hinweis-Event).
async function updateClub(club, generatedRootDir) {
  const meta = [];
  const clubId = club.config.clubId;
  const teams = await getTeams(clubId);

  // All teamPermanentIds for this club share the same club logo at this endpoint.
  // Using teams[0] is safe; any team ID resolves to the club crest.
  const firstTeamLogoUrl = teams.length > 0
    ? `${BBB_MEDIA_BASE}/${teams[0].id}/logo`
    : null;

  const theme = {
    primary:  club.config.theme?.primary  || '#004174',
    accent:   club.config.theme?.accent   || '#009ef3',
    logoUrl:  club.config.theme?.logoUrl  || firstTeamLogoUrl,
    cupColor: club.config.cupColor        || '#7c3aed',
  };

  // Rohdaten je Team (matches ungefiltert + details), für die eventuelle
  // Alt-Pfad-Regenerierung mit echten Spielen weiter unten.
  const rawTeamData = new Map();
  const teamVerbandIds = [];

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

      teamVerbandIds.push(firstVerbandId(matches));

      // Detailinfos für jedes Match holen (parallel, mit Concurrency-Limit)
      const detailsList = await mapWithConcurrency(matches, MATCH_INFO_CONCURRENCY, m => fetchMatchInfo(m.matchId));
      const details = {};
      matches.forEach((m, i) => { details[m.matchId] = detailsList[i]; });

      // Home und Away Matches filtern
      const homeMatches = matches.filter(m => Number(m.homeTeam.teamPermanentId) === Number(t.id));
      const awayMatches = matches.filter(m => Number(m.guestTeam.teamPermanentId) === Number(t.id));

      rawTeamData.set(t.id, { team: t, matches, homeMatches, awayMatches, details, teamGender });

      // ICS-Varianten werden hier nur vorbereitet (matchVariants) — gespeichert werden
      // sie erst NACH der Team-Schleife (siehe unten), weil clubOutputDir vom
      // aggregierten Bundesland aller Teams abhängt (deriveClubBundesland),
      // das erst nach vollständiger Team-Iteration feststeht.
      const matchVariants = {
        all: matches,
        home: homeMatches,
        away: awayMatches,
      };

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
        matches:          mappedMatches,
        spotlightMatches: computeSpotlight(mappedMatches),
        competitions,
        _matchVariants: matchVariants, // temporär, wird vor dem Schreiben entfernt
      });
    } catch (e) {
      console.error(`Fehler beim Update Team ${t.id}:`, e.stack || e);
    }
  }

  const bundesland = sanitizeSlug(deriveClubBundesland(teamVerbandIds));
  const clubOutputDir = path.join(generatedRootDir, bundesland, club.slug);
  const baseUrl = `${PORTAL_BASE_URL}${bundesland}/${club.slug}/`;

  // Neue, Club-spezifische ICS-Dateien schreiben (kein migrationNotice)
  for (const entry of meta) {
    const { all, home, away } = entry._matchVariants;
    delete entry._matchVariants;
    const data = rawTeamData.get(entry.teamId);
    const variants = { all, home, away };
    for (const [kind, ms] of Object.entries(variants)) {
      console.log(`[DEBUG] Erzeuge ICS für Team ${entry.teamId}, Typ ${kind}, Spiele: ${ms.length}`);
      const ics = await generateICS(ms, data.details, entry.teamId, kind, entry.teamName);
      console.log(`[DEBUG] ICS erzeugt: Länge ${ics?.length || 0}`);
      if (ics) {
        saveICS(entry.teamId, kind, ics, clubOutputDir);
        console.log(`[DEBUG] ICS gespeichert: ${entry.teamId}_${kind}.ics (${clubOutputDir})`);
      } else {
        console.warn(`[WARN] Keine ICS für Team ${entry.teamId}, Typ ${kind}`);
      }
    }
  }

  fs.mkdirSync(clubOutputDir, { recursive: true });
  fs.writeFileSync(path.join(clubOutputDir, 'metadata.json'), JSON.stringify(meta, null, 2));
  genHTML(theme, club.config.legal || {}, { outputDir: clubOutputDir, baseUrl });

  // Alt-Pfad-Duplikat NUR für Clubs, die vor der Multi-Club-Migration bereits existierten
  // und echte Kalender-Abonnenten haben. Die Alt-Pfad-ICS müssen die ECHTEN Spiele
  // enthalten (nicht nur den Migrationshinweis) — deshalb werden hier dieselben
  // Rohdaten (rawTeamData) erneut verwendet, statt eine leere/hinweis-only ICS zu erzeugen.
  if (club.config.legacyRootOutput) {
    for (const [teamId, data] of rawTeamData.entries()) {
      const { team, matches, homeMatches, awayMatches, details } = data;
      const legacyVariants = {
        all: matches,
        home: homeMatches,
        away: awayMatches,
      };
      for (const [kind, ms] of Object.entries(legacyVariants)) {
        if (!ms.length) {
          console.warn(`[WARN] Keine Alt-Pfad-ICS für Team ${teamId}, Typ ${kind} (keine Spiele)`);
          continue;
        }
        const newUrl = `${baseUrl}${teamId}_${kind}.ics`;
        const legacyIcs = await generateICS(ms, details, teamId, kind, team.name, { newUrl });
        if (legacyIcs) {
          saveICS(teamId, kind, legacyIcs);
          console.log(`[DEBUG] Alt-Pfad-ICS gespeichert: ${teamId}_${kind}.ics`);
        } else {
          console.warn(`[WARN] Keine Alt-Pfad-ICS für Team ${teamId}, Typ ${kind}`);
        }
      }
    }

    fs.writeFileSync(path.join(generatedRootDir, 'metadata.json'), JSON.stringify(meta, null, 2));
    genHTML(theme, club.config.legal || {}, {
      outputDir: generatedRootDir,
      baseUrl: PORTAL_BASE_URL,
      migrationNotice: { newBasePath: `/${bundesland}/${club.slug}/` },
    });
  }

  return { bundesland, meta };
}

async function updateAll() {
  const clubsRootDir = process.env.BBB_CLUBS_DIR || path.resolve(__dirname, '../clubs');
  const generatedRootDir = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');

  const clubs = loadClubs(clubsRootDir);
  if (clubs.length === 0) {
    console.error('[ERROR] Keine Clubs unter', clubsRootDir, 'gefunden');
    return;
  }

  for (const club of clubs) {
    sanitizeSlug(club.slug); // wirft bei ungültigem Slug
    await updateClub(club, generatedRootDir);
  }
}

module.exports = { getTeams, updateAll, updateClub, mapMatches, computeSpotlight };

if (require.main === module) {
  updateAll();
}
