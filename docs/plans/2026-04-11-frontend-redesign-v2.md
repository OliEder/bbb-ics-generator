# Frontend Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the generated `index.html` to use tab-based navigation per team card (Alle/Heim/Auswärts), show team logos from the Basketball-Bund API, and ensure full keyboard accessibility (WCAG 2.1 AA).

**Architecture:** Logo URLs are constructed from `teamPermanentId` using the pattern `https://www.basketball-bund.net/media/team/{teamPermanentId}/logo` — no extra API call needed. The `teamId` in `metadata.json` is already the `teamPermanentId`. Each team card gets tabs implemented as accessible `role="tablist"` with keyboard arrow-key navigation in JavaScript. `fetchClubInfo()` in `apiClient.js` is removed since it returned null anyway (club endpoint has no logo field). The logo URL is added to each team entry in `metadata.json`.

**Tech Stack:** Node.js, vanilla HTML/CSS/JS (no frameworks), node:test for unit/e2e tests, Playwright + @axe-core/playwright for WCAG 2.1 AA browser tests (local + CI)

---

## File Structure

| File | Change |
|------|--------|
| `src/apiClient.js` | Remove `fetchClubInfo()` and its export |
| `src/cronUpdate.js` | Remove `fetchClubInfo` import/call; construct `logoUrl` from first team's `id`; add `logoUrl` to each team's `meta` entry |
| `src/generateHTML.js` | Full rewrite of HTML template: tab UI per team card, logo in header + team cards, keyboard nav JS, updated CSS |
| `tests/e2e/html-generation.test.js` | Update `sampleMetadata` with `logoUrl`; update/add tests for tabs, logo in team cards, keyboard nav attributes |
| `tests/accessibility/wcag.spec.js` | New: WCAG 2.1 AA Playwright tests with @axe-core/playwright + structural checks |
| `playwright.config.js` | New: Playwright config — Chromium only, HTML reporter, local static server |
| `.github/workflows/test.yml` | New: CI workflow running node:test + Playwright, uploads HTML report as artifact, paths filter excludes calendar-only commits |
| `package.json` | Add `@playwright/test`, `@axe-core/playwright` as devDependencies; add `test:a11y` script |

---

## Task 1: Remove `fetchClubInfo` from apiClient.js

**Files:**
- Modify: `src/apiClient.js`

- [ ] **Step 1: Remove the function and its export**

Replace the entire file with this content:

```javascript
'use strict';

const axios = require('axios');
const BASE_URL = 'https://www.basketball-bund.net/rest';

async function fetchTeamMatches(teamId) {
  const url = `${BASE_URL}/team/id/${teamId}/matches`;
  try {
    const res = await axios.get(url);
    return res.data?.data?.matches || [];
  } catch (err) {
    console.error('API error for matches', teamId, err.response ? err.response.status : err.message);
    return [];
  }
}

async function fetchMatchInfo(matchId) {
  const url = `${BASE_URL}/match/id/${matchId}/matchInfo`;
  try {
    const res = await axios.get(url);
    return res.data?.data || null;
  } catch (err) {
    console.error('API error for matchInfo', matchId, err.response ? err.response.status : err.message);
    return null;
  }
}

async function fetchClubTeams(clubId) {
  const url = `${BASE_URL}/club/id/${clubId}/actualmatches?justHome=false&rangeDays=150`;
  try {
    const res = await axios.get(url);
    const matches = res.data?.data?.matches || [];
    const seen = new Set();
    const teams = [];
    for (const match of matches) {
      for (const teamObj of [match.homeTeam, match.guestTeam]) {
        if (!teamObj || !teamObj.teamPermanentId || Number(teamObj.clubId) !== Number(clubId)) continue;
        const id = String(teamObj.teamPermanentId);
        if (seen.has(id)) continue;
        seen.add(id);
        teams.push({
          id,
          name: teamObj.teamname || 'Unbekannt',
          ageGroup: match.ligaData?.akName || '',
        });
      }
    }
    return teams;
  } catch (err) {
    console.error('API error for club teams', clubId, err.response ? err.response.status : err.message);
    return null;
  }
}

module.exports = { fetchTeamMatches, fetchMatchInfo, fetchClubTeams };
```

- [ ] **Step 2: Run tests to verify nothing is broken**

```bash
node --test
```

Expected: all tests pass (fetchClubInfo was not tested directly)

