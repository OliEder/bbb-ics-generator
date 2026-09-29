const { fetchTeamMatches, fetchMatchInfo, fetchClubTeams, fetchLeagueTable, fetchTournamentRounds, mapWithConcurrency } = require('./apiClient');
const { generateICS } = require('./icsGenerator');
const { saveICS, saveTeamsCache, loadTeamsCache, sanitizeSlug } = require('./storage');
const { genHTML } = require('./generateHTML');
const { loadClubs } = require('./clubs');
const { deriveClubBundesland } = require('./verbandMapping');
const { loadPortalConfig } = require('./portalConfig');
const { loadWamCache } = require('./wamCache');
const { aggregatePages } = require('./aggregatePages');
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
  const { teams: cached, stale } = loadTeamsCache(clubId);
  if (cached && !stale) {
    console.log(`[DEBUG] Teams aus Cache geladen (${cached.length} Teams)`);
    return cached;
  }
  console.log(`[DEBUG] Lade Teams von API für Club ${clubId}...`);
  const fresh = await fetchClubTeams(clubId);
  if (fresh && fresh.length > 0) {
    saveTeamsCache(fresh, clubId);
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

// Ermittelt das Theme eines Clubs (Farben/Logo). Fällt auf den Standard-Fibalon-Look
// zurück, wenn der Club keine eigenen Overrides in config.json hinterlegt hat.
function resolveTheme(club, teams) {
  // All teamPermanentIds for this club share the same club logo at this endpoint.
  // Using teams[0] is safe; any team ID resolves to the club crest.
  const firstTeamLogoUrl = teams.length > 0
    ? `${BBB_MEDIA_BASE}/${teams[0].id}/logo`
    : null;

  return {
    primary:  club.config.theme?.primary  || '#004174',
    accent:   club.config.theme?.accent   || '#009ef3',
    logoUrl:  club.config.theme?.logoUrl  || firstTeamLogoUrl,
    cupColor: club.config.cupColor        || '#7c3aed',
  };
}

// Holt für ein einzelnes Team alle Rohdaten (Spiele, Details, Home/Away-Filter) sowie
// die daraus abgeleiteten, für metadata.json aufbereiteten Felder. Gibt null zurück,
// wenn das Team keine Spiele hat (Aufrufer überspringt es dann).
async function fetchTeamData(team) {
  console.log(`[DEBUG] Starte Update für Team ${team.id} (${team.name})`);

  const { matches, gender: teamGender } = await fetchTeamMatches(team.id);
  console.log(`[DEBUG] API-Matches: ${matches.length}`);

  if (!Array.isArray(matches) || matches.length === 0) {
    console.warn(`[WARN] Keine Matches für Team ${team.id}`);
    return null;
  }

  // Detailinfos für jedes Match holen (parallel, mit Concurrency-Limit)
  const detailsList = await mapWithConcurrency(matches, MATCH_INFO_CONCURRENCY, m => fetchMatchInfo(m.matchId));
  const details = {};
  matches.forEach((m, i) => { details[m.matchId] = detailsList[i]; });

  const homeMatches = matches.filter(m => Number(m.homeTeam.teamPermanentId) === Number(team.id));
  const awayMatches = matches.filter(m => Number(m.guestTeam.teamPermanentId) === Number(team.id));

  const seasonMatches = matches
    .filter(m => m.ligaData?.seasonId === CURRENT_SEASON)
    .sort((a, b) => {
      const da = (a.kickoffDate || '') + (a.kickoffTime || '');
      const db = (b.kickoffDate || '') + (b.kickoffTime || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });

  const mappedMatches = mapMatches(seasonMatches, team.id, details);

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
        const table = await fetchLeagueTable(comp.ligaId, team.id);
        return { ...comp, table: table || null, bracket: null };
      } else {
        const bracket = await fetchTournamentRounds(comp.ligaId);
        return { ...comp, table: null, bracket: bracket || null };
      }
    })
  );

  const verbandId = firstVerbandId(matches);

  const metaEntry = {
    teamId:         team.id,
    teamName:       team.name,
    ageGroup:       team.ageGroup,
    gender:         teamGender || team.gender,
    lastUpdate:     new Date().toISOString(),
    matchCount:     matches.length,
    homeMatchCount: homeMatches.length,
    awayMatchCount: awayMatches.length,
    logoUrl:        `${BBB_MEDIA_BASE}/${team.id}/logo`,
    matches:          mappedMatches,
    spotlightMatches: computeSpotlight(mappedMatches),
    competitions,
  };

  return { raw: { team, matches, homeMatches, awayMatches, details, teamGender }, metaEntry, verbandId };
}

