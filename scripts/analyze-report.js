'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
  ? path.resolve(process.cwd(), process.env.PLAYWRIGHT_JSON_OUTPUT_NAME)
  : path.resolve(__dirname, '../test-results.json');

const outputPath = path.resolve(__dirname, '../test-report-analysis.md');

if (!fs.existsSync(reportPath)) {
  console.error(`Report nicht gefunden: ${reportPath}`);
  console.error('Führe zuerst aus: playwright test --reporter=json');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const stats = report.stats || {};
const passed  = stats.expected   || 0;
const failed  = stats.unexpected || 0;
const skipped = stats.skipped    || 0;
const total   = passed + failed + skipped;

const failures = [];
function collectFailures(suite) {
  for (const spec of (suite.specs || [])) {
    for (const testResult of (spec.tests || [])) {
      if (testResult.status === 'unexpected') {
        const msg = testResult.results?.[0]?.error?.message || 'Kein Fehlertext';
        failures.push({
          title: spec.title,
          file:  suite.file || suite.title || '',
          msg,
        });
      }
    }
  }
  for (const child of (suite.suites || [])) {
    collectFailures(child);
  }
}
for (const suite of (report.suites || [])) {
  collectFailures(suite);
}

const lines = [
  `# Playwright Test Report — ${new Date().toLocaleString('de-DE')}`,
  '',
  '## Zusammenfassung',
  '',
  '| Status | Anzahl |',
  '|--------|--------|',
  `| ✅ Bestanden | ${passed} |`,
  `| ❌ Fehlgeschlagen | ${failed} |`,
  `| ⏭ Übersprungen | ${skipped} |`,
  `| Gesamt | ${total} |`,
  '',
];

if (failures.length === 0) {
  lines.push('## Ergebnis', '', '✅ Alle Tests bestanden.', '');
} else {
  lines.push(`## Fehlgeschlagene Tests (${failures.length})`, '');
  const byFile = {};
  for (const f of failures) {
    (byFile[f.file] = byFile[f.file] || []).push(f);
  }
  for (const [file, tests] of Object.entries(byFile)) {
    lines.push(`### ${file || 'Unbekannte Datei'}`, '');
    for (const t of tests) {
      lines.push(`- **${t.title}**`);
      const indented = t.msg.split('\n').join('\n  ');
      lines.push(`  \`\`\`\n  ${indented}\n  \`\`\``);
    }
    lines.push('');
  }
}

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Analyse geschrieben: ${outputPath}`);
