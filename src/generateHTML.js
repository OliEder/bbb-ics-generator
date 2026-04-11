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

  const compStyle = cup ? ` style="color:${escapeHtml(cupColor)};font-weight:600"` : '';
  const compText  = escapeHtml(match.competition);

  const resultText = match.result ? escapeHtml(match.result) : '–';

  let resultClass = 'schedule-result';
  if (match.result) {
    const parts = match.result.split(':');
    if (parts.length === 2) {
      const own = parseInt(parts[match.isHome ? 0 : 1], 10);
      const opp = parseInt(parts[match.isHome ? 1 : 0], 10);
      if (!isNaN(own) && !isNaN(opp)) {
        resultClass += own > opp ? ' schedule-result--win' : ' schedule-result--loss';
      }
    }
  }

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
    `<span class="${badgeClass}">${badgeLabel}</span>` +
    `<span class="schedule-opponent">${dateLabel} · ${escapeHtml(match.opponent)}${nextLabel}</span>` +
    `<span class="schedule-competition"${compStyle}>${compText}</span>` +
    `<span class="${resultClass}">${resultText}</span>` +
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

function sortTeams(teams) {
  function sortKey(t) {
    const ag = String(t.ageGroup || '').trim().toUpperCase();
    if (!ag || ag === 'HERREN' || (t.teamName || '').toLowerCase().includes('herren')) return 0;
    const m = ag.match(/^U(\d+)$/);
    return m ? 1000 - parseInt(m[1], 10) : 2000;
  }
  return [...teams].sort((a, b) => sortKey(a) - sortKey(b));
}

