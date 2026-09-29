'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeSlug } = require('./storage');
const { bundeslandName, BUNDESWEIT } = require('./verbandMapping');
const { buildLigaIndex } = require('./wamCache');
const { buildBundPage, buildLandPage, buildPortalLegalPages } = require('./generateHTML');

const byName = (a, b) => a.localeCompare(b, 'de');

function clubDisplayName(club) {
  return club.config.name || club.config.legal?.operator || club.slug;
}

// Relativer Link auf die Club-Seite. fromRegion: Region der aufrufenden Land-Seite;
// null = Bund-Seite (generated/index.html).
function clubHref(fromRegion, bundesland, slug) {
  if (fromRegion === null) return `${bundesland}/${slug}/index.html`;
  return fromRegion === bundesland ? `${slug}/index.html` : `../${bundesland}/${slug}/index.html`;
}

// Regionen alphabetisch nach Anzeigename, 'bundesweit' immer zuletzt.
function compareRegions(a, b) {
  if (a.slug === BUNDESWEIT) return 1;
  if (b.slug === BUNDESWEIT) return -1;
  return byName(a.name, b.name);
}

// Sammelt die Ligen (nur echte Ligen mit Tabelle) aller Clubs einer Region, dedupliziert über
// die ligaId: zwei Clubs in derselben Liga ergeben EINE Tabelle (letzter Club gewinnt).
function collectLigen(regionResults) {
  const ligen = new Map();
  for (const { meta } of regionResults) {
    for (const team of meta) {
      for (const comp of team.competitions || []) {
        if (!comp.isLiga || !Array.isArray(comp.table)) continue;
        ligen.set(String(comp.ligaId), { ligaId: String(comp.ligaId), liganame: comp.liganame, table: comp.table });
      }
    }
  }
  return ligen;
}

// teamId → { bundesland, slug } über alle Clubs, um Tabellenzeilen auf Club-Seiten zu verlinken.
function buildTeamIndex(results) {
  const index = new Map();
  for (const { club, bundesland, meta } of results) {
    for (const team of meta) index.set(String(team.teamId), { bundesland, slug: club.slug });
  }
  return index;
}

// isOwn ist perspektivabhängig (bezieht sich auf das abfragende Team) und wird verworfen;
// stattdessen gilt: Zeile gehört zu einem eingebundenen Team → hervorgehoben und verlinkt.
function decorateTable(table, teamIndex, fromRegion) {
  return table.map(({ isOwn, ...row }) => {
    const own = row.teamId != null ? teamIndex.get(String(row.teamId)) : undefined;
    return { ...row, isOwn: Boolean(own), href: own ? clubHref(fromRegion, own.bundesland, own.slug) : null };
  });
}

// Gruppiert Ligen nach Ebene (Verband → Bezirk → Kreis). Ohne Index (kein/veralteter Cache
// oder Region 'bundesweit') eine flache, alphabetische Liste ohne Überschrift. Ligen ohne
// Cache-Eintrag landen unter "Weitere Ligen"; sind ALLE unbekannt, entfällt die Überschrift.
function groupLigen(ligen, ligaIndex) {
  const list = [...ligen.values()].sort((a, b) => byName(a.liganame, b.liganame));
  if (!ligaIndex || ligaIndex.size === 0) return [{ heading: null, ligen: list }];

  const groups = new Map();
  for (const liga of list) {
    const meta = ligaIndex.get(String(liga.ligaId));
    let key; let order; let heading;
    if (!meta) { key = 'other'; order = 9; heading = 'Weitere Ligen'; }
    else if (meta.skEbeneId === 0) { key = 'verband'; order = 0; heading = 'Verbandsebene'; }
    else if (meta.skEbeneId === 1) { key = `bezirk-${meta.bezirknr}`; order = 1; heading = `Bezirk ${meta.bezirkName}`; }
    else { key = `kreis-${meta.bezirknr}-${meta.kreisnr}`; order = 2; heading = `${meta.bezirkName} · ${meta.kreisname}`; }
    if (!groups.has(key)) groups.set(key, { order, heading, ligen: [] });
    groups.get(key).ligen.push(liga);
  }

  const sorted = [...groups.values()].sort((a, b) => a.order - b.order || byName(a.heading, b.heading));
  if (sorted.length === 1 && sorted[0].order === 9) return [{ heading: null, ligen: sorted[0].ligen }];
  return sorted.map(({ heading, ligen: l }) => ({ heading, ligen: l }));
}

function writePage(filePath, html) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, 'utf8');
}

// results: [{ club, bundesland, meta }] aus updateAll(). Schreibt generated/index.html (Bund),
// generated/<region>/index.html (Land, inkl. bundesweit) und die Portal-Legal-Seiten.
// Clubs ohne Team-Daten (meta leer) werden nicht aufgelistet (ADR-020).
function aggregatePages(results, { generatedRootDir, portalLegal, wamCache = null, wamCacheStale = false }) {
  const usable = results.filter(r => r.meta.length > 0);
  for (const r of results) {
    if (r.meta.length === 0) console.warn(`[WARN] Club ${r.club.slug} hat keine Team-Daten — wird auf den Portal-Seiten nicht aufgelistet`);
  }

  let ligaIndex = null;
  if (!wamCache) console.warn('[WARN] Kein WAM-Cache vorhanden — Land-Seiten ohne Ebenen-Gruppierung');
  else if (wamCacheStale) console.warn('[WARN] WAM-Cache ist veraltet — Land-Seiten ohne Ebenen-Gruppierung');
  else ligaIndex = buildLigaIndex(wamCache);

  const teamIndex = buildTeamIndex(usable);
  const byRegion = new Map();
  for (const r of usable) {
    if (!byRegion.has(r.bundesland)) byRegion.set(r.bundesland, []);
    byRegion.get(r.bundesland).push(r);
  }

  const regions = [...byRegion.keys()]
    .map(slug => ({ slug: sanitizeSlug(slug), name: bundeslandName(slug) }))
    .sort(compareRegions);

  const bundRegions = [];
  for (const { slug, name } of regions) {
    const regionResults = byRegion.get(slug).slice().sort((a, b) => byName(clubDisplayName(a.club), clubDisplayName(b.club)));
    const ligen = collectLigen(regionResults);
    for (const l of ligen.values()) l.table = decorateTable(l.table, teamIndex, slug);

    const landRegion = {
      slug, name,
      clubs: regionResults.map(r => ({ name: clubDisplayName(r.club), href: clubHref(slug, slug, r.club.slug) })),
      groups: groupLigen(ligen, slug === BUNDESWEIT ? null : ligaIndex),
    };
    writePage(path.join(generatedRootDir, slug, 'index.html'), buildLandPage(landRegion, regions, portalLegal));

    bundRegions.push({
      slug, name, ligaCount: ligen.size,
      clubs: regionResults.map(r => ({ name: clubDisplayName(r.club), href: clubHref(null, slug, r.club.slug) })),
    });
  }

  const showMigrationBanner = usable.some(r => r.club.config.legacyRootOutput);
  writePage(path.join(generatedRootDir, 'index.html'), buildBundPage({ regions: bundRegions, showMigrationBanner }, portalLegal));

  const legalPages = buildPortalLegalPages(portalLegal, regions);
  for (const [name, html] of Object.entries(legalPages)) {
    writePage(path.join(generatedRootDir, `${name}.html`), html);
  }

  return { regionCount: regions.length, clubCount: usable.length, skippedClubs: results.length - usable.length };
}

module.exports = { aggregatePages, _testExports: { groupLigen, clubHref, decorateTable, collectLigen } };
