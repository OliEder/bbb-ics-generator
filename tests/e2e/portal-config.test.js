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

// ---- Privater Portalbetrieb (ADR-027) ----

test('loadPortalConfig privat: nur operator genügt → { private, operator }', () => {
  withFile({ private: true, operator: 'Privat Test' }, file =>
    assert.deepEqual(loadPortalConfig(file), { private: true, operator: 'Privat Test' }));
});

test('loadPortalConfig privat: address/email/phone/responsible werden ignoriert', () => {
  withFile({ ...VALID, private: true, phone: '123', responsible: 'X' }, file => {
    const cfg = loadPortalConfig(file);
    assert.deepEqual(cfg, { private: true, operator: VALID.operator });
    for (const key of ['address', 'email', 'phone', 'responsible']) assert.ok(!(key in cfg), key);
  });
});

test('loadPortalConfig privat: operator fehlt oder leer → Fehler', () => {
  withFile({ private: true }, file => assert.throws(() => loadPortalConfig(file), /operator/));
  withFile({ private: true, operator: '  ' }, file => assert.throws(() => loadPortalConfig(file), /operator/));
});

test('loadPortalConfig privat: contactUrl nur mit https://', () => {
  for (const bad of ['javascript:alert(1)', 'http://x.test', 'ftp://x.test/a', 'data:text/html,x', 'x.test/kontakt']) {
    withFile({ private: true, operator: 'X', contactUrl: bad }, file =>
      assert.throws(() => loadPortalConfig(file), /contactUrl/, bad));
  }
  withFile({ private: true, operator: 'X', contactUrl: 'https://example.test/kontakt' }, file =>
    assert.deepEqual(loadPortalConfig(file), { private: true, operator: 'X', contactUrl: 'https://example.test/kontakt' }));
});

test('loadPortalConfig privat: leere/fehlende contactUrl erlaubt und nicht im Ergebnis', () => {
  withFile({ private: true, operator: 'X', contactUrl: '  ' }, file =>
    assert.ok(!('contactUrl' in loadPortalConfig(file))));
  withFile({ private: true, operator: 'X' }, file =>
    assert.ok(!('contactUrl' in loadPortalConfig(file))));
});

test('loadPortalConfig: private als String "true" oder 1 aktiviert den Modus NICHT (strenge Prüfung)', () => {
  for (const value of ['true', 1, 'yes', false]) {
    withFile({ private: value, operator: 'X' }, file =>
      assert.throws(() => loadPortalConfig(file), /Pflichtfelder fehlen: address, email/, String(value)));
    withFile({ ...VALID, private: value }, file => assert.deepEqual(loadPortalConfig(file), { ...VALID, private: value }));
  }
});
