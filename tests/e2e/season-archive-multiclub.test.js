'use strict';

// Multi-Club-Orchestrierungstest für die Saison-Archivierung (CLAUDE.md-Testpolicy, ADR-019):
// 10 Clubs aus 8 Bundesländern + 1 bundesweiter Club (tests/fixtures/multiClubFixture.js).
// Das Archiv ist pro Club gescoped: generated/archive/<clubId>/<season>.json (ADR-026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  createRun, CLUBS, clubSlug, teamIdFor, FIXTURE_SEASON_ID, FIXTURE_PAST_SEASON_ID,
} = require('../fixtures/multiClubFixture');

const PAST = FIXTURE_PAST_SEASON_ID;
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const MARKER = '2000-01-01T00:00:00.000Z';

// Setzt lastSeenAt aller Team-Einträge eines Club-Archivs auf einen Marker, um danach
// feststellen zu können, ob ein Folgelauf den Eintrag neu geschrieben hat.
function markArchive(run, clubId) {
  const file = run.paths.archive(clubId, PAST);
  const data = readJson(file);
  for (const entry of Object.values(data.teams)) entry.lastSeenAt = MARKER;
  writeFileSync(file, JSON.stringify(data));
}

test('Fixture erfüllt die Multi-Club-Testpolicy (≥9 Clubs, ≥6 Bundesländer, ≥1 bundesweit)', () => {
  assert.ok(CLUBS.length >= 9);
  const laender = new Set(CLUBS.map(c => c.sourceSlug).filter(s => s !== 'bundesweit'));
  assert.ok(laender.size >= 6);
  assert.ok(CLUBS.some(c => c.sourceSlug === 'bundesweit'));
  assert.equal(PAST, FIXTURE_SEASON_ID - 1);
});

test('updateAll: jeder der 10 Clubs bekommt ein eigenes Archiv, das nur eigene Teams enthält', async () => {
  const run = createRun({ pastSeason: true });
  try {
    const { results, failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures, []);
    assert.equal(results.length, CLUBS.length);

    // Genau ein Archiv-Verzeichnis pro Club, kein globales <season>.json mehr
    const archiveRoot = join(run.dir, 'archive');
    assert.deepEqual(readdirSync(archiveRoot).sort(), CLUBS.map(c => c.clubId).sort());
    assert.equal(existsSync(join(archiveRoot, `${PAST}.json`)), false, 'kein clubübergreifendes Archiv');

    for (const club of CLUBS) {
      const file = run.paths.archive(club.clubId, PAST);
      assert.ok(existsSync(file), `Archiv für Club ${club.clubId} fehlt`);
      const archive = readJson(file);
      assert.equal(archive.season, PAST);
      assert.equal(archive.clubId, club.clubId);
      // Kontaminationsprüfung: ausschließlich das Team des eigenen Clubs (teamId 9<clubId>)
      assert.deepEqual(Object.keys(archive.teams), [teamIdFor(club.clubId)], `Club ${club.clubId} enthält fremde Teams`);
      const entry = archive.teams[teamIdFor(club.clubId)];
      assert.equal(entry.status, 'provisional');
      assert.equal(entry.matches.length, 1);
      assert.equal(entry.matches[0].opponent, `Vorsaison-Gegner ${club.clubId}`);
      // Die laufende Saison wird nicht archiviert
      assert.equal(existsSync(run.paths.archive(club.clubId, FIXTURE_SEASON_ID)), false);
    }

    // Clubs verschiedener Bundesländer und der bundesweite Club haben je eigene Archive
    const bundeslaender = new Map(results.map(r => [r.club.config.clubId, r.bundesland]));
    assert.equal(bundeslaender.get('3009'), 'bundesweit');
    assert.equal(bundeslaender.get('3002'), 'bayern');
    assert.equal(bundeslaender.get('3010'), 'bayern');
    assert.ok(new Set(bundeslaender.values()).size >= 7);
  } finally {
    run.cleanup();
  }
});

