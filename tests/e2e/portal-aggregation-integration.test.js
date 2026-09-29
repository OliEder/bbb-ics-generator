'use strict';

// Multi-Club-Orchestrierungstest (ADR-019): 10 Clubs / 8 Bundesländer / 1 bundesweit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRun, SHARED_LIGA_NAME, teamIdFor } = require('../fixtures/multiClubFixture');

const BUNDESLAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Hessen', 'Niedersachsen', 'Nordrhein-Westfalen', 'Saarland', 'Sachsen'];
const read = file => readFileSync(file, 'utf8');
const BANNER = '<div class="migration-banner"';

test('Bund-Seite listet alle 8 Bundesländer und den bundesweiten Block (zuletzt) mit Club-Links', async () => {
  const run = createRun();
  try {
    const { failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures, []);
    const bund = read(run.paths.bund);

    for (const name of BUNDESLAENDER) {
      assert.ok(bund.includes(`>${name}</a></h2>`), `Bund-Seite muss ${name} als Block enthalten`);
    }
    const bundesweitPos = bund.indexOf('>Bundesweite Wettbewerbe</a></h2>');
    assert.ok(bundesweitPos > 0, 'Block "Bundesweite Wettbewerbe" fehlt');
    for (const name of BUNDESLAENDER) {
      assert.ok(bund.indexOf(`>${name}</a></h2>`) < bundesweitPos, `${name} muss vor dem bundesweiten Block stehen`);
    }
    assert.ok(bund.includes('href="bayern/verein-3002/index.html"'));
    assert.ok(bund.includes('href="bayern/verein-3010/index.html"'));
    assert.ok(bund.includes('href="bundesweit/verein-3009/index.html"'));
    assert.ok(bund.includes('<h1 class="team-page-title">BBB Vereinsportal</h1>'), 'generated/index.html ist die Bund-Seite, nicht mehr eine Club-Seite');

    const order = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Hessen', 'Niedersachsen', 'Nordrhein-Westfalen', 'Saarland', 'Sachsen'].map(n => bund.indexOf(`>${n}</a></h2>`));
    assert.deepEqual(order, [...order].sort((x, y) => x - y), 'Regionen alphabetisch nach Anzeigename');

    for (const slug of ['baden-wuerttemberg', 'bayern', 'berlin', 'hessen', 'niedersachsen', 'nordrhein-westfalen', 'saarland', 'sachsen', 'bundesweit']) {
      assert.ok(existsSync(run.paths.land(slug)), `Land-Seite ${slug} fehlt`);
    }
  } finally {
    run.cleanup();
  }
});

test('Land-Seite Bayern: zwei Clubs in derselben Liga ergeben EINE Tabelle mit beiden Club-Links, Fremdteams als Text', async () => {
  const run = createRun();
  try {
    await run.cronModule.updateAll();
    const bayern = read(run.paths.land('bayern'));

    assert.equal(bayern.split(`aria-label="${SHARED_LIGA_NAME} Tabelle"`).length - 1, 1, 'genau eine offizielle Tabelle für die gemeinsame Liga');
    assert.ok(bayern.includes('<a href="verein-3002/index.html">Team 3002</a>'));
    assert.ok(bayern.includes('<a href="verein-3010/index.html">Team 3010</a>'));
    assert.ok(bayern.includes('<td>Fremdteam Gemeinsam</td>'), 'Fremdteam als reiner Text');
    assert.ok(!/<a [^>]*>Fremdteam Gemeinsam<\/a>/.test(bayern), 'Fremdteam darf nicht verlinkt sein');
    // isOwn wird neu bestimmt: beide eingebundenen Clubs hervorgehoben (2 Zeilen × 2 Tabellenansichten)
    assert.equal(bayern.split('class="standings-own"').length - 1, 4);
    assert.ok(bayern.includes('href="verein-3002/index.html"') && bayern.includes('href="verein-3010/index.html"'), 'Club-Liste verlinkt beide Vereine');
  } finally {
    run.cleanup();
  }
});

test('Land-Seite bundesweit: eigener Block mit Tabelle, ohne WAM-Cache', async () => {
  const run = createRun();
  try {
    await run.cronModule.updateAll();
    const page = read(run.paths.land('bundesweit'));
    assert.ok(page.includes('<h1 class="team-page-title">Bundesweite Wettbewerbe</h1>'));
    assert.ok(page.includes('Bundesliga Herren'));
    assert.ok(page.includes('href="verein-3009/index.html"'));
  } finally {
    run.cleanup();
  }
});