// Erzeugt und speichert die ICS-Dateien für alle 3 Varianten (all/home/away) eines Teams.
// Wird sowohl für den neuen Club-Pfad (kein migrationNotice) als auch für den
// Alt-Pfad (mit migrationNotice) verwendet — der einzige Unterschied zwischen beiden
// Aufrufstellen ist outputDir und makeMigrationNotice (je Variante ggf. eine eigene
// newUrl, z.B. "..._home.ics" für die Heim-Variante statt immer "..._all.ics").
// Eine Variante ohne Spiele wird übersprungen, bevor generateICS/migrationNotice ins
// Spiel kommen — sonst würde der Alt-Pfad bei z.B. 0 Auswärtsspielen eine
// hinweis-only-ICS erzeugen, wo bisher (bewusst) gar keine Datei entstand.
async function writeIcsVariants(teamId, teamName, matches, homeMatches, awayMatches, details, outputDir, makeMigrationNotice) {
  const variants = { all: matches, home: homeMatches, away: awayMatches };
  for (const [kind, ms] of Object.entries(variants)) {
    if (!ms.length) {
      console.warn(`[WARN] Keine ICS für Team ${teamId}, Typ ${kind} (keine Spiele)`);
      continue;
    }
    console.log(`[DEBUG] Erzeuge ICS für Team ${teamId}, Typ ${kind}, Spiele: ${ms.length}`);
    const migrationNotice = makeMigrationNotice ? makeMigrationNotice(kind) : null;
    const ics = await generateICS(ms, details, teamId, kind, teamName, migrationNotice);
    console.log(`[DEBUG] ICS erzeugt: Länge ${ics?.length || 0}`);
    if (ics) {
      saveICS(teamId, kind, ics, outputDir);
      console.log(`[DEBUG] ICS gespeichert: ${teamId}_${kind}.ics${outputDir ? ` (${outputDir})` : ''}`);
    } else {
      console.warn(`[WARN] Keine ICS für Team ${teamId}, Typ ${kind}`);
    }
  }
}

// Schreibt die neuen, Club-spezifischen ICS-Dateien (kein migrationNotice) für alle
// Teams eines Clubs nach clubOutputDir.
async function writeClubIcs(meta, rawTeamData, clubOutputDir) {
  for (const entry of meta) {
    const data = rawTeamData.get(entry.teamId);
    await writeIcsVariants(entry.teamId, entry.teamName, data.matches, data.homeMatches, data.awayMatches, data.details, clubOutputDir, null);
  }
}

// Alt-Pfad-Duplikat NUR für Clubs, die vor der Multi-Club-Migration bereits existierten
// und echte Kalender-Abonnenten haben. Die Alt-Pfad-ICS müssen die ECHTEN Spiele
// enthalten (nicht nur den Migrationshinweis) — deshalb werden hier dieselben
// Rohdaten (rawTeamData) erneut verwendet, statt eine leere/hinweis-only ICS zu erzeugen.
// Seit Plan B ausschließlich ICS: kein Alt-Pfad-HTML und kein Root-metadata.json mehr —
// generated/index.html ist die Bund-Seite (ADR-020).
async function writeLegacyOutput(rawTeamData, baseUrl) {
  for (const [teamId, data] of rawTeamData.entries()) {
    const { team, matches, homeMatches, awayMatches, details } = data;
    await writeIcsVariants(teamId, team.name, matches, homeMatches, awayMatches, details, null, kind => ({
      newUrl: `${baseUrl}${teamId}_${kind}.ics`,
    }));
  }
}

