# BBB Vereinsportal — Projektregeln für Claude

## Dokumentation

Nach jeder Code-Änderung muss die Dokumentation mitgepflegt werden:

- **arc42** (`docs/arc42/chapters/`): Bei Änderungen an Architektur, Modulverantwortlichkeiten, API-Endpunkten, Datenflüssen oder Designentscheidungen die betroffenen Kapitel aktualisieren:
  - `03-context.adoc` — Systemkontext, externe Schnittstellen
  - `05-building-blocks.adoc` — Modulbeschreibungen, exportierte Funktionen
  - `09-decisions.adoc` — Neue ADRs für relevante Architekturentscheidungen
- **README.md**: Bei neuen Features oder geänderten Nutzungsszenarien aktualisieren.

Die `render-docs.yml` Action rendert die arc42-Doku automatisch bei Änderungen an `.adoc`-Dateien.

## Techstack

- Node.js 24 (siehe `.nvmrc`)
- Kein Build-System, reines CommonJS (`require`)
- Tests: `node:test` + `node:assert/strict` — keine externen Test-Frameworks
- Playwright + axe-core für WCAG 2.1 AA Accessibility-Tests

## GitHub Actions

- Alle Workflows verwenden `node-version: '24'` und `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`
- Node.js 20 wird von GitHub Actions ab 2025-11-04 nicht mehr unterstützt — niemals auf node 18 oder 20 zurückgehen
- Actions-Versionen: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v5`

## Testregeln

- `npm test` muss vor jedem Commit grün sein
- Playwright-Tests prüfen WCAG 2.1 AA — Kontrastverhältnis mindestens 4.5:1, korrekte ARIA-Rollen
- Neue Features brauchen Tests in `tests/e2e/html-generation.test.js`
- Neue HTML-Komponenten (Buttons, interaktive Elemente, aufklappbare Bereiche) brauchen zusätzlich einen E2E-Test der das Verhalten im Browser prüft (Playwright)
- Tests und Dokumentation sind kein optionaler Nachschritt — sie gehören zur Implementierung

## Grenzen der automatisierten Barrierefreiheitsprüfung

axe-core deckt nur ca. 30–40% aller WCAG-Kriterien automatisch ab:

- **color-mix() wird von axe-core nicht ausgewertet** — Kontrast für `color-mix()`-basierte Farben (das gesamte Farbsystem dieses Projekts) muss manuell oder per dediziertem Test geprüft werden. Ein grüner axe-core-Scan bedeutet hier *nicht* dass der Kontrast stimmt.
- **WCAG 2.2** ist noch nicht vollständig abgedeckt (z.B. 2.5.8 Zielgröße)
- Nicht automatisch prüfbare Kriterien (z.B. sensorische Merkmale, Linkzweck, sichtbares Label) erfordern manuelle Prüfung

## Codestil

- Kein TypeScript, kein Transpiling
- `escapeHtml()` für alle Nutzerdaten im HTML-Output
- Sicherheitsprüfungen in `storage.js` nicht entfernen (Path-Traversal-Schutz)