test('Migrationsbanner: erscheint mit mindestens einem legacyRootOutput-Club, nicht ohne, generisch bei mehreren', async () => {
  const none = createRun();
  try {
    await none.cronModule.updateAll();
    assert.ok(!read(none.paths.bund).includes(BANNER), 'ohne Flag kein Banner');
  } finally { none.cleanup(); }

  const one = createRun({ configOverrides: { '3001': { legacyRootOutput: true } } });
  try {
    await one.cronModule.updateAll();
    assert.ok(read(one.paths.bund).includes(BANNER), 'mit einem Flag: Banner');
  } finally { one.cleanup(); }

  const two = createRun({ configOverrides: { '3001': { legacyRootOutput: true }, '3005': { legacyRootOutput: true } } });
  try {
    await two.cronModule.updateAll();
    const bund = read(two.paths.bund);
    assert.equal(bund.split(BANNER).length - 1, 1, 'genau EIN Banner, unabhängig von der Anzahl betroffener Clubs');
    const banner = bund.match(/<div class="migration-banner"[\s\S]*?<\/div>/)[0];
    assert.ok(!banner.includes('href') && !banner.includes('verein-3001'), 'Banner ist generisch');
    assert.ok(!read(two.paths.land('bayern')).includes(BANNER), 'Banner nur auf der Bund-Seite');
  } finally { two.cleanup(); }
});

test('Legacy: Alt-Pfad-ICS bleibt, generated/index.html ist die Bund-Seite (kein Alt-Pfad-HTML)', async () => {
  const run = createRun({ configOverrides: { '3001': { legacyRootOutput: true } } });
  try {
    await run.cronModule.updateAll();
    assert.ok(existsSync(join(run.dir, `${teamIdFor('3001')}_all.ics`)));
    assert.ok(!existsSync(join(run.dir, 'teams')));
    assert.ok(!existsSync(join(run.dir, 'metadata.json')));
    assert.ok(!read(run.paths.bund).includes('class="teaser-grid"'), 'Bund-Seite enthält keine Club-Teaser');
  } finally { run.cleanup(); }
});

test('Portal-Legal: Impressum/Datenschutz/Barrierefreiheit unter generated/, Footer-Links relativ', async () => {
  const run = createRun();
  try {
    await run.cronModule.updateAll();
    const imp = read(run.paths.legal('impressum'));
    assert.ok(imp.includes('Portal Betreiber (Test)'));
    assert.ok(existsSync(run.paths.legal('datenschutz')) && existsSync(run.paths.legal('barrierefreiheit')));
    assert.ok(read(run.paths.bund).includes('href="./impressum.html"'));
    assert.ok(read(run.paths.land('bayern')).includes('href="../impressum.html"'));
  } finally { run.cleanup(); }
});

test('Fehlende portal.json: keine Bund-/Land-/Legal-Seiten, Fehler (portal) gemeldet, Club-Ausgabe unberührt', async () => {
  const run = createRun({ portal: null });
  try {
    const { failures, results } = await run.cronModule.updateAll();
    assert.deepEqual(failures.map(f => f.slug), ['(portal)']);
    assert.match(failures[0].error, /Portal-Config nicht gefunden/);
    assert.equal(results.length, 10);
    assert.ok(!existsSync(run.paths.bund), 'ohne Impressum keine Bund-Seite');
    assert.ok(!existsSync(run.paths.land('bayern')));
    assert.ok(!existsSync(run.paths.legal('impressum')));
    assert.ok(existsSync(run.paths.club('bayern', '3002')), 'Club-Seite bleibt bestehen');
    assert.ok(existsSync(join(run.dir, 'bayern', 'verein-3002', `${teamIdFor('3002')}_all.ics`)), 'ICS bleiben bestehen');
  } finally { run.cleanup(); }
});

test('Fehlerisolation: ausgefallener Club fehlt auf den Portal-Seiten, alle anderen sind da', async () => {
  const run = createRun({ failClubIds: ['3003'] });
  try {
    const { failures } = await run.cronModule.updateAll();
    assert.deepEqual(failures.map(f => f.slug), ['verein-3003']);
    const bund = read(run.paths.bund);
    assert.ok(!bund.includes('>Berlin</a></h2>'), 'Berlin hat nur diesen Club → keine Region');
    assert.ok(!bund.includes('verein-3003'));
    assert.ok(bund.includes('>Bayern</a></h2>') && bund.includes('>Hessen</a></h2>'));
    assert.ok(!existsSync(run.paths.land('berlin')));
  } finally { run.cleanup(); }
});

test('Clubs ohne Team-Daten (z.B. API liefert nichts) erscheinen nicht auf den Portal-Seiten', async () => {
  const run = createRun({ emptyClubIds: ['3004'] });
  try {
    await run.cronModule.updateAll();
    const bund = read(run.paths.bund);
    assert.ok(!bund.includes('verein-3004'), 'Club ohne Teams nicht auflisten');
    assert.ok(!bund.includes('>Niedersachsen</a></h2>'));
  } finally { run.cleanup(); }
});