test('updateAll: Archiv-Tab auf jeder Club-Team-Seite (generated/<bundesland>/<club>/teams/) zeigt nur das eigene Archiv', async () => {
  const run = createRun({ pastSeason: true });
  try {
    const { results } = await run.cronModule.updateAll();
    for (const { club, bundesland } of results) {
      const clubId = club.config.clubId;
      const teamId = teamIdFor(clubId);
      const page = readFileSync(join(run.dir, bundesland, clubSlug(clubId), 'teams', `${teamId}.html`), 'utf8');
      assert.ok(page.includes(`tab-${teamId}-archive`), `Archiv-Tab fehlt für Club ${clubId}`);
      assert.ok(page.includes(`Vorsaison-Gegner ${clubId}`));
      for (const other of CLUBS.filter(c => c.clubId !== clubId)) {
        assert.ok(!page.includes(`Vorsaison-Gegner ${other.clubId}`), `Club ${clubId} zeigt Archiv von Club ${other.clubId}`);
      }
    }
  } finally {
    run.cleanup();
  }
});

test('updateAll: zweiter Lauf aktualisiert die Archive (Rolling-Update) statt sie zu vermischen; dritter Lauf ohne Vorsaison → final', async () => {
  const run = createRun({ pastSeason: true });
  try {
    await run.cronModule.updateAll();
    for (const club of CLUBS) markArchive(run, club.clubId);

    // Lauf 2: Vorsaison wird weiter geliefert → Eintrag neu geschrieben, weiterhin provisional
    const second = await run.rerun({ pastSeason: true }).updateAll();
    assert.deepEqual(second.failures, []);
    for (const club of CLUBS) {
      const archive = readJson(run.paths.archive(club.clubId, PAST));
      assert.deepEqual(Object.keys(archive.teams), [teamIdFor(club.clubId)], `Club ${club.clubId} nach Lauf 2 vermischt`);
      const entry = archive.teams[teamIdFor(club.clubId)];
      assert.equal(entry.status, 'provisional');
      assert.notEqual(entry.lastSeenAt, MARKER, `Archiv von Club ${club.clubId} wurde nicht aktualisiert`);
    }

    // Lauf 3: API liefert die Vorsaison nicht mehr → Eintrag wird final, Daten bleiben
    const third = await run.rerun({}).updateAll();
    assert.deepEqual(third.failures, []);
    for (const club of CLUBS) {
      const archive = readJson(run.paths.archive(club.clubId, PAST));
      assert.deepEqual(Object.keys(archive.teams), [teamIdFor(club.clubId)]);
      const entry = archive.teams[teamIdFor(club.clubId)];
      assert.equal(entry.status, 'final');
      assert.equal(entry.matches[0].opponent, `Vorsaison-Gegner ${club.clubId}`);
    }
  } finally {
    run.cleanup();
  }
});

test('updateAll: ein ausgefallener Club erzeugt kein Archiv, alle anderen schon', async () => {
  const run = createRun({ pastSeason: true, failClubIds: ['3003'] });
  try {
    const { failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures.map(f => f.slug), [clubSlug('3003')]);
    assert.equal(existsSync(join(run.dir, 'archive', '3003')), false);
    for (const club of CLUBS.filter(c => c.clubId !== '3003')) {
      assert.ok(existsSync(run.paths.archive(club.clubId, PAST)), `Archiv für Club ${club.clubId} fehlt`);
    }
  } finally {
    run.cleanup();
  }
});

