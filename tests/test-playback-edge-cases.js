// Suite 4: Playback edge cases — unbuffered timeline jumps (forward, mid-gap, rapid multi-jump),
// progressive post jumps, A/V duration-mismatch restart at end, and leading PTS start-gap recovery.
'use strict';

const { sleep, f2, createSuite, launchExtensionContext, dismissSiteDialogs } = require('./helpers');

const REEL_LONG = 'https://www.instagram.com/reignmambo/reel/DUwoLycjDkl/';
const POST_STUCK = 'https://www.instagram.com/p/Dbs0AeLI6Yu/';

async function run() {
  const suite = createSuite('4. Unbuffered Timeline Jumps & Stuck-Video Regressions');
  const { check } = suite;
  const { ctx, cleanup } = await launchExtensionContext({ viewport: { width: 1280, height: 860 } });

  try {
    // --- 4A & 4B: Throttled unbuffered forward jump (85%) + backward mid-reel gap jump (45%) ---
    const page = ctx.pages()[0] || await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');

    await page.goto(REEL_LONG, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 });
    await sleep(2200);
    await dismissSiteDialogs(page);

    // Throttle to 2.5 Mbps so unbuffered segments genuinely download asynchronously (~2-3s)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 60,
      downloadThroughput: (2500 * 1024) / 8,
      uploadThroughput: (1000 * 1024) / 8,
    });

    const getVidAndTrack = async (ensurePlaying = true) => {
      const vr = await page.evaluate(async (play) => {
        const v = document.querySelector('video');
        v.muted = true;
        if (play && v.paused) await v.play().catch(() => {});
        const r = v.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, d: v.duration };
      }, ensurePlaying);
      await page.mouse.move(vr.x + vr.w / 2, vr.y + vr.h * 0.6, { steps: 4 });
      await sleep(250);
      const tr = await page.evaluate(() => {
        const r = document.getElementById('igvc-host').shadowRoot.querySelector('.track').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      return { vr, tr };
    };

    const waitForUnbufferedLanding = async (target, minDelta = 0.5, timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      let landedAt = null;
      while (Date.now() < deadline) {
        await sleep(350);
        const st = await page.evaluate(() => {
          const v = document.querySelector('video');
          return { ct: v.currentTime, paused: v.paused, rs: v.readyState, seeking: v.seeking, err: v.error ? v.error.code : null };
        });
        if (st.err) return { ok: false, st, reason: `video error ${st.err}` };
        if (!st.seeking && st.rs >= 3 && !st.paused && Math.abs(st.ct - target) < 3.5) {
          if (landedAt === null) landedAt = st.ct;
          else if (st.ct >= landedAt + minDelta) return { ok: true, st };
        }
      }
      const finalSt = await page.evaluate(() => {
        const v = document.querySelector('video');
        return { ct: v.currentTime, paused: v.paused, rs: v.readyState, seeking: v.seeking };
      });
      return { ok: false, st: finalSt, reason: 'timed out waiting for playback advance' };
    };

    const { vr, tr } = await getVidAndTrack();
    const target85 = vr.d * 0.85;
    await page.mouse.click(tr.left + tr.width * 0.85, tr.top + tr.height / 2);
    const res85 = await waitForUnbufferedLanding(target85);
    check('Unbuffered forward jump (85% on 2.5 Mbps) downloads & resumes smoothly',
      res85.ok, `target=${f2(target85)} got ct=${f2(res85.st.ct)} paused=${res85.st.paused} rs=${res85.st.rs}`);

    // Now [0..24] and [80..85] are buffered with an unbuffered gap [24..80] in between!
    // Without src/page-seek.js, OzPlayer snapped 45% (~43s) right back to 80.58s.
    await page.mouse.move(vr.x + vr.w / 2, vr.y + vr.h * 0.6, { steps: 3 });
    await sleep(150);
    const target45 = vr.d * 0.45;
    await page.mouse.click(tr.left + tr.width * 0.45, tr.top + tr.height / 2);
    const res45 = await waitForUnbufferedLanding(target45);
    check('Mid-reel unbuffered gap jump (45% inside [24..80s] gap) clears stale buffer & plays',
      res45.ok && res45.st.ct < target45 + 5,
      `target=${f2(target45)} got ct=${f2(res45.st.ct)} paused=${res45.st.paused}`);

    // --- 4C: Rapid multi-jump across unbuffered timeline (60% -> 75% -> 32%) ---
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 });
    await sleep(2200);
    await dismissSiteDialogs(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 60,
      downloadThroughput: (2500 * 1024) / 8,
      uploadThroughput: (1000 * 1024) / 8,
    });
    const m = await getVidAndTrack();
    await page.mouse.click(m.tr.left + m.tr.width * 0.60, m.tr.top + m.tr.height / 2);
    await sleep(450);
    await page.mouse.click(m.tr.left + m.tr.width * 0.75, m.tr.top + m.tr.height / 2);
    await sleep(450);
    const target32 = m.vr.d * 0.32;
    await page.mouse.click(m.tr.left + m.tr.width * 0.32, m.tr.top + m.tr.height / 2);
    const resMulti = await waitForUnbufferedLanding(target32, 0.4, 25000);
    check('Rapid multi-jump (60% → 75% → 32%) lands on final target without snapping to stale chunk',
      resMulti.ok && Math.abs(resMulti.st.ct - target32) < 4.5,
      `target=${f2(target32)} got ct=${f2(resMulti.st.ct)} paused=${resMulti.st.paused} rs=${resMulti.st.rs} seeking=${resMulti.st.seeking}`);

    // Restore normal network speed
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });

    // --- 4D: Stuck post Dbs0AeLI6Yu — start, jump to 92%, and end-of-video Play restart ---
    await page.goto(POST_STUCK, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 });
    await sleep(2200);
    await dismissSiteDialogs(page);

    const pInfo = await getVidAndTrack();
    await page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; v.play().catch(() => {}); });
    await sleep(1200);
    const startCt = await page.evaluate(() => document.querySelector('video').currentTime);
    check('Post Dbs0AeLI6Yu starts and advances past 0.5s', startCt > 0.4, `ct=${f2(startCt)}`);

    // Jump to 92% (~38.2s, past the 35s paused-buffer cap)
    const target92 = pInfo.vr.d * 0.92;
    await page.mouse.click(pInfo.tr.left + pInfo.tr.width * 0.92, pInfo.tr.top + pInfo.tr.height / 2);
    const res92 = await waitForUnbufferedLanding(target92, 0.3, 12000);
    check('Post Dbs0AeLI6Yu jumps to 92% (~38.2s) and plays without getting stuck',
      res92.ok, `target=${f2(target92)} got ct=${f2(res92.st.ct)}`);

    // Simulate reaching the end where video frames stop at d - 0.05 with v.ended === false (A/V mismatch)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.pause();
      v.currentTime = Math.max(0, v.duration - 0.05);
    });
    await sleep(250);
    await page.mouse.move(pInfo.vr.x + pInfo.vr.w / 2, pInfo.vr.y + pInfo.vr.h * 0.6, { steps: 3 });
    await sleep(200);
    await page.keyboard.press('k');
    await sleep(1200);
    const restartSt = await page.evaluate(() => {
      const v = document.querySelector('video');
      return { ct: v.currentTime, paused: v.paused };
    });
    check('Pressing Play at video end (with A/V duration mismatch) rewinds to 0:00 and plays',
      !restartSt.paused && restartSt.ct > 0.2 && restartSt.ct < 5,
      `ct=${f2(restartSt.ct)} paused=${restartSt.paused}`);

    // --- 4E: Real MSE leading PTS start gap (SourceBuffer timestampOffset = 0.08s at ct = 0.00) ---
    await page.evaluate(async () => {
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 480;
      const ctx2d = cv.getContext('2d');
      let frame = 0;
      const timer = setInterval(() => {
        ctx2d.fillStyle = frame++ % 2 ? '#147' : '#269';
        ctx2d.fillRect(0, 0, 320, 480);
      }, 30);
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.start();
      await new Promise((r) => setTimeout(r, 700));
      rec.stop();
      await new Promise((r) => { rec.onstop = r; });
      clearInterval(timer);
      const webmBuf = await new Blob(chunks).arrayBuffer();

      const v2 = document.createElement('video');
      v2.id = '__mse-gap-vid';
      v2.muted = true;
      v2.playsInline = true;
      v2.style.cssText = 'position:fixed;left:80px;top:80px;width:360px;height:540px;z-index:99999;background:#000';
      document.body.appendChild(v2);

      const ms = new MediaSource();
      v2.src = URL.createObjectURL(ms);
      await new Promise((r) => ms.addEventListener('sourceopen', r, { once: true }));
      const sb = ms.addSourceBuffer('video/webm;codecs=vp8');
      sb.timestampOffset = 0.09; // real leading PTS gap [0.09..0.75] with ct stuck at 0.00!
      sb.appendBuffer(webmBuf);
      await new Promise((r) => sb.addEventListener('updateend', r, { once: true }));
      v2.play().catch(() => {});
    });
    await page.mouse.move(260, 350, { steps: 4 });
    await sleep(900);
    const gapRes = await page.evaluate(() => {
      const v2 = document.getElementById('__mse-gap-vid');
      const out = {
        ct: v2.currentTime,
        bs: v2.buffered.length ? v2.buffered.start(0) : -1,
        rs: v2.readyState,
      };
      v2.remove();
      return out;
    });
    check('Leading PTS start gap (real MSE [0.09s..] at ct=0.00) auto-nudges & plays past gap',
      gapRes.bs >= 0.05 && gapRes.ct >= gapRes.bs,
      `bufferedStart=${f2(gapRes.bs)} ct=${f2(gapRes.ct)} rs=${gapRes.rs}`);
  } finally {
    await cleanup();
  }
  return suite.summary();
}

if (require.main === module) {
  run().then((s) => process.exit(s.failed.length ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
