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

const ICON_APPLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

const ICON_ANDROID = `<svg width="14" height="17" viewBox="-147 -70 294 345" aria-hidden="true"><g fill="currentColor"><ellipse cy="41" rx="91" ry="84"/><rect rx="22" height="182" width="182" y="20" x="-91"/><rect rx="24" height="133" width="48" y="41" x="-143"/><rect rx="24" height="133" width="48" y="41" x="95"/><rect rx="6.5" transform="rotate(29)" height="86" width="13" y="-86" x="14"/><rect rx="6.5" transform="rotate(-29)" height="86" width="13" y="-86" x="-27"/></g><g fill="white"><circle cx="-42" cy="41" r="9"/><circle cx="42" cy="41" r="9"/></svg>`;

const ICON_DOWNLOAD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function genHTML(theme = {}) {
  const primary = escapeHtml(theme.primary || '#004174');
  const accent  = escapeHtml(theme.accent  || '#009ef3');
  const logoUrl = theme.logoUrl || null;

  const generatedDir = process.env.BBB_GENERATED_DIR || process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];

  const logoHtml = logoUrl
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
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .club-logo {
      height: 52px;
      width: 52px;
      object-fit: contain;
      background: white;
      border-radius: 8px;
      padding: 4px;
      flex-shrink: 0;
    }
    .header-text h1 {
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .header-text p {
      font-size: 0.8rem;
      opacity: 0.8;
      margin-top: 2px;
    }
    .update-bar {
      background: var(--color-info-bg);
      border-bottom: 1px solid var(--color-info-border);
      padding: 6px 24px;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 20px 16px;
    }
    .team-card {
      background: var(--color-surface-card);
      border-radius: 10px;
      border-left: 4px solid var(--color-accent);
      padding: 16px;
      margin-bottom: 12px;
    }
    .team-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .team-name {
      font-weight: 700;
      font-size: 1rem;
      color: var(--color-text);
    }
    .team-badge {
      background: var(--color-badge-bg);
      color: var(--color-badge-text);
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 0.72rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .btn-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--color-surface);
      color: var(--color-primary);
      border: 1.5px solid var(--color-primary);
      padding: 7px 13px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
    }
    @media (prefers-color-scheme: dark) {
      .btn {
        background: transparent;
        color: var(--color-accent-muted);
        border-color: var(--color-accent-muted);
      }
    }
  </style>
</head>
<body>
  <header>
    ${logoHtml}
    <div class="header-text">
      <h1>Basketball Spielplan</h1>
      <p>Spielplan-Kalender</p>
    </div>
  </header>
  <div class="update-bar">
    Stand: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · Automatisch alle 6h aktualisiert
  </div>
  <main>
    ${teams.map(t => `
    <div class="team-card">
      <div class="team-header">
        <span class="team-name">${escapeHtml(t.teamName)} <small style="font-weight:400;opacity:.7">${escapeHtml(t.ageGroup)}</small></span>
        <span class="team-badge">${Number(t.matchCount)} Spiele · ${Number(t.homeMatchCount)} Heim · ${Number(t.awayMatchCount)} Auswärts</span>
      </div>
      <div class="btn-group">
        <a href="${escapeHtml(makeWebcalLink(t.teamId + '_all.ics'))}" class="btn">${ICON_APPLE} iOS / Mac</a>
        <a href="${escapeHtml(makeGoogleCalLink(t.teamId + '_all.ics'))}" class="btn">${ICON_ANDROID} Android</a>
        <a href="${escapeHtml(makeHttpsLink(t.teamId + '_all.ics'))}" class="btn" download>${ICON_DOWNLOAD} ICS</a>
      </div>
    </div>`).join('')}
  </main>
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