test('updateAll: Club kippt von bayern nach bundesweit — der Archivpfad bleibt clubId-stabil', async () => {
  const run = createRun({ pastSeason: true });
  try {
    const first = await run.cronModule.updateAll();
    assert.equal(first.results.find(r => r.club.config.clubId === '3002').bundesland, 'bayern');
    const archivePath = run.paths.archive('3002', PAST);
    const before = readFileSync(archivePath, 'utf8');

    // Lauf 2: API-Ausfall auf Team-Ebene (keine Spiele) → keine Team-Daten → 'bundesweit'.
    // Das Archiv bleibt unverändert an seinem Platz, es entsteht kein zweites.
    const second = await run.rerun({ pastSeason: true, emptyMatchClubIds: ['3002'] }).updateAll();
    const r2 = second.results.find(r => r.club.config.clubId === '3002');
    assert.equal(r2.bundesland, 'bundesweit');
    assert.deepEqual(r2.meta, []);
    assert.equal(readFileSync(archivePath, 'utf8'), before, 'Archiv darf bei Datenausfall nicht verändert werden');
    assert.deepEqual(readdirSync(join(run.dir, 'archive')).sort(), CLUBS.map(c => c.clubId).sort());

    // Lauf 3: Teams spielen jetzt bundesweit (verbandId 100) → Bundesland 'bundesweit', aber das
    // Archiv wird weiterhin unter archive/3002/ fortgeschrieben und auf der neuen Club-Seite gezeigt.
    markArchive(run, '3002');
    const third = await run.rerun({ pastSeason: true, verbandOverrides: { '3002': 100 } }).updateAll();
    const r3 = third.results.find(r => r.club.config.clubId === '3002');
    assert.equal(r3.bundesland, 'bundesweit');
    const archive = readJson(archivePath);
    assert.notEqual(archive.teams[teamIdFor('3002')].lastSeenAt, MARKER, 'Archiv am clubId-Pfad fortgeschrieben');
    assert.deepEqual(Object.keys(archive.teams), [teamIdFor('3002')]);
    assert.deepEqual(readdirSync(join(run.dir, 'archive')).sort(), CLUBS.map(c => c.clubId).sort());
    const page = readFileSync(join(run.dir, 'bundesweit', clubSlug('3002'), 'teams', `${teamIdFor('3002')}.html`), 'utf8');
    assert.ok(page.includes(`tab-${teamIdFor('3002')}-archive`), 'Archiv-Tab auch unter dem neuen Bundesland-Pfad');
  } finally {
    run.cleanup();
  }
});

test('updateAll: Archiv-Fehler eines Clubs beeinträchtigt andere Clubs nicht und verwirft die Club-Seite nicht', async () => {
  const run = createRun({ pastSeason: true });
  try {
    await run.cronModule.updateAll();
    for (const club of CLUBS) markArchive(run, club.clubId);
    // Defekte Archivdatei bei Club 3005 → loadArchive wirft beim nächsten Lauf
    writeFileSync(run.paths.archive('3005', PAST), '{defekt');

    const { results, failures } = await run.rerun({ pastSeason: true }).updateAll();

    assert.equal(failures.length, 1);
    assert.equal(failures[0].slug, clubSlug('3005'));
    assert.match(failures[0].error, /Archiv/);
    // Die aktuelle Saison des betroffenen Clubs wird trotzdem ausgegeben
    const r = results.find(x => x.club.config.clubId === '3005');
    assert.ok(r, 'Club 3005 bleibt in results (Club-Seite, Portal-Aggregation)');
    assert.deepEqual(r.meta.map(m => String(m.teamId)), [teamIdFor('3005')]);
    assert.ok(existsSync(join(run.dir, r.bundesland, clubSlug('3005'), 'teams', `${teamIdFor('3005')}.html`)));
    // Alle anderen Clubs: Archiv regulär aktualisiert
    for (const club of CLUBS.filter(c => c.clubId !== '3005')) {
      const entry = readJson(run.paths.archive(club.clubId, PAST)).teams[teamIdFor(club.clubId)];
      assert.notEqual(entry.lastSeenAt, MARKER, `Archiv von Club ${club.clubId} wurde nicht aktualisiert`);
    }
  } finally {
    run.cleanup();
  }
});
