'use strict';

// Legacy-Pfad nur ICS (ADR-020) und Fehlerisolation pro Club (ADR-022).
// Nutzt die ADR-016-konforme 10-Club-Fixture. Portal-Seiten selbst werden in
// portal-aggregation-integration.test.js geprüft.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRun, teamIdFor } = require('../fixtures/multiClubFixture');

test('updateAll: legacyRootOutput schreibt Alt-Pfad-ICS mit echten Spielen, aber KEIN Alt-Pfad-HTML und kein Root-metadata.json', async () => {
  const run = createRun({ configOverrides: { '3001': { legacyRootOutput: true } } });
  try {
    await run.cronModule.updateAll();
    const legacyIcs = join(run.dir, `${teamIdFor('3001')}_all.ics`);
    assert.ok(existsSync(legacyIcs), 'Alt-Pfad-ICS muss bestehen bleiben');
    const content = readFileSync(legacyIcs, 'utf8');
    assert.ok(content.includes('Kalender-Abo aktualisieren'), 'Migrations-VEVENT muss enthalten sein');
    assert.ok(content.includes('Gegner'), 'echte Spiele müssen enthalten sein');
    assert.ok(!existsSync(join(run.dir, 'teams')), 'Alt-Pfad-Team-HTML (generated/teams/) darf nicht mehr entstehen');
    assert.ok(!existsSync(join(run.dir, 'metadata.json')), 'Root-metadata.json darf nicht mehr entstehen');
    assert.ok(existsSync(join(run.dir, 'baden-wuerttemberg', 'verein-3001', 'index.html')), 'neue Club-Seite bleibt bestehen');
  } finally {
    run.cleanup();
  }
});

test('updateAll: gibt { results, failures } zurück — ein Club mit API-Ausfall reißt die anderen nicht mit', async () => {
  const run = createRun({ failClubIds: ['3003'] });
  try {
    const { results, failures } = await run.cronModule.updateAll();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].slug, 'verein-3003');
    assert.match(failures[0].error, /Simulierter API-Ausfall/);
    assert.equal(results.length, 9, 'alle übrigen 9 Clubs müssen verarbeitet werden');
    assert.ok(!results.some(r => r.club.slug === 'verein-3003'));
    for (const r of results) {
      assert.ok(existsSync(join(run.dir, r.bundesland, r.club.slug, 'metadata.json')), `${r.club.slug}: metadata.json fehlt`);
      assert.ok(Array.isArray(r.meta) && r.meta.length === 1);
    }
  } finally {
    run.cleanup();
  }
});

test('updateAll: ohne Fehler ist failures leer und results enthält alle 10 Clubs', async () => {
  const run = createRun();
  try {
    const { results, failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures, []);
    assert.equal(results.length, 10);
  } finally {
    run.cleanup();
  }
});

const { spawnSync } = require('node:child_process');
const REPO_ROOT = join(__dirname, '..', '..');
const PRELOAD = join(REPO_ROOT, 'tests', 'fixtures', 'cronPreload.js');

function runCli(failClubs) {
  const run = createRun(); // legt Verzeichnisse an und setzt die BBB_*-Variablen (vom Kindprozess geerbt)
  try {
    return spawnSync(process.execPath, ['-r', PRELOAD, 'src/cronUpdate.js'], {
      cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, BBB_MOCK_FAIL_CLUBS: failClubs },
    });
  } finally {
    run.cleanup();
  }
}

test('CLI: Exitcode 1, wenn mindestens ein Club fehlschlägt (Deployment läuft trotzdem, Job wird rot)', () => {
  const res = runCli('3003');
  assert.equal(res.status, 1, res.stderr.slice(-500));
  assert.match(res.stderr, /verein-3003/);
});

test('CLI: Exitcode 0 ohne Fehler', () => {
  const res = runCli('');
  assert.equal(res.status, 0, res.stderr.slice(-500));
});
