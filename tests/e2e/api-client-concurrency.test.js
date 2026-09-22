'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapWithConcurrency } = require('../../src/apiClient.js');

test('mapWithConcurrency: verarbeitet alle Elemente und liefert Ergebnisse in Original-Reihenfolge', async () => {
  const items = [30, 10, 20];
  const results = await mapWithConcurrency(items, 2, async (ms) => {
    await new Promise(resolve => setTimeout(resolve, ms));
    return ms * 2;
  });
  assert.deepEqual(results, [60, 20, 40]);
});

test('mapWithConcurrency: überschreitet das Limit nie gleichzeitig', async () => {
  const items = [1, 2, 3, 4, 5, 6];
  let active = 0;
  let maxActive = 0;

  await mapWithConcurrency(items, 2, async (item) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return item;
  });

  assert.ok(maxActive <= 2, `maxActive war ${maxActive}, erwartet <= 2`);
});

test('mapWithConcurrency: leere Liste liefert leeres Array', async () => {
  const results = await mapWithConcurrency([], 3, async (x) => x);
  assert.deepEqual(results, []);
});

test('mapWithConcurrency: propagiert einen Fehler aus dem Mapper', async () => {
  await assert.rejects(
    () => mapWithConcurrency([1, 2, 3], 2, async (x) => {
      if (x === 2) throw new Error('boom');
      return x;
    }),
    /boom/
  );
});
