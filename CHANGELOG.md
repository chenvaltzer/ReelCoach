# Changelog

## 1.5.2 — November 2026

- **Optional Dot mode (popup + player bar toggle, off by default)**: toggle **Dot mode** from either the extension menu or the new dot button in the control bar to keep videos clutter-free — hovering shows only a small side dot (clear of comments, volume, and action buttons), and clicking the dot expands the full player controls.
- **Fixed unbuffered timeline jumps & scrubbing**: jumping or dragging to an uncached timestamp on long Reels (including mid-reel buffer gaps and rapid multi-jumps) now routes seeks through Instagram's MediaSource buffer cleanup (`src/page-seek.js`) instead of snapping back or stalling playback.
- **Fixed stuck videos on start & restart**: videos with a leading PTS buffer gap at `0:00` now automatically nudge past the gap instead of freezing, progressive posts no longer stall when jumping near the end, and pressing Play at the end of posts with audio/video track duration mismatches cleanly rewinds to `0:00`.
- **Smart bottom clearance for comments, captions & Stories**: keeps the bottom-pinned corner-free pill (`bottom: 8px`, `left/right: 48px`) on clean videos while automatically lifting above bottom captions, `"Add a comment..."` inputs, and Story `"Reply..."` / reaction bars on Instagram Reels, Instagram Stories, Facebook Reels, and Facebook Stories — without triggering Story tap-to-advance handlers.
- **Automated full E2E & regression test suite**: added `tests/run-all.js` covering core controls, security, multi-platform routing, unbuffered playback edge cases, and bottom/Story UI clearance.

## 1.5.1 — November 2026

- **Bottom-pinned floating pill overlay**: the control bar stays pinned at the bottom of the video (`bottom: 8px`) with 48px corner clearance on both the left and right edges (`left: 48px; right: 48px`), keeping native corner buttons (such as Instagram's volume/mute button and tag button) completely uncovered without ever shifting the bar upward.
- Added official repository `homepage_url` in `manifest.json`.

## 1.4.0 — November 2026

Chrome Web Store preparation & full platform policy compliance.

- **Removed download feature**: All video download functionality, background download handlers, and MAIN-world script injections (`page.js`) have been completely removed.
- **Removed `downloads` permission**: Manifest permissions reduced to only `storage` (minimal privilege).
- **100% client-side & zero network requests**: The extension now purely controls in-page `<video>` playback (scrubbing, frame-stepping, A-B looping, speed adjustment, mirror mode).
- Cleaned up settings popup and updated privacy policy and security policy to reflect zero external network activity.

## 1.3.0 — November 2026

- On/off switch in the toolbar menu. While off, the toolbar icon shows "OFF" and ReelCoach leaves every video alone (no controls, shortcuts, loops or mirroring).
- Facebook: controls now appear only on reels and stories. Regular Facebook videos already have a timeline, and the bar was covering their mute button.
- Facebook stories: Facebook pauses a story whenever the mouse is over it. ReelCoach now keeps it playing while you use the controls, and still respects a pause you ask for (click, key or the play button).
- Practice controls now work on TikTok too: timeline, skip, frame stepping, A–B loop, speed and mirror.
- Pop-up detection now recognises dialogs and screen-pinned layers directly, so the controls work on letterboxed players like TikTok's and still hide under sign-in pop-ups.

## 1.2.0 — November 2026

- Practice controls now work on Facebook reels and videos too: timeline, skip, frame stepping, A–B loop, speed and mirror.
- The download button stays Instagram-only. It's hidden on Facebook, and the extension makes no network requests there.

## 1.1.0 — November 2026

Security hardening after a full source audit, and the public name.

- Renamed to **ReelCoach**, with a new icon.
- Download lookup moved into the extension's isolated world. The page can no longer choose the download URL or filename.
- Downloads are limited to `https` files on Instagram's video servers and saved as `Downloads/Instagram/<safe-name>.mp4`. The background worker re-checks every request.
- All controls ignore events synthesized by page scripts.
- Settings are type-checked and kept within safe ranges.
- The control bar fits on one row on narrow reels.
- Settings popup redesigned, with a one-time personal-use note.
- Added privacy policy, security policy and MIT license.

## 1.0.0 — November 2026

First version.

- Hover controls on Instagram videos: timeline with click and drag, skip back and forward, frame stepping, play and pause.
- A–B looper with draggable markers.
- Playback speed and mirror.
- One-click download.
- Keyboard shortcuts and a settings popup.