- [ ] **Step 3: Commit**

```bash
git add src/apiClient.js
git commit -m "refactor: remove fetchClubInfo (club endpoint has no logo field)"
```

---

## Task 2: Update cronUpdate.js — construct logoUrl from teamPermanentId

**Files:**
- Modify: `src/cronUpdate.js`

Logo URL pattern: `https://www.basketball-bund.net/media/team/{teamPermanentId}/logo`

The `teamPermanentId` is the `id` field already in the teams array. Use the first team's id for the header logo (passed as `theme.logoUrl`). Also add `logoUrl` to each team's `meta` entry so the HTML generator can render per-card logos.

- [ ] **Step 1: Write a failing test**

In `tests/e2e/html-generation.test.js`, add to `sampleMetadata` a `logoUrl` field (this test will pass once Task 3 uses it, but first verify the metadata shape is correct):

```javascript
const sampleMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets Neumarkt U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
  },
  {
    teamId: '167882',
    teamName: 'Test Team <script> & Co.',
    ageGroup: 'U12',
    lastUpdate: new Date().toISOString(),
    matchCount: 1,
    homeMatchCount: 1,
    awayMatchCount: 0,
    logoUrl: 'https://www.basketball-bund.net/media/team/167882/logo',
  },
];
```

Add a new test at the bottom of `tests/e2e/html-generation.test.js`:

```javascript
test('Logo-URL aus teamId ist in Team-Card', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo' });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('media/team/167881/logo'), 'Team-Logo-URL fehlt im HTML');
    assert.ok(html.includes('media/team/167882/logo'), 'Team-Logo-URL für zweites Team fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/e2e/html-generation.test.js
```

Expected: FAIL — "Team-Logo-URL fehlt im HTML"

- [ ] **Step 3: Update cronUpdate.js**

Replace the theme construction block and the `meta.push(...)` call in `src/cronUpdate.js`:

Remove the `fetchClubInfo` import and its call. Replace with:

```javascript
const { fetchTeamMatches, fetchMatchInfo, fetchClubTeams } = require('./apiClient');
```

Replace the theme block (lines ~35-45) with:

```javascript
const BBB_MEDIA_BASE = 'https://www.basketball-bund.net/media/team';
const firstTeamLogoUrl = teams.length > 0
  ? `${BBB_MEDIA_BASE}/${teams[0].id}/logo`
  : null;

const theme = {
  primary: config.theme?.primary || '#004174',
  accent:  config.theme?.accent  || '#009ef3',
  logoUrl: config.theme?.logoUrl || firstTeamLogoUrl,
};
```

Replace the `meta.push(...)` call with:

```javascript
meta.push({
  teamId: t.id,
  teamName: t.name,
  ageGroup: t.ageGroup,
  lastUpdate: new Date().toISOString(),
  matchCount: matches.length,
  homeMatchCount: homeMatches.length,
  awayMatchCount: awayMatches.length,
  logoUrl: `${BBB_MEDIA_BASE}/${t.id}/logo`,
});
```

- [ ] **Step 4: Run tests — still fail (generateHTML not updated yet)**

```bash
node --test tests/e2e/html-generation.test.js
```

Expected: FAIL — logo URL not yet rendered in HTML (Task 3 will fix this)

- [ ] **Step 5: Commit**

```bash
git add src/cronUpdate.js src/apiClient.js tests/e2e/html-generation.test.js
git commit -m "feat: construct team logo URLs from teamPermanentId"
```

---

## Task 3: Rewrite generateHTML.js — tabs, logos, keyboard accessibility

**Files:**
- Modify: `src/generateHTML.js`

This is the main task. The HTML template gets:
1. Club logo in `<header>` (from `theme.logoUrl`) — `<img>` with `class="club-logo"` when present
2. Each team card has a logo (`<img src="{t.logoUrl}">`) in its card header
3. Tabs (Alle / Heim / Auswärts) with `role="tablist"`, `role="tab"`, `role="tabpanel"` — ARIA-compliant
4. Keyboard navigation: arrow keys switch tabs, Tab moves between focusable elements
5. 3 platform buttons per tab panel (webcal, Google Calendar, HTTPS download)
6. `:focus-visible` outlines on all interactive elements

- [ ] **Step 1: Run all existing tests to capture current baseline**

```bash
node --test
```

