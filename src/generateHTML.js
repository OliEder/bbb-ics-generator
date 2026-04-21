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

// Returns an HTML span with a visible symbol and a screen-reader label.
// The symbol alone is unreliably pronounced by screen readers.
// Returns "Teamname [Altersklasse] ♂/♀/⚥" — Senioren/Herren ohne Altersklasse
function teamLabel(teamName, ageGroup, gender) {
  const ag = String(ageGroup || '').trim().toUpperCase();
  const isSenioren = ag === 'SENIOREN' || ag === 'HERREN' || !ag;
  const sym = genderSpan(gender);
  const agPart = (!isSenioren && ageGroup) ? ` ${escapeHtml(ageGroup)}` : '';
  return `${escapeHtml(teamName || '')}${agPart}${sym ? ` ${sym}` : ''}`;
}

function genderSpan(gender) {
  if (!gender) return '';
  const g = String(gender).toLowerCase().trim();
  let icon, label;
  if (g === 'männlich' || g === 'male' || g === 'm')                      { icon = 'fa-mars';        label = 'männlich'; }
  else if (g === 'weiblich' || g === 'female' || g === 'w' || g === 'f') { icon = 'fa-venus';       label = 'weiblich'; }
  else if (g === 'mix' || g === 'mixed')                                  { icon = 'fa-venus-mars';  label = 'gemischt'; }
  else return '';
  return `<i class="fa-solid ${icon} gender-sym" aria-label="${label}" title="${label}"></i>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICON_WIN = `<svg class="result-icon result-icon--win" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sieg"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6z"/></svg>`;
const ICON_LOSS = `<svg class="result-icon result-icon--loss" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" role="img" aria-label="Niederlage"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function isWin(match) {
  if (!match.result) return null;
  const parts = match.result.split(':');
  if (parts.length !== 2) return null;
  const own = parseInt(parts[match.isHome ? 0 : 1], 10);
  const opp = parseInt(parts[match.isHome ? 1 : 0], 10);
  if (isNaN(own) || isNaN(opp)) return null;
  if (own === opp) return null;
  return own > opp;
}

