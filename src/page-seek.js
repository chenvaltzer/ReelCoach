// ReelCoach — MAIN-world seek helper.
// Instagram's OzPlayer installs an own-property `currentTime` setter on each <video> in the MAIN
// world that clears stale SourceBuffer ranges ahead of a seek so its MSE gap-skipper won't snap
// playback back to an old buffered range. Isolated-world content scripts bypass MAIN-world own
// property descriptors, so content.js dispatches a local event on the <video> to invoke it.
(() => {
  'use strict';
  const LOADED = Symbol.for('igvc.pageSeek.loaded');
  if (window[LOADED]) return;
  window[LOADED] = true;

  addEventListener('igvc:seek', (e) => {
    const v = e.target;
    const t = e.detail;
    if (v instanceof HTMLVideoElement && typeof t === 'number' && Number.isFinite(t)) {
      e.preventDefault();
      v.currentTime = t;
    }
  }, true);
})();