const NOW_ISO = () => new Date().toISOString();
const wamEntry = (ligaId, extra) => ({ ligaId, liganame: `Liga ${ligaId}`, skEbeneId: 1, skEbeneName: 'Bezirk', bezirknr: 1, bezirkName: 'Oberbayern', kreisnr: null, kreisname: null, ...extra });

test('WAM-Anreicherung: frischer Cache gruppiert Ligen nach Ebene/Bezirk/Kreis', async () => {
  const cache = {
    generatedAt: NOW_ISO(),
    ligenByVerbandId: {
      2: [wamEntry(7002, { skEbeneId: 1, bezirkName: 'Oberbayern' })],
      100: [wamEntry(7009, { skEbeneId: 0, skEbeneName: 'Verband' })],
      1: [wamEntry(73001, { skEbeneId: 2, bezirknr: 3, bezirkName: 'Stuttgart', kreisnr: 5, kreisname: 'Esslingen' })],
    },
  };
  const run = createRun({ wamCache: cache });
  try {
    await run.cronModule.updateAll();
    assert.ok(read(run.paths.land('bayern')).includes('<h2 class="portal-group-heading">Bezirk Oberbayern</h2>'));
    assert.ok(read(run.paths.land('baden-wuerttemberg')).includes('<h2 class="portal-group-heading">Stuttgart · Esslingen</h2>'));
    assert.ok(!read(run.paths.land('bundesweit')).includes('class="portal-group-heading"'), 'bundesweit wird nie angereichert');
    assert.ok(!read(run.paths.land('bundesweit')).includes('Verbandsebene'), 'bundesweite Liga 7009 wird trotz Cache-Eintrag nicht gruppiert');
  } finally { run.cleanup(); }
});

test('WAM-Cache veraltet oder fehlend: Seiten entstehen trotzdem, ohne Gruppierung (graceful degradation)', async () => {
  const stale = { generatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), ligenByVerbandId: { 2: [wamEntry(7002)] } };
  for (const wamCache of [stale, null]) {
    const run = createRun({ wamCache });
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const { failures } = await run.cronModule.updateAll();
      assert.deepEqual(failures, []);
      const bayern = read(run.paths.land('bayern'));
      assert.ok(bayern.includes(`aria-label="${SHARED_LIGA_NAME} Tabelle"`), 'Tabellen ohne Cache vorhanden');
      assert.ok(!bayern.includes('class="portal-group-heading"'), 'keine Gruppierung ohne (frischen) Cache');
      assert.ok(warnings.some(w => w.includes('WAM')), 'Warnung zum Cache wird geloggt');
    } finally {
      console.warn = realWarn;
      run.cleanup();
    }
  }
});

const { _testExports: { groupLigen, clubHref } } = require('../../src/aggregatePages');

test('clubHref: relative Links von Bund-Seite, gleicher Region und anderer Region', () => {
  assert.equal(clubHref(null, 'bayern', 'a'), 'bayern/a/index.html');
  assert.equal(clubHref('bayern', 'bayern', 'a'), 'a/index.html');
  assert.equal(clubHref('bayern', 'hessen', 'b'), '../hessen/b/index.html');
});

test('groupLigen: Ebenen-Reihenfolge Verband → Bezirk → Kreis → Weitere; alle unbekannt → flach ohne Überschrift', () => {
  const l = (ligaId, liganame) => [String(ligaId), { ligaId: String(ligaId), liganame, table: [] }];
  const ligen = new Map([l(1, 'K-Liga'), l(2, 'B-Liga'), l(3, 'V-Liga'), l(4, 'X-Liga')]);
  const index = new Map([
    ['1', { skEbeneId: 2, bezirknr: 1, bezirkName: 'Ober', kreisnr: 2, kreisname: 'Kreis A' }],
    ['2', { skEbeneId: 1, bezirknr: 1, bezirkName: 'Ober' }],
    ['3', { skEbeneId: 0 }],
  ]);
  const groups = groupLigen(ligen, index);
  assert.deepEqual(groups.map(g => g.heading), ['Verbandsebene', 'Bezirk Ober', 'Ober · Kreis A', 'Weitere Ligen']);

  const allUnknown = groupLigen(new Map([l(9, 'Z'), l(8, 'A')]), index);
  assert.equal(allUnknown.length, 1);
  assert.equal(allUnknown[0].heading, null);
  assert.deepEqual(allUnknown[0].ligen.map(x => x.liganame), ['A', 'Z'], 'alphabetisch');

  assert.equal(groupLigen(ligen, null)[0].heading, null, 'ohne Index flach');
});