function buildNavigation(teams, activePage) {
  const sorted = sortTeams(teams);
  const homeActive = activePage === 'index';
  const homeLink = `<a href="${homeActive ? '#' : '../index.html'}"${homeActive ? ' aria-current="page"' : ''}>Startseite</a>`;
  const teamLinks = sorted.map(t => {
    const active = activePage === t.teamId;
    const href = homeActive
      ? `teams/${escapeHtml(t.teamId)}.html`
      : `${escapeHtml(t.teamId)}.html`;
    const label = t.ageGroup ? escapeHtml(t.ageGroup) : escapeHtml(t.teamName);
    return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('');

  return `<nav class="site-nav" aria-label="Seitennavigation">
  <div class="nav-bar">
    <a class="nav-logo" href="${homeActive ? '#' : '../index.html'}">Fibalon Baskets Neumarkt</a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="nav-drawer" aria-label="Menü öffnen">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div id="nav-drawer" class="nav-drawer" hidden>
    ${homeLink}
    ${teamLinks}
  </div>
</nav>`;
}

function buildTeaserCard(team) {
  const logoHtml = team.logoUrl
    ? `<img src="${escapeHtml(team.logoUrl)}" alt="" class="team-logo" aria-hidden="true">`
    : `<div class="team-logo-placeholder" aria-hidden="true"></div>`;

  const allMatches = Array.isArray(team.matches) ? team.matches : [];
  const pastMatches = allMatches.filter(m => m.result).slice(-3);
  const nextMatch   = allMatches.find(m => m.isNext);

  const resultRows = [...pastMatches].reverse().map(m =>
    `<div class="teaser-result">` +
    `<span class="teaser-opponent">${escapeHtml(m.opponent)}</span>` +
    `<span class="teaser-score">${escapeHtml(m.result)}</span>` +
    `</div>`
  ).join('');

  const nextHtml = nextMatch
    ? `<div class="teaser-next">Nächstes: ${escapeHtml(String(nextMatch.date || '').slice(5).split('-').reverse().join('.'))} · ${escapeHtml(nextMatch.opponent)}</div>`
    : '';

  return `<div class="teaser-card">
  <div class="teaser-header">
    ${logoHtml}
    <span class="teaser-team-name">${team.ageGroup ? escapeHtml(team.ageGroup) : escapeHtml(team.teamName)}${team.ageGroup ? `<small> ${escapeHtml(team.teamName)}</small>` : ''}</span>
  </div>
  <div class="teaser-results">${resultRows}</div>
  ${nextHtml}
  <a class="teaser-link" href="teams/${escapeHtml(team.teamId)}.html">Zum Team →</a>
</div>`;
}

function buildStandingsTable(comp) {
  if (!comp.table) {
    return `<p class="comp-unavailable">Tabelle noch nicht verfügbar.</p>`;
  }
  const rows = comp.table.map(row =>
    `<tr${row.isOwn ? ' class="standings-own"' : ''}>` +
    `<td>${escapeHtml(String(row.rank))}</td>` +
    `<td>${escapeHtml(row.teamName)}</td>` +
    `<td>${escapeHtml(String(row.played))}</td>` +
    `<td>${escapeHtml(String(row.won))}</td>` +
    `<td>${escapeHtml(String(row.lost))}</td>` +
    `<td>${escapeHtml(String(row.points))}</td>` +
    `</tr>`
  ).join('');
  return `<table class="standings-table" aria-label="${escapeHtml(comp.liganame)} Tabelle">` +
    `<thead><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>N</th><th>Pkt.</th></tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `</table>`;
}

function buildBracket(comp) {
  if (!comp.bracket) {
    return `<p class="comp-unavailable">Bracket noch nicht verfügbar.</p>`;
  }
  const rounds = comp.bracket.map(round => {
    const matches = (round.matches || []).map(m => {
      const homeClass = m.homeWon === true ? ' bracket-winner' : (m.homeBye ? ' bracket-bye' : '');
      const guestClass = m.homeWon === false ? ' bracket-winner' : (m.guestBye ? ' bracket-bye' : '');
      return `<div class="bracket-match">` +
        `<div class="bracket-team${homeClass}">${escapeHtml(m.home)}</div>` +
        `<div class="bracket-team${guestClass}">${escapeHtml(m.guest)}</div>` +
        `</div>`;
    }).join('');
    return `<div class="bracket-round">` +
      `<div class="bracket-round-name">${escapeHtml(round.roundName)}</div>` +
      matches +
      `</div>`;
  }).join('');
  return `<div class="bracket" aria-label="${escapeHtml(comp.liganame)} Bracket">${rounds}</div>`;
}

function buildSharedStyles(primary, accent, cupColor) {
  return `<style>
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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--color-surface); color: var(--color-text); min-height: 100vh; }
    /* Navigation */
    .site-nav { background: var(--color-primary); }
    .nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
    .nav-logo { color: var(--color-on-primary); font-weight: 700; font-size: 1rem; text-decoration: none; }
    .nav-toggle { background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
    .nav-toggle span { display: block; width: 22px; height: 2px; background: var(--color-on-primary); border-radius: 1px; }
    .nav-drawer { background: var(--color-surface-card); border-bottom: 1px solid var(--color-border); padding: 8px 0; }
    .nav-drawer a { display: block; padding: 10px 16px; color: var(--color-text); text-decoration: none; font-weight: 500; font-size: 0.9rem; }
    .nav-drawer a[aria-current="page"] { background: var(--color-tab-active-bg); color: var(--color-primary); font-weight: 700; }
    .nav-drawer a:hover { background: var(--color-primary-light); }
    /* Header */
    header { background: var(--color-primary); color: var(--color-on-primary); padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
    .club-logo { height: 48px; width: 48px; object-fit: contain; background: white; border-radius: 8px; padding: 4px; flex-shrink: 0; }
    .header-text h1 { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
    .header-text p  { font-size: 0.78rem; opacity: 0.75; margin-top: 2px; }
    /* Main layout */
    main { max-width: 760px; margin: 0 auto; padding: 20px 16px; }
    /* Teaser grid */
    .teaser-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 600px) { .teaser-grid { grid-template-columns: 1fr 1fr; align-items: stretch; } }
    .teaser-card { border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
    .teaser-header { background: var(--color-primary); color: var(--color-on-primary); padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
    .teaser-team-name { font-weight: 700; font-size: 0.92rem; flex: 1; }
    .teaser-results { flex: 1; padding: 8px 14px; }
    .teaser-result { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--color-border); font-size: 0.82rem; }
    .teaser-score { font-weight: 600; }
    .teaser-next { background: var(--color-next-bg); border: 1px solid var(--color-next-border); border-radius: 6px; margin: 6px 14px; padding: 6px 10px; font-size: 0.78rem; font-weight: 600; color: var(--color-text); }
    .teaser-link { display: block; text-align: right; padding: 8px 14px; color: var(--color-primary); font-size: 0.82rem; font-weight: 600; text-decoration: none; }
    /* Team page */
    .team-page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .team-page-title { font-size: 1.3rem; font-weight: 700; color: var(--color-text); }
    .team-page-club { font-size: 0.78rem; color: var(--color-text); margin-top: 1px; }
    .team-page-meta { font-size: 0.75rem; color: var(--color-text); margin-top: 2px; }
    .comp-section { margin-bottom: 24px; }
    .comp-heading { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); border-left: 3px solid var(--color-primary); padding-left: 10px; margin-bottom: 10px; }
    .comp-heading--cup { color: var(--color-cup); border-left-color: var(--color-cup); }
    .comp-unavailable { font-size: 0.82rem; color: var(--color-text); padding: 8px 0; }
    /* Standings */
    .standings-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 4px; }
    .standings-table th { text-align: left; color: var(--color-text); font-weight: 600; border-bottom: 1px solid var(--color-border); padding: 4px 8px; }
    .standings-table td { padding: 4px 8px; border-bottom: 1px solid var(--color-border); }
    .standings-own { background: var(--color-badge-home-bg); font-weight: 600; }
    /* Bracket */
    .bracket { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
    .bracket-round { min-width: 120px; }
    .bracket-round-name { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--color-text); margin-bottom: 8px; }
    .bracket-match { border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .bracket-team { padding: 5px 8px; font-size: 0.8rem; border-bottom: 1px solid var(--color-border); }
    .bracket-team:last-child { border-bottom: none; }
    .bracket-winner { background: var(--color-badge-home-bg); font-weight: 600; }
    .bracket-bye { opacity: 0.45; }
    /* Schedule (reused from existing) */
    .schedule-section { margin-bottom: 16px; }
    .team-card { border-radius: 10px; border: 1px solid var(--color-border); overflow: hidden; margin-bottom: 12px; }
    .team-card-header { background: var(--color-primary); color: var(--color-on-primary); padding: 11px 14px; display: flex; align-items: center; gap: 10px; }
    .team-logo { width: 32px; height: 32px; object-fit: contain; background: rgba(255,255,255,0.15); border-radius: 6px; padding: 3px; flex-shrink: 0; }
    .team-logo-placeholder { width: 32px; height: 32px; border-radius: 6px; background: rgba(255,255,255,0.15); flex-shrink: 0; }
    .team-name { font-weight: 700; font-size: 0.92rem; flex: 1; }
    .team-name small { font-weight: 400; opacity: 0.75; }
    .tab-bar { display: flex; border-bottom: 1px solid var(--color-border); background: var(--color-surface-card); }
    .tab-bar button { flex: 1; padding: 9px 4px; border: none; background: transparent; font-size: 0.78rem; font-weight: 600; color: var(--color-text); cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .tab-bar button[aria-selected="true"] { color: var(--color-primary); background: var(--color-tab-active-bg); border-bottom-color: var(--color-primary); }
    .tab-bar button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
    .tab-panel { padding: 12px 14px; }
    .tab-panel[hidden] { display: none; }
    .schedule-list { margin-bottom: 12px; }
    .schedule-header { font-size: 0.72rem; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
    .schedule-row { display: flex; align-items: center; gap: 8px; padding: 7px 6px; border-radius: 6px; }
    .schedule-row--past { color: color-mix(in srgb, var(--color-primary) 75%, white); }
    .schedule-next { background: var(--color-next-bg); border: 1px solid var(--color-next-border); padding: 8px 8px; }
    .badge { border-radius: 4px; padding: 3px 7px; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; min-width: 24px; text-align: center; }
    .badge--home { background: var(--color-badge-home-bg); color: var(--color-primary); }
    .badge--away { background: var(--color-badge-away-bg); color: #b84a00; }
    .badge--cup  { background: color-mix(in srgb, var(--color-cup) 15%, white); color: var(--color-cup); }
    .schedule-opponent { flex: 1; font-size: 0.88rem; color: var(--color-text); min-width: 0; }
    .schedule-next .schedule-opponent { font-weight: 600; }
    .schedule-next-label { font-size: 0.75rem; font-weight: 600; color: var(--color-primary); margin-left: 4px; }
    .schedule-competition { font-size: 0.75rem; color: var(--color-text); white-space: nowrap; }
    .schedule-result { font-size: 0.88rem; font-weight: 600; white-space: nowrap; min-width: 44px; text-align: right; color: var(--color-text); }
    .schedule-result--win  { color: #1a7f3c; }
    .schedule-result--loss { color: #b91c1c; }
    @media (prefers-color-scheme: dark) {
      .schedule-result--win  { color: #4ade80; }
      .schedule-result--loss { color: #f87171; }
    }
    .btn-group { display: flex; flex-direction: column; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--color-surface); color: var(--color-primary); border: 1.5px solid var(--color-border); padding: 9px 14px; border-radius: 7px; font-size: 0.82rem; font-weight: 600; text-decoration: none; transition: background 0.15s, border-color 0.15s; }
    .btn:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
    .btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      .btn { background: transparent; color: var(--color-accent-muted); border-color: var(--color-border); }
      .btn:hover { background: var(--color-surface-card); }
      .badge--cup { background: color-mix(in srgb, var(--color-cup) 25%, black); color: color-mix(in srgb, var(--color-cup) 80%, white); }
      .badge--away { color: color-mix(in srgb, #b84a00 80%, white); }
    }
    .schedule-legend { margin-top: 8px; padding: 10px 14px; font-size: 0.75rem; color: var(--color-text); display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
    .schedule-legend span { display: flex; align-items: center; gap: 5px; }
  </style>`;
}

function buildTabScript() {
  return `<script>
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
        if (next !== -1) { e.preventDefault(); activateTab(tabs[next]); }
      });
      tabs.forEach(function(tab) { tab.addEventListener('click', function() { activateTab(tab); }); });
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
  </script>`;
}

function buildNavScript() {
  return `<script>
    var toggle = document.querySelector('.nav-toggle');
    var drawer = document.getElementById('nav-drawer');
    if (toggle && drawer) {
      toggle.addEventListener('click', function() {
        var open = drawer.hidden;
        drawer.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  </script>`;
}

function buildTeamPage(team, allTeams, theme) {
  const { primary, accent, cupColor } = theme;

  const logoHtml = team.logoUrl
    ? `<img src="${escapeHtml(team.logoUrl)}" alt="" class="team-logo" aria-hidden="true">`
    : `<div class="team-logo-placeholder" aria-hidden="true"></div>`;

  const lastUpdate = team.lastUpdate
    ? new Date(team.lastUpdate).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
    : '–';

  const competitions = Array.isArray(team.competitions) ? team.competitions : [];
  const compBlocks = competitions.map(comp => {
    const headingClass = isLiga(comp.liganame) ? 'comp-heading' : 'comp-heading comp-heading--cup';
    const body = isLiga(comp.liganame)
      ? buildStandingsTable(comp)
      : buildBracket(comp);
    return `<section class="comp-section">
  <h2 class="${headingClass}">${escapeHtml(comp.liganame)}</h2>
  ${body}
</section>`;
  }).join('');

  const variants = [
    { type: 'all',  count: Number(team.matchCount) },
    { type: 'home', count: Number(team.homeMatchCount) },
    { type: 'away', count: Number(team.awayMatchCount) },
  ];
  const tabs = variants.map(({ type, count }) => {
    const label    = type === 'all' ? `Alle (${count})` : type === 'home' ? `Heim (${count})` : `Auswärts (${count})`;
    const selected = type === 'all' ? 'true' : 'false';
    const tabindex = type === 'all' ? '0' : '-1';
    return `<button id="tab-${escapeHtml(team.teamId)}-${type}" role="tab" aria-selected="${selected}" aria-controls="panel-${escapeHtml(team.teamId)}-${type}" tabindex="${tabindex}">${label}</button>`;
  }).join('');

  const panels = variants.map(({ type }) =>
    buildTabPanel(
      team.teamId, type,
      makeWebcalLink(`${team.teamId}_${type}.ics`),
      makeGoogleCalLink(`${team.teamId}_${type}.ics`),
      makeHttpsLink(`${team.teamId}_${type}.ics`),
      team.matches || [],
      cupColor,
    )
  ).join('');

  const nav = buildNavigation(allTeams, team.teamId);

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${team.ageGroup ? escapeHtml(team.ageGroup) + ' – ' : ''}${escapeHtml(team.teamName)}</title>
  ${buildSharedStyles(primary, accent, cupColor)}
</head>
<body>
  ${nav}
  <main>
    <div class="team-page-header">
      ${logoHtml}
      <div>
        <h1 class="team-page-title">${team.ageGroup ? escapeHtml(team.ageGroup) : escapeHtml(team.teamName)}</h1>
        ${team.ageGroup ? `<p class="team-page-club">${escapeHtml(team.teamName)}</p>` : ''}
        <p class="team-page-meta">Stand: ${lastUpdate}</p>
      </div>
    </div>
    ${compBlocks}
    <section class="schedule-section">
      <div class="tab-bar" role="tablist" aria-label="Spielvariante für ${escapeHtml(team.teamName)}">
        ${tabs}
      </div>
      ${panels}
    </section>
    <div class="schedule-legend">
      <span><span class="badge badge--home">H</span> Heimspiel (Liga)</span>
      <span><span class="badge badge--away">A</span> Auswärtsspiel (Liga)</span>
      <span><span class="badge badge--cup">H/A</span> Pokal / Cup</span>
    </div>
  </main>
  ${buildTabScript()}
  ${buildNavScript()}
</body>
</html>`;
}

function buildIndexPage(teams, theme) {
  const { primary, accent, cupColor, logoUrl } = theme;
  const sorted = sortTeams(teams);
  const nav = buildNavigation(teams, 'index');
  const headerLogoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Vereinslogo" class="club-logo">`
    : '';

  const teasers = sorted.map(t => buildTeaserCard(t)).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fibalon Baskets Neumarkt – Spielplan</title>
  ${buildSharedStyles(primary, accent, cupColor)}
</head>
<body>
  ${nav}
  <header>
    ${headerLogoHtml}
    <div class="header-text">
      <h1>Basketball Spielplan</h1>
      <p>Spielplan-Kalender · alle Teams</p>
    </div>
  </header>
  <main>
    <div class="teaser-grid">
      ${teasers}
    </div>
  </main>
  ${buildNavScript()}
</body>
</html>`;
}


function genHTML(theme = {}) {
  const primary  = sanitizeCssColor(theme.primary  || '#004174');
  const accent   = sanitizeCssColor(theme.accent   || '#009ef3');
  const cupColor = sanitizeCssColor(theme.cupColor || '#7c3aed');
  const logoUrl  = theme.logoUrl || null;

  const resolvedTheme = { primary, accent, cupColor, logoUrl };

  const generatedDir = process.env.BBB_GENERATED_DIR || process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams    = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];

  // Write index.html
  fs.writeFileSync(path.join(generatedDir, 'index.html'), buildIndexPage(teams, resolvedTheme), 'utf8');

  // Write teams/{teamId}.html
  const teamsDir = path.join(generatedDir, 'teams');
  fs.mkdirSync(teamsDir, { recursive: true });
  for (const team of teams) {
    fs.writeFileSync(
      path.join(teamsDir, `${team.teamId}.html`),
      buildTeamPage(team, teams, resolvedTheme),
      'utf8'
    );
  }
}

module.exports = { genHTML };
module.exports._testExports = { sortTeams, buildNavigation, buildTeaserCard, buildStandingsTable, buildBracket, buildNavScript, buildSharedStyles, buildTabScript, buildTeamPage, buildIndexPage };

if (require.main === module) {
  const config = require('../config.json');
  genHTML({
    primary:  config.theme?.primary  || '#004174',
    accent:   config.theme?.accent   || '#009ef3',
    logoUrl:  config.theme?.logoUrl  || null,
    cupColor: config.theme?.cupColor || '#7c3aed',
  });
}