Note which tests pass — they must all still pass after this task.

- [ ] **Step 2: Add tests for tab structure and keyboard nav attributes**

Add these tests to `tests/e2e/html-generation.test.js`:

```javascript
test('Tab-Struktur mit role="tablist" ist vorhanden', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('role="tablist"'), 'tablist role fehlt');
    assert.ok(html.includes('role="tab"'), 'tab role fehlt');
    assert.ok(html.includes('role="tabpanel"'), 'tabpanel role fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Jede Team-Card hat drei Tab-Panels (all, home, away)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const panels = html.match(/role="tabpanel"/g) || [];
    assert.equal(panels.length, sampleMetadata.length * 3, 'Falsche Anzahl tab panels');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('Keyboard-Navigation JS ist eingebettet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML(DEFAULT_THEME);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('ArrowRight') || html.includes('arrowright'), 'Keyboard-Navigation JS fehlt');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 3: Run new tests to verify they fail**

```bash
node --test tests/e2e/html-generation.test.js
```

Expected: 3 new tests FAIL

- [ ] **Step 4: Rewrite generateHTML.js**

Replace the entire content of `src/generateHTML.js` with:

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://olieder.github.io/bbb-ics-generator/';

function makeWebcalLink(filename) {
  return BASE_URL.replace(/^https:/, 'webcal:') + filename;
}

function makeHttpsLink(filename) {
  return BASE_URL + filename;
}

function makeGoogleCalLink(filename) {
  return 'https://www.google.com/calendar/render?cid=' + encodeURIComponent(makeWebcalLink(filename));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeCssColor(value) {
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return value;
  if (/^(rgb|rgba|hsl|hsla)\([^)]*\)$/.test(value)) return value;
  if (/^[a-zA-Z]+$/.test(value)) return value;
  return '#004174';
}

const ICON_APPLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

const ICON_ANDROID = `<svg width="14" height="17" viewBox="-147 -70 294 345" aria-hidden="true"><g fill="currentColor"><ellipse cy="41" rx="91" ry="84"/><rect rx="22" height="182" width="182" y="20" x="-91"/><rect rx="24" height="133" width="48" y="41" x="-143"/><rect rx="24" height="133" width="48" y="41" x="95"/><rect rx="6.5" transform="rotate(29)" height="86" width="13" y="-86" x="14"/><rect rx="6.5" transform="rotate(-29)" height="86" width="13" y="-86" x="-27"/></g><g fill="white"><circle cx="-42" cy="41" r="9"/><circle cx="42" cy="41" r="9"/></svg>`;

const ICON_DOWNLOAD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function buildTabPanel(teamId, type, count, webcalLink, googleLink, httpsLink) {
  const id = `panel-${teamId}-${type}`;
  const tabId = `tab-${teamId}-${type}`;
  const hidden = type !== 'all' ? ' hidden' : '';
  const label = type === 'all' ? `Alle (${count})` : type === 'home' ? `Heim (${count})` : `Auswärts (${count})`;
  return `
    <div id="${id}" role="tabpanel" aria-labelledby="${tabId}"${hidden}>
      <div class="btn-group">
        <a href="${escapeHtml(webcalLink)}" class="btn">${ICON_APPLE} iOS / macOS Kalender</a>
        <a href="${escapeHtml(googleLink)}" class="btn">${ICON_ANDROID} Google Calendar</a>
        <a href="${escapeHtml(httpsLink)}" class="btn" download>${ICON_DOWNLOAD} ICS herunterladen</a>
      </div>
    </div>`;
}

function buildTeamCard(t) {
  const logoHtml = t.logoUrl
    ? `<img src="${escapeHtml(t.logoUrl)}" alt="" class="team-logo" aria-hidden="true">`
    : `<div class="team-logo-placeholder" aria-hidden="true"></div>`;

  const variants = [
    { type: 'all',  count: Number(t.matchCount) },
    { type: 'home', count: Number(t.homeMatchCount) },
    { type: 'away', count: Number(t.awayMatchCount) },
  ];

  const tabs = variants.map(({ type, count }) => {
    const label = type === 'all' ? `Alle (${count})` : type === 'home' ? `Heim (${count})` : `Auswärts (${count})`;
    const selected = type === 'all' ? 'true' : 'false';
    const tabindex = type === 'all' ? '0' : '-1';
    return `<button id="tab-${t.teamId}-${type}" role="tab" aria-selected="${selected}" aria-controls="panel-${t.teamId}-${type}" tabindex="${tabindex}">${label}</button>`;
  }).join('');

  const panels = variants.map(({ type, count }) =>
    buildTabPanel(
      t.teamId, type, count,
      makeWebcalLink(`${t.teamId}_${type}.ics`),
      makeGoogleCalLink(`${t.teamId}_${type}.ics`),
      makeHttpsLink(`${t.teamId}_${type}.ics`),
    )
  ).join('');

  return `
  <div class="team-card">
    <div class="team-card-header">
      ${logoHtml}
      <span class="team-name">${escapeHtml(t.teamName)} <small>${escapeHtml(t.ageGroup)}</small></span>
      <span class="team-badge">${Number(t.matchCount)} Sp. · ${Number(t.homeMatchCount)} H · ${Number(t.awayMatchCount)} A</span>
    </div>
    <div class="tab-bar" role="tablist" aria-label="Spielvariante für ${escapeHtml(t.teamName)}">
      ${tabs}
    </div>
    ${panels}
  </div>`;
}

function genHTML(theme = {}) {
  const primary = sanitizeCssColor(theme.primary || '#004174');
  const accent  = sanitizeCssColor(theme.accent  || '#009ef3');
  const logoUrl = theme.logoUrl || null;

  const generatedDir = process.env.BBB_GENERATED_DIR || process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];

  const headerLogoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Vereinslogo" class="club-logo">`
    : '';

  const content = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Basketball Kalender – Übersicht</title>
  <style>
    :root {
      --color-primary: ${primary};
      --color-accent:  ${accent};
      --color-on-primary: #ffffff;
      --color-primary-light: color-mix(in srgb, var(--color-primary) 10%, white);
      --color-accent-muted:  color-mix(in srgb, var(--color-accent) 70%, white);
      --color-border: color-mix(in srgb, var(--color-primary) 25%, white);
      --color-surface: #ffffff;
      --color-surface-card: color-mix(in srgb, var(--color-primary) 5%, white);
      --color-text: color-mix(in srgb, var(--color-primary) 90%, black);
      --color-text-muted: color-mix(in srgb, var(--color-primary) 55%, white);
      --color-info-bg: color-mix(in srgb, var(--color-accent) 12%, white);
      --color-info-border: color-mix(in srgb, var(--color-accent) 30%, white);
      --color-badge-bg: color-mix(in srgb, var(--color-accent) 15%, white);
      --color-badge-text: color-mix(in srgb, var(--color-primary) 90%, black);
      --color-tab-active-bg: color-mix(in srgb, var(--color-primary) 8%, white);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-surface: color-mix(in srgb, var(--color-primary) 18%, black);
        --color-surface-card: color-mix(in srgb, var(--color-primary) 28%, black);
        --color-text: color-mix(in srgb, var(--color-primary) 10%, white);
        --color-text-muted: color-mix(in srgb, var(--color-accent) 60%, white);
        --color-info-bg: color-mix(in srgb, var(--color-primary) 35%, black);
        --color-info-border: color-mix(in srgb, var(--color-primary) 55%, black);
        --color-badge-bg: color-mix(in srgb, var(--color-primary) 40%, black);
        --color-badge-text: color-mix(in srgb, var(--color-accent) 65%, white);
        --color-border: color-mix(in srgb, var(--color-primary) 50%, black);
        --color-accent-muted: color-mix(in srgb, var(--color-accent) 65%, white);
        --color-tab-active-bg: color-mix(in srgb, var(--color-primary) 45%, black);
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--color-surface);
      color: var(--color-text);
      min-height: 100vh;
    }
    header {
      background: var(--color-primary);
      color: var(--color-on-primary);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .club-logo {
      height: 48px;
      width: 48px;
      object-fit: contain;
      background: white;
      border-radius: 8px;
      padding: 4px;
      flex-shrink: 0;
    }
    .header-text h1 { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
    .header-text p { font-size: 0.78rem; opacity: 0.75; margin-top: 2px; }
    .update-bar {
      background: var(--color-info-bg);
      border-bottom: 1px solid var(--color-info-border);
      padding: 5px 20px;
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }
    main { max-width: 760px; margin: 0 auto; padding: 20px 16px; }
    .team-card {
      border-radius: 10px;
      border: 1px solid var(--color-border);
      overflow: hidden;
      margin-bottom: 12px;
    }
    .team-card-header {
      background: var(--color-primary);
      color: var(--color-on-primary);
      padding: 11px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .team-logo {
      width: 32px;
      height: 32px;
      object-fit: contain;
      background: rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 3px;
      flex-shrink: 0;
    }
    .team-logo-placeholder {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: rgba(255,255,255,0.15);
      flex-shrink: 0;
    }
    .team-name { font-weight: 700; font-size: 0.92rem; flex: 1; }
    .team-name small { font-weight: 400; opacity: 0.75; }
    .team-badge {
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      padding: 2px 9px;
      font-size: 0.68rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface-card);
    }
    .tab-bar button {
      flex: 1;
      padding: 9px 4px;
      border: none;
      background: transparent;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .tab-bar button[aria-selected="true"] {
      color: var(--color-primary);
      background: var(--color-tab-active-bg);
      border-bottom-color: var(--color-primary);
    }
    .tab-bar button:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: -2px;
    }
    [role="tabpanel"] { padding: 12px 14px; }
    [role="tabpanel"][hidden] { display: none; }
    .btn-group { display: flex; flex-direction: column; gap: 8px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--color-surface);
      color: var(--color-primary);
      border: 1.5px solid var(--color-border);
      padding: 9px 14px;
      border-radius: 7px;
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
    .btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    @media (prefers-color-scheme: dark) {
      .btn {
        background: transparent;
        color: var(--color-accent-muted);
        border-color: var(--color-border);
      }
      .btn:hover { background: var(--color-surface-card); }
    }
  </style>
</head>
<body>
  <header>
    ${headerLogoHtml}
    <div class="header-text">
      <h1>Basketball Spielplan</h1>
      <p>Spielplan-Kalender</p>
    </div>
  </header>
  <div class="update-bar">
    Stand: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · Automatisch alle 6h aktualisiert
  </div>
  <main>
    ${teams.map(buildTeamCard).join('')}
  </main>
  <script>
    document.querySelectorAll('[role="tablist"]').forEach(function(tablist) {
      var tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      tablist.addEventListener('keydown', function(e) {
        var idx = tabs.indexOf(document.activeElement);
        if (idx === -1) return;
        var next = -1;
        if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
        if (e.key === 'ArrowLeft')  next = (idx - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End')  next = tabs.length - 1;
        if (next !== -1) {
          e.preventDefault();
          activateTab(tabs[next]);
        }
      });
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() { activateTab(tab); });
      });
      function activateTab(tab) {
        tabs.forEach(function(t) {
          t.setAttribute('aria-selected', 'false');
          t.setAttribute('tabindex', '-1');
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = true;
        });
        tab.setAttribute('aria-selected', 'true');
        tab.setAttribute('tabindex', '0');
        tab.focus();
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = false;
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(generatedDir, 'index.html'), content, 'utf8');
}

module.exports = { genHTML };

if (require.main === module) {
  const config = require('../config.json');
  genHTML({
    primary: config.theme?.primary || '#004174',
    accent:  config.theme?.accent  || '#009ef3',
    logoUrl: config.theme?.logoUrl || null,
  });
}
```

- [ ] **Step 5: Run all tests**

```bash
node --test
```

Expected: all tests pass including the 3 new ones and the logo-in-team-card test from Task 2

- [ ] **Step 6: Commit**

```bash
git add src/generateHTML.js tests/e2e/html-generation.test.js
git commit -m "feat: redesign frontend with tabs, team logos, keyboard accessibility"
```

---

## Task 4: Update existing test for logo absence

**Files:**
- Modify: `tests/e2e/html-generation.test.js`

The existing test `'Kein club-logo img wenn logoUrl null'` checks `class="club-logo"` (header logo). This still applies. But now team cards always have a `team-logo` or `team-logo-placeholder`. Update the test to be explicit:

- [ ] **Step 1: Update the existing test**

Find and replace the test `'Kein club-logo img wenn logoUrl null'`:

```javascript
test('Kein club-logo img wenn logoUrl null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-html-'));
  try {
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(sampleMetadata));
    const { genHTML } = requireGenHTML(dir);
    genHTML({ primary: '#004174', accent: '#009ef3', logoUrl: null });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!html.includes('class="club-logo"'), 'club-logo im Header sollte nicht vorhanden sein wenn kein Logo');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run all tests**