function resultIcon(match) {
  const win = isWin(match);
  if (win === null) return '';
  return win ? ICON_WIN : ICON_LOSS;
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

  const icon = match.result ? resultIcon(match) : '';

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
    `<span class="${badgeClass}">${badgeLabel}</span>` +
    `<div class="schedule-row-content">` +
      `<div class="schedule-row-main">` +
        `<span class="schedule-opponent">${dateLabel} · ${escapeHtml(match.opponent)}${nextLabel}</span>` +
        icon +
        `<span class="schedule-result">${resultText}</span>` +
      `</div>` +
      `<div class="schedule-competition"${compStyle}>${compText}</div>` +
    `</div>` +
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
const ICON_COPY     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

function buildCalHelp() {
  return `<details class="cal-help">
  <summary class="cal-help__summary">Kalender abonnieren – wie funktioniert das?</summary>
  <div class="cal-help__body">
    <p>Mit einem Kalender-Abo werden neue Spiele und Änderungen automatisch in deiner Kalender-App angezeigt – du musst nichts manuell aktualisieren.</p>
    <dl>
      <dt>${ICON_APPLE} iOS / macOS Kalender</dt>
      <dd>Tippe auf „iOS / macOS Kalender". Der Spielplan wird direkt in der Kalender-App geöffnet. Beim Abonnieren kannst du festlegen, ob Erinnerungen für die Spiele aktiviert werden sollen. <a href="https://support.apple.com/de-at/guide/iphone/iph3d1110d4/18.0/ios/18.0" target="_blank" rel="noopener">Apple Support ↗</a></dd>
      <dt>${ICON_ANDROID} Google Kalender</dt>
      <dd>Tippe auf „Google Calendar". Das Abo muss einmalig in der Google Kalender <strong>Web-App</strong> eingerichtet werden – danach synchronisiert es sich automatisch auf allen Geräten. Erinnerungen lassen sich in den Einstellungen des abonnierten Kalenders anpassen. Hinweis: Es kann bis zu 12 Stunden dauern, bis Änderungen erscheinen. <a href="https://support.google.com/calendar/answer/37100?hl=de&amp;co=GENIE.Platform%3DDesktop" target="_blank" rel="noopener">Google Support ↗</a></dd>
      <dt>${ICON_COPY} Outlook</dt>
      <dd>Klicke auf „Link kopieren" und füge die URL in Outlook ein: Kalender → „Aus dem Internet abonnieren" → Link einfügen. Der Spielplan bleibt automatisch aktuell. Hinweis: Änderungen können bis zu 24 Stunden brauchen, bis sie in Outlook erscheinen. <a href="https://support.microsoft.com/de-de/office/importieren-oder-abonnieren-eines-kalenders-in-outlook-im-web-503ffaf6-7b86-44fe-8dd6-8099d95f38df" target="_blank" rel="noopener">Microsoft Support ↗</a></dd>
      <dt>${ICON_DOWNLOAD} Andere Apps (ICS)</dt>
      <dd>Lade die Kalenderdatei einmalig herunter – geeignet für Apps ohne Abo-Funktion. Erinnerungen müssen dort manuell eingestellt werden.</dd>
    </dl>
  </div>
</details>`;
}

function buildTabPanel(teamId, type, webcalLink, googleLink, httpsLink, matches, cupColor) {
  const id     = `panel-${teamId}-${type}`;
  const tabId  = `tab-${teamId}-${type}`;
  const hidden = type !== 'all' ? ' hidden' : '';
  const schedule = buildSchedule(matches, type, cupColor);
  const subHeading = type === 'all'
    ? 'Kalender für alle Spiele abonnieren'
    : type === 'home'
      ? 'Kalender nur für Heimspiele abonnieren'
      : 'Kalender nur für Auswärtsspiele abonnieren';
  return `
    <div id="${id}" role="tabpanel" aria-labelledby="${tabId}" class="tab-panel"${hidden}>
      ${schedule}
      <h3 class="cal-section-heading">${subHeading}</h3>
      ${buildCalHelp()}
      <div class="btn-group">
        <a href="${escapeHtml(webcalLink)}" class="btn">${ICON_APPLE} In iOS / macOS Kalender abonnieren</a>
        <a href="${escapeHtml(googleLink)}" class="btn">${ICON_ANDROID} In Google Calendar abonnieren</a>
        <button class="btn btn--copy" data-copy-url="${escapeHtml(httpsLink)}">${ICON_COPY} Link kopieren</button>
        <a href="${escapeHtml(httpsLink)}" class="btn" download>${ICON_DOWNLOAD} ICS herunterladen</a>
      </div>
    </div>`;
}

function sortTeams(teams) {
  function sortKey(t) {
    const ag = String(t.ageGroup || '').trim().toUpperCase();
    if (!ag || ag === 'HERREN' || ag === 'SENIOREN' || (t.teamName || '').toLowerCase().includes('herren')) return 0;
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
    const label = teamLabel(t.teamName, t.ageGroup, t.gender);
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
  const played     = allMatches.filter(m => m.result);
  const pastCount  = Math.min(played.length, 3);
  const pastMatches = played.slice(-pastCount);
  // How many upcoming matches to show: fill up to 4 total rows
  const upcomingCount = Math.max(0, 4 - pastCount);
  const upcomingMatches = allMatches.filter(m => !m.result).slice(0, upcomingCount);
  const nextMatch   = allMatches.find(m => m.isNext);

  // Streak: count consecutive wins or losses from most recent played match
  // Streak as subtle info text (e.g. "3 Siege in Folge" / "2 Niederlagen in Folge")
  let streakText = '';
  if (played.length > 0) {
    const ownScore = m => {
      const p = (m.result || '').split(':');
      if (p.length !== 2) return null;
      const own = parseInt(p[m.isHome ? 0 : 1], 10);
      const opp = parseInt(p[m.isHome ? 1 : 0], 10);
      return (!isNaN(own) && !isNaN(opp)) ? own > opp : null;
    };
    const last = ownScore(played[played.length - 1]);
    if (last !== null) {
      let count = 0;
      for (let i = played.length - 1; i >= 0; i--) {
        if (ownScore(played[i]) === last) count++;
        else break;
      }
      if (count > 1) {
        streakText = last ? `${count} Siege` : `${count} Niederlagen`;
      }
    }
  }

  const renderMatch = m => {
    const badgeClass = isLiga(m.competition)
      ? (m.isHome ? 'badge badge--home' : 'badge badge--away')
      : 'badge badge--cup';
    const badgeLabel = m.isHome ? 'H' : 'A';
    const prefix = m.isHome ? 'vs.' : '@';
    const oppName = escapeHtml(m.opponent || '');
    const duel = `${prefix} ${oppName}`;
    if (m.result) {
      return `<div class="teaser-result">` +
        `<span class="${badgeClass}">${badgeLabel}</span>` +
        `<span class="teaser-opponent">${duel}</span>` +
        resultIcon(m) +
        `<span class="teaser-score">${escapeHtml(m.result)}</span>` +
        `</div>`;
    } else {
      const dateStr = escapeHtml(String(m.date || '').slice(5).split('-').reverse().join('.'));
      return `<div class="teaser-result teaser-result--upcoming">` +
        `<span class="${badgeClass}">${badgeLabel}</span>` +
        `<span class="teaser-opponent">${duel}</span>` +
        `<span class="teaser-date">${dateStr}</span>` +
        `</div>`;
    }
  };

  const resultRows = [...pastMatches].reverse().map(renderMatch).join('');
  // Show upcoming matches inline when pastCount < 3; skip nextMatch itself if already in upcomingMatches
  const upcomingRows = upcomingMatches.map(renderMatch).join('');

  // Show teaser-next bar when 3 past results (upcoming shown in bar, not inline)
  // or when no next match but season had matches (season over)
  const futureMatches = allMatches.filter(m => !m.result);
  const nextHtml = (nextMatch && pastCount >= 3)
    ? `<div class="teaser-next">Nächstes: ${escapeHtml(String(nextMatch.date || '').slice(5).split('-').reverse().join('.'))} · <span class="teaser-next-venue">${nextMatch.isHome ? 'Heim' : 'Auswärts'}</span> · ${escapeHtml(nextMatch.opponent)}</div>`
    : (!nextMatch && played.length > 0 && futureMatches.length === 0)
    ? `<div class="teaser-next teaser-next--empty">Keine weiteren Spiele geplant</div>`
    : '';

  return `<div class="teaser-card">
  <div class="teaser-header">
    ${logoHtml}
    <span class="teaser-team-name">${teamLabel(team.teamName, team.ageGroup, team.gender)}</span>
  </div>
  ${streakText ? `<div class="teaser-streak-info"><span class="teaser-streak-label">Serie:</span> ${escapeHtml(streakText)}</div>` : ''}
  <div class="teaser-results">${resultRows}${upcomingRows}</div>
  ${nextHtml}
  <a class="teaser-link" href="teams/${escapeHtml(team.teamId)}.html">Zum Team →</a>
</div>`;
}

function buildStandingsTable(comp) {
  if (!comp.table) {
    return `<p class="comp-unavailable">Tabelle noch nicht verfügbar.</p>`;
  }
  const table = comp.table;
  const leader = table[0];

  const officialRows = table.map(row => {
    const diff = (row.korbdiff ?? 0) > 0 ? `+${row.korbdiff}` : String(row.korbdiff ?? 0);
    return `<tr${row.isOwn ? ' class="standings-own"' : ''}>` +
      `<td class="standings-rank">${escapeHtml(String(row.rank))}</td>` +
      `<td>${escapeHtml(row.teamName)}</td>` +
      `<td class="standings-num">${escapeHtml(String(row.played))}</td>` +
      `<td class="standings-num">${escapeHtml(String(row.points))}</td>` +
      `<td class="standings-num">${escapeHtml(String(row.won))}</td>` +
      `<td class="standings-num">${escapeHtml(String(row.lost))}</td>` +
      `<td class="standings-num standings-diff">${escapeHtml(diff)}</td>` +
      `</tr>`;
  }).join('');

  // GB = Games Behind leader: ((leaderW - teamW) + (teamL - leaderL)) / 2
  const gbRows = [...table]
    .map(row => {
      const gb = row === leader
        ? null
        : ((leader.won - row.won) + (row.lost - leader.lost)) / 2;
      return { ...row, gb };
    })
    .sort((a, b) => (a.gb ?? -1) - (b.gb ?? -1))
    .map((row, i) => {
      const diff = (row.korbdiff ?? 0) > 0 ? `+${row.korbdiff}` : String(row.korbdiff ?? 0);
      const gbCell = row.gb === null ? '–' : (Number.isInteger(row.gb) ? String(row.gb) : row.gb.toFixed(1));
      return `<tr${row.isOwn ? ' class="standings-own"' : ''}>` +
        `<td class="standings-rank">${i + 1}</td>` +
        `<td>${escapeHtml(row.teamName)}</td>` +
        `<td class="standings-num">${escapeHtml(String(row.played))}</td>` +
        `<td class="standings-num">${escapeHtml(String(row.points))}</td>` +
        `<td class="standings-num">${escapeHtml(String(row.won))}</td>` +
        `<td class="standings-num">${escapeHtml(String(row.lost))}</td>` +
        `<td class="standings-num standings-gb">${escapeHtml(gbCell)}</td>` +
        `<td class="standings-num standings-diff">${escapeHtml(diff)}</td>` +
        `</tr>`;
    }).join('');

  const tableId = `standings-${escapeHtml(String(comp.ligaId || comp.liganame))}`;
  return `<div class="standings-tabs">` +
    `<div class="standings-tab-bar" role="tablist">` +
    `<button class="standings-tab-btn standings-tab-btn--active" role="tab" data-target="${tableId}-official" aria-selected="true">Offizielle Tabelle</button>` +
    `<button class="standings-tab-btn" role="tab" data-target="${tableId}-gb" aria-selected="false">Ranking nach GB</button>` +
    `</div>` +
    `<div id="${tableId}-official" class="standings-panel">` +
    `<table class="standings-table" aria-label="${escapeHtml(comp.liganame)} Tabelle">` +
    `<thead><tr><th class="standings-rank">#</th><th>Team</th><th class="standings-num">Sp</th><th class="standings-num">GP</th><th class="standings-num">S</th><th class="standings-num">N</th><th class="standings-num">+/−</th></tr></thead>` +
    `<tbody>${officialRows}</tbody></table></div>` +
    `<div id="${tableId}-gb" class="standings-panel" hidden>` +
    `<table class="standings-table" aria-label="${escapeHtml(comp.liganame)} Ranking nach GB">` +
    `<thead><tr><th class="standings-rank">#</th><th>Team</th><th class="standings-num">Sp</th><th class="standings-num">GP</th><th class="standings-num">S</th><th class="standings-num">N</th><th class="standings-num">GB</th><th class="standings-num">+/−</th></tr></thead>` +
    `<tbody>${gbRows}</tbody></table></div>` +
    `</div>`;
}

function buildBracket(comp, ownTeamName) {
  if (!comp.bracket) {
    return `<p class="comp-unavailable">Bracket noch nicht verfügbar.</p>`;
  }
  const isOwn = name => ownTeamName && name && name.toLowerCase().includes(ownTeamName.toLowerCase().split(' ')[0].toLowerCase());
  const rounds = comp.bracket.map(round => {
    const matches = (round.matches || []).map(m => {
      const isTbd = name => name === 'TBD';
      const homeWinner = m.homeWon === true;
      const guestWinner = m.homeWon === false;
      const homeClass = [
        'bracket-team',
        homeWinner ? ' bracket-winner' : '',
        m.homeBye ? ' bracket-bye' : '',
        isOwn(m.home) ? ' bracket-own' : '',
        isTbd(m.home) ? ' bracket-tbd' : '',
      ].join('');
      const guestClass = [
        'bracket-team',
        guestWinner ? ' bracket-winner' : '',
        m.guestBye ? ' bracket-bye' : '',
        isOwn(m.guest) ? ' bracket-own' : '',
        isTbd(m.guest) ? ' bracket-tbd' : '',
      ].join('');
      const resultHtml = m.result
        ? `<div class="bracket-result">${escapeHtml(m.result)}</div>`
        : '';
      return `<div class="bracket-match">` +
        `<div class="${homeClass}">${escapeHtml(m.home)}</div>` +
        `<div class="${guestClass}">${escapeHtml(m.guest)}</div>` +
        resultHtml +
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
      --color-text-muted: color-mix(in srgb, var(--color-primary) 80%, white);
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
    .site-nav { background: var(--color-primary); position: sticky; top: 0; z-index: 100; }
    .nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
    .nav-logo { color: var(--color-on-primary); font-weight: 700; font-size: 1rem; text-decoration: none; }
    .nav-toggle { background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
    .nav-toggle span { display: block; width: 22px; height: 2px; background: var(--color-on-primary); border-radius: 1px; }
    .nav-drawer { background: var(--color-surface-card); border-bottom: 1px solid var(--color-border); padding: 8px 0; }
    .nav-drawer a { display: block; padding: 10px 16px; color: var(--color-text); text-decoration: none; font-weight: 500; font-size: 0.9rem; text-align: right; }
    .nav-drawer a[aria-current="page"] { background: var(--color-tab-active-bg); color: var(--color-primary); font-weight: 700; }
    .nav-drawer a:hover { background: var(--color-primary-light); }
    .club-logo { height: 48px; width: 48px; object-fit: contain; background: white; border-radius: 8px; padding: 4px; flex-shrink: 0; }
    /* Main layout */
    main { max-width: 760px; margin: 0 auto; padding: 20px 16px; }
    /* Teaser grid */
    .teaser-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 600px) { .teaser-grid { grid-template-columns: 1fr 1fr; align-items: stretch; } }
    .teaser-card { border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
    .teaser-header { background: var(--color-primary); color: var(--color-on-primary); padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
    .teaser-team-name { font-weight: 700; font-size: 0.92rem; flex: 1; }
    .gender-sym { font-size: 0.78em; opacity: 0.8; }
    .teaser-team-name .gender-sym, .team-page-title .gender-sym { font-size: 0.8em; }
    .teaser-streak-info { font-size: 0.82rem; color: var(--color-text); padding: 6px 14px 0; }
    .teaser-streak-label { font-weight: 700; }
    .teaser-results { flex: 1; padding: 8px 14px; }
    .teaser-result { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--color-border); font-size: 0.82rem; }
    .teaser-opponent { flex: 1; text-align: left; }
    .teaser-score { font-weight: 600; }
    .teaser-date { font-size: 0.78rem; color: var(--color-text-muted); }
    .teaser-result--upcoming { opacity: 0.75; }
    .teaser-next { background: var(--color-next-bg); border: 1px solid var(--color-next-border); border-radius: 6px; margin: 6px 14px; padding: 6px 10px; font-size: 0.78rem; font-weight: 600; color: var(--color-text); }
    .teaser-next--empty { font-weight: 400; opacity: 0.7; }
    .teaser-next-venue { opacity: 0.7; font-weight: 400; }
    .teaser-link { display: block; text-align: right; padding: 8px 14px; color: var(--color-primary); font-size: 0.82rem; font-weight: 600; text-decoration: none; }
    /* Team page */
    .team-page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .team-page-title { font-size: 1.3rem; font-weight: 700; color: var(--color-text); }
    .team-page-meta { font-size: 0.75rem; color: var(--color-text); margin-top: 2px; }
    .comp-section { margin-bottom: 24px; }
    .comp-heading { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); border-left: 3px solid var(--color-primary); padding-left: 10px; margin-bottom: 10px; }
    .comp-heading--cup { color: var(--color-cup); border-left-color: var(--color-cup); }
    .comp-unavailable { font-size: 0.82rem; color: var(--color-text); padding: 8px 0; }
    /* Standings */
    .standings-tabs { margin-bottom: 4px; }
    .standings-tab-bar { display: flex; gap: 4px; margin-bottom: 8px; }
    .standings-tab-btn { background: var(--color-surface-card); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 0.8rem; font-weight: 500; color: var(--color-text); cursor: pointer; }
    .standings-tab-btn--active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); font-weight: 700; }
    .standings-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 4px; }
    .standings-table th { text-align: left; color: var(--color-text); font-weight: 600; border-bottom: 1px solid var(--color-border); padding: 4px 8px; }
    .standings-table th.standings-num { text-align: right; }
    .standings-table th.standings-rank { text-align: center; }
    .standings-table td { padding: 4px 8px; border-bottom: 1px solid var(--color-border); }
    .standings-num { text-align: right; }
    .standings-rank { text-align: center; font-weight: 600; }
    .standings-diff { color: var(--color-text); }
    .standings-gb { font-weight: 700; }
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
    .bracket-own { outline: 2px solid var(--color-primary); outline-offset: -2px; font-weight: 700; }
    .bracket-tbd { color: var(--color-text); opacity: 0.4; font-style: italic; }
    .bracket-result { padding: 2px 8px; font-size: 0.75rem; text-align: center; background: var(--color-surface); color: var(--color-text); opacity: 0.6; border-top: 1px solid var(--color-border); }
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
    .schedule-row { display: flex; align-items: flex-start; gap: 8px; padding: 7px 6px; border-radius: 6px; }
    .schedule-row--past { color: color-mix(in srgb, var(--color-primary) 75%, white); }
    .schedule-next { background: var(--color-next-bg); border: 1px solid var(--color-next-border); padding: 8px 8px; }
    .badge { border-radius: 4px; padding: 3px 7px; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; min-width: 24px; text-align: center; }
    .badge--home { background: var(--color-badge-home-bg); color: var(--color-primary); }
    .badge--away { background: var(--color-badge-away-bg); color: #7a3000; }
    .badge--cup  { background: color-mix(in srgb, var(--color-cup) 15%, white); color: var(--color-cup); }
    .schedule-row-content { flex: 1; min-width: 0; }
    .schedule-row-main { display: flex; align-items: center; gap: 6px; }
    .schedule-opponent { flex: 1; font-size: 0.88rem; color: var(--color-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .schedule-next .schedule-opponent { font-weight: 600; }
    .schedule-next-label { font-size: 0.75rem; font-weight: 600; color: var(--color-primary); margin-left: 4px; }
    .schedule-competition { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px; }
    .schedule-result { font-size: 0.88rem; font-weight: 600; white-space: nowrap; min-width: 44px; text-align: right; color: var(--color-text); }
    .result-icon { width: 14px; height: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .result-icon--win  { color: var(--color-text); }
    .result-icon--loss { color: var(--color-text-muted); }
    .cal-section-heading { font-size: 0.85rem; font-weight: 700; color: var(--color-text); margin: 16px 0 8px; }
    .btn-group { display: flex; flex-direction: column; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--color-surface); color: var(--color-primary); border: 1.5px solid var(--color-border); padding: 9px 14px; border-radius: 7px; font-size: 0.82rem; font-weight: 600; text-decoration: none; transition: background 0.15s, border-color 0.15s; cursor: pointer; font-family: inherit; }
    .btn:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
    .btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    .btn--copy--copied { color: #1a7a3f; border-color: #1a7a3f; }
    .cal-help { margin-top: 16px; margin-bottom: 8px; border: 1px solid var(--color-border); border-radius: 7px; font-size: 0.82rem; }
    .cal-help__summary { padding: 10px 14px; font-weight: 600; color: var(--color-primary); cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
    .cal-help__summary::-webkit-details-marker { display: none; }
    .cal-help__summary::before { content: '▶'; font-size: 0.65em; transition: transform 0.15s; }
    details[open] .cal-help__summary::before { transform: rotate(90deg); }
    .cal-help__body { padding: 0 14px 14px; }
    .cal-help__body p { color: var(--color-text); margin-bottom: 12px; line-height: 1.5; }
    .cal-help__body dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: baseline; }
    .cal-help__body dt { font-weight: 700; color: var(--color-text); white-space: nowrap; display: flex; align-items: center; gap: 5px; padding-top: 4px; }
    .cal-help__body dd { color: var(--color-text); line-height: 1.5; padding-top: 4px; border-top: 1px solid var(--color-border); }
    .cal-help__body dd:first-of-type { border-top: none; }
    .cal-help__body a { color: var(--color-primary); text-decoration: underline; white-space: nowrap; }
    .cal-help__body a:hover { opacity: 0.8; }
    @media (prefers-color-scheme: dark) {
      .btn { background: transparent; color: var(--color-accent-muted); border-color: var(--color-border); }
      .btn:hover { background: var(--color-surface-card); }
      .badge--cup { background: color-mix(in srgb, var(--color-cup) 25%, black); color: color-mix(in srgb, var(--color-cup) 80%, white); }
      .badge--away { color: color-mix(in srgb, #b84a00 70%, white); }
    }
    .schedule-legend { margin-top: 8px; padding: 10px 14px; font-size: 0.75rem; color: var(--color-text); display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
    .schedule-legend span { display: flex; align-items: center; gap: 5px; }
    /* Next game teaser */
    .next-game { background: var(--color-surface-card); border: 1px solid var(--color-border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
    .next-game-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; }
    .next-game-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary); margin: 0; }
    /* Matchup layout */
    .next-game-matchup { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px 8px; }
    .next-game-team { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; text-align: center; }
    .next-game-team--opp { }
    .next-game-team-name { font-size: 0.88rem; font-weight: 700; color: var(--color-text); line-height: 1.2; word-break: break-word; }
    .next-game-team-logo { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; background: var(--color-surface); padding: 4px; border: 1px solid var(--color-border); }
    .next-game-team-logo-placeholder { width: 64px; height: 64px; border-radius: 8px; background: var(--color-border); flex-shrink: 0; }
    .next-game-vs { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; padding: 0 4px; }
    .next-game-vs-label { font-size: 1rem; font-weight: 800; color: var(--color-text-muted); }
    .next-game-kickoff { font-size: 0.82rem; font-weight: 600; color: var(--color-text); text-align: center; }
    .next-game-kickoff-time { font-size: 0.78rem; color: var(--color-text-muted); text-align: center; }
    .next-game-competition-row { font-size: 0.78rem; color: var(--color-text-muted); text-align: center; padding: 0 16px 10px; }
    /* Legacy selectors (unused but kept for safety) */
    .next-game-details { padding: 8px 16px 12px; }
    .next-game-datetime { font-size: 0.82rem; color: var(--color-text-muted); margin-bottom: 4px; }
    .next-game-duel { font-size: 1.1rem; font-weight: 700; margin-bottom: 2px; }
    .next-game-competition { font-size: 0.78rem; color: var(--color-text-muted); }
    .next-game-venue { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--color-border); font-size: 0.82rem; }
    .next-game-venue-icon { font-size: 1rem; flex-shrink: 0; margin-top: 2px; }
    .next-game-venue-info { display: flex; flex-direction: column; gap: 4px; }
    .next-game-nav-links { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
    .next-game-nav-btn { display: inline-block; padding: 4px 10px; background: var(--color-primary); color: #fff; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-decoration: none; }
    .next-game-nav-btn:hover { opacity: 0.85; }
    .next-game-map { height: 220px; border-top: 1px solid var(--color-border); position: relative; z-index: 0; }
    .next-game-no-games { font-size: 0.85rem; color: var(--color-text-muted); padding: 0 0 4px; }
    /* Spotlight block */
    .spotlight { margin-bottom: 24px; border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; }
    .spotlight-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary); padding: 12px 16px 6px; margin: 0; }
    .spotlight .tab-bar { border-radius: 0; }
    .spotlight-panel { padding: 4px 16px 12px; }
    .spotlight-panel[hidden] { display: none; }
    .spotlight-date-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); padding: 8px 0 2px; }
    .spotlight-row { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--color-border); }
    .spotlight-row:last-child { border-bottom: none; }
    .spotlight-row .badge { margin-top: 2px; flex-shrink: 0; }
    .spotlight-info { flex: 1; min-width: 0; }
    .spotlight-line1 { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }
    .spotlight-line2 { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--color-text); margin-top: 1px; }
    .spotlight-line3 { font-size: 0.72rem; color: var(--color-text); margin-top: 1px; }
    .spotlight-time { white-space: nowrap; color: var(--color-text); min-width: 36px; }
    .spotlight-team { font-weight: 700; color: var(--color-text); white-space: nowrap; }
    .spotlight-result { display: flex; align-items: center; align-self: stretch; font-weight: 700; white-space: nowrap; color: var(--color-text); font-size: 0.92rem; padding-left: 8px; flex-shrink: 0; }
    .spotlight-vs { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .spotlight-empty { font-size: 0.85rem; color: var(--color-text-muted); padding: 8px 0; }
    .site-footer { padding: 16px; text-align: center; font-size: 0.78rem; color: var(--color-text-muted); border-top: 1px solid var(--color-border); margin-top: 24px; }
    .site-footer a { color: var(--color-primary); text-decoration: none; }
    .site-footer a:hover { text-decoration: underline; }
    .legal-page { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
    .legal-page h1 { font-size: 1.4rem; margin-bottom: 8px; color: var(--color-text); }
    .legal-page h2 { font-size: 1.05rem; margin: 20px 0 6px; color: var(--color-text); }
    .legal-page p, .legal-page li { font-size: 0.9rem; line-height: 1.6; color: var(--color-text); }
    .legal-page ul { padding-left: 20px; }
    .legal-page a { color: var(--color-primary); }
  </style>`;
}

function buildTabScript() {
  return `<script>
    document.querySelectorAll('.btn--copy').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var url = btn.getAttribute('data-copy-url');
        if (!url) return;
        var origNodes = Array.from(btn.childNodes).map(function(n) { return n.cloneNode(true); });
        navigator.clipboard.writeText(url).then(function() {
          btn.textContent = '✓ Link kopiert';
          btn.classList.add('btn--copy--copied');
          setTimeout(function() {
            btn.textContent = '';
            origNodes.forEach(function(n) { btn.appendChild(n.cloneNode(true)); });
            btn.classList.remove('btn--copy--copied');
          }, 2000);
        });
      });
    });
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
    document.querySelectorAll('.standings-tab-bar').forEach(function(bar) {
      var btns = Array.from(bar.querySelectorAll('.standings-tab-btn'));
      btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          btns.forEach(function(b) {
            b.classList.remove('standings-tab-btn--active');
            b.setAttribute('aria-selected', 'false');
            var p = document.getElementById(b.getAttribute('data-target'));
            if (p) p.hidden = true;
          });
          btn.classList.add('standings-tab-btn--active');
          btn.setAttribute('aria-selected', 'true');
          var panel = document.getElementById(btn.getAttribute('data-target'));
          if (panel) panel.hidden = false;
        });
      });
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

function buildNextGameTeaser(team) {
  const allMatches = Array.isArray(team.matches) ? team.matches : [];
  const nextMatch = allMatches.find(m => m.isNext);

  if (!nextMatch) {
    // Only show "no more games" if there were matches this season
    if (allMatches.length === 0) return '';
    return `<section class="next-game next-game--empty">
  <div class="next-game-header">
    <h2 class="next-game-title">Nächstes Spiel</h2>
  </div>
  <div class="next-game-details">
    <div class="next-game-no-games">Aktuell sind keine weiteren Spiele geplant.</div>
  </div>
</section>`;
  }

  const badgeClass = isLiga(nextMatch.competition)
    ? (nextMatch.isHome ? 'badge badge--home' : 'badge badge--away')
    : 'badge badge--cup';
  const badgeLabel = nextMatch.isHome ? 'Heim' : 'Auswärts';

  // Full date with weekday for the prominent teaser
  const dateObj = nextMatch.date ? new Date(nextMatch.date + 'T12:00:00') : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
    : '';
  const timeStr = nextMatch.time ? `${escapeHtml(nextMatch.time)} Uhr` : '';

  // Home team left, guest team right — regardless of which is "own"
  const homeName = escapeHtml(nextMatch.isHome ? team.teamName : nextMatch.opponent);
  const guestName = escapeHtml(nextMatch.isHome ? nextMatch.opponent : team.teamName);
  const homeLogoUrl = nextMatch.isHome ? team.logoUrl : nextMatch.opponentLogoUrl;
  const guestLogoUrl = nextMatch.isHome ? nextMatch.opponentLogoUrl : team.logoUrl;
  const homeLogo = homeLogoUrl
    ? `<img src="${escapeHtml(homeLogoUrl)}" alt="${homeName}" class="next-game-team-logo">`
    : `<div class="next-game-team-logo-placeholder"></div>`;
  const guestLogo = guestLogoUrl
    ? `<img src="${escapeHtml(guestLogoUrl)}" alt="${guestName}" class="next-game-team-logo">`
    : `<div class="next-game-team-logo-placeholder"></div>`;

  const hasVenue = !!(nextMatch.venueAddress && nextMatch.venueAddress.trim());
  const encodedAddr = hasVenue ? encodeURIComponent(nextMatch.venueAddress) : '';
  const mapId = `ngm-${escapeHtml(team.teamId)}`;

  const venueHtml = hasVenue ? `
  <div class="next-game-venue">
    <span class="next-game-venue-icon" aria-hidden="true">📍</span>
    <div class="next-game-venue-info">
      ${nextMatch.venueName ? `<strong>${escapeHtml(nextMatch.venueName)}</strong><br>` : ''}
      <span>${escapeHtml(nextMatch.venueAddress)}</span>
      <div class="next-game-nav-links">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}" target="_blank" rel="noopener" class="next-game-nav-btn">Google Maps ↗</a>
        <a href="https://maps.apple.com/?daddr=${encodedAddr}" target="_blank" rel="noopener" class="next-game-nav-btn">Apple Maps ↗</a>
      </div>
    </div>
  </div>
  <div id="${mapId}" class="next-game-map" data-address="${escapeHtml(nextMatch.venueAddress)}" data-venue="${escapeHtml(nextMatch.venueName || '')}"></div>
  <script>
  (function() {
    var el = document.getElementById('${mapId}');
    if (!el) return;
    var addr = el.getAttribute('data-address');
    var venue = el.getAttribute('data-venue') || addr;
    if (!addr) { el.style.display = 'none'; return; }
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(addr), {
      headers: { 'Accept-Language': 'de', 'User-Agent': 'bbb-ics-generator/1.0' }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data[0]) { el.style.display = 'none'; return; }
      var lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      var map = L.map(el).setView([lat, lon], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      L.marker([lat, lon]).addTo(map).bindPopup(venue).openPopup();
    })
    .catch(function() { el.style.display = 'none'; });
  })();
  </script>` : '';

  return `<section class="next-game">
  <div class="next-game-header">
    <h2 class="next-game-title">Nächstes Spiel</h2>
    <span class="${badgeClass}">${badgeLabel}</span>
  </div>
  <div class="next-game-matchup">
    <div class="next-game-team">
      ${homeLogo}
      <span class="next-game-team-name">${homeName}</span>
    </div>
    <div class="next-game-vs">
      <span class="next-game-vs-label">vs.</span>
      <div class="next-game-kickoff">${escapeHtml(dateStr)}</div>
      ${timeStr ? `<div class="next-game-kickoff-time">${timeStr}</div>` : ''}
    </div>
    <div class="next-game-team next-game-team--opp">
      ${guestLogo}
      <span class="next-game-team-name">${guestName}</span>
    </div>
  </div>
  <div class="next-game-competition-row">${escapeHtml(nextMatch.competition)}</div>${venueHtml}
</section>`;
}

// Short label for a team in the spotlight: age group only, with suffix for duplicates.
// E.g. "U16", "U16 2" when two U16 teams exist.
function spotlightTeamLabel(team, allTeams) {
  const ag = String(team.ageGroup || '').trim() || 'Senioren';
  const sameAg = allTeams.filter(t => String(t.ageGroup || '').trim() === ag);
  if (sameAg.length <= 1) return ag;
  // Number them by their order in the sorted list
  const idx = sameAg.findIndex(t => t.teamId === team.teamId);
  return `${ag} ${idx + 1}`;
}

function buildSpotlightBlock(teams, cupColor) {
  const allEntries = teams.flatMap(team =>
    (Array.isArray(team.spotlightMatches) ? team.spotlightMatches : []).map(m => ({ m, team }))
  ).sort((a, b) => {
    const da = (a.m.date || '') + (a.m.time || '');
    const db = (b.m.date || '') + (b.m.time || '');
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const homeEntries = allEntries.filter(e => e.m.isHome);
  const awayEntries = allEntries.filter(e => !e.m.isHome);

  const renderRows = (entries) => {
    let lastDate = null;
    const rows = [];
    for (const { m, team } of entries) {
      const cup = !isLiga(m.competition);
      const badgeClass = cup ? 'badge badge--cup' : (m.isHome ? 'badge badge--home' : 'badge badge--away');
      const badgeLabel = m.isHome ? 'H' : 'A';

      // Date separator heading
      const dateKey = m.date || '';
      if (dateKey !== lastDate) {
        lastDate = dateKey;
        const [, mo, d] = dateKey.split('-');
        const heading = (d && mo) ? `${d}.${mo}.` : escapeHtml(dateKey);
        rows.push(`<div class="spotlight-date-heading">${heading}</div>`);
      }

      const shortLabel = escapeHtml(spotlightTeamLabel(team, teams));
      const genderHtml = genderSpan(team.gender);
      const opponent = escapeHtml(m.opponent || (m.opponentShort || ''));
      const vsPrefix = m.isHome ? 'vs.' : '@';
      const timeHtml = m.time
        ? `<span class="spotlight-time">${escapeHtml(m.time)}</span>`
        : '';

      const resultInner = m.result ? escapeHtml(m.result) : '';
      const icon = m.result ? resultIcon(m) : '';

      const line3 = m.competition
        ? `<div class="spotlight-line3">${escapeHtml(m.competition)}</div>`
        : '';

      rows.push(
        `<div class="spotlight-row">` +
          `<span class="${badgeClass}">${badgeLabel}</span>` +
          `<div class="spotlight-info">` +
            `<div class="spotlight-line1">` +
              timeHtml +
              `<span class="spotlight-team">${shortLabel}${genderHtml ? ` ${genderHtml}` : ''}</span>` +
            `</div>` +
            `<div class="spotlight-line2">` +
              `<span class="spotlight-vs">${vsPrefix}&nbsp;${opponent}</span>` +
            `</div>` +
            line3 +
          `</div>` +
          (resultInner ? `${icon}<div class="spotlight-result">${resultInner}</div>` : '') +
        `</div>`
      );
    }
    return rows.join('');
  };

  const renderPanel = (id, entries, hidden) => {
    const content = entries.length
      ? renderRows(entries)
      : `<p class="spotlight-empty">Aktuell keine Spiele geplant.</p>`;
    return `<div id="${id}" role="tabpanel" class="spotlight-panel"${hidden ? ' hidden' : ''}>${content}</div>`;
  };

  return `<section class="spotlight">
  <h2 class="spotlight-title">Nächste Spiele</h2>
  <div class="tab-bar" role="tablist" aria-label="Spielfilter">
    <button role="tab" aria-selected="true"  aria-controls="spotlight-all"  tabindex="0">Alle</button>
    <button role="tab" aria-selected="false" aria-controls="spotlight-home" tabindex="-1">Heim</button>
    <button role="tab" aria-selected="false" aria-controls="spotlight-away" tabindex="-1">Auswärts</button>
  </div>
  ${renderPanel('spotlight-all',  allEntries,  false)}
  ${renderPanel('spotlight-home', homeEntries, true)}
  ${renderPanel('spotlight-away', awayEntries, true)}
</section>`;
}

function buildTeamPage(team, allTeams, theme, legal = {}) {
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
      : buildBracket(comp, team.teamName);
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
  <title>${escapeHtml(team.teamName)}${team.ageGroup && !/^(senioren|herren)$/i.test(team.ageGroup) ? ' ' + escapeHtml(team.ageGroup) : ''}</title>
  ${buildSharedStyles(primary, accent, cupColor)}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg==" crossorigin="anonymous">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
</head>
<body>
  ${nav}
  <main>
    <div class="team-page-header">
      ${logoHtml}
      <div>
        <h1 class="team-page-title">${teamLabel(team.teamName, team.ageGroup, team.gender)}</h1>
        <p class="team-page-meta">Stand: ${lastUpdate}</p>
      </div>
    </div>
    ${buildNextGameTeaser(team)}
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
  ${buildFooter(legal, '../')}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  ${buildTabScript()}
  ${buildNavScript()}
</body>
</html>`;
}

function buildFooter(legal, relativePath) {
  const hasImpressum = legal && Object.values(legal).some(v => v && String(v).trim());
  const safeRel = escapeHtml(relativePath);
  const impressumLink = hasImpressum
    ? ` &middot; <a href="${safeRel}impressum.html">Impressum</a>`
    : '';
  return `<footer role="contentinfo" class="site-footer">
  <span>Quelle: <a href="https://www.basketball-bund.net" target="_blank" rel="noopener">basketball-bund.net</a></span>${impressumLink}
  &middot; <a href="${safeRel}datenschutz.html">Datenschutz</a>
  &middot; <a href="${safeRel}barrierefreiheit.html">Barrierefreiheit</a>
</footer>`;
}

function buildIndexPage(teams, theme, legal = {}) {
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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg==" crossorigin="anonymous">
</head>
<body>
  ${nav}
  <main>
    <div class="team-page-header">
      ${headerLogoHtml}
      <div>
        <h1 class="team-page-title">Basketball Spielplan</h1>
        <p class="team-page-meta">Spielplan-Kalender · alle Teams</p>
      </div>
    </div>
    ${buildSpotlightBlock(sorted, cupColor)}
    <div class="teaser-grid">
      ${teasers}
    </div>
  </main>
  ${buildFooter(legal, './')}
  ${buildTabScript()}
  ${buildNavScript()}
</body>
</html>`;
}


function buildLegalSkeleton(title, content, allTeams, theme, legal) {
  const { primary, accent, cupColor } = theme;
  const nav = buildNavigation(allTeams, 'index');
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${buildSharedStyles(primary, accent, cupColor)}
</head>
<body>
  ${nav}
  <main class="legal-page">
    ${content}
  </main>
  ${buildFooter(legal, './')}
  ${buildNavScript()}
</body>
</html>`;
}

function buildImpressum(legal, allTeams, theme) {
  const op      = escapeHtml(legal.operator    || '');
  const addr    = escapeHtml(legal.address     || '');
  const email   = escapeHtml(legal.email       || '');
  const phone   = escapeHtml(legal.phone       || '');
  const resp    = escapeHtml(legal.responsible || '');
  const phoneRow = phone ? `<p><strong>Telefon:</strong> ${phone}</p>` : '';
  const respRow  = resp  ? `<p><strong>Verantwortlich:</strong> ${resp}</p>` : '';
  const content = `
<h1>Impressum</h1>
<p>Angaben gemäß § 5 TMG</p>
<p><strong>Betreiber:</strong> ${op}</p>
<p><strong>Adresse:</strong> ${addr}</p>
${phoneRow}
<p><strong>E-Mail:</strong> ${email}</p>
${respRow}
<h2>Haftungshinweis</h2>
<p>Diese Seite aggregiert öffentlich verfügbare Spielplandaten von
<a href="https://www.basketball-bund.net" target="_blank" rel="noopener">basketball-bund.net</a>.
Für die Richtigkeit der Daten wird keine Gewähr übernommen.</p>`;
  return buildLegalSkeleton('Impressum', content, allTeams, theme, legal);
}

function buildDatenschutz(legal, allTeams, theme) {
  const op    = escapeHtml(legal.operator || '');
  const email = escapeHtml(legal.email    || '');
  const year  = new Date().getFullYear();
  const content = `
<h1>Datenschutzerklärung</h1>
<p>Stand: ${year}</p>
<h2>Verantwortlicher</h2>
<p>${op || 'Siehe Impressum'}</p>
<h2>Datenerhebung</h2>
<p>Diese Website erhebt selbst keine personenbezogenen Daten, setzt keine Cookies und verwendet kein Tracking.</p>
<h2>Technische Drittanbieter</h2>
<p>Beim Aufruf dieser Seite werden Verbindungen zu folgenden externen Diensten hergestellt, dabei werden technisch notwendige Daten (u.&thinsp;a. IP-Adressen) übertragen:</p>
<ul>
  <li><strong>cdnjs.cloudflare.com</strong> — Bereitstellung von Font-Awesome-Icons (CSS- und Schriftdateien)</li>
  <li><strong>basketball-bund.net</strong> — Spielplandaten und Team-Logos (Datenquelle)</li>
  <li><strong>nominatim.openstreetmap.org</strong> — Geocodierung von Spielfeldern (clientseitig, nur bei Aufruf einer Teamseite)</li>
</ul>
<h2>Auskunft und Löschung</h2>
<p>${email ? `Anfragen richten Sie bitte per E-Mail an: <a href="mailto:${email}">${email}</a>` : 'Bitte wenden Sie sich an den Seitenbetreiber (siehe Impressum).'}</p>`;
  return buildLegalSkeleton('Datenschutzerklärung', content, allTeams, theme, legal);
}

function buildBarrierefreiheit(legal, allTeams, theme) {
  const email = escapeHtml(legal.email || '');
  const year  = new Date().getFullYear();
  const content = `
<h1>Barrierefreiheitserklärung</h1>
<p>Stand: ${year}</p>
<h2>Konformitätsstatus</h2>
<p>Diese Website ist <strong>teilweise konform</strong> mit der WCAG 2.1 Stufe AA.</p>
<h2>Nicht konforme Bereiche</h2>
<p>Es wurde kein formales BITV-Audit oder offizielles WCAG-Audit durchgeführt. Folgende bekannte Einschränkungen bestehen:</p>
<ul>
  <li>Teamlogos werden extern von basketball-bund.net geladen — alternativer Text kann nicht garantiert werden.</li>
  <li>Die Darstellung bei stark vergrößertem Text (über 200&thinsp;%) wurde nicht vollständig getestet.</li>
</ul>
<h2>Feedback und Kontakt</h2>
<p>${email ? `Bei Problemen mit der Barrierefreiheit wenden Sie sich bitte an: <a href="mailto:${email}">${email}</a>` : 'Bitte wenden Sie sich an den Seitenbetreiber (siehe Impressum).'}</p>
<h2>Durchsetzungsverfahren</h2>
<p>Wenn Sie nach Kontaktaufnahme keine zufriedenstellende Antwort erhalten haben, können Sie die
<a href="https://www.schlichtungsstelle-bgg.de/" target="_blank" rel="noopener">Schlichtungsstelle nach dem Behindertengleichstellungsgesetz (BGG)</a> einschalten.</p>`;
  return buildLegalSkeleton('Barrierefreiheitserklärung', content, allTeams, theme, legal);
}

function genHTML(theme = {}, legal = {}) {
  const primary  = sanitizeCssColor(theme.primary  || '#004174');
  const accent   = sanitizeCssColor(theme.accent   || '#009ef3');
  const cupColor = sanitizeCssColor(theme.cupColor || '#7c3aed');
  const logoUrl  = theme.logoUrl || null;

  const resolvedTheme = { primary, accent, cupColor, logoUrl };

  const generatedDir = process.env.BBB_GENERATED_DIR || process.env.BBB_ICS_DIR || path.resolve(__dirname, '../generated');
  const metaPath = path.join(generatedDir, 'metadata.json');
  const teams    = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];

  // Write index.html
  fs.writeFileSync(path.join(generatedDir, 'index.html'), buildIndexPage(teams, resolvedTheme, legal), 'utf8');

  // Write teams/{teamId}.html
  const teamsDir = path.join(generatedDir, 'teams');
  fs.mkdirSync(teamsDir, { recursive: true });
  for (const team of teams) {
    fs.writeFileSync(
      path.join(teamsDir, `${team.teamId}.html`),
      buildTeamPage(team, teams, resolvedTheme, legal),
      'utf8'
    );
  }

  // Write legal pages
  fs.writeFileSync(path.join(generatedDir, 'datenschutz.html'), buildDatenschutz(legal, teams, resolvedTheme), 'utf8');
  fs.writeFileSync(path.join(generatedDir, 'barrierefreiheit.html'), buildBarrierefreiheit(legal, teams, resolvedTheme), 'utf8');
  const hasLegal = legal && Object.values(legal).some(v => v && String(v).trim());
  if (hasLegal) {
    fs.writeFileSync(path.join(generatedDir, 'impressum.html'), buildImpressum(legal, teams, resolvedTheme), 'utf8');
  }
}

module.exports = { genHTML };
module.exports._testExports = { sortTeams, buildNavigation, buildTeaserCard, buildStandingsTable, buildBracket, buildNavScript, buildSharedStyles, buildTabScript, buildTeamPage, buildIndexPage, buildNextGameTeaser, buildSpotlightBlock, spotlightTeamLabel, buildFooter, buildImpressum, buildDatenschutz, buildBarrierefreiheit, buildCalHelp, buildTabPanel, isWin, resultIcon };

if (require.main === module) {
  const config = require('../config.json');
  genHTML(
    {
      primary:  config.theme?.primary  || '#004174',
      accent:   config.theme?.accent   || '#009ef3',
      logoUrl:  config.theme?.logoUrl  || null,
      cupColor: config.theme?.cupColor || '#7c3aed',
    },
    config.legal || {}
  );
}
