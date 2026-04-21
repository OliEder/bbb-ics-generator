'use strict';

const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const sampleLegal = {
  operator:    'Fibalon Baskets Neumarkt e.V.',
  address:     'Musterstraße 1, 92318 Neumarkt',
  email:       'kontakt@example.de',
  phone:       '',
  responsible: '',
};

const sampleTheme = {
  primary:  '#004174',
  accent:   '#009ef3',
  cupColor: '#7c3aed',
  logoUrl:  null,
};

const _sampleMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets U16',
    ageGroup: 'U16',
    gender: 'männlich',
    lastUpdate: new Date().toISOString(),
    matchCount: 3,
    homeMatchCount: 2,
    awayMatchCount: 1,
    logoUrl: null,
    matches: [
      { date: '2026-02-15', time: '16:00', opponent: 'BC Weiden',  opponentShort: 'BCW', ownShort: 'NM', result: '55:71', isHome: true,  isNext: false, competition: 'Bezirksliga U16 männlich' },
      { date: '2026-03-01', time: '18:00', opponent: 'TV Amberg',  opponentShort: 'TVA', ownShort: 'NM', result: '72:68', isHome: true,  isNext: false, competition: 'Bezirksliga U16 männlich' },
      { date: '2026-04-20', time: '15:00', opponent: 'Roth',       opponentShort: 'ROT', ownShort: 'NM', result: null,    isHome: false, isNext: true,  competition: 'Bezirksliga U16 männlich', venueName: 'Sporthalle', venueAddress: 'Str. 1, 91154 Roth', opponentLogoUrl: '' },
      { date: '2026-05-10', time: '18:00', opponent: 'Ansbach',    opponentShort: 'ANS', ownShort: 'NM', result: null,    isHome: true,  isNext: false, competition: 'Bezirksliga U16 männlich' },
    ],
    spotlightMatches: [
      { date: '2026-02-15', time: '16:00', opponent: 'BC Weiden', opponentShort: 'BCW', ownShort: 'NM', result: '55:71', isHome: true,  isNext: false, competition: 'Bezirksliga U16 männlich', venueName: '', venueAddress: '', opponentLogoUrl: '' },
      { date: '2026-03-01', time: '18:00', opponent: 'TV Amberg', opponentShort: 'TVA', ownShort: 'NM', result: '72:68', isHome: true,  isNext: false, competition: 'Bezirksliga U16 männlich', venueName: '', venueAddress: '', opponentLogoUrl: '' },
      { date: '2026-04-20', time: '15:00', opponent: 'Roth',      opponentShort: 'ROT', ownShort: 'NM', result: null,    isHome: false, isNext: true,  competition: 'Bezirksliga U16 männlich', venueName: 'Sporthalle', venueAddress: 'Str. 1, 91154 Roth', opponentLogoUrl: '' },
    ],
    competitions: [],
  },
];

function generatePages(theme = sampleTheme, metadata = _sampleMetadata, legal = sampleLegal) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-ui-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  const prev = process.env.BBB_GENERATED_DIR;
  process.env.BBB_GENERATED_DIR = dir;
  const { genHTML } = require('../../src/generateHTML.js');
  genHTML(theme, legal);
  if (prev === undefined) delete process.env.BBB_GENERATED_DIR;
  else process.env.BBB_GENERATED_DIR = prev;
  return {
    dir,
    indexPath:         join(dir, 'index.html'),
    teamPath:  (id)  => join(dir, 'teams', `${id}.html`),
    legalPath: (name) => join(dir, `${name}.html`),
  };
}

module.exports = {
  generatePages,
  sampleMetadata: () => JSON.parse(JSON.stringify(_sampleMetadata)),
  sampleTheme,
  sampleLegal,
};
