# Schedule Display in Team Cards — Design Spec

## Goal

Each team card on the generated `index.html` shows the full game schedule for the current season (2025/26), filtered per tab, above the subscription buttons.

## Context

The generated page already has three tabs per team card (Alle / Heim / Auswärts), each showing subscription buttons. This feature adds the season schedule to the top of each tab panel, filtered to match the tab's scope.

## Data Model

### New `matches` field in `metadata.json` (per team entry)

```json
{
  "teamId": "12345",
  "teamName": "Fibalon Baskets U16",
  "ageGroup": "U16",
  "lastUpdate": "...",
  "matchCount": 14,
  "homeMatchCount": 7,
  "awayMatchCount": 7,
  "logoUrl": "https://...",
  "matches": [
    {
      "date": "2025-10-12",
      "time": "15:00",
      "opponent": "TSV Musterstadt",
      "isHome": true,
      "result": "62:58",
      "competition": "Kreisliga Mittelfranken",
      "isNext": false
    }
  ]
}
```

**Field definitions:**
- `date`: ISO date string (`YYYY-MM-DD`) derived from `kickoffDate`
- `time`: time string (`HH:MM`) derived from `kickoffTime`
- `opponent`: name of the opposing team (home or guest depending on `isHome`)
- `isHome`: `true` if `homeTeam.teamPermanentId === t.id`
- `result`: score string `"heim:gast"` if match is played, `null` if not yet played
- `competition`: `match.ligaData?.liganame ?? ''`
- `isNext`: `true` for exactly one match — the first upcoming match (no result, earliest date)

**Filtering in `cronUpdate.js`:**
- Only matches where `match.ligaData?.seasonId === 2025`
- Sorted ascending by `kickoffDate` then `kickoffTime`
- All matches (home + away) included; `isHome` distinguishes them

## Config Extension

`config.json` gains an optional `cupColor` field (top-level, not inside `theme`):

```json
{
  "clubId": "4468",
  "cupColor": "#7c3aed"
}
```

- Default when absent: `#7c3aed` (purple)
- This color is used for all non-Liga competition names and their H/A badges
- Passed into the theme object as `cupColor`

**Liga detection heuristic:** A competition is a "Liga" type if `competition.toLowerCase()` contains `"liga"`. Everything else (Pokal, Final4, Cup, Turnier, …) is a cup competition.

## Visual Design

### Schedule table in each tab panel

Layout per row (flexbox):
```
[H/A badge] [date · opponent name]    [competition]    [result or –]
```

- **H/A badge**: small pill, `font-size: 0.75rem`, `font-weight: 700`
  - Liga-Heim: blue background (`#e8f0fe`), blue text (`--color-primary`)
  - Liga-Auswärts: orange background (`#fff3e0`), orange text (`#b84a00`)
  - Cup-Heim: light purple background, cup color text
  - Cup-Auswärts: light purple background, cup color text
- **Date + opponent**: `font-size: 0.88rem`, `flex: 1`
- **Competition**: `font-size: 0.75rem`, grey for Liga, cup color + `font-weight: 600` for cups
- **Result**: `font-size: 0.88rem`, `font-weight: 600`, right-aligned, `min-width: 44px`; `–` for unplayed

### Row states
- **Past** (result present): `opacity: 0.55`
- **Next** (isNext): highlighted blue row (`background: #dbeafe`, `border: 1px solid #93c5fd`), bold date+opponent, "Nächstes →" label
- **Future** (no result, not next): normal opacity, `–` as result

### Tab filtering
- Tab "Alle": all matches from `matches[]`
- Tab "Heim": only where `isHome === true`
- Tab "Auswärts": only where `isHome === false`

### Section header
Above the match rows: `"SPIELPLAN 2025/26"` in `font-size: 0.75rem`, uppercase, muted color.

### Legend
Below all team cards: `H Heimspiel (Liga)  A Auswärtsspiel (Liga)  H/A Pokal/Cup (lila)`

## Architecture Changes

### `config.json` (schema change)
Add optional top-level `cupColor` field.

### `src/cronUpdate.js`
1. After fetching `matches`, filter to `seasonId === 2025`
2. Sort ascending by date/time
3. Determine `isNext`: first match without a result
4. Map each match to the metadata schema above
5. Add `matches` array to each team's `meta.push(...)` entry
6. Pass `cupColor` from config into the `theme` object: `cupColor: config.cupColor || '#7c3aed'`

### `src/generateHTML.js`
1. Accept `cupColor` from theme (already destructured from theme object)
2. New helper `isLiga(competition)`: returns `competition.toLowerCase().includes('liga')`
3. New helper `buildScheduleRow(match, cupColor)`: returns HTML string for one row
4. New helper `buildSchedule(matches, filter, cupColor)`: filters by `filter` ('all'|'home'|'away'), renders header + rows
5. `buildTabPanel(teamId, type, webcalLink, googleLink, httpsLink, matches, cupColor)`: prepend `buildSchedule(...)` output before the subscription buttons
6. Legend section appended after all team cards

### Tests
- `tests/e2e/html-generation.test.js`: add tests for
  - Schedule section present in each tab panel
  - Past match has `opacity` styling
  - Next match has highlighted row
  - Cup competition uses cup color
  - Heim tab contains only home matches
  - Auswärts tab contains only away matches
  - Empty matches array renders gracefully (no schedule section)
- WCAG Playwright tests: existing axe-core scan covers new HTML; add structural check that schedule rows exist

## Out of Scope
- Showing matches from previous seasons
- Pagination or "show more" for long schedules
- Live score updates
- Clicking a match row for details
