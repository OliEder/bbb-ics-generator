'use strict';

const fs   = require('fs');
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

function isLiga(competition) {
  return String(competition || '').toLowerCase().includes('liga');
}

function buildScheduleRow(match, cupColor) {
  const cup = !isLiga(match.competition);
  const badgeClass = cup ? 'badge badge--cup' : (match.isHome ? 'badge badge--home' : 'badge badge--away');
  const badgeLabel = match.isHome ? 'H' : 'A';
  const badgeStyle = '';

  const compStyle = cup ? ` style="color:${escapeHtml(cupColor)};font-weight:600"` : '';
  const compText  = escapeHtml(match.competition);

  const resultText = match.result ? escapeHtml(match.result) : '–';

  const rowClass = match.isNext
    ? 'schedule-row schedule-next'
    : (match.result ? 'schedule-row schedule-row--past' : 'schedule-row');

  // Format date: 'YYYY-MM-DD' → 'DD.MM.'
  const dateParts = String(match.date || '').split('-');
  const dateLabel = dateParts.length === 3
    ? `${escapeHtml(dateParts[2])}.${escapeHtml(dateParts[1])}.`
    : escapeHtml(match.date);

  const nextLabel = match.isNext ? ' <span class="schedule-next-label">Nächstes →</span>' : '';

  return `<div class="${rowClass}">` +
    `<span class="${badgeClass}"${badgeStyle}>${badgeLabel}</span>` +
    `<span class="schedule-opponent">${dateLabel} · ${escapeHtml(match.opponent)}${nextLabel}</span>` +
    `<span class="schedule-competition"${compStyle}>${compText}</span>` +
    `<span class="schedule-result">${resultText}</span>` +
    `</div>`;
}

function buildSchedule(matches, filter, cupColor) {
  if (!Array.isArray(matches) || matches.length === 0) return '';

  const filtered = filter === 'home'
    ? matches.filter(m => m.isHome)
    : filter === 'away'
      ? matches.filter(m => !m.isHome)
      : matches;

  if (filtered.length === 0) return '';

  const rows = filtered.map(m => buildScheduleRow(m, cupColor)).join('');
  return `<div class="schedule-list">` +
    `<div class="schedule-header">SPIELPLAN 2025/26</div>` +
    rows +
    `</div>`;
}

const ICON_APPLE    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;
const ICON_ANDROID  = `<svg width="14" height="17" viewBox="-147 -70 294 345" aria-hidden="true"><g fill="currentColor"><ellipse cy="41" rx="91" ry="84"/><rect rx="22" height="182" width="182" y="20" x="-91"/><rect rx="24" height="133" width="48" y="41" x="-143"/><rect rx="24" height="133" width="48" y="41" x="95"/><rect rx="6.5" transform="rotate(29)" height="86" width="13" y="-86" x="14"/><rect rx="6.5" transform="rotate(-29)" height="86" width="13" y="-86" x="-27"/></g><g fill="white"><circle cx="-42" cy="41" r="9"/><circle cx="42" cy="41" r="9"/></svg>`;
const ICON_DOWNLOAD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function buildTabPanel(teamId, type, webcalLink, googleLink, httpsLink, matches, cupColor) {
  const id     = `panel-${teamId}-${type}`;
  const tabId  = `tab-${teamId}-${type}`;
  const hidden = type !== 'all' ? ' hidden' : '';
  const schedule = buildSchedule(matches, type, cupColor);
  return `
    <div id="${id}" role="tabpanel" aria-labelledby="${tabId}" class="tab-panel"${hidden}>
      ${schedule}
      <div class="btn-group">
        <a href="${escapeHtml(webcalLink)}" class="btn">${ICON_APPLE} iOS / macOS Kalender</a>
        <a href="${escapeHtml(googleLink)}" class="btn">${ICON_ANDROID} Google Calendar</a>
        <a href="${escapeHtml(httpsLink)}" class="btn" download>${ICON_DOWNLOAD} ICS herunterladen</a>
      </div>
    </div>`;
}

