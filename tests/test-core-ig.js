// Suite 1: Core Instagram E2E controls, A-B loop, speed, mirror, popup settings & feed navigation.
'use strict';

const { sleep, near, f2, createSuite, launchExtensionContext } = require('./helpers');

const REEL = 'DfK2QyjRLo3';

const PAGE_HELPERS = () => {
  window.__main = () => {
    let best = null, bs = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w > 0 && h > 0 && w * h > bs) { best = v; bs = w * h; }
    }
    return best;
  };
  window.__vs = () => {
    const v = window.__main();
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return {
      t: v.currentTime, d: v.duration, paused: v.paused, rate: v.playbackRate,
      rect: [r.left, r.top, r.width, r.height], transform: getComputedStyle(v).transform,
    };
  };
  window.__ov = () => {
    const h = document.getElementById('igvc-host');
    if (!h) return null;
    const R = h.shadowRoot, q = (s) => R.querySelector(s);
    const rect = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
    const shown = (e) => e.classList.contains('show');
    return {
      show: q('.wrap').classList.contains('show'), wrap: rect(q('.wrap')), track: rect(q('.track')),
      toast: q('.toast').textContent, tip: q('.tip').textContent, time: q('.time').textContent, speed: q('.spd').textContent,
      loopOn: q('[data-act=loop]').classList.contains('on'), region: shown(q('.region')),
      mkA: shown(q('.mk[data-l=A]')) ? rect(q('.mk[data-l=A]')) : null,
      mkB: shown(q('.mk[data-l=B]')) ? rect(q('.mk[data-l=B]')) : null,
      clearShown: shown(q('.clr')), skipLabel: q('.sk').textContent,
      btn: Object.fromEntries([...R.querySelectorAll('[data-act]')].map((b) => [b.dataset.act, rect(b)])),
      mirrorClass: document.documentElement.classList.contains('igvc-mirror'),
    };
  };
};

