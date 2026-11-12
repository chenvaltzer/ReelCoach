# ReelCoach — Engineering & Mandatory Testing Rules

## Mandatory Full-Suite Test Requirement (DO NOT SKIP)

**Every bug fix, UI adjustment, playback change, or manifest update MUST run the full automated E2E & regression test suite and pass 100% before committing, packaging, or releasing:**

```bash
node tests/run-all.js
```

### What `node tests/run-all.js` Verifies
1. **Static validation** — JS syntax check across `src/content.js`, `src/page-seek.js`, `src/background.js`, `popup.js`, and JSON validation of `manifest.json`.
2. **`tests/test-core-ig.js`** — Full Instagram controls E2E (overlay injection, hover/auto-hide, modal dialog hiding, timeline hover/click/drag, Play/Pause, skip/fine-skip, frame step, A–B loop + marker dragging, speed presets & wrap, mirror persistence across reload, input-box typing isolation, popup settings sync, Reels feed scrolling, `/p/` post pages, zero console errors).
3. **`tests/test-security.js`** — Security & privilege boundaries (`permissions: ["storage"]` only, DOM clobbering resilience, synthetic `MouseEvent` / `KeyboardEvent` rejection via `event.isTrusted`, non-finite `igvc:seek` payload rejection, popup input clamping, corrupt storage fallback).
4. **`tests/test-platforms-toggle.js`** — Toolbar on/off switch & `"OFF"` badge, Facebook Reels (`/reel/`) & Stories (`/stories/`) activation with `/` and `/watch` excluded, and TikTok feed controls.
5. **`tests/test-playback-edge-cases.js`** — Unbuffered timeline jumps on throttled networks (forward jump, mid-reel unbuffered gap jump via `src/page-seek.js` OzPlayer `SourceBuffer` cleanup, rapid multi-jump), progressive post seeking, end-of-video Play restart on A/V duration-mismatch posts, and leading PTS start-gap recovery.
6. **`tests/test-bottom-clearance.js`** — Bottom-pinned corner-free pill (`bottom: 8px`, `left/right: 48px`) on clean videos, automatic upward clearance above bottom comments, captions, and `"Reply..."` bars on Instagram Reels, Instagram Stories, Facebook Reels, and Facebook Stories, click isolation from Story tap-to-advance handlers, and zero native controls covered across Instagram, Facebook, and TikTok.

**When fixing a new bug:** add a regression check to the appropriate `tests/test-*.js` module first, then run `node tests/run-all.js` and confirm `0` failures.

## Packaging Rule

Release archives (`ReelCoach-vX.Y.Z.zip`) must contain **only** runtime extension files:
- `manifest.json`
- `popup.html`
- `popup.js`
- `icons/`
- `src/background.js`
- `src/content.js`
- `src/page-seek.js`

Never bundle `tests/`, `docs/`, `store-assets/`, `demo/`, `.git/`, or `.bat` files into the release zip.
