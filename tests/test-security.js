// Suite 2: Security regression tests — untrusted input rejection, DOM clobbering, privilege boundaries.
'use strict';

const fs = require('fs');
const path = require('path');
const { EXT_DIR, sleep, createSuite, launchExtensionContext } = require('./helpers');

const REEL = 'DfK2QyjRLo3';

async function run() {
  const suite = createSuite('2. Security & Privilege Audit');
  const { check } = suite;

  // Static manifest checks
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  check('Manifest permissions strictly ["storage"]',
    Array.isArray(manifest.permissions) && manifest.permissions.length === 1 && manifest.permissions[0] === 'storage',
    JSON.stringify(manifest.permissions));
  check('No host_permissions or web_accessible_resources',
    !manifest.host_permissions && !manifest.web_accessible_resources && !manifest.externally_connectable);

  const { ctx, sw, extId, cleanup } = await launchExtensionContext({ viewport: { width: 1280, height: 800 } });
  try {
    // Plant DOM-clobbering elements before content.js runs
    await ctx.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        for (const id of ['__igvcLoaded', '__igvcPage', 'igvc']) {
          const d = document.createElement('div');
          d.id = id;
          document.body.appendChild(d);
        }
      });
    });

    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(`https://www.instagram.com/reels/${REEL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 });
    await sleep(3000);

    const vid = () => page.evaluate(() => {
      const v = document.querySelector('video');
      v.muted = true;
      const r = v.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, t: v.currentTime, paused: v.paused };
    });
    const ov = () => page.evaluate(() => {
      const R = document.getElementById('igvc-host').shadowRoot;
      return {
        show: R.querySelector('.wrap').classList.contains('show'),
        loopOn: R.querySelector('[data-act=loop]').classList.contains('on'),
        mirror: document.documentElement.classList.contains('igvc-mirror'),
      };
    });

    check('DOM clobbering (<div id="__igvcLoaded">) does not block loading',
      await page.evaluate(() => !!document.getElementById('igvc-host')));

    // Synthetic mousemove & click
    await page.mouse.move(5, 400); await sleep(300);
    await page.evaluate(async () => {
      const v = document.querySelector('video');
      const r = v.getBoundingClientRect();
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      await new Promise((res) => requestAnimationFrame(res));
      const playBtn = document.getElementById('igvc-host').shadowRoot.querySelector('[data-act="play"]');
      playBtn.click();
      playBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    });
    await sleep(300);
    check('Synthetic mousemove does not reveal controls', !(await ov()).show);

    // Synthetic keyboard shortcuts
    const s0 = await vid(), o0 = await ov();
    await page.evaluate(() => {
      for (const key of ['m', 'a', 'b', 'k', 'ArrowRight', '.']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
    });
    await sleep(350);
    const s1 = await vid(), o1 = await ov();
    check('Synthetic KeyboardEvents (m, a, b, k, →, .) are ignored',
      o1.mirror === o0.mirror && !o1.loopOn && s1.paused === s0.paused,
      `mirror=${o1.mirror} loop=${o1.loopOn}`);

    const stored = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    check('Synced settings untouched by synthetic keys', stored.mirror === undefined || stored.mirror === false);

    // Malformed CustomEvent on page-seek.js
    const malformedSafe = await page.evaluate(() => {
      const v = document.querySelector('video');
      const before = v.currentTime;
      for (const bad of [NaN, Infinity, '10', { valueOf: () => 10 }, null]) {
        v.dispatchEvent(new CustomEvent('igvc:seek', { detail: bad, cancelable: true }));
      }
      return Math.abs(v.currentTime - before) < 1.0;
    });
    check('page-seek.js ignores non-finite / non-number event payloads', malformedSafe);

    check('No chrome.downloads API exposed in service worker',
      await sw.evaluate(() => typeof chrome.downloads === 'undefined'));
    check('No download button in overlay DOM',
      await page.evaluate(() => !document.getElementById('igvc-host').shadowRoot.querySelector('.dl')));

    // Popup settings validation & clamping
    const pop = await ctx.newPage();
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    for (const [val, want] of [['1000', '60'], ['-5', '0.5'], ['', '5']]) {
      await pop.evaluate((x) => { const el = document.getElementById('skip'); el.value = x; el.dispatchEvent(new Event('change')); }, val);
      await sleep(180);
      const got = await pop.inputValue('#skip');
      check(`Popup skip "${val}" clamped to ${want}`, got === want, `got ${got}`);
    }
    await pop.evaluate(() => chrome.storage.sync.set({ skip: 'not-a-number', fineSkip: 1e9, autoHide: null, mirror: 'yes', dotMode: 'yes', junk: '<b>x</b>' }));
    await page.bringToFront();
    const v = await vid();
    await page.mouse.move(v.cx, v.cy); await page.mouse.move(v.cx + 3, v.cy); await sleep(250);
    const label = await page.evaluate(() => document.getElementById('igvc-host').shadowRoot.querySelector('.sk').textContent);
    const mirrorNow = await page.evaluate(() => document.documentElement.classList.contains('igvc-mirror'));
    const dotNow = await page.evaluate(() => document.getElementById('igvc-host').shadowRoot.querySelector('.wrap').classList.contains('dot-mode'));
    check('Corrupt synced settings fall back to safe defaults', label === '5' && mirrorNow === false && dotNow === false, `label=${label}`);
    await pop.evaluate(() => chrome.storage.sync.clear());
    await pop.close();

    // Verify real trusted input still works
    await page.bringToFront();
    await page.evaluate(() => document.querySelector('video').pause());
    const t0 = (await vid()).t;
    await page.mouse.move(v.cx, v.cy); await page.mouse.move(v.cx + 2, v.cy); await sleep(200);
    await page.keyboard.press('ArrowRight'); await sleep(900);
    check('Real trusted keyboard input works after security checks', (await vid()).t - t0 > 4);
  } finally {
    await cleanup();
  }
  return suite.summary();
}

if (require.main === module) {
  run().then((s) => process.exit(s.failed.length ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
