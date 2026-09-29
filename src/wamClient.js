'use strict';

const axios = require('axios');

const BASE_URL = 'https://www.basketball-bund.net/rest';
const WAM_PAGE_DELAY_MS = 300; // höflicher Abstand zwischen Seiten (Rate-Limit ~1 req/s)
const WAM_MAX_PAGES = 200;     // Sicherheitsgrenze; Bayern hat real 40 Seiten

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function mapLiga(l) {
  return {
    ligaId: l.ligaId,
    liganame: l.liganame,
    skEbeneId: l.skEbeneId,
    skEbeneName: l.skEbeneName,
    bezirknr: l.bezirknr ?? null,
    bezirkName: l.bezirkName ?? null,
    kreisnr: l.kreisnr ?? null,
    kreisname: l.kreisname ?? null,
  };
}

// Holt alle Ligen eines Verbands aus dem WAM-Endpunkt (undokumentiert, aber real: siehe
// ADR-018). Pagination ist inhärent sequenziell (jede Seite liefert hasMoreData), deshalb
// kein mapWithConcurrency. startAtIndex ist ein QUERY-Parameter, kein Body-Feld.
// Rückgabe: { ligen, complete }. complete=false, sobald eine Seite fehlschlägt — die
// bis dahin geholten Ligen werden trotzdem zurückgegeben; der Aufrufer entscheidet, ob er
// sie verwendet (siehe refreshWamCache in wamCache.js).
async function fetchLeaguesForVerband(verbandId, { gebietIds, delayMs = WAM_PAGE_DELAY_MS } = {}) {
  const body = { token: 0, verbandIds: [Number(verbandId)] };
  if (gebietIds && gebietIds.length > 0) body.gebietIds = gebietIds;

  const ligen = [];
  let startAtIndex = 0;

  for (let page = 0; page < WAM_MAX_PAGES; page++) {
    let data;
    try {
      const res = await axios.post(`${BASE_URL}/wam/liga/list?startAtIndex=${startAtIndex}`, body);
      data = res.data?.data;
      if (!data || !Array.isArray(data.ligen)) {
        throw new Error('Unerwartete Antwortstruktur (data.ligen fehlt)');
      }
    } catch (err) {
      console.error(`[ERROR] WAM-Seite ab Index ${startAtIndex} (Verband ${verbandId}) fehlgeschlagen:`, err.response ? err.response.status : err.message);
      return { ligen, complete: false };
    }

    ligen.push(...data.ligen.map(mapLiga));
    if (!data.hasMoreData) return { ligen, complete: true };

    if (data.ligen.length === 0) {
      console.error(`[ERROR] WAM lieferte eine leere Seite trotz hasMoreData (Verband ${verbandId}, Index ${startAtIndex})`);
      return { ligen, complete: false };
    }
    startAtIndex += data.ligen.length;
    if (delayMs > 0) await sleep(delayMs);
  }

  console.error(`[ERROR] WAM: Seitenlimit (${WAM_MAX_PAGES}) für Verband ${verbandId} erreicht`);
  return { ligen, complete: false };
}

module.exports = { fetchLeaguesForVerband, WAM_PAGE_DELAY_MS };