async function run() {
  const suite = createSuite('1. Core Instagram Controls & E2E');
  const { check } = suite;
  const { ctx, sw, extId, cleanup } = await launchExtensionContext({ viewport: { width: 1280, height: 800 } });

  try {
    await ctx.addInitScript(PAGE_HELPERS);
    check('Extension service worker starts', !!sw, sw ? sw.url() : 'no worker');

    const page = ctx.pages()[0] || await ctx.newPage();
    const extErrors = [];
    page.on('pageerror', (e) => { if (/igvc|IGVC|page-seek/.test(e.stack || e.message)) extErrors.push(e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && /chrome-extension:\/\//.test(m.location().url || '')) extErrors.push(m.text()); });

    const vs = () => page.evaluate(() => window.__vs());
    const ov = () => page.evaluate(() => window.__ov());
    const center = async () => { const v = await vs(); return [v.rect[0] + v.rect[2] / 2, v.rect[1] + v.rect[3] / 2]; };
    const hover = async () => { const [x, y] = await center(); await page.mouse.move(x - 4, y); await page.mouse.move(x, y + 2); await sleep(140); };
    const clickBtn = async (act, opts = {}) => {
      await hover();
      const o = await ov();
      const [x, y, w, h] = o.btn[act];
      await page.mouse.move(x + w / 2 - 6, y + h / 2); await sleep(60);
      await page.mouse.click(x + w / 2, y + h / 2, opts);
      await sleep(80);
    };
    const trackPoint = async (ratio) => { const o = await ov(); return [o.track[0] + o.track[2] * ratio, o.track[1] + o.track[3] / 2]; };
    const setPaused = (p) => page.evaluate((p) => { const v = window.__main(); v.muted = true; return p ? v.pause() : v.play().catch(() => {}); }, p);
    const press = async (key) => { await page.keyboard.press(key); await sleep(120); };

    await page.goto(`https://www.instagram.com/reels/${REEL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 });
    await sleep(3000);
    await page.evaluate(() => { const v = window.__main(); v.muted = true; v.play().catch(() => {}); });

    const o0 = await ov();
    check('Overlay host injected', !!o0);
    check('No legacy download page.js helper', await page.evaluate(() => window[Symbol.for('igvc.page.loaded')] !== true));
    check('MAIN-world page-seek.js helper loaded', await page.evaluate(() => window[Symbol.for('igvc.pageSeek.loaded')] === true));

    // Hover & auto-hide
    await page.mouse.move(20, 450); await sleep(400);
    check('Hidden when mouse is away from video', !(await ov()).show);
    await hover(); await sleep(250);
    const oHov = await ov(), vHov = await vs();
    check('Shown when hovering video', oHov.show);
    const vr = vHov.rect.map((x, i) => (i < 2 ? Math.max(0, x) : x));
    check('Overlay matches video position', near(oHov.wrap[0], vr[0], 2) && near(oHov.wrap[2], Math.min(vHov.rect[2], 1280 - vr[0]), 3));
    await sleep(3100);
    check('Auto-hides after 2.5s without mouse movement', !(await ov()).show);
    await hover(); await sleep(150);
    check('Reappears on mouse move', (await ov()).show);

    // Dialog coverage
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = '__dlg';
      d.setAttribute('role', 'dialog');
      d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483000;display:grid;place-items:center';
      d.innerHTML = '<div style="width:420px;height:300px;background:#fff;border-radius:16px"></div>';
      document.body.appendChild(d);
    });
    await hover(); await sleep(250);
    check('Hidden while a dialog covers the video', !(await ov()).show);
    const tDlg = (await vs()).t;
    await press('ArrowLeft'); await sleep(300);
    check('Arrow keys not hijacked while dialog is open', (await vs()).t >= tDlg - 0.05);
    await page.evaluate(() => document.getElementById('__dlg').remove());
    await hover(); await sleep(250);
    check('Shown again after dialog closes', (await ov()).show);

    // Timeline hover, click, drag
    await setPaused(true);
    const d = (await vs()).d;
    await hover();
    let [tx, ty] = await trackPoint(0.3);
    await page.mouse.move(tx, ty); await sleep(150);
    const tip = (await ov()).tip, expectTip = 0.3 * d;
    const [tm, ts] = tip.split(':').map(Number);
    check('Tooltip shows time under pointer', near(tm * 60 + ts, expectTip, 1.2), `tip=${tip}`);
    for (const r of [0.25, 0.75, 0.4, 0.1]) {
      [tx, ty] = await trackPoint(r);
      await page.mouse.click(tx, ty); await sleep(1400);
      const cur = (await vs()).t;
      check(`Click timeline at ${r * 100}% seeks there`, near(cur, r * d, 1.2), `t=${f2(cur)} expected≈${f2(r * d)}`);
    }
    const [x1, y1] = await trackPoint(0.2), [x2] = await trackPoint(0.6);
    await page.mouse.move(x1, y1); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1); await sleep(40); }
    await page.mouse.up(); await sleep(1400);
    check('Drag along timeline scrubs to drop point', near((await vs()).t, 0.6 * d, 1.2), `t=${f2((await vs()).t)}`);

    // Play / pause
    await hover();
    let p0 = (await vs()).paused;
    await press('k'); await sleep(300);
    check('K toggles play/pause', (await vs()).paused !== p0);
    p0 = (await vs()).paused;
    await clickBtn('play'); await sleep(300);
    check('Play button toggles exactly once', (await vs()).paused !== p0);
    await setPaused(true);

    // Skip back / forward
    await hover();
    for (const [key, delta] of [['ArrowLeft', -5], ['ArrowRight', 5], ['Shift+ArrowLeft', -1], ['Shift+ArrowRight', 1]]) {
      const t0 = (await vs()).t;
      await press(key); await sleep(900);
      const t = (await vs()).t;
      check(`${key} moves ${delta > 0 ? '+' : ''}${delta}s`, near(t - t0, delta, 0.2), `${f2(t0)} → ${f2(t)}`);
    }
    for (const [act, delta, mods] of [['back', -5], ['fwd', 5], ['back', -1, ['Shift']]]) {
      const t0 = (await vs()).t;
      if (mods) await page.keyboard.down('Shift');
      await clickBtn(act);
      if (mods) await page.keyboard.up('Shift');
      await sleep(900);
      const t = (await vs()).t;
      check(`${mods ? 'Shift+' : ''}${act} button moves ${delta > 0 ? '+' : ''}${delta}s`, near(t - t0, delta, 0.2), `${f2(t0)} → ${f2(t)}`);
    }

    // Off-video arrow isolation
    await setPaused(true);
    await page.mouse.move(20, 450); await sleep(200);
    const tOff = (await vs()).t;
    await press('ArrowRight'); await sleep(400);
    check('ArrowRight off-video does not seek', near((await vs()).t, tOff, 0.1));

    // Frame step
    await hover();
    await setPaused(false); await sleep(300);
    await press('.'); await sleep(400);
    const vf1 = await vs();
    check('"." pauses the video', vf1.paused);
    await press('.'); await sleep(400);
    const vf2 = await vs();
    check('"." steps forward one frame', near(vf2.t - vf1.t, 1 / 30, 0.015), `Δ=${f2(vf2.t - vf1.t)}`);
    await press(','); await sleep(400);
    check('"," steps back one frame', near((await vs()).t - vf2.t, -1 / 30, 0.015));
    const tf0 = (await vs()).t;
    await clickBtn('nextF'); await sleep(400);
    check('Next-frame button works', near((await vs()).t - tf0, 1 / 30, 0.015));

    // A-B loop
    await hover();
    [tx, ty] = await trackPoint(0.3);
    await page.mouse.click(tx, ty); await sleep(1200);
    await setPaused(false); await sleep(700);
    await hover(); await press('a');
    const A = (await vs()).t;
    await sleep(2400);
    await hover(); await press('b');
    const B = A + 2.4;
    const oLoop = await ov();
    check('Loop turns on after setting A and B', oLoop.loopOn && oLoop.region && !!oLoop.mkA && !!oLoop.mkB);
    const samples = [];
    for (let i = 0; i < 16; i++) { await sleep(400); samples.push((await vs()).t); }
    const inside = samples.every((t) => t >= A - 0.35 && t <= B + 0.5);
    const wraps = samples.filter((t, i) => i && t < samples[i - 1] - 1).length;
    check('Playback stays inside A–B', inside, `A≈${f2(A)} B≈${f2(B)} min=${f2(Math.min(...samples))} max=${f2(Math.max(...samples))}`);
    check('Loop repeats (wraps back to A)', wraps >= 2, `${wraps} wraps`);

    // Drag B marker +3s
    const oMk = await ov();
    const mb = oMk.mkB, pxPerSec = oMk.track[2] / d;
    await page.mouse.move(mb[0] + mb[2] / 2, mb[1] + mb[3] / 2); await page.mouse.down();
    await page.mouse.move(mb[0] + mb[2] / 2 + pxPerSec * 3, mb[1] + mb[3] / 2, { steps: 4 });
    await page.mouse.up();
    const sExt = [];
    for (let i = 0; i < 18; i++) { await sleep(400); sExt.push((await vs()).t); }
    check('Dragging B marker extends the loop', Math.max(...sExt) > B + 1.4, `new max=${f2(Math.max(...sExt))}`);

    await hover(); await press('l');
    check('L turns loop off', !(await ov()).loopOn);
    const sOff = [];
    for (let i = 0; i < 16; i++) { await sleep(400); sOff.push((await vs()).t); }
    check('With loop off, playback continues past B', Math.max(...sOff) > B + 3.4, `max=${f2(Math.max(...sOff))}`);
    await hover(); await press('l'); await sleep(700);
    check('L turns loop back on and jumps to A', (await ov()).loopOn && near((await vs()).t, A, 1.0), `t=${f2((await vs()).t)} A≈${f2(A)}`);
    await clickBtn('clear'); await sleep(200);
    const oClr = await ov();
    check('Clear (×) removes loop and markers', !oClr.loopOn && !oClr.mkA && !oClr.mkB && !oClr.region);

    // Speed
    await hover();
    await clickBtn('speed');
    check('Click speed: 1× → 1.25×', near((await vs()).rate, 1.25, 0.001));
    await hover();
    const oSpd = await ov();
    await page.mouse.click(oSpd.btn.speed[0] + oSpd.btn.speed[2] / 2, oSpd.btn.speed[1] + oSpd.btn.speed[3] / 2, { button: 'right' });
    await sleep(150);
    check('Right-click speed: back to 1×', near((await vs()).rate, 1, 0.001));
    await press('s');
    check('S slows to 0.9×', near((await vs()).rate, 0.9, 0.001));
    await press('d'); await press('d');
    check('D speeds to 1.1×', near((await vs()).rate, 1.1, 0.001));
    await press('r');
    check('R resets to 1×', near((await vs()).rate, 1, 0.001));
    for (let i = 0; i < 4; i++) await clickBtn('speed');
    check('Cycling past 2× wraps to 0.25×', near((await vs()).rate, 0.25, 0.001));
    await press('r');

    // Mirror & persistence across reload
    await hover(); await press('m'); await sleep(200);
    check('M mirrors the video', (await ov()).mirrorClass && /matrix\(-1/.test((await vs()).transform));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 }); await sleep(3000);
    check('Mirror setting persists after reload', (await ov()).mirrorClass);
    await page.evaluate(() => { const v = window.__main(); v.muted = true; v.play().catch(() => {}); });
    await hover(); await clickBtn('mirror'); await sleep(200);
    check('Mirror button turns it off', !(await ov()).mirrorClass && !/matrix\(-1/.test((await vs()).transform));

    // Typing isolation
    await setPaused(true);
    await page.evaluate(() => { const i = document.createElement('input'); i.id = '__ti'; i.style.cssText = 'position:fixed;top:60px;left:20px;z-index:9'; document.body.appendChild(i); i.focus(); });
    await hover();
    await page.keyboard.type('akbm'); await sleep(250);
    const typed = await page.evaluate(() => document.getElementById('__ti').value);
    check('Typing "akbm" in a text box goes to the box, not the player', typed === 'akbm' && !(await ov()).loopOn && (await vs()).paused && !(await ov()).mirrorClass);
    await page.evaluate(() => document.getElementById('__ti').remove());

    // Popup skip setting
    const pop = await ctx.newPage();
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    check('Popup opens with default skip = 5', (await pop.inputValue('#skip')) === '5');
    await pop.fill('#skip', '3'); await pop.dispatchEvent('#skip', 'change'); await sleep(350);
    await page.bringToFront();
    await hover(); await sleep(200);
    check('Skip buttons relabel to 3', (await ov()).skipLabel === '3');
    const tSk = (await vs()).t;
    await press('ArrowLeft'); await sleep(900);
    check('ArrowLeft now skips 3s', near((await vs()).t - tSk, -3, 0.2));
    await pop.fill('#skip', '5'); await pop.dispatchEvent('#skip', 'change'); await sleep(250);
    await pop.close();
    await page.bringToFront();

    // Reels feed scroll
    await setPaused(false);
    await hover(); await press('a');
    const firstUrl = page.url();
    const [cx, cy] = await center();
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 900); await sleep(3200);
    check('Feed scrolled to a different reel', page.url() !== firstUrl, page.url());
    await hover(); await sleep(250);
    const oFeed = await ov();
    check('Controls follow the new reel with clean loop state', oFeed.show && !oFeed.loopOn && !oFeed.mkA);

    // /p/ post page
    await page.goto(`https://www.instagram.com/p/${REEL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: 30000 }); await sleep(3200);
    const dlg = await page.$('div[role="dialog"]');
    if (dlg) {
      await hover(); await sleep(250);
      check('Controls stay hidden under Instagram login popup on /p/', !(await ov()).show);
      const closeBtn = await page.$('div[role="dialog"] svg[aria-label="Close"], div[role="dialog"] [aria-label="Close"]');
      if (closeBtn) { await closeBtn.click().catch(() => {}); await sleep(600); }
    }
    await hover(); await sleep(250);
    check('Controls appear on /p/ post video', (await ov()).show);

    check('No extension errors in console', extErrors.length === 0, extErrors.slice(0, 3).join(' | '));
  } finally {
    await cleanup();
  }
  return suite.summary();
}

if (require.main === module) {
  run().then((s) => process.exit(s.failed.length ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { run };