```bash
node --test
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/html-generation.test.js
git commit -m "test: clarify club-logo header test after team-card logo addition"
```

---

## Task 6: WCAG 2.1 AA Playwright accessibility tests (local + CI)

**Files:**
- Create: `tests/accessibility/wcag.spec.js`
- Create: `playwright.config.js`
- Modify: `package.json`

**Background:** Playwright runs a real Chromium browser — this catches issues that jsdom misses (CSS contrast ratios, rendered layout, actual JS execution). `@axe-core/playwright` integrates axe directly into Playwright tests. The HTML reporter generates a browsable test report locally and as a CI artifact.

**WCAG 2.1 AA criteria covered (automated):**
- 1.1.1 Non-text Content — `alt` on images
- 1.3.1 Info and Relationships — ARIA roles (tablist/tab/tabpanel), landmark regions
- 1.4.3 Contrast (Minimum) — color contrast of text (only possible in real browser)
- 2.1.1 Keyboard — focusable elements, tab stops
- 2.4.1 Bypass Blocks — `<main>` and `<header>` landmarks
- 2.4.2 Page Titled — `<title>` element
- 2.4.6 Headings and Labels — `<h1>`, tab button labels
- 3.1.1 Language of Page — `lang` on `<html>`
- 4.1.2 Name, Role, Value — ARIA attributes correct

