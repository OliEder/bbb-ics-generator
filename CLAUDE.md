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

## Testregeln

- `npm test` muss vor jedem Commit grün sein
- Playwright-Tests prüfen WCAG 2.1 AA — Kontrastverhältnis mindestens 4.5:1, korrekte ARIA-Rollen
- Neue Features brauchen Tests in `tests/e2e/html-generation.test.js`

## Codestil

- Kein TypeScript, kein Transpiling
- `escapeHtml()` für alle Nutzerdaten im HTML-Output
- Sicherheitsprüfungen in `storage.js` nicht entfernen (Path-Traversal-Schutz)
