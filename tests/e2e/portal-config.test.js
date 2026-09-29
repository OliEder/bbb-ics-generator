'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { loadPortalConfig } = require('../../src/portalConfig');

function withFile(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-portalcfg-'));
  const file = join(dir, 'portal.json');
  if (content !== undefined) writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  try { return fn(file); } finally { rmSync(dir, { recursive: true }); }
}

const VALID = { operator: 'Max Betreiber', address: 'Str. 1, 12345 Ort', email: 'a@b.de', phone: '', responsible: '' };

test('loadPortalConfig: gültige Datei → Legal-Objekt', () => {
  withFile(VALID, file => assert.deepEqual(loadPortalConfig(file), VALID));
});

test('loadPortalConfig: fehlende Datei wirft mit klarer Meldung', () => {
  withFile(undefined, file => assert.throws(() => loadPortalConfig(file), /Portal-Config nicht gefunden/));
});

test('loadPortalConfig: ungültiges JSON wirft', () => {
  withFile('{ kaputt', file => assert.throws(() => loadPortalConfig(file), /Ungültiges JSON/));
});

test('loadPortalConfig: leere/fehlende Pflichtfelder werden benannt', () => {
  withFile({ ...VALID, operator: '  ', email: '' }, file =>
    assert.throws(() => loadPortalConfig(file), /Pflichtfelder fehlen: operator, email/));
  withFile({ operator: 'X' }, file =>
    assert.throws(() => loadPortalConfig(file), /Pflichtfelder fehlen: address, email/));
});

test('loadPortalConfig: phone/responsible sind optional', () => {
  withFile({ operator: 'X', address: 'Y', email: 'z@z.de' }, file => {
    const cfg = loadPortalConfig(file);
    assert.equal(cfg.operator, 'X');
    assert.equal(cfg.phone, undefined);
  });
});