**How local serving works:** The test generates `index.html` into a temp dir, then Playwright serves it via `page.goto('file://' + path)`. No HTTP server needed.

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install chromium
```

Verify `package.json` devDependencies now includes `@playwright/test` and `@axe-core/playwright`.

- [ ] **Step 2: Create `playwright.config.js`**

```javascript
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/accessibility',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 3: Add scripts to `package.json`**

Add to the `scripts` section:

```json
"test:a11y": "playwright test",
"test:a11y:report": "playwright show-report"
```

- [ ] **Step 4: Add `playwright-report/` and `test-results/` to `.gitignore`**

Open `.gitignore` and add:

```
playwright-report/
test-results/
```

- [ ] **Step 5: Write the failing test file**

Create `tests/accessibility/wcag.spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

function generateIndexHtml(theme, metadata) {
  const dir = mkdtempSync(join(tmpdir(), 'bbb-a11y-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  const modPath = require.resolve('../../src/generateHTML.js');
  delete require.cache[modPath];
  process.env.BBB_GENERATED_DIR = dir;
  const { genHTML } = require('../../src/generateHTML.js');
  genHTML(theme);
  return { dir, htmlPath: join(dir, 'index.html') };
}

const sampleMetadata = [
  {
    teamId: '167881',
    teamName: 'Fibalon Baskets U10',
    ageGroup: 'U10',
    lastUpdate: new Date().toISOString(),
    matchCount: 2,
    homeMatchCount: 1,
    awayMatchCount: 1,
    logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
  },
  {
    teamId: '167882',
    teamName: 'Test Team',
    ageGroup: 'U12',
    lastUpdate: new Date().toISOString(),
    matchCount: 1,
    homeMatchCount: 1,
    awayMatchCount: 0,
    logoUrl: 'https://www.basketball-bund.net/media/team/167882/logo',
  },
];

const DEFAULT_THEME = { primary: '#004174', accent: '#009ef3', logoUrl: null };
const WITH_LOGO_THEME = {
  primary: '#004174',
  accent: '#009ef3',
  logoUrl: 'https://www.basketball-bund.net/media/team/167881/logo',
};

test.describe('WCAG 2.1 AA — axe-core vollständiger Scan', () => {
  test('keine Violations ohne Logo', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine Violations mit Logo im Header', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(WITH_LOGO_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('keine Violations mit leerer Team-Liste', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, []);
    try {
      await page.goto('file://' + htmlPath);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

test.describe('WCAG 2.1 AA — strukturelle Prüfungen', () => {
  test('2.4.2 Seitentitel vorhanden', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const title = await page.title();
      expect(title.trim().length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('3.1.1 lang-Attribut auf <html>', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const lang = await page.getAttribute('html', 'lang');
      expect(lang).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.4.1 <main> und <header> Landmarks vorhanden', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      await expect(page.locator('main')).toBeAttached();
      await expect(page.locator('header')).toBeAttached();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.4.6 <h1> vorhanden und nicht leer', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const h1 = page.locator('h1');
      await expect(h1).toBeAttached();
      const text = await h1.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('4.1.2 aria-controls auf Tabs zeigt auf existierende Panels', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const tabs = page.locator('[role="tab"]');
      const count = await tabs.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const controlsId = await tabs.nth(i).getAttribute('aria-controls');
        expect(controlsId).toBeTruthy();
        const panel = page.locator(`#${controlsId}`);
        await expect(panel).toBeAttached();
        const role = await panel.getAttribute('role');
        expect(role).toBe('tabpanel');
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('4.1.2 Tablist hat aria-label', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const tablists = page.locator('[role="tablist"]');
      const count = await tablists.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const label = await tablists.nth(i).getAttribute('aria-label')
          || await tablists.nth(i).getAttribute('aria-labelledby');
        expect(label).toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('2.1.1 Tastaturnavigation: ArrowRight wechselt Tab', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(DEFAULT_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      // Focus the first tab of the first team card
      const firstTab = page.locator('[role="tab"]').first();
      await firstTab.focus();
      await page.keyboard.press('ArrowRight');
      // Second tab should now be selected
      const secondTab = page.locator('[role="tab"]').nth(1);
      const selected = await secondTab.getAttribute('aria-selected');
      expect(selected).toBe('true');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('1.1.1 Alle <img> haben alt-Attribut', async ({ page }) => {
    const { dir, htmlPath } = generateIndexHtml(WITH_LOGO_THEME, sampleMetadata);
    try {
      await page.goto('file://' + htmlPath);
      const images = page.locator('img');
      const count = await images.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const alt = await images.nth(i).getAttribute('alt');
        // alt="" is valid for decorative images, alt must be present
        expect(alt).not.toBeNull();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
```

- [ ] **Step 6: Run tests to verify they fail before Task 3**

```bash
npx playwright test
```

Expected: failures — ARIA attributes missing in current HTML, axe violations present. This proves the tests are meaningful.

- [ ] **Step 7: After Task 3 (generateHTML rewrite), run again**

```bash
npx playwright test
```

Expected: all tests pass. Report at `playwright-report/index.html` — open with:

```bash
npm run test:a11y:report
```

- [ ] **Step 8: Commit**

```bash
git add tests/accessibility/wcag.spec.js playwright.config.js package.json package-lock.json .gitignore
git commit -m "test: add WCAG 2.1 AA Playwright accessibility tests"
```

---

## Task 7: CI workflow — run tests on code changes only

**Files:**
- Create: `.github/workflows/test.yml`

**Key design decisions:**
- `paths` filter: only runs when `src/**`, `tests/**`, `playwright.config.js`, `package.json`, or `package-lock.json` change — not on calendar-update commits (which only touch `generated/` and have `[skip ci]`)
- Uploads `playwright-report/` as a GitHub Actions artifact (retained 30 days) — viewable under Actions → Run → Artifacts
- Runs `node --test` (unit/e2e) first, then Playwright separately so failures are distinguishable
- Uses `--reporter=github` for node:test to get inline annotations on PRs

- [ ] **Step 1: Create `.github/workflows/test.yml`**

```yaml
name: Run Tests

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'tests/**'
      - 'playwright.config.js'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/test.yml'
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'playwright.config.js'
      - 'package.json'
      - 'package-lock.json'

concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit-and-e2e:
    name: Unit & E2E Tests (node:test)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit and e2e tests
        run: node --test 'tests/e2e/*.test.js'

  accessibility:
    name: Accessibility Tests (Playwright + axe)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Generate test HTML
        run: |
          mkdir -p generated
          echo '[]' > generated/metadata.json
          node src/generateHTML.js

      - name: Run Playwright accessibility tests
        run: npx playwright test

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow with paths filter and Playwright report artifact"
```

- [ ] **Step 3: Push and verify on GitHub**

```bash
git push
```

Go to `https://github.com/OliEder/bbb-ics-generator/actions` and verify:
- Workflow "Run Tests" appears
- Calendar update commits (only touching `generated/`) do NOT trigger this workflow
- After a run: Artifacts section shows `playwright-report` — click to download and open `index.html`

---

## Task 5: Add .superpowers to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add entry**

Open `.gitignore` and add:

```
.superpowers/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm directory"
```
