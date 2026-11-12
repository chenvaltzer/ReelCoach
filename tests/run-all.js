#!/usr/bin/env node
// Master test runner for ReelCoach — executes all mandatory regression & E2E suites.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { EXT_DIR } = require('./helpers');

const SUITES = [
  './test-core-ig',
  './test-security',
  './test-platforms-toggle',
  './test-playback-edge-cases',
  './test-bottom-clearance',
];

async function main() {
  const started = Date.now();
  console.log('================================================================');
  console.log('ReelCoach Full Regression & E2E Test Suite');
  console.log('================================================================');

  // 0. Syntax & manifest sanity checks
  for (const rel of ['src/content.js', 'src/page-seek.js', 'src/background.js', 'popup.js']) {
    execFileSync(process.execPath, ['--check', path.join(EXT_DIR, rel)], { stdio: 'inherit' });
  }
  JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  console.log('PASS  Static JS syntax & manifest.json validation');

  let totalChecks = 1;
  let totalPassed = 1;
  const allFailures = [];

  for (const modPath of SUITES) {
    const suite = require(modPath);
    const summary = await suite.run();
    totalChecks += summary.total;
    totalPassed += summary.passed;
    for (const f of summary.failed) {
      allFailures.push(`[${path.basename(modPath)}] ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
    }
  }

  // Clean up tmp base dir if empty
  try {
    fs.rmSync(path.join(__dirname, '.tmp-profiles'), { recursive: true, force: true });
  } catch {}

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`FINAL SUMMARY: ${totalPassed}/${totalChecks} checks passed in ${elapsed}s`);
  console.log('================================================================');
  if (allFailures.length) {
    console.error('\nFAILED CHECKS:');
    for (const f of allFailures) console.error('  ✗ ' + f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
