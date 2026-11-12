// Suite 5: Native control & bottom comments / captions / Stories clearance across IG, FB & TikTok.
'use strict';

const { sleep, createSuite, launchExtensionContext, dismissSiteDialogs } = require('./helpers');

const STORY_URL = 'https://www.instagram.com/stories/dj_mo.timba/4027605493747122024/';

async function run() {
  const suite = createSuite('5. Bottom Comments, Captions, Native Controls & Stories Clearance');
  const { check } = suite;
  const { ctx, cleanup } = await launchExtensionContext({ viewport: { width: 1280, height: 860 } });

  try {
    const hoverMainVideo = async (page) => {
      const v = await page.evaluate(() => {
        let best = null, bs = 0;
        for (const x of document.querySelectorAll('video')) {
          const r = x.getBoundingClientRect();
          const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
          const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
          if (w > 0 && h > 0 && w * h > bs) { best = x; bs = w * h; }
        }
        if (!best) return null;
        best.muted = true;
        const r = best.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: Math.min(r.bottom, innerHeight) };
      });
      if (!v) return null;
      await page.mouse.move(v.x + v.w / 2 - 4, v.y + v.h * 0.52);
      await page.mouse.move(v.x + v.w / 2 + 2, v.y + v.h * 0.55);
      await sleep(450);
      return v;
    };

    const measureBarAndOverlap = (page, v, extraSel) => page.evaluate(({ v, extraSel }) => {
      const host = document.getElementById('igvc-host');
      const S = host.shadowRoot;
      const shown = S.querySelector('.wrap').classList.contains('show');
      const bar = S.querySelector('.bar').getBoundingClientRect();
      const RX = /(mute|unmute|volume|sound|audio|speed|playback rate|caption|subtitle|settings|more|full ?screen|pause|play)/i;
      let coveredControls = 0;
      for (const el of document.querySelectorAll('button, [role="button"], [aria-label], svg[aria-label]')) {
        if (host.contains(el)) continue;
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        if (!RX.test(label)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) continue;
        // Skip full-video tap catchers
        if (r.width * r.height > v.w * v.h * 0.3) continue;
        if (r.right < v.x - 120 || r.left > v.x + v.w + 120 || r.bottom < v.y - 10 || r.top > v.y + v.h + 60) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        const underBar = cx >= bar.left && cx <= bar.right && cy >= bar.top && cy <= bar.bottom;
        if (topEl === host || underBar) coveredControls++;
      }

      let extraOverlap = false;
      if (extraSel) {
        for (const el of document.querySelectorAll(extraSel)) {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const horiz = Math.min(bar.right, r.right) - Math.max(bar.left, r.left);
          const vert = Math.min(bar.bottom, r.bottom) - Math.max(bar.top, r.top);
          if (horiz > 2 && vert > 2) extraOverlap = true;
        }
      }
      return {
        shown,
        bottomOffset: Math.round(v.bottom - bar.bottom),
        barTop: Math.round(bar.top),
        barBottom: Math.round(bar.bottom),
        coveredControls,
        extraOverlap,
      };
    }, { v, extraSel });

    // --- 5A. Plain Instagram Reel & Post (stay at bottom: 8px, 0 corner controls covered) ---
    for (const [label, url] of [
      ['Instagram Reel (wide, clean bottom)', 'https://www.instagram.com/reignmambo/reel/DUwoLycjDkl/'],
      ['Instagram Post (/p/Dbs0AeLI6Yu/)', 'https://www.instagram.com/p/Dbs0AeLI6Yu/'],
    ]) {
      const p = await ctx.newPage();
      await p.goto(url, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('video', { timeout: 30000 });
      await sleep(2800);
      await dismissSiteDialogs(p);
      const v = await hoverMainVideo(p);
      const m = await measureBarAndOverlap(p, v);
      check(`${label}: bar stays bottom-pinned (~8px) & covers 0 native controls`,
        m.shown && m.bottomOffset >= 6 && m.bottomOffset <= 14 && m.coveredControls === 0,
        `bottom=${m.bottomOffset}px covered=${m.coveredControls}`);
      await p.close();
    }

    // --- 5B. Narrow / Feed Instagram Reel (760px) with in-video bottom caption + Follow + bottom comments ---
    {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 760, height: 860 });
      await p.goto('https://www.instagram.com/reels/DUwoLycjDkl/', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('video', { timeout: 30000 });
      await sleep(3000);
      await dismissSiteDialogs(p);
      const v = await hoverMainVideo(p);
      const m1 = await measureBarAndOverlap(p, v);
      check('Instagram Reel with bottom caption & Follow strip: bar lifts cleanly above caption (~70-100px)',
        m1.shown && m1.bottomOffset >= 45 && m1.coveredControls === 0,
        `bottom=${m1.bottomOffset}px`);

      // Also inject a bottom comment input / floating comment pill inside the reel (logged-in style)
      await p.evaluate((v) => {
        const c = document.createElement('div');
        c.id = '__ig-bottom-comment';
        c.style.cssText = `position:fixed;left:${v.x + 16}px;width:${v.w - 72}px;top:${v.bottom - 52}px;height:38px;z-index:50;display:flex;align-items:center;padding:0 12px;border-radius:19px;background:rgba(0,0,0,.55);color:#fff;`;
        c.innerHTML = '<input type="text" placeholder="Add a comment..." style="width:100%;height:32px;background:transparent;border:0;color:#fff" />';
        document.body.appendChild(c);
      }, v);
      // Reset dodge by briefly hiding, then re-hovering
      await p.mouse.move(5, 5); await sleep(350);
      const v2 = await hoverMainVideo(p);
      const m2 = await measureBarAndOverlap(p, v2, '#__ig-bottom-comment input');
      check('Instagram Reel bottom "Add a comment..." input is never covered by ReelCoach bar',
        m2.shown && !m2.extraOverlap && m2.bottomOffset >= 56,
        `bottom=${m2.bottomOffset}px overlap=${m2.extraOverlap}`);
      await p.close();
    }

    // --- 5C. Facebook Reel with bottom caption ("איזה קל") + comment box ---
    {
      const p = await ctx.newPage();
      await p.goto('https://www.facebook.com/reel/1215226870299088', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('video', { timeout: 30000 });
      await sleep(4000);
      await dismissSiteDialogs(p);
      const v = await hoverMainVideo(p);
      const m = await measureBarAndOverlap(p, v);
      // Verify the real Facebook bottom caption span inside [barL..barR] is below bar.bottom
      const fbCapClear = await p.evaluate((v) => {
        const bar = document.getElementById('igvc-host').shadowRoot.querySelector('.bar').getBoundingClientRect();
        for (const sp of document.querySelectorAll('span, div')) {
          let direct = false;
          for (let n = sp.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) direct = true;
          if (!direct) continue;
          const r = sp.getBoundingClientRect();
          if (r.bottom <= v.bottom + 4 && r.bottom > v.bottom - 50 && r.right > bar.left && r.left < bar.right) {
            if (bar.bottom > r.top + 2) return { ok: false, txt: sp.textContent.trim(), barBot: bar.bottom, capTop: r.top };
          }
        }
        return { ok: true };
      }, v);
      check('Facebook Reel lifts above bottom caption & covers 0 native controls',
        m.shown && m.bottomOffset >= 30 && m.coveredControls === 0 && fbCapClear.ok,
        `bottom=${m.bottomOffset}px capClear=${JSON.stringify(fbCapClear)}`);
      await p.close();
    }

    // --- 5D. Instagram Story (live ephemeral URL + Story DOM with bottom Reply bar & tap-advance guard) ---
    {
      const p = await ctx.newPage();
      const storyErrors = [];
      p.on('pageerror', (e) => { if (/igvc|IGVC/.test(e.stack || e.message)) storyErrors.push(e.message); });
      await p.goto(STORY_URL, { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      const liveHasVideo = (await p.locator('video').count()) > 0;
      if (!liveHasVideo) {
        const hiddenOnGate = await p.evaluate(() => {
          const h = document.getElementById('igvc-host');
          return !!h && !h.shadowRoot.querySelector('.wrap').classList.contains('show');
        });
        check('Instagram ephemeral/logged-out Story URL (dj_mo.timba) loads cleanly without errors or stray bar',
          hiddenOnGate && storyErrors.length === 0,
          'logged-out / 24h expired gate handled gracefully');
      }

      // Now mount an active Story player DOM on /stories/dj_mo.timba/4027605493747122024/ with bottom Reply bar + tap-to-advance listener
      await p.evaluate(() => {
        if (!location.pathname.startsWith('/stories/')) {
          history.pushState({}, '', '/stories/dj_mo.timba/4027605493747122024/');
        }
        document.body.innerHTML = `
          <div id="__story-stage" style="position:fixed;inset:0;background:#000;display:grid;place-items:center">
            <div id="__story-card" style="position:relative;width:420px;height:746px;border-radius:12px;overflow:hidden;background:#111">
              <video id="__story-vid" muted loop playsinline style="width:100%;height:100%;object-fit:cover"></video>
              <div id="__story-reply" style="position:absolute;left:12px;right:12px;bottom:14px;height:44px;display:flex;align-items:center;gap:10px;z-index:5">
                <input id="__reply-in" type="text" placeholder="Reply to dj_mo.timba..."
                  style="flex:1;height:42px;border-radius:21px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.35);color:#fff;padding:0 16px" />
                <button aria-label="Like story" style="width:36px;height:36px;color:#fff">♡</button>
                <button aria-label="Share story" style="width:36px;height:36px;color:#fff">➤</button>
              </div>
            </div>
          </div>`;
        // Tiny valid silent canvas captureStream so <video> is genuinely playable in headless Chromium
        const cv = document.createElement('canvas');
        cv.width = 360; cv.height = 640;
        const c2d = cv.getContext('2d');
        c2d.fillStyle = '#246'; c2d.fillRect(0, 0, 360, 640);
        const v = document.getElementById('__story-vid');
        v.srcObject = cv.captureStream(30);
        v.play().catch(() => {});
        window.__storyAdvances = 0;
        document.getElementById('__story-stage').addEventListener('click', () => { window.__storyAdvances++; });
      });
      await sleep(500);
      const sv = await hoverMainVideo(p);
      const sm = await measureBarAndOverlap(p, sv, '#__story-reply, #__reply-in');
      check('Instagram Story (/stories/...): ReelCoach bar lifts above "Reply to..." input & buttons',
        sm.shown && !sm.extraOverlap && sm.bottomOffset >= 64,
        `bottom=${sm.bottomOffset}px overlap=${sm.extraOverlap}`);

      // Click ReelCoach Play button & ensure Story tap-to-advance does NOT fire
      const playPt = await p.evaluate(() => {
        const r = document.getElementById('igvc-host').shadowRoot.querySelector('[data-act="play"]').getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      await p.mouse.click(playPt[0], playPt[1]);
      await sleep(200);
      const advances = await p.evaluate(() => window.__storyAdvances);
      check('Clicking ReelCoach controls on a Story does NOT trigger Story tap-to-advance', advances === 0, `advances=${advances}`);

      // --- 5E. Facebook Story (/stories/...) bottom Reply + emoji reactions clearance ---
      await p.goto('https://www.facebook.com/reel/1215226870299088', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('video', { timeout: 30000 });
      await sleep(2500);
      await dismissSiteDialogs(p);
      await p.evaluate(() => {
        history.pushState({}, '', '/stories/987654321/');
      });
      await p.mouse.move(5, 5); await sleep(300);
      const fbSv = await hoverMainVideo(p);
      await p.evaluate((v) => {
        const r = document.createElement('div');
        r.id = '__fb-story-reply';
        r.style.cssText = `position:fixed;left:${v.x + 16}px;width:${v.w - 32}px;top:${v.bottom - 56}px;height:42px;z-index:50;display:flex;gap:8px;align-items:center;`;
        r.innerHTML = '<input type="text" placeholder="Reply..." style="flex:1;height:40px;border-radius:20px;padding:0 14px" /><button aria-label="Like">👍</button><button aria-label="Love">❤️</button>';
        document.body.appendChild(r);
      }, fbSv);
      await p.mouse.move(5, 5); await sleep(350);
      const fbSv2 = await hoverMainVideo(p);
      const fbSm = await measureBarAndOverlap(p, fbSv2, '#__fb-story-reply');
      check('Facebook Story (/stories/...): ReelCoach bar lifts above "Reply..." & reaction bar',
        fbSm.shown && !fbSm.extraOverlap && fbSm.bottomOffset >= 64,
        `bottom=${fbSm.bottomOffset}px overlap=${fbSm.extraOverlap}`);
      await p.close();
    }

    // --- 5F. TikTok feed native controls & caption clearance ---
    {
      const p = await ctx.newPage();
      await p.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('video', { timeout: 30000 }).catch(() => {});
      await sleep(4500);
      await dismissSiteDialogs(p);
      const v = await hoverMainVideo(p);
      if (v) {
        const m = await measureBarAndOverlap(p, v);
        check('TikTok feed: 0 native controls covered by ReelCoach bar',
          m.shown && m.coveredControls === 0,
          `bottom=${m.bottomOffset}px covered=${m.coveredControls}`);
      }
      await p.close();
    }
  } finally {
    await cleanup();
  }
  return suite.summary();
}

if (require.main === module) {
  run().then((s) => process.exit(s.failed.length ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
