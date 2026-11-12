// Suite 3: Toolbar on/off toggle, Facebook Reels & Stories routing, and TikTok feed controls.
'use strict';

const { sleep, createSuite, launchExtensionContext, dismissSiteDialogs } = require('./helpers');

async function run() {
  const suite = createSuite('3. Toolbar Toggle, Facebook & TikTok');
  const { check } = suite;
  const { ctx, sw, extId, cleanup } = await launchExtensionContext({ viewport: { width: 1280, height: 860 } });

  try {
    const main = (page) => page.evaluate(() => {
      let best = null, bs = 0;
      for (const v of document.querySelectorAll('video')) {
        const r = v.getBoundingClientRect();
        const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        if (w > 0 && h > 0 && w * h > bs) { best = v; bs = w * h; }
      }
      if (!best) return null;
      best.muted = true;
      const r = best.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, t: best.currentTime, d: best.duration };
    });
    const shown = (page) => page.evaluate(() => document.getElementById('igvc-host')?.shadowRoot?.querySelector('.wrap')?.classList.contains('show') || false);
    const hover = async (page) => {
      const v = await main(page);
      if (!v) return null;
      await page.mouse.move(v.cx - 6, v.cy);
      await page.mouse.move(v.cx, v.cy + 3);
      await sleep(300);
      return v;
    };

    // --- 3A. Popup on/off switch ---
    const ig = ctx.pages()[0] || await ctx.newPage();
    await ig.goto('https://www.instagram.com/reels/DfK2QyjRLo3/', { waitUntil: 'domcontentloaded' });
    await ig.waitForSelector('video', { timeout: 30000 });
    await sleep(3000);
    await hover(ig);
    check('Switch on by default: controls show on Instagram', await shown(ig));
    await ig.keyboard.press('m'); await sleep(200);
    check('Mirror on before switching off', await ig.evaluate(() => document.documentElement.classList.contains('igvc-mirror')));

    const pop = await ctx.newPage();
    await pop.goto(`chrome-extension://${extId}/popup.html`); await sleep(350);
    check('Popup shows switch on', (await pop.isChecked('#enabled')) && (await pop.textContent('#powerLabel')) === 'ReelCoach is on');
    await pop.click('#enabled'); await sleep(350);
    check('Popup flips to "ReelCoach is off"', (await pop.textContent('#powerLabel')) === 'ReelCoach is off');
    check('Toolbar badge shows OFF', (await sw.evaluate(() => chrome.action.getBadgeText({}))) === 'OFF');

    await ig.bringToFront(); await sleep(250);
    await hover(ig);
    check('Switched off: controls hidden', !(await shown(ig)));
    check('Switched off: mirror removed', !(await ig.evaluate(() => document.documentElement.classList.contains('igvc-mirror'))));
    await ig.evaluate(() => document.querySelector('video').pause());
    const tOff = (await main(ig)).t;
    await ig.keyboard.press('ArrowRight'); await sleep(600);
    check('Switched off: keyboard shortcuts ignored', Math.abs((await main(ig)).t - tOff) < 0.2);

    await pop.bringToFront(); await pop.click('#enabled'); await sleep(350);
    check('Toolbar badge cleared when switched back on', (await sw.evaluate(() => chrome.action.getBadgeText({}))) === '');
    await ig.bringToFront(); await sleep(250); await hover(ig);
    check('Switched back on: controls & mirror restored', (await shown(ig)) && (await ig.evaluate(() => document.documentElement.classList.contains('igvc-mirror'))));
    await ig.keyboard.press('m');

    // --- 3A.2. Dot Mode (popup switch + time bar button + hovering side dot) ---
    const dotState = () => ig.evaluate(() => {
      const S = document.getElementById('igvc-host').shadowRoot;
      const wrap = S.querySelector('.wrap');
      const dot = S.querySelector('.dot');
      const bar = S.querySelector('.bar');
      const dotBtn = S.querySelector('[data-act="dot"]');
      const dr = dot.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      return {
        show: wrap.classList.contains('show'),
        dotMode: wrap.classList.contains('dot-mode'),
        collapsed: wrap.classList.contains('collapsed'),
        dotVisible: getComputedStyle(dot).display !== 'none' && parseFloat(getComputedStyle(dot).opacity) > 0.5,
        barInteractive: getComputedStyle(bar).pointerEvents !== 'none',
        dotBtnOn: dotBtn.classList.contains('on'),
        dotPt: [dr.left + dr.width / 2, dr.top + dr.height / 2],
        dotBtnPt: (() => { const r = dotBtn.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })(),
        barFitsAllBtns: br.right >= dotBtn.getBoundingClientRect().right - 1,
      };
    });

    await pop.bringToFront(); await sleep(150);
    check('Dot mode is off (false) by default in popup', !(await pop.isChecked('#dotMode')));
    await ig.bringToFront(); await hover(ig);
    let ds = await dotState();
    check('Dot mode off by default in bar (full bar shown, dot button present & fits inside bar)',
      ds.show && !ds.dotMode && !ds.collapsed && ds.barInteractive && !ds.dotBtnOn && ds.barFitsAllBtns);

    // Toggle Dot mode ON via the time bar button
    await ig.mouse.click(ds.dotBtnPt[0], ds.dotBtnPt[1]);
    await sleep(250);
    ds = await dotState();
    check('Clicking Dot button in time bar enables Dot mode & collapses full bar into side dot',
      ds.dotMode && ds.collapsed && ds.dotVisible && !ds.barInteractive);
    await pop.bringToFront(); await sleep(200);
    check('Enabling Dot mode in time bar syncs popup #dotMode switch to ON', await pop.isChecked('#dotMode'));

    // Hover video in Dot mode -> only side dot appears, 0 native controls covered
    await ig.bringToFront();
    await ig.mouse.move(10, 10); await sleep(3000);
    await hover(ig);
    ds = await dotState();
    check('Hovering video in Dot mode shows only the side dot (full bar stays collapsed)',
      ds.show && ds.dotMode && ds.collapsed && ds.dotVisible && !ds.barInteractive);
    const dotClear = await ig.evaluate(([dx, dy]) => {
      const host = document.getElementById('igvc-host');
      const vr = document.querySelector('video').getBoundingClientRect();
      const vArea = vr.width * vr.height;
      for (const el of document.elementsFromPoint(dx, dy)) {
        if (el === host) continue;
        if (el.tagName === 'VIDEO' || el.contains(document.querySelector('video'))) return true;
        const ctrl = el.closest('button, a[href], input, textarea, [role="button"], [role="textbox"]');
        if (ctrl) {
          const r = ctrl.getBoundingClientRect();
          if (r.width * r.height < vArea * 0.25) return false;
        }
      }
      return true;
    }, ds.dotPt);
    check('Hovering side dot does not cover any native button, comment, or volume control', dotClear);

    // Click side dot -> expands full controls without pausing/playing Instagram underneath
    const pausedBeforeDot = await ig.evaluate(() => document.querySelector('video').paused);
    await ig.mouse.click(ds.dotPt[0], ds.dotPt[1]);
    await sleep(250);
    ds = await dotState();
    const pausedAfterDot = await ig.evaluate(() => document.querySelector('video').paused);
    check('Clicking side dot expands full controls cleanly without toggling underlying video',
      !ds.collapsed && ds.barInteractive && ds.dotBtnOn && pausedAfterDot === pausedBeforeDot);

    // Click side dot again while expanded -> collapses back to dot while keeping Dot mode ON
    await ig.mouse.click(ds.dotPt[0], ds.dotPt[1]);
    await sleep(200);
    ds = await dotState();
    check('Clicking side dot again collapses controls back to dot', ds.dotMode && ds.collapsed && !ds.barInteractive);

    // Expand via dot, then turn Dot mode OFF via the time bar's lit Dot button -> syncs popup back to OFF
    await ig.mouse.click(ds.dotPt[0], ds.dotPt[1]);
    await sleep(250);
    ds = await dotState();
    await ig.mouse.click(ds.dotBtnPt[0], ds.dotBtnPt[1]);
    await sleep(250);
    ds = await dotState();
    check('Clicking lit Dot button in bar disables Dot mode & restores full hover controls',
      !ds.dotMode && !ds.collapsed && ds.barInteractive && !ds.dotBtnOn);
    await pop.bringToFront(); await sleep(200);
    check('Disabling Dot mode in bar syncs popup #dotMode switch back to OFF', !(await pop.isChecked('#dotMode')));

    // Also test toggling ON and OFF directly from popup #dotMode switch
    await pop.click('#dotMode'); await sleep(250);
    await ig.bringToFront(); await hover(ig);
    ds = await dotState();
    check('Popup #dotMode switch turns Dot mode ON on the page', ds.dotMode && ds.collapsed && ds.dotVisible);
    await pop.bringToFront(); await pop.click('#dotMode'); await sleep(250);
    await ig.bringToFront(); await hover(ig);
    ds = await dotState();
    check('Popup #dotMode switch turns Dot mode OFF on the page', !ds.dotMode && !ds.collapsed && ds.barInteractive);

    await pop.close();

    // --- 3B. Facebook Reel, Watch/Home exclusion, and Stories ---
    const fb = await ctx.newPage();
    await fb.goto('https://www.facebook.com/reel/1215226870299088', { waitUntil: 'domcontentloaded' });
    await fb.waitForSelector('video', { timeout: 30000 });
    await sleep(4000);
    await dismissSiteDialogs(fb);
    const fbV = await hover(fb);
    check('Facebook Reel has playable video & shows controls', !!fbV && (await shown(fb)));

    // Seek & speed/mirror on Facebook Reel
    await fb.evaluate(() => { for (const x of document.querySelectorAll('video')) x.pause(); });
    const fbTrack = await fb.evaluate(() => {
      const t = document.getElementById('igvc-host').shadowRoot.querySelector('.track').getBoundingClientRect();
      return [t.left, t.top + t.height / 2, t.width];
    });
    await fb.mouse.click(fbTrack[0] + fbTrack[2] * 0.5, fbTrack[1]);
    await sleep(1400);
    const fbAfterSeek = await main(fb);
    check('Facebook Reel timeline click seeks to 50%', Math.abs(fbAfterSeek.t - fbAfterSeek.d / 2) < 1.8, `t=${fbAfterSeek.t.toFixed(2)} d=${fbAfterSeek.d.toFixed(2)}`);

    await fb.evaluate(() => history.pushState({}, '', '/'));
    await sleep(250); await hover(fb);
    check('Facebook home feed (/): controls hidden', !(await shown(fb)));

    await fb.evaluate(() => history.pushState({}, '', '/watch/?v=1'));
    await sleep(250); await hover(fb);
    check('Facebook /watch page: controls hidden', !(await shown(fb)));

    await fb.evaluate(() => history.pushState({}, '', '/stories/123/abc/'));
    await sleep(250); await hover(fb);
    check('Facebook /stories/ path: controls show', await shown(fb));
    await fb.close();

    // --- 3C. TikTok For You feed ---
    const tt = await ctx.newPage();
    await tt.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded' });
    await tt.waitForSelector('video', { timeout: 30000 }).catch(() => {});
    await sleep(4500);
    await dismissSiteDialogs(tt);
    const ttV = await hover(tt);
    check('TikTok feed has playable video', !!ttV);
    if (ttV) {
      check('TikTok controls appear on hover', await shown(tt));
      await tt.keyboard.press('s'); await tt.keyboard.press('m'); await sleep(200);
      const ttSt = await tt.evaluate(() => ({
        mirror: document.documentElement.classList.contains('igvc-mirror'),
        rates: [...document.querySelectorAll('video')].map((v) => v.playbackRate),
      }));
      check('TikTok speed & mirror shortcuts work', ttSt.mirror && ttSt.rates.some((r) => Math.abs(r - 0.9) < 0.01));
      await tt.keyboard.press('m'); await tt.keyboard.press('r');
    }
    await tt.close();
  } finally {
    await cleanup();
  }
  return suite.summary();
}

if (require.main === module) {
  run().then((s) => process.exit(s.failed.length ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
