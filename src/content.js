// ReelCoach — overlay UI (isolated world).
// One floating control layer (inside a shadow root, outside the page's React/DOM tree)
// that attaches to whichever video you hover: timeline, skip, frame step, A-B loop,
// speed and mirror.
(() => {
  'use strict';
  // Load-once guard keyed by a Symbol: page markup (e.g. <div id="…">) can shadow string-named
  // window properties ("DOM clobbering"), but never Symbol-keyed ones.
  const LOADED = Symbol.for('igvc.content.loaded');
  if (window[LOADED]) return;
  window[LOADED] = true;

  // SECURITY MODEL
  // - Everything the page can touch (DOM, events) is untrusted.
  // - Only real user input (event.isTrusted) can operate the controls, so page scripts cannot
  //   press our buttons or keys.
  // - Pure client-side UI overlay: no network requests, no remote code, no downloads.

  // ---------------- settings ----------------
  const DEFAULTS = { skip: 5, fineSkip: 1, autoHide: 2.5, mirror: false, dotMode: false, enabled: true };
  const LIMITS = { skip: [0.5, 60], fineSkip: [0.1, 30], autoHide: [0.5, 30] };
  let settings = { ...DEFAULTS };
  const ext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id ? chrome : null;

  // Accept only known keys with the right type and range; anything else falls back to defaults.
  function cleanSetting(key, value) {
    if (key === 'mirror' || key === 'dotMode') return value === true;
    if (key === 'enabled') return value !== false;
    if (!(key in LIMITS)) return undefined;
    const n = Number(value);
    const [lo, hi] = LIMITS[key];
    return Number.isFinite(n) ? clamp(n, lo, hi) : DEFAULTS[key];
  }
  function cleanSettings(raw) {
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, key)) out[key] = cleanSetting(key, raw[key]);
    }
    return out;
  }

  function loadSettings() {
    if (!ext) return applySettings();
    ext.storage.sync.get(DEFAULTS, (s) => { settings = cleanSettings(s); applySettings(); });
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const next = { ...settings };
      for (const key of Object.keys(DEFAULTS)) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) next[key] = cleanSetting(key, changes[key].newValue);
      }
      settings = next;
      applySettings();
    });
  }
  function saveSetting(key, value) {
    settings = { ...settings, [key]: cleanSetting(key, value) };
    if (ext) ext.storage.sync.set({ [key]: settings[key] });
    applySettings();
  }

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const FRAME = 1 / 30;

  // ---------------- per-video state ----------------
  const states = new WeakMap();
  const looping = new Set();

  function getState(v) {
    let s = states.get(v);
    if (!s) {
      s = { a: null, b: null, loop: false, prevT: 0, playT: null };
      states.set(v, s);
      // Instagram recycles <video> elements while scrolling: a new source = fresh loop state.
      v.addEventListener('loadstart', () => { s.playT = null; clearLoop(v, true); });
      v.addEventListener('ended', () => {
        const st = states.get(v);
        if (st && st.loop) { seekTo(v, loopA(v, st)); v.play().catch(() => {}); }
      });
    }
    return s;
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function dur(v) {
    if (isFinite(v.duration) && v.duration > 0) return v.duration;
    try { if (v.seekable.length) return v.seekable.end(v.seekable.length - 1); } catch {}
    return 0;
  }
  const loopA = (v, s) => (s.a != null ? s.a : 0);
  const loopB = (v, s) => (s.b != null ? s.b : dur(v));

  function fmt(t, tenths = true) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const sec = t - m * 60;
    const ss = tenths ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
    return `${m}:${ss}`;
  }

  // ---------------- seeking ----------------
  // Instagram's OzPlayer installs an own-property `currentTime` setter in the MAIN world that
  // clears stale SourceBuffer ranges before seeking so its MSE gap-skipper won't snap back to an
  // earlier buffered range. `setMediaTime` routes seeks through `src/page-seek.js` in the MAIN
  // world, with a direct fallback if the helper hasn't run yet.
  const pendingSeeks = new Map(); // video -> { target, start, until, tries, retryAt, loading, resume, lastSeekAt }
  let scrubTime = null;
  let dragWasPlaying = false;

  function setMediaTime(v, t) {
    const handled = !v.dispatchEvent(new CustomEvent('igvc:seek', { detail: t, cancelable: true }));
    if (!handled) v.currentTime = t;
  }

  function isBuffered(v, t) {
    const d = dur(v);
    try {
      for (let i = 0; i < v.buffered.length; i++) {
        const end = v.buffered.end(i);
        const hi = d > 0 && end >= d - 0.25 ? Math.max(end, d) : end - 0.15;
        if (v.buffered.start(i) - 0.08 <= t && t <= hi) return true;
      }
    } catch {}
    return false;
  }

  function seekTo(v, t, wantPlay) {
    const d = dur(v);
    t = clamp(t, 0, d > 0.25 ? d - 0.1 : d || Infinity);
    const now = performance.now();
    const prev = pendingSeeks.get(v);
    const playing = wantPlay !== undefined ? wantPlay : (!v.paused || !!(prev && prev.resume));
    const st = states.get(v);
    if (st) st.playT = t;
    const unbuf = !isBuffered(v, t);
    const p = {
      target: t, start: now, until: now + (unbuf ? 30000 : 2500),
      tries: 0, retryAt: 0, loading: unbuf, resume: playing,
      lastSeekAt: now,
    };
    if (playing && v.paused) v.play().catch(() => {});
    else if (!playing && !v.paused) { markPauseIntent(); v.pause(); }
    setMediaTime(v, t);
    pendingSeeks.set(v, p);
  }

  function guardSeeks(now) {
    for (const [v, p] of pendingSeeks) {
      if (!v.isConnected || now > p.until) {
        if (p.resume && v.isConnected && v.paused && isBuffered(v, v.currentTime)) v.play().catch(() => {});
        pendingSeeks.delete(v);
        continue;
      }
      if (p.loading) {
        // Give OzPlayer's async clearSourceBufferRange (~10-60ms) time to set native currentTime.
        const settled = now - p.lastSeekAt > 120;
        const bufferedNow = isBuffered(v, p.target);
        if (settled && bufferedNow && !v.seeking && (v.readyState >= 3 || (!p.resume && v.readyState >= 2))) {
          if (Math.abs(v.currentTime - p.target) > 0.85) {
            setMediaTime(v, p.target);
            p.lastSeekAt = now;
            continue;
          }
          p.loading = false;
          p.target = v.currentTime;
          p.start = now;
          p.lastSeekAt = now;
          p.until = now + 1500;
          if (p.resume && v.paused) v.play().catch(() => {});
          p.resume = false;
          continue;
        }
        if (Math.abs(v.currentTime - p.target) > 0.85) {
          // If an older in-flight segment appended and snapped currentTime away from target,
          // re-issue through MAIN world so OzPlayer clears that range and fetches target.
          const backoff = v.seeking ? 700 : 300;
          if (now - p.lastSeekAt > backoff) {
            if (++p.tries > 18) { pendingSeeks.delete(v); continue; }
            setMediaTime(v, p.target);
            p.lastSeekAt = now;
          }
        }
        continue;
      }
      if (p.retryAt) {
        if (now < p.retryAt) continue;
        p.retryAt = 0;
        if (!isBuffered(v, p.target)) {
          p.loading = true;
          p.until = Math.max(p.until, now + 30000);
        }
        setMediaTime(v, p.target);
        p.lastSeekAt = now;
        p.start = now;
        p.until = Math.max(p.until, now + 2000);
        continue;
      }
      if (now - p.lastSeekAt < 140 || v.seeking || v.readyState < 3) {
        p.start = now - ((v.currentTime - p.target) * 1000) / (v.playbackRate || 1);
        continue;
      }
      const expected = p.target + ((now - p.start) / 1000) * (v.paused ? 0 : v.playbackRate);
      const d = dur(v);
      if (v.ended || (d > 2 && expected >= d - 0.3 && v.currentTime < 1.0)) {
        pendingSeeks.delete(v);
        continue;
      }
      const drift = v.currentTime - expected;
      if (drift > 0.85 || drift < -1.5) {
        if (++p.tries > 12) { pendingSeeks.delete(v); continue; }
        p.retryAt = now + 350;
        p.until = Math.max(p.until, now + 3000);
        continue;
      }
      if (!v.seeking && (v.readyState >= 3 || (v.paused && v.readyState >= 2)) && now - p.lastSeekAt > 350 && Math.abs(drift) < 0.35) {
        pendingSeeks.delete(v);
      }
    }
  }

  // Catch mid-playback MSE gap-jumps (wrapping to 0:00 at unbuffered gaps) and leading PTS start
  // gaps (e.g. buffered=[0.04..24] while currentTime sits stuck at 0.00 with readyState <= 2).
  function guardPlaybackGaps(now) {
    const v = active;
    if (!v || !v.isConnected || dragging || pendingSeeks.has(v)) return;
    const s = getState(v);
    if (!v.paused && !v.seeking && v.readyState <= 2 && v.currentTime < 0.5) {
      try {
        if (v.buffered.length > 0) {
          const bs = v.buffered.start(0), be = v.buffered.end(0);
          if (bs > v.currentTime + 0.005 && bs < 1.0 && be > bs + 0.2) {
            if (!s.stallAt) s.stallAt = now;
            else if (now - s.stallAt > 350) { s.stallAt = 0; setMediaTime(v, bs + 0.02); return; }
          } else s.stallAt = 0;
        }
      } catch {}
    } else s.stallAt = 0;
    if (v.paused || v.seeking) return;
    const d = dur(v), ct = v.currentTime;
    const prev = s.playT;
    s.playT = ct;
    if (prev == null || d < 5 || prev < 2 || prev >= d - 1.2) return;
    if (s.loop && Math.abs(ct - loopA(v, s)) < 0.8) return;
    const jumpedToZero = ct < 0.5 && prev > 3;
    const jumpedForward = ct - prev > 2.5;
    if ((jumpedToZero || jumpedForward) && !isBuffered(v, prev + 0.25)) {
      seekTo(v, prev + 0.05, true);
    }
  }

  // Where the playhead should be, accounting for an active drag or a seek that is still settling.
  function intendedTime(v) {
    if (dragging === 'seek' && v === active && scrubTime != null) return scrubTime;
    const p = pendingSeeks.get(v);
    if (!p) return v.currentTime;
    const now = performance.now();
    if (p.loading || p.retryAt || v.seeking || now - p.lastSeekAt < 160) return p.target;
    return p.target + ((now - p.start) / 1000) * (v.paused ? 0 : v.playbackRate);
  }

  // ---------------- actions ----------------
  function seekBy(v, delta) {
    // If a previous seek is still settling, step from where it is going, not from where the player jumped.
    seekTo(v, intendedTime(v) + delta);
    toast(`${delta < 0 ? '−' : '+'}${+Math.abs(delta).toFixed(2)}s  ·  ${fmt(pendingSeeks.get(v).target)}`);
  }
  function frameStep(v, dir) {
    markPauseIntent();
    v.pause();
    seekTo(v, intendedTime(v) + dir * FRAME, false);
  }
  function togglePlay(v) {
    const p = pendingSeeks.get(v);
    if (p && p.loading) {
      if (p.resume) { p.resume = false; markPauseIntent(); v.pause(); }
      else { p.resume = true; v.play().catch(() => {}); }
      return;
    }
    if (v.paused) {
      const d = dur(v);
      // Posts whose video track ends slightly before audio duration (e.g. 41.57s vs 41.68s)
      // pause at the end with v.ended === false; rewind to 0 so Play actually restarts them.
      if (v.ended || (d > 1 && v.currentTime >= d - 0.25)) {
        seekTo(v, 0, true);
        return;
      }
      try {
        if (v.buffered.length > 0 && v.currentTime < v.buffered.start(0) && v.buffered.start(0) < 1.0) {
          setMediaTime(v, v.buffered.start(0) + 0.02);
        }
      } catch {}
      v.play().catch(() => {});
    } else {
      markPauseIntent();
      v.pause();
    }
  }
  function enableLoop(v, on) {
    const s = getState(v);
    s.loop = on;
    if (on) {
      looping.add(v);
      const A = loopA(v, s), B = loopB(v, s);
      if (v.currentTime < A || v.currentTime >= B) seekTo(v, A);
    } else {
      looping.delete(v);
    }
  }
  function setA(v) {
    const s = getState(v);
    s.a = intendedTime(v);
    if (s.b != null && s.b <= s.a + 0.05) s.b = null;
    enableLoop(v, true);
    toast(`Loop start ${fmt(s.a)}`);
  }
  function setB(v) {
    const s = getState(v);
    const t = intendedTime(v);
    if (s.a != null && t <= s.a + 0.05) { s.b = s.a; s.a = t; } else s.b = t;
    enableLoop(v, true);
    seekTo(v, loopA(v, s));
    toast(`Looping ${fmt(loopA(v, s))} → ${fmt(loopB(v, s))}`);
  }
  function toggleLoop(v) {
    const s = getState(v);
    enableLoop(v, !s.loop);
    toast(s.loop ? `Loop on  ${fmt(loopA(v, s))} → ${fmt(loopB(v, s))}` : 'Loop off');
  }
  function clearLoop(v, silent) {
    const s = states.get(v);
    if (!s) return;
    s.a = s.b = null;
    s.loop = false;
    looping.delete(v);
    if (!silent) toast('Loop cleared');
  }
  function setSpeed(v, r) {
    r = Math.round(clamp(r, 0.1, 4) * 100) / 100;
    v.playbackRate = r;
    toast(`Speed ${r}×`);
  }
  function cycleSpeed(v, dir = 1) {
    const cur = v.playbackRate;
    let next;
    if (dir > 0) next = SPEEDS.find((x) => x > cur + 0.001) ?? SPEEDS[0];
    else next = [...SPEEDS].reverse().find((x) => x < cur - 0.001) ?? SPEEDS[SPEEDS.length - 1];
    setSpeed(v, next);
  }
  let expandedVideo = null;
  function toggleMirror() {
    saveSetting('mirror', !settings.mirror);
    toast(settings.mirror ? 'Mirrored' : 'Mirror off');
  }
  function toggleDotMode() {
    const next = !settings.dotMode;
    expandedVideo = null;
    saveSetting('dotMode', next);
    toast(next ? 'Dot mode on — click side dot to expand' : 'Dot mode off');
  }

  // ---------------- site ----------------
  // Playback controls work on any <video> across supported sites.
  const SITE = { 'www.facebook.com': 'facebook', 'www.tiktok.com': 'tiktok' }[location.hostname] || 'instagram';

  // Is ReelCoach active on this page right now? Off when the user switched it off in the menu.
  // On Facebook only reels and stories get controls: regular Facebook videos already have a
  // timeline, and our bar would cover their mute button.
  function siteActive() {
    if (!settings.enabled) return false;
    if (SITE === 'facebook') return /^\/(reel|reels|stories)(\/|$)/.test(location.pathname);
    return true;
  }

  // Facebook's story viewer pauses the video whenever the mouse is over it (and resumes when the
  // mouse leaves). Using our controls means hovering, so on stories we undo pauses the user didn't
  // ask for. A pause right after a real click/key press, or from our own buttons, is respected.
  let pauseIntentAt = 0;
  function markPauseIntent() { pauseIntentAt = performance.now(); }
  const autoResumes = [];
  document.addEventListener('pointerdown', (e) => { if (e.isTrusted) markPauseIntent(); }, true);
  document.addEventListener('pause', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || SITE !== 'facebook' || !siteActive()) return;
    if (!/^\/stories(\/|$)/.test(location.pathname) || v.ended || v !== active) return;
    const now = performance.now();
    if (now - pauseIntentAt < 700) return;
    const r = rectOf(v);
    if (!(inRect(r, pointer.x, pointer.y) || overPanel)) return; // only while the user is hovering
    while (autoResumes.length && now - autoResumes[0] > 4000) autoResumes.shift();
    if (autoResumes.length >= 5) return; // Facebook insists: stop fighting it
    autoResumes.push(now);
    v.play().catch(() => {});
  }, true);

  // ---------------- UI ----------------
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M12 5V1.5L7 6.5l5 5V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M12 5V1.5L7 6.5l5 5V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z"/></svg>',
    prevF: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
    nextF: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
    loop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg>',
    mirror: '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2zM9 6v12L3 18zM15 6l6 12h-6z" fill-rule="evenodd"/></svg>',
    dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 16a7 7 0 1 1 7-7 7 7 0 0 1-7 7z" opacity=".55"/></svg>',
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { position: fixed; pointer-events: none; opacity: 0; transition: opacity .18s ease-out;
      font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #fff; }
    .wrap.show { opacity: 1; }
    .wrap.show:not(.collapsed) .bar { pointer-events: auto; }
    .wrap.collapsed .bar { opacity: 0; pointer-events: none !important; transform: translateY(6px); }
    .bar { position: absolute; left: 48px; right: 48px; bottom: 8px; padding: 10px 10px 8px; border-radius: 12px;
      background: rgba(12, 12, 16, .9); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, .12);
      box-shadow: 0 6px 20px rgba(0, 0, 0, .45); transition: bottom .15s ease-out, opacity .15s ease-out, transform .15s ease-out; }
    .dot { position: absolute; left: 10px; top: 36%; width: 28px; height: 28px; min-width: 28px; padding: 0; border-radius: 50%;
      display: none; align-items: center; justify-content: center; pointer-events: none; opacity: 0;
      background: rgba(12, 12, 16, .84); backdrop-filter: blur(6px); border: 1.5px solid rgba(255, 255, 255, .26);
      box-shadow: 0 3px 12px rgba(0, 0, 0, .45); transition: opacity .15s ease-out, transform .12s ease-out, border-color .12s; }
    .wrap.dot-mode .dot { display: inline-flex; }
    .wrap.show.dot-mode .dot { opacity: 1; pointer-events: auto; }
    .dot:hover { background: rgba(18, 18, 24, .95); border-color: #ffc400; transform: scale(1.08); }
    .dot-core { width: 9px; height: 9px; border-radius: 50%; background: #ffc400; transition: transform .15s ease-out, background-color .15s; }
    .dot.open .dot-core { background: #fff; transform: scale(.75); }
    .tl { position: relative; height: 20px; cursor: pointer; touch-action: none; }
    .track { position: absolute; left: 0; right: 0; top: 8px; height: 4px; border-radius: 3px;
      background: rgba(255,255,255,.22); transition: top .1s, height .1s; }
    .tl:hover .track, .tl.drag .track { top: 7px; height: 6px; }
    .buf, .played, .region { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; }
    .buf { background: rgba(255,255,255,.3); }
    .played { background: #fff; }
    .region { display: none; top: -4px; bottom: -4px; border-radius: 3px; background: rgba(255,196,0,.32);
      box-shadow: inset 0 0 0 1px rgba(255,196,0,.6); }
    .region.show { display: block; }
    .region.off { background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
    .head { position: absolute; top: 50%; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); transform: scale(0); transition: transform .12s ease-out; }
    .tl:hover .head, .tl.drag .head { transform: scale(1); }
    .mk { position: absolute; top: -2px; width: 14px; height: 24px; margin-left: -7px; cursor: ew-resize; display: none; z-index: 2; }
    .mk.show { display: block; }
    .mk::before { content: ''; position: absolute; left: 6px; top: 2px; bottom: 2px; width: 2px; border-radius: 1px; background: #ffc400; }
    .mk::after { content: attr(data-l); position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
      font-size: 10px; font-weight: 700; color: #ffc400; text-shadow: 0 1px 2px #000; }
    .mk.off::before { background: rgba(255,255,255,.7); } .mk.off::after { color: rgba(255,255,255,.8); }
    .tip { position: absolute; bottom: 24px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px;
      background: rgba(0,0,0,.85); font-variant-numeric: tabular-nums; white-space: nowrap; display: none; pointer-events: none; }
    .tl:hover .tip, .tl.drag .tip { display: block; }
    .row { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin-top: 2px; }
    .grow { flex: 1 1 auto; }
    .sep { width: 1px; height: 16px; margin: 0 4px; background: rgba(255,255,255,.25); }
    button { all: unset; box-sizing: border-box; position: relative; height: 30px; min-width: 30px; padding: 0 6px; border-radius: 7px;
      display: inline-flex; align-items: center; justify-content: center; gap: 2px; cursor: pointer; color: #fff;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-variant-numeric: tabular-nums; transition: background-color .12s, transform .1s; }
    button:hover { background: rgba(255,255,255,.16); }
    button:active { transform: scale(.95); }
    button:focus-visible { outline: 2px solid #ffc400; outline-offset: 1px; }
    button.on { background: #ffc400; color: #111; }
    button svg { width: 18px; height: 18px; fill: currentColor; flex: none; }
    button .n { font-size: 11px; }
    .ab { min-width: 26px; padding: 0 5px; font-size: 12px; }
    .ab.set { color: #ffc400; }
    .clr { display: none; }
    .clr.show { display: inline-flex; }
    .clr svg { width: 14px; height: 14px; }
    .time { padding: 0 6px; white-space: nowrap; font-variant-numeric: tabular-nums; opacity: .92; }
    .time .d { opacity: .6; }
    .spd { min-width: 42px; }
    .toast { position: absolute; top: 14px; left: 50%; max-width: calc(100% - 120px); overflow: hidden; text-overflow: ellipsis;
      transform: translate(-50%, -4px); padding: 7px 11px; border-radius: 8px; background: rgba(0,0,0,.82);
      font-weight: 600; white-space: nowrap; opacity: 0; transition: opacity .15s, transform .15s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translate(-50%, 0); }
    .wrap.compact .bar { left: 44px; right: 44px; padding: 8px 7px 6px; }
    .wrap.compact .opt { display: none; }
    .wrap.compact .time .d { display: none; }
    .wrap.compact button:not(.dot) { height: 26px; min-width: 22px; padding: 0 2px; }
    .wrap.compact button:not(.dot) svg { width: 16px; height: 16px; }
    .wrap.compact .row { gap: 1px; flex-wrap: nowrap; }
    .wrap.compact .time { padding: 0 3px; font-size: 11px; }
    .wrap.compact .spd { min-width: 30px; font-size: 11px; }
    .wrap.tiny .sk, .wrap.tiny .time { display: none; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `;

  const host = document.createElement('div');
  host.id = 'igvc-host';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="wrap">
      <div class="toast"></div>
      <button class="dot" data-act="expandDot" title="Open ReelCoach controls" aria-label="Open ReelCoach controls"><span class="dot-core"></span></button>
      <div class="bar">
        <div class="tl">
          <div class="track">
            <div class="buf"></div><div class="region"></div><div class="played"></div>
            <div class="head"></div>
          </div>
          <div class="mk" data-l="A" title="Drag to move loop start"></div>
          <div class="mk" data-l="B" title="Drag to move loop end"></div>
          <div class="tip"></div>
        </div>
        <div class="row">
          <button data-act="back" title="Back (←)">${ICON.back}<span class="n sk"></span></button>
          <button class="opt" data-act="prevF" title="Previous frame (,)">${ICON.prevF}</button>
          <button data-act="play" title="Play / pause (K)">${ICON.play}</button>
          <button class="opt" data-act="nextF" title="Next frame (.)">${ICON.nextF}</button>
          <button data-act="fwd" title="Forward (→)">${ICON.fwd}<span class="n sk"></span></button>
          <span class="time"></span>
          <span class="grow"></span>
          <button class="ab" data-act="setA" title="Set loop start at current time (A)">A</button>
          <button class="ab" data-act="setB" title="Set loop end at current time (B)">B</button>
          <button data-act="loop" title="Loop on / off (L)">${ICON.loop}</button>
          <button class="clr" data-act="clear" title="Clear loop (X)">${ICON.close}</button>
          <span class="sep opt"></span>
          <button class="spd" data-act="speed" title="Speed — click: faster, right-click: slower (S / D)">1×</button>
          <button data-act="mirror" title="Mirror video (M)">${ICON.mirror}</button>
          <button data-act="dot" title="Dot mode — collapse into a side dot until clicked">${ICON.dot}</button>
        </div>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const ui = {
    wrap: $('.wrap'), bar: $('.bar'), dot: $('.dot'), toast: $('.toast'),
    tl: $('.tl'), track: $('.track'), buf: $('.buf'), played: $('.played'), region: $('.region'), head: $('.head'),
    mkA: root.querySelector('.mk[data-l="A"]'), mkB: root.querySelector('.mk[data-l="B"]'), tip: $('.tip'),
    play: $('[data-act="play"]'), time: $('.time'), loop: $('[data-act="loop"]'), clr: $('.clr'),
    setA: $('[data-act="setA"]'), setB: $('[data-act="setB"]'), speed: $('.spd'), mirror: $('[data-act="mirror"]'),
    dotToggle: $('[data-act="dot"]'),
    skipLabels: root.querySelectorAll('.sk'),
  };
  // Time readout is two text nodes (no HTML parsing of dynamic values anywhere).
  ui.timeCur = document.createElement('span');
  ui.timeDur = document.createElement('span');
  ui.timeDur.className = 'd';
  ui.time.append(ui.timeCur, ui.timeDur);

  const globalStyle = document.createElement('style');
  globalStyle.textContent = 'html.igvc-mirror video { transform: scaleX(-1) !important; }';

  function mount() {
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!globalStyle.isConnected) (document.head || document.documentElement).appendChild(globalStyle);
  }
  mount();

  function applySettings() {
    ui.skipLabels.forEach((el) => { el.textContent = String(+settings.skip); });
    root.querySelector('[data-act="back"]').title = `Back ${settings.skip}s (←, Shift+← = ${settings.fineSkip}s)`;
    root.querySelector('[data-act="fwd"]').title = `Forward ${settings.skip}s (→, Shift+→ = ${settings.fineSkip}s)`;
    document.documentElement.classList.toggle('igvc-mirror', !!settings.mirror && siteActive());
    ui.mirror.classList.toggle('on', !!settings.mirror);
    ui.dotToggle.classList.toggle('on', !!settings.dotMode);
    ui.dotToggle.title = settings.dotMode
      ? 'Dot mode is on — click to always show full controls on hover'
      : 'Dot mode — collapse into a side dot until clicked';
    if (!settings.dotMode) expandedVideo = null;
  }

  // Keep Instagram from reacting to clicks/keys aimed at our controls.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend', 'wheel']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  let toastTimer = 0;
  function toast(msg, ms = 1400) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
    poke(ms);
  }

  // ---------------- tracking the active video ----------------
  let active = null;
  let pointer = { x: -1, y: -1 };
  let lastMove = 0;
  let pokeUntil = 0;
  let overPanel = false;
  let needPick = false;
  let dragging = null; // 'seek' | 'A' | 'B'

  function poke(ms = 1500) { pokeUntil = Math.max(pokeUntil, performance.now() + ms); }

  function rectOf(v) {
    const r = v.getBoundingClientRect();
    return r.width > 60 && r.height > 60 ? r : null;
  }
  const inRect = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  // True when something that isn't part of the video's own player (a dialog, sign-up popup,
  // share sheet…) is on top of the video at (x, y). Instagram's player overlays (caption, mute
  // button…) share a nearby container roughly the size of the video; popups only share the page.
  function isCovered(v, x, y) {
    let top = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === host) continue;
      top = el;
      break;
    }
    if (!top || top === v || top.contains(v)) return false;
    let common = top.parentElement;
    while (common && !common.contains(v)) common = common.parentElement;
    if (!common) return true;
    // Pop-ups are dialogs or screen-pinned layers; the player's own overlays (captions, buttons,
    // letterbox cards like TikTok's) are ordinary positioned elements inside the player.
    for (let el = top; el && el !== common; el = el.parentElement) {
      const role = el.getAttribute('role');
      if (role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true') return true;
      if (getComputedStyle(el).position === 'fixed') return true;
    }
    return false;
  }

  function videoAt(x, y) {
    const hits = [];
    for (const v of document.querySelectorAll('video')) {
      const r = rectOf(v);
      if (inRect(r, x, y)) hits.push(v);
    }
    if (hits.length <= 1) return hits[0] || null;
    const stack = document.elementsFromPoint(x, y);
    let best = null, bestIdx = Infinity;
    for (const v of hits) {
      const i = stack.indexOf(v);
      if (i >= 0 && i < bestIdx) { best = v; bestIdx = i; }
    }
    return best || hits[hits.length - 1];
  }

  function mostVisibleVideo() {
    const vw = innerWidth, vh = innerHeight;
    let best = null, bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = rectOf(v);
      if (!r) continue;
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      const score = w * h + (v.paused ? 0 : 1e7);
      if (score > bestScore) { best = v; bestScore = score; }
    }
    return best;
  }

  // Every input handler below ignores events that page scripts synthesize (isTrusted === false).
  document.addEventListener('mousemove', (e) => {
    if (!e.isTrusted) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    lastMove = performance.now();
    overPanel = e.composedPath().some((n) => n === ui.bar || n === ui.dot);
    needPick = true;
  }, { capture: true, passive: true });
  document.documentElement.addEventListener('mouseleave', (e) => {
    if (!e.isTrusted) return;
    pointer.x = pointer.y = -1; overPanel = false; needPick = true;
  });

  // ---------------- controls ----------------
  root.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const btn = e.target.closest && e.target.closest('button[data-act]');
    if (!btn || !active) return;
    if (e.detail > 0) btn.blur(); // mouse click: don't leave a focus ring or keep focus in the overlay
    const v = active;
    switch (btn.dataset.act) {
      case 'expandDot':
        expandedVideo = expandedVideo === v ? null : v;
        if (expandedVideo) poke(2500);
        render(performance.now());
        break;
      case 'back': seekBy(v, -(e.shiftKey ? settings.fineSkip : settings.skip)); break;
      case 'fwd': seekBy(v, e.shiftKey ? settings.fineSkip : settings.skip); break;
      case 'prevF': frameStep(v, -1); break;
      case 'nextF': frameStep(v, 1); break;
      case 'play': togglePlay(v); break;
      case 'setA': setA(v); break;
      case 'setB': setB(v); break;
      case 'loop': toggleLoop(v); break;
      case 'clear': clearLoop(v); break;
      case 'speed': cycleSpeed(v, e.shiftKey ? -1 : 1); break;
      case 'mirror': toggleMirror(); break;
      case 'dot': toggleDotMode(); render(performance.now()); break;
    }
  });
  ui.speed.addEventListener('contextmenu', (e) => {
    if (!e.isTrusted) return;
    e.preventDefault();
    if (active) cycleSpeed(active, -1);
  });

  function ratioAt(clientX) {
    const r = ui.track.getBoundingClientRect();
    return r.width ? clamp((clientX - r.left) / r.width, 0, 1) : 0;
  }
  function dragTo(clientX) {
    const v = active;
    if (!v) return;
    const d = dur(v);
    const t = ratioAt(clientX) * d;
    if (dragging === 'seek') {
      scrubTime = clamp(t, 0, d > 0.25 ? d - 0.1 : d || Infinity);
      if (isBuffered(v, scrubTime)) {
        setMediaTime(v, scrubTime);
      } else if (!v.paused) {
        markPauseIntent();
        v.pause();
      }
      return;
    }
    const s = getState(v);
    if (dragging === 'A') s.a = clamp(t, 0, loopB(v, s) - 0.1);
    else s.b = clamp(t, loopA(v, s) + 0.1, d);
  }
  ui.tl.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || !active || e.button !== 0) return;
    e.preventDefault();
    const mk = e.target.closest('.mk');
    dragging = mk ? mk.dataset.l : 'seek';
    if (dragging === 'seek') {
      const prev = pendingSeeks.get(active);
      dragWasPlaying = !active.paused || !!(prev && prev.resume);
      pendingSeeks.delete(active);
    }
    ui.tl.setPointerCapture(e.pointerId);
    ui.tl.classList.add('drag');
    dragTo(e.clientX);
  });
  ui.tl.addEventListener('pointermove', (e) => {
    if (!e.isTrusted || !active) return;
    const ratio = ratioAt(e.clientX);
    ui.tip.style.left = `${ratio * 100}%`;
    ui.tip.textContent = fmt(ratio * dur(active));
    if (dragging) dragTo(e.clientX);
  });
  const endDrag = () => {
    if (!dragging) return;
    const mode = dragging;
    dragging = null;
    ui.tl.classList.remove('drag');
    if (mode === 'seek') {
      if (active && scrubTime != null) seekTo(active, scrubTime, dragWasPlaying);
      scrubTime = null;
    } else if (active) {
      const s = getState(active);
      toast(`Loop ${fmt(loopA(active, s))} → ${fmt(loopB(active, s))}`);
    }
  };
  ui.tl.addEventListener('pointerup', endDrag);
  ui.tl.addEventListener('pointercancel', endDrag);

  // ---------------- keyboard ----------------
  function isTyping(el) {
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    markPauseIntent();
    if (!siteActive() || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isTyping(e.target) || isTyping(document.activeElement)) return;

    const hovered = active && active.isConnected && inRect(rectOf(active), pointer.x, pointer.y) &&
      !isCovered(active, pointer.x, pointer.y) ? active : null;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Arrow keys only when hovering a video, so Instagram's own arrow navigation still works elsewhere.
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && !hovered) return;
    if (!['ArrowLeft', 'ArrowRight', ',', '.', '<', '>', 'k', 'a', 'b', 'l', 'x', 's', 'd', 'r', 'm'].includes(key)) return;

    const v = hovered || mostVisibleVideo();
    if (!v) return;
    active = v;
    e.preventDefault();
    e.stopImmediatePropagation();
    switch (key) {
      case 'ArrowLeft': seekBy(v, -(e.shiftKey ? settings.fineSkip : settings.skip)); break;
      case 'ArrowRight': seekBy(v, e.shiftKey ? settings.fineSkip : settings.skip); break;
      case ',': case '<': frameStep(v, -1); break;
      case '.': case '>': frameStep(v, 1); break;
      case 'k': togglePlay(v); break;
      case 'a': setA(v); break;
      case 'b': setB(v); break;
      case 'l': toggleLoop(v); break;
      case 'x': clearLoop(v); break;
      case 's': setSpeed(v, v.playbackRate - 0.1); break;
      case 'd': setSpeed(v, v.playbackRate + 0.1); break;
      case 'r': setSpeed(v, 1); break;
      case 'm': toggleMirror(); break;
    }
    poke();
  }, true);

  // ---------------- frame loop ----------------
  function enforceLoops() {
    for (const v of looping) {
      const s = states.get(v);
      if (!v.isConnected || !s || !s.loop) { looping.delete(v); continue; }
      if ((dragging && v === active) || (pendingSeeks.has(v) && (pendingSeeks.get(v).loading || v.seeking))) {
        s.prevT = v.currentTime;
        continue;
      }
      const A = loopA(v, s), B = loopB(v, s), d = dur(v);
      let t = v.currentTime;
      if (B - A > 0.05) {
        const nearEnd = B >= d - 0.3;
        // Jump back at B; also catch Instagram's own wrap-around to 0 when B is the video end.
        if (t >= B - 0.02 || (nearEnd && s.prevT >= B - 0.5 && t < A - 0.05)) {
          seekTo(v, A);
          t = A;
          if (v.paused && nearEnd && !pendingSeeks.get(v)?.loading) v.play().catch(() => {});
        }
      }
      s.prevT = t;
    }
  }

  function hasDirectText(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim().length > 0) return true;
    }
    return false;
  }

  function isVisiblyShown(el, stopAt) {
    for (let cur = el; cur && cur !== stopAt; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.08) return false;
    }
    return true;
  }

  // Keep the bottom-pinned pill at 8px when the center bottom of the video is clear, and lift it
  // cleanly above bottom comments, captions, or Story reply bars that occupy the pill's zone.
  const INTERACTIVE_SEL = 'input, textarea, select, [contenteditable="true"], [role="textbox"], [placeholder], button, a[href], [role="button"], [role="link"]';
  const TEXT_CANDIDATE_SEL = `${INTERACTIVE_SEL}, span, p, label, h1, h2, h3, h4`;
  let dodge = 8;
  let dodgeFor = null;
  let dodgePath = '';
  let dodgeMeasuredAt = 0;

  function bottomClearance(v, left, right, bottom, h, compact) {
    const isStory = /^\/stories(\/|$)/.test(location.pathname);
    const minBottom = isStory ? 68 : 8;
    const padX = compact ? 44 : 48;
    const barL = left + padX + 4, barR = right - padX - 4;
    const w = right - left;
    if (barR - barL < 40 || h < 180) return minBottom;

    const maxLift = Math.max(minBottom, Math.round(Math.min(185, h * 0.38)));
    const scanTop = bottom - maxLift - 16;
    const vArea = w * h;
    const candidates = new Set();

    for (let row = 10; row <= Math.min(154, maxLift + 12); row += 18) {
      const y = bottom - row;
      if (y <= bottom - h + 8) break;
      for (let i = 0; i <= 4; i++) {
        const x = barL + ((barR - barL) * i) / 4;
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === host) continue;
          if (el === v || el.contains(v)) break;
          const ctrl = el.closest && el.closest(INTERACTIVE_SEL);
          if (ctrl && !ctrl.contains(v)) candidates.add(ctrl);
          if (hasDirectText(el)) candidates.add(el);
        }
      }
    }

    let scope = null;
    for (let p = v.parentElement; p && p !== document.body; p = p.parentElement) {
      const sr = p.getBoundingClientRect();
      if (sr.width > w + 90 || sr.height > h + 90) break;
      scope = p;
    }
    if (scope) {
      const nodes = scope.querySelectorAll(TEXT_CANDIDATE_SEL);
      const limit = Math.min(nodes.length, 120);
      for (let i = 0; i < limit; i++) {
        const el = nodes[i];
        if (hasDirectText(el) || el.matches(INTERACTIVE_SEL)) candidates.add(el);
      }
    }

    const boxes = [];
    for (const el of candidates) {
      if (!el || el === host || host.contains(el) || el.contains(v)) continue;
      const role = el.getAttribute('role');
      if (role === 'slider' || role === 'progressbar') continue;
      const er = el.getBoundingClientRect();
      if (er.width < 10 || er.height < 10) continue;
      if (er.height > Math.min(115, h * 0.25) || er.width * er.height > vArea * 0.24) continue;
      if (er.right <= barL || er.left >= barR) continue;
      if (er.bottom > bottom + 8 || er.bottom < scanTop || er.top < scanTop - 20) continue;
      if (!isVisiblyShown(el, scope ? scope.parentElement : document.body)) continue;
      boxes.push({ top: er.top, bottom: er.bottom });
    }
    if (!boxes.length) return minBottom;

    boxes.sort((a, b) => b.bottom - a.bottom);
    const barH = ui.bar.offsetHeight || 68;
    let clearanceTop = bottom - minBottom;
    let moved = true;
    while (moved) {
      moved = false;
      for (const b of boxes) {
        if (b.bottom > clearanceTop - barH + 2 && b.top < clearanceTop + 4) {
          const nextTop = b.top - 8;
          if (nextTop < clearanceTop && bottom - nextTop <= maxLift + 8) {
            clearanceTop = nextTop;
            moved = true;
          }
        }
      }
    }
    return clamp(Math.round(bottom - clearanceTop), minBottom, maxLift);
  }

  let dotTop = 0;
  let dotFor = null;
  let dotMeasuredAt = 0;

  function dotOffsetTop(v, left, top, w, h) {
    const vArea = w * h;
    const minY = Math.min(68, h * 0.25);
    const maxY = Math.max(minY + 10, h - 110);
    for (const ratio of [0.36, 0.28, 0.62, 0.22, 0.48]) {
      const cy = clamp(Math.round(h * ratio), minY, maxY);
      const px = left + 24, py = top + cy;
      let clear = true;
      for (const el of document.elementsFromPoint(px, py)) {
        if (el === host) continue;
        if (el === v || el.contains(v)) break;
        const ctrl = el.closest && el.closest(INTERACTIVE_SEL);
        const hit = (ctrl && !ctrl.contains(v)) ? ctrl : (hasDirectText(el) ? el : null);
        if (hit) {
          const er = hit.getBoundingClientRect();
          if (er.width >= 8 && er.height >= 8 && er.width * er.height <= vArea * 0.24) {
            clear = false;
            break;
          }
        }
      }
      if (clear) return cy - 14;
    }
    return clamp(Math.round(h * 0.36) - 14, 12, Math.max(12, h - 44));
  }

  let lastPlayIcon = '';
  function render(now) {
    const on = siteActive();
    document.documentElement.classList.toggle('igvc-mirror', on && !!settings.mirror);
    if (!on) { ui.wrap.classList.remove('show'); expandedVideo = null; return; }
    if (needPick && !dragging) {
      needPick = false;
      if (!overPanel) {
        const v = videoAt(pointer.x, pointer.y);
        if (v) active = v;
      }
    }
    const v = active && active.isConnected ? active : null;
    const r = v && rectOf(v);
    const pointerOnVideo = !!r && inRect(r, pointer.x, pointer.y);
    const pointerIn = pointerOnVideo || (!!r && overPanel);
    const recent = now - lastMove < settings.autoHide * 1000;
    let show = !!r && (dragging || now < pokeUntil || (pointerIn && (recent || overPanel)));
    if (show && !dragging) {
      // Stay out of the way of popups/dialogs covering the video.
      const px = pointerOnVideo ? pointer.x : (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2;
      const py = pointerOnVideo ? pointer.y : (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2;
      if (isCovered(v, px, py)) show = false;
    }
    if (!settings.dotMode || (expandedVideo && expandedVideo !== v) || (!show && !overPanel)) {
      expandedVideo = null;
    }
    const collapsed = !!settings.dotMode && expandedVideo !== v;
    ui.wrap.classList.toggle('dot-mode', !!settings.dotMode);
    ui.wrap.classList.toggle('collapsed', collapsed);
    ui.wrap.classList.toggle('show', show);
    if (!r) return;

    // Clip to viewport so controls stay reachable on partially scrolled videos.
    const left = Math.max(r.left, 0), top = Math.max(r.top, 0);
    const right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    const w = Math.max(0, right - left), h = Math.max(0, bottom - top);
    const st = ui.wrap.style;
    st.left = `${left}px`; st.top = `${top}px`; st.width = `${w}px`; st.height = `${h}px`;
    const compact = w < 520;
    ui.wrap.classList.toggle('compact', compact);
    ui.wrap.classList.toggle('tiny', w < 380);

    if (settings.dotMode && show) {
      ui.dot.classList.toggle('open', !collapsed);
      const dotTitle = collapsed ? 'Open ReelCoach controls' : 'Collapse controls to dot';
      if (ui.dot.title !== dotTitle) {
        ui.dot.title = dotTitle;
        ui.dot.setAttribute('aria-label', dotTitle);
      }
      if (v !== dotFor || !dotMeasuredAt || now - dotMeasuredAt > 300) {
        dotFor = v;
        dotMeasuredAt = now;
        dotTop = dotOffsetTop(v, left, top, w, h);
      }
      ui.dot.style.top = `${dotTop}px`;
    }

    if (v !== dodgeFor || location.pathname !== dodgePath || (!show && !overPanel)) {
      dodge = /^\/stories(\/|$)/.test(location.pathname) ? 68 : 8;
      dodgeFor = v;
      dodgePath = location.pathname;
      dodgeMeasuredAt = 0;
    }
    if (!show || collapsed) {
      ui.bar.style.bottom = `${dodge}px`;
      return;
    }
    if (!dragging && (!dodgeMeasuredAt || now - dodgeMeasuredAt > 250)) {
      dodgeMeasuredAt = now;
      dodge = Math.max(dodge, bottomClearance(v, left, right, bottom, h, compact));
    }
    ui.bar.style.bottom = `${dodge}px`;

    const d = dur(v), t = intendedTime(v);
    const pct = (x) => `${d ? clamp(x / d, 0, 1) * 100 : 0}%`;
    ui.played.style.width = pct(t);
    ui.head.style.left = pct(t);
    let bufEnd = 0;
    try {
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= t + 0.5) bufEnd = Math.max(bufEnd, v.buffered.end(i));
      }
    } catch {}
    ui.buf.style.width = pct(bufEnd);
    ui.timeCur.textContent = fmt(t);
    ui.timeDur.textContent = ` / ${fmt(d, false)}`;

    const resuming = (dragging === 'seek' && dragWasPlaying) || (pendingSeeks.has(v) && pendingSeeks.get(v).resume);
    const playIcon = v.paused && !resuming ? 'play' : 'pause';
    if (playIcon !== lastPlayIcon) { ui.play.innerHTML = ICON[playIcon]; lastPlayIcon = playIcon; }
    ui.speed.textContent = `${+v.playbackRate.toFixed(2)}×`;

    const s = states.get(v);
    const hasPoints = !!s && (s.a != null || s.b != null);
    const loopOn = !!s && s.loop;
    ui.loop.classList.toggle('on', loopOn);
    ui.setA.classList.toggle('set', !!s && s.a != null);
    ui.setB.classList.toggle('set', !!s && s.b != null);
    ui.clr.classList.toggle('show', hasPoints || loopOn);
    const showRegion = hasPoints || loopOn;
    ui.region.classList.toggle('show', showRegion);
    ui.region.classList.toggle('off', showRegion && !loopOn);
    ui.mkA.classList.toggle('show', hasPoints);
    ui.mkB.classList.toggle('show', hasPoints);
    ui.mkA.classList.toggle('off', !loopOn);
    ui.mkB.classList.toggle('off', !loopOn);
    if (showRegion) {
      const A = loopA(v, s), B = loopB(v, s);
      ui.region.style.left = pct(A);
      ui.region.style.width = d ? `${clamp((B - A) / d, 0, 1) * 100}%` : '0';
      ui.mkA.style.left = pct(A);
      ui.mkB.style.left = pct(B);
    }
  }

  let frameCount = 0;
  function tick(now) {
    try {
      if ((++frameCount & 63) === 0) mount();
      if (siteActive()) {
        guardSeeks(now);
        guardPlaybackGaps(now);
        enforceLoops();
      } else if (looping.size) {
        for (const v of [...looping]) clearLoop(v, true); // switched off: leave videos alone
      }
      render(now);
    } catch (err) {
      console.debug('[IGVC]', err);
    }
    requestAnimationFrame(tick);
  }

  loadSettings();
  applySettings();
  requestAnimationFrame(tick);
})();
