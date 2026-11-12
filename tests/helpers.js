// Shared Playwright & extension test helpers for ReelCoach E2E suites.
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const EXT_DIR = path.resolve(__dirname, '..');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {}
  const npmRoot = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/c', 'npm', 'root', '-g'], { encoding: 'utf8' }).trim()
    : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return require(path.join(npmRoot, 'playwright'));
}

const { chromium } = loadPlaywright();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f2 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(2) : String(x));

function createSuite(title) {
  const results = [];
  console.log(`\n==================== ${title} ====================`);
  return {
    title,
    results,
    check(name, ok, detail = '') {
      const pass = !!ok;
      results.push({ name, ok: pass, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
      return pass;
    },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(`--- ${title}: ${results.length - failed.length}/${results.length} passed ---`);
      return { total: results.length, passed: results.length - failed.length, failed };
    },
  };
}

async function launchExtensionContext(opts = {}) {
  const tmpBase = path.join(__dirname, '.tmp-profiles');
  fs.mkdirSync(tmpBase, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(tmpBase, 'rc-'));
  const viewport = opts.viewport || { width: 1280, height: 860 };
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: opts.headless !== false,
    viewport,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  const extId = sw ? new URL(sw.url()).host : null;

  async function cleanup() {
    try { await ctx.close(); } catch {}
    await sleep(250);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
  return { ctx, sw, extId, profileDir, cleanup };
}

async function dismissSiteDialogs(page) {
  for (const sel of ['div[role="dialog"] [aria-label="Close"]', 'div[role="dialog"] svg[aria-label="Close"]']) {
    const c = page.locator(sel).first();
    if (await c.count()) {
      await c.click().catch(() => {});
      await sleep(500);
    }
  }
  const gotIt = page.getByRole('button', { name: 'Got it' }).first();
  if (await gotIt.count()) {
    await gotIt.click().catch(() => {});
    await sleep(500);
  }
  await page.evaluate(() => {
    // Only remove fixed sign-in modal wrappers that do not wrap any <video>.
    for (const d of document.querySelectorAll('div[role="dialog"]')) {
      if (d.querySelector('video')) continue;
      let p = d;
      while (p.parentElement && p.parentElement !== document.body && !p.parentElement.querySelector('video') && getComputedStyle(p.parentElement).position === 'fixed') {
        p = p.parentElement;
      }
      if (getComputedStyle(p).position === 'fixed' && !p.querySelector('video')) p.remove();
    }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }).catch(() => {});
}

module.exports = {
  EXT_DIR,
  chromium,
  sleep,
  near,
  f2,
  createSuite,
  launchExtensionContext,
  dismissSiteDialogs,
};
