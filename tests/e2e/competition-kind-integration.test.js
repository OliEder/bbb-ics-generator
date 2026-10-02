'use strict';

// Multi-Club-Orchestrierungstest (ADR-019, 10-Club-Fixture) für die Wettbewerbsart-Erkennung (ADR-028):
// Liga-Klassen ohne "liga" im Namen (Bezirksklasse/Kreisklasse) werden über crossTableExists als
// Liga erkannt, Pokale bleiben Pokale.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRun, teamIdFor, clubSlug, FIXTURE_PAST_SEASON_ID } = require('../fixtures/multiClubFixture');

const read = file => readFileSync(file, 'utf8');
const readMeta = (run, bundesland, clubId) =>
  JSON.parse(read(join(run.dir, bundesland, clubSlug(clubId), 'metadata.json')));
const teamPage = (run, bundesland, clubId) =>
  read(join(run.dir, bundesland, clubSlug(clubId), 'teams', `${teamIdFor(clubId)}.html`));

const competitionOverrides = {
  '3002': { liganame: 'OPF Bezirksklasse Damen 2026/27', crossTableExists: true },   // Bayern, Klasse (geteilt)
  '3010': { liganame: 'OPF Bezirksklasse Damen 2026/27', crossTableExists: true },   // Bayern, selbe Klasse
  '3003': { liganame: 'OPF Bezirkspokal Herren 26-27', crossTableExists: false },    // Berlin, Pokal
  '3004': { liganame: 'Kreisklasse Herren A', crossTableExists: false },             // Niedersachsen, unbekannt → Pokal
};

test('Bezirksklasse (ohne "liga") wird als Liga mit Tabelle gespeichert und gerendert; Pokale bleiben Bracket', async () => {
  const run = createRun({ competitionOverrides });
  try {
    const { failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures, []);

    // Klassen-Club: isLiga=true mit Tabelle, kein Bracket, Spiel ohne Pokal-Kennzeichen
    const klasse = readMeta(run, 'bayern', '3002')[0];
    assert.equal(klasse.competitions.length, 1);
    assert.equal(klasse.competitions[0].liganame, 'OPF Bezirksklasse Damen 2026/27');
    assert.equal(klasse.competitions[0].isLiga, true);
    assert.ok(Array.isArray(klasse.competitions[0].table) && klasse.competitions[0].table.length > 0);
    assert.equal(klasse.competitions[0].bracket, null);
    assert.equal(klasse.matches[0].isCup, false);

    const klassePage = teamPage(run, 'bayern', '3002');
    assert.ok(klassePage.includes('class="standings-table"'));
    assert.ok(!klassePage.includes('class="bracket-round"'));
    assert.ok(!klassePage.includes('<span class="badge badge--cup">H</span><div class="schedule-row-content">'));

    // Pokal-Club
    const pokal = readMeta(run, 'berlin', '3003')[0];
    assert.equal(pokal.competitions[0].isLiga, false);
    assert.equal(pokal.competitions[0].table, null);
    assert.ok(Array.isArray(pokal.competitions[0].bracket));
    assert.equal(pokal.matches[0].isCup, true);
    const pokalPage = teamPage(run, 'berlin', '3003');
    assert.ok(pokalPage.includes('class="bracket-round"'));
    assert.ok(!pokalPage.includes('class="standings-table"'));

    // Klasse mit crossTableExists=false → Pokal-Verhalten
    const unbekannt = readMeta(run, 'niedersachsen', '3004')[0];
    assert.equal(unbekannt.competitions[0].isLiga, false);
    assert.ok(Array.isArray(unbekannt.competitions[0].bracket));

    // Land-Seite Bayern listet die Bezirksklasse-Tabelle (nur isLiga-Tabellen), Berlin den Pokal nicht
    const bayern = read(run.paths.land('bayern'));
    assert.ok(bayern.includes('aria-label="OPF Bezirksklasse Damen 2026/27 Tabelle"'));
    const berlin = read(run.paths.land('berlin'));
    assert.ok(!berlin.includes('Bezirkspokal Herren 26-27 Tabelle'));
  } finally {
    run.cleanup();
  }
});

test('Archiv: Vorsaison-Wettbewerb "Bezirksklasse" wird mit isLiga=true und Tabelle archiviert', async () => {
  const run = createRun({ competitionOverrides, pastSeason: true });
  try {
    const { failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures, []);
    const archive = JSON.parse(read(run.paths.archive('3002', FIXTURE_PAST_SEASON_ID)));
    const comp = archive.teams[teamIdFor('3002')].competitions[0];
    assert.equal(comp.isLiga, true);
    assert.ok(Array.isArray(comp.table));
    assert.equal(comp.bracket, null);
    assert.equal(archive.teams[teamIdFor('3002')].matches[0].isCup, false);
  } finally {
    run.cleanup();
  }
});