// Verarbeitet einen einzelnen Club: holt Teams + Spiele, erzeugt die neuen
// (nach Bundesland/Club verschachtelten) ICS-/HTML-Dateien, und — nur für Clubs mit
// legacyRootOutput: true — zusätzlich ein Alt-Pfad-Duplikat direkt unter generatedRootDir
// (mit Migrationshinweis), das die ECHTEN Spieldaten behält (nicht nur den Hinweis-Event) — nur ICS, kein HTML.
async function updateClub(club, generatedRootDir) {
  const teams = await getTeams(club.config.clubId);
  const theme = resolveTheme(club, teams);

  const meta = [];
  // Rohdaten je Team (matches ungefiltert + details), für die eventuelle
  // Alt-Pfad-Regenerierung mit echten Spielen weiter unten.
  const rawTeamData = new Map();
  const teamVerbandIds = [];

  for (const t of teams) {
    try {
      const result = await fetchTeamData(t);
      if (!result) continue;
      rawTeamData.set(t.id, result.raw);
      teamVerbandIds.push(result.verbandId);
      meta.push(result.metaEntry);
    } catch (e) {
      console.error(`Fehler beim Update Team ${t.id}:`, e.stack || e);
    }
  }

  const bundesland = sanitizeSlug(deriveClubBundesland(teamVerbandIds));
  const clubOutputDir = path.join(generatedRootDir, bundesland, club.slug);
  const baseUrl = `${PORTAL_BASE_URL}${bundesland}/${club.slug}/`;

  await writeClubIcs(meta, rawTeamData, clubOutputDir);

  fs.mkdirSync(clubOutputDir, { recursive: true });
  fs.writeFileSync(path.join(clubOutputDir, 'metadata.json'), JSON.stringify(meta, null, 2));
  genHTML(theme, club.config.legal || {}, { outputDir: clubOutputDir, baseUrl });

  if (club.config.legacyRootOutput) {
    await writeLegacyOutput(rawTeamData, baseUrl);
  }

  return { bundesland, meta };
}

async function updateAll() {
  const clubsRootDir = process.env.BBB_CLUBS_DIR || path.resolve(__dirname, '../clubs');
  const generatedRootDir = process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');

  const clubs = loadClubs(clubsRootDir);
  if (clubs.length === 0) {
    console.error('[ERROR] Keine Clubs unter', clubsRootDir, 'gefunden');
    return { results: [], failures: [] };
  }

  // Fehlerisolation (ADR-022): ein fehlschlagender Club reißt weder die übrigen Clubs
  // noch die Aggregation mit. Fehler werden gesammelt; der CLI-Einstieg setzt den Exitcode.
  const results = [];
  const failures = [];
  for (const club of clubs) {
    try {
      sanitizeSlug(club.slug); // wirft bei ungültigem Slug
      const { bundesland, meta } = await updateClub(club, generatedRootDir);
      results.push({ club, bundesland, meta });
    } catch (err) {
      console.error(`[ERROR] Club ${club.slug} fehlgeschlagen:`, err.stack || err);
      failures.push({ slug: club.slug, error: err.message });
    }
  }

  // Bund-/Land-/Portal-Legal-Seiten (ADR-017). Ein Fehler hier (z.B. fehlende portal.json)
  // verhindert nur die Portal-Seiten, nicht die bereits geschriebene Club-Ausgabe.
  try {
    const portalLegal = loadPortalConfig();
    const { cache, stale } = loadWamCache();
    aggregatePages(results, { generatedRootDir, portalLegal, wamCache: cache, wamCacheStale: stale });
  } catch (err) {
    console.error('[ERROR] Portal-Seiten (Bund/Land) nicht erzeugt:', err.message);
    failures.push({ slug: '(portal)', error: err.message });
  }

  return { results, failures };
}

module.exports = { getTeams, updateAll, updateClub, mapMatches, computeSpotlight };

if (require.main === module) {
  updateAll()
    .then(({ failures }) => {
      if (failures.length > 0) {
        console.error(`[ERROR] ${failures.length} Fehler beim Update: ${failures.map(f => f.slug).join(', ')}`);
        process.exitCode = 1;
      }
    })
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    });
}
