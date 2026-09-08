'use strict';

function groupBySeasonId(matches) {
  const grouped = {};
  for (const m of matches) {
    const id = m.ligaData?.seasonId;
    if (typeof id !== 'number') continue;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(m);
  }
  return grouped;
}

module.exports = { groupBySeasonId };
