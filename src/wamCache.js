'use strict';

const fs = require('fs');
const path = require('path');
const { fetchLeaguesForVerband } = require('./wamClient');

// 150 Tage (~5 Monate): länger als das Refresh-Intervall des Workflows (alle 3 Monate),
// damit der Cache kurz vor jedem Refresh nicht als veraltet gilt und Warnungen erzeugt.
// Eigene Konstante, weil dies ein anderer Cache-Typ als CACHE_TTL_MS in storage.js ist.
const WAM_CACHE_TTL_MS = 150 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_PATH = path.resolve(__dirname, '../data/wam-ligen-cache.json');

function cachePath() {
  return process.env.BBB_WAM_CACHE || DEFAULT_CACHE_PATH;
}

// Gibt { cache, stale } zurück. Fehlende oder unlesbare Datei → { cache: null, stale: false }
// (graceful degradation, siehe ADR-022). Ein veralteter Cache wird zurückgegeben, aber
// als stale markiert; der Aufrufer entscheidet über die Verwendung.
function loadWamCache(filePath = cachePath(), now = Date.now()) {
  if (!fs.existsSync(filePath)) return { cache: null, stale: false };
  try {
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const generatedAt = Date.parse(cache.generatedAt);
    if (!cache.ligenByVerbandId || typeof cache.ligenByVerbandId !== 'object' || Number.isNaN(generatedAt)) {
      throw new Error('Ungültiges Cache-Format');
    }
    return { cache, stale: now - generatedAt > WAM_CACHE_TTL_MS };
  } catch (err) {
    console.error(`[ERROR] WAM-Cache ${filePath} nicht lesbar:`, err.message);
    return { cache: null, stale: false };
  }
}

// Map<String(ligaId), liga> über alle Verbände. ligaId ist bundesweit eindeutig
// (Join-Schlüssel zu ligaData.ligaId der Match-Daten, verifiziert — ADR-021).
function buildLigaIndex(cache) {
  const index = new Map();
  for (const ligen of Object.values(cache?.ligenByVerbandId || {})) {
    for (const liga of ligen) index.set(String(liga.ligaId), liga);
  }
  return index;
}

// Baut einen neuen Cache. Schlägt der Abruf eines Verbands teilweise fehl, wird dessen
// ALTER Stand übernommen (nicht der Teilabruf) und der Verband in partialVerbandIds
// vermerkt — sonst würde ein frisches generatedAt Lücken tarnen (ADR-022).
async function refreshWamCache({ verbandIds, existingCache = null, fetchLeagues = fetchLeaguesForVerband, now = new Date() }) {
  const ligenByVerbandId = {};
  const partialVerbandIds = [];

  for (const verbandId of verbandIds) {
    const key = String(verbandId);
    const { ligen, complete } = await fetchLeagues(verbandId);
    if (complete) {
      ligenByVerbandId[key] = ligen;
      continue;
    }
    partialVerbandIds.push(key);
    const previous = existingCache?.ligenByVerbandId?.[key];
    if (previous) {
      ligenByVerbandId[key] = previous;
      console.warn(`[WARN] Verband ${key}: Abruf unvollständig — alter Cache-Stand bleibt erhalten`);
    } else {
      console.warn(`[WARN] Verband ${key}: Abruf unvollständig und kein alter Stand — Verband fehlt im Cache`);
    }
  }

  const cache = { generatedAt: now.toISOString(), ligenByVerbandId };
  if (partialVerbandIds.length > 0) cache.partialVerbandIds = partialVerbandIds;
  return { cache, incompleteVerbandIds: partialVerbandIds };
}

module.exports = { WAM_CACHE_TTL_MS, DEFAULT_CACHE_PATH, loadWamCache, buildLigaIndex, refreshWamCache };