function buildTeamCard(t, cupColor) {
  const logoHtml = t.logoUrl
    ? `<img src="${escapeHtml(t.logoUrl)}" alt="" class="team-logo" aria-hidden="true">`
    : `<div class="team-logo-placeholder" aria-hidden="true"></div>`;

  const variants = [
    { type: 'all',  count: Number(t.matchCount) },
    { type: 'home', count: Number(t.homeMatchCount) },
    { type: 'away', count: Number(t.awayMatchCount) },
  ];

  const tabs = variants.map(({ type, count }) => {
    const label    = type === 'all' ? `Alle (${count})` : type === 'home' ? `Heim (${count})` : `Auswärts (${count})`;
    const selected = type === 'all' ? 'true' : 'false';
    const tabindex = type === 'all' ? '0' : '-1';
    return `<button id="tab-${t.teamId}-${type}" role="tab" aria-selected="${selected}" aria-controls="panel-${t.teamId}-${type}" tabindex="${tabindex}">${label}</button>`;
  }).join('');

  const panels = variants.map(({ type }) =>
    buildTabPanel(
      t.teamId, type,
      makeWebcalLink(`${t.teamId}_${type}.ics`),
      makeGoogleCalLink(`${t.teamId}_${type}.ics`),
      makeHttpsLink(`${t.teamId}_${type}.ics`),
      t.matches || [],
      cupColor,
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
  const primary  = sanitizeCssColor(theme.primary  || '#004174');
  const accent   = sanitizeCssColor(theme.accent   || '#009ef3');
  const cupColor = sanitizeCssColor(theme.cupColor || '#7c3aed');
  const logoUrl  = theme.logoUrl || null;

  const generatedDir = process.env.BBB_GENERATED_DIR || process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams    = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];

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
      --color-cup:     ${cupColor};
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
      --color-badge-home-bg: color-mix(in srgb, var(--color-primary) 12%, white);
      --color-badge-away-bg: color-mix(in srgb, #b84a00 12%, white);
      --color-next-bg: color-mix(in srgb, var(--color-accent) 15%, white);
      --color-next-border: color-mix(in srgb, var(--color-accent) 40%, white);
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
        --color-badge-home-bg: color-mix(in srgb, var(--color-primary) 25%, black);
        --color-badge-away-bg: color-mix(in srgb, #b84a00 25%, black);
        --color-next-bg: color-mix(in srgb, var(--color-accent) 20%, black);
        --color-next-border: color-mix(in srgb, var(--color-accent) 40%, black);
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
      height: 48px; width: 48px; object-fit: contain;
      background: white; border-radius: 8px; padding: 4px; flex-shrink: 0;
    }
    .header-text h1 { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
    .header-text p  { font-size: 0.78rem; opacity: 0.75; margin-top: 2px; }
    .update-bar {
      background: var(--color-info-bg);
      border-bottom: 1px solid var(--color-info-border);
      padding: 5px 20px;
      font-size: 0.72rem;
      color: var(--color-text);
    }
    main { max-width: 760px; margin: 0 auto; padding: 20px 16px; }
    .team-card {
      border-radius: 10px; border: 1px solid var(--color-border);
      overflow: hidden; margin-bottom: 12px;
    }
    .team-card-header {
      background: var(--color-primary); color: var(--color-on-primary);
      padding: 11px 14px; display: flex; align-items: center; gap: 10px;
    }
    .team-logo {
      width: 32px; height: 32px; object-fit: contain;
      background: rgba(255,255,255,0.15); border-radius: 6px; padding: 3px; flex-shrink: 0;
    }
    .team-logo-placeholder {
      width: 32px; height: 32px; border-radius: 6px;
      background: rgba(255,255,255,0.15); flex-shrink: 0;
    }
    .team-name { font-weight: 700; font-size: 0.92rem; flex: 1; }
    .team-name small { font-weight: 400; opacity: 0.75; }
    .team-badge {
      background: rgba(255,255,255,0.2); border-radius: 10px;
      padding: 2px 9px; font-size: 0.68rem; font-weight: 600; white-space: nowrap;
    }
    .tab-bar {
      display: flex; border-bottom: 1px solid var(--color-border);
      background: var(--color-surface-card);
    }
    .tab-bar button {
      flex: 1; padding: 9px 4px; border: none; background: transparent;
      font-size: 0.78rem; font-weight: 600; color: var(--color-text);
      cursor: pointer; border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .tab-bar button[aria-selected="true"] {
      color: var(--color-primary); background: var(--color-tab-active-bg);
      border-bottom-color: var(--color-primary);
    }
    .tab-bar button:focus-visible {
      outline: 2px solid var(--color-accent); outline-offset: -2px;
    }
    .tab-panel { padding: 12px 14px; }
    .tab-panel[hidden] { display: none; }
    /* Schedule */
    .schedule-list { margin-bottom: 12px; }
    .schedule-header {
      font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px;
    }
    .schedule-row {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 6px; border-radius: 6px;
    }
    .schedule-row--past { opacity: 0.55; }
    .schedule-next {
      background: var(--color-next-bg); border: 1px solid var(--color-next-border);
      padding: 8px 8px;
    }
    .badge {
      border-radius: 4px; padding: 3px 7px;
      font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
      min-width: 24px; text-align: center;
    }
    .badge--home { background: var(--color-badge-home-bg); color: var(--color-primary); }
    .badge--away { background: var(--color-badge-away-bg); color: #b84a00; }
    .badge--cup { background: color-mix(in srgb, var(--color-cup) 15%, white); color: var(--color-cup); }
    .schedule-opponent {
      flex: 1; font-size: 0.88rem; color: var(--color-text); min-width: 0;
    }
    .schedule-next .schedule-opponent { font-weight: 600; }
    .schedule-next-label {
      font-size: 0.75rem; font-weight: 600; color: var(--color-primary);
      margin-left: 4px;
    }
    .schedule-competition {
      font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap;
    }
    .schedule-result {
      font-size: 0.88rem; font-weight: 600; white-space: nowrap;
      min-width: 44px; text-align: right; color: var(--color-text);
    }
    /* Subscription buttons */
    .btn-group { display: flex; flex-direction: column; gap: 8px; }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--color-surface); color: var(--color-primary);
      border: 1.5px solid var(--color-border); padding: 9px 14px;
      border-radius: 7px; font-size: 0.82rem; font-weight: 600;
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
    .btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      .btn {
        background: transparent; color: var(--color-accent-muted);
        border-color: var(--color-border);
      }
      .btn:hover { background: var(--color-surface-card); }
      .badge--cup { background: color-mix(in srgb, var(--color-cup) 25%, black); color: color-mix(in srgb, var(--color-cup) 80%, white); }
    }
    /* Legend */
    .schedule-legend {
      margin-top: 8px; padding: 10px 14px;
      font-size: 0.75rem; color: var(--color-text-muted);
      display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
    }
    .schedule-legend span { display: flex; align-items: center; gap: 5px; }
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
    ${teams.map(t => buildTeamCard(t, cupColor)).join('')}
    <div class="schedule-legend">
      <span><span class="badge badge--home">H</span> Heimspiel (Liga)</span>
      <span><span class="badge badge--away">A</span> Auswärtsspiel (Liga)</span>
      <span><span class="badge badge--cup">H/A</span> Pokal / Cup</span>
    </div>
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
    primary:  config.theme?.primary  || '#004174',
    accent:   config.theme?.accent   || '#009ef3',
    logoUrl:  config.theme?.logoUrl  || null,
    cupColor: config.theme?.cupColor || '#7c3aed',
  });
}
